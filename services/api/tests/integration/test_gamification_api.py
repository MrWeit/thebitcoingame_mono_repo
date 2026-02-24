"""Integration tests for gamification API endpoints."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tbg.gamification.seed import BADGE_SEED_DATA


class TestBadgesEndpoints:
    """Test /badges endpoints (public)."""

    @pytest.mark.asyncio
    async def test_list_badges(self, client: AsyncClient):
        response = await client.get("/api/v1/badges")
        assert response.status_code == 200
        data = response.json()
        assert "badges" in data
        assert len(data["badges"]) == 20

    @pytest.mark.asyncio
    async def test_badges_have_correct_fields(self, client: AsyncClient):
        response = await client.get("/api/v1/badges")
        badge = response.json()["badges"][0]
        assert "slug" in badge
        assert "name" in badge
        assert "description" in badge
        assert "category" in badge
        assert "rarity" in badge
        assert "xp_reward" in badge
        assert "total_earned" in badge
        assert "percentage" in badge

    @pytest.mark.asyncio
    async def test_badge_slugs_match_frontend(self, client: AsyncClient):
        response = await client.get("/api/v1/badges")
        slugs = {b["slug"] for b in response.json()["badges"]}
        expected_slugs = {b["slug"] for b in BADGE_SEED_DATA}
        assert slugs == expected_slugs

    @pytest.mark.asyncio
    async def test_get_badge_by_slug(self, client: AsyncClient):
        response = await client.get("/api/v1/badges/first_share")
        assert response.status_code == 200
        data = response.json()
        assert data["slug"] == "first_share"
        assert data["name"] == "First Hash"
        assert data["rarity"] == "common"
        assert data["xp_reward"] == 50
        assert "recent_earners" in data

    @pytest.mark.asyncio
    async def test_get_badge_not_found(self, client: AsyncClient):
        response = await client.get("/api/v1/badges/nonexistent")
        assert response.status_code == 404


class TestLevelsEndpoint:
    """Test /levels endpoint (public)."""

    @pytest.mark.asyncio
    async def test_list_levels(self, client: AsyncClient):
        response = await client.get("/api/v1/levels")
        assert response.status_code == 200
        data = response.json()
        assert "levels" in data
        assert len(data["levels"]) == 15

    @pytest.mark.asyncio
    async def test_level_thresholds_correct(self, client: AsyncClient):
        response = await client.get("/api/v1/levels")
        levels = response.json()["levels"]
        assert levels[0]["level"] == 1
        assert levels[0]["title"] == "Nocoiner"
        assert levels[0]["cumulative"] == 0
        assert levels[-1]["level"] == 50
        assert levels[-1]["title"] == "Timechain Guardian"
        assert levels[-1]["cumulative"] == 4929600


class TestAuthenticatedEndpoints:
    """Test authenticated gamification endpoints."""

    @pytest.mark.asyncio
    async def test_my_badges_empty(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/badges")
        assert response.status_code == 200
        data = response.json()
        assert data["earned"] == []
        assert data["total_available"] == 20
        assert data["total_earned"] == 0

    @pytest.mark.asyncio
    async def test_my_xp_initial(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/xp")
        assert response.status_code == 200
        data = response.json()
        assert data["total_xp"] == 0
        assert data["level"] == 1
        assert data["level_title"] == "Nocoiner"

    @pytest.mark.asyncio
    async def test_xp_history_empty(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/xp/history")
        assert response.status_code == 200
        data = response.json()
        assert data["entries"] == []
        assert data["total"] == 0
        assert data["page"] == 1

    @pytest.mark.asyncio
    async def test_xp_history_pagination_params(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/xp/history?page=2&per_page=10")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2
        assert data["per_page"] == 10

    @pytest.mark.asyncio
    async def test_my_streak_initial(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/streak")
        assert response.status_code == 200
        data = response.json()
        assert data["current_streak"] == 0
        assert data["longest_streak"] == 0
        assert data["is_active_this_week"] is False

    @pytest.mark.asyncio
    async def test_streak_calendar_empty(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/streak/calendar")
        assert response.status_code == 200
        data = response.json()
        assert data["weeks"] == []

    @pytest.mark.asyncio
    async def test_gamification_summary(self, authed_client: AsyncClient):
        response = await authed_client.get("/api/v1/users/me/gamification")
        assert response.status_code == 200
        data = response.json()
        assert "xp" in data
        assert "streak" in data
        assert "badges" in data
        assert "stats" in data
        assert data["xp"]["total_xp"] == 0
        assert data["xp"]["level"] == 1
        assert data["badges"]["earned"] == 0
        assert data["badges"]["total"] == 20
        assert data["stats"]["total_shares"] == 0

    @pytest.mark.asyncio
    async def test_unauthenticated_my_badges(self, client: AsyncClient):
        response = await client.get("/api/v1/users/me/badges")
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_unauthenticated_my_xp(self, client: AsyncClient):
        response = await client.get("/api/v1/users/me/xp")
        assert response.status_code in (401, 403)
