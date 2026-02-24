"""Integration tests for the Games & Lottery API endpoints."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import LotteryDraw, LotteryResult, User, WeeklyBestDiff


@pytest.mark.asyncio
class TestGamesWeeklyEndpoint:
    """GET /api/v1/games/weekly — current week's game data."""

    async def test_returns_correct_shape(self, authed_client: AsyncClient):
        """Response includes all required fields."""
        response = await authed_client.get("/api/v1/games/weekly")
        assert response.status_code == 200
        data = response.json()

        # Verify all fields from frontend WeeklyGameData interface
        assert "best_difficulty" in data
        assert "daily_best_diffs" in data
        assert set(data["daily_best_diffs"].keys()) == {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
        assert "weekly_rank" in data
        assert "percentile" in data
        assert "progress_ratio" in data
        assert "total_shares" in data
        assert "block_found" in data
        assert "user_name" in data
        assert "network_difficulty" in data
        assert "week_start" in data
        assert "week_end" in data
        assert "best_hash" in data

    async def test_zero_data_for_new_user(self, authed_client: AsyncClient):
        """New user with no shares gets zeroed data."""
        response = await authed_client.get("/api/v1/games/weekly")
        assert response.status_code == 200
        data = response.json()

        assert data["best_difficulty"] == 0
        assert data["total_shares"] == 0
        assert data["weekly_rank"] == 0
        assert all(v == 0 for v in data["daily_best_diffs"].values())
        assert data["block_found"] is False

    async def test_requires_auth(self, client: AsyncClient):
        """Unauthenticated request should return 403."""
        response = await client.get("/api/v1/games/weekly")
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
class TestGamePlayEndpoint:
    """POST /api/v1/games/play — record game session."""

    async def test_record_hammer_game(self, authed_client: AsyncClient):
        """Record a hammer game session."""
        response = await authed_client.post(
            "/api/v1/games/play",
            json={"game_type": "hammer", "metadata": {"score": 85}},
        )
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["session_id"] > 0

    async def test_record_all_game_types(self, authed_client: AsyncClient):
        """All 4 game types should be accepted."""
        for game_type in ["hammer", "horse_race", "slot_machine", "scratch_card"]:
            response = await authed_client.post(
                "/api/v1/games/play",
                json={"game_type": game_type},
            )
            assert response.status_code == 200

    async def test_invalid_game_type(self, authed_client: AsyncClient):
        """Invalid game type should be rejected."""
        response = await authed_client.post(
            "/api/v1/games/play",
            json={"game_type": "invalid_game"},
        )
        assert response.status_code == 400

    async def test_requires_auth(self, client: AsyncClient):
        """Unauthenticated request should return 403."""
        response = await client.post(
            "/api/v1/games/play",
            json={"game_type": "hammer"},
        )
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
class TestLotteryCurrentEndpoint:
    """GET /api/v1/lottery/current — current week status."""

    async def test_returns_current_status(self, authed_client: AsyncClient):
        """Should return open status for current week."""
        response = await authed_client.get("/api/v1/lottery/current")
        assert response.status_code == 200
        data = response.json()

        assert "week_iso" in data
        assert "status" in data
        assert "total_participants" in data
        assert "your_rank" in data
        assert "your_percentile" in data

    async def test_requires_auth(self, client: AsyncClient):
        """Unauthenticated request should return 403."""
        response = await client.get("/api/v1/lottery/current")
        assert response.status_code in (401, 403)


@pytest.mark.asyncio
class TestLotteryStatsEndpoint:
    """GET /api/v1/lottery/stats — overall statistics."""

    async def test_returns_stats_with_no_draws(self, client: AsyncClient):
        """Should return zero stats when no draws exist."""
        response = await client.get("/api/v1/lottery/stats")
        assert response.status_code == 200
        data = response.json()

        assert data["total_draws"] == 0
        assert data["total_participants_all_time"] == 0

    async def test_stats_response_shape(self, client: AsyncClient):
        """Verify all stat fields are present."""
        response = await client.get("/api/v1/lottery/stats")
        assert response.status_code == 200
        data = response.json()

        assert "total_draws" in data
        assert "total_participants_all_time" in data
        assert "average_participants_per_draw" in data
        assert "average_best_diff" in data
        assert "highest_winning_diff" in data
        assert "most_recent_draw" in data


@pytest.mark.asyncio
class TestLotteryResultsEndpoint:
    """GET /api/v1/lottery/results — latest completed results."""

    async def test_404_when_no_draws(self, client: AsyncClient):
        """Should 404 when no completed draws exist."""
        response = await client.get("/api/v1/lottery/results")
        assert response.status_code == 404


@pytest.mark.asyncio
class TestLotteryWeekResultsEndpoint:
    """GET /api/v1/lottery/results/{week} — specific week results."""

    async def test_404_for_nonexistent_week(self, client: AsyncClient):
        """Should 404 for a week with no draw."""
        response = await client.get("/api/v1/lottery/results/2099-W01")
        assert response.status_code == 404


@pytest.mark.asyncio
class TestGameHistoryEndpoint:
    """GET /api/v1/games/history — past weeks' results."""

    async def test_empty_history_for_new_user(self, authed_client: AsyncClient):
        """New user should have empty history."""
        response = await authed_client.get("/api/v1/games/history")
        assert response.status_code == 200
        data = response.json()

        assert data["weeks"] == []
        assert data["total"] == 0
        assert data["page"] == 1

    async def test_requires_auth(self, client: AsyncClient):
        """Unauthenticated request should return 403."""
        response = await client.get("/api/v1/games/history")
        assert response.status_code in (401, 403)

    async def test_pagination_params(self, authed_client: AsyncClient):
        """Should accept pagination parameters."""
        response = await authed_client.get("/api/v1/games/history?page=1&per_page=5")
        assert response.status_code == 200
        data = response.json()
        assert data["per_page"] == 5
