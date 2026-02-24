"""Integration tests: public profile privacy enforcement."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tbg.database import get_session
from tbg.db.models import User, UserSettings


class TestPublicProfile:
    """Integration: public profile privacy enforcement via API."""

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_404(self, client: AsyncClient):
        """Unknown address returns 404."""
        response = await client.get("/api/v1/users/bc1qnonexistent12345/profile")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_disabled_profile_returns_404(self, client: AsyncClient):
        """publicProfile=false → 404."""
        async for db in get_session():
            user = User(
                btc_address="bc1qprivateprofile001",
                auth_method="wallet",
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            await db.flush()

            settings = UserSettings(
                user_id=user.id,
                privacy={"publicProfile": False},
                notifications={},
                mining={},
                sound={},
                updated_at=datetime.now(timezone.utc),
            )
            db.add(settings)
            await db.commit()
            break

        response = await client.get("/api/v1/users/bc1qprivateprofile001/profile")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_enabled_profile_returns_data(self, client: AsyncClient):
        """publicProfile=true → profile data."""
        async for db in get_session():
            user = User(
                btc_address="bc1qpublicprofile001",
                display_name="PublicMiner",
                auth_method="wallet",
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            await db.flush()

            settings = UserSettings(
                user_id=user.id,
                privacy={"publicProfile": True, "showCountryFlag": False},
                notifications={},
                mining={},
                sound={},
                updated_at=datetime.now(timezone.utc),
            )
            db.add(settings)
            await db.commit()
            break

        response = await client.get("/api/v1/users/bc1qpublicprofile001/profile")
        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "PublicMiner"
        assert data["btc_address"] == "bc1qpublicprofile001"
        assert data["level"] == 1
        assert data["country_code"] is None

    @pytest.mark.asyncio
    async def test_stats_disabled_returns_404(self, client: AsyncClient):
        """publicProfile=false → stats 404."""
        async for db in get_session():
            user = User(
                btc_address="bc1qprivatestats001",
                auth_method="wallet",
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            await db.flush()

            settings = UserSettings(
                user_id=user.id,
                privacy={"publicProfile": False},
                notifications={},
                mining={},
                sound={},
                updated_at=datetime.now(timezone.utc),
            )
            db.add(settings)
            await db.commit()
            break

        response = await client.get("/api/v1/users/bc1qprivatestats001/stats")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_stats_enabled_returns_data(self, client: AsyncClient):
        """publicProfile=true → stats data."""
        async for db in get_session():
            user = User(
                btc_address="bc1qpublicstats001",
                auth_method="wallet",
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            await db.flush()

            settings = UserSettings(
                user_id=user.id,
                privacy={"publicProfile": True},
                notifications={},
                mining={},
                sound={},
                updated_at=datetime.now(timezone.utc),
            )
            db.add(settings)
            await db.commit()
            break

        response = await client.get("/api/v1/users/bc1qpublicstats001/stats")
        assert response.status_code == 200
        data = response.json()
        assert "best_difficulty" in data
        assert "total_shares" in data
        assert "badges" in data

    @pytest.mark.asyncio
    async def test_country_flag_visibility(self, client: AsyncClient):
        """showCountryFlag controls country_code visibility."""
        async for db in get_session():
            user = User(
                btc_address="bc1qcountryflag001",
                country_code="PT",
                auth_method="wallet",
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            await db.flush()

            settings = UserSettings(
                user_id=user.id,
                privacy={"publicProfile": True, "showCountryFlag": True},
                notifications={},
                mining={},
                sound={},
                updated_at=datetime.now(timezone.utc),
            )
            db.add(settings)
            await db.commit()
            break

        response = await client.get("/api/v1/users/bc1qcountryflag001/profile")
        assert response.status_code == 200
        assert response.json()["country_code"] == "PT"
