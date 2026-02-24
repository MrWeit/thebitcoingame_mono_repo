"""Integration tests for education API endpoints — 11 test cases."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.phase8.conftest import _seed_education_data
from tbg.database import get_session


async def _get_auth_headers(client: AsyncClient) -> dict[str, str]:
    """Create a user and return auth headers."""
    from tbg.auth.jwt import create_access_token
    from tbg.auth.service import get_or_create_user

    async for db in get_session():
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()
        token = create_access_token(user.id, user.btc_address, "wallet")
        return {"Authorization": f"Bearer {token}"}
    return {}


@pytest.mark.asyncio
class TestSeedVerification:
    """Tests 1-3: Verify seed data is correct."""

    # Test 1: 4 tracks exist
    async def test_four_tracks_exist(self, client, seeded_education_db) -> None:
        result = await seeded_education_db.execute(
            text("SELECT COUNT(*) FROM education_tracks")
        )
        assert result.scalar() == 4

    # Test 2: 24 lessons exist
    async def test_24_lessons_exist(self, client, seeded_education_db) -> None:
        result = await seeded_education_db.execute(
            text("SELECT COUNT(*) FROM education_lessons")
        )
        assert result.scalar() == 24

    # Test 3: Lesson counts per track
    async def test_lesson_counts_match(self, client, seeded_education_db) -> None:
        result = await seeded_education_db.execute(text("""
            SELECT track_id, COUNT(*) as cnt
            FROM education_lessons
            GROUP BY track_id
            ORDER BY track_id
        """))
        counts = {row[0]: row[1] for row in result}
        assert counts["1"] == 5
        assert counts["2"] == 8
        assert counts["3"] == 5
        assert counts["4"] == 6


@pytest.mark.asyncio
class TestPublicEndpoints:
    """Tests 4-5: Public endpoints (no auth)."""

    # Test 4: GET /api/v1/education/tracks — no auth
    async def test_list_tracks_no_auth(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/tracks")
        assert response.status_code == 200
        data = response.json()
        assert len(data["tracks"]) == 4
        # Should not have progress fields without auth
        assert "completed_lessons" not in data["tracks"][0]

    # Test 5: GET /api/v1/education/tracks/1/lessons/1-1 — no auth
    async def test_get_lesson_no_auth(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/tracks/1/lessons/1-1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "1-1"
        assert data["title"] == "What is Mining?"
        assert "content" in data
        assert len(data["content"]) > 0

    # GET /api/v1/education/tracks/1 — track detail no auth
    async def test_get_track_detail_no_auth(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/tracks/1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "1"
        assert data["title"] == "What's Happening on My Bitaxe?"
        assert len(data["lessons"]) == 5
        # No auth — lessons should not have "completed" field
        assert "completed" not in data["lessons"][0]


@pytest.mark.asyncio
class TestAuthenticatedEndpoints:
    """Tests 6-10: Authenticated endpoints."""

    # Test 6: GET lesson with auth — interpolated content
    async def test_get_lesson_with_auth(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)
        response = await client.get(
            "/api/v1/education/tracks/1/lessons/1-1",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "1-1"
        # Content should be present (may or may not be interpolated depending on Redis)
        assert "content" in data

    # Test 7: POST complete lesson
    async def test_complete_lesson_api(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)
        response = await client.post(
            "/api/v1/education/lessons/1-1/complete",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["completed"] is True
        assert data["already_completed"] is False
        assert data["xp_awarded"] == 25

    # Test 8: Full track completion cycle
    async def test_full_track_completion(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)

        total_xp = 0
        for lesson_id in ["1-1", "1-2", "1-3", "1-4", "1-5"]:
            response = await client.post(
                f"/api/v1/education/lessons/{lesson_id}/complete",
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["completed"] is True
            total_xp += data["xp_awarded"]

        # Last lesson should trigger track completion
        assert data["track_completed"] is True
        # 5 lessons * 25 XP + 50 bonus = 175 XP total
        assert total_xp == 175

    # Test 9: GET progress
    async def test_get_progress(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)

        # Complete a lesson first
        await client.post("/api/v1/education/lessons/1-1/complete", headers=headers)

        response = await client.get("/api/v1/education/progress", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "tracks" in data
        assert data["total_lessons"] == 24
        assert data["total_completed"] >= 1

        track1 = next(t for t in data["tracks"] if t["track_id"] == "1")
        assert track1["completed_lessons"] >= 1

    # Test 10: GET recommendations
    async def test_get_recommendations(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)

        response = await client.get("/api/v1/education/recommendations", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "recommendations" in data
        assert len(data["recommendations"]) == 4  # One per track

    # GET /tracks with auth — progress-enriched response
    async def test_list_tracks_with_auth(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)
        # Complete a lesson to generate progress
        await client.post("/api/v1/education/lessons/1-1/complete", headers=headers)

        response = await client.get("/api/v1/education/tracks", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["tracks"]) == 4
        # Track 1 should have progress info
        track1 = next(t for t in data["tracks"] if t["id"] == "1")
        assert "completed_lessons" in track1
        assert track1["completed_lessons"] >= 1

    # GET track detail with auth — lessons show completion status
    async def test_get_track_detail_with_auth(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)
        await client.post("/api/v1/education/lessons/1-1/complete", headers=headers)

        response = await client.get("/api/v1/education/tracks/1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["lessons"]) == 5
        # First lesson should be completed
        assert data["lessons"][0]["completed"] is True
        # Second lesson should not be completed
        assert data["lessons"][1]["completed"] is False

    # POST complete nonexistent lesson — 404
    async def test_complete_nonexistent_lesson_api(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)
        response = await client.post(
            "/api/v1/education/lessons/99-99/complete",
            headers=headers,
        )
        assert response.status_code == 404


@pytest.mark.asyncio
class TestAuthValidation:
    """Test 11: Auth validation on protected endpoints."""

    async def test_complete_requires_auth(self, client: AsyncClient, seeded_education_db) -> None:
        """POST without auth returns 401 (or 403)."""
        response = await client.post("/api/v1/education/lessons/1-1/complete")
        assert response.status_code in (401, 403)

    async def test_progress_requires_auth(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/progress")
        assert response.status_code in (401, 403)

    async def test_recommendations_requires_auth(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/recommendations")
        assert response.status_code in (401, 403)

    async def test_404_for_nonexistent_lesson(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/tracks/1/lessons/99-99")
        assert response.status_code == 404

    async def test_404_for_nonexistent_track(self, client: AsyncClient, seeded_education_db) -> None:
        response = await client.get("/api/v1/education/tracks/999")
        assert response.status_code == 404

    # Test: Idempotent completion via API
    async def test_idempotent_completion_api(self, client: AsyncClient, seeded_education_db) -> None:
        headers = await _get_auth_headers(client)

        # Complete once
        r1 = await client.post("/api/v1/education/lessons/1-1/complete", headers=headers)
        assert r1.status_code == 200
        assert r1.json()["already_completed"] is False

        # Complete again
        r2 = await client.post("/api/v1/education/lessons/1-1/complete", headers=headers)
        assert r2.status_code == 200
        assert r2.json()["already_completed"] is True
        assert r2.json()["xp_awarded"] == 0
