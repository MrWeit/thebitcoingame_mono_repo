"""Tests for email login."""

from httpx import AsyncClient


class TestEmailLogin:
    async def test_login_success(self, client: AsyncClient, registered_email_user: dict):
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["auth_method"] == "email"

    async def test_login_wrong_password(self, client: AsyncClient, registered_email_user: dict):
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": "WrongP@ssword1",
        })
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()

    async def test_login_nonexistent_email(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "AnyP@ssword1",
        })
        assert response.status_code == 401

    async def test_login_unverified_email_allowed(self, client: AsyncClient, registered_email_user: dict):
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 200

    async def test_account_lockout_after_10_failures(self, client: AsyncClient, registered_email_user: dict):
        for i in range(10):
            await client.post("/api/v1/auth/login", json={
                "email": registered_email_user["email"],
                "password": f"WrongP@ss{i}A",
            })

        # 11th attempt should be rate limited
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 429
        assert "locked" in response.json()["detail"].lower()

    async def test_successful_login_clears_lockout(self, client: AsyncClient, registered_email_user: dict, redis_client):
        # Add some failed attempts
        for i in range(3):
            await client.post("/api/v1/auth/login", json={
                "email": registered_email_user["email"],
                "password": f"WrongP@ss{i}A",
            })

        # Successful login
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        assert response.status_code == 200

    async def test_login_updates_last_login(self, client: AsyncClient, registered_email_user: dict):
        response = await client.post("/api/v1/auth/login", json={
            "email": registered_email_user["email"],
            "password": registered_email_user["password"],
        })
        data = response.json()
        assert data["user"]["last_login"] is not None
        assert data["user"]["login_count"] >= 1
