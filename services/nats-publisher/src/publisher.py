"""NATS sidecar publisher — reads ckpool events from Unix socket, publishes to NATS JetStream.

Architecture:
- Binds to the ckpool event Unix DGRAM socket
- Parses each datagram as JSON
- Publishes to NATS subject: events.<region>.<event_type>
- Bounded deque buffer absorbs brief NATS outages
- Uses event_id (or generated UUID) as NATS message ID for dedup
"""

import asyncio
import logging
import os
import signal
import socket
import uuid
from collections import deque

import nats
import orjson

from .config import PublisherConfig

logger = logging.getLogger("nats-publisher")


class NATSPublisher:
    def __init__(self, config: PublisherConfig):
        self.config = config
        self.nc = None
        self.js = None
        self.buffer: deque = deque(maxlen=config.buffer_size)
        self.running = False
        self.sock = None
        self._stats_published = 0
        self._stats_dropped = 0
        self._stats_buffered = 0

    async def start(self):
        self.running = True
        await self._connect_nats()
        self._bind_socket()

        logger.info(
            "Publisher started: region=%s, socket=%s, nats=%s",
            self.config.region,
            self.config.socket_path,
            self.config.nats_url,
        )

        await asyncio.gather(
            self._receive_loop(),
            self._flush_buffer_loop(),
            self._stats_loop(),
        )

    async def stop(self):
        logger.info("Shutting down publisher...")
        self.running = False

        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass

        if self.nc and self.nc.is_connected:
            await self.nc.drain()
            await self.nc.close()

        logger.info(
            "Publisher stopped. Published=%d, Dropped=%d, Buffered=%d",
            self._stats_published,
            self._stats_dropped,
            len(self.buffer),
        )

    async def _connect_nats(self):
        delay = self.config.reconnect_delay
        while self.running:
            try:
                self.nc = await nats.connect(
                    self.config.nats_url,
                    reconnect_time_wait=2,
                    max_reconnect_attempts=-1,
                )
                self.js = self.nc.jetstream()
                logger.info("Connected to NATS at %s", self.config.nats_url)
                return
            except Exception as e:
                logger.warning("NATS connection failed: %s, retrying in %.1fs", e, delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, self.config.max_reconnect_delay)

    def _bind_socket(self):
        path = self.config.socket_path

        # Remove stale socket file
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass

        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.sock.bind(path)
        self.sock.setblocking(False)

        # Make socket world-writable so ckpool can send to it
        os.chmod(path, 0o666)

        logger.info("Bound to Unix socket: %s", path)

    async def _receive_loop(self):
        loop = asyncio.get_event_loop()

        while self.running:
            try:
                data = await loop.run_in_executor(None, self._recv_dgram)
                if data is None:
                    continue

                event = orjson.loads(data)
                await self._publish_event(event, data)

            except orjson.JSONDecodeError as e:
                logger.debug("Invalid JSON from socket: %s", e)
            except Exception as e:
                if self.running:
                    logger.error("Error in receive loop: %s", e)
                    await asyncio.sleep(0.1)

    def _recv_dgram(self) -> bytes | None:
        try:
            return self.sock.recv(65536)
        except BlockingIOError:
            import time
            time.sleep(0.01)
            return None
        except OSError:
            if self.running:
                import time
                time.sleep(0.1)
            return None

    async def _publish_event(self, event: dict, raw: bytes):
        event_type = event.get("event", "unknown").replace("_", ".")
        region = event.get("region", self.config.region)
        subject = f"events.{region}.{event_type}"

        # Use event_id for dedup, or generate one
        event_id = event.get("event_id") or str(uuid.uuid4())

        try:
            if self.js and self.nc and self.nc.is_connected:
                # Flush buffer first
                while self.buffer:
                    buffered_subject, buffered_data, buffered_id = self.buffer.popleft()
                    await self.js.publish(
                        buffered_subject,
                        buffered_data,
                        headers={"Nats-Msg-Id": buffered_id},
                    )
                    self._stats_published += 1
                    self._stats_buffered -= 1

                # Publish current event
                await self.js.publish(
                    subject,
                    raw,
                    headers={"Nats-Msg-Id": event_id},
                )
                self._stats_published += 1
            else:
                # Buffer for later
                self.buffer.append((subject, raw, event_id))
                self._stats_buffered += 1
        except Exception as e:
            # Buffer on failure
            self.buffer.append((subject, raw, event_id))
            self._stats_buffered += 1
            logger.debug("Buffered event (NATS error: %s), buffer=%d", e, len(self.buffer))

    async def _flush_buffer_loop(self):
        """Periodically retry buffered events."""
        while self.running:
            await asyncio.sleep(1.0)

            if not self.buffer or not self.js or not self.nc or not self.nc.is_connected:
                continue

            flushed = 0
            try:
                while self.buffer and flushed < 100:
                    subject, data, msg_id = self.buffer.popleft()
                    await self.js.publish(
                        subject,
                        data,
                        headers={"Nats-Msg-Id": msg_id},
                    )
                    self._stats_published += 1
                    self._stats_buffered -= 1
                    flushed += 1
            except Exception:
                pass  # Will retry next cycle

    async def _stats_loop(self):
        """Log stats every 60 seconds."""
        while self.running:
            await asyncio.sleep(60)
            logger.info(
                "Stats: published=%d, buffered=%d, dropped=%d",
                self._stats_published,
                len(self.buffer),
                self._stats_dropped,
            )


async def main():
    config = PublisherConfig()

    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    publisher = NATSPublisher(config)

    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def signal_handler():
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    task = asyncio.create_task(publisher.start())

    await stop_event.wait()
    await publisher.stop()
    task.cancel()

    try:
        await task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
