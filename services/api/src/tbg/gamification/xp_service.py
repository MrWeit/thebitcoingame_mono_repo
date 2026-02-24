"""XP grant service with idempotency and level-up detection."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Notification, UserGamification, XPLedger
from tbg.gamification.level_thresholds import compute_level

logger = logging.getLogger(__name__)


async def get_or_create_gamification(db: AsyncSession, user_id: int) -> UserGamification:
    """Get or create the denormalized gamification row for a user."""
    result = await db.execute(
        select(UserGamification).where(UserGamification.user_id == user_id)
    )
    gam = result.scalar_one_or_none()
    if gam is None:
        gam = UserGamification(
            user_id=user_id,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(gam)
        await db.flush()
    return gam


async def grant_xp(
    db: AsyncSession,
    redis: object,
    user_id: int,
    amount: int,
    source: str,
    source_id: str,
    description: str,
    idempotency_key: str,
) -> bool:
    """Grant XP to a user. Returns True if granted, False if duplicate.

    After granting:
    1. Insert into xp_ledger
    2. Update user_gamification.total_xp
    3. Recompute level from total_xp
    4. If level changed, emit level_up notification
    """
    # Check idempotency
    existing = await db.execute(
        select(XPLedger).where(XPLedger.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        return False

    now = datetime.now(timezone.utc)

    # Insert ledger entry
    entry = XPLedger(
        user_id=user_id,
        amount=amount,
        source=source,
        source_id=source_id,
        description=description,
        idempotency_key=idempotency_key,
        created_at=now,
    )
    db.add(entry)

    # Update denormalized total
    gam = await get_or_create_gamification(db, user_id)
    old_level = gam.level
    gam.total_xp += amount

    # Recompute level
    level_info = compute_level(gam.total_xp)
    gam.level = level_info["level"]
    gam.level_title = level_info["title"]
    gam.updated_at = now

    await db.flush()

    # Check for level up
    if gam.level > old_level:
        await _emit_level_up(db, redis, user_id, old_level, gam.level, level_info["title"])

    return True


async def _emit_level_up(
    db: AsyncSession,
    redis: object,
    user_id: int,
    old_level: int,
    new_level: int,
    title: str,
) -> None:
    """Emit level-up notification via DB + WebSocket."""
    now = datetime.now(timezone.utc)

    notification = Notification(
        user_id=user_id,
        type="gamification",
        subtype="level_up",
        title="Level Up!",
        description=f"Level {new_level} \u2014 {title}",
        action_url="/profile/level",
        action_label="View Level",
        created_at=now,
    )
    db.add(notification)

    # Push via WebSocket (Redis pub/sub)
    if redis is not None:
        try:
            await redis.publish(  # type: ignore[union-attr]
                "pubsub:level_up",
                json.dumps({
                    "user_id": user_id,
                    "old_level": old_level,
                    "new_level": new_level,
                    "title": title,
                }),
            )
        except Exception:
            logger.warning("Failed to publish level_up notification", exc_info=True)
