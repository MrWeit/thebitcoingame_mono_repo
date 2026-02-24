"""Integration: event -> trigger -> badge -> XP -> notification full pipeline."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Notification, UserBadge, UserGamification, XPLedger
from tbg.gamification.badge_service import award_badge
from tbg.gamification.seed import seed_badges
from tbg.gamification.trigger_engine import TriggerEngine
from tbg.gamification.xp_service import get_or_create_gamification, grant_xp


@pytest_asyncio.fixture
async def pipeline_db(db_session: AsyncSession):
    """DB with badges seeded and test user created. Cleans up gamification data."""
    from sqlalchemy import text as sql_text

    # Clean up gamification tables for isolation
    for table in ["notifications", "xp_ledger", "user_badges", "user_gamification", "streak_calendar"]:
        try:
            await db_session.execute(sql_text(f"TRUNCATE TABLE {table} CASCADE"))  # noqa: S608
        except Exception:
            pass

    # Ensure badge definitions exist
    await db_session.execute(sql_text("TRUNCATE TABLE badge_stats CASCADE"))
    await db_session.execute(sql_text("TRUNCATE TABLE badge_definitions CASCADE"))
    await db_session.commit()

    await seed_badges(db_session)

    from tbg.auth.service import get_or_create_user
    user, _ = await get_or_create_user(db_session, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    await db_session.commit()

    return db_session, user


class TestFullPipeline:
    """Integration: event -> trigger -> badge -> XP -> notification."""

    @pytest.mark.asyncio
    async def test_share_triggers_first_share_and_xp(self, pipeline_db):
        """A share event triggers first_share badge + 50 XP + notification."""
        db, user = pipeline_db
        engine = TriggerEngine(db, None)

        # Simulate share_submitted event
        data = {"user": user.btc_address, "worker": "bitaxe-1", "diff": "1000", "sdiff": "512"}
        awarded = await engine.evaluate("mining:share_submitted", "test-msg-1", data)

        assert "first_share" in awarded

        # Verify XP
        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 50
        assert gam.badges_earned == 1
        assert gam.total_shares == 1

        # Verify notification was persisted
        notif_result = await db.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.subtype == "badge_earned",
            )
        )
        notif = notif_result.scalar_one_or_none()
        assert notif is not None
        assert "First Hash" in notif.title

    @pytest.mark.asyncio
    async def test_idempotent_processing(self, pipeline_db):
        """Processing same event twice must not double XP."""
        db, user = pipeline_db
        engine = TriggerEngine(db, None)

        data = {"user": user.btc_address, "worker": "bitaxe-1", "diff": "1000", "sdiff": "512"}

        await engine.evaluate("mining:share_submitted", "test-msg-2a", data)
        awarded2 = await engine.evaluate("mining:share_submitted", "test-msg-2b", data)

        # Badge should NOT be awarded again
        assert "first_share" not in awarded2

        # XP should be 50, not 100
        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 50

    @pytest.mark.asyncio
    async def test_best_diff_triggers_multiple_badges(self, pipeline_db):
        """A single best_diff event can trigger multiple difficulty badges."""
        db, user = pipeline_db
        engine = TriggerEngine(db, None)

        data = {"user": user.btc_address, "diff": "1500000000"}  # 1.5 billion
        awarded = await engine.evaluate("mining:share_best_diff", "test-msg-3", data)

        assert "diff_1e6" in awarded
        assert "diff_1e9" in awarded
        assert "diff_1e12" not in awarded  # Only 1.5B, not 1T

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 150  # 50 + 100
        assert gam.badges_earned == 2
        assert gam.best_difficulty == 1_500_000_000

    @pytest.mark.asyncio
    async def test_block_found_legendary_badge(self, pipeline_db):
        """Block found awards legendary badge + 500 XP."""
        db, user = pipeline_db
        engine = TriggerEngine(db, None)

        data = {
            "user": user.btc_address,
            "height": "879412",
            "hash": "0000abc...",
            "reward": "312500000",
        }
        awarded = await engine.evaluate("mining:block_found", "test-msg-4", data)

        assert "block_finder" in awarded

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 500
        assert gam.blocks_found == 1

    @pytest.mark.asyncio
    async def test_xp_accumulation_triggers_level_up(self, pipeline_db):
        """Multiple badge awards accumulate XP and trigger level up."""
        db, user = pipeline_db
        engine = TriggerEngine(db, None)

        # first_share = 50 XP
        data = {"user": user.btc_address, "worker": "w1", "diff": "1000", "sdiff": "512"}
        await engine.evaluate("mining:share_submitted", "test-msg-5a", data)

        # diff_1e6 = 50 XP (total: 100 -> level 2)
        data2 = {"user": user.btc_address, "diff": "2000000"}
        await engine.evaluate("mining:share_best_diff", "test-msg-5b", data2)

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 100
        assert gam.level == 2
        assert gam.level_title == "Curious Cat"

        # Check for level_up notification
        notif_result = await db.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.subtype == "level_up",
            )
        )
        notif = notif_result.scalar_one_or_none()
        assert notif is not None

    @pytest.mark.asyncio
    async def test_event_trigger_via_api(self, pipeline_db):
        """Event-based triggers (called by feature APIs)."""
        db, user = pipeline_db
        engine = TriggerEngine(db, None)

        awarded = await engine.check_event_trigger(user.id, "track_complete")
        assert "rabbit_hole_complete" in awarded

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 150  # rabbit_hole_complete = 150 XP

    @pytest.mark.asyncio
    async def test_xp_ledger_entries(self, pipeline_db):
        """Verify XP ledger entries are created correctly."""
        db, user = pipeline_db

        await award_badge(db, None, user.id, "first_share")

        result = await db.execute(
            select(XPLedger).where(XPLedger.user_id == user.id)
        )
        entries = result.scalars().all()
        assert len(entries) == 1
        assert entries[0].amount == 50
        assert entries[0].source == "badge"
        assert entries[0].source_id == "first_share"
        assert entries[0].idempotency_key == "badge:first_share:" + str(user.id)
