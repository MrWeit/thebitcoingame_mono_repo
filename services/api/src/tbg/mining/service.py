"""Mining service layer — reads from Redis (live) and TimescaleDB (historical)."""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

import redis.asyncio as aioredis
from sqlalchemy import Date,cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    Block,
    HashrateSnapshot,
    NetworkDifficulty,
    PersonalBest,
    Share,
    UserDailyStats,
    Worker,
)
from tbg.mining.hashrate import compute_hashrate, compute_hashrate_from_shares
from tbg.mining.pagination import encode_cursor, paginate_shares
from tbg.mining.schemas import (
    BlockDetailResponse,
    BlockItem,
    DifficultyBest,
    DifficultyBucket,
    DifficultyDistributionResponse,
    DifficultyScatterPoint,
    DifficultyScatterResponse,
    HashrateChartResponse,
    HashratePoint,
    HashrateResponse,
    MiningSummaryResponse,
    NetworkBlockItem,
    NetworkBlocksResponse,
    NetworkDifficultyItem,
    NetworkDifficultyResponse,
    PaginationInfo,
    PercentileResponse,
    ShareItem,
    SharePage,
    ShareStats,
    UptimeCalendarResponse,
    UptimeDay,
    WorkerDetailResponse,
    WorkerItem,
    WorkerListResponse,
)


# ---------------------------------------------------------------------------
# Worker status (Redis)
# ---------------------------------------------------------------------------


def _parse_hashrate(value: str | int | float) -> float:
    """Parse hashrate values that may have SI suffixes (e.g. '19.1M', '3.5K')."""
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


async def get_workers(redis_client: aioredis.Redis, btc_address: str) -> WorkerListResponse:
    """Get all workers for a user from Redis hashes."""
    # Get worker names from the user's worker index set
    worker_names: set[str] = await redis_client.smembers(f"workers:{btc_address}")  # type: ignore[assignment]

    workers: list[WorkerItem] = []
    for name in sorted(worker_names):
        key = f"worker:{btc_address}:{name}"
        data: dict[str, str] = await redis_client.hgetall(key)  # type: ignore[assignment]
        if not data:
            continue
        valid = int(data.get("valid_shares", 0))
        invalid = int(data.get("invalid_shares", 0))
        total_shares = valid + invalid
        workers.append(
            WorkerItem(
                name=name,
                status="online" if data.get("is_online") == "1" else "offline",
                hashrate_1m=_parse_hashrate(data.get("hashrate_1m", 0)),
                hashrate_5m=_parse_hashrate(data.get("hashrate_5m", 0)),
                hashrate_1h=_parse_hashrate(data.get("hashrate_1h", 0)),
                hashrate_24h=_parse_hashrate(data.get("hashrate_24h", 0)),
                current_diff=float(data.get("current_diff", 0)),
                best_diff=float(data.get("best_diff", 0)),
                valid_shares=valid,
                invalid_shares=invalid,
                accept_rate=round(valid / total_shares * 100, 2) if total_shares > 0 else 100.0,
                last_share=data.get("last_share"),
                connected_at=data.get("connected_at"),
                ip_address=data.get("ip"),
                user_agent=data.get("useragent"),
                shares_session=int(data.get("shares_session", 0)),
            )
        )

    online = sum(1 for w in workers if w.status == "online")
    return WorkerListResponse(workers=workers, online_count=online, total_count=len(workers))


async def get_worker_detail(
    redis_client: aioredis.Redis,
    db: AsyncSession,
    btc_address: str,
    worker_name: str,
) -> WorkerDetailResponse | None:
    """Get detailed worker info + recent shares."""
    key = f"worker:{btc_address}:{worker_name}"
    data: dict[str, str] = await redis_client.hgetall(key)  # type: ignore[assignment]
    if not data:
        return None

    valid = int(data.get("valid_shares", 0))
    invalid = int(data.get("invalid_shares", 0))
    total_shares = valid + invalid
    worker = WorkerItem(
        name=worker_name,
        status="online" if data.get("is_online") == "1" else "offline",
        hashrate_1m=_parse_hashrate(data.get("hashrate_1m", 0)),
        hashrate_5m=_parse_hashrate(data.get("hashrate_5m", 0)),
        hashrate_1h=_parse_hashrate(data.get("hashrate_1h", 0)),
        hashrate_24h=_parse_hashrate(data.get("hashrate_24h", 0)),
        current_diff=float(data.get("current_diff", 0)),
        best_diff=float(data.get("best_diff", 0)),
        valid_shares=valid,
        invalid_shares=invalid,
        accept_rate=round(valid / total_shares * 100, 2) if total_shares > 0 else 100.0,
        last_share=data.get("last_share"),
        connected_at=data.get("connected_at"),
        ip_address=data.get("ip"),
        user_agent=data.get("useragent"),
        shares_session=int(data.get("shares_session", 0)),
    )

    # Recent shares for this worker
    shares, _ = await paginate_shares(db, btc_address, limit=10, worker_name=worker_name)
    recent = [
        ShareItem(
            time=s.time,
            worker_name=s.worker_name,
            difficulty=s.difficulty,
            share_diff=s.share_diff,
            is_valid=s.is_valid,
            is_block=bool(s.is_block),
        )
        for s in shares
    ]

    return WorkerDetailResponse(worker=worker, recent_shares=recent)


# ---------------------------------------------------------------------------
# Shares
# ---------------------------------------------------------------------------


async def get_shares_page(
    db: AsyncSession,
    btc_address: str,
    limit: int = 50,
    cursor: str | None = None,
    worker_name: str | None = None,
    valid_only: bool | None = None,
) -> SharePage:
    """Get paginated shares for a user."""
    shares, next_cursor = await paginate_shares(
        db, btc_address, limit=limit, cursor=cursor,
        worker_name=worker_name, valid_only=valid_only,
    )

    items = [
        ShareItem(
            time=s.time,
            worker_name=s.worker_name,
            difficulty=s.difficulty,
            share_diff=s.share_diff,
            is_valid=s.is_valid,
            is_block=bool(s.is_block),
        )
        for s in shares
    ]

    return SharePage(
        data=items,
        pagination=PaginationInfo(
            limit=limit,
            has_more=next_cursor is not None,
            next_cursor=next_cursor,
        ),
    )


async def get_share_stats(db: AsyncSession, btc_address: str) -> ShareStats:
    """Get aggregate share statistics for a user."""
    # All-time stats
    result = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Share.is_valid.is_(True)).label("accepted"),
            func.count().filter(Share.is_valid.is_(False)).label("rejected"),
        ).where(Share.btc_address == btc_address)
    )
    row = result.one()
    total = row.total or 0
    accepted = row.accepted or 0
    rejected = row.rejected or 0

    # Today's stats
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Share.is_valid.is_(True)).label("accepted"),
            func.max(Share.share_diff).label("best_diff"),
        )
        .where(Share.btc_address == btc_address)
        .where(Share.time >= today_start)
    )
    today_row = today_result.one()

    return ShareStats(
        total_shares=total,
        accepted_shares=accepted,
        rejected_shares=rejected,
        acceptance_rate=round(accepted / total * 100, 2) if total > 0 else 0.0,
        shares_today=today_row.total or 0,
        accepted_today=today_row.accepted or 0,
        best_diff_today=float(today_row.best_diff or 0),
    )


# ---------------------------------------------------------------------------
# Hashrate
# ---------------------------------------------------------------------------


async def get_hashrate_summary(
    redis_client: aioredis.Redis,
    db: AsyncSession,
    btc_address: str,
) -> HashrateResponse:
    """Get current hashrate summary from Redis (live) with DB fallback."""
    # Try Redis aggregate first
    user_key = f"user_hashrate:{btc_address}"
    data: dict[str, str] = await redis_client.hgetall(user_key)  # type: ignore[assignment]

    # Count online workers (needed by all paths)
    worker_names: set[str] = await redis_client.smembers(f"workers:{btc_address}")  # type: ignore[assignment]
    online = 0
    for name in worker_names:
        w_data = await redis_client.hgetall(f"worker:{btc_address}:{name}")
        if w_data.get("is_online") == "1":
            online += 1

    if data:
        return HashrateResponse(
            hashrate_1m=_parse_hashrate(data.get("hashrate_1m", 0)),
            hashrate_5m=_parse_hashrate(data.get("hashrate_5m", 0)),
            hashrate_1h=_parse_hashrate(data.get("hashrate_1h", 0)),
            hashrate_24h=_parse_hashrate(data.get("hashrate_24h", 0)),
            workers_online=online,
        )

    # Fallback: aggregate directly from per-worker Redis hashes
    if worker_names:
        agg = {"hashrate_1m": 0.0, "hashrate_5m": 0.0, "hashrate_1h": 0.0, "hashrate_24h": 0.0}
        for name in worker_names:
            w_data = await redis_client.hgetall(f"worker:{btc_address}:{name}")
            for field in agg:
                agg[field] += _parse_hashrate(w_data.get(field, "0"))
        if any(v > 0 for v in agg.values()):
            return HashrateResponse(
                hashrate_1m=agg["hashrate_1m"],
                hashrate_5m=agg["hashrate_5m"],
                hashrate_1h=agg["hashrate_1h"],
                hashrate_24h=agg["hashrate_24h"],
                workers_online=online,
            )

    # Last fallback: compute from shares in DB
    h_1m = await compute_hashrate(db, btc_address, 60)
    h_5m = await compute_hashrate(db, btc_address, 300)
    h_1h = await compute_hashrate(db, btc_address, 3600)
    h_24h = await compute_hashrate(db, btc_address, 86400)

    return HashrateResponse(
        hashrate_1m=h_1m,
        hashrate_5m=h_5m,
        hashrate_1h=h_1h,
        hashrate_24h=h_24h,
        workers_online=online,
    )


async def get_hashrate_chart(
    db: AsyncSession,
    btc_address: str,
    user_id: int,
    window: str = "24h",
) -> HashrateChartResponse:
    """Get hashrate time series from snapshots."""
    window_map = {"1h": 3600, "24h": 86400, "7d": 604800, "30d": 2592000}
    seconds = window_map.get(window, 86400)
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)

    result = await db.execute(
        select(HashrateSnapshot.time, HashrateSnapshot.hashrate_5m)
        .where(HashrateSnapshot.user_id == user_id)
        .where(HashrateSnapshot.time >= cutoff)
        .where(HashrateSnapshot.worker_name.is_(None))  # User-level aggregate
        .order_by(HashrateSnapshot.time.asc())
    )
    rows = result.all()

    points = [HashratePoint(time=r.time, hashrate=r.hashrate_5m or 0.0) for r in rows]

    hashrates = [p.hashrate for p in points if p.hashrate > 0]
    current = hashrates[-1] if hashrates else 0.0
    average = sum(hashrates) / len(hashrates) if hashrates else 0.0
    peak = max(hashrates) if hashrates else 0.0

    return HashrateChartResponse(
        window=window,
        points=points,
        current=current,
        average=round(average, 2),
        peak=peak,
    )


async def get_worker_hashrate_chart(
    db: AsyncSession,
    btc_address: str,
    user_id: int,
    worker_name: str,
    window: str = "24h",
) -> HashrateChartResponse:
    """Get hashrate time series for a specific worker.

    Falls back to user-aggregate snapshots if no per-worker data exists.
    """
    window_map = {"1h": 3600, "24h": 86400, "7d": 604800, "30d": 2592000}
    seconds = window_map.get(window, 86400)
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)

    # Try per-worker snapshots first
    result = await db.execute(
        select(HashrateSnapshot.time, HashrateSnapshot.hashrate_5m)
        .where(HashrateSnapshot.user_id == user_id)
        .where(HashrateSnapshot.worker_name == worker_name)
        .where(HashrateSnapshot.time >= cutoff)
        .order_by(HashrateSnapshot.time.asc())
    )
    rows = result.all()

    # Fall back to user-aggregate if no per-worker data
    if not rows:
        result = await db.execute(
            select(HashrateSnapshot.time, HashrateSnapshot.hashrate_5m)
            .where(HashrateSnapshot.user_id == user_id)
            .where(HashrateSnapshot.worker_name.is_(None))
            .where(HashrateSnapshot.time >= cutoff)
            .order_by(HashrateSnapshot.time.asc())
        )
        rows = result.all()

    points = [HashratePoint(time=r.time, hashrate=r.hashrate_5m or 0.0) for r in rows]
    hashrates = [p.hashrate for p in points if p.hashrate > 0]

    return HashrateChartResponse(
        window=window,
        points=points,
        current=hashrates[-1] if hashrates else 0.0,
        average=round(sum(hashrates) / len(hashrates), 2) if hashrates else 0.0,
        peak=max(hashrates) if hashrates else 0.0,
    )


# ---------------------------------------------------------------------------
# Difficulty / Personal Bests
# ---------------------------------------------------------------------------


async def get_personal_bests(db: AsyncSession, user_id: int) -> list[DifficultyBest]:
    """Get personal bests for all timeframes."""
    result = await db.execute(
        select(PersonalBest)
        .where(PersonalBest.user_id == user_id)
        .order_by(PersonalBest.timeframe)
    )
    rows = result.scalars().all()
    return [
        DifficultyBest(
            timeframe=r.timeframe,
            period_key=r.period_key,
            best_difficulty=r.best_difficulty,
            share_time=r.share_time,
            worker_name=r.worker_name,
            percentile=r.percentile,
        )
        for r in rows
    ]


async def get_difficulty_scatter(
    db: AsyncSession,
    btc_address: str,
    limit: int = 200,
) -> DifficultyScatterResponse:
    """Get last N shares as (time, difficulty) pairs for scatter plot."""
    result = await db.execute(
        select(Share.time, Share.share_diff)
        .where(Share.btc_address == btc_address)
        .where(Share.is_valid.is_(True))
        .order_by(Share.time.desc())
        .limit(limit)
    )
    rows = result.all()
    points = [DifficultyScatterPoint(time=r.time, difficulty=r.share_diff) for r in rows]
    return DifficultyScatterResponse(points=list(reversed(points)), count=len(points))


async def get_difficulty_distribution(
    db: AsyncSession,
    btc_address: str,
) -> DifficultyDistributionResponse:
    """Get difficulty histogram with 8 ranges."""
    # Get all valid share difficulties for the user (last 30 days for performance)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(Share.share_diff)
        .where(Share.btc_address == btc_address)
        .where(Share.is_valid.is_(True))
        .where(Share.time >= cutoff)
    )
    diffs = [float(r[0]) for r in result.all()]

    if not diffs:
        return DifficultyDistributionResponse(buckets=[], total_shares=0)

    # Define 8 log-scale ranges
    import math

    min_diff = min(diffs) if diffs else 1
    max_diff = max(diffs) if diffs else 1
    if min_diff <= 0:
        min_diff = 1

    log_min = math.log2(min_diff)
    log_max = math.log2(max_diff) if max_diff > min_diff else log_min + 1
    step = (log_max - log_min) / 8

    buckets: list[DifficultyBucket] = []
    for i in range(8):
        r_min = 2 ** (log_min + i * step)
        r_max = 2 ** (log_min + (i + 1) * step)
        count = sum(1 for d in diffs if r_min <= d < r_max)
        if i == 7:
            count = sum(1 for d in diffs if d >= r_min)

        buckets.append(DifficultyBucket(
            range_min=round(r_min, 2),
            range_max=round(r_max, 2),
            label=_format_diff_label(r_min, r_max),
            count=count,
        ))

    return DifficultyDistributionResponse(buckets=buckets, total_shares=len(diffs))


def _format_diff_label(low: float, high: float) -> str:
    """Format a difficulty range as a human-readable label."""
    def fmt(v: float) -> str:
        if v >= 1_000_000_000:
            return f"{v / 1_000_000_000:.1f}G"
        if v >= 1_000_000:
            return f"{v / 1_000_000:.1f}M"
        if v >= 1_000:
            return f"{v / 1_000:.1f}K"
        return f"{v:.0f}"
    return f"{fmt(low)} - {fmt(high)}"


async def get_percentile(
    db: AsyncSession,
    user_id: int,
    timeframe: str = "week",
) -> PercentileResponse | None:
    """Get user's percentile rank for a timeframe."""
    # Get user's personal best
    user_best = await db.execute(
        select(PersonalBest)
        .where(PersonalBest.user_id == user_id)
        .where(PersonalBest.timeframe == timeframe)
    )
    best = user_best.scalar_one_or_none()
    if best is None:
        return None

    # Count total miners and those with lower difficulty
    total_result = await db.execute(
        select(func.count()).select_from(PersonalBest).where(PersonalBest.timeframe == timeframe)
    )
    total = total_result.scalar() or 0

    lower_result = await db.execute(
        select(func.count())
        .select_from(PersonalBest)
        .where(PersonalBest.timeframe == timeframe)
        .where(PersonalBest.best_difficulty < best.best_difficulty)
    )
    lower = lower_result.scalar() or 0

    percentile = (lower / total * 100) if total > 0 else 0.0
    rank = total - lower

    return PercentileResponse(
        timeframe=timeframe,
        percentile=round(percentile, 2),
        best_difficulty=best.best_difficulty,
        rank=rank,
        total_miners=total,
    )


async def update_personal_best(
    db: AsyncSession,
    user_id: int,
    difficulty: float,
    timeframe: str,
    period_key: str | None,
    worker_name: str | None,
    share_time: datetime,
) -> bool:
    """Update personal best if new difficulty exceeds current. Returns True if new record."""
    existing = await db.execute(
        select(PersonalBest)
        .where(PersonalBest.user_id == user_id)
        .where(PersonalBest.timeframe == timeframe)
        .where(
            PersonalBest.period_key == period_key
            if period_key is not None
            else PersonalBest.period_key.is_(None)
        )
    )
    best = existing.scalar_one_or_none()

    if best is None:
        db.add(PersonalBest(
            user_id=user_id,
            timeframe=timeframe,
            period_key=period_key,
            best_difficulty=difficulty,
            share_time=share_time,
            worker_name=worker_name,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ))
        await db.flush()
        return True

    if difficulty > best.best_difficulty:
        best.best_difficulty = difficulty
        best.share_time = share_time
        best.worker_name = worker_name
        best.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return True

    return False


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------


async def get_blocks(
    db: AsyncSession,
    btc_address: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> tuple[list[BlockItem], str | None]:
    """Get blocks found, optionally filtered by user address."""
    query = select(Block).order_by(Block.found_at.desc())

    if btc_address is not None:
        query = query.where(Block.btc_address == btc_address)

    if cursor is not None:
        import base64
        import json
        decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        cursor_time = datetime.fromisoformat(decoded["time"])
        query = query.where(Block.found_at < cursor_time)

    query = query.limit(limit + 1)
    result = await db.execute(query)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items_raw = rows[:limit]

    items = [
        BlockItem(
            block_height=b.block_height,
            block_hash=b.block_hash,
            difficulty=b.difficulty,
            reward_btc=float(b.reward_btc) if b.reward_btc else None,
            fees_btc=float(b.fees_btc) if b.fees_btc else None,
            found_at=b.found_at,
            confirmed=b.confirmed,
            confirmations=b.confirmations,
            worker_name=None,
        )
        for b in items_raw
    ]

    next_cursor = None
    if has_more and items_raw:
        import base64
        import json
        last = items_raw[-1]
        next_cursor = base64.urlsafe_b64encode(
            json.dumps({"time": last.found_at.isoformat()}).encode()
        ).decode()

    return items, next_cursor


async def get_block_detail(db: AsyncSession, height: int) -> BlockDetailResponse | None:
    """Get single block detail by height."""
    result = await db.execute(
        select(Block).where(Block.block_height == height)
    )
    b = result.scalar_one_or_none()
    if b is None:
        return None

    return BlockDetailResponse(
        block=BlockItem(
            block_height=b.block_height,
            block_hash=b.block_hash,
            difficulty=b.difficulty,
            reward_btc=float(b.reward_btc) if b.reward_btc else None,
            fees_btc=float(b.fees_btc) if b.fees_btc else None,
            found_at=b.found_at,
            confirmed=b.confirmed,
            confirmations=b.confirmations,
        ),
        finder_address=b.btc_address,
        coinbase_sig=b.coinbase_sig,
    )


# ---------------------------------------------------------------------------
# Mining Summary
# ---------------------------------------------------------------------------


async def get_mining_summary(
    redis_client: aioredis.Redis,
    db: AsyncSession,
    btc_address: str,
    user_id: int,
) -> MiningSummaryResponse:
    """Get dashboard mining summary combining Redis live data and DB historical."""
    # Live hashrate from Redis
    hashrate = await get_hashrate_summary(redis_client, db, btc_address)

    # Workers
    workers_resp = await get_workers(redis_client, btc_address)

    # Share stats
    stats = await get_share_stats(db, btc_address)

    # Alltime best
    best_result = await db.execute(
        select(PersonalBest.best_difficulty)
        .where(PersonalBest.user_id == user_id)
        .where(PersonalBest.timeframe == "alltime")
    )
    best_alltime = best_result.scalar() or 0.0

    # Blocks found
    blocks_result = await db.execute(
        select(func.count()).select_from(Block).where(Block.btc_address == btc_address)
    )
    blocks_found = blocks_result.scalar() or 0

    # Last share time
    last_share = None
    for w in workers_resp.workers:
        if w.last_share:
            if last_share is None or w.last_share > last_share:
                last_share = w.last_share

    return MiningSummaryResponse(
        hashrate_1m=hashrate.hashrate_1m,
        hashrate_5m=hashrate.hashrate_5m,
        hashrate_1h=hashrate.hashrate_1h,
        hashrate_24h=hashrate.hashrate_24h,
        workers_online=workers_resp.online_count,
        workers_total=workers_resp.total_count,
        shares_today=stats.shares_today,
        accepted_today=stats.accepted_today,
        acceptance_rate=stats.acceptance_rate,
        best_diff_today=stats.best_diff_today,
        best_diff_alltime=float(best_alltime),
        blocks_found=blocks_found,
        last_share=last_share,
    )


# ---------------------------------------------------------------------------
# Uptime
# ---------------------------------------------------------------------------


async def get_uptime_calendar(
    db: AsyncSession,
    user_id: int,
    days: int = 30,
) -> UptimeCalendarResponse:
    """Get uptime calendar for the last N days."""
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(UserDailyStats)
        .where(UserDailyStats.user_id == user_id)
        .where(cast(UserDailyStats.day, Date) >= cutoff)
        .order_by(UserDailyStats.day.asc())
    )
    rows = {str(r.day): r for r in result.scalars().all()}

    calendar: list[UptimeDay] = []
    total_uptime = 0
    days_active = 0
    for i in range(days):
        d = cutoff + timedelta(days=i + 1)
        key = str(d)
        if key in rows:
            r = rows[key]
            uptime = r.uptime_minutes
            calendar.append(UptimeDay(
                date=key,
                uptime_minutes=uptime,
                shares=r.total_shares,
                active=r.total_shares > 0,
            ))
            total_uptime += uptime
            if r.total_shares > 0:
                days_active += 1
        else:
            calendar.append(UptimeDay(date=key))

    return UptimeCalendarResponse(
        days=calendar,
        total_uptime_hours=round(total_uptime / 60, 1),
        days_active=days_active,
    )


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------


async def get_network_difficulty(
    redis_client: aioredis.Redis,
    db: AsyncSession,
) -> NetworkDifficultyResponse:
    """Get current network difficulty + history."""
    # Try Redis cache first
    cached_diff = await redis_client.get("network:difficulty")
    cached_height = await redis_client.get("network:height")

    current_diff = float(cached_diff) if cached_diff else 0.0
    current_height = int(cached_height) if cached_height else 0

    # History from DB
    result = await db.execute(
        select(NetworkDifficulty)
        .order_by(NetworkDifficulty.block_height.desc())
        .limit(50)
    )
    rows = result.scalars().all()

    if not current_diff and rows:
        current_diff = rows[0].difficulty
        current_height = rows[0].block_height

    history = [
        NetworkDifficultyItem(
            block_height=r.block_height,
            difficulty=r.difficulty,
            timestamp=r.time,
        )
        for r in rows
    ]

    return NetworkDifficultyResponse(
        current_difficulty=current_diff,
        current_height=current_height,
        history=history,
    )


async def get_network_blocks(
    redis_client: aioredis.Redis,
    db: AsyncSession,
    limit: int = 20,
) -> NetworkBlocksResponse:
    """Get recent network blocks from mining_events."""
    from tbg.db.models import MiningEvent

    result = await db.execute(
        select(MiningEvent)
        .where(MiningEvent.event_type == "new_block_network")
        .order_by(MiningEvent.ts.desc())
        .limit(limit)
    )
    rows = result.scalars().all()

    blocks = [
        NetworkBlockItem(
            height=r.payload.get("height", 0),
            hash=r.payload.get("hash", ""),
            difficulty=float(r.payload.get("diff", 0)),
            timestamp=r.ts,
        )
        for r in rows
    ]

    return NetworkBlocksResponse(blocks=blocks)


# ---------------------------------------------------------------------------
# Block Celebrations
# ---------------------------------------------------------------------------


async def get_pending_celebrations(
    db: AsyncSession,
    user_id: int,
) -> list[dict]:
    """Return uncelebrated block-found events for a user."""
    from tbg.db.models import BlockCelebration

    result = await db.execute(
        select(BlockCelebration, Block)
        .join(Block, BlockCelebration.block_id == Block.id)
        .where(
            BlockCelebration.user_id == user_id,
            BlockCelebration.celebrated == False,  # noqa: E712
        )
        .order_by(Block.found_at.asc())
    )
    rows = result.all()

    return [
        {
            "celebration_id": cel.id,
            "block_id": blk.id,
            "block_height": blk.block_height,
            "block_hash": blk.block_hash,
            "reward_btc": float(blk.reward_btc) if blk.reward_btc else 0.0,
            "found_at": blk.found_at.isoformat(),
        }
        for cel, blk in rows
    ]


async def acknowledge_celebration(
    db: AsyncSession,
    user_id: int,
    celebration_id: int,
) -> bool:
    """Mark a celebration as seen. Returns True if updated."""
    from tbg.db.models import BlockCelebration

    result = await db.execute(
        select(BlockCelebration).where(
            BlockCelebration.id == celebration_id,
            BlockCelebration.user_id == user_id,
            BlockCelebration.celebrated == False,  # noqa: E712
        )
    )
    cel = result.scalar_one_or_none()
    if cel is None:
        return False

    cel.celebrated = True
    cel.celebrated_at = datetime.now(timezone.utc)
    await db.commit()
    return True


async def create_block_celebration(
    db: AsyncSession,
    block_id: int,
    user_id: int,
) -> None:
    """Create a pending celebration record for a found block."""
    from tbg.db.models import BlockCelebration

    # Avoid duplicates
    result = await db.execute(
        select(BlockCelebration.id).where(
            BlockCelebration.block_id == block_id,
            BlockCelebration.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        return

    db.add(BlockCelebration(
        block_id=block_id,
        user_id=user_id,
        celebrated=False,
    ))
    await db.commit()
