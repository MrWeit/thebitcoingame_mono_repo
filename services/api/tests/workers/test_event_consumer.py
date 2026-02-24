"""Tests for the mining event consumer."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
import pytest_asyncio
import redis.asyncio as aioredis

from tbg.mining.consumer import CONSUMER_GROUP, MiningEventConsumer, check_worker_timeouts


@pytest_asyncio.fixture
async def consumer(redis_client: aioredis.Redis) -> MiningEventConsumer:
    """Create a consumer instance for testing."""
    c = MiningEventConsumer(
        redis_client=redis_client,
        consumer_name="test-consumer-1",
    )
    await c.setup_groups()
    return c


class TestConsumerSetup:
    """Test consumer group creation."""

    async def test_setup_creates_groups(self, redis_client: aioredis.Redis) -> None:
        """Consumer group creation is idempotent."""
        consumer = MiningEventConsumer(redis_client=redis_client, consumer_name="test")
        await consumer.setup_groups()
        # Calling again should not raise
        await consumer.setup_groups()

    async def test_busygroup_handled(self, redis_client: aioredis.Redis) -> None:
        """BUSYGROUP error (group already exists) is silently handled."""
        consumer = MiningEventConsumer(redis_client=redis_client, consumer_name="test")
        # First call creates groups
        await consumer.setup_groups()
        # Second call hits BUSYGROUP — should not raise
        await consumer.setup_groups()


class TestShareHandler:
    """Test share_submitted event handling."""

    async def test_share_updates_worker_state(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """share_submitted event updates last_share and shares_session in Redis."""
        # Publish a share event to the stream
        await redis_client.xadd(
            "mining:share_submitted",
            {
                "event": "share_submitted",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "user": "bc1qtestaddr123",
                    "worker": "bitaxe-1",
                    "sdiff": 65536,
                    "accepted": True,
                }),
            },
        )

        # Consume the event
        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 1

        # Verify worker state in Redis
        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert data["is_online"] == "1"
        assert "last_share" in data
        assert int(data["shares_session"]) >= 1

        # Verify worker is in user's worker set
        workers = await redis_client.smembers("workers:bc1qtestaddr123")
        assert "bitaxe-1" in workers

    async def test_share_increments_session_count(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """Multiple shares increment the session counter."""
        for _ in range(3):
            await redis_client.xadd(
                "mining:share_submitted",
                {
                    "event": "share_submitted",
                    "ts": "1708700000.0",
                    "source": "hosted",
                    "data": json.dumps({
                        "user": "bc1qtestaddr123",
                        "worker": "bitaxe-1",
                        "sdiff": 65536,
                        "accepted": True,
                    }),
                },
            )

        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 3

        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert int(data["shares_session"]) == 3


class TestConnectHandler:
    """Test miner_connected event handling."""

    async def test_connect_sets_online(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """miner_connected event sets worker status to online."""
        await redis_client.xadd(
            "mining:miner_connected",
            {
                "event": "miner_connected",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "user": "bc1qtestaddr123",
                    "worker": "bitaxe-1",
                    "ip": "203.0.113.42",
                    "useragent": "Bitaxe/2.0",
                    "initial_diff": 65536,
                }),
            },
        )

        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 1

        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert data["is_online"] == "1"
        assert data["ip"] == "203.0.113.42"
        assert data["useragent"] == "Bitaxe/2.0"
        assert data["current_diff"] == "65536"


class TestDisconnectHandler:
    """Test miner_disconnected event handling."""

    async def test_disconnect_sets_offline(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """miner_disconnected event sets worker status to offline."""
        # First connect the worker
        await redis_client.hset("worker:bc1qtestaddr123:bitaxe-1", mapping={"is_online": "1"})

        await redis_client.xadd(
            "mining:miner_disconnected",
            {
                "event": "miner_disconnected",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "user": "bc1qtestaddr123",
                    "worker": "bitaxe-1",
                }),
            },
        )

        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 1

        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert data["is_online"] == "0"


class TestHashrateHandler:
    """Test hashrate_update event handling."""

    async def test_hashrate_updates_worker_and_user(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """hashrate_update event updates worker and user-level hashrate."""
        # Set up worker index
        await redis_client.sadd("workers:bc1qtestaddr123", "bitaxe-1")

        await redis_client.xadd(
            "mining:hashrate_update",
            {
                "event": "hashrate_update",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "user": "bc1qtestaddr123",
                    "worker": "bitaxe-1",
                    "hashrate_1m": 500000000000,
                    "hashrate_5m": 490000000000,
                    "hashrate_1h": 495000000000,
                    "hashrate_1d": 498000000000,
                }),
            },
        )

        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 1

        # Worker level
        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert float(data["hashrate_1m"]) == 500000000000
        assert float(data["hashrate_5m"]) == 490000000000

        # User aggregate
        user_data = await redis_client.hgetall("user_hashrate:bc1qtestaddr123")
        assert float(user_data["hashrate_1m"]) == 500000000000


class TestDiffUpdateHandler:
    """Test diff_updated event handling."""

    async def test_diff_updates_worker(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """diff_updated event updates current_diff in worker hash."""
        await redis_client.xadd(
            "mining:diff_updated",
            {
                "event": "diff_updated",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "user": "bc1qtestaddr123",
                    "worker": "bitaxe-1",
                    "new_diff": 131072,
                }),
            },
        )

        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 1

        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert data["current_diff"] == "131072"


class TestNetworkBlockHandler:
    """Test new_block_network event handling."""

    async def test_network_block_caches_difficulty(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """new_block_network event caches network difficulty and height."""
        await redis_client.xadd(
            "mining:new_block_network",
            {
                "event": "new_block_network",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "height": 800000,
                    "hash": "000000000000000000abcdef",
                    "diff": 75502165623893.94,
                }),
            },
        )

        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 1

        assert await redis_client.get("network:difficulty") == "75502165623893.94"
        assert await redis_client.get("network:height") == "800000"


class TestConsumerAcks:
    """Test that consumer properly acknowledges messages."""

    async def test_acks_after_processing(
        self, redis_client: aioredis.Redis, consumer: MiningEventConsumer
    ) -> None:
        """Consumer acknowledges messages after handling them."""
        await redis_client.xadd(
            "mining:miner_connected",
            {
                "event": "miner_connected",
                "ts": "1708700000.0",
                "source": "hosted",
                "data": json.dumps({
                    "user": "bc1qtestaddr123",
                    "worker": "bitaxe-1",
                    "ip": "1.2.3.4",
                    "useragent": "test",
                    "initial_diff": 1,
                }),
            },
        )

        await consumer.consume(count=10, block_ms=100)

        # Second consume should get 0 events (already acked)
        processed = await consumer.consume(count=10, block_ms=100)
        assert processed == 0


class TestWorkerTimeouts:
    """Test worker timeout detection."""

    async def test_timeout_marks_offline(self, redis_client: aioredis.Redis) -> None:
        """Workers with old last_share are marked offline."""
        # Set up a worker with old last_share (11 minutes ago)
        from datetime import timedelta
        old_time = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
        await redis_client.hset("worker:bc1qtestaddr123:bitaxe-1", mapping={
            "is_online": "1",
            "last_share": old_time,
        })

        count = await check_worker_timeouts(redis_client, timeout_seconds=600)
        assert count == 1

        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert data["is_online"] == "0"

    async def test_recent_worker_stays_online(self, redis_client: aioredis.Redis) -> None:
        """Workers with recent last_share remain online."""
        recent_time = datetime.now(timezone.utc).isoformat()
        await redis_client.hset("worker:bc1qtestaddr123:bitaxe-1", mapping={
            "is_online": "1",
            "last_share": recent_time,
        })

        count = await check_worker_timeouts(redis_client, timeout_seconds=600)
        assert count == 0

        data = await redis_client.hgetall("worker:bc1qtestaddr123:bitaxe-1")
        assert data["is_online"] == "1"

    async def test_already_offline_not_counted(self, redis_client: aioredis.Redis) -> None:
        """Workers already offline are not counted."""
        from datetime import timedelta
        old_time = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        await redis_client.hset("worker:bc1qtestaddr123:bitaxe-1", mapping={
            "is_online": "0",
            "last_share": old_time,
        })

        count = await check_worker_timeouts(redis_client, timeout_seconds=600)
        assert count == 0
