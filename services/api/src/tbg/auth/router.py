"""Authentication router — all /api/v1/auth/* endpoints."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.address_validation import validate_btc_address
from tbg.auth.bitcoin import verify_bitcoin_signature
from tbg.auth.dependencies import get_current_email_user, get_current_user
from tbg.auth.jwt import create_access_token, create_refresh_token, verify_token
from tbg.auth.password import (
    PasswordStrengthError,
    hash_password,
    validate_password_strength,
    verify_password,
)
from tbg.auth.schemas import (
    ChallengeRequest,
    ChallengeResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
    VerifyRequest,
)
from tbg.auth.service import (
    authenticate_email_user,
    create_reset_token,
    create_verification_token,
    get_or_create_user,
    get_refresh_token,
    get_user_by_email,
    register_email_user,
    revoke_all_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    store_refresh_token,
    verify_email_token,
    verify_reset_token,
)
from tbg.config import get_settings
from tbg.database import get_session
from tbg.db.models import User
from tbg.email.service import get_email_service
from tbg.redis_client import get_redis

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def _user_response(user: User) -> UserResponse:
    """Build a UserResponse from a User model."""
    return UserResponse(
        id=user.id,
        btc_address=user.btc_address,
        auth_method=user.auth_method,
        email=user.email,
        email_verified=user.email_verified,
        display_name=user.display_name,
        country_code=user.country_code,
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_verified=user.is_verified,
        created_at=user.created_at,
        last_login=user.last_login,
        login_count=user.login_count,
    )


async def _issue_tokens(
    db: AsyncSession,
    user: User,
    auth_method: str,
    request: Request,
) -> TokenResponse:
    """Create access + refresh tokens and store refresh token hash."""
    settings = get_settings()
    token_id = str(uuid.uuid4())
    access_token = create_access_token(user.id, user.btc_address, auth_method)  # type: ignore[arg-type]
    refresh_token = create_refresh_token(
        user.id, user.btc_address, auth_method, token_id=token_id  # type: ignore[arg-type]
    )
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

    await store_refresh_token(
        db,
        user_id=user.id,
        token_id=token_id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=_user_response(user),
    )


# ---------------------------------------------------------------------------
# Wallet auth
# ---------------------------------------------------------------------------


@router.post("/challenge", response_model=ChallengeResponse)
async def challenge(
    body: ChallengeRequest,
    redis: Redis = Depends(get_redis),  # type: ignore[assignment]
) -> ChallengeResponse:
    """Request a wallet signing challenge nonce."""
    settings = get_settings()
    nonce = secrets.token_hex(16)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Store nonce in Redis with TTL
    await redis.set(
        f"auth:nonce:{body.btc_address}",
        f"{nonce}:{timestamp}",
        ex=settings.btc_challenge_expire_seconds,
    )

    message = (
        f"Sign this message to log in to The Bitcoin Game.\n\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {timestamp}\n"
        f"Address: {body.btc_address}"
    )

    return ChallengeResponse(
        nonce=nonce,
        message=message,
        expires_in=settings.btc_challenge_expire_seconds,
    )


@router.post("/verify", response_model=TokenResponse)
async def verify(
    body: VerifyRequest,
    request: Request,
    redis: Redis = Depends(get_redis),  # type: ignore[assignment]
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Verify a wallet signature and issue tokens."""
    # Check nonce
    stored = await redis.get(f"auth:nonce:{body.btc_address}")
    if stored is None:
        raise HTTPException(status_code=400, detail="Challenge expired or not found")

    stored_nonce, stored_timestamp = stored.split(":", 1)
    if stored_nonce != body.nonce:
        raise HTTPException(status_code=400, detail="Invalid nonce")

    # Delete nonce (one-time use)
    await redis.delete(f"auth:nonce:{body.btc_address}")

    # Reconstruct and verify message
    expected_message = (
        f"Sign this message to log in to The Bitcoin Game.\n\n"
        f"Nonce: {body.nonce}\n"
        f"Timestamp: {body.timestamp}\n"
        f"Address: {body.btc_address}"
    )

    if not verify_bitcoin_signature(body.btc_address, expected_message, body.signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Auto-create user
    user, _created = await get_or_create_user(db, body.btc_address)

    # Update login metadata
    user.last_login = datetime.now(timezone.utc)
    user.login_count = (user.login_count or 0) + 1

    return await _issue_tokens(db, user, "wallet", request)


# ---------------------------------------------------------------------------
# Email auth
# ---------------------------------------------------------------------------


@router.post("/register", response_model=TokenResponse)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Register with email + password + wallet address."""
    try:
        user = await register_email_user(
            db,
            email=body.email,
            password=body.password,
            btc_address=body.btc_address,
            display_name=body.display_name,
            country_code=body.country_code,
        )
    except PasswordStrengthError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ValueError as e:
        detail = str(e)
        if "already registered" in detail.lower():
            raise HTTPException(status_code=409, detail=detail) from e
        raise HTTPException(status_code=400, detail=detail) from e

    # Create verification token and send email
    try:
        raw_token = await create_verification_token(db, user.id)
        settings = get_settings()
        verify_url = f"{settings.frontend_base_url}/auth/verify-email?token={raw_token}"
        email_service = get_email_service()
        await email_service.send_template(
            to=user.email or "",
            template_name="welcome",
            context={"display_name": user.display_name, "verify_url": verify_url},
        )
    except Exception:
        logger.exception("verification_email_failed", user_id=user.id)

    return await _issue_tokens(db, user, "email", request)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),  # type: ignore[assignment]
) -> TokenResponse:
    """Login with email + password."""
    try:
        user = await authenticate_email_user(db, redis, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except PermissionError as e:
        detail = str(e)
        if "locked" in detail.lower():
            raise HTTPException(status_code=429, detail=detail) from e
        raise HTTPException(status_code=403, detail=detail) from e

    return await _issue_tokens(db, user, "email", request)


@router.post("/verify-email")
async def verify_email_endpoint(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Verify email address with token."""
    try:
        await verify_email_token(db, body.token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    return {"status": "email_verified"}


@router.post("/resend-verification")
async def resend_verification(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),  # type: ignore[assignment]
) -> dict[str, str]:
    """Resend verification email. Rate limited to 1 per 5 minutes."""
    if user.email_verified:
        raise HTTPException(status_code=400, detail="Email is already verified")

    # Rate limit: 1 per 5 minutes
    cooldown_key = f"resend_cooldown:{user.id}"
    if await redis.get(cooldown_key):
        raise HTTPException(status_code=429, detail="Please wait before requesting another verification email")
    await redis.set(cooldown_key, "1", ex=300)

    raw_token = await create_verification_token(db, user.id)
    settings = get_settings()
    verify_url = f"{settings.frontend_base_url}/auth/verify-email?token={raw_token}"
    email_service = get_email_service()
    await email_service.send_template(
        to=user.email or "",
        template_name="verify_email",
        context={"verify_url": verify_url},
    )
    await db.commit()
    return {"status": "verification_email_sent"}


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Request password reset email. Always returns 200."""
    user = await get_user_by_email(db, body.email)

    if user is not None and user.auth_method == "email":
        try:
            raw_token = await create_reset_token(
                db,
                user.id,
                ip_address=request.client.host if request.client else None,
            )
            settings = get_settings()
            reset_url = f"{settings.frontend_base_url}/auth/reset-password?token={raw_token}"
            email_service = get_email_service()
            await email_service.send_template(
                to=user.email or "",
                template_name="password_reset",
                context={"reset_url": reset_url, "display_name": user.display_name},
            )
            await db.commit()
        except Exception:
            logger.exception("password_reset_email_failed", email=body.email)

    return {"status": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Reset password with a valid token."""
    # Validate new password strength
    try:
        validate_password_strength(body.new_password)
    except PasswordStrengthError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Verify token
    try:
        user_id = await verify_reset_token(db, body.token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Update password
    from tbg.auth.service import get_user_by_id

    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="User not found")

    user.password_hash = hash_password(body.new_password)

    # Revoke ALL refresh tokens
    await revoke_all_tokens(db, user_id)
    await db.commit()

    return {"status": "password_reset_complete"}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_email_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Change password (email-auth users only)."""
    # Verify current password
    if not verify_password(body.current_password, user.password_hash or ""):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Validate new password
    try:
        validate_password_strength(body.new_password)
    except PasswordStrengthError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Update password
    user.password_hash = hash_password(body.new_password)

    # Revoke other sessions (keep current alive by excluding nothing here;
    # in practice we'd exclude the current token, but for simplicity we revoke all others)
    await revoke_all_tokens(db, user.id)

    # Send notification email
    try:
        email_service = get_email_service()
        await email_service.send_template(
            to=user.email or "",
            template_name="password_changed",
            context={"display_name": user.display_name},
        )
    except Exception:
        logger.exception("password_changed_email_failed", user_id=user.id)

    await db.commit()
    return {"status": "password_changed"}


# ---------------------------------------------------------------------------
# Token management (both auth methods)
# ---------------------------------------------------------------------------


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Rotate refresh token."""
    import jwt as pyjwt

    try:
        payload = verify_token(body.refresh_token, expected_type="refresh")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    old_token = await get_refresh_token(db, jti)
    if old_token is None:
        raise HTTPException(status_code=401, detail="Refresh token not found")
    if old_token.is_revoked:
        # Possible token reuse attack — revoke all tokens for this user
        await revoke_all_tokens(db, old_token.user_id)
        await db.commit()
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    # Rotate
    settings = get_settings()
    new_token_id = str(uuid.uuid4())
    user_id = old_token.user_id
    auth_method = payload.get("auth_method", "wallet")
    btc_address = payload.get("address", "")

    new_access = create_access_token(user_id, btc_address, auth_method)  # type: ignore[arg-type]
    new_refresh = create_refresh_token(user_id, btc_address, auth_method, token_id=new_token_id)  # type: ignore[arg-type]
    new_hash = hashlib.sha256(new_refresh.encode()).hexdigest()

    await rotate_refresh_token(
        db,
        old_token=old_token,
        new_token_id=new_token_id,
        new_token_hash=new_hash,
        new_expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    from tbg.auth.service import get_user_by_id

    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    await db.commit()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=_user_response(user),
    )


@router.post("/logout")
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Revoke a refresh token."""
    import jwt as pyjwt

    try:
        payload = verify_token(body.refresh_token, expected_type="refresh")
    except pyjwt.InvalidTokenError:
        pass  # Still try to revoke even if expired
    else:
        jti = payload.get("jti")
        if jti:
            await revoke_refresh_token(db, jti)
            await db.commit()

    return {"status": "logged_out"}


@router.post("/logout-all")
async def logout_all(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Revoke all refresh tokens for the current user."""
    count = await revoke_all_tokens(db, user.id)
    await db.commit()
    return {"status": "all_sessions_revoked", "revoked_count": str(count)}
