"""Unit tests for privacy enforcement on public profiles."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import User, UserSettings
from tbg.social.public_profile_service import get_public_profile, get_public_stats


async def _create_user(
    db: AsyncSession,
    btc_address: str,
    display_name: str | None = None,
    country_code: str | None = None,
) -> User:
    """Create a test user."""
    user = User(
        btc_address=btc_address,
        display_name=display_name,
        country_code=country_code,
        auth_method="wallet",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def _set_privacy(
    db: AsyncSession,
    user_id: int,
    public_profile: bool = False,
    show_country_flag: bool = False,
) -> UserSettings:
    """Set user privacy settings."""
    settings = UserSettings(
        user_id=user_id,
        privacy={
            "publicProfile": public_profile,
            "showCountryFlag": show_country_flag,
        },
        notifications={},
        mining={},
        sound={},
        updated_at=datetime.now(timezone.utc),
    )
    db.add(settings)
    await db.flush()
    return settings


@pytest_asyncio.fixture
async def db(db_session: AsyncSession) -> AsyncSession:
    """Clean database for each test."""
    for table in ["user_settings"]:
        try:
            await db_session.execute(text(f"DELETE FROM {table}"))
        except Exception:
            pass
    await db_session.flush()
    yield db_session


class TestPrivacyEnforcement:
    """Test that privacy settings are enforced."""

    @pytest.mark.asyncio
    async def test_disabled_profile_returns_none(self, db: AsyncSession):
        """publicProfile=false → get_public_profile returns None."""
        user = await _create_user(db, "bc1qprivacy001xxx")
        await _set_privacy(db, user.id, public_profile=False)
        result = await get_public_profile(db, user.btc_address)
        assert result is None

    @pytest.mark.asyncio
    async def test_enabled_profile_returns_data(self, db: AsyncSession):
        """publicProfile=true → get_public_profile returns data."""
        user = await _create_user(db, "bc1qprivacy002xxx", display_name="TestMiner")
        await _set_privacy(db, user.id, public_profile=True)
        result = await get_public_profile(db, user.btc_address)
        assert result is not None
        assert result["display_name"] == "TestMiner"

    @pytest.mark.asyncio
    async def test_country_flag_hidden_when_disabled(self, db: AsyncSession):
        """showCountryFlag=false → country_code is None in public profile."""
        user = await _create_user(db, "bc1qprivacy003xxx", country_code="PT")
        await _set_privacy(db, user.id, public_profile=True, show_country_flag=False)
        result = await get_public_profile(db, user.btc_address)
        assert result is not None
        assert result["country_code"] is None

    @pytest.mark.asyncio
    async def test_country_flag_shown_when_enabled(self, db: AsyncSession):
        """showCountryFlag=true → country_code is returned."""
        user = await _create_user(db, "bc1qprivacy004xxx", country_code="BR")
        await _set_privacy(db, user.id, public_profile=True, show_country_flag=True)
        result = await get_public_profile(db, user.btc_address)
        assert result is not None
        assert result["country_code"] == "BR"

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_none(self, db: AsyncSession):
        """Unknown address → None (same as disabled, prevents enumeration)."""
        result = await get_public_profile(db, "bc1qnonexistent12345")
        assert result is None

    @pytest.mark.asyncio
    async def test_no_settings_returns_none(self, db: AsyncSession):
        """User with no settings → publicProfile defaults False → None."""
        user = await _create_user(db, "bc1qprivacy005xxx")
        result = await get_public_profile(db, user.btc_address)
        assert result is None

    @pytest.mark.asyncio
    async def test_stats_disabled_returns_none(self, db: AsyncSession):
        """publicProfile=false → get_public_stats returns None."""
        user = await _create_user(db, "bc1qprivacy006xxx")
        await _set_privacy(db, user.id, public_profile=False)
        result = await get_public_stats(db, user.btc_address)
        assert result is None

    @pytest.mark.asyncio
    async def test_stats_enabled_returns_data(self, db: AsyncSession):
        """publicProfile=true → get_public_stats returns data."""
        user = await _create_user(db, "bc1qprivacy007xxx")
        await _set_privacy(db, user.id, public_profile=True)
        result = await get_public_stats(db, user.btc_address)
        assert result is not None
        assert "best_difficulty" in result
        assert "badges" in result

    @pytest.mark.asyncio
    async def test_display_name_fallback(self, db: AsyncSession):
        """No display name → falls back to Miner-{address[:8]}."""
        user = await _create_user(db, "bc1qprivacy008xxx")
        await _set_privacy(db, user.id, public_profile=True)
        result = await get_public_profile(db, user.btc_address)
        assert result is not None
        assert result["display_name"].startswith("Miner-")
