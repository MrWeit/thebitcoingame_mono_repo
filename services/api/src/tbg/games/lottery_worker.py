"""Lottery arq worker — scheduled tasks for weekly draw and ranking refresh.

Runs as part of the gamification worker or as a standalone arq process.
"""

from __future__ import annotations

import logging
import os

import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import close_db, get_session, init_db
from tbg.games.game_data_service import refresh_ranking_cache
from tbg.games.lottery_service import execute_weekly_draw
from tbg.games.week_utils import get_last_week_iso

logger = logging.getLogger(__name__)


async def _get_db_session() -> AsyncSession:
    """Get a database session for the worker."""
    async for session in get_session():
        return session
    raise RuntimeError("Failed to get database session")


async def lottery_startup(ctx: dict) -> None:  # type: ignore[type-arg]
    """Initialize Redis + DB connections on worker startup."""
    settings = get_settings()
    await init_db(settings.database_url)

    redis_url = os.environ.get("TBG_REDIS_URL", settings.redis_url)
    redis_client = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=10,
    )
    ctx["redis"] = redis_client
    logger.info("Lottery worker started")


async def lottery_shutdown(ctx: dict) -> None:  # type: ignore[type-arg]
    """Clean up on worker shutdown."""
    redis_client: aioredis.Redis | None = ctx.get("redis")
    if redis_client:
        await redis_client.aclose()
    await close_db()
    logger.info("Lottery worker shut down")


async def weekly_lottery_draw(ctx: dict) -> None:  # type: ignore[type-arg]
    """Scheduled arq task: runs every Monday at 00:01 UTC.

    Draws the lottery for the week that just ended (Sunday 23:59:59 UTC).
    Idempotent: will not create duplicate draws.
    """
    last_week = get_last_week_iso()
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()

    try:
        draw = await execute_weekly_draw(db, redis_client, last_week)
        logger.info(
            "Lottery draw complete: %s, %d participants, winner: %s",
            last_week, draw.total_participants, draw.winner_user_id,
        )
    except Exception:
        logger.exception("Failed to execute lottery draw for %s", last_week)
    finally:
        await db.close()


async def refresh_rankings(ctx: dict) -> None:  # type: ignore[type-arg]
    """Periodic task: refresh ranking cache every 5 minutes."""
    redis_client: aioredis.Redis = ctx["redis"]
    db = await _get_db_session()

    try:
        total = await refresh_ranking_cache(db, redis_client)
        logger.info("Ranking cache refreshed: %d participants", total)
    except Exception:
        logger.exception("Failed to refresh ranking cache")
    finally:
        await db.close()


class LotteryWorkerSettings:
    """arq worker settings for the lottery scheduler."""

    functions = [weekly_lottery_draw, refresh_rankings]
    on_startup = lottery_startup
    on_shutdown = lottery_shutdown
    max_jobs = 4
    job_timeout = 300  # 5 minutes max for draw execution
    allow_abort_jobs = True
    # cron_jobs would be configured here for production:
    # cron_jobs = [
    #     cron(weekly_lottery_draw, weekday=0, hour=0, minute=1),  # Monday 00:01 UTC
    #     cron(refresh_rankings, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}),
    # ]
