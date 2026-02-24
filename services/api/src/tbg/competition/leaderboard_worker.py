"""Leaderboard refresh arq worker — periodic Redis sorted set rebuilds.

Intervals:
- Weekly: every 5 minutes
- Monthly: every hour
- All-time: every hour
- Country: every hour
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import close_db, get_session, init_db
from tbg.db.models import (
    CountryRanking,
    User,
    UserGamification,
    WeeklyBestDiff,
    Worker,
)
from tbg.competition.leaderboard_service import save_snapshot
from tbg.games.week_utils import get_current_week_iso

logger = logging.getLogger(__name__)


async def _get_db_session() -> AsyncSession:
    """Get a database session for the worker."""
    async for session in get_session():
        return session
    raise RuntimeError("Failed to get database session")


async def refresh_weekly_leaderboard(ctx: dict) -> int:
    """Refresh weekly leaderboard from weekly_best_diff table. Runs every 5 minutes."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()
    try:
        week_iso = get_current_week_iso()
        key = f"leaderboard:weekly:{week_iso}"

        result = await db.execute(
            select(WeeklyBestDiff.user_id, WeeklyBestDiff.best_difficulty)
            .where(WeeklyBestDiff.user_id.isnot(None))
        )
        rows = result.all()

        # Filter for current week by week_start
        # WeeklyBestDiff may contain multiple weeks; filter here
        now = datetime.now(timezone.utc)
        from tbg.games.week_utils import get_monday
        current_monday = get_monday(now)

        result = await db.execute(
            select(WeeklyBestDiff.user_id, WeeklyBestDiff.best_difficulty)
            .where(
                WeeklyBestDiff.user_id.isnot(None),
                WeeklyBestDiff.week_start == current_monday,
            )
        )
        rows = result.all()

        pipe = redis_client.pipeline()
        pipe.delete(key)
        for row in rows:
            pipe.zadd(key, {str(row.user_id): row.best_difficulty})
        pipe.expire(key, 86400 * 7)
        await pipe.execute()

        # Save snapshot for rank_change
        await save_snapshot(redis_client, db, "weekly", week_iso)

        logger.info("Weekly leaderboard refreshed: %d entries", len(rows))
        return len(rows)
    finally:
        await db.close()


async def refresh_monthly_leaderboard(ctx: dict) -> int:
    """Refresh monthly leaderboard. Runs every hour."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()
    try:
        now = datetime.now(timezone.utc)
        year_month = now.strftime("%Y-%m")
        key = f"leaderboard:monthly:{year_month}"
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        result = await db.execute(
            select(
                WeeklyBestDiff.user_id,
                func.max(WeeklyBestDiff.best_difficulty).label("best_diff"),
            )
            .where(
                WeeklyBestDiff.user_id.isnot(None),
                WeeklyBestDiff.week_start >= month_start.date(),
            )
            .group_by(WeeklyBestDiff.user_id)
        )
        rows = result.all()

        pipe = redis_client.pipeline()
        pipe.delete(key)
        for row in rows:
            pipe.zadd(key, {str(row.user_id): row.best_diff})
        pipe.expire(key, 86400 * 31)
        await pipe.execute()

        await save_snapshot(redis_client, db, "monthly", year_month)

        logger.info("Monthly leaderboard refreshed: %d entries", len(rows))
        return len(rows)
    finally:
        await db.close()


async def refresh_alltime_leaderboard(ctx: dict) -> int:
    """Refresh all-time leaderboard. Runs every hour."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()
    try:
        key = "leaderboard:alltime"

        result = await db.execute(
            select(UserGamification.user_id, UserGamification.best_difficulty)
            .where(UserGamification.best_difficulty > 0)
        )
        rows = result.all()

        pipe = redis_client.pipeline()
        pipe.delete(key)
        for row in rows:
            pipe.zadd(key, {str(row.user_id): row.best_difficulty})
        await pipe.execute()

        await save_snapshot(redis_client, db, "alltime", "alltime")

        logger.info("All-time leaderboard refreshed: %d entries", len(rows))
        return len(rows)
    finally:
        await db.close()


async def refresh_country_leaderboard(ctx: dict) -> int:
    """Refresh country leaderboard. Runs every hour."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()
    try:
        week_iso = get_current_week_iso()
        key = f"leaderboard:country:{week_iso}"

        result = await db.execute(
            select(
                User.country_code,
                func.count(distinct(User.id)).label("miner_count"),
                func.sum(Worker.hashrate_1h).label("total_hashrate"),
            )
            .join(Worker, Worker.user_id == User.id)
            .where(User.country_code.isnot(None))
            .group_by(User.country_code)
        )
        rows = result.all()

        pipe = redis_client.pipeline()
        pipe.delete(key)
        for row in rows:
            pipe.zadd(key, {row.country_code: float(row.total_hashrate or 0)})
        pipe.expire(key, 86400 * 7)
        await pipe.execute()

        # Also save to PostgreSQL country_rankings
        from tbg.competition.leaderboard_service import COUNTRY_NAMES
        from sqlalchemy.dialects.postgresql import insert
        now = datetime.now(timezone.utc)

        sorted_rows = sorted(rows, key=lambda r: float(r.total_hashrate or 0), reverse=True)
        for rank_offset, row in enumerate(sorted_rows):
            stmt = insert(CountryRanking).values(
                country_code=row.country_code,
                country_name=COUNTRY_NAMES.get(row.country_code, row.country_code),
                period_key=week_iso,
                rank=rank_offset + 1,
                miner_count=row.miner_count,
                total_hashrate=float(row.total_hashrate or 0),
                updated_at=now,
            ).on_conflict_do_update(
                constraint="country_rankings_code_period_key",
                set_={
                    "rank": rank_offset + 1,
                    "miner_count": row.miner_count,
                    "total_hashrate": float(row.total_hashrate or 0),
                    "updated_at": now,
                },
            )
            await db.execute(stmt)
        await db.commit()

        logger.info("Country leaderboard refreshed: %d countries", len(rows))
        return len(rows)
    finally:
        await db.close()


async def leaderboard_startup(ctx: dict) -> None:
    """Initialize Redis + DB connections on worker startup."""
    settings = get_settings()
    await init_db(settings.database_url)

    redis_url = os.environ.get("TBG_REDIS_URL", settings.redis_url)
    ctx["redis"] = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    logger.info("Leaderboard worker started")


async def leaderboard_shutdown(ctx: dict) -> None:
    """Clean up on worker shutdown."""
    redis_client = ctx.get("redis")
    if redis_client:
        await redis_client.aclose()
    await close_db()
    logger.info("Leaderboard worker shut down")


class LeaderboardWorkerSettings:
    """arq worker settings for leaderboard refresh."""

    functions = [
        refresh_weekly_leaderboard,
        refresh_monthly_leaderboard,
        refresh_alltime_leaderboard,
        refresh_country_leaderboard,
    ]
    on_startup = leaderboard_startup
    on_shutdown = leaderboard_shutdown
    max_jobs = 4
    job_timeout = 300  # 5 minutes max per job
    # Cron jobs defined when deploying via arq CLI:
    # Weekly: every 5 min, Monthly/Alltime/Country: every hour
