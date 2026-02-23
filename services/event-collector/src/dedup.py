"""Deduplication filter for mining events.

Uses an OrderedDict with time-window eviction to track event_ids.
Events arriving within the dedup window that have already been
processed are silently dropped. This handles the case where events
arrive via both the local Unix socket AND NATS (from a remote region).

The window size should match the NATS JetStream dedup_window (2 minutes).
"""

from __future__ import annotations

import time
from collections import OrderedDict


class DeduplicationFilter:
    """Time-window deduplication for event IDs."""

    def __init__(self, window_seconds: float = 120.0, max_entries: int = 50000) -> None:
        self._seen: OrderedDict[str, float] = OrderedDict()
        self._window = window_seconds
        self._max_entries = max_entries
        self._dedup_hits = 0

    def is_duplicate(self, event_id: str) -> bool:
        """Check if an event_id has been seen within the dedup window.

        Returns True if this is a duplicate (should be dropped).
        Returns False if this is new (should be processed).
        Side effect: records the event_id for future checks.
        """
        now = time.monotonic()
        self._evict(now)

        if event_id in self._seen:
            self._dedup_hits += 1
            return True

        self._seen[event_id] = now

        # Hard cap to prevent unbounded growth
        while len(self._seen) > self._max_entries:
            self._seen.popitem(last=False)

        return False

    def _evict(self, now: float) -> None:
        """Remove entries older than the dedup window."""
        cutoff = now - self._window
        while self._seen:
            key, ts = next(iter(self._seen.items()))
            if ts >= cutoff:
                break
            self._seen.popitem(last=False)

    @property
    def stats(self) -> dict[str, int]:
        return {
            "tracked": len(self._seen),
            "dedup_hits": self._dedup_hits,
        }
