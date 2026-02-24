"""Integration tests: cooperative lifecycle via API."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tbg.auth.jwt import create_access_token
from tbg.auth.service import get_or_create_user
from tbg.database import get_session


async def _create_authed_client(client: AsyncClient, btc_address: str) -> tuple[AsyncClient, dict]:
    """Create an authenticated user and return the client + user info."""
    async for db in get_session():
        user, _ = await get_or_create_user(db, btc_address)
        await db.commit()
        token = create_access_token(user.id, user.btc_address, "wallet")
        # Return a dict with auth info — use same transport
        return client, {"token": token, "user_id": user.id, "btc_address": btc_address}
    raise RuntimeError("Failed to get DB session")


class TestCooperativeLifecycle:
    """Integration: create → join → stats → leave."""

    @pytest.mark.asyncio
    async def test_create_cooperative(self, authed_client: AsyncClient):
        """Create a cooperative and verify response."""
        response = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Test Miners",
            "motto": "Mining together",
        })
        assert response.status_code == 201
        coop = response.json()
        assert coop["name"] == "Test Miners"
        assert coop["motto"] == "Mining together"
        assert coop["member_count"] == 1
        assert len(coop["invite_code"]) == 8
        assert len(coop["members"]) == 1
        assert coop["members"][0]["role"] == "admin"

    @pytest.mark.asyncio
    async def test_list_cooperatives(self, authed_client: AsyncClient):
        """List cooperatives endpoint works."""
        # Create a coop first
        await authed_client.post("/api/v1/cooperatives", json={
            "name": "List Test Coop",
        })

        response = await authed_client.get("/api/v1/cooperatives")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["cooperatives"]) >= 1

    @pytest.mark.asyncio
    async def test_get_cooperative_detail(self, authed_client: AsyncClient):
        """Get cooperative detail with members."""
        create_resp = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Detail Test Coop",
        })
        coop_id = create_resp.json()["id"]

        response = await authed_client.get(f"/api/v1/cooperatives/{coop_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Detail Test Coop"
        assert len(data["members"]) == 1

    @pytest.mark.asyncio
    async def test_update_cooperative(self, authed_client: AsyncClient):
        """Update cooperative name and motto."""
        create_resp = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Old Name",
            "motto": "Old motto",
        })
        coop_id = create_resp.json()["id"]

        response = await authed_client.put(f"/api/v1/cooperatives/{coop_id}", json={
            "name": "New Name",
            "motto": "New motto",
        })
        assert response.status_code == 200
        assert response.json()["name"] == "New Name"
        assert response.json()["motto"] == "New motto"

    @pytest.mark.asyncio
    async def test_regenerate_invite_code(self, authed_client: AsyncClient):
        """Regenerate invite code returns a new code."""
        create_resp = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Regen Code Coop",
        })
        coop = create_resp.json()
        old_code = coop["invite_code"]

        response = await authed_client.post(
            f"/api/v1/cooperatives/{coop['id']}/regenerate-code"
        )
        assert response.status_code == 200
        new_code = response.json()["invite_code"]
        assert len(new_code) == 8
        assert new_code != old_code

    @pytest.mark.asyncio
    async def test_coop_stats(self, authed_client: AsyncClient):
        """Get cooperative stats endpoint."""
        create_resp = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Stats Test Coop",
        })
        coop_id = create_resp.json()["id"]

        response = await authed_client.get(f"/api/v1/cooperatives/{coop_id}/stats")
        assert response.status_code == 200
        stats = response.json()
        assert "combined_hashrate" in stats
        assert "member_count" in stats
        assert stats["member_count"] == 1

    @pytest.mark.asyncio
    async def test_leave_cooperative(self, authed_client: AsyncClient):
        """Leave cooperative endpoint."""
        await authed_client.post("/api/v1/cooperatives", json={
            "name": "Leave Test Coop",
        })

        response = await authed_client.post("/api/v1/cooperatives/leave")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_dissolve_cooperative(self, authed_client: AsyncClient):
        """Dissolve cooperative (admin, empty coop)."""
        create_resp = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Dissolve Test Coop",
        })
        coop_id = create_resp.json()["id"]

        response = await authed_client.delete(f"/api/v1/cooperatives/{coop_id}")
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_duplicate_name_rejected(self, authed_client: AsyncClient):
        """Creating a cooperative with an existing name fails."""
        await authed_client.post("/api/v1/cooperatives", json={
            "name": "Unique Name",
        })
        # Leave so we can create another
        await authed_client.post("/api/v1/cooperatives/leave")

        response = await authed_client.post("/api/v1/cooperatives", json={
            "name": "unique name",  # Case-insensitive
        })
        assert response.status_code == 400
        assert "name already exists" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_cannot_create_while_in_coop(self, authed_client: AsyncClient):
        """User already in a cooperative cannot create another."""
        await authed_client.post("/api/v1/cooperatives", json={
            "name": "First Coop Here",
        })

        response = await authed_client.post("/api/v1/cooperatives", json={
            "name": "Second Coop Here",
        })
        assert response.status_code == 400
        assert "already a member" in response.json()["detail"]
