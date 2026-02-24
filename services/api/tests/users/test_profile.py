"""Tests for user profile and settings management."""

from httpx import AsyncClient


class TestProfile:
    async def test_get_own_profile(self, authed_email_client: AsyncClient, mock_email_service):
        response = await authed_email_client.get("/api/v1/users/me")
        assert response.status_code == 200
        data = response.json()
        assert "btc_address" in data
        assert data["auth_method"] == "email"

    async def test_update_display_name(self, authed_email_client: AsyncClient, mock_email_service):
        response = await authed_email_client.patch("/api/v1/users/me", json={
            "display_name": "TestMiner",
        })
        assert response.status_code == 200
        assert response.json()["display_name"] == "TestMiner"

    async def test_update_bio(self, authed_email_client: AsyncClient, mock_email_service):
        response = await authed_email_client.patch("/api/v1/users/me", json={
            "bio": "Mining since 2024",
        })
        assert response.status_code == 200
        assert response.json()["bio"] == "Mining since 2024"

    async def test_profile_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/v1/users/me")
        assert response.status_code in (401, 403)

    async def test_public_profile_by_address(
        self, client: AsyncClient, registered_email_user: dict, mock_email_service
    ):
        address = registered_email_user["btc_address"]
        response = await client.get(f"/api/v1/users/{address}")
        assert response.status_code == 200
        data = response.json()
        assert data["btc_address"] == address
        # Should not expose private fields
        assert "email" not in data
        assert "password_hash" not in data

    async def test_public_profile_not_found(self, client: AsyncClient):
        response = await client.get("/api/v1/users/bc1qnonexistentaddressplaceholder00")
        assert response.status_code == 404


class TestSettings:
    async def test_get_settings(self, authed_email_client: AsyncClient, mock_email_service):
        response = await authed_email_client.get("/api/v1/users/me/settings")
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "privacy" in data
        assert "mining" in data
        assert "sound" in data

    async def test_update_settings_deep_merge(self, authed_email_client: AsyncClient, mock_email_service):
        # Set initial value
        await authed_email_client.patch("/api/v1/users/me/settings", json={
            "notifications": {"email": True, "push": True},
        })

        # Deep merge should preserve existing keys
        response = await authed_email_client.patch("/api/v1/users/me/settings", json={
            "notifications": {"push": False},
        })
        assert response.status_code == 200
        data = response.json()
        # email should still be True, push should be False
        assert data["notifications"]["push"] is False
        assert data["notifications"].get("email") is True

    async def test_settings_require_auth(self, client: AsyncClient):
        response = await client.get("/api/v1/users/me/settings")
        assert response.status_code in (401, 403)
