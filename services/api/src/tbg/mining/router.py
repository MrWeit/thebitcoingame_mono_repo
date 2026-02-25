"""Mining data API router — 17 endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.database import get_session
from tbg.db.models import User
from tbg.mining import schemas
from tbg.mining import service
from tbg.redis_client import get_redis

router = APIRouter(prefix="/api/v1/mining", tags=["Mining"])


def _redis():  # type: ignore[no-untyped-def]
    return get_redis()


# ---------------------------------------------------------------------------
# 1. GET /mining/workers — List all workers
# ---------------------------------------------------------------------------
@router.get("/workers", response_model=schemas.WorkerListResponse)
async def list_workers(
    user: User = Depends(get_current_user),
) -> schemas.WorkerListResponse:
    """List all workers for the authenticated user (live from Redis)."""
    redis_client = _redis()
    return await service.get_workers(redis_client, user.btc_address)


# ---------------------------------------------------------------------------
# 2. GET /mining/workers/{name} — Single worker detail
# ---------------------------------------------------------------------------
@router.get("/workers/{name}", response_model=schemas.WorkerDetailResponse)
async def get_worker(
    name: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.WorkerDetailResponse:
    """Get detailed info for a specific worker."""
    redis_client = _redis()
    result = await service.get_worker_detail(redis_client, db, user.btc_address, name)
    if result is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return result


# ---------------------------------------------------------------------------
# 3. GET /mining/workers/{name}/hashrate — Worker hashrate chart
# ---------------------------------------------------------------------------
@router.get("/workers/{name}/hashrate", response_model=schemas.HashrateChartResponse)
async def get_worker_hashrate(
    name: str,
    window: str = Query("24h", pattern="^(1h|24h|7d|30d)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.HashrateChartResponse:
    """Get hashrate time series for a specific worker."""
    return await service.get_worker_hashrate_chart(db, user.btc_address, user.id, name, window)


# ---------------------------------------------------------------------------
# 4. GET /mining/shares — Paginated share history
# ---------------------------------------------------------------------------
@router.get("/shares", response_model=schemas.SharePage)
async def list_shares(
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    worker_name: str | None = Query(None),
    valid_only: bool | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.SharePage:
    """Get paginated share history (cursor-based)."""
    return await service.get_shares_page(
        db, user.btc_address, limit=limit, cursor=cursor,
        worker_name=worker_name, valid_only=valid_only,
    )


# ---------------------------------------------------------------------------
# 5. GET /mining/shares/stats — Share statistics
# ---------------------------------------------------------------------------
@router.get("/shares/stats", response_model=schemas.ShareStats)
async def get_shares_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.ShareStats:
    """Get aggregate share statistics."""
    return await service.get_share_stats(db, user.btc_address)


# ---------------------------------------------------------------------------
# 6. GET /mining/difficulty/bests — Personal bests
# ---------------------------------------------------------------------------
@router.get("/difficulty/bests", response_model=list[schemas.DifficultyBest])
async def get_difficulty_bests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[schemas.DifficultyBest]:
    """Get personal best difficulty for each timeframe."""
    return await service.get_personal_bests(db, user.id)


# ---------------------------------------------------------------------------
# 7. GET /mining/difficulty/scatter — Difficulty scatter plot
# ---------------------------------------------------------------------------
@router.get("/difficulty/scatter", response_model=schemas.DifficultyScatterResponse)
async def get_difficulty_scatter(
    limit: int = Query(200, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.DifficultyScatterResponse:
    """Get last N shares as (time, difficulty) pairs for scatter plot."""
    return await service.get_difficulty_scatter(db, user.btc_address, limit)


# ---------------------------------------------------------------------------
# 8. GET /mining/difficulty/distribution — Difficulty histogram
# ---------------------------------------------------------------------------
@router.get("/difficulty/distribution", response_model=schemas.DifficultyDistributionResponse)
async def get_difficulty_distribution(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.DifficultyDistributionResponse:
    """Get difficulty distribution histogram (8 ranges)."""
    return await service.get_difficulty_distribution(db, user.btc_address)


# ---------------------------------------------------------------------------
# 9. GET /mining/difficulty/percentile — Percentile rank
# ---------------------------------------------------------------------------
@router.get("/difficulty/percentile", response_model=schemas.PercentileResponse)
async def get_difficulty_percentile(
    timeframe: str = Query("week", pattern="^(week|month|alltime)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.PercentileResponse:
    """Get user's percentile rank vs all miners."""
    result = await service.get_percentile(db, user.id, timeframe)
    if result is None:
        raise HTTPException(status_code=404, detail="No personal best found for this timeframe")
    return result


# ---------------------------------------------------------------------------
# 10. GET /mining/blocks — Blocks found by pool
# ---------------------------------------------------------------------------
@router.get("/blocks", response_model=dict)
async def list_blocks(
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Get blocks found (pool-wide, paginated)."""
    items, next_cursor = await service.get_blocks(db, limit=limit, cursor=cursor)
    return {
        "data": [item.model_dump() for item in items],
        "pagination": {
            "limit": limit,
            "has_more": next_cursor is not None,
            "next_cursor": next_cursor,
        },
    }


# ---------------------------------------------------------------------------
# 11. GET /mining/blocks/{height} — Single block detail
# ---------------------------------------------------------------------------
@router.get("/blocks/{height}", response_model=schemas.BlockDetailResponse)
async def get_block(
    height: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.BlockDetailResponse:
    """Get single block detail by height."""
    result = await service.get_block_detail(db, height)
    if result is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return result


# ---------------------------------------------------------------------------
# 12. GET /mining/hashrate — Hashrate summary
# ---------------------------------------------------------------------------
@router.get("/hashrate", response_model=schemas.HashrateResponse)
async def get_hashrate(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.HashrateResponse:
    """Get current hashrate summary."""
    redis_client = _redis()
    return await service.get_hashrate_summary(redis_client, db, user.btc_address)


# ---------------------------------------------------------------------------
# 13. GET /mining/hashrate/chart — Hashrate time series
# ---------------------------------------------------------------------------
@router.get("/hashrate/chart", response_model=schemas.HashrateChartResponse)
async def get_hashrate_chart(
    window: str = Query("24h", pattern="^(1h|24h|7d|30d)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.HashrateChartResponse:
    """Get hashrate time series from snapshots."""
    return await service.get_hashrate_chart(db, user.btc_address, user.id, window)


# ---------------------------------------------------------------------------
# 14. GET /mining/summary — Dashboard mining summary
# ---------------------------------------------------------------------------
@router.get("/summary", response_model=schemas.MiningSummaryResponse)
async def get_mining_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.MiningSummaryResponse:
    """Get dashboard-style mining summary."""
    redis_client = _redis()
    return await service.get_mining_summary(redis_client, db, user.btc_address, user.id)


# ---------------------------------------------------------------------------
# 15. GET /mining/uptime — Worker uptime calendar
# ---------------------------------------------------------------------------
@router.get("/uptime", response_model=schemas.UptimeCalendarResponse)
async def get_uptime(
    days: int = Query(30, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.UptimeCalendarResponse:
    """Get worker uptime calendar (30-day grid)."""
    return await service.get_uptime_calendar(db, user.id, days)


# ---------------------------------------------------------------------------
# 16. GET /mining/network/difficulty — Network difficulty
# ---------------------------------------------------------------------------
@router.get("/network/difficulty", response_model=schemas.NetworkDifficultyResponse)
async def get_network_difficulty(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.NetworkDifficultyResponse:
    """Get current network difficulty + history."""
    redis_client = _redis()
    return await service.get_network_difficulty(redis_client, db)


# ---------------------------------------------------------------------------
# 17. GET /mining/network/blocks — Recent network blocks
# ---------------------------------------------------------------------------
@router.get("/network/blocks", response_model=schemas.NetworkBlocksResponse)
async def get_network_blocks(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.NetworkBlocksResponse:
    """Get recent network blocks."""
    redis_client = _redis()
    return await service.get_network_blocks(redis_client, db, limit)


# ---------------------------------------------------------------------------
# 18. GET /mining/celebrations/pending — Uncelebrated block events
# ---------------------------------------------------------------------------
@router.get("/celebrations/pending", response_model=schemas.PendingCelebrationsResponse)
async def get_pending_celebrations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> schemas.PendingCelebrationsResponse:
    """Return block celebrations the user hasn't seen yet."""
    items = await service.get_pending_celebrations(db, user.id)
    return schemas.PendingCelebrationsResponse(
        celebrations=[schemas.CelebrationItem(**item) for item in items],
    )


# ---------------------------------------------------------------------------
# 19. POST /mining/celebrations/{celebration_id}/ack — Mark as seen
# ---------------------------------------------------------------------------
@router.post("/celebrations/{celebration_id}/ack", status_code=204)
async def acknowledge_celebration(
    celebration_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Mark a celebration as seen so it won't be delivered again."""
    updated = await service.acknowledge_celebration(db, user.id, celebration_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Celebration not found or already acknowledged")
