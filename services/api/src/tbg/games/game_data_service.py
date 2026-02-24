"""Game data aggregation service.

Assembles the WeeklyGameData response from multiple database tables
and caches the result in Redis for performance.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    Block,
    NetworkDifficulty,
    Share,
    User,
    WeeklyBestDiff,
)
from tbg.games.schemas import BlockFoundDataResponse, WeeklyGameDataResponse
from tbg.games.week_utils import (
    calculate_percentile,
    get_current_week_boundaries,
    get_current_week_iso,
    get_week_boundaries,
)

logger = logging.getLogger(__name__)

# PostgreSQL extract(dow) → day key mapping
# PostgreSQL: 0=Sunday, 1=Monday, ..., 6=Saturday
PG_DOW_TO_KEY = {1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun"}

# Cache keys
GAME_DATA_CACHE_PREFIX = "game:weekly"
GAME_DATA_TTL = 60  # 60 seconds
NETWORK_DIFF_CACHE_KEY = "network:difficulty"
NETWORK_DIFF_TTL = 600  # 10 minutes
RANKING_CACHE_PREFIX = "lottery:rank"
RANKING_TTL = 300  # 5 minutes


async def get_weekly_game_data(
    db: AsyncSession,
    redis: object,
    user: User,
    week_start: datetime | None = None,
    week_end: datetime | None = None,
) -> WeeklyGameDataResponse:
    """Assemble the full WeeklyGameData response for a user.

    Checks Redis cache first, then queries multiple tables.
    """
    if week_start is None or week_end is None:
        week_start, week_end = get_current_week_boundaries()

    week_iso = get_current_week_iso(week_start)

    # Check cache
    cache_key = f"{GAME_DATA_CACHE_PREFIX}:{user.id}:{week_iso}"
    if redis is not None:
        try:
            cached = await redis.get(cache_key)  # type: ignore[union-attr]
            if cached:
                data = json.loads(cached)
                return WeeklyGameDataResponse(**data)
        except Exception:
            logger.debug("Cache miss for game data", exc_info=True)

    # Aggregate from multiple sources
    best_diff_record = await _get_weekly_best_diff(db, user.id, week_start)
    daily_diffs = await _get_daily_best_diffs(db, user.id, week_start, week_end)
    total_shares = await _get_weekly_share_count(db, user.id, week_start, week_end)
    network_diff = await _get_network_difficulty(db, redis)
    rank_info = await get_live_weekly_rank(db, redis, user.id, week_start)
    block_data = await _get_weekly_block(db, user.id, week_start, week_end)

    best_diff = best_diff_record.best_difficulty if best_diff_record else 0.0
    progress_ratio = best_diff / network_diff if network_diff > 0 else 0.0

    response = WeeklyGameDataResponse(
        week_start=week_start,
        week_end=week_end,
        best_difficulty=best_diff,
        best_difficulty_time=best_diff_record.best_share_time if best_diff_record else None,
        best_hash=await _get_best_hash(db, user.id, best_diff, week_start, week_end) if best_diff > 0 else "",
        network_difficulty=network_diff,
        progress_ratio=progress_ratio,
        daily_best_diffs=daily_diffs,
        total_shares=total_shares,
        weekly_rank=rank_info["rank"],
        percentile=rank_info["percentile"],
        block_found=block_data is not None,
        block_data=block_data,
        user_name=user.display_name or (user.btc_address[:12] if user.btc_address else ""),
    )

    # Cache the result
    if redis is not None:
        try:
            await redis.setex(  # type: ignore[union-attr]
                cache_key,
                GAME_DATA_TTL,
                response.model_dump_json(),
            )
        except Exception:
            logger.debug("Failed to cache game data", exc_info=True)

    return response


async def _get_weekly_best_diff(
    db: AsyncSession, user_id: int, week_start: datetime
) -> WeeklyBestDiff | None:
    """Get user's best difficulty record for the week."""
    result = await db.execute(
        select(WeeklyBestDiff).where(
            WeeklyBestDiff.user_id == user_id,
            WeeklyBestDiff.week_start == week_start.date() if isinstance(week_start, datetime) else week_start,
        )
    )
    return result.scalar_one_or_none()


async def _get_best_hash(
    db: AsyncSession, user_id: int, best_diff: float, week_start: datetime, week_end: datetime
) -> str:
    """Get the hash of the share that achieved the best difficulty."""
    # Look for shares matching the best diff for this user in this week
    # The share with block_hash set and matching diff is the best hash
    result = await db.execute(
        select(Share.block_hash).where(
            Share.btc_address == select(User.btc_address).where(User.id == user_id).correlate_except(Share).scalar_subquery(),
            Share.share_diff == best_diff,
            Share.time >= week_start,
            Share.time <= week_end,
        ).limit(1)
    )
    row = result.scalar_one_or_none()
    return row or ""


async def _get_daily_best_diffs(
    db: AsyncSession, user_id: int, week_start: datetime, week_end: datetime
) -> dict[str, float]:
    """Get user's best difficulty per day for the week.

    Returns {"mon": N, "tue": N, ..., "sun": N} with 0 for missing days.
    """
    # Get user's btc_address for shares query
    user_result = await db.execute(
        select(User.btc_address).where(User.id == user_id)
    )
    btc_address = user_result.scalar_one_or_none()
    if not btc_address:
        return {"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0}

    result = await db.execute(
        select(
            func.extract("dow", Share.time).label("dow"),
            func.max(Share.share_diff).label("best_diff"),
        ).where(
            Share.btc_address == btc_address,
            Share.time >= week_start,
            Share.time <= week_end,
            Share.is_valid.is_(True),
        ).group_by(func.extract("dow", Share.time))
    )

    daily: dict[str, float] = {"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0}
    for row in result.all():
        key = PG_DOW_TO_KEY.get(int(row.dow))
        if key:
            daily[key] = float(row.best_diff)

    return daily


async def _get_weekly_share_count(
    db: AsyncSession, user_id: int, week_start: datetime, week_end: datetime
) -> int:
    """Count total shares for a user in a week."""
    user_result = await db.execute(
        select(User.btc_address).where(User.id == user_id)
    )
    btc_address = user_result.scalar_one_or_none()
    if not btc_address:
        return 0

    result = await db.execute(
        select(func.count()).select_from(Share).where(
            Share.btc_address == btc_address,
            Share.time >= week_start,
            Share.time <= week_end,
        )
    )
    return result.scalar_one() or 0


async def _get_network_difficulty(db: AsyncSession, redis: object) -> float:
    """Get the current network difficulty, cached in Redis."""
    # Try Redis cache
    if redis is not None:
        try:
            cached = await redis.get(NETWORK_DIFF_CACHE_KEY)  # type: ignore[union-attr]
            if cached:
                return float(cached)
        except Exception:
            pass

    # Query from network_difficulty table (latest entry)
    result = await db.execute(
        select(NetworkDifficulty.difficulty)
        .order_by(NetworkDifficulty.time.desc())
        .limit(1)
    )
    diff = result.scalar_one_or_none()
    network_diff = float(diff) if diff else 100_000_000_000_000.0  # Default fallback

    # Cache it
    if redis is not None:
        try:
            await redis.setex(NETWORK_DIFF_CACHE_KEY, NETWORK_DIFF_TTL, str(network_diff))  # type: ignore[union-attr]
        except Exception:
            pass

    return network_diff


async def get_live_weekly_rank(
    db: AsyncSession, redis: object, user_id: int, week_start: datetime
) -> dict[str, int | float]:
    """Compute user's live rank for the current week.

    For large user bases, this should be cached in Redis and refreshed
    periodically (every 5 min) via an arq task.
    """
    week_date = week_start.date() if isinstance(week_start, datetime) else week_start

    # Try cache first
    week_iso = get_current_week_iso(week_start)
    cache_key = f"{RANKING_CACHE_PREFIX}:{week_iso}"

    if redis is not None:
        try:
            cached = await redis.get(cache_key)  # type: ignore[union-attr]
            if cached:
                rankings = json.loads(cached)
                for entry in rankings:
                    if entry["user_id"] == user_id:
                        return {
                            "rank": entry["rank"],
                            "percentile": entry["percentile"],
                            "total_participants": len(rankings),
                        }
                # User not in rankings = no shares this week
                return {"rank": 0, "percentile": 0.0, "total_participants": len(rankings)}
        except Exception:
            logger.debug("Ranking cache miss", exc_info=True)

    # Compute live
    all_diffs = await db.execute(
        select(
            WeeklyBestDiff.user_id,
            WeeklyBestDiff.best_difficulty,
        ).where(
            WeeklyBestDiff.week_start == week_date,
        ).order_by(WeeklyBestDiff.best_difficulty.desc())
    )

    results = all_diffs.all()
    total = len(results)

    if total == 0:
        return {"rank": 0, "percentile": 0.0, "total_participants": 0}

    user_rank = 0
    for idx, row in enumerate(results):
        if row.user_id == user_id:
            user_rank = idx + 1
            break

    if user_rank == 0:
        return {"rank": 0, "percentile": 0.0, "total_participants": total}

    percentile = calculate_percentile(user_rank, total)
    return {"rank": user_rank, "percentile": percentile, "total_participants": total}


async def refresh_ranking_cache(db: AsyncSession, redis: object) -> int:
    """Rebuild the ranking cache for the current week. Called by arq periodic task."""
    week_start, _ = get_current_week_boundaries()
    week_date = week_start.date()
    week_iso = get_current_week_iso(week_start)

    all_diffs = await db.execute(
        select(
            WeeklyBestDiff.user_id,
            WeeklyBestDiff.best_difficulty,
        ).where(
            WeeklyBestDiff.week_start == week_date,
        ).order_by(WeeklyBestDiff.best_difficulty.desc())
    )

    results = all_diffs.all()
    total = len(results)

    rankings = []
    for idx, row in enumerate(results):
        rank = idx + 1
        rankings.append({
            "user_id": row.user_id,
            "rank": rank,
            "percentile": calculate_percentile(rank, total),
            "best_difficulty": row.best_difficulty,
        })

    cache_key = f"{RANKING_CACHE_PREFIX}:{week_iso}"
    if redis is not None:
        try:
            await redis.setex(cache_key, RANKING_TTL, json.dumps(rankings))  # type: ignore[union-attr]
        except Exception:
            logger.warning("Failed to cache ranking", exc_info=True)

    return total


async def _get_weekly_block(
    db: AsyncSession, user_id: int, week_start: datetime, week_end: datetime
) -> BlockFoundDataResponse | None:
    """Check if user found a block this week."""
    result = await db.execute(
        select(Block).where(
            Block.user_id == user_id,
            Block.found_at >= week_start,
            Block.found_at <= week_end,
        ).order_by(Block.found_at.desc()).limit(1)
    )
    block = result.scalar_one_or_none()
    if block is None:
        return None

    return BlockFoundDataResponse(
        height=block.block_height,
        reward=float(block.reward_btc) if block.reward_btc else 0.0,
        hash=block.block_hash,
    )
