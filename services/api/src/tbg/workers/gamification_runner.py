"""Standalone runner for the gamification event consumer.

Reads mining events from Redis Streams (separate consumer group from
the mining consumer) and evaluates badge triggers, XP grants, and streaks.

Usage: python -m tbg.workers.gamification_runner
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal

import redis.asyncio as aioredis

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tbg.config import get_settings
from tbg.database import close_db, get_engine, init_db
from tbg.gamification.trigger_engine import TriggerEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CONSUMER_GROUP = "gamification-consumers"

STREAMS = [
    "mining:share_submitted",
    "mining:share_best_diff",
    "mining:block_found",
]

_running = True
_session_factory = None


async def consume(redis_client: aioredis.Redis, consumer_name: str) -> None:
    """Main consumer loop — reads mining events and evaluates badge triggers."""
    streams = {s: ">" for s in STREAMS}

    while _running:
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
                    data_str = raw_data.get("data", "{}")
                    if isinstance(data_str, str):
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            data = dict(raw_data)
                    else:
                        data = dict(raw_data)

                    async with _session_factory() as db:
                        engine = TriggerEngine(db, redis_client)
                        awarded = await engine.evaluate(stream_str, msg_id, data)
                        if awarded:
                            logger.info(
                                "Awarded badges: %s (stream=%s, event=%s)",
                                awarded, stream_str, msg_id,
                            )

                    await redis_client.xack(stream_str, CONSUMER_GROUP, msg_id)

                except Exception:
                    logger.exception("Failed to process %s from %s", msg_id, stream_str)


async def main() -> None:
    """Run the gamification event consumer."""
    global _running, _session_factory  # noqa: PLW0603

    settings = get_settings()
    await init_db(settings.database_url)

    _session_factory = async_sessionmaker(
        get_engine(), class_=AsyncSession, expire_on_commit=False,
    )

    redis_url = os.environ.get("TBG_REDIS_URL", settings.redis_url)
    consumer_name = os.environ.get("TBG_GAMIFICATION_CONSUMER", "gam-worker-1")

    redis_client = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )

    # Create consumer groups (idempotent)
    for stream in STREAMS:
        try:
            await redis_client.xgroup_create(stream, CONSUMER_GROUP, id="0", mkstream=True)
            logger.info("Created consumer group %s for %s", CONSUMER_GROUP, stream)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    # Handle graceful shutdown
    loop = asyncio.get_event_loop()

    def _stop():
        global _running  # noqa: PLW0603
        _running = False

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _stop)

    logger.info("Starting gamification consumer (consumer=%s)", consumer_name)

    try:
        await consume(redis_client, consumer_name)
    finally:
        await redis_client.aclose()
        await close_db()
        logger.info("Gamification consumer stopped")


if __name__ == "__main__":
    asyncio.run(main())
