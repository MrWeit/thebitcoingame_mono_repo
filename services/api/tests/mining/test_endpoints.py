"""Integration tests for all 17 mining endpoints."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import get_session, init_db
from tbg.redis_client import get_redis, init_redis


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def seeded_data(authed_client: AsyncClient) -> dict:
    """Seed test data: shares, workers (Redis), blocks, personal bests."""
    settings = get_settings()
    await init_redis(settings.redis_url)
    redis_client = get_redis()
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"

    # --- Seed workers in Redis ---
    await redis_client.sadd(f"workers:{addr}", "bitaxe-1", "bitaxe-2", "bitaxe-3")
    now = datetime.now(timezone.utc).isoformat()

    for i, name in enumerate(["bitaxe-1", "bitaxe-2", "bitaxe-3"]):
        await redis_client.hset(f"worker:{addr}:{name}", mapping={
            "is_online": "1" if i < 2 else "0",
            "hashrate_1m": str(500e9 + i * 100e9),
            "hashrate_5m": str(490e9 + i * 100e9),
            "hashrate_1h": str(495e9 + i * 100e9),
            "hashrate_24h": str(498e9 + i * 100e9),
            "current_diff": str(65536 * (i + 1)),
            "last_share": now,
            "connected_at": now,
            "ip": f"203.0.113.{42 + i}",
            "useragent": f"Bitaxe/{2 + i}.0",
            "shares_session": str(100 + i * 50),
        })

    # User aggregate hashrate
    await redis_client.hset(f"user_hashrate:{addr}", mapping={
        "hashrate_1m": str(1500e9),
        "hashrate_5m": str(1470e9),
        "hashrate_1h": str(1485e9),
        "hashrate_24h": str(1494e9),
    })

    # Network difficulty cache
    await redis_client.set("network:difficulty", "75502165623893.94", ex=1200)
    await redis_client.set("network:height", "800000", ex=1200)

    # --- Seed shares in DB ---
    async for db in get_session():
        base_time = datetime.now(timezone.utc) - timedelta(hours=1)
        for i in range(50):
            t = base_time + timedelta(seconds=i * 30)
            await db.execute(
                text("""
                    INSERT INTO shares (time, btc_address, worker_name, difficulty, share_diff, is_valid, is_block, source)
                    VALUES (:time, :addr, :worker, :diff, :sdiff, :valid, :is_block, 'hosted')
                    ON CONFLICT DO NOTHING
                """),
                {
                    "time": t,
                    "addr": addr,
                    "worker": "bitaxe-1" if i % 2 == 0 else "bitaxe-2",
                    "diff": 65536.0,
                    "sdiff": float(1000 + i * 100),
                    "valid": True,
                    "is_block": i == 25,
                },
            )

        # Seed blocks
        await db.execute(
            text("""
                INSERT INTO blocks (block_height, block_hash, btc_address, reward_btc, fees_btc, difficulty, found_at, confirmed, confirmations, source)
                VALUES
                    (799999, '0000000000000000000aaa', :addr, 6.25, 0.5, 75502165623893.94, :time1, true, 100, 'hosted'),
                    (800001, '0000000000000000000bbb', :addr, 6.25, 0.3, 75502165623893.94, :time2, false, 2, 'hosted')
                ON CONFLICT DO NOTHING
            """),
            {
                "addr": addr,
                "time1": datetime.now(timezone.utc) - timedelta(days=2),
                "time2": datetime.now(timezone.utc) - timedelta(hours=1),
            },
        )

        # Get user_id
        user_result = await db.execute(
            text("SELECT id FROM users WHERE btc_address = :addr"),
            {"addr": addr},
        )
        user_row = user_result.fetchone()
        user_id = user_row[0] if user_row else None

        if user_id:
            # Seed personal bests
            now = datetime.now(timezone.utc)
            await db.execute(
                text("""
                    INSERT INTO personal_bests (user_id, timeframe, period_key, best_difficulty, share_time, worker_name, percentile, created_at, updated_at)
                    VALUES
                        (:uid, 'week', '2026-W08', 5900.0, :time, 'bitaxe-1', 85.5, :time, :time),
                        (:uid, 'month', '2026-02', 5900.0, :time, 'bitaxe-1', 82.3, :time, :time),
                        (:uid, 'alltime', NULL, 5900.0, :time, 'bitaxe-1', 78.1, :time, :time)
                    ON CONFLICT DO NOTHING
                """),
                {"uid": user_id, "time": now},
            )

            # Seed daily stats
            today = datetime.now(timezone.utc).date()
            await db.execute(
                text("""
                    INSERT INTO user_daily_stats (user_id, day, total_shares, accepted_shares, rejected_shares, best_diff, uptime_minutes, workers_seen)
                    VALUES (:uid, :day, 1200, 1180, 20, 5900.0, 720, 3)
                    ON CONFLICT DO NOTHING
                """),
                {"uid": user_id, "day": today},
            )

            # Seed hashrate snapshots
            for j in range(12):
                t = datetime.now(timezone.utc) - timedelta(minutes=j * 5)
                await db.execute(
                    text("""
                        INSERT INTO hashrate_snapshots (time, user_id, worker_name, hashrate_1m, hashrate_5m, hashrate_1h, hashrate_24h, workers_online)
                        VALUES (:time, :uid, NULL, :h1m, :h5m, :h1h, :h24h, 2)
                    """),
                    {
                        "time": t,
                        "uid": user_id,
                        "h1m": 500e9 + j * 10e9,
                        "h5m": 490e9 + j * 10e9,
                        "h1h": 495e9 + j * 10e9,
                        "h24h": 498e9 + j * 10e9,
                    },
                )

        await db.commit()
        break

    return {"addr": addr, "user_id": user_id}


# ---------------------------------------------------------------------------
# Auth requirement tests
# ---------------------------------------------------------------------------


class TestAuthRequired:
    """All mining endpoints require authentication."""

    ENDPOINTS = [
        "/api/v1/mining/workers",
        "/api/v1/mining/workers/test",
        "/api/v1/mining/workers/test/hashrate",
        "/api/v1/mining/shares",
        "/api/v1/mining/shares/stats",
        "/api/v1/mining/difficulty/bests",
        "/api/v1/mining/difficulty/scatter",
        "/api/v1/mining/difficulty/distribution",
        "/api/v1/mining/difficulty/percentile",
        "/api/v1/mining/blocks",
        "/api/v1/mining/blocks/1",
        "/api/v1/mining/hashrate",
        "/api/v1/mining/hashrate/chart",
        "/api/v1/mining/summary",
        "/api/v1/mining/uptime",
        "/api/v1/mining/network/difficulty",
        "/api/v1/mining/network/blocks",
    ]

    @pytest.mark.parametrize("endpoint", ENDPOINTS)
    async def test_requires_auth(self, client: AsyncClient, endpoint: str) -> None:
        """Endpoints return 401 or 403 without auth."""
        r = await client.get(endpoint)
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Workers
# ---------------------------------------------------------------------------


class TestWorkersEndpoints:
    """Test worker-related endpoints."""

    async def test_workers_list(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/workers returns worker list from Redis."""
        r = await authed_client.get("/api/v1/mining/workers")
        assert r.status_code == 200
        data = r.json()
        assert data["total_count"] == 3
        assert data["online_count"] == 2
        assert len(data["workers"]) == 3

    async def test_worker_detail(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/workers/{name} returns worker detail."""
        r = await authed_client.get("/api/v1/mining/workers/bitaxe-1")
        assert r.status_code == 200
        data = r.json()
        assert data["worker"]["name"] == "bitaxe-1"
        assert data["worker"]["status"] == "online"

    async def test_worker_not_found(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/workers/{name} returns 404 for unknown worker."""
        r = await authed_client.get("/api/v1/mining/workers/nonexistent")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Shares
# ---------------------------------------------------------------------------


class TestSharesEndpoints:
    """Test share-related endpoints."""

    async def test_shares_paginated(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/shares returns cursor-paginated shares."""
        r = await authed_client.get("/api/v1/mining/shares?limit=10")
        assert r.status_code == 200
        data = r.json()
        assert len(data["data"]) == 10
        assert data["pagination"]["limit"] == 10
        assert data["pagination"]["has_more"] is True
        assert data["pagination"]["next_cursor"] is not None

    async def test_shares_second_page(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """Cursor pagination works for second page."""
        r1 = await authed_client.get("/api/v1/mining/shares?limit=10")
        cursor = r1.json()["pagination"]["next_cursor"]

        r2 = await authed_client.get(f"/api/v1/mining/shares?limit=10&cursor={cursor}")
        assert r2.status_code == 200
        data = r2.json()
        assert len(data["data"]) == 10

        # No overlap
        page1_times = {s["time"] for s in r1.json()["data"]}
        page2_times = {s["time"] for s in data["data"]}
        assert page1_times.isdisjoint(page2_times)

    async def test_shares_stats(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/shares/stats returns aggregate statistics."""
        r = await authed_client.get("/api/v1/mining/shares/stats")
        assert r.status_code == 200
        data = r.json()
        assert data["total_shares"] >= 50
        assert data["accepted_shares"] >= 49  # One block share
        assert 0 <= data["acceptance_rate"] <= 100


# ---------------------------------------------------------------------------
# Difficulty
# ---------------------------------------------------------------------------


class TestDifficultyEndpoints:
    """Test difficulty-related endpoints."""

    async def test_difficulty_bests(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/difficulty/bests returns personal bests."""
        r = await authed_client.get("/api/v1/mining/difficulty/bests")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 3
        timeframes = {d["timeframe"] for d in data}
        assert timeframes == {"week", "month", "alltime"}

    async def test_difficulty_scatter(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/difficulty/scatter returns scatter plot data."""
        r = await authed_client.get("/api/v1/mining/difficulty/scatter?limit=20")
        assert r.status_code == 200
        data = r.json()
        assert len(data["points"]) <= 20
        assert data["count"] == len(data["points"])

    async def test_difficulty_distribution(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/difficulty/distribution returns histogram."""
        r = await authed_client.get("/api/v1/mining/difficulty/distribution")
        assert r.status_code == 200
        data = r.json()
        assert data["total_shares"] > 0
        assert len(data["buckets"]) == 8

    async def test_difficulty_percentile(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/difficulty/percentile returns percentile rank."""
        r = await authed_client.get("/api/v1/mining/difficulty/percentile?timeframe=week")
        assert r.status_code == 200
        data = r.json()
        assert data["timeframe"] == "week"
        assert 0 <= data["percentile"] <= 100
        assert data["total_miners"] >= 1

    async def test_difficulty_percentile_not_found(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/difficulty/percentile returns 404 if no personal best."""
        # Delete personal bests first
        async for db in get_session():
            await db.execute(text("DELETE FROM personal_bests"))
            await db.commit()
            break

        r = await authed_client.get("/api/v1/mining/difficulty/percentile?timeframe=week")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------


class TestBlocksEndpoints:
    """Test block-related endpoints."""

    async def test_blocks_list(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/blocks returns blocks found."""
        r = await authed_client.get("/api/v1/mining/blocks")
        assert r.status_code == 200
        data = r.json()
        assert len(data["data"]) >= 2
        assert data["pagination"]["limit"] == 20

    async def test_block_detail(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/blocks/{height} returns block detail."""
        r = await authed_client.get("/api/v1/mining/blocks/799999")
        assert r.status_code == 200
        data = r.json()
        assert data["block"]["block_height"] == 799999
        assert data["block"]["confirmed"] is True

    async def test_block_not_found(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/blocks/{height} returns 404 for unknown block."""
        r = await authed_client.get("/api/v1/mining/blocks/999999")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Hashrate
# ---------------------------------------------------------------------------


class TestHashrateEndpoints:
    """Test hashrate-related endpoints."""

    async def test_hashrate_summary(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/hashrate returns current hashrate summary."""
        r = await authed_client.get("/api/v1/mining/hashrate")
        assert r.status_code == 200
        data = r.json()
        assert data["hashrate_1m"] > 0
        assert data["workers_online"] == 2

    async def test_hashrate_chart_24h(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/hashrate/chart?window=24h returns time series."""
        r = await authed_client.get("/api/v1/mining/hashrate/chart?window=24h")
        assert r.status_code == 200
        data = r.json()
        assert data["window"] == "24h"
        assert len(data["points"]) >= 1
        assert data["current"] > 0

    async def test_hashrate_chart_invalid_window(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """Invalid window parameter returns 422."""
        r = await authed_client.get("/api/v1/mining/hashrate/chart?window=invalid")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class TestSummaryEndpoint:
    """Test mining summary endpoint."""

    async def test_mining_summary(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/summary returns dashboard summary."""
        r = await authed_client.get("/api/v1/mining/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["hashrate_1h"] > 0
        assert data["workers_online"] == 2
        assert data["workers_total"] == 3
        assert data["blocks_found"] >= 2


# ---------------------------------------------------------------------------
# Uptime
# ---------------------------------------------------------------------------


class TestUptimeEndpoint:
    """Test uptime calendar endpoint."""

    async def test_uptime_calendar(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/uptime returns 30-day calendar."""
        r = await authed_client.get("/api/v1/mining/uptime?days=30")
        assert r.status_code == 200
        data = r.json()
        assert len(data["days"]) == 30
        assert data["days_active"] >= 1


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------


class TestNetworkEndpoints:
    """Test network-related endpoints."""

    async def test_network_difficulty(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/network/difficulty returns difficulty info."""
        r = await authed_client.get("/api/v1/mining/network/difficulty")
        assert r.status_code == 200
        data = r.json()
        assert data["current_difficulty"] > 0
        assert data["current_height"] == 800000

    async def test_network_blocks(self, authed_client: AsyncClient, seeded_data: dict) -> None:
        """GET /mining/network/blocks returns recent network blocks."""
        r = await authed_client.get("/api/v1/mining/network/blocks")
        assert r.status_code == 200
        data = r.json()
        assert "blocks" in data
