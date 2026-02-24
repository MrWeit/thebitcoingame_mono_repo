"""Trigger engine unit tests — all 5 trigger types."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import UserGamification
from tbg.gamification.badge_service import has_badge, get_badge_by_slug
from tbg.gamification.seed import seed_badges
from tbg.gamification.trigger_engine import TriggerEngine
from tbg.gamification.xp_service import get_or_create_gamification


@pytest_asyncio.fixture
async def engine_db(db_session: AsyncSession):
    """DB with badges seeded, gamification tables clean, and a test user."""
    from sqlalchemy import text as sql_text

    for table in ["notifications", "xp_ledger", "user_badges", "user_gamification", "streak_calendar"]:
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


class TestShareCountTrigger:
    """Test share_count trigger type."""

    @pytest.mark.asyncio
    async def test_first_share_awards_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        # Set total_shares = 1 (first share just submitted)
        gam = await get_or_create_gamification(db, user.id)
        gam.total_shares = 1
        await db.flush()

        result = await engine._check_share_count_triggers(user.id)
        assert "first_share" in result

    @pytest.mark.asyncio
    async def test_duplicate_badge_not_awarded(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        gam = await get_or_create_gamification(db, user.id)
        gam.total_shares = 1
        await db.flush()

        # First call awards
        await engine._check_share_count_triggers(user.id)

        # Second call does NOT re-award
        result = await engine._check_share_count_triggers(user.id)
        assert "first_share" not in result

    @pytest.mark.asyncio
    async def test_1k_shares_triggers(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        gam = await get_or_create_gamification(db, user.id)
        gam.total_shares = 1000
        await db.flush()

        result = await engine._check_share_count_triggers(user.id)
        assert "first_share" in result
        assert "shares_1k" in result

    @pytest.mark.asyncio
    async def test_below_threshold_no_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        gam = await get_or_create_gamification(db, user.id)
        gam.total_shares = 0
        await db.flush()

        result = await engine._check_share_count_triggers(user.id)
        assert len(result) == 0


class TestBestDiffTrigger:
    """Test best_diff trigger type."""

    @pytest.mark.asyncio
    async def test_diff_1e6_awarded(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        data = {"diff": "1500000"}
        result = await engine._check_best_diff_triggers(user.id, data)
        assert "diff_1e6" in result

    @pytest.mark.asyncio
    async def test_diff_below_threshold_not_awarded(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        data = {"diff": "500000"}
        result = await engine._check_best_diff_triggers(user.id, data)
        assert "diff_1e6" not in result

    @pytest.mark.asyncio
    async def test_diff_1e9_awarded(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        data = {"diff": "1500000000"}
        result = await engine._check_best_diff_triggers(user.id, data)
        assert "diff_1e6" in result
        assert "diff_1e9" in result
        assert "diff_1e12" not in result

    @pytest.mark.asyncio
    async def test_diff_1e12_awarded(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        data = {"diff": "2000000000000"}
        result = await engine._check_best_diff_triggers(user.id, data)
        assert "diff_1e6" in result
        assert "diff_1e9" in result
        assert "diff_1e12" in result


class TestBlockFoundTrigger:
    """Test block_found trigger type."""

    @pytest.mark.asyncio
    async def test_block_found_awards_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        data = {"height": "879412", "reward": "312500000"}
        result = await engine._check_block_found_triggers(user.id, data)
        assert "block_finder" in result

    @pytest.mark.asyncio
    async def test_block_found_not_duplicated(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        data = {"height": "879412"}
        await engine._check_block_found_triggers(user.id, data)
        result = await engine._check_block_found_triggers(user.id, data)
        assert "block_finder" not in result


class TestEventTrigger:
    """Test event-based trigger type."""

    @pytest.mark.asyncio
    async def test_track_complete_awards_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        result = await engine.check_event_trigger(user.id, "track_complete")
        assert "rabbit_hole_complete" in result

    @pytest.mark.asyncio
    async def test_unknown_event_no_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        result = await engine.check_event_trigger(user.id, "unknown_event")
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_coop_created_awards_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        result = await engine.check_event_trigger(user.id, "coop_created")
        assert "coop_founder" in result

    @pytest.mark.asyncio
    async def test_world_cup_participate_awards_badge(self, engine_db):
        db, user = engine_db
        engine = TriggerEngine(db, None)

        result = await engine.check_event_trigger(user.id, "world_cup_participate")
        assert "world_cup_participant" in result
