"""Badge service unit tests — award, duplicate prevention, XP integration."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import UserBadge, UserGamification
from tbg.gamification.badge_service import award_badge, get_badge_by_slug, has_badge
from tbg.gamification.seed import seed_badges
from tbg.gamification.xp_service import get_or_create_gamification


@pytest_asyncio.fixture
async def seeded_db(db_session: AsyncSession):
    """DB session with badges seeded and gamification tables clean."""
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
    return db_session


class TestGetBadgeBySlug:
    """Test badge lookup."""

    @pytest.mark.asyncio
    async def test_finds_existing_badge(self, seeded_db):
        badge = await get_badge_by_slug(seeded_db, "first_share")
        assert badge is not None
        assert badge.name == "First Hash"
        assert badge.xp_reward == 50
        assert badge.rarity == "common"

    @pytest.mark.asyncio
    async def test_returns_none_for_missing(self, seeded_db):
        badge = await get_badge_by_slug(seeded_db, "nonexistent_badge")
        assert badge is None


class TestAwardBadge:
    """Test badge awarding."""

    @pytest.mark.asyncio
    async def test_award_first_share_badge(self, seeded_db):
        from tbg.auth.service import get_or_create_user

        db = seeded_db
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        result = await award_badge(db, None, user.id, "first_share")
        assert result is True

        # Verify badge is in user_badges
        badge = await get_badge_by_slug(db, "first_share")
        assert await has_badge(db, user.id, badge.id) is True

        # Verify XP was granted
        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 50
        assert gam.badges_earned == 1

    @pytest.mark.asyncio
    async def test_duplicate_badge_returns_false(self, seeded_db):
        from tbg.auth.service import get_or_create_user

        db = seeded_db
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        await award_badge(db, None, user.id, "first_share")
        result = await award_badge(db, None, user.id, "first_share")
        assert result is False

        # XP should not double
        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 50  # Not 100

    @pytest.mark.asyncio
    async def test_award_nonexistent_badge_returns_false(self, seeded_db):
        from tbg.auth.service import get_or_create_user

        db = seeded_db
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        result = await award_badge(db, None, user.id, "nonexistent_badge")
        assert result is False

    @pytest.mark.asyncio
    async def test_legendary_badge_awards_500_xp(self, seeded_db):
        from tbg.auth.service import get_or_create_user

        db = seeded_db
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        await award_badge(db, None, user.id, "block_finder")
        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 500

    @pytest.mark.asyncio
    async def test_multiple_badges_accumulate_xp(self, seeded_db):
        from tbg.auth.service import get_or_create_user

        db = seeded_db
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()

        await award_badge(db, None, user.id, "first_share")  # 50 XP
        await award_badge(db, None, user.id, "diff_1e6")  # 50 XP

        gam = await get_or_create_gamification(db, user.id)
        assert gam.total_xp == 100  # 50 + 50
        assert gam.badges_earned == 2
        assert gam.level == 2  # 100 XP = level 2
