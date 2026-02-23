"""Redis Streams publisher for mining events.

Publishes each event to a stream named `mining:{event_type}`.
Uses XADD with MAXLEN to cap stream size.
"""

from __future__ import annotations

import json
import logging

import redis.asyncio as redis

from .config import Config
from .schemas import BaseEvent

logger = logging.getLogger("tbg.redis_publisher")


class RedisPublisher:
    """Publishes mining events to Redis Streams."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._client: redis.Redis | None = None
        self._events_published = 0
        self._events_failed = 0

    async def connect(self) -> None:
        """Connect to Redis."""
        self._client = redis.from_url(
            self._config.redis_url,
            decode_responses=True,
        )
        # Test connection
        await self._client.ping()
        logger.info("Connected to Redis at %s", self._config.redis_url)

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            logger.info(
                "Redis publisher closed. Published: %d, Failed: %d",
                self._events_published,
                self._events_failed,
            )

    async def publish(self, event: BaseEvent) -> None:
        """Publish an event to its Redis Stream.

        Stream key: mining:{event_type}
        Example: mining:share_submitted
        """
        if not self._client:
            logger.warning("Redis not connected, dropping event")
            self._events_failed += 1
            return

        stream_key = f"mining:{event.event}"

        try:
            # Flatten the event for Redis stream fields
            fields = {
                "event": event.event,
                "ts": str(event.ts),
                "source": event.source,
                "data": json.dumps(event.data),
            }

            await self._client.xadd(
                stream_key,
                fields,
                maxlen=self._config.redis_stream_maxlen,
                approximate=True,
            )
            self._events_published += 1

            if self._events_published % 1000 == 0:
                logger.info(
                    "Redis publisher stats: %d published, %d failed",
                    self._events_published,
                    self._events_failed,
                )

        except redis.RedisError:
            self._events_failed += 1
            logger.exception("Failed to publish to Redis stream %s", stream_key)

    async def publish_block_found(self, event: BaseEvent) -> None:
        """Publish a block_found event with additional PUB/SUB notification.

        Block found events are rare and critical — we publish to both
        the stream AND a PUB/SUB channel for instant notification.
        """
        await self.publish(event)

        if self._client:
            try:
                await self._client.publish(
                    "blocks:found",
                    json.dumps(event.model_dump()),
                )
            except redis.RedisError:
                logger.exception("Failed to publish block_found to PUB/SUB")

    @property
    def stats(self) -> dict[str, int]:
        """Return publisher statistics."""
        return {
            "events_published": self._events_published,
            "events_failed": self._events_failed,
        }
