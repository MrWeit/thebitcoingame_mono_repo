"""Shared test fixtures."""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import close_db, get_session, init_db
from tbg.main import create_app
from tbg.redis_client import close_redis, get_redis, init_redis


def _ensure_test_keys() -> tuple[str, str]:
    """Generate RSA key pair for testing if not present."""
    # Force mainnet for tests (test addresses use bc1q...)
    os.environ["TBG_BTC_NETWORK"] = "mainnet"
    get_settings.cache_clear()

    settings = get_settings()
    private_path = settings.jwt_private_key_path
    public_path = settings.jwt_public_key_path

    if os.path.exists(private_path) and os.path.exists(public_path):
        return private_path, public_path

    # Generate keys in a temp directory
    tmpdir = tempfile.mkdtemp(prefix="tbg_test_keys_")
    private_path = os.path.join(tmpdir, "jwt_private.pem")
    public_path = os.path.join(tmpdir, "jwt_public.pem")

    os.system(f"openssl genrsa -out {private_path} 2048 2>/dev/null")  # noqa: S605
    os.system(f"openssl rsa -in {private_path} -pubout -out {public_path} 2>/dev/null")  # noqa: S605

    # Update settings to use these paths
    os.environ["TBG_JWT_PRIVATE_KEY_PATH"] = private_path
    os.environ["TBG_JWT_PUBLIC_KEY_PATH"] = public_path

    # Clear cached settings and JWT keys
    get_settings.cache_clear()
    from tbg.auth.jwt import reset_keys
    reset_keys()

    return private_path, public_path


def _ensure_migrations() -> None:
    """Ensure Alembic migrations are applied. Runs synchronously."""
    import subprocess
    import sys

    # Use the alembic from the same Python environment as the test runner
    alembic_cmd = [sys.executable, "-m", "alembic", "upgrade", "head"]
    subprocess.run(
        alembic_cmd,
        check=True,
        capture_output=True,
    )


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP test client with full app lifecycle."""
    _ensure_test_keys()
    _ensure_migrations()

    app = create_app()
    settings = get_settings()
    await init_db(settings.database_url)
    await init_redis(settings.redis_url)

    # Flush rate limit and auth keys
    redis = get_redis()
    for pattern in ["ratelimit:*", "auth:nonce:*", "login_attempts:*", "email_rate:*", "resend_cooldown:*"]:
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)

    # Dispose and recreate engine to get fresh connections with current schema
    await close_db()
    await init_db(settings.database_url)

    # Clean up test data for isolation
    from sqlalchemy import text

    async for session in get_session():
        try:
            # Truncate all user-related tables (CASCADE handles FK deps)
            await session.execute(text("TRUNCATE TABLE users CASCADE"))
            # Truncate mining data tables (may not depend on users via FK in all cases)
            for table in ["game_sessions", "lottery_results", "lottery_draws", "notifications", "badge_stats", "streak_calendar", "user_gamification", "xp_ledger", "user_badges", "activity_feed", "upcoming_events", "hashrate_snapshots", "personal_bests", "user_daily_stats", "network_difficulty", "shares", "blocks"]:
                try:
                    await session.execute(text(f"TRUNCATE TABLE {table} CASCADE"))  # noqa: S608
                except Exception:
                    pass  # Table may not exist yet
            await session.commit()
        except Exception:
            await session.rollback()
        break

    # Ensure badge definitions are seeded (may have been truncated by CASCADE)
    try:
        from tbg.gamification.seed import seed_badges
        async for session in get_session():
            await seed_badges(session)
            break
    except Exception:
        pass  # Tables may not exist yet

    # Also flush mining-related Redis keys
    for pattern in ["worker:*", "workers:*", "user_hashrate:*", "network:*", "dashboard:*", "game:*", "lottery:*"]:
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    await close_db()
    await close_redis()


@pytest_asyncio.fixture
async def redis_client() -> AsyncGenerator[object, None]:
    """Get a Redis client for testing, flush after use."""
    settings = get_settings()
    await init_redis(settings.redis_url)
    rc = get_redis()
    yield rc
    await rc.flushdb()
    await close_redis()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a direct database session for test assertions."""
    settings = get_settings()
    await init_db(settings.database_url)
    async for session in get_session():
        yield session
        break


@pytest.fixture
def mock_email_service(monkeypatch):
    """Mock the email service to prevent actual email sending."""
    mock_service = MagicMock()
    mock_service.send_template = AsyncMock(return_value=True)
    mock_service.send_email = AsyncMock(return_value=True)

    monkeypatch.setattr("tbg.auth.router.get_email_service", lambda *a, **kw: mock_service)
    return mock_service


async def _register_email_user(client: AsyncClient) -> dict:
    """Helper to register a user via email+password."""
    response = await client.post("/api/v1/auth/register", json={
        "email": "testuser@example.com",
        "password": "SecureP@ss1",
        "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    })
    data = response.json()
    return {
        "email": "testuser@example.com",
        "password": "SecureP@ss1",
        "btc_address": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
        "user_id": data.get("user", {}).get("id"),
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
    }


@pytest_asyncio.fixture
async def registered_email_user(client: AsyncClient, mock_email_service) -> dict:
    """Register a user via email+password. Returns dict with credentials and tokens."""
    return await _register_email_user(client)


@pytest_asyncio.fixture
async def authed_email_client(client: AsyncClient, registered_email_user: dict) -> AsyncClient:
    """Client authenticated via EMAIL. JWT with auth_method='email'."""
    client.headers["Authorization"] = f"Bearer {registered_email_user['access_token']}"
    return client


@pytest_asyncio.fixture
async def authed_client(client: AsyncClient) -> AsyncClient:
    """Client authenticated via WALLET (mocked — creates user and JWT directly)."""
    from tbg.auth.jwt import create_access_token
    from tbg.database import get_session as _get_session
    from tbg.auth.service import get_or_create_user

    async for db in _get_session():
        user, _ = await get_or_create_user(db, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await db.commit()
        token = create_access_token(user.id, user.btc_address, "wallet")
        client.headers["Authorization"] = f"Bearer {token}"
        return client
    return client
