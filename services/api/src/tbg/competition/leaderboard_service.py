"""Leaderboard service — Redis sorted sets for O(log N) ranking.

All leaderboard reads go through Redis. PostgreSQL is only for
persistence (snapshots) and data refresh (building the sorted sets).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    LeaderboardSnapshot,
    User,
    UserBadge,
    UserGamification,
    WeeklyBestDiff,
    Worker,
)
from tbg.games.week_utils import get_current_week_iso

logger = logging.getLogger(__name__)

# Country code → name lookup
COUNTRY_NAMES: dict[str, str] = {
    "US": "United States", "JP": "Japan", "DE": "Germany", "GB": "United Kingdom",
    "CA": "Canada", "BR": "Brazil", "AU": "Australia", "FR": "France",
    "ES": "Spain", "NL": "Netherlands", "NO": "Norway", "PT": "Portugal",
    "CH": "Switzerland", "KR": "South Korea", "SE": "Sweden", "IT": "Italy",
    "MX": "Mexico", "AR": "Argentina", "IN": "India", "SG": "Singapore",
}


def build_leaderboard_key(period: str, week_iso: str | None = None) -> str:
    """Build Redis sorted set key for a leaderboard period."""
    if period == "weekly":
        key_suffix = week_iso or get_current_week_iso()
        return f"leaderboard:weekly:{key_suffix}"
    elif period == "monthly":
        now = datetime.now(timezone.utc)
        return f"leaderboard:monthly:{now.strftime('%Y-%m')}"
    elif period == "alltime":
        return "leaderboard:alltime"
    elif period == "country":
        key_suffix = week_iso or get_current_week_iso()
        return f"leaderboard:country:{key_suffix}"
    raise ValueError(f"Unknown period: {period}")


async def get_user_profiles_batch(
    db: AsyncSession, user_ids: list[int],
) -> dict[int, dict]:
    """Batch-load user profiles for leaderboard enrichment."""
    if not user_ids:
        return {}

    result = await db.execute(
        select(User).where(User.id.in_(user_ids))
    )
    users = {u.id: u for u in result.scalars()}

    # Load gamification data
    gam_result = await db.execute(
        select(UserGamification).where(UserGamification.user_id.in_(user_ids))
    )
    gam_map = {g.user_id: g for g in gam_result.scalars()}

    # Load worker counts
    worker_result = await db.execute(
        select(Worker.user_id, func.count(Worker.id).label("cnt"))
        .where(Worker.user_id.in_(user_ids))
        .group_by(Worker.user_id)
    )
    worker_counts = {row.user_id: row.cnt for row in worker_result}

    # Load hashrates
    hashrate_result = await db.execute(
        select(Worker.user_id, func.sum(Worker.hashrate_1h).label("total_hr"))
        .where(Worker.user_id.in_(user_ids))
        .group_by(Worker.user_id)
    )
    hashrates = {row.user_id: float(row.total_hr or 0) for row in hashrate_result}

    # Load badge slugs per user
    badge_result = await db.execute(
        select(UserBadge.user_id, func.array_agg(func.distinct(UserBadge.badge_id)))
        .where(UserBadge.user_id.in_(user_ids))
        .group_by(UserBadge.user_id)
    )
    badge_ids_map = {row[0]: row[1] for row in badge_result}

    profiles = {}
    for uid in user_ids:
        u = users.get(uid)
        g = gam_map.get(uid)
        profiles[uid] = {
            "display_name": (u.display_name or f"Miner-{uid}") if u else f"Miner-{uid}",
            "country_code": (u.country_code or "") if u else "",
            "total_shares": g.total_shares if g else 0,
            "hashrate": hashrates.get(uid, 0),
            "worker_count": worker_counts.get(uid, 0),
            "badges": [],  # Badge slugs resolved in enrichment
            "join_date": u.created_at if u else None,
        }

    return profiles


async def get_leaderboard(
    redis: Redis,
    db: AsyncSession,
    period: str,
    page: int = 1,
    per_page: int = 50,
    week_iso: str | None = None,
    current_user_id: int | None = None,
) -> dict:
    """Get leaderboard from Redis sorted set, enriched with user profiles."""
    key = build_leaderboard_key(period, week_iso)
    start = (page - 1) * per_page
    end = start + per_page - 1

    entries = await redis.zrevrange(key, start, end, withscores=True)
    total = await redis.zcard(key)

    if not entries:
        return {"entries": [], "total": total, "page": page, "per_page": per_page}

    # Load previous snapshot for rank_change
    prev_key = f"leaderboard:snapshot:prev:{period}"
    prev_ranks = {}
    if await redis.exists(prev_key):
        prev_data = await redis.hgetall(prev_key)
        prev_ranks = {k: int(v) for k, v in prev_data.items()}

    user_ids = [int(uid) for uid, _ in entries]
    profiles = await get_user_profiles_batch(db, user_ids)

    results = []
    for rank_offset, (uid_str, score) in enumerate(entries):
        user_id = int(uid_str)
        profile = profiles.get(user_id, {})
        current_rank = start + rank_offset + 1
        prev_rank = prev_ranks.get(uid_str, current_rank)
        rank_change = prev_rank - current_rank  # Positive = moved up

        results.append({
            "rank": current_rank,
            "user_id": str(user_id),
            "display_name": profile.get("display_name", f"Miner-{user_id}"),
            "country_code": profile.get("country_code", ""),
            "best_difficulty": score,
            "total_shares": profile.get("total_shares", 0),
            "rank_change": rank_change,
            "is_current_user": user_id == current_user_id if current_user_id else False,
            "hashrate": profile.get("hashrate"),
            "worker_count": profile.get("worker_count"),
            "badges": profile.get("badges"),
            "join_date": profile.get("join_date"),
        })

    return {"entries": results, "total": total, "page": page, "per_page": per_page}


async def get_user_rank(
    redis: Redis, period: str, user_id: int, week_iso: str | None = None,
) -> dict:
    """Get a specific user's rank and score from the leaderboard."""
    key = build_leaderboard_key(period, week_iso)
    rank = await redis.zrevrank(key, str(user_id))
    score = await redis.zscore(key, str(user_id))
    total = await redis.zcard(key)

    if rank is None:
        return {"period": period, "rank": 0, "score": 0, "total": total, "percentile": 0}

    return {
        "period": period,
        "rank": rank + 1,
        "score": float(score),
        "total": total,
        "percentile": round(100 - ((rank + 1) / total * 100), 2) if total > 0 else 0,
    }


async def get_country_leaderboard(
    redis: Redis,
    db: AsyncSession,
    week_iso: str | None = None,
) -> dict:
    """Get country rankings from Redis sorted set."""
    key = build_leaderboard_key("country", week_iso)
    entries = await redis.zrevrange(key, 0, -1, withscores=True)
    total = len(entries)

    results = []
    for rank_offset, (code, hashrate) in enumerate(entries):
        results.append({
            "rank": rank_offset + 1,
            "country_code": code,
            "country_name": COUNTRY_NAMES.get(code, code),
            "miner_count": 0,  # Will be enriched from snapshot
            "total_hashrate": hashrate,
        })

    # Enrich miner_count from country_rankings table
    if results:
        from tbg.db.models import CountryRanking
        period_key = week_iso or get_current_week_iso()
        cr_result = await db.execute(
            select(CountryRanking).where(CountryRanking.period_key == period_key)
        )
        cr_map = {cr.country_code: cr for cr in cr_result.scalars()}
        for entry in results:
            cr = cr_map.get(entry["country_code"])
            if cr:
                entry["miner_count"] = cr.miner_count

    return {"entries": results, "total": total}


async def save_snapshot(
    redis: Redis, db: AsyncSession, period: str, period_key: str,
) -> int:
    """Save current leaderboard state as a snapshot for rank_change calculation."""
    key = build_leaderboard_key(period, period_key if period != "alltime" else None)
    entries = await redis.zrevrange(key, 0, -1, withscores=True)

    if not entries:
        return 0

    # Save previous snapshot to Redis hash for fast rank_change lookup
    prev_key = f"leaderboard:snapshot:prev:{period}"
    pipe = redis.pipeline()
    pipe.delete(prev_key)
    for rank_offset, (uid_str, _score) in enumerate(entries):
        pipe.hset(prev_key, uid_str, rank_offset + 1)
    pipe.expire(prev_key, 86400 * 7)
    await pipe.execute()

    # Also persist to PostgreSQL
    now = datetime.now(timezone.utc)
    for rank_offset, (uid_str, score) in enumerate(entries[:200]):  # Top 200 only
        user_id = int(uid_str)
        # Upsert snapshot
        from sqlalchemy.dialects.postgresql import insert
        stmt = insert(LeaderboardSnapshot).values(
            period=period,
            period_key=period_key,
            user_id=user_id,
            rank=rank_offset + 1,
            score=score,
            snapshot_at=now,
        ).on_conflict_do_update(
            constraint="lb_snapshots_period_user_key",
            set_={"rank": rank_offset + 1, "score": score, "snapshot_at": now},
        )
        await db.execute(stmt)

    await db.commit()
    return len(entries)
