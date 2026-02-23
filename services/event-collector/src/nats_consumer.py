"""NATS JetStream consumer for cross-region mining events.

Subscribes to the MINING_EVENTS stream and processes events from
remote ckpool instances. Integrates into the EventCollector's
event processing pipeline.

The consumer uses a pull subscription with explicit ack, allowing
controlled backpressure and reliable delivery.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Awaitable

import nats
from nats.js.api import ConsumerConfig

logger = logging.getLogger("tbg.nats-consumer")


class NATSConsumer:
    """Pull-based NATS JetStream consumer for mining events."""

    def __init__(
        self,
        nats_url: str,
        stream: str = "MINING_EVENTS",
        consumer_name: str = "event-collector",
    ) -> None:
        self._nats_url = nats_url
        self._stream = stream
        self._consumer_name = consumer_name
        self._nc = None
        self._js = None
        self._sub = None
        self._running = False
        self._handler: Callable[[dict[str, Any]], Awaitable[None]] | None = None
        self._events_consumed = 0
        self._events_errors = 0

    def set_handler(self, handler: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        """Set the async handler called for each consumed event."""
        self._handler = handler

    async def start(self) -> None:
        """Connect to NATS and start consuming."""
        self._running = True

        while self._running:
            try:
                await self._connect()
                await self._consume_loop()
            except Exception as e:
                if self._running:
                    logger.warning("NATS consumer error: %s, reconnecting in 5s", e)
                    await asyncio.sleep(5)

    async def stop(self) -> None:
        """Stop consuming and disconnect."""
        self._running = False

        if self._sub:
            try:
                await self._sub.unsubscribe()
            except Exception:
                pass

        if self._nc and self._nc.is_connected:
            try:
                await self._nc.drain()
                await self._nc.close()
            except Exception:
                pass

        logger.info(
            "NATS consumer stopped. Consumed=%d, Errors=%d",
            self._events_consumed,
            self._events_errors,
        )

    async def _connect(self) -> None:
        """Connect to NATS and subscribe to the stream."""
        self._nc = await nats.connect(
            self._nats_url,
            reconnect_time_wait=2,
            max_reconnect_attempts=10,
        )
        self._js = self._nc.jetstream()

        # Pull subscribe from durable consumer
        self._sub = await self._js.pull_subscribe(
            "events.>",
            durable=self._consumer_name,
            stream=self._stream,
        )

        logger.info(
            "Connected to NATS (%s), consuming from %s/%s",
            self._nats_url,
            self._stream,
            self._consumer_name,
        )

    async def _consume_loop(self) -> None:
        """Pull and process messages."""
        while self._running:
            try:
                messages = await self._sub.fetch(batch=10, timeout=2)

                for msg in messages:
                    try:
                        raw = json.loads(msg.data.decode("utf-8"))
                        if self._handler:
                            await self._handler(raw)
                        self._events_consumed += 1
                        await msg.ack()
                    except json.JSONDecodeError:
                        self._events_errors += 1
                        logger.warning("Invalid JSON from NATS: %s", msg.subject)
                        await msg.ack()  # Ack to avoid redelivery of bad data
                    except Exception as e:
                        self._events_errors += 1
                        logger.error("Error processing NATS event: %s", e)
                        # NAK with delay for retry
                        await msg.nak(delay=5)

            except nats.errors.TimeoutError:
                continue  # No messages available, loop back
            except Exception as e:
                if self._running:
                    raise  # Will be caught by outer loop

    @property
    def stats(self) -> dict[str, int]:
        return {
            "consumed": self._events_consumed,
            "errors": self._events_errors,
        }
