"""
Authentication business logic.

Handles user creation, token management, account lockout, and password flows.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select, update

from tbg.auth.address_validation import validate_btc_address
from tbg.auth.password import (
    PasswordStrengthError,
    check_needs_rehash,
    hash_password,
    validate_password_strength,
    verify_password,
)
from tbg.config import get_settings
from tbg.db.models import (
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken,
    User,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# User queries
# ---------------------------------------------------------------------------


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """Fetch a user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Fetch a user by email (case-insensitive)."""
    result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_address(db: AsyncSession, btc_address: str) -> User | None:
    """Fetch a user by BTC address."""
    result = await db.execute(select(User).where(User.btc_address == btc_address))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Wallet auth: auto-create user
# ---------------------------------------------------------------------------


async def get_or_create_user(db: AsyncSession, btc_address: str) -> tuple[User, bool]:
    """
    Get existing user or create a new one for wallet auth.

    Returns:
        Tuple of (user, created) where created is True if a new user was made.
    """
    user = await get_user_by_address(db, btc_address)
    if user is not None:
        return user, False

    user = User(
        btc_address=btc_address,
        auth_method="wallet",
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        login_count=1,
    )
    db.add(user)
    await db.flush()
    logger.info("user_created", user_id=user.id, btc_address=btc_address, method="wallet")
    return user, True


# ---------------------------------------------------------------------------
# Email auth: registration
# ---------------------------------------------------------------------------


async def register_email_user(
    db: AsyncSession,
    email: str,
    password: str,
    btc_address: str,
    display_name: str | None = None,
    country_code: str | None = None,
) -> User:
    """
    Register a new user with email + password.

    Raises:
        ValueError: If email already exists, password is weak, or address is invalid.
    """
    # Validate password strength
    validate_password_strength(password)

    # Validate BTC address
    settings = get_settings()
    network = "mainnet" if settings.btc_network == "mainnet" else "testnet"
    try:
        validate_btc_address(btc_address, network=network)
    except ValueError as e:
        msg = f"Invalid BTC address: {e}"
        raise ValueError(msg) from e

    # Check email uniqueness
    existing = await get_user_by_email(db, email)
    if existing is not None:
        msg = "Email already registered"
        raise ValueError(msg)

    # Hash password
    password_hash = hash_password(password)

    # Normalize display name
    display_name_normalized = display_name.lower() if display_name else None

    user = User(
        email=email.lower().strip(),
        password_hash=password_hash,
        btc_address=btc_address,
        auth_method="email",
        display_name=display_name,
        display_name_normalized=display_name_normalized,
        country_code=country_code,
        email_verified=False,
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        login_count=1,
    )
    db.add(user)
    await db.flush()
    logger.info("user_created", user_id=user.id, email=email, method="email")
    return user


# ---------------------------------------------------------------------------
# Email auth: login
# ---------------------------------------------------------------------------


async def authenticate_email_user(
    db: AsyncSession,
    redis: Redis,
    email: str,
    password: str,
) -> User:
    """
    Authenticate a user with email + password.

    Raises:
        ValueError: If credentials are invalid.
        PermissionError: If account is locked or banned.
    """
    user = await get_user_by_email(db, email)
    if user is None:
        msg = "Invalid email or password"
        raise ValueError(msg)

    # Check lockout
    if await check_account_lockout(redis, user.id):
        msg = "Account temporarily locked. Try again later."
        raise PermissionError(msg)

    # Check ban
    if user.is_banned:
        msg = "Account is banned"
        raise PermissionError(msg)

    # Verify password
    if not verify_password(password, user.password_hash or ""):
        await increment_failed_login(redis, user.id)
        msg = "Invalid email or password"
        raise ValueError(msg)

    # Success — clear lockout counter
    await clear_failed_login(redis, user.id)

    # Update login metadata
    user.last_login = datetime.now(timezone.utc)
    user.login_count = (user.login_count or 0) + 1
    await db.flush()

    # Check if password needs rehash
    if user.password_hash and check_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        await db.flush()
        logger.info("password_rehashed", user_id=user.id)

    return user


# ---------------------------------------------------------------------------
# Account lockout
# ---------------------------------------------------------------------------


async def check_account_lockout(redis: Redis, user_id: int) -> bool:
    """Check if the account is locked due to too many failed login attempts."""
    settings = get_settings()
    count_str = await redis.get(f"login_attempts:{user_id}")
    if count_str is None:
        return False
    return int(count_str) >= settings.account_lockout_threshold


async def increment_failed_login(redis: Redis, user_id: int) -> int:
    """Increment failed login counter. Returns the new count."""
    settings = get_settings()
    key = f"login_attempts:{user_id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, settings.account_lockout_duration_minutes * 60)
    return int(count)


async def clear_failed_login(redis: Redis, user_id: int) -> None:
    """Clear the failed login counter after a successful login."""
    await redis.delete(f"login_attempts:{user_id}")


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------


async def store_refresh_token(
    db: AsyncSession,
    user_id: int,
    token_id: str,
    token_hash: str,
    expires_at: datetime,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> RefreshToken:
    """Store a refresh token hash in the database."""
    token = RefreshToken(
        id=token_id,
        user_id=user_id,
        token_hash=token_hash,
        issued_at=datetime.now(timezone.utc),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(token)
    await db.flush()
    return token


async def get_refresh_token(db: AsyncSession, token_id: str) -> RefreshToken | None:
    """Look up a refresh token by its JTI."""
    result = await db.execute(select(RefreshToken).where(RefreshToken.id == token_id))
    return result.scalar_one_or_none()


async def rotate_refresh_token(
    db: AsyncSession,
    old_token: RefreshToken,
    new_token_id: str,
    new_token_hash: str,
    new_expires_at: datetime,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> RefreshToken:
    """Revoke old token and create a new one (rotation)."""
    # Revoke old token
    old_token.is_revoked = True
    old_token.revoked_at = datetime.now(timezone.utc)
    old_token.replaced_by = new_token_id

    # Create new token
    new_token = await store_refresh_token(
        db,
        user_id=old_token.user_id,
        token_id=new_token_id,
        token_hash=new_token_hash,
        expires_at=new_expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.flush()
    return new_token


async def revoke_refresh_token(db: AsyncSession, token_id: str) -> bool:
    """Revoke a specific refresh token. Returns True if found."""
    token = await get_refresh_token(db, token_id)
    if token is None:
        return False
    token.is_revoked = True
    token.revoked_at = datetime.now(timezone.utc)
    await db.flush()
    return True


async def revoke_all_tokens(
    db: AsyncSession,
    user_id: int,
    exclude_token_id: str | None = None,
) -> int:
    """Revoke all refresh tokens for a user. Returns count revoked."""
    now = datetime.now(timezone.utc)
    stmt = (
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .where(RefreshToken.is_revoked == False)  # noqa: E712
    )
    if exclude_token_id:
        stmt = stmt.where(RefreshToken.id != exclude_token_id)
    stmt = stmt.values(is_revoked=True, revoked_at=now)
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Email verification tokens
# ---------------------------------------------------------------------------


async def create_verification_token(db: AsyncSession, user_id: int) -> str:
    """
    Create an email verification token.

    Returns the raw token to send to the user.
    The hash is stored in the database.
    """
    settings = get_settings()
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    # Invalidate any existing unused tokens for this user
    await db.execute(
        update(EmailVerificationToken)
        .where(EmailVerificationToken.user_id == user_id)
        .where(EmailVerificationToken.used_at == None)  # noqa: E711
        .values(used_at=datetime.now(timezone.utc))
    )

    token = EmailVerificationToken(
        user_id=user_id,
        token_hash=token_hash,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.email_verification_token_ttl_hours),
    )
    db.add(token)
    await db.flush()
    return raw_token


async def verify_email_token(db: AsyncSession, raw_token: str) -> int:
    """
    Verify an email verification token.

    Returns the user_id if valid.

    Raises:
        ValueError: If token is invalid, expired, or already used.
    """
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    result = await db.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash)
    )
    token = result.scalar_one_or_none()

    if token is None:
        msg = "Invalid or expired verification token"
        raise ValueError(msg)
    if token.used_at is not None:
        msg = "Token has already been used"
        raise ValueError(msg)
    if token.expires_at < datetime.now(timezone.utc):
        msg = "Verification token has expired"
        raise ValueError(msg)

    # Mark as used
    token.used_at = datetime.now(timezone.utc)

    # Set email_verified on user
    await db.execute(
        update(User).where(User.id == token.user_id).values(email_verified=True)
    )
    await db.flush()
    return token.user_id


# ---------------------------------------------------------------------------
# Password reset tokens
# ---------------------------------------------------------------------------


async def create_reset_token(
    db: AsyncSession,
    user_id: int,
    ip_address: str | None = None,
) -> str:
    """
    Create a password reset token.

    Returns the raw token to send to the user.
    """
    settings = get_settings()
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    # Invalidate existing unused tokens
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user_id)
        .where(PasswordResetToken.used_at == None)  # noqa: E711
        .values(used_at=datetime.now(timezone.utc))
    )

    token = PasswordResetToken(
        user_id=user_id,
        token_hash=token_hash,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_ttl_minutes),
        ip_address=ip_address,
    )
    db.add(token)
    await db.flush()
    return raw_token


async def verify_reset_token(db: AsyncSession, raw_token: str) -> int:
    """
    Verify a password reset token.

    Returns the user_id if valid.

    Raises:
        ValueError: If token is invalid, expired, or already used.
    """
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    token = result.scalar_one_or_none()

    if token is None:
        msg = "Invalid or expired reset token"
        raise ValueError(msg)
    if token.used_at is not None:
        msg = "Token has already been used"
        raise ValueError(msg)
    if token.expires_at < datetime.now(timezone.utc):
        msg = "Reset token has expired"
        raise ValueError(msg)

    # Mark as used
    token.used_at = datetime.now(timezone.utc)
    await db.flush()
    return token.user_id
