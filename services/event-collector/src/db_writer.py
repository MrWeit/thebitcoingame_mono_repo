"""TimescaleDB writer for mining events.

Batches events and writes them periodically to minimize
database round-trips. Uses asyncpg for async PostgreSQL access.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg

from .config import Config
from .schemas import BaseEvent, EventType

logger = logging.getLogger("tbg.db_writer")


class DBWriter:
    """Batch writer for mining events to TimescaleDB."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._pool: asyncpg.Pool | None = None
        self._batch: list[tuple[datetime, str, str, dict[str, Any]]] = []
        self._share_batch: list[tuple[Any, ...]] = []
        self._events_written = 0
        self._events_failed = 0
        self._flush_task: asyncio.Task[None] | None = None

    async def connect(self) -> None:
        """Create connection pool to TimescaleDB."""
        self._pool = await asyncpg.create_pool(
            self._config.database_url,
            min_size=2,
            max_size=10,
        )
        logger.info("Connected to TimescaleDB")

    async def close(self) -> None:
        """Flush remaining events and close the pool."""
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass

        await self._flush()

        if self._pool:
            await self._pool.close()
            logger.info(
                "DB writer closed. Written: %d, Failed: %d",
                self._events_written,
                self._events_failed,
            )

    async def write(self, event: BaseEvent) -> None:
        """Add an event to the write batch.

        Events are buffered and written in batches for performance.
        The batch is flushed when it reaches max_size or on a timer.
        """
        ts = datetime.fromtimestamp(event.ts, tz=timezone.utc)

        self._batch.append((ts, event.event, event.source, event.data))

        # Also accumulate share-specific batch for the shares hypertable
        if event.event == EventType.SHARE_SUBMITTED and event.data:
            self._share_batch.append(
                (
                    ts,
                    event.data.get("user", "unknown"),
                    event.data.get("worker", "unknown"),
                    event.data.get("diff", 0.0),
                    event.data.get("sdiff", 0.0),
                    event.data.get("accepted", True),
                    event.data.get("ip", ""),
                    event.source,
                )
            )

        if len(self._batch) >= self._config.batch_max_size:
            await self._flush()

    async def start_periodic_flush(self) -> None:
        """Start the periodic flush background task."""
        self._flush_task = asyncio.create_task(self._periodic_flush())

    async def _periodic_flush(self) -> None:
        """Flush batches on a timer."""
        while True:
            await asyncio.sleep(self._config.batch_flush_interval)
            await self._flush()

    async def _flush(self) -> None:
        """Write all buffered events to the database."""
        if not self._batch or not self._pool:
            return

        batch = self._batch
        share_batch = self._share_batch
        self._batch = []
        self._share_batch = []

        try:
            async with self._pool.acquire() as conn:
                # Write to mining_events table (all events)
                await conn.executemany(
                    """
                    INSERT INTO mining_events (ts, event_type, source, payload)
                    VALUES ($1, $2, $3, $4::jsonb)
                    """,
                    [
                        (ts, event_type, source, json.dumps(data))
                        for ts, event_type, source, data in batch
                    ],
                )

                # Write share-specific rows to the shares hypertable
                if share_batch:
                    await conn.executemany(
                        """
                        INSERT INTO shares (time, btc_address, worker_name, difficulty, share_diff, is_valid, ip_address, source)
                        VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)
                        """,
                        [
                            (ts, user, worker, diff, sdiff, valid, ip or "0.0.0.0", source)
                            for ts, user, worker, diff, sdiff, valid, ip, source in share_batch
                        ],
                    )

            self._events_written += len(batch)

            if len(batch) > 10:
                logger.info(
                    "Flushed %d events to TimescaleDB (%d shares)",
                    len(batch),
                    len(share_batch),
                )
            else:
                logger.debug("Flushed %d events to TimescaleDB", len(batch))

        except asyncpg.PostgresError:
            self._events_failed += len(batch)
            logger.exception("Failed to flush %d events to TimescaleDB", len(batch))
            # Put events back for retry (limited)
            if len(self._batch) < self._config.batch_max_size * 2:
                self._batch = batch + self._batch
                self._share_batch = share_batch + self._share_batch

    @property
    def stats(self) -> dict[str, int]:
        """Return writer statistics."""
        return {
            "events_written": self._events_written,
            "events_failed": self._events_failed,
            "batch_pending": len(self._batch),
        }
