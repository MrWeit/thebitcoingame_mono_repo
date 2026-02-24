"""Match scoring arq worker — processes live matches and generates recaps."""

from __future__ import annotations

import logging
import os

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import close_db, get_session, init_db
from tbg.db.models import Match

logger = logging.getLogger(__name__)


async def _get_db_session() -> AsyncSession:
    """Get a database session for the worker."""
    async for session in get_session():
        return session
    raise RuntimeError("Failed to get database session")


async def score_live_matches(ctx: dict) -> int:
    """Score all currently live matches. Runs every minute."""
    db = await _get_db_session()
    try:
        from tbg.competition.match_service import score_match

        result = await db.execute(
            select(Match).where(Match.status == "live")
        )
        live_matches = result.scalars().all()
        scored = 0

        for match in live_matches:
            try:
                await score_match(db, match.id)
                scored += 1
            except Exception:
                logger.exception("Failed to score match %d", match.id)

        if scored:
            logger.info("Scored %d live matches", scored)
        return scored
    finally:
        await db.close()


async def generate_recaps(ctx: dict) -> int:
    """Generate AI recaps for completed matches missing recaps. Runs every 5 min."""
    db = await _get_db_session()
    try:
        result = await db.execute(
            select(Match)
            .where(
                Match.status == "completed",
                Match.ai_recap.is_(None),
            )
            .limit(10)
        )
        matches = result.scalars().all()
        generated = 0

        if not matches:
            return 0

        from tbg.competition.recap_service import RecapService
        from tbg.db.models import CompetitionTeam, User

        settings = get_settings()
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        recap_service = RecapService(api_key=api_key if api_key else None)

        for match in matches:
            try:
                team_a = await db.get(CompetitionTeam, match.team_a_id)
                team_b = await db.get(CompetitionTeam, match.team_b_id)

                mom_name = None
                if match.man_of_match_user_id:
                    mom_result = await db.execute(
                        select(User).where(User.id == match.man_of_match_user_id)
                    )
                    mom_user = mom_result.scalar_one_or_none()
                    if mom_user:
                        mom_name = mom_user.display_name or f"Miner-{match.man_of_match_user_id}"

                stats = {
                    "team_a_country": team_a.country_name if team_a else "Team A",
                    "team_b_country": team_b.country_name if team_b else "Team B",
                    "hashrate_a": match.hashrate_a,
                    "hashrate_b": match.hashrate_b,
                    "miners_a": match.miners_a,
                    "miners_b": match.miners_b,
                    "mom_name": mom_name,
                    "mom_diff": match.man_of_match_diff or 0,
                }

                recap = await recap_service.generate_recap(match, stats)
                match.ai_recap = recap
                await db.commit()
                generated += 1

            except Exception:
                logger.exception("Failed to generate recap for match %d", match.id)

        if generated:
            logger.info("Generated %d match recaps", generated)
        return generated
    finally:
        await db.close()


async def match_worker_startup(ctx: dict) -> None:
    """Initialize connections on worker startup."""
    settings = get_settings()
    await init_db(settings.database_url)

    redis_url = os.environ.get("TBG_REDIS_URL", settings.redis_url)
    ctx["redis"] = aioredis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=10,
    )
    logger.info("Match worker started")


async def match_worker_shutdown(ctx: dict) -> None:
    """Clean up on worker shutdown."""
    redis_client = ctx.get("redis")
    if redis_client:
        await redis_client.aclose()
    await close_db()
    logger.info("Match worker shut down")


class MatchWorkerSettings:
    """arq worker settings for match scoring and recaps."""

    functions = [score_live_matches, generate_recaps]
    on_startup = match_worker_startup
    on_shutdown = match_worker_shutdown
    max_jobs = 4
    job_timeout = 120
