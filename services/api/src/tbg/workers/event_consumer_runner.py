"""Standalone runner for the mining event consumer.

Usage: python -m tbg.workers.event_consumer_runner
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis

from tbg.config import get_settings
from tbg.database import close_db, get_session, init_db
from tbg.mining.consumer import MiningEventConsumer, check_worker_timeouts, decay_idle_workers, _parse_si_hashrate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 300  # 5 minutes
LEADERBOARD_INTERVAL = 60  # 1 minute
DECAY_INTERVAL = 15  # seconds — decay idle workers' hashrate EMA
DAILY_STATS_INTERVAL = 300  # 5 minutes — update today's daily stats


async def snapshot_hashrates(redis_client: aioredis.Redis) -> int:
    """Snapshot current hashrate data from Redis into the DB.

    Scans all worker:* keys and writes HashrateSnapshot rows for
    both per-worker and user-aggregate levels.
    """
    from tbg.db.models import HashrateSnapshot, User
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    written = 0

    async for session in get_session():
        try:
            # Find all user btc addresses that have workers
            user_keys: set[str] = set()
            async for key in redis_client.scan_iter(match="workers:*"):
                key_str = key if isinstance(key, str) else key.decode()
                user_keys.add(key_str)

            for user_key in user_keys:
                btc_address = user_key.split(":", 1)[1]

                # Look up user_id
                result = await session.execute(
                    select(User.id).where(User.btc_address == btc_address)
                )
                user_id = result.scalar_one_or_none()
                if user_id is None:
                    continue

                # Get all worker names
                worker_names: set[str] = await redis_client.smembers(user_key)  # type: ignore[assignment]

                agg = {"hashrate_1m": 0.0, "hashrate_5m": 0.0, "hashrate_1h": 0.0, "hashrate_24h": 0.0}
                online_count = 0

                for wn in worker_names:
                    wdata: dict[str, str] = await redis_client.hgetall(f"worker:{btc_address}:{wn}")  # type: ignore[assignment]
                    if not wdata:
                        continue

                    h_1m = _parse_si_hashrate(wdata.get("hashrate_1m", "0"))
                    h_5m = _parse_si_hashrate(wdata.get("hashrate_5m", "0"))
                    h_1h = _parse_si_hashrate(wdata.get("hashrate_1h", "0"))
                    h_24h = _parse_si_hashrate(wdata.get("hashrate_24h", "0"))

                    if wdata.get("is_online") == "1":
                        online_count += 1

                    agg["hashrate_1m"] += h_1m
                    agg["hashrate_5m"] += h_5m
                    agg["hashrate_1h"] += h_1h
                    agg["hashrate_24h"] += h_24h

                    # Per-worker snapshot
                    session.add(HashrateSnapshot(
                        time=now,
                        user_id=user_id,
                        worker_name=wn,
                        hashrate_1m=h_1m,
                        hashrate_5m=h_5m,
                        hashrate_1h=h_1h,
                        hashrate_24h=h_24h,
                        workers_online=1 if wdata.get("is_online") == "1" else 0,
                    ))
                    written += 1

                # User-aggregate snapshot (worker_name=None)
                # Use a 1-microsecond offset to avoid PK collision with per-worker snapshot
                agg_time = now + timedelta(microseconds=1)
                session.add(HashrateSnapshot(
                    time=agg_time,
                    user_id=user_id,
                    worker_name=None,
                    hashrate_1m=agg["hashrate_1m"],
                    hashrate_5m=agg["hashrate_5m"],
                    hashrate_1h=agg["hashrate_1h"],
                    hashrate_24h=agg["hashrate_24h"],
                    workers_online=online_count,
                ))
                written += 1

            await session.commit()
        except Exception:
            logger.exception("Hashrate snapshot error")
            await session.rollback()
        break

    return written


async def refresh_leaderboard(redis_client: aioredis.Redis) -> int:
    """Populate leaderboard Redis sorted sets from mining data.

    Reads best_diff from Redis worker hashes and personal bests from DB,
    then writes to the leaderboard sorted sets.
    """
    from tbg.db.models import User, PersonalBest, Share
    from tbg.games.week_utils import get_current_week_iso
    from sqlalchemy import func, select

    updated = 0
    week_iso = get_current_week_iso()
    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")

    async for session in get_session():
        try:
            # Get all users with btc addresses
            result = await session.execute(
                select(User.id, User.btc_address).where(User.btc_address.isnot(None))
            )
            users = result.all()

            pipe = redis_client.pipeline()

            for user_id, btc_address in users:
                if not btc_address:
                    continue

                # Get best diff from Redis worker hashes (real-time)
                worker_names: set[str] = await redis_client.smembers(f"workers:{btc_address}")  # type: ignore[assignment]
                user_best_diff = 0.0
                for wn in worker_names:
                    bd = await redis_client.hget(f"worker:{btc_address}:{wn}", "best_diff")
                    if bd:
                        try:
                            d = float(bd)
                            if d > user_best_diff:
                                user_best_diff = d
                        except ValueError:
                            pass

                # Also check DB personal bests
                pb_result = await session.execute(
                    select(func.max(PersonalBest.best_difficulty))
                    .where(PersonalBest.user_id == user_id)
                )
                db_best = pb_result.scalar() or 0.0
                user_best_diff = max(user_best_diff, float(db_best))

                if user_best_diff > 0:
                    # Weekly leaderboard
                    pipe.zadd(f"leaderboard:weekly:{week_iso}", {str(user_id): user_best_diff})
                    # Monthly leaderboard
                    pipe.zadd(f"leaderboard:monthly:{month_key}", {str(user_id): user_best_diff})
                    # All-time leaderboard
                    pipe.zadd("leaderboard:alltime", {str(user_id): user_best_diff})
                    updated += 1

            # Set TTLs on weekly/monthly keys
            pipe.expire(f"leaderboard:weekly:{week_iso}", 86400 * 14)
            pipe.expire(f"leaderboard:monthly:{month_key}", 86400 * 60)

            await pipe.execute()
        except Exception:
            logger.exception("Leaderboard refresh error")
        break

    return updated


async def update_daily_stats(redis_client: aioredis.Redis) -> int:
    """Update today's UserDailyStats from shares table and Redis worker state.

    Runs every few minutes; upserts the row for today so the uptime
    calendar always has fresh data.
    """
    from tbg.db.models import UserDailyStats, User, Share
    from sqlalchemy import func, select

    now = datetime.now(timezone.utc)
    # UserDailyStats.day is timezone-naive DateTime, so strip tzinfo
    today_start_naive = now.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)
    today_start_tz = now.replace(hour=0, minute=0, second=0, microsecond=0)
    updated = 0

    async for session in get_session():
        try:
            # Find all users with btc addresses
            result = await session.execute(
                select(User.id, User.btc_address).where(User.btc_address.isnot(None))
            )
            users = result.all()

            for user_id, btc_address in users:
                if not btc_address:
                    continue

                # Count today's shares from DB (Share.time is tz-aware)
                share_result = await session.execute(
                    select(
                        func.count().label("total"),
                        func.count().filter(Share.is_valid.is_(True)).label("accepted"),
                        func.count().filter(Share.is_valid.is_(False)).label("rejected"),
                        func.max(Share.share_diff).label("best_diff"),
                        func.avg(Share.share_diff).label("avg_diff"),
                    )
                    .where(Share.btc_address == btc_address)
                    .where(Share.time >= today_start_tz)
                )
                row = share_result.one()
                total = row.total or 0
                accepted = row.accepted or 0
                rejected = row.rejected or 0
                best_diff = float(row.best_diff or 0)
                avg_diff = float(row.avg_diff or 0)

                # Compute uptime from connected_at (minutes since connect, capped at today)
                worker_names: set[str] = await redis_client.smembers(f"workers:{btc_address}")  # type: ignore[assignment]
                uptime_minutes = 0
                workers_seen = len(worker_names)
                for wn in worker_names:
                    connected_at = await redis_client.hget(f"worker:{btc_address}:{wn}", "connected_at")
                    is_online = await redis_client.hget(f"worker:{btc_address}:{wn}", "is_online")
                    if connected_at and is_online == "1":
                        try:
                            conn_dt = datetime.fromisoformat(connected_at)
                            # Uptime is from max(connected_at, today_start) to now
                            start = max(conn_dt, today_start_tz)
                            minutes = max(0, int((now - start).total_seconds() / 60))
                            uptime_minutes = max(uptime_minutes, minutes)
                        except (ValueError, TypeError):
                            pass

                # Upsert daily stats (day column is tz-naive)
                existing = await session.execute(
                    select(UserDailyStats)
                    .where(UserDailyStats.user_id == user_id)
                    .where(UserDailyStats.day == today_start_naive)
                )
                stats = existing.scalar_one_or_none()

                if stats is None:
                    session.add(UserDailyStats(
                        user_id=user_id,
                        day=today_start_naive,
                        total_shares=total,
                        accepted_shares=accepted,
                        rejected_shares=rejected,
                        best_diff=best_diff,
                        avg_diff=avg_diff,
                        uptime_minutes=uptime_minutes,
                        workers_seen=workers_seen,
                    ))
                else:
                    stats.total_shares = total
                    stats.accepted_shares = accepted
                    stats.rejected_shares = rejected
                    stats.best_diff = best_diff
                    stats.avg_diff = avg_diff
                    stats.uptime_minutes = uptime_minutes
                    stats.workers_seen = workers_seen

                updated += 1

            await session.commit()
        except Exception:
            logger.exception("Daily stats update error")
            await session.rollback()
        break

    return updated


async def main() -> None:
    """Run the event consumer and timeout checker."""
    redis_url = os.environ.get("TBG_REDIS_URL", "redis://localhost:6379/0")
    consumer_name = os.environ.get("TBG_CONSUMER_NAME", "api-worker-1")
    timeout_seconds = int(os.environ.get("TBG_WORKER_TIMEOUT_SECONDS", "300"))

    # Initialize DB for block persistence
    settings = get_settings()
    await init_db(settings.database_url)

    redis_client = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )

    consumer = MiningEventConsumer(
        redis_client=redis_client,
        db_session_factory=get_session,
        consumer_name=consumer_name,
    )

    # Handle graceful shutdown
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, consumer.stop)

    async def timeout_checker() -> None:
        """Periodically check for timed-out workers."""
        # Wait for consumer to start before entering loop
        while not consumer._running:
            await asyncio.sleep(1)
        while consumer._running:
            try:
                marked = await check_worker_timeouts(redis_client, timeout_seconds)
                if marked:
                    logger.info("Timeout checker: marked %d workers offline", marked)
            except Exception:
                logger.exception("Timeout checker error")
            await asyncio.sleep(30)

    async def hashrate_snapshotter() -> None:
        """Periodically write hashrate snapshots to DB."""
        while not consumer._running:
            await asyncio.sleep(1)
        while consumer._running:
            try:
                count = await snapshot_hashrates(redis_client)
                if count > 0:
                    logger.info("Hashrate snapshotter: wrote %d snapshots", count)
            except Exception:
                logger.exception("Hashrate snapshotter error")
            await asyncio.sleep(SNAPSHOT_INTERVAL)

    async def leaderboard_refresher() -> None:
        """Periodically refresh leaderboard sorted sets."""
        while not consumer._running:
            await asyncio.sleep(1)
        while consumer._running:
            try:
                count = await refresh_leaderboard(redis_client)
                if count > 0:
                    logger.info("Leaderboard refresher: updated %d users", count)
            except Exception:
                logger.exception("Leaderboard refresher error")
            await asyncio.sleep(LEADERBOARD_INTERVAL)

    async def hashrate_decayer() -> None:
        """Periodically decay idle workers' EMA hashrate toward zero."""
        while not consumer._running:
            await asyncio.sleep(1)
        while consumer._running:
            try:
                count = await decay_idle_workers(redis_client)
                if count > 0:
                    logger.debug("Hashrate decayer: decayed %d idle workers", count)
            except Exception:
                logger.exception("Hashrate decayer error")
            await asyncio.sleep(DECAY_INTERVAL)

    async def daily_stats_updater() -> None:
        """Periodically update today's daily stats for uptime calendar."""
        while not consumer._running:
            await asyncio.sleep(1)
        while consumer._running:
            try:
                count = await update_daily_stats(redis_client)
                if count > 0:
                    logger.info("Daily stats updater: updated %d users", count)
            except Exception:
                logger.exception("Daily stats updater error")
            await asyncio.sleep(DAILY_STATS_INTERVAL)

    logger.info("Starting mining event consumer (consumer=%s)", consumer_name)

    try:
        await asyncio.gather(
            consumer.run(),
            timeout_checker(),
            hashrate_snapshotter(),
            leaderboard_refresher(),
            hashrate_decayer(),
            daily_stats_updater(),
        )
    finally:
        await redis_client.aclose()
        await close_db()
        logger.info("Event consumer stopped")


if __name__ == "__main__":
    asyncio.run(main())
