"""Tests for password change flow."""

from httpx import AsyncClient


class TestChangePassword:
    async def test_change_password_success(
        self, authed_email_client: AsyncClient, registered_email_user: dict, mock_email_service
    ):
        response = await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": registered_email_user["password"],
            "new_password": "NewSecureP@ss2",
        })
        assert response.status_code == 200
        assert response.json()["status"] == "password_changed"

    async def test_change_password_wrong_current(
        self, authed_email_client: AsyncClient, mock_email_service
    ):
        response = await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": "WrongP@ssword1",
            "new_password": "NewSecureP@ss2",
        })
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    async def test_change_password_weak_new_password(
        self, authed_email_client: AsyncClient, registered_email_user: dict, mock_email_service
    ):
        response = await authed_email_client.post("/api/v1/auth/change-password", json={
            "current_password": registered_email_user["password"],
            "new_password": "weak",
        })
        assert response.status_code == 400
        assert "password" in response.json()["detail"].lower()

    async def test_change_password_requires_auth(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/change-password", json={
            "current_password": "OldP@ss1",
            "new_password": "NewP@ss1",
        })
        assert response.status_code in (401, 403)

    async def test_change_password_wallet_user_rejected(
        self, authed_client: AsyncClient
    ):
        response = await authed_client.post("/api/v1/auth/change-password", json={
            "current_password": "SomeP@ss1",
            "new_password": "NewP@ss1",
        })
        assert response.status_code == 400
        assert "email" in response.json()["detail"].lower()
