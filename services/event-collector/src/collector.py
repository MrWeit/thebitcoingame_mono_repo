"""TheBitcoinGame Event Collector

Async Unix socket listener that receives JSON events from ckpool,
validates them, and fans out to Redis Streams and TimescaleDB.

Architecture:
  ckpool (C) --[Unix DGRAM socket]--> Event Collector (Python)
                                        |-> Redis Streams (real-time)
                                        |-> TimescaleDB (persistence)

  Phase 4 addition:
  NATS JetStream --[pull subscribe]--> Event Collector (Python)
                                        |-> Dedup filter
                                        |-> Same fan-out pipeline

The collector binds the Unix socket BEFORE ckpool starts, so ckpool
can immediately begin sending events. If the collector is not running,
ckpool silently drops events (fire-and-forget).

License: Proprietary (separate process from GPL ckpool)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import socket
import sys
from pathlib import Path

from .config import Config, load_config
from .db_writer import DBWriter
from .dedup import DeduplicationFilter
from .nats_consumer import NATSConsumer
from .redis_publisher import RedisPublisher
from .schemas import BaseEvent, EventType, parse_event

logger = logging.getLogger("tbg.collector")


class EventCollector:
    """Main event collector service."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.redis = RedisPublisher(config)
        self.db = DBWriter(config)
        self._sock: socket.socket | None = None
        self._running = False
        self._events_received = 0
        self._events_errors = 0
        self._dedup = DeduplicationFilter(window_seconds=120.0)
        self._nats_consumer: NATSConsumer | None = None

    async def start(self) -> None:
        """Start the event collector."""
        logger.info("Starting TBG Event Collector...")

        # Connect to Redis and TimescaleDB
        try:
            await self.redis.connect()
        except Exception:
            logger.exception("Failed to connect to Redis")
            raise

        try:
            await self.db.connect()
        except Exception:
            logger.exception("Failed to connect to TimescaleDB")
            raise

        # Start periodic DB flush
        await self.db.start_periodic_flush()

        # Bind Unix socket
        self._bind_socket()

        # Start NATS consumer if configured
        if self.config.nats_url:
            self._nats_consumer = NATSConsumer(
                nats_url=self.config.nats_url,
                stream=self.config.nats_stream,
                consumer_name=self.config.nats_consumer,
            )
            self._nats_consumer.set_handler(self._handle_nats_event)

        self._running = True
        logger.info(
            "Event Collector ready, listening on %s", self.config.socket_path
        )

        # Run socket listener and NATS consumer concurrently
        tasks = [self._receive_loop()]
        if self._nats_consumer:
            tasks.append(self._nats_consumer.start())
            logger.info("NATS consumer enabled: %s/%s", self.config.nats_stream, self.config.nats_consumer)

        await asyncio.gather(*tasks)

    async def stop(self) -> None:
        """Gracefully stop the collector."""
        logger.info("Stopping Event Collector...")
        self._running = False

        if self._sock:
            self._sock.close()

        if self._nats_consumer:
            await self._nats_consumer.stop()

        # Clean up socket file
        socket_path = Path(self.config.socket_path)
        if socket_path.exists():
            socket_path.unlink()

        await self.db.close()
        await self.redis.close()

        logger.info(
            "Event Collector stopped. Total received: %d, Errors: %d",
            self._events_received,
            self._events_errors,
        )

    def _bind_socket(self) -> None:
        """Create and bind the Unix datagram socket."""
        socket_path = Path(self.config.socket_path)

        # Ensure parent directory exists
        socket_path.parent.mkdir(parents=True, exist_ok=True)

        # Remove stale socket file
        if socket_path.exists():
            socket_path.unlink()
            logger.debug("Removed stale socket file: %s", socket_path)

        self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self._sock.bind(str(socket_path))
        self._sock.setblocking(False)

        # Set permissions so ckpool can write to it
        os.chmod(str(socket_path), 0o666)

        logger.info("Bound Unix socket at %s", socket_path)

    async def _receive_loop(self) -> None:
        """Main event receive loop using asyncio."""
        loop = asyncio.get_running_loop()

        while self._running:
            try:
                # Wait for data on the socket (non-blocking)
                data = await loop.sock_recv(self._sock, self.config.socket_buffer_size)  # type: ignore[arg-type]
                if data:
                    self._events_received += 1
                    await self._handle_datagram(data)
            except asyncio.CancelledError:
                break
            except OSError as e:
                if self._running:
                    logger.error("Socket error: %s", e)
                    await asyncio.sleep(0.1)
            except Exception:
                if self._running:
                    logger.exception("Unexpected error in receive loop")
                    await asyncio.sleep(0.1)

    async def _handle_nats_event(self, raw: dict) -> None:
        """Handle an event received from NATS (cross-region)."""
        event_id = raw.get("event_id", "")
        if event_id and self._dedup.is_duplicate(event_id):
            return

        await self._process_event(raw, source="nats")

    async def _handle_datagram(self, data: bytes) -> None:
        """Parse and process a single event datagram."""
        try:
            raw = json.loads(data.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._events_errors += 1
            logger.warning(
                "Failed to decode event JSON (%d bytes)", len(data)
            )
            return

        # Dedup check for local events too (if event_id present)
        event_id = raw.get("event_id", "")
        if event_id and self._dedup.is_duplicate(event_id):
            return

        await self._process_event(raw, source="socket")

    async def _process_event(self, raw: dict, source: str = "socket") -> None:
        """Shared event processing pipeline for socket and NATS events."""
        event_type = raw.get("event", "unknown")

        try:
            event = parse_event(raw)
        except Exception:
            self._events_errors += 1
            logger.warning("Failed to validate event: %s", event_type)
            return

        logger.debug(
            "Event received [%s]: %s (user=%s, region=%s)",
            source,
            event.event,
            event.data.get("user", "n/a"),
            event.region or "n/a",
        )

        # Fan out to Redis and DB concurrently
        try:
            tasks = []

            # Redis: publish to stream
            if event.event == EventType.BLOCK_FOUND:
                tasks.append(self.redis.publish_block_found(event))
            else:
                tasks.append(self.redis.publish(event))

            # DB: add to write batch
            tasks.append(self.db.write(event))

            await asyncio.gather(*tasks, return_exceptions=True)

        except Exception:
            self._events_errors += 1
            logger.exception("Failed to process event: %s", event_type)

        # Log stats periodically
        if self._events_received % 100 == 0:
            logger.info(
                "Stats: received=%d errors=%d redis=%s db=%s dedup=%s",
                self._events_received,
                self._events_errors,
                self.redis.stats,
                self.db.stats,
                self._dedup.stats,
            )


async def main() -> None:
    """Entry point for the event collector service."""
    config = load_config()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    collector = EventCollector(config)

    # Handle shutdown signals
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(collector.stop()))

    try:
        await collector.start()
    except KeyboardInterrupt:
        pass
    finally:
        await collector.stop()


if __name__ == "__main__":
    asyncio.run(main())
