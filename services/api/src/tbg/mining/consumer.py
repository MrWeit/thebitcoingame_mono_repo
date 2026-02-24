"""Redis Stream consumer for mining events.

Reads from 8 mining event streams using XREADGROUP with consumer group
'tbg-api-consumers'. Processes events to update Redis worker state,
personal bests, and daily stats.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CONSUMER_GROUP = "tbg-api-consumers"

STREAM_HANDLERS: dict[str, str] = {
    "mining:share_submitted": "_handle_share",
    "mining:block_found": "_handle_block",
    "mining:miner_connected": "_handle_connect",
    "mining:miner_disconnected": "_handle_disconnect",
    "mining:diff_updated": "_handle_diff_update",
    "mining:hashrate_update": "_handle_hashrate",
    "mining:new_block_network": "_handle_network_block",
    "mining:share_best_diff": "_handle_best_diff",
}


class MiningEventConsumer:
    """Processes mining events from Redis Streams."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: object | None = None,
        consumer_name: str = "api-worker-1",
    ) -> None:
        self.redis = redis_client
        self.db_session_factory = db_session_factory
        self.consumer_name = consumer_name
        self._running = False
        self._processed = 0
        self._errors = 0

    async def setup_groups(self) -> None:
        """Create consumer groups for all streams (idempotent)."""
        for stream in STREAM_HANDLERS:
            try:
                await self.redis.xgroup_create(stream, CONSUMER_GROUP, id="0", mkstream=True)
                logger.info("Created consumer group for %s", stream)
            except aioredis.ResponseError as e:
                if "BUSYGROUP" in str(e):
                    pass  # Group already exists
                else:
                    raise

    async def consume(self, count: int = 100, block_ms: int = 5000) -> int:
        """Read and process a batch of events from all streams.

        Returns:
            Number of events processed.
        """
        streams = {s: ">" for s in STREAM_HANDLERS}
        try:
            events = await self.redis.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=self.consumer_name,
                streams=streams,
                count=count,
                block=block_ms,
            )
        except aioredis.ResponseError as e:
            logger.error("XREADGROUP error: %s", e)
            return 0

        if not events:
            return 0

        processed = 0
        for stream_name, messages in events:
            stream_str = stream_name if isinstance(stream_name, str) else stream_name.decode()
            handler_name = STREAM_HANDLERS.get(stream_str)
            if handler_name is None:
                continue

            handler = getattr(self, handler_name)
            for msg_id, data in messages:
                try:
                    await handler(data)
                    await self.redis.xack(stream_str, CONSUMER_GROUP, msg_id)
                    processed += 1
                    self._processed += 1
                except Exception:
                    self._errors += 1
                    logger.exception("Error handling %s message %s", stream_str, msg_id)

        return processed

    async def run(self) -> None:
        """Main consumer loop — runs continuously."""
        await self.setup_groups()
        self._running = True
        logger.info("Mining event consumer started (consumer=%s)", self.consumer_name)

        while self._running:
            try:
                await self.consume()
            except Exception:
                logger.exception("Consumer loop error")
                import asyncio
                await asyncio.sleep(1)

    def stop(self) -> None:
        """Signal the consumer to stop."""
        self._running = False

    # --- Event Handlers ---

    def _parse_data(self, data: dict[str, str]) -> dict:
        """Parse event data field (JSON string or flat dict)."""
        raw = data.get("data", "{}")
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {}
        return dict(raw)

    async def _handle_share(self, data: dict[str, str]) -> None:
        """Process share_submitted event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = parsed.get("worker", "")
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        now = datetime.now(timezone.utc).isoformat()

        pipe = self.redis.pipeline()
        pipe.hset(key, mapping={
            "is_online": "1",
            "last_share": now,
        })
        pipe.hincrby(key, "shares_session", 1)
        pipe.sadd(f"workers:{user}", worker)
        # Publish for real-time WebSocket feed
        pipe.publish(f"ws:user:{user}", json.dumps({
            "type": "share",
            "worker": worker,
            "diff": parsed.get("sdiff", 0),
            "accepted": parsed.get("accepted", True),
            "time": now,
        }))
        await pipe.execute()

    async def _handle_block(self, data: dict[str, str]) -> None:
        """Process block_found event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        height = parsed.get("height", 0)

        # Publish global block notification
        await self.redis.publish("blocks:found", json.dumps({
            "type": "block_found",
            "user": user,
            "height": height,
            "hash": parsed.get("hash", ""),
            "reward": parsed.get("reward_sats", 0),
        }))

    async def _handle_connect(self, data: dict[str, str]) -> None:
        """Process miner_connected event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = parsed.get("worker", "")
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        now = datetime.now(timezone.utc).isoformat()

        pipe = self.redis.pipeline()
        pipe.hset(key, mapping={
            "is_online": "1",
            "connected_at": now,
            "ip": parsed.get("ip", ""),
            "useragent": parsed.get("useragent", ""),
            "current_diff": str(parsed.get("initial_diff", 0)),
            "shares_session": "0",
        })
        pipe.sadd(f"workers:{user}", worker)
        await pipe.execute()

    async def _handle_disconnect(self, data: dict[str, str]) -> None:
        """Process miner_disconnected event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = parsed.get("worker", "")
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        await self.redis.hset(key, "is_online", "0")

    async def _handle_diff_update(self, data: dict[str, str]) -> None:
        """Process diff_updated event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = parsed.get("worker", "")
        new_diff = parsed.get("new_diff", 0)
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        await self.redis.hset(key, "current_diff", str(new_diff))

    async def _handle_hashrate(self, data: dict[str, str]) -> None:
        """Process hashrate_update event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = parsed.get("worker", "")
        if not user or not worker:
            return

        # Update worker-level hashrate
        key = f"worker:{user}:{worker}"
        await self.redis.hset(key, mapping={
            "hashrate_1m": str(parsed.get("hashrate_1m", 0)),
            "hashrate_5m": str(parsed.get("hashrate_5m", 0)),
            "hashrate_1h": str(parsed.get("hashrate_1h", 0)),
            "hashrate_24h": str(parsed.get("hashrate_1d", 0)),
        })

        # Aggregate user-level hashrate from all workers
        worker_names: set[str] = await self.redis.smembers(f"workers:{user}")  # type: ignore[assignment]
        total = {"hashrate_1m": 0.0, "hashrate_5m": 0.0, "hashrate_1h": 0.0, "hashrate_24h": 0.0}
        for wn in worker_names:
            wdata: dict[str, str] = await self.redis.hgetall(f"worker:{user}:{wn}")  # type: ignore[assignment]
            for field in total:
                total[field] += float(wdata.get(field, 0))

        await self.redis.hset(f"user_hashrate:{user}", mapping={
            k: str(v) for k, v in total.items()
        })

    async def _handle_network_block(self, data: dict[str, str]) -> None:
        """Process new_block_network event — cache network difficulty."""
        parsed = self._parse_data(data)
        pipe = self.redis.pipeline()
        pipe.set("network:difficulty", str(parsed.get("diff", 0)), ex=1200)  # 20-min TTL
        pipe.set("network:height", str(parsed.get("height", 0)), ex=1200)
        pipe.set("network:block_hash", str(parsed.get("hash", "")), ex=1200)
        await pipe.execute()

    async def _handle_best_diff(self, data: dict[str, str]) -> None:
        """Process share_best_diff event — publish notification."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        if not user:
            return

        await self.redis.publish(f"pubsub:best_diff", json.dumps({
            "type": "best_diff",
            "user": user,
            "worker": parsed.get("worker", ""),
            "new_best": parsed.get("new_best", 0),
            "prev_best": parsed.get("prev_best", 0),
            "timeframe": parsed.get("timeframe", "session"),
        }))


async def check_worker_timeouts(
    redis_client: aioredis.Redis,
    timeout_seconds: int = 600,
) -> int:
    """Mark workers offline if no share received within timeout.

    Returns:
        Number of workers marked offline.
    """
    marked = 0
    now_ts = time.time()

    async for key in redis_client.scan_iter(match="worker:*:*"):
        key_str = key if isinstance(key, str) else key.decode()
        data: dict[str, str] = await redis_client.hgetall(key_str)  # type: ignore[assignment]

        if data.get("is_online") != "1":
            continue

        last_share = data.get("last_share")
        if not last_share:
            continue

        try:
            share_dt = datetime.fromisoformat(last_share)
            share_ts = share_dt.timestamp()
        except (ValueError, TypeError):
            continue

        if now_ts - share_ts > timeout_seconds:
            await redis_client.hset(key_str, "is_online", "0")
            marked += 1
            logger.info("Worker %s marked offline (timeout)", key_str)

    return marked
