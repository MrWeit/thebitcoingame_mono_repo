"""XP service unit tests — idempotency and level-up detection."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import UserGamification, XPLedger
from tbg.gamification.xp_service import get_or_create_gamification, grant_xp


@pytest_asyncio.fixture
async def db_with_gamification(db_session: AsyncSession):
    """DB session with gamification tables ready and clean."""
    from sqlalchemy import text as sql_text

    for table in ["notifications", "xp_ledger", "user_badges", "user_gamification", "streak_calendar"]:
        try:
            await db_session.execute(sql_text(f"TRUNCATE TABLE {table} CASCADE"))  # noqa: S608
        except Exception:
            pass
    await db_session.commit()
    return db_session


class TestGetOrCreateGamification:
    """Test get_or_create_gamification."""

    @pytest.mark.asyncio
    async def test_creates_new_record(self, db_with_gamification):
        """Creates a gamification record for new user."""
        # We need a real user in the DB for FK constraint
        from tbg.auth.service import get_or_create_user

        db = db_with_gamification
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        gam = await get_or_create_gamification(db, user.id)
        assert gam is not None
        assert gam.total_xp == 0
        assert gam.level == 1
        assert gam.level_title == "Nocoiner"

    @pytest.mark.asyncio
    async def test_returns_existing_record(self, db_with_gamification):
        """Returns existing gamification record."""
        from tbg.auth.service import get_or_create_user

        db = db_with_gamification
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        gam1 = await get_or_create_gamification(db, user.id)
        gam1.total_xp = 500
        await db.flush()

        gam2 = await get_or_create_gamification(db, user.id)
        assert gam2.total_xp == 500


class TestGrantXP:
    """Test grant_xp with idempotency."""

    @pytest.mark.asyncio
    async def test_grants_xp_first_time(self, db_with_gamification):
        """First grant succeeds."""
        from tbg.auth.service import get_or_create_user

        db = db_with_gamification
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        result = await grant_xp(
            db=db, redis=None, user_id=user.id,
            amount=50, source="badge", source_id="first_share",
            description="Test XP", idempotency_key="test:xp:1",
        )
        assert result is True

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 50

    @pytest.mark.asyncio
    async def test_duplicate_grant_returns_false(self, db_with_gamification):
        """Duplicate idempotency_key returns False, no double XP."""
        from tbg.auth.service import get_or_create_user

        db = db_with_gamification
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        await grant_xp(
            db=db, redis=None, user_id=user.id,
            amount=50, source="badge", source_id="first_share",
            description="Test XP", idempotency_key="test:xp:dup",
        )

        result = await grant_xp(
            db=db, redis=None, user_id=user.id,
            amount=50, source="badge", source_id="first_share",
            description="Test XP", idempotency_key="test:xp:dup",
        )
        assert result is False

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 50  # Not 100

    @pytest.mark.asyncio
    async def test_level_up_triggers(self, db_with_gamification):
        """Granting enough XP triggers a level up."""
        from tbg.auth.service import get_or_create_user

        db = db_with_gamification
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        # Grant 100 XP to reach level 2
        await grant_xp(
            db=db, redis=None, user_id=user.id,
            amount=100, source="test", source_id="test",
            description="Level up test", idempotency_key="test:levelup:1",
        )

        gam = await get_or_create_gamification(db, user.id)
        assert gam.level == 2
        assert gam.level_title == "Curious Cat"
