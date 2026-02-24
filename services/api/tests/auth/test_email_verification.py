"""Tests for email verification flow."""

from httpx import AsyncClient


class TestEmailVerification:
    async def test_verify_email_invalid_token(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/verify-email", json={
            "token": "not_a_real_token_hex_value",
        })
        assert response.status_code == 400

    async def test_resend_verification_requires_auth(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/resend-verification")
        assert response.status_code in (401, 403, 422)

    async def test_resend_verification_sends_email(
        self, authed_email_client: AsyncClient, mock_email_service
    ):
        # Reset mock call count from registration
        mock_email_service.send_template.reset_mock()

        response = await authed_email_client.post("/api/v1/auth/resend-verification")
        assert response.status_code == 200
        mock_email_service.send_template.assert_called_once()

    async def test_resend_verification_rate_limited(
        self, authed_email_client: AsyncClient, mock_email_service
    ):
        # First request should succeed
        response = await authed_email_client.post("/api/v1/auth/resend-verification")
        assert response.status_code == 200

        # Second immediate request should be rate limited
        response = await authed_email_client.post("/api/v1/auth/resend-verification")
        assert response.status_code == 429

    async def test_resend_verification_already_verified(
        self, authed_email_client: AsyncClient, db_session, registered_email_user: dict
    ):
        # Mark user as verified
        from sqlalchemy import update
        from tbg.db.models import User

        await db_session.execute(
            update(User)
            .where(User.id == registered_email_user["user_id"])
            .values(email_verified=True)
        )
        await db_session.commit()

        response = await authed_email_client.post("/api/v1/auth/resend-verification")
        assert response.status_code == 400
        assert "already verified" in response.json()["detail"].lower()
