"""arq worker for the mining event consumer.

Runs as a separate process, reading from Redis Streams and updating
worker state, personal bests, and daily stats.
"""

from __future__ import annotations

import asyncio
import logging
import os

import redis.asyncio as aioredis

from tbg.mining.consumer import MiningEventConsumer, check_worker_timeouts

logger = logging.getLogger(__name__)

# Global state for the consumer instance
_consumer: MiningEventConsumer | None = None


async def startup(ctx: dict) -> None:  # type: ignore[type-arg]
    """Initialize Redis connection and consumer on worker startup."""
    redis_url = os.environ.get("TBG_REDIS_URL", "redis://localhost:6379/0")
    redis_client = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )

    consumer_name = os.environ.get("TBG_CONSUMER_NAME", "api-worker-1")
    consumer = MiningEventConsumer(
        redis_client=redis_client,
        consumer_name=consumer_name,
    )
    await consumer.setup_groups()

    ctx["redis"] = redis_client
    ctx["consumer"] = consumer
    logger.info("Event consumer started (consumer=%s)", consumer_name)


async def shutdown(ctx: dict) -> None:  # type: ignore[type-arg]
    """Clean up on worker shutdown."""
    consumer: MiningEventConsumer | None = ctx.get("consumer")
    if consumer:
        consumer.stop()

    redis_client: aioredis.Redis | None = ctx.get("redis")
    if redis_client:
        await redis_client.aclose()

    logger.info("Event consumer shut down")


async def consume_events(ctx: dict) -> None:  # type: ignore[type-arg]
    """Main consumer task — runs continuously reading from all 8 streams."""
    consumer: MiningEventConsumer = ctx["consumer"]
    await consumer.run()


async def check_timeouts(ctx: dict) -> int:  # type: ignore[type-arg]
    """Periodic task to mark inactive workers offline (10-min timeout)."""
    redis_client: aioredis.Redis = ctx["redis"]
    timeout = int(os.environ.get("TBG_WORKER_TIMEOUT_SECONDS", "600"))
    count = await check_worker_timeouts(redis_client, timeout_seconds=timeout)
    if count > 0:
        logger.info("Marked %d workers offline due to timeout", count)
    return count


async def snapshot_hashrates(ctx: dict) -> int:  # type: ignore[type-arg]
    """Periodic task to snapshot hashrates for all active users (every 5 minutes)."""
    redis_client: aioredis.Redis = ctx["redis"]

    # Scan for all user hashrate keys
    snapshots = 0
    async for key in redis_client.scan_iter(match="user_hashrate:*"):
        key_str = key if isinstance(key, str) else key.decode()
        # user_hashrate:{btc_address}
        btc_address = key_str.split(":", 1)[1] if ":" in key_str else ""
        if not btc_address:
            continue

        data: dict[str, str] = await redis_client.hgetall(key_str)  # type: ignore[assignment]
        if not data:
            continue

        # Count online workers
        worker_names: set[str] = await redis_client.smembers(f"workers:{btc_address}")  # type: ignore[assignment]
        online = 0
        for wn in worker_names:
            wdata = await redis_client.hgetall(f"worker:{btc_address}:{wn}")
            if wdata.get("is_online") == "1":
                online += 1

        # Store in Redis as a time-series entry for pickup by the DB writer
        # The actual DB insert happens when we have a session (Phase 2 extension)
        await redis_client.hset(key_str, "workers_online", str(online))
        snapshots += 1

    return snapshots


async def prune_feed_and_events(ctx: dict) -> None:  # type: ignore[type-arg]
    """Hourly task to prune old activity feed items and expired events."""
    from tbg.database import init_db, get_session, close_db
    from tbg.config import get_settings
    from tbg.dashboard.service import prune_activity_feed, prune_expired_events

    settings = get_settings()
    await init_db(settings.database_url)

    async for session in get_session():
        feed_deleted = await prune_activity_feed(session)
        events_deleted = await prune_expired_events(session)
        if feed_deleted or events_deleted:
            logger.info(
                "Pruned dashboard data",
                feed_deleted=feed_deleted,
                events_deleted=events_deleted,
            )
        break


class WorkerSettings:
    """arq worker settings for the event consumer."""

    functions = [consume_events, check_timeouts, snapshot_hashrates, prune_feed_and_events]
    cron_jobs = [
        # Check worker timeouts every 30 seconds
        # Note: arq cron uses second=set() for scheduling
    ]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 4
    job_timeout = 0  # consume_events runs forever
    allow_abort_jobs = True
