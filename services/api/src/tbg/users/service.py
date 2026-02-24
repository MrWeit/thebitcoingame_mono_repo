"""User management business logic."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import select

from tbg.auth.address_validation import get_address_type, validate_btc_address
from tbg.config import get_settings
from tbg.db.models import User, UserSettings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


async def update_profile(
    db: AsyncSession,
    user: User,
    display_name: str | None = None,
    avatar_url: str | None = None,
    bio: str | None = None,
    country_code: str | None = None,
) -> User:
    """
    Update user profile fields.

    Raises:
        ValueError: If display name is already taken (case-insensitive).
    """
    if display_name is not None:
        normalized = display_name.lower()
        # Check uniqueness (exclude self)
        result = await db.execute(
            select(User)
            .where(User.display_name_normalized == normalized)
            .where(User.id != user.id)
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            msg = "Display name already taken"
            raise ValueError(msg)
        user.display_name = display_name
        user.display_name_normalized = normalized

    if avatar_url is not None:
        user.avatar_url = avatar_url
    if bio is not None:
        user.bio = bio
    if country_code is not None:
        user.country_code = country_code

    await db.flush()
    return user


async def update_wallet(
    db: AsyncSession,
    user: User,
    new_address: str,
) -> tuple[str, str]:
    """
    Update the user's BTC wallet address.

    Returns:
        Tuple of (new_address, previous_address).

    Raises:
        ValueError: If address is invalid, same as current, or already in use.
    """
    settings = get_settings()
    network = "mainnet" if settings.btc_network == "mainnet" else "testnet"

    try:
        validate_btc_address(new_address, network=network)
    except ValueError as e:
        msg = f"Invalid BTC address: {e}"
        raise ValueError(msg) from e

    if new_address == user.btc_address:
        msg = "New address is the same as the current address"
        raise ValueError(msg)

    previous = user.btc_address
    user.btc_address = new_address
    await db.flush()

    logger.info("wallet_updated", user_id=user.id, previous=previous, new=new_address)
    return new_address, previous


async def get_user_settings(db: AsyncSession, user_id: int) -> UserSettings:
    """Get user settings, creating defaults if they don't exist."""
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = UserSettings(
            user_id=user_id,
            notifications={},
            privacy={},
            mining={},
            sound={},
            updated_at=datetime.now(timezone.utc),
        )
        db.add(settings)
        await db.flush()

    return settings


async def update_user_settings(
    db: AsyncSession,
    user_id: int,
    notifications: dict[str, Any] | None = None,
    privacy: dict[str, Any] | None = None,
    mining: dict[str, Any] | None = None,
    sound: dict[str, Any] | None = None,
) -> UserSettings:
    """
    Deep-merge update user settings.

    Only the provided keys are updated; others remain unchanged.
    """
    settings = await get_user_settings(db, user_id)

    if notifications is not None:
        merged = dict(settings.notifications or {})
        merged.update(notifications)
        settings.notifications = merged

    if privacy is not None:
        merged = dict(settings.privacy or {})
        merged.update(privacy)
        settings.privacy = merged

    if mining is not None:
        merged = dict(settings.mining or {})
        merged.update(mining)
        settings.mining = merged

    if sound is not None:
        merged = dict(settings.sound or {})
        merged.update(sound)
        settings.sound = merged

    settings.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return settings


async def get_public_profile(
    db: AsyncSession,
    btc_address: str,
) -> User | None:
    """Get a user's public profile by BTC address."""
    result = await db.execute(select(User).where(User.btc_address == btc_address))
    return result.scalar_one_or_none()
