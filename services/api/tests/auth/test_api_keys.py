"""Tests for API key management."""

from httpx import AsyncClient


class TestApiKeys:
    async def test_create_api_key(self, authed_email_client: AsyncClient, mock_email_service):
        response = await authed_email_client.post("/api/v1/users/me/api-keys", json={
            "name": "My Test Key",
            "permissions": ["read", "write"],
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "My Test Key"
        assert data["key"].startswith("sk-tbg-")
        assert data["prefix"] == data["key"][:14]
        assert data["permissions"] == ["read", "write"]

    async def test_list_api_keys(self, authed_email_client: AsyncClient, mock_email_service):
        # Create a key
        await authed_email_client.post("/api/v1/users/me/api-keys", json={
            "name": "Key For Listing",
        })

        response = await authed_email_client.get("/api/v1/users/me/api-keys")
        assert response.status_code == 200
        keys = response.json()
        assert len(keys) >= 1
        # Should NOT expose the full key
        for k in keys:
            assert "key" not in k
            assert "prefix" in k

    async def test_revoke_api_key(self, authed_email_client: AsyncClient, mock_email_service):
        # Create a key
        create_resp = await authed_email_client.post("/api/v1/users/me/api-keys", json={
            "name": "Key To Revoke",
        })
        key_id = create_resp.json()["id"]

        # Revoke it
        response = await authed_email_client.delete(f"/api/v1/users/me/api-keys/{key_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "api_key_revoked"

        # Should not appear in active list
        list_resp = await authed_email_client.get("/api/v1/users/me/api-keys")
        ids = [k["id"] for k in list_resp.json()]
        assert key_id not in ids

    async def test_revoke_nonexistent_key(self, authed_email_client: AsyncClient, mock_email_service):
        response = await authed_email_client.delete(
            "/api/v1/users/me/api-keys/00000000-0000-0000-0000-000000000000"
        )
        assert response.status_code == 404

    async def test_api_keys_require_auth(self, client: AsyncClient):
        response = await client.get("/api/v1/users/me/api-keys")
        assert response.status_code in (401, 403)

        response = await client.post("/api/v1/users/me/api-keys", json={
            "name": "Unauthed Key",
        })
        assert response.status_code in (401, 403)
