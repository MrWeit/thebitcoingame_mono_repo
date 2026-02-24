"""Standalone runner for the mining event consumer.

Usage: python -m tbg.workers.event_consumer_runner
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal

import redis.asyncio as aioredis

from tbg.mining.consumer import MiningEventConsumer, check_worker_timeouts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def main() -> None:
    """Run the event consumer and timeout checker."""
    redis_url = os.environ.get("TBG_REDIS_URL", "redis://localhost:6379/0")
    consumer_name = os.environ.get("TBG_CONSUMER_NAME", "api-worker-1")
    timeout_seconds = int(os.environ.get("TBG_WORKER_TIMEOUT_SECONDS", "600"))

    redis_client = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )

    consumer = MiningEventConsumer(
        redis_client=redis_client,
        consumer_name=consumer_name,
    )

    # Handle graceful shutdown
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, consumer.stop)

    async def timeout_checker() -> None:
        """Periodically check for timed-out workers."""
        while consumer._running:
            try:
                await check_worker_timeouts(redis_client, timeout_seconds)
            except Exception:
                logger.exception("Timeout checker error")
            await asyncio.sleep(30)

    logger.info("Starting mining event consumer (consumer=%s)", consumer_name)

    try:
        await asyncio.gather(
            consumer.run(),
            timeout_checker(),
        )
    finally:
        await redis_client.aclose()
        logger.info("Event consumer stopped")


if __name__ == "__main__":
    asyncio.run(main())
