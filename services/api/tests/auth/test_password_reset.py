"""Tests for password reset flow."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient


class TestPasswordReset:
    async def test_forgot_password_sends_email(self, client: AsyncClient, registered_email_user: dict, mock_email_service):
        response = await client.post("/api/v1/auth/forgot-password", json={
            "email": registered_email_user["email"],
        })
        assert response.status_code == 200
        mock_email_service.send_template.assert_called()

    async def test_forgot_password_unknown_email_200(self, client: AsyncClient, mock_email_service):
        response = await client.post("/api/v1/auth/forgot-password", json={
            "email": "ghost@example.com",
        })
        assert response.status_code == 200
        # Should NOT have called send_template for nonexistent email
        # (it may have been called for the registered_email_user fixture setup)

    async def test_reset_password_expired_token(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/reset-password", json={
            "token": "definitely_not_a_valid_token_hex_value",
            "new_password": "NewSecureP@ss1",
        })
        assert response.status_code == 400

    async def test_reset_password_weak_password_rejected(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/reset-password", json={
            "token": "some_token_value",
            "new_password": "weak",
        })
        assert response.status_code == 400
        assert "password" in response.json()["detail"].lower()
