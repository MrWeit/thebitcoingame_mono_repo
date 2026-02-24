"""User management router — all /api/v1/users/* endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.api_keys import generate_api_key
from tbg.auth.address_validation import get_address_type
from tbg.auth.dependencies import get_current_user
from tbg.auth.schemas import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyResponse,
    ProfileUpdateRequest,
    PublicUserResponse,
    SettingsResponse,
    SettingsUpdateRequest,
    UserResponse,
    WalletUpdateRequest,
    WalletUpdateResponse,
)
from tbg.database import get_session
from tbg.db.models import ApiKey, User
from tbg.users.service import (
    get_public_profile,
    get_user_settings,
    update_profile,
    update_user_settings,
    update_wallet,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


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


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse)
async def get_profile(
    user: User = Depends(get_current_user),
) -> UserResponse:
    """Get own full profile."""
    return _user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    body: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> UserResponse:
    """Update profile (display_name, avatar_url, bio, country_code)."""
    try:
        user = await update_profile(
            db,
            user,
            display_name=body.display_name,
            avatar_url=body.avatar_url,
            bio=body.bio,
            country_code=body.country_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    return _user_response(user)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@router.get("/me/settings", response_model=SettingsResponse)
async def get_settings_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SettingsResponse:
    """Get user settings."""
    settings = await get_user_settings(db, user.id)
    return SettingsResponse(
        notifications=settings.notifications or {},
        privacy=settings.privacy or {},
        mining=settings.mining or {},
        sound=settings.sound or {},
    )


@router.patch("/me/settings", response_model=SettingsResponse)
async def update_settings_endpoint(
    body: SettingsUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> SettingsResponse:
    """Deep-merge update settings."""
    settings = await update_user_settings(
        db,
        user.id,
        notifications=body.notifications,
        privacy=body.privacy,
        mining=body.mining,
        sound=body.sound,
    )
    await db.commit()
    return SettingsResponse(
        notifications=settings.notifications or {},
        privacy=settings.privacy or {},
        mining=settings.mining or {},
        sound=settings.sound or {},
    )


# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------


@router.patch("/me/wallet", response_model=WalletUpdateResponse)
async def update_wallet_endpoint(
    body: WalletUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> WalletUpdateResponse:
    """Update BTC wallet address."""
    try:
        new_address, previous_address = await update_wallet(db, user, body.btc_address)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await db.commit()

    return WalletUpdateResponse(
        btc_address=new_address,
        previous_address=previous_address,
        address_type=get_address_type(new_address),
        warning="Mining workers using the old address will need to reconnect.",
    )


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------


@router.post("/me/api-keys", response_model=ApiKeyCreateResponse)
async def create_api_key(
    body: ApiKeyCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> ApiKeyCreateResponse:
    """Create a new API key. Returns full key ONCE."""
    full_key, prefix, key_hash = generate_api_key()
    now = datetime.now(timezone.utc)

    api_key = ApiKey(
        id=str(uuid.uuid4()),
        user_id=user.id,
        key_prefix=prefix,
        key_hash=key_hash,
        name=body.name,
        permissions=body.permissions,
        created_at=now,
    )
    db.add(api_key)
    await db.commit()

    return ApiKeyCreateResponse(
        id=api_key.id,
        key=full_key,
        prefix=prefix,
        name=body.name,
        permissions=body.permissions,
        created_at=now,
    )


@router.get("/me/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ApiKeyResponse]:
    """List API keys (prefix only, never full key)."""
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id)
        .where(ApiKey.is_revoked == False)  # noqa: E712
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [
        ApiKeyResponse(
            id=k.id,
            prefix=k.key_prefix,
            name=k.name,
            permissions=k.permissions,
            last_used_at=k.last_used_at,
            created_at=k.created_at,
            is_revoked=k.is_revoked,
        )
        for k in keys
    ]


@router.delete("/me/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Revoke an API key."""
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.id == key_id)
        .where(ApiKey.user_id == user.id)
    )
    key = result.scalar_one_or_none()
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")

    key.is_revoked = True
    key.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "api_key_revoked"}


# ---------------------------------------------------------------------------
# Public profile
# ---------------------------------------------------------------------------


@router.get("/{btc_address}", response_model=PublicUserResponse)
async def get_public_profile_endpoint(
    btc_address: str,
    db: AsyncSession = Depends(get_session),
) -> PublicUserResponse:
    """Get public profile by BTC address."""
    user = await get_public_profile(db, btc_address)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return PublicUserResponse(
        btc_address=user.btc_address,
        display_name=user.display_name,
        country_code=user.country_code,
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_verified=user.is_verified,
        created_at=user.created_at,
    )
