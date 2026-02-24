"""Integration tests for authentication flows."""

from httpx import AsyncClient


class TestWalletAuthFlow:
    async def test_challenge_returns_nonce_and_message(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/challenge", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 200
        data = response.json()
        assert "nonce" in data
        assert "message" in data
        assert "expires_in" in data
        assert "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" in data["message"]

    async def test_verify_without_challenge_fails(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/verify", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
            "signature": "fake_sig_base64_value",
            "nonce": "fake_nonce",
            "timestamp": "2025-01-01T00:00:00Z",
        })
        assert response.status_code == 400
        assert "expired" in response.json()["detail"].lower() or "not found" in response.json()["detail"].lower()

    async def test_verify_wrong_nonce_fails(self, client: AsyncClient):
        # Get a real challenge
        challenge = await client.post("/api/v1/auth/challenge", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        data = challenge.json()

        # Use a different nonce
        response = await client.post("/api/v1/auth/verify", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
            "signature": "fake_sig_base64_value",
            "nonce": "wrong_nonce_value",
            "timestamp": data.get("message", "").split("Timestamp: ")[-1].split("\n")[0] if "Timestamp" in data.get("message", "") else "2025-01-01T00:00:00Z",
        })
        assert response.status_code == 400


class TestTokenRefresh:
    async def test_refresh_token_rotation(
        self, client: AsyncClient, registered_email_user: dict, mock_email_service
    ):
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": registered_email_user["refresh_token"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        # New tokens should be different
        assert data["refresh_token"] != registered_email_user["refresh_token"]

    async def test_refresh_token_invalid(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": "not_a_valid_jwt_token",
        })
        assert response.status_code == 401

    async def test_old_refresh_token_rejected_after_rotation(
        self, client: AsyncClient, registered_email_user: dict, mock_email_service
    ):
        old_refresh = registered_email_user["refresh_token"]

        # First rotation succeeds
        await client.post("/api/v1/auth/refresh", json={
            "refresh_token": old_refresh,
        })

        # Second use of old token should be rejected (reuse detection)
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": old_refresh,
        })
        assert response.status_code == 401


class TestLogout:
    async def test_logout_revokes_token(
        self, client: AsyncClient, registered_email_user: dict, mock_email_service
    ):
        response = await client.post("/api/v1/auth/logout", json={
            "refresh_token": registered_email_user["refresh_token"],
        })
        assert response.status_code == 200
        assert response.json()["status"] == "logged_out"

        # Refreshing with revoked token should fail
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": registered_email_user["refresh_token"],
        })
        assert response.status_code == 401

    async def test_logout_all_sessions(
        self, authed_email_client: AsyncClient, mock_email_service
    ):
        response = await authed_email_client.post("/api/v1/auth/logout-all")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "all_sessions_revoked"

    async def test_logout_all_requires_auth(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/logout-all")
        assert response.status_code in (401, 403)
