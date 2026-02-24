"""Public miner profile with privacy enforcement.

When publicProfile is disabled, endpoints return None → HTTP 404.
This prevents user enumeration attacks.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import User, UserBadge, UserGamification, UserSettings


async def get_public_profile(
    db: AsyncSession,
    btc_address: str,
) -> dict | None:
    """Get a user's public profile.

    Returns None (→ 404) if user not found OR publicProfile is disabled.
    """
    result = await db.execute(select(User).where(User.btc_address == btc_address))
    user = result.scalar_one_or_none()
    if not user:
        return None

    # Check privacy settings
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = settings_result.scalar_one_or_none()
    privacy = (settings.privacy if settings else None) or {}

    if not privacy.get("publicProfile", False):
        return None  # Return None → endpoint returns 404

    # Load gamification data
    gam_result = await db.execute(
        select(UserGamification).where(UserGamification.user_id == user.id)
    )
    gam = gam_result.scalar_one_or_none()

    profile = {
        "display_name": user.display_name or f"Miner-{user.btc_address[:8]}",
        "btc_address": user.btc_address,
        "level": gam.level if gam else 1,
        "level_title": gam.level_title if gam else "Nocoiner",
        "badges_earned": gam.badges_earned if gam else 0,
        "member_since": user.created_at.isoformat() if user.created_at else "",
    }

    # Conditional fields based on privacy settings
    if privacy.get("showCountryFlag", False):
        profile["country_code"] = user.country_code
    else:
        profile["country_code"] = None

    return profile


async def get_public_stats(
    db: AsyncSession,
    btc_address: str,
) -> dict | None:
    """Get a user's public mining stats.

    Returns None (→ 404) if user not found OR publicProfile is disabled.
    """
    result = await db.execute(select(User).where(User.btc_address == btc_address))
    user = result.scalar_one_or_none()
    if not user:
        return None

    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = settings_result.scalar_one_or_none()
    privacy = (settings.privacy if settings else None) or {}

    if not privacy.get("publicProfile", False):
        return None

    gam_result = await db.execute(
        select(UserGamification).where(UserGamification.user_id == user.id)
    )
    gam = gam_result.scalar_one_or_none()

    if not gam:
        return {
            "best_difficulty": 0,
            "total_shares": 0,
            "blocks_found": 0,
            "current_streak": 0,
            "badges": [],
        }

    # Get badge slugs
    badges_result = await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == user.id)
    )
    badge_slugs = [ub.badge.slug for ub in badges_result.scalars()]

    return {
        "best_difficulty": gam.best_difficulty,
        "total_shares": gam.total_shares,
        "blocks_found": gam.blocks_found,
        "current_streak": gam.current_streak,
        "badges": badge_slugs,
    }
