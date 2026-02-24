"""Badge award service with duplicate prevention and notification."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import BadgeDefinition, BadgeStats, Notification, UserBadge, UserGamification
from tbg.gamification.xp_service import get_or_create_gamification, grant_xp

logger = logging.getLogger(__name__)


async def get_badge_by_slug(db: AsyncSession, slug: str) -> BadgeDefinition | None:
    """Fetch a badge definition by slug."""
    result = await db.execute(
        select(BadgeDefinition).where(BadgeDefinition.slug == slug)
    )
    return result.scalar_one_or_none()


async def has_badge(db: AsyncSession, user_id: int, badge_id: int) -> bool:
    """Check if user already has a specific badge."""
    result = await db.execute(
        select(UserBadge).where(
            UserBadge.user_id == user_id,
            UserBadge.badge_id == badge_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def award_badge(
    db: AsyncSession,
    redis: object,
    user_id: int,
    badge_slug: str,
    event_id: str = "",
    metadata: dict | None = None,
) -> bool:
    """Award a badge to a user.

    Returns True if awarded, False if already earned or badge not found.
    Handles:
    1. Insert into user_badges (with UNIQUE constraint)
    2. Grant badge XP (idempotent via idempotency_key)
    3. Update user_gamification.badges_earned
    4. Update badge_stats
    5. Emit notification
    """
    badge = await get_badge_by_slug(db, badge_slug)
    if badge is None:
        logger.warning("Badge not found: %s", badge_slug)
        return False

    # Check if already earned
    if await has_badge(db, user_id, badge.id):
        return False

    now = datetime.now(timezone.utc)

    # Insert user_badge
    user_badge = UserBadge(
        user_id=user_id,
        badge_id=badge.id,
        earned_at=now,
        badge_metadata=metadata or {},
    )
    db.add(user_badge)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return False  # Race condition: badge already awarded

    # Grant badge XP
    idempotency_key = f"badge:{badge_slug}:{user_id}"
    await grant_xp(
        db=db,
        redis=redis,
        user_id=user_id,
        amount=badge.xp_reward,
        source="badge",
        source_id=badge_slug,
        description=f'Earned badge: "{badge.name}"',
        idempotency_key=idempotency_key,
    )

    # Update denormalized badge count
    gam = await get_or_create_gamification(db, user_id)
    gam.badges_earned += 1
    gam.updated_at = now

    # Update badge_stats
    await db.execute(
        text("""
            UPDATE badge_stats
            SET total_earned = total_earned + 1,
                last_earned_at = :now,
                updated_at = :now
            WHERE badge_id = :badge_id
        """),
        {"badge_id": badge.id, "now": now},
    )

    # Emit notification
    await _emit_badge_earned(db, redis, user_id, badge, metadata or {})

    return True


async def _emit_badge_earned(
    db: AsyncSession,
    redis: object,
    user_id: int,
    badge: BadgeDefinition,
    metadata: dict,
) -> None:
    """Emit badge-earned notification via DB + WebSocket."""
    now = datetime.now(timezone.utc)

    notification = Notification(
        user_id=user_id,
        type="gamification",
        subtype="badge_earned",
        title=f'Badge Earned: "{badge.name}"',
        description=f"+{badge.xp_reward} XP \u2014 {badge.description}",
        action_url="/profile/badges",
        action_label="View Badge",
        created_at=now,
    )
    db.add(notification)

    # Push via WebSocket (Redis pub/sub)
    if redis is not None:
        try:
            await redis.publish(  # type: ignore[union-attr]
                "pubsub:badge_earned",
                json.dumps({
                    "user_id": user_id,
                    "badge_slug": badge.slug,
                    "badge_name": badge.name,
                    "rarity": badge.rarity,
                    "xp_reward": badge.xp_reward,
                }),
            )
        except Exception:
            logger.warning("Failed to publish badge_earned notification", exc_info=True)
