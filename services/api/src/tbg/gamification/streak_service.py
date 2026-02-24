"""Streak tracking: calendar updates and weekly evaluation."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Notification, StreakCalendar, UserGamification
from tbg.gamification.xp_service import get_or_create_gamification, grant_xp

logger = logging.getLogger(__name__)


def get_week_iso(dt: datetime) -> str:
    """Get ISO week string e.g. '2026-W09'. Uses %G-W%V (ISO year + ISO week)."""
    return dt.strftime("%G-W%V")


def get_monday(dt: datetime) -> date:
    """Get the Monday of the ISO week containing dt."""
    d = dt.date() if isinstance(dt, datetime) else dt
    return d - timedelta(days=d.weekday())


def get_last_week_iso(now: datetime | None = None) -> str:
    """Get the ISO week string for the week that just ended (previous week)."""
    if now is None:
        now = datetime.now(timezone.utc)
    last_week = now - timedelta(weeks=1)
    return get_week_iso(last_week)


def get_current_week_iso(now: datetime | None = None) -> str:
    """Get the ISO week string for the current week."""
    if now is None:
        now = datetime.now(timezone.utc)
    return get_week_iso(now)


async def update_streak_calendar(
    db: AsyncSession,
    user_id: int,
    share_time: datetime,
    share_diff: float = 0.0,
) -> None:
    """Update the streak calendar when a share is submitted."""
    week_iso = get_week_iso(share_time)
    week_start = get_monday(share_time)

    stmt = pg_insert(StreakCalendar).values(
        user_id=user_id,
        week_iso=week_iso,
        week_start=week_start,
        share_count=1,
        best_diff=share_diff,
        is_active=True,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="streak_calendar_user_id_week_iso_key",
        set_={
            "share_count": StreakCalendar.share_count + 1,
            "best_diff": stmt.excluded.best_diff,  # Will take max in trigger engine
            "is_active": True,
        },
    )
    await db.execute(stmt)


async def check_streaks(db: AsyncSession, redis: object, now: datetime | None = None) -> int:
    """Weekly streak evaluation. Should run Monday 00:00 UTC.

    For each user:
    1. Check if they were active last week
    2. If yes: increment streak, check badges
    3. If no and had streak > 0: reset, preserve longest

    Returns number of users processed.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    last_week_iso = get_last_week_iso(now)
    processed = 0

    # Get all users with active streaks
    users_with_streaks = await db.execute(
        select(UserGamification).where(UserGamification.current_streak > 0)
    )

    for gam in users_with_streaks.scalars():
        was_active = await db.execute(
            select(StreakCalendar).where(
                StreakCalendar.user_id == gam.user_id,
                StreakCalendar.week_iso == last_week_iso,
                StreakCalendar.is_active.is_(True),
            )
        )

        if was_active.scalar_one_or_none():
            # Streak continues
            gam.current_streak += 1
            gam.longest_streak = max(gam.longest_streak, gam.current_streak)
            gam.last_active_week = last_week_iso
            gam.updated_at = now

            # Check streak badges
            await _check_streak_badges(db, redis, gam.user_id, gam.current_streak)

            # Grant streak XP (10 XP per week)
            await grant_xp(
                db, redis, gam.user_id, 10, "streak",
                f"streak-{last_week_iso}",
                f"Mining streak week {gam.current_streak}",
                f"streak:{gam.user_id}:{last_week_iso}",
            )
        else:
            # Streak broken
            if gam.current_streak > 0:
                await _emit_streak_broken(db, redis, gam.user_id, gam.current_streak)
            gam.current_streak = 0
            gam.updated_at = now

        processed += 1

    # Check for NEW streaks: users active last week but with streak=0
    new_active = await db.execute(
        select(StreakCalendar).where(
            StreakCalendar.week_iso == last_week_iso,
            StreakCalendar.is_active.is_(True),
        )
    )
    for cal in new_active.scalars():
        gam = await get_or_create_gamification(db, cal.user_id)
        if gam.current_streak == 0:
            gam.current_streak = 1
            gam.longest_streak = max(gam.longest_streak, 1)
            gam.streak_start_date = cal.week_start
            gam.last_active_week = last_week_iso
            gam.updated_at = now
            processed += 1

    await db.commit()
    logger.info("Streak check complete: processed %d users for %s", processed, last_week_iso)
    return processed


async def check_streak_warnings(db: AsyncSession, redis: object, now: datetime | None = None) -> int:
    """Sunday 18:00 UTC: warn users with active streaks who haven't mined this week.

    Returns number of warnings sent.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    current_week_iso = get_current_week_iso(now)
    warnings = 0

    # Users with active streaks
    users_with_streaks = await db.execute(
        select(UserGamification).where(UserGamification.current_streak > 0)
    )

    for gam in users_with_streaks.scalars():
        # Check if active this week
        active_this_week = await db.execute(
            select(StreakCalendar).where(
                StreakCalendar.user_id == gam.user_id,
                StreakCalendar.week_iso == current_week_iso,
                StreakCalendar.is_active.is_(True),
            )
        )
        if active_this_week.scalar_one_or_none() is None:
            # Not active — send warning
            await _emit_streak_warning(db, redis, gam.user_id, gam.current_streak)
            warnings += 1

    await db.commit()
    return warnings


# --- Streak badge thresholds ---
STREAK_BADGE_MAP = {
    4: "streak_4",
    12: "streak_12",
    52: "streak_52",
}


async def _check_streak_badges(
    db: AsyncSession,
    redis: object,
    user_id: int,
    current_streak: int,
) -> list[str]:
    """Check and award streak badges based on current streak length."""
    from tbg.gamification.badge_service import award_badge

    awarded = []
    for threshold, badge_slug in STREAK_BADGE_MAP.items():
        if current_streak >= threshold:
            if await award_badge(db, redis, user_id, badge_slug):
                awarded.append(badge_slug)
    return awarded


async def _emit_streak_broken(
    db: AsyncSession, redis: object, user_id: int, streak_length: int
) -> None:
    """Notify user their streak was broken."""
    now = datetime.now(timezone.utc)
    notification = Notification(
        user_id=user_id,
        type="gamification",
        subtype="streak_broken",
        title="Streak Broken",
        description=f"Your {streak_length}-week mining streak has ended.",
        action_url="/profile/streaks",
        created_at=now,
    )
    db.add(notification)

    if redis is not None:
        try:
            await redis.publish(  # type: ignore[union-attr]
                "pubsub:streak_update",
                json.dumps({
                    "user_id": user_id,
                    "event": "streak_broken",
                    "streak_length": streak_length,
                }),
            )
        except Exception:
            logger.warning("Failed to publish streak_broken notification", exc_info=True)


async def _emit_streak_warning(
    db: AsyncSession, redis: object, user_id: int, streak_length: int
) -> None:
    """Warn user their streak is about to expire."""
    now = datetime.now(timezone.utc)
    notification = Notification(
        user_id=user_id,
        type="mining",
        subtype="streak_warning",
        title="Streak Expiring Soon",
        description=f"Mine within 24 hours to keep your {streak_length}-week streak",
        action_url="/profile/streaks",
        created_at=now,
    )
    db.add(notification)

    if redis is not None:
        try:
            await redis.publish(  # type: ignore[union-attr]
                "pubsub:streak_update",
                json.dumps({
                    "user_id": user_id,
                    "event": "streak_warning",
                    "streak_length": streak_length,
                }),
            )
        except Exception:
            logger.warning("Failed to publish streak_warning notification", exc_info=True)
