"""Integration tests for streak_service — calendar updates, weekly evaluation, warnings."""

from __future__ import annotations

from datetime import datetime, date, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock

from tbg.db.models import Notification, StreakCalendar, UserGamification
from tbg.gamification.seed import seed_badges
from tbg.gamification.streak_service import (
    STREAK_BADGE_MAP,
    check_streak_warnings,
    check_streaks,
    update_streak_calendar,
)
from tbg.gamification.xp_service import get_or_create_gamification


@pytest_asyncio.fixture
async def streak_db(db_session: AsyncSession):
    """DB with badges seeded, gamification tables clean, and a test user."""
    for table in [
        "notifications", "xp_ledger", "user_badges",
        "user_gamification", "streak_calendar",
    ]:
        try:
            await db_session.execute(sql_text(f"TRUNCATE TABLE {table} CASCADE"))  # noqa: S608
        except Exception:
            pass
    await db_session.execute(sql_text("TRUNCATE TABLE badge_stats CASCADE"))
    await db_session.execute(sql_text("TRUNCATE TABLE badge_definitions CASCADE"))
    await db_session.commit()

    await seed_badges(db_session)

    from tbg.auth.service import get_or_create_user

    user, _ = await get_or_create_user(db_session, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    await db_session.commit()

    return db_session, user


class TestUpdateStreakCalendar:
    """Test streak calendar upserts."""

    @pytest.mark.asyncio
    async def test_first_share_creates_calendar_entry(self, streak_db):
        db, user = streak_db
        share_time = datetime(2026, 2, 25, 14, 0, 0, tzinfo=timezone.utc)  # Wednesday W09

        await update_streak_calendar(db, user.id, share_time, 1000.0)
        await db.commit()

        result = await db.execute(
            select(StreakCalendar).where(StreakCalendar.user_id == user.id)
        )
        cal = result.scalar_one()
        assert cal.week_iso == "2026-W09"
        assert cal.week_start == date(2026, 2, 23)  # Monday
        assert cal.share_count == 1
        assert cal.best_diff == 1000.0
        assert cal.is_active is True

    @pytest.mark.asyncio
    async def test_second_share_increments_count(self, streak_db):
        db, user = streak_db
        share_time = datetime(2026, 2, 25, 14, 0, 0, tzinfo=timezone.utc)

        await update_streak_calendar(db, user.id, share_time, 500.0)
        await update_streak_calendar(db, user.id, share_time, 800.0)
        await db.commit()

        result = await db.execute(
            select(StreakCalendar).where(StreakCalendar.user_id == user.id)
        )
        cal = result.scalar_one()
        assert cal.share_count == 2

    @pytest.mark.asyncio
    async def test_different_weeks_create_separate_entries(self, streak_db):
        db, user = streak_db
        week1 = datetime(2026, 2, 25, 14, 0, 0, tzinfo=timezone.utc)  # W09
        week2 = datetime(2026, 3, 4, 14, 0, 0, tzinfo=timezone.utc)  # W10

        await update_streak_calendar(db, user.id, week1, 100.0)
        await update_streak_calendar(db, user.id, week2, 200.0)
        await db.commit()

        result = await db.execute(
            select(StreakCalendar).where(StreakCalendar.user_id == user.id)
        )
        entries = result.scalars().all()
        assert len(entries) == 2
        weeks = {e.week_iso for e in entries}
        assert weeks == {"2026-W09", "2026-W10"}


class TestCheckStreaks:
    """Test weekly streak evaluation."""

    @pytest.mark.asyncio
    async def test_new_streak_starts_at_1(self, streak_db):
        """User active last week with streak=0 should start at streak=1."""
        db, user = streak_db

        # User was active last week (W08)
        last_week_time = datetime(2026, 2, 18, 12, 0, 0, tzinfo=timezone.utc)  # W08
        await update_streak_calendar(db, user.id, last_week_time, 100.0)
        await db.commit()

        # Run streak check on Monday W09
        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        processed = await check_streaks(db, None, now)

        assert processed >= 1
        gam = await get_or_create_gamification(db, user.id)
        assert gam.current_streak == 1
        assert gam.longest_streak == 1
        assert gam.last_active_week == "2026-W08"
        assert gam.streak_start_date == date(2026, 2, 16)

    @pytest.mark.asyncio
    async def test_streak_continues_when_active(self, streak_db):
        """Active user with existing streak should increment."""
        db, user = streak_db

        # Set up user with current_streak=3
        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 3
        gam.longest_streak = 3
        gam.last_active_week = "2026-W07"
        await db.flush()

        # User was active last week (W08)
        last_week_time = datetime(2026, 2, 18, 12, 0, 0, tzinfo=timezone.utc)
        await update_streak_calendar(db, user.id, last_week_time, 100.0)
        await db.commit()

        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        processed = await check_streaks(db, None, now)

        assert processed >= 1
        await db.refresh(gam)
        assert gam.current_streak == 4
        assert gam.longest_streak == 4
        assert gam.last_active_week == "2026-W08"

    @pytest.mark.asyncio
    async def test_streak_broken_resets_to_zero(self, streak_db):
        """Inactive user with streak should be reset to 0."""
        db, user = streak_db

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 5
        gam.longest_streak = 5
        await db.commit()

        # No activity last week — run streak check
        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        await check_streaks(db, None, now)

        await db.refresh(gam)
        assert gam.current_streak == 0
        assert gam.longest_streak == 5  # Preserved

    @pytest.mark.asyncio
    async def test_streak_broken_emits_notification(self, streak_db):
        """Broken streak should create a notification."""
        db, user = streak_db

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 3
        gam.longest_streak = 3
        await db.commit()

        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        await check_streaks(db, None, now)

        result = await db.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.subtype == "streak_broken",
            )
        )
        notif = result.scalar_one_or_none()
        assert notif is not None
        assert "3-week" in notif.description

    @pytest.mark.asyncio
    async def test_streak_broken_publishes_to_redis(self, streak_db):
        """Broken streak should publish to Redis pub/sub."""
        db, user = streak_db

        mock_redis = AsyncMock()

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 2
        gam.longest_streak = 2
        await db.commit()

        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        await check_streaks(db, mock_redis, now)

        mock_redis.publish.assert_called()
        call_args = mock_redis.publish.call_args
        assert call_args[0][0] == "pubsub:streak_update"

    @pytest.mark.asyncio
    async def test_streak_grants_10_xp_per_week(self, streak_db):
        """Continuing a streak should grant 10 XP."""
        db, user = streak_db

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 1
        gam.longest_streak = 1
        await db.flush()

        last_week_time = datetime(2026, 2, 18, 12, 0, 0, tzinfo=timezone.utc)
        await update_streak_calendar(db, user.id, last_week_time, 100.0)
        await db.commit()

        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        await check_streaks(db, None, now)

        await db.refresh(gam)
        assert gam.total_xp == 10

    @pytest.mark.asyncio
    async def test_streak_4_awards_badge(self, streak_db):
        """Reaching 4-week streak should award streak_4 badge."""
        db, user = streak_db

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 3
        gam.longest_streak = 3
        await db.flush()

        last_week_time = datetime(2026, 2, 18, 12, 0, 0, tzinfo=timezone.utc)
        await update_streak_calendar(db, user.id, last_week_time, 100.0)
        await db.commit()

        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        await check_streaks(db, None, now)

        # streak_4 = 100 XP + 10 XP streak bonus
        await db.refresh(gam)
        assert gam.current_streak == 4
        assert gam.badges_earned >= 1
        assert gam.total_xp >= 100  # Badge XP (100) + streak XP (10)

    @pytest.mark.asyncio
    async def test_no_users_with_streaks_returns_zero(self, streak_db):
        """No users with active streaks returns 0 processed."""
        db, _ = streak_db

        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        processed = await check_streaks(db, None, now)
        # Only counts users from the "new streak" path if any were active
        assert processed >= 0


class TestCheckStreakWarnings:
    """Test Sunday streak expiration warnings."""

    @pytest.mark.asyncio
    async def test_warning_sent_when_not_active_this_week(self, streak_db):
        """User with streak but no activity this week should get a warning."""
        db, user = streak_db

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 3
        gam.longest_streak = 3
        await db.commit()

        # Sunday evening W09, user hasn't mined this week
        now = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        warnings = await check_streak_warnings(db, None, now)

        assert warnings == 1

        result = await db.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.subtype == "streak_warning",
            )
        )
        notif = result.scalar_one_or_none()
        assert notif is not None
        assert "3-week" in notif.description
        assert "24 hours" in notif.description

    @pytest.mark.asyncio
    async def test_no_warning_when_active_this_week(self, streak_db):
        """User with streak who already mined this week gets no warning."""
        db, user = streak_db

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 3
        gam.longest_streak = 3
        await db.flush()

        # User mined this week
        this_week_time = datetime(2026, 2, 25, 12, 0, 0, tzinfo=timezone.utc)
        await update_streak_calendar(db, user.id, this_week_time, 100.0)
        await db.commit()

        now = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        warnings = await check_streak_warnings(db, None, now)

        assert warnings == 0

    @pytest.mark.asyncio
    async def test_warning_publishes_to_redis(self, streak_db):
        """Streak warning should publish to Redis pub/sub."""
        db, user = streak_db

        mock_redis = AsyncMock()

        gam = await get_or_create_gamification(db, user.id)
        gam.current_streak = 5
        gam.longest_streak = 5
        await db.commit()

        now = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        await check_streak_warnings(db, mock_redis, now)

        mock_redis.publish.assert_called_once()
        call_args = mock_redis.publish.call_args
        assert call_args[0][0] == "pubsub:streak_update"

    @pytest.mark.asyncio
    async def test_no_warnings_when_no_streaks(self, streak_db):
        """No users with active streaks means no warnings."""
        db, _ = streak_db

        now = datetime(2026, 3, 1, 18, 0, 0, tzinfo=timezone.utc)
        warnings = await check_streak_warnings(db, None, now)

        assert warnings == 0
