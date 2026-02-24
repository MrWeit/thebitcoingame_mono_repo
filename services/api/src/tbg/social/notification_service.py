"""Notification creation and delivery service.

Notifications are:
1. Persisted in the database
2. Pushed to the user via WebSocket (Redis pub/sub → WS bridge)
3. Filtered by user notification preferences

Types: mining, gamification, competition, social, system
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Notification, UserSettings

logger = logging.getLogger(__name__)

VALID_TYPES = {"mining", "gamification", "competition", "social", "system"}

# Default notification preferences (matches frontend settingsStore.ts)
DEFAULT_PREFERENCES = {
    "personalBest": True,
    "badgeEarned": True,
    "worldCupMatch": True,
    "lotteryResults": True,
    "blockFoundAny": False,
    "leaderboardChange": False,
    "coopActivity": False,
    "educationRecommendation": False,
    "inApp": True,
    "browserPush": False,
    "emailNotifications": False,
}

# Map (type, subtype) → preference key
PREFERENCE_MAP = {
    ("mining", "personal_best"): "personalBest",
    ("gamification", "badge_earned"): "badgeEarned",
    ("competition", "match_starting"): "worldCupMatch",
    ("competition", "match_result"): "worldCupMatch",
    ("competition", "lottery_results"): "lotteryResults",
    ("social", "block_found"): "blockFoundAny",
    ("competition", "leaderboard_change"): "leaderboardChange",
    ("social", "coop_activity"): "coopActivity",
    ("social", "coop_member_joined"): "coopActivity",
    ("gamification", "education_recommendation"): "educationRecommendation",
}


def should_deliver(preferences: dict, type_: str, subtype: str) -> bool:
    """Check if a notification should be delivered based on user preferences."""
    if not preferences.get("inApp", True):
        return False

    pref_key = PREFERENCE_MAP.get((type_, subtype))
    if pref_key is None:
        return True  # Default to True for unmatched subtypes

    return preferences.get(pref_key, DEFAULT_PREFERENCES.get(pref_key, True))


async def get_user_notification_preferences(db: AsyncSession, user_id: int) -> dict:
    """Get user's notification preferences, falling back to defaults."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if not settings or not settings.notifications:
        return dict(DEFAULT_PREFERENCES)

    # Merge with defaults (user prefs override)
    merged = dict(DEFAULT_PREFERENCES)
    merged.update(settings.notifications)
    return merged


async def create_notification(
    db: AsyncSession,
    user_id: int,
    type_: str,
    subtype: str,
    title: str,
    description: str | None = None,
    action_url: str | None = None,
    action_label: str | None = None,
    metadata: dict[str, Any] | None = None,
    redis: Any | None = None,
) -> Notification | None:
    """Create a notification and push it via WebSocket."""
    if type_ not in VALID_TYPES:
        raise ValueError(f"Invalid notification type: {type_}. Must be one of {VALID_TYPES}")

    # Check user's notification preferences
    preferences = await get_user_notification_preferences(db, user_id)
    if not should_deliver(preferences, type_, subtype):
        return None

    notification = Notification(
        user_id=user_id,
        type=type_,
        subtype=subtype,
        title=title,
        description=description,
        action_url=action_url,
        action_label=action_label,
        notification_metadata=metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(notification)
    await db.flush()

    # Push via WebSocket (Redis pub/sub)
    if redis is not None:
        ws_payload = {
            "event": "notification",
            "data": {
                "id": str(notification.id),
                "type": notification.type,
                "subtype": notification.subtype,
                "title": notification.title,
                "description": notification.description,
                "timestamp": notification.created_at.isoformat() if notification.created_at else None,
                "read": False,
                "actionUrl": notification.action_url,
                "actionLabel": notification.action_label,
            },
        }
        try:
            await redis.publish(f"ws:user:{user_id}", json.dumps(ws_payload))
        except Exception:
            logger.warning("Failed to push notification via WebSocket", exc_info=True)

    return notification


async def notify_coop_members(
    db: AsyncSession,
    coop_id: int,
    type_: str,
    subtype: str,
    title: str,
    description: str | None = None,
    exclude_user_id: int | None = None,
    redis: Any | None = None,
) -> None:
    """Send a notification to all members of a cooperative."""
    from tbg.db.models import CooperativeMember

    result = await db.execute(
        select(CooperativeMember.user_id).where(
            CooperativeMember.cooperative_id == coop_id
        )
    )
    member_ids = [row[0] for row in result]

    for uid in member_ids:
        if uid == exclude_user_id:
            continue
        await create_notification(
            db, uid, type_, subtype, title, description, redis=redis,
        )


async def get_notifications(
    db: AsyncSession,
    user_id: int,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Notification], int]:
    """Get user's notifications (paginated, most recent first)."""
    offset = (page - 1) * per_page

    total_result = await db.execute(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    notifications = list(result.scalars().all())
    return notifications, total


async def mark_as_read(db: AsyncSession, user_id: int, notification_id: int) -> bool:
    """Mark a single notification as read. Returns True if found."""
    result = await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(read=True)
    )
    await db.flush()
    return result.rowcount > 0


async def mark_all_as_read(db: AsyncSession, user_id: int) -> int:
    """Mark all unread notifications as read. Returns count updated."""
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
        .values(read=True)
    )
    await db.flush()
    return result.rowcount


async def get_unread_count(db: AsyncSession, user_id: int) -> int:
    """Get count of unread notifications."""
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
    )
    return result.scalar_one()
