"""Tests for email registration."""

import pytest
from httpx import AsyncClient


class TestEmailRegistration:
    async def test_register_success(self, client: AsyncClient, mock_email_service):
        response = await client.post("/api/v1/auth/register", json={
            "email": "miner@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "miner@example.com"
        assert data["user"]["btc_address"] == "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
        assert data["user"]["auth_method"] == "email"

    async def test_register_duplicate_email_rejected(self, client: AsyncClient, mock_email_service):
        payload = {
            "email": "duplicate@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        }
        await client.post("/api/v1/auth/register", json=payload)
        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 409

    async def test_register_missing_wallet_address(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/register", json={
            "email": "nowallet@example.com",
            "password": "SecureP@ss1",
        })
        assert response.status_code == 422

    async def test_register_invalid_wallet_address(self, client: AsyncClient, mock_email_service):
        response = await client.post("/api/v1/auth/register", json={
            "email": "badwallet@example.com",
            "password": "SecureP@ss1",
            "btc_address": "not_a_real_address",
        })
        assert response.status_code == 400 or response.status_code == 422

    async def test_register_weak_password_rejected(self, client: AsyncClient, mock_email_service):
        response = await client.post("/api/v1/auth/register", json={
            "email": "weakpass@example.com",
            "password": "short",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 400
        assert "password" in response.json()["detail"].lower()

    async def test_register_sends_verification_email(self, client: AsyncClient, mock_email_service):
        await client.post("/api/v1/auth/register", json={
            "email": "verify@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        mock_email_service.send_template.assert_called_once()

    async def test_register_returns_tokens(self, client: AsyncClient, mock_email_service):
        response = await client.post("/api/v1/auth/register", json={
            "email": "tokens@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 3600

    async def test_register_email_case_insensitive(self, client: AsyncClient, mock_email_service):
        await client.post("/api/v1/auth/register", json={
            "email": "CasE@Example.COM",
            "password": "SecureP@ss1",
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        response = await client.post("/api/v1/auth/register", json={
            "email": "case@example.com",
            "password": "SecureP@ss1",
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        assert response.status_code == 409
