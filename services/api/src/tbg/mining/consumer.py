"""Redis Stream consumer for mining events.

Reads from 8 mining event streams using XREADGROUP with consumer group
'tbg-api-consumers'. Processes events to update Redis worker state,
personal bests, and daily stats.

Hashrate is computed locally using the same exponential moving average
(EMA) algorithm as CKPool's stratifier.c — no external hashrate events
needed.  Formula: hashrate (H/s) = dsps × 2^32, where dsps is the
exponentially decaying average of share difficulties per second.
"""

from __future__ import annotations

import json
import logging
import math
import time
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CONSUMER_GROUP = "tbg-api-consumers"

# ---------- CKPool-style EMA hashrate constants ----------
NONCES: float = 4_294_967_296.0  # 2^32
MIN1: float = 60.0
MIN5: float = 300.0
HOUR: float = 3600.0
DAY: float = 86400.0

STREAM_HANDLERS: dict[str, str] = {
    "mining:share_submitted": "_handle_share",
    "mining:block_found": "_handle_block",
    "mining:miner_connected": "_handle_connect",
    "mining:miner_disconnected": "_handle_disconnect",
    "mining:diff_updated": "_handle_diff_update",
    "mining:hashrate_update": "_handle_hashrate",
    "mining:new_block_network": "_handle_network_block",
    "mining:share_best_diff": "_handle_best_diff",
}


def decay_time(current: float, diff_added: float, elapsed_secs: float, interval: float) -> float:
    """CKPool-compatible exponential moving average for hashrate.

    This is the exact algorithm from libckpool.c ``decay_time()``.
    It creates an exponentially decaying average of share-difficulty-per-second
    over *interval*.

    Args:
        current: Previous EMA value (dsps for this window).
        diff_added: Total share difficulty since last update.
        elapsed_secs: Seconds since last update.
        interval: Time window in seconds (60, 300, 3600, 86400).

    Returns:
        Updated EMA value.
    """
    if elapsed_secs <= 0:
        return current
    dexp = elapsed_secs / interval
    # Cap to prevent extreme numbers (same as CKPool)
    if dexp > 36:
        dexp = 36
    fprop = 1.0 - 1.0 / math.exp(dexp)
    ftotal = 1.0 + fprop
    result = (current + diff_added / elapsed_secs * fprop) / ftotal
    # Prevent meaningless tiny numbers (same as CKPool)
    if result < 2e-16:
        result = 0.0
    return result


async def update_worker_hashrate(
    redis_client: aioredis.Redis,
    user: str,
    worker: str,
    sdiff: float,
    now_ts: float,
) -> None:
    """Update EMA-based hashrate for a worker and aggregate to user level.

    Uses Redis hash fields ``dsps1..dsps1440`` and ``last_decay`` to
    maintain state across share events — identical to CKPool's approach.
    """
    key = f"worker:{user}:{worker}"

    # Read current EMA state
    ema_fields = await redis_client.hmget(key, "dsps1", "dsps5", "dsps60", "dsps1440", "last_decay", "uadiff")
    dsps1 = float(ema_fields[0] or 0)
    dsps5 = float(ema_fields[1] or 0)
    dsps60 = float(ema_fields[2] or 0)
    dsps1440 = float(ema_fields[3] or 0)
    last_decay = float(ema_fields[4] or 0)
    uadiff = float(ema_fields[5] or 0)

    if last_decay <= 0:
        # First share ever — just record timestamp and accumulate
        await redis_client.hset(key, mapping={
            "last_decay": str(now_ts),
            "uadiff": str(sdiff),
            "hashrate_1m": "0",
            "hashrate_5m": "0",
            "hashrate_1h": "0",
            "hashrate_24h": "0",
        })
        return

    elapsed = now_ts - last_decay

    # Batch updates: CKPool limits to 20 Hz (50ms).  Accumulate diff
    # and skip the EMA update if called too frequently.
    if elapsed < 0.05:
        await redis_client.hincrbyfloat(key, "uadiff", sdiff)
        return

    # Include any accumulated diff
    diff = sdiff + uadiff

    # Decay all four windows
    dsps1 = decay_time(dsps1, diff, elapsed, MIN1)
    dsps5 = decay_time(dsps5, diff, elapsed, MIN5)
    dsps60 = decay_time(dsps60, diff, elapsed, HOUR)
    dsps1440 = decay_time(dsps1440, diff, elapsed, DAY)

    # Convert dsps → H/s
    h_1m = dsps1 * NONCES
    h_5m = dsps5 * NONCES
    h_1h = dsps60 * NONCES
    h_24h = dsps1440 * NONCES

    # Write back EMA state + display hashrate
    pipe = redis_client.pipeline()
    pipe.hset(key, mapping={
        "dsps1": str(dsps1),
        "dsps5": str(dsps5),
        "dsps60": str(dsps60),
        "dsps1440": str(dsps1440),
        "last_decay": str(now_ts),
        "uadiff": "0",
        "hashrate_1m": str(h_1m),
        "hashrate_5m": str(h_5m),
        "hashrate_1h": str(h_1h),
        "hashrate_24h": str(h_24h),
    })
    await pipe.execute()

    # Aggregate user-level hashrate from all workers
    worker_names: set[str] = await redis_client.smembers(f"workers:{user}")  # type: ignore[assignment]
    total = {"hashrate_1m": 0.0, "hashrate_5m": 0.0, "hashrate_1h": 0.0, "hashrate_24h": 0.0}
    for wn in worker_names:
        wdata = await redis_client.hmget(f"worker:{user}:{wn}", "hashrate_1m", "hashrate_5m", "hashrate_1h", "hashrate_24h")
        total["hashrate_1m"] += float(wdata[0] or 0)
        total["hashrate_5m"] += float(wdata[1] or 0)
        total["hashrate_1h"] += float(wdata[2] or 0)
        total["hashrate_24h"] += float(wdata[3] or 0)

    pipe2 = redis_client.pipeline()
    pipe2.hset(f"user_hashrate:{user}", mapping={k: str(v) for k, v in total.items()})
    pipe2.expire(f"user_hashrate:{user}", 3600)
    await pipe2.execute()


def _parse_si_hashrate(value: str | int | float) -> float:
    """Parse hashrate values with SI suffixes (e.g. '19.1M', '3.5K', '49.7G')."""
    if isinstance(value, (int, float)):
        return float(value)
    if not value:
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    suffix = s[-1].upper()
    multipliers = {"K": 1e3, "M": 1e6, "G": 1e9, "T": 1e12, "P": 1e15}
    if suffix in multipliers:
        try:
            return float(s[:-1]) * multipliers[suffix]
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


class MiningEventConsumer:
    """Processes mining events from Redis Streams."""

    def __init__(
        self,
        redis_client: aioredis.Redis,
        db_session_factory: object | None = None,
        consumer_name: str = "api-worker-1",
    ) -> None:
        self.redis = redis_client
        self.db_session_factory = db_session_factory
        self.consumer_name = consumer_name
        self._running = False
        self._processed = 0
        self._errors = 0
        # Dedup: track last processed share per worker to skip duplicates.
        # Key: "user:worker", Value: (sdiff, timestamp_int_ms)
        self._last_share: dict[str, tuple[float, int]] = {}

    async def setup_groups(self) -> None:
        """Create consumer groups for all streams (idempotent)."""
        for stream in STREAM_HANDLERS:
            try:
                await self.redis.xgroup_create(stream, CONSUMER_GROUP, id="0", mkstream=True)
                logger.info("Created consumer group for %s", stream)
            except aioredis.ResponseError as e:
                if "BUSYGROUP" in str(e):
                    pass  # Group already exists
                else:
                    raise

    async def consume(self, count: int = 100, block_ms: int = 5000) -> int:
        """Read and process a batch of events from all streams.

        Returns:
            Number of events processed.
        """
        streams = {s: ">" for s in STREAM_HANDLERS}
        try:
            events = await self.redis.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=self.consumer_name,
                streams=streams,
                count=count,
                block=block_ms,
            )
        except aioredis.ResponseError as e:
            logger.error("XREADGROUP error: %s", e)
            return 0

        if not events:
            return 0

        processed = 0
        for stream_name, messages in events:
            stream_str = stream_name if isinstance(stream_name, str) else stream_name.decode()
            handler_name = STREAM_HANDLERS.get(stream_str)
            if handler_name is None:
                continue

            handler = getattr(self, handler_name)
            for msg_id, data in messages:
                try:
                    await handler(data)
                    await self.redis.xack(stream_str, CONSUMER_GROUP, msg_id)
                    processed += 1
                    self._processed += 1
                except Exception:
                    self._errors += 1
                    logger.exception("Error handling %s message %s", stream_str, msg_id)

        return processed

    async def run(self) -> None:
        """Main consumer loop — runs continuously."""
        await self.setup_groups()
        self._running = True
        logger.info("Mining event consumer started (consumer=%s)", self.consumer_name)

        while self._running:
            try:
                await self.consume()
            except Exception:
                logger.exception("Consumer loop error")
                import asyncio
                await asyncio.sleep(1)

    def stop(self) -> None:
        """Signal the consumer to stop."""
        self._running = False

    # --- Event Handlers ---

    def _parse_data(self, data: dict[str, str]) -> dict:
        """Parse event data field (JSON string or flat dict).

        Some event types (share_submitted, miner_connected, etc.) wrap
        their payload in a 'data' JSON string field.  Others
        (hashrate_update, diff_updated, new_block_network) arrive as
        flat key-value pairs at the top level of the stream message.
        This method handles both formats transparently.
        """
        raw = data.get("data")
        if raw is not None:
            if isinstance(raw, str):
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    return {}
            return dict(raw)
        # No 'data' field — event uses flat format, return the whole dict
        return dict(data)

    @staticmethod
    def _normalize_worker_name(user: str, worker: str) -> str:
        """Extract short worker name from possibly full 'address.worker' format.

        CKPool sends different formats in different events:
        - share_submitted: worker = "btcaddr.workername"
        - hashrate_update: worker = "workername"
        This normalizes both to just "workername".
        """
        if not worker:
            return worker
        # If worker contains the user address as prefix, strip it
        if user and worker.startswith(f"{user}."):
            return worker[len(user) + 1:]
        # If worker contains any dot, take the part after the last dot
        # (handles "addr.worker" format from share events)
        if "." in worker:
            return worker.rsplit(".", 1)[-1]
        return worker

    async def _handle_share(self, data: dict[str, str]) -> None:
        """Process share_submitted event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = self._normalize_worker_name(user, parsed.get("worker", ""))
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        now = datetime.now(timezone.utc).isoformat()
        now_ts = time.time()
        sdiff = float(parsed.get("sdiff", 0))
        # Pool-assigned difficulty for this share (used for hashrate EMA,
        # same as CKPool's add_submit which uses client->diff not sdiff)
        pool_diff = float(parsed.get("diff", 0))
        accepted = parsed.get("accepted", True)

        pipe = self.redis.pipeline()
        pipe.hset(key, mapping={
            "is_online": "1",
            "last_share": now,
        })
        pipe.expire(key, 86400)  # 24h TTL, refreshed on each share
        pipe.hincrby(key, "shares_session", 1)
        # Track valid/invalid share counts
        if accepted:
            pipe.hincrby(key, "valid_shares", 1)
        else:
            pipe.hincrby(key, "invalid_shares", 1)
        pipe.sadd(f"workers:{user}", worker)
        pipe.expire(f"workers:{user}", 86400)  # 24h TTL
        # Publish for real-time WebSocket feed
        pipe.publish(f"ws:user:{user}", json.dumps({
            "type": "share",
            "worker": worker,
            "diff": sdiff,
            "accepted": accepted,
            "time": now,
        }))
        await pipe.execute()

        # Track best difficulty per worker (only update if new diff is higher)
        if sdiff > 0:
            current_best = await self.redis.hget(key, "best_diff")
            if current_best is None or sdiff > float(current_best):
                await self.redis.hset(key, "best_diff", str(sdiff))

        # Update EMA-based hashrate (CKPool-compatible algorithm).
        # Use pool_diff (assigned difficulty per share), not sdiff (actual
        # share difficulty), to match CKPool's add_submit() behavior.
        # Deduplicate: event-collector may emit the same share 2-3 times.
        if pool_diff > 0 and accepted:
            ts_ms = int(now_ts * 1000)
            dedup_key = f"{user}:{worker}"
            last = self._last_share.get(dedup_key)
            # Same sdiff within 1 second = duplicate event
            if last is not None and last[0] == sdiff and abs(ts_ms - last[1]) < 1000:
                pass  # skip duplicate
            else:
                self._last_share[dedup_key] = (sdiff, ts_ms)
                await update_worker_hashrate(self.redis, user, worker, pool_diff, now_ts)

    async def _handle_block(self, data: dict[str, str]) -> None:
        """Process block_found event — persist to DB and publish to WebSocket."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = self._normalize_worker_name(user, parsed.get("worker", ""))
        height = parsed.get("height", 0)
        block_hash = parsed.get("hash", "")
        reward_sats = parsed.get("reward_sats", 0)
        diff = parsed.get("diff", 0.0)
        coinbase_sig = parsed.get("coinbase_sig", "")

        # Persist block to database
        if self.db_session_factory and height:
            try:
                async for session in self.db_session_factory():
                    from tbg.db.models import Block, User

                    # Look up user by btc_address
                    user_id = None
                    if user and user != "unknown" and user != "pool":
                        from sqlalchemy import select
                        result = await session.execute(
                            select(User.id).where(User.btc_address == user)
                        )
                        user_id = result.scalar_one_or_none()

                    # Avoid duplicate blocks (same height)
                    result = await session.execute(
                        select(Block.id).where(Block.block_height == height)
                    )
                    if result.scalar_one_or_none() is None:
                        block = Block(
                            block_height=height,
                            block_hash=block_hash or f"regtest-{height}",
                            user_id=user_id,
                            btc_address=user if user != "unknown" else None,
                            reward_btc=reward_sats / 1e8 if reward_sats else 50.0,
                            difficulty=diff if diff else None,
                            found_at=datetime.now(timezone.utc),
                            confirmed=True,
                            coinbase_sig=coinbase_sig or None,
                            source="hosted",
                        )
                        session.add(block)
                        await session.commit()
                        await session.refresh(block)
                        logger.info("Block %d persisted to DB (user=%s)", height, user)

                        # Create pending celebration so offline users see it on next login
                        if user_id is not None:
                            try:
                                from tbg.mining.service import create_block_celebration
                                await create_block_celebration(session, block.id, user_id)
                                logger.info("Celebration created for block %d user %d", height, user_id)
                            except Exception:
                                logger.exception("Failed to create celebration for block %d", height)
                    break
            except Exception:
                logger.exception("Failed to persist block %d", height)

        # Publish to WebSocket bridge (must match bridge.py CHANNEL_MAP)
        await self.redis.publish("pubsub:block_found", json.dumps({
            "type": "block_found",
            "user": user,
            "worker": worker,
            "height": height,
            "hash": block_hash,
            "reward": reward_sats / 1e8 if reward_sats else 50.0,
        }))

    async def _handle_connect(self, data: dict[str, str]) -> None:
        """Process miner_connected event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = self._normalize_worker_name(user, parsed.get("worker", ""))
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        now = datetime.now(timezone.utc).isoformat()

        mapping: dict[str, str] = {
            "is_online": "1",
            "connected_at": now,
            "current_diff": str(parsed.get("initial_diff", 0)),
            "shares_session": "0",
        }
        # Only overwrite ip/useragent if the event provides non-empty values
        ip = parsed.get("ip", "")
        useragent = parsed.get("useragent", "")
        if ip:
            mapping["ip"] = ip
        if useragent:
            mapping["useragent"] = useragent

        pipe = self.redis.pipeline()
        pipe.hset(key, mapping=mapping)
        pipe.expire(key, 86400)  # 24h TTL
        pipe.sadd(f"workers:{user}", worker)
        pipe.expire(f"workers:{user}", 86400)  # 24h TTL
        await pipe.execute()

    async def _handle_disconnect(self, data: dict[str, str]) -> None:
        """Process miner_disconnected event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = self._normalize_worker_name(user, parsed.get("worker", ""))
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        await self.redis.hset(key, "is_online", "0")

    async def _handle_diff_update(self, data: dict[str, str]) -> None:
        """Process diff_updated event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = self._normalize_worker_name(user, parsed.get("worker", ""))
        new_diff = parsed.get("new_diff", 0)
        if not user or not worker:
            return

        key = f"worker:{user}:{worker}"
        await self.redis.hset(key, "current_diff", str(new_diff))

    async def _handle_hashrate(self, data: dict[str, str]) -> None:
        """Process hashrate_update event."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        worker = self._normalize_worker_name(user, parsed.get("worker", ""))
        if not user or not worker:
            return

        # Update worker-level hashrate
        # CKPool may send hashrate_1d or hashrate_24h — accept both
        h_24h = parsed.get("hashrate_1d") or parsed.get("hashrate_24h") or 0
        key = f"worker:{user}:{worker}"
        pipe = self.redis.pipeline()
        pipe.hset(key, mapping={
            "hashrate_1m": str(parsed.get("hashrate_1m", 0)),
            "hashrate_5m": str(parsed.get("hashrate_5m", 0)),
            "hashrate_1h": str(parsed.get("hashrate_1h", 0)),
            "hashrate_24h": str(h_24h),
        })
        pipe.expire(key, 86400)  # 24h TTL
        await pipe.execute()

        # Aggregate user-level hashrate from all workers
        # Use _parse_si_hashrate to handle SI-suffixed values like "19.1M"
        worker_names: set[str] = await self.redis.smembers(f"workers:{user}")  # type: ignore[assignment]
        total = {"hashrate_1m": 0.0, "hashrate_5m": 0.0, "hashrate_1h": 0.0, "hashrate_24h": 0.0}
        for wn in worker_names:
            wdata: dict[str, str] = await self.redis.hgetall(f"worker:{user}:{wn}")  # type: ignore[assignment]
            for field in total:
                total[field] += _parse_si_hashrate(wdata.get(field, "0"))

        pipe2 = self.redis.pipeline()
        pipe2.hset(f"user_hashrate:{user}", mapping={
            k: str(v) for k, v in total.items()
        })
        pipe2.expire(f"user_hashrate:{user}", 3600)  # 1h TTL
        await pipe2.execute()

    async def _handle_network_block(self, data: dict[str, str]) -> None:
        """Process new_block_network event — cache network difficulty."""
        parsed = self._parse_data(data)
        pipe = self.redis.pipeline()
        pipe.set("network:difficulty", str(parsed.get("diff", 0)), ex=1200)  # 20-min TTL
        pipe.set("network:height", str(parsed.get("height", 0)), ex=1200)
        pipe.set("network:block_hash", str(parsed.get("hash", "")), ex=1200)
        await pipe.execute()

    async def _handle_best_diff(self, data: dict[str, str]) -> None:
        """Process share_best_diff event — publish notification."""
        parsed = self._parse_data(data)
        user = parsed.get("user", "")
        if not user:
            return

        await self.redis.publish(f"pubsub:best_diff", json.dumps({
            "type": "best_diff",
            "user": user,
            "worker": parsed.get("worker", ""),
            "new_best": parsed.get("new_best", 0),
            "prev_best": parsed.get("prev_best", 0),
            "timeframe": parsed.get("timeframe", "session"),
        }))


async def decay_idle_workers(redis_client: aioredis.Redis) -> int:
    """Decay hashrate for workers that haven't submitted shares recently.

    CKPool decays on every share event — but if shares stop arriving the
    EMA freezes.  This function applies a zero-diff decay pass so idle
    workers' hashrates gradually drop to zero.

    Should be called every ~10-30 seconds from the consumer runner.
    """
    decayed = 0
    now_ts = time.time()

    async for key in redis_client.scan_iter(match="worker:*:*"):
        key_str = key if isinstance(key, str) else key.decode()

        ema_fields = await redis_client.hmget(
            key_str, "dsps1", "dsps5", "dsps60", "dsps1440", "last_decay", "is_online",
        )
        dsps1 = float(ema_fields[0] or 0)
        dsps5 = float(ema_fields[1] or 0)
        dsps60 = float(ema_fields[2] or 0)
        dsps1440 = float(ema_fields[3] or 0)
        last_decay = float(ema_fields[4] or 0)
        is_online = ema_fields[5]

        # Only decay online workers with existing EMA state
        if is_online != "1" or last_decay <= 0:
            continue

        elapsed = now_ts - last_decay
        # Only decay if idle for >5 seconds and has non-zero hashrate
        if elapsed < 5.0 or (dsps1 == 0 and dsps5 == 0 and dsps60 == 0 and dsps1440 == 0):
            continue

        # Decay with zero new diff
        dsps1 = decay_time(dsps1, 0, elapsed, MIN1)
        dsps5 = decay_time(dsps5, 0, elapsed, MIN5)
        dsps60 = decay_time(dsps60, 0, elapsed, HOUR)
        dsps1440 = decay_time(dsps1440, 0, elapsed, DAY)

        pipe = redis_client.pipeline()
        pipe.hset(key_str, mapping={
            "dsps1": str(dsps1),
            "dsps5": str(dsps5),
            "dsps60": str(dsps60),
            "dsps1440": str(dsps1440),
            "last_decay": str(now_ts),
            "hashrate_1m": str(dsps1 * NONCES),
            "hashrate_5m": str(dsps5 * NONCES),
            "hashrate_1h": str(dsps60 * NONCES),
            "hashrate_24h": str(dsps1440 * NONCES),
        })
        await pipe.execute()
        decayed += 1

    # Also update user-level aggregates for any users with decayed workers
    if decayed > 0:
        user_keys: set[str] = set()
        async for key in redis_client.scan_iter(match="workers:*"):
            key_str = key if isinstance(key, str) else key.decode()
            user_keys.add(key_str)

        for user_key in user_keys:
            user_addr = user_key.split(":", 1)[1]
            worker_names: set[str] = await redis_client.smembers(user_key)  # type: ignore[assignment]
            total = {"hashrate_1m": 0.0, "hashrate_5m": 0.0, "hashrate_1h": 0.0, "hashrate_24h": 0.0}
            for wn in worker_names:
                wdata = await redis_client.hmget(
                    f"worker:{user_addr}:{wn}",
                    "hashrate_1m", "hashrate_5m", "hashrate_1h", "hashrate_24h",
                )
                total["hashrate_1m"] += float(wdata[0] or 0)
                total["hashrate_5m"] += float(wdata[1] or 0)
                total["hashrate_1h"] += float(wdata[2] or 0)
                total["hashrate_24h"] += float(wdata[3] or 0)

            pipe = redis_client.pipeline()
            pipe.hset(f"user_hashrate:{user_addr}", mapping={k: str(v) for k, v in total.items()})
            pipe.expire(f"user_hashrate:{user_addr}", 3600)
            await pipe.execute()

    return decayed


async def check_worker_timeouts(
    redis_client: aioredis.Redis,
    timeout_seconds: int = 300,
) -> int:
    """Mark workers offline if no activity within timeout.

    Falls back to connected_at when last_share is missing, so workers
    that connected but never submitted a share still get timed out.

    Returns:
        Number of workers marked offline.
    """
    marked = 0
    now_ts = time.time()

    async for key in redis_client.scan_iter(match="worker:*:*"):
        key_str = key if isinstance(key, str) else key.decode()
        data: dict[str, str] = await redis_client.hgetall(key_str)  # type: ignore[assignment]

        if data.get("is_online") != "1":
            continue

        # Use last_share if available, otherwise fall back to connected_at
        last_active = data.get("last_share") or data.get("connected_at")
        if not last_active:
            continue

        try:
            active_dt = datetime.fromisoformat(last_active)
            active_ts = active_dt.timestamp()
        except (ValueError, TypeError):
            continue

        if now_ts - active_ts > timeout_seconds:
            await redis_client.hset(key_str, "is_online", "0")
            marked += 1
            logger.info("Worker %s marked offline (timeout)", key_str)

    return marked
