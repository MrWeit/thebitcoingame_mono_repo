"""Tests for wallet address management."""

from httpx import AsyncClient


class TestWalletManagement:
    async def test_update_wallet_success(self, authed_email_client: AsyncClient):
        response = await authed_email_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["btc_address"] == "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
        assert "previous_address" in data
        assert "warning" in data

    async def test_update_wallet_invalid_address(self, authed_email_client: AsyncClient):
        response = await authed_email_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "not_a_real_bitcoin_address_at_all",
        })
        assert response.status_code == 400

    async def test_update_wallet_requires_auth(self, client: AsyncClient):
        response = await client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        assert response.status_code in (401, 403)

    async def test_wallet_auth_user_can_update(self, authed_client: AsyncClient):
        response = await authed_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["address_type"].upper() in ("P2WPKH", "P2TR", "P2PKH")

    async def test_update_wallet_returns_address_type(self, authed_email_client: AsyncClient):
        response = await authed_email_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        })
        assert response.status_code == 200
        assert response.json()["address_type"].upper() == "P2WPKH"

    async def test_update_wallet_p2sh_rejected(self, authed_email_client: AsyncClient):
        response = await authed_email_client.patch("/api/v1/users/me/wallet", json={
            "btc_address": "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
        })
        assert response.status_code == 400
