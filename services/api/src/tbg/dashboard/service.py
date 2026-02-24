"""Dashboard stats aggregation.

Combines mining, gamification, and event data into dashboard responses.
Results are cached in Redis with a 10-second TTL.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
import structlog
from sqlalchemy import and_, delete, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import ActivityFeed, UpcomingEvent

logger = structlog.get_logger()

DASHBOARD_CACHE_KEY = "dashboard:stats:{user_id}"
DASHBOARD_CACHE_TTL = 10  # seconds


async def get_dashboard_stats(
    session: AsyncSession,
    redis: aioredis.Redis,
    user_id: int,
    btc_address: str,
) -> dict:
    """Aggregated dashboard stats combining mining, gamification, and events.

    Caches result in Redis for 10 seconds to avoid DB pressure.
    Matches the frontend's mockDashboardStats shape exactly.
    """
    cache_key = DASHBOARD_CACHE_KEY.format(user_id=user_id)

    # Try cache first
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # Get mining summary from Phase 2 service
    from tbg.mining.service import get_mining_summary

    mining = await get_mining_summary(redis, session, btc_address, user_id)

    # Gamification state (may not exist yet — Phase 4)
    gamification = {
        "level": 1,
        "level_title": "Nocoiner",
        "xp": 0,
        "xp_to_next": 100,
        "streak": 0,
        "badges_earned": 0,
    }
    try:
        from tbg.gamification.service import get_gamification_state  # type: ignore[import-not-found]
        gamification = await get_gamification_state(session, user_id)
    except (ImportError, Exception):
        pass

    # Network info from Redis
    network_diff = float(await redis.get("network:difficulty") or 0)
    network_height = int(await redis.get("network:height") or 0)

    stats = {
        "hashrate": mining.hashrate_1h,
        "hashrate_change": 0,  # computed from snapshots in Phase 4
        "shares_today": mining.shares_today,
        "shares_change": 0,
        "workers_online": mining.workers_online,
        "workers_total": mining.workers_total,
        "streak": gamification.get("streak", 0),
        "best_diff_week": mining.best_diff_today,
        "network_diff": network_diff,
        "best_diff_ratio": (
            mining.best_diff_today / network_diff
            if network_diff > 0 else 0
        ),
        "level": gamification.get("level", 1),
        "level_title": gamification.get("level_title", "Nocoiner"),
        "xp": gamification.get("xp", 0),
        "xp_to_next": gamification.get("xp_to_next", 100),
        "badges_earned": gamification.get("badges_earned", 0),
        "network_height": network_height,
    }

    # Cache for 10 seconds
    await redis.setex(cache_key, DASHBOARD_CACHE_TTL, json.dumps(stats))

    return stats


async def get_global_feed(
    session: AsyncSession,
    limit: int = 20,
    before_id: int | None = None,
) -> list[dict]:
    """Get the global activity feed (visible to all users)."""
    query = (
        select(ActivityFeed)
        .where(ActivityFeed.is_global == True)  # noqa: E712
        .order_by(desc(ActivityFeed.created_at))
        .limit(limit)
    )

    if before_id:
        query = query.where(ActivityFeed.id < before_id)

    result = await session.execute(query)
    items = result.scalars().all()

    return [
        {
            "id": item.id,
            "type": item.event_type,
            "text": item.title,
            "description": item.description,
            "time": item.created_at.isoformat() if item.created_at else "",
            "metadata": item.extra_data or {},
        }
        for item in items
    ]


async def get_upcoming_events(
    session: AsyncSession,
    user_id: int,
) -> list[dict]:
    """Get upcoming events (global + user-specific)."""
    now = datetime.now(timezone.utc)

    query = (
        select(UpcomingEvent)
        .where(
            and_(
                UpcomingEvent.is_active == True,  # noqa: E712
                UpcomingEvent.ends_at > now,
                or_(
                    UpcomingEvent.target_user_id.is_(None),
                    UpcomingEvent.target_user_id == user_id,
                ),
            )
        )
        .order_by(UpcomingEvent.ends_at.asc())
        .limit(10)
    )

    result = await session.execute(query)
    events = result.scalars().all()

    return [
        {
            "id": e.id,
            "type": e.event_type,
            "title": e.title,
            "description": e.description,
            "ends_at": e.ends_at.isoformat(),
            "action": {
                "label": e.action_label,
                "href": e.action_href,
            } if e.action_label else None,
        }
        for e in events
    ]


async def get_recent_badges(
    session: AsyncSession,
    user_id: int,
    limit: int = 5,
) -> list[dict]:
    """Recently earned badges for the current user.

    Graceful fallback — gamification tables may not exist until Phase 4.
    """
    try:
        from tbg.gamification.service import get_recent_badges as _get_badges  # type: ignore[import-not-found]
        return await _get_badges(session, user_id, limit)
    except (ImportError, Exception):
        return []


# ---------------------------------------------------------------------------
# Background tasks (pruner)
# ---------------------------------------------------------------------------


async def prune_activity_feed(session: AsyncSession) -> int:
    """Keep only the last 10,000 global feed items. Returns deleted count."""
    cutoff_result = await session.execute(
        select(ActivityFeed.id)
        .where(ActivityFeed.is_global == True)  # noqa: E712
        .order_by(ActivityFeed.id.desc())
        .offset(10_000)
        .limit(1)
    )
    cutoff_id = cutoff_result.scalar()

    if cutoff_id is None:
        return 0

    result = await session.execute(
        delete(ActivityFeed).where(
            ActivityFeed.is_global == True,  # noqa: E712
            ActivityFeed.id < cutoff_id,
        )
    )
    await session.commit()
    return result.rowcount  # type: ignore[return-value]


async def prune_expired_events(session: AsyncSession) -> int:
    """Remove events that ended more than 7 days ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    result = await session.execute(
        delete(UpcomingEvent).where(UpcomingEvent.ends_at < cutoff)
    )
    await session.commit()
    return result.rowcount  # type: ignore[return-value]
