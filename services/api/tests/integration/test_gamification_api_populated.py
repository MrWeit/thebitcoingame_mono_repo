"""Integration tests for gamification API endpoints with populated data."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tbg.gamification.badge_service import award_badge
from tbg.gamification.streak_service import update_streak_calendar
from tbg.gamification.xp_service import get_or_create_gamification, grant_xp

from datetime import datetime, timezone


@pytest_asyncio.fixture
async def user_with_badges(authed_client: AsyncClient, db_session):
    """Set up a user with badges, XP, and streak data."""
    from tbg.auth.service import get_or_create_user

    db = db_session

    # Get the user from the authed_client fixture (btc_address used in conftest)
    from sqlalchemy import select
    from tbg.db.models import User

    result = await db.execute(
        select(User).where(User.btc_address == "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
    )
    user = result.scalar_one()

    # Award some badges
    await award_badge(db, None, user.id, "first_share")
    await award_badge(db, None, user.id, "diff_1e6")

    # Add streak data
    now = datetime.now(timezone.utc)
    await update_streak_calendar(db, user.id, now, 500.0)

    gam = await get_or_create_gamification(db, user.id)
    gam.current_streak = 3
    gam.longest_streak = 5
    gam.total_shares = 42
    gam.best_difficulty = 1_500_000.0
    gam.last_active_week = "2026-W09"

    await db.commit()

    return authed_client, user


class TestBadgesWithData:
    """Test badge endpoints with populated data."""

    @pytest.mark.asyncio
    async def test_badge_detail_with_earners(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/badges/first_share")
        assert response.status_code == 200
        data = response.json()
        assert data["total_earned"] >= 1
        assert len(data["recent_earners"]) >= 1
        earner = data["recent_earners"][0]
        assert "user" in earner
        assert "earned_at" in earner

    @pytest.mark.asyncio
    async def test_badge_stats_updated(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/badges")
        data = response.json()
        first_share = next(b for b in data["badges"] if b["slug"] == "first_share")
        assert first_share["total_earned"] >= 1


class TestUserBadgesWithData:
    """Test /users/me/badges with earned badges."""

    @pytest.mark.asyncio
    async def test_my_badges_has_earned(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/badges")
        assert response.status_code == 200
        data = response.json()
        assert data["total_earned"] == 2
        slugs = {b["slug"] for b in data["earned"]}
        assert "first_share" in slugs
        assert "diff_1e6" in slugs

    @pytest.mark.asyncio
    async def test_earned_badge_has_timestamp(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/badges")
        data = response.json()
        for badge in data["earned"]:
            assert "earned_at" in badge
            assert badge["earned_at"] is not None


class TestXPWithData:
    """Test XP endpoints with earned XP."""

    @pytest.mark.asyncio
    async def test_my_xp_shows_accumulated(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/xp")
        assert response.status_code == 200
        data = response.json()
        # first_share=50 + diff_1e6=50 = 100 XP
        assert data["total_xp"] == 100
        assert data["level"] == 2
        assert data["level_title"] == "Curious Cat"
        assert data["xp_into_level"] == 0  # Exactly at level 2
        assert data["next_level"] == 3
        assert data["next_title"] == "Hash Pupil"

    @pytest.mark.asyncio
    async def test_xp_history_has_entries(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/xp/history")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["entries"]) == 2
        # Entries should be sorted by created_at desc
        for entry in data["entries"]:
            assert entry["amount"] in (50,)
            assert entry["source"] == "badge"

    @pytest.mark.asyncio
    async def test_xp_history_pagination(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/xp/history?page=1&per_page=1")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["entries"]) == 1
        assert data["page"] == 1
        assert data["per_page"] == 1


class TestStreakWithData:
    """Test streak endpoints with active streak data."""

    @pytest.mark.asyncio
    async def test_my_streak_shows_current(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/streak")
        assert response.status_code == 200
        data = response.json()
        assert data["current_streak"] == 3
        assert data["longest_streak"] == 5
        assert data["is_active_this_week"] is True
        assert data["last_active_week"] == "2026-W09"

    @pytest.mark.asyncio
    async def test_streak_calendar_has_weeks(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/streak/calendar")
        assert response.status_code == 200
        data = response.json()
        assert len(data["weeks"]) >= 1
        week = data["weeks"][0]
        assert "week_iso" in week
        assert "week_start" in week
        assert "share_count" in week
        assert "best_diff" in week
        assert "is_active" in week
        assert week["share_count"] >= 1
        assert week["is_active"] is True


class TestGamificationSummaryWithData:
    """Test gamification summary with populated data."""

    @pytest.mark.asyncio
    async def test_summary_reflects_all_data(self, user_with_badges):
        client, user = user_with_badges
        response = await client.get("/api/v1/users/me/gamification")
        assert response.status_code == 200
        data = response.json()

        # XP
        assert data["xp"]["total_xp"] == 100
        assert data["xp"]["level"] == 2

        # Streak
        assert data["streak"]["current_streak"] == 3
        assert data["streak"]["longest_streak"] == 5
        assert data["streak"]["is_active_this_week"] is True

        # Badges
        assert data["badges"]["earned"] == 2
        assert data["badges"]["total"] == 20

        # Stats
        assert data["stats"]["total_shares"] == 42
        assert data["stats"]["best_difficulty"] == 1_500_000.0
        assert data["stats"]["blocks_found"] == 0
