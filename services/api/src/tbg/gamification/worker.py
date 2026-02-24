"""Gamification arq worker — consumes mining events from Redis Streams.

Runs in a separate consumer group from the mining consumer so both
can process the same events independently.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import close_db, get_session, init_db
from tbg.gamification.streak_service import check_streak_warnings, check_streaks
from tbg.gamification.trigger_engine import TriggerEngine

logger = logging.getLogger(__name__)

CONSUMER_GROUP = "gamification-consumers"

STREAMS = [
    "mining:share_submitted",
    "mining:share_best_diff",
    "mining:block_found",
]


async def _get_db_session() -> AsyncSession:
    """Get a database session for the worker."""
    async for session in get_session():
        return session
    raise RuntimeError("Failed to get database session")


async def gamification_startup(ctx: dict) -> None:  # type: ignore[type-arg]
    """Initialize Redis + DB connections on worker startup."""
    settings = get_settings()
    await init_db(settings.database_url)

    redis_url = os.environ.get("TBG_REDIS_URL", settings.redis_url)
    redis_client = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )

    # Create consumer groups
    for stream in STREAMS:
        try:
            await redis_client.xgroup_create(stream, CONSUMER_GROUP, id="0", mkstream=True)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    ctx["redis"] = redis_client
    logger.info("Gamification worker started")


async def gamification_shutdown(ctx: dict) -> None:  # type: ignore[type-arg]
    """Clean up on worker shutdown."""
    redis_client: aioredis.Redis | None = ctx.get("redis")
    if redis_client:
        await redis_client.aclose()
    await close_db()
    logger.info("Gamification worker shut down")


async def consume_gamification_events(ctx: dict) -> None:  # type: ignore[type-arg]
    """Main consumer loop — reads mining events and evaluates badge triggers."""
    redis_client: aioredis.Redis = ctx["redis"]
    consumer_name = os.environ.get("TBG_GAMIFICATION_CONSUMER", "gam-worker-1")
    streams = {s: ">" for s in STREAMS}

    while True:
        try:
            events = await redis_client.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=consumer_name,
                streams=streams,
                count=100,
                block=5000,
            )
        except aioredis.ResponseError as e:
            logger.error("XREADGROUP error: %s", e)
            await asyncio.sleep(1)
            continue

        if not events:
            continue

        for stream_name, messages in events:
            stream_str = stream_name if isinstance(stream_name, str) else stream_name.decode()

            for msg_id, raw_data in messages:
                try:
                    # Parse event data
                    data_str = raw_data.get("data", "{}")
                    if isinstance(data_str, str):
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            data = dict(raw_data)
                    else:
                        data = dict(raw_data)

                    # Process through trigger engine
                    db = await _get_db_session()
                    try:
                        engine = TriggerEngine(db, redis_client)
                        awarded = await engine.evaluate(stream_str, msg_id, data)
                        if awarded:
                            logger.info(
                                "Awarded badges: %s (stream=%s, event=%s)",
                                awarded, stream_str, msg_id,
                            )
                    finally:
                        await db.close()

                    await redis_client.xack(stream_str, CONSUMER_GROUP, msg_id)

                except Exception:
                    logger.exception("Failed to process %s from %s", msg_id, stream_str)


async def weekly_streak_check(ctx: dict) -> int:  # type: ignore[type-arg]
    """Scheduled task: evaluate streaks every Monday 00:00 UTC."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()
    try:
        return await check_streaks(db, redis_client)
    finally:
        await db.close()


async def sunday_streak_warnings(ctx: dict) -> int:  # type: ignore[type-arg]
    """Scheduled task: warn users with expiring streaks Sunday 18:00 UTC."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()
    try:
        return await check_streak_warnings(db, redis_client)
    finally:
        await db.close()


class GamificationWorkerSettings:
    """arq worker settings for the gamification consumer."""

    functions = [consume_gamification_events, weekly_streak_check, sunday_streak_warnings]
    on_startup = gamification_startup
    on_shutdown = gamification_shutdown
    max_jobs = 4
    job_timeout = 0  # consume_gamification_events runs forever
    allow_abort_jobs = True
