"""Integration tests for competition API endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text

from tbg.database import get_session

pytestmark = pytest.mark.asyncio


class TestLeaderboardAPI:
    """Test leaderboard API endpoints."""

    async def test_weekly_leaderboard_empty(self, client: AsyncClient):
        """Weekly leaderboard returns empty when Redis is empty."""
        resp = await client.get("/api/v1/leaderboard/weekly")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []
        assert data["total"] == 0
        assert data["page"] == 1

    async def test_monthly_leaderboard_empty(self, client: AsyncClient):
        """Monthly leaderboard returns empty when Redis is empty."""
        resp = await client.get("/api/v1/leaderboard/monthly")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []

    async def test_alltime_leaderboard_empty(self, client: AsyncClient):
        """All-time leaderboard returns empty when Redis is empty."""
        resp = await client.get("/api/v1/leaderboard/alltime")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []

    async def test_country_leaderboard_empty(self, client: AsyncClient):
        """Country leaderboard returns empty when Redis is empty."""
        resp = await client.get("/api/v1/leaderboard/country")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []

    async def test_weekly_leaderboard_with_data(self, client: AsyncClient):
        """Weekly leaderboard returns seeded Redis data."""
        from tbg.redis_client import get_redis
        from tbg.games.week_utils import get_current_week_iso

        redis = get_redis()
        week = get_current_week_iso()
        key = f"leaderboard:weekly:{week}"

        await redis.zadd(key, {"1": 5000.0, "2": 3000.0, "3": 1000.0})

        resp = await client.get("/api/v1/leaderboard/weekly")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["entries"]) == 3
        # Verify ordering
        assert data["entries"][0]["rank"] == 1
        assert data["entries"][0]["best_difficulty"] == 5000.0
        assert data["entries"][1]["rank"] == 2
        assert data["entries"][2]["rank"] == 3

    async def test_leaderboard_pagination(self, client: AsyncClient):
        """Leaderboard supports pagination."""
        from tbg.redis_client import get_redis
        from tbg.games.week_utils import get_current_week_iso

        redis = get_redis()
        week = get_current_week_iso()
        key = f"leaderboard:weekly:{week}"

        # Seed 10 users
        for i in range(10):
            await redis.zadd(key, {str(i + 1): float((10 - i) * 1000)})

        # First page
        resp = await client.get("/api/v1/leaderboard/weekly?page=1&per_page=3")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["entries"]) == 3
        assert data["entries"][0]["rank"] == 1
        assert data["total"] == 10

        # Second page
        resp = await client.get("/api/v1/leaderboard/weekly?page=2&per_page=3")
        data = resp.json()
        assert len(data["entries"]) == 3
        assert data["entries"][0]["rank"] == 4

    async def test_leaderboard_me_requires_auth(self, client: AsyncClient):
        """GET /leaderboard/me requires authentication."""
        resp = await client.get("/api/v1/leaderboard/me")
        assert resp.status_code in (401, 403)

    async def test_leaderboard_me_authenticated(self, authed_client: AsyncClient):
        """GET /leaderboard/me returns rank data."""
        resp = await authed_client.get("/api/v1/leaderboard/me")
        assert resp.status_code == 200
        data = resp.json()
        assert "weekly" in data
        assert "monthly" in data
        assert "alltime" in data
        assert data["weekly"]["period"] == "weekly"


class TestCompetitionAPI:
    """Test competition/World Cup API endpoints."""

    async def test_list_competitions_empty(self, client: AsyncClient):
        """List competitions returns empty initially."""
        resp = await client.get("/api/v1/competitions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["competitions"] == []

    async def test_competition_not_found(self, client: AsyncClient):
        """Get nonexistent competition returns 404."""
        resp = await client.get("/api/v1/competitions/99999")
        assert resp.status_code == 404

    async def test_register_requires_auth(self, client: AsyncClient):
        """POST /competitions/{id}/register requires authentication."""
        resp = await client.post("/api/v1/competitions/1/register", json={"country_code": "US"})
        assert resp.status_code in (401, 403)

    async def test_my_team_requires_auth(self, client: AsyncClient):
        """GET /competitions/{id}/my-team requires authentication."""
        resp = await client.get("/api/v1/competitions/1/my-team")
        assert resp.status_code in (401, 403)


class TestLeagueAPI:
    """Test league API endpoints."""

    async def test_list_leagues_empty(self, client: AsyncClient):
        """List leagues returns empty initially."""
        resp = await client.get("/api/v1/leagues")
        assert resp.status_code == 200
        data = resp.json()
        assert data["leagues"] == []

    async def test_league_not_found(self, client: AsyncClient):
        """Get nonexistent league returns 404."""
        resp = await client.get("/api/v1/leagues/99999")
        assert resp.status_code == 404

    async def test_league_results_not_found(self, client: AsyncClient):
        """Get results for nonexistent league returns 404."""
        resp = await client.get("/api/v1/leagues/99999/results")
        assert resp.status_code == 404

    async def test_league_with_clubs(self, client: AsyncClient):
        """League with seeded clubs returns standings."""
        from tbg.database import get_session as _get_session
        from tbg.competition.league_service import add_club_to_league, create_league

        async for db in _get_session():
            league = await create_league(
                db,
                name="Test League",
                division=0,
                season="2026-Q1",
                start_date=datetime.now(timezone.utc),
                end_date=datetime.now(timezone.utc) + timedelta(days=90),
            )
            for i in range(4):
                club = await add_club_to_league(db, league.id, i + 1, f"Club {i + 1}")
            break

        resp = await client.get(f"/api/v1/leagues/{league.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test League"
        assert len(data["clubs"]) == 4

    async def test_league_results_empty(self, client: AsyncClient):
        """League results returns empty (cooperative matches are Phase 7)."""
        from tbg.database import get_session as _get_session
        from tbg.competition.league_service import create_league

        async for db in _get_session():
            league = await create_league(
                db,
                name="Test Results League",
                division=0,
                season="2026-Q1",
                start_date=datetime.now(timezone.utc),
                end_date=datetime.now(timezone.utc) + timedelta(days=90),
            )
            break

        resp = await client.get(f"/api/v1/leagues/{league.id}/results")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"] == []


class TestLeaderboardEntryShape:
    """Verify response shapes match frontend contract."""

    async def test_leaderboard_entry_shape(self, client: AsyncClient):
        """Leaderboard entries have all required fields."""
        from tbg.redis_client import get_redis
        from tbg.games.week_utils import get_current_week_iso

        redis = get_redis()
        week = get_current_week_iso()
        await redis.zadd(f"leaderboard:weekly:{week}", {"1": 5000.0})

        resp = await client.get("/api/v1/leaderboard/weekly")
        data = resp.json()
        entry = data["entries"][0]

        # All fields from LeaderboardEntry interface
        assert "rank" in entry
        assert "user_id" in entry
        assert "display_name" in entry
        assert "country_code" in entry
        assert "best_difficulty" in entry
        assert "total_shares" in entry
        assert "rank_change" in entry
        assert "is_current_user" in entry

    async def test_country_ranking_shape(self, client: AsyncClient):
        """Country rankings have all required fields."""
        from tbg.redis_client import get_redis
        from tbg.games.week_utils import get_current_week_iso

        redis = get_redis()
        week = get_current_week_iso()
        await redis.zadd(f"leaderboard:country:{week}", {"US": 12.4e15})

        resp = await client.get("/api/v1/leaderboard/country")
        data = resp.json()
        entry = data["entries"][0]

        assert "rank" in entry
        assert "country_code" in entry
        assert "country_name" in entry
        assert "miner_count" in entry
        assert "total_hashrate" in entry
