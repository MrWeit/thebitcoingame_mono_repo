"""Dashboard endpoints — stats, feed, events, badges."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.dashboard.service import (
    get_dashboard_stats,
    get_global_feed,
    get_recent_badges,
    get_upcoming_events,
)
from tbg.database import get_session
from tbg.redis_client import get_redis
from tbg.ws.manager import manager

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def dashboard_stats(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Aggregated dashboard statistics (10s cached in Redis)."""
    redis = get_redis()
    return await get_dashboard_stats(db, redis, user.id, user.btc_address)


@router.get("/feed")
async def global_feed(
    limit: int = Query(20, ge=1, le=50),
    before_id: int | None = Query(None),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Global activity feed (blocks found, badges earned, new miners)."""
    return await get_global_feed(db, limit, before_id)


@router.get("/events")
async def upcoming_events(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Upcoming events (lottery, streak deadline, competitions)."""
    return await get_upcoming_events(db, user.id)


@router.get("/recent-badges")
async def recent_badges(
    limit: int = Query(5, ge=1, le=20),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Recently earned badges for the current user."""
    return await get_recent_badges(db, user.id, limit)


@router.get("/ws-stats")
async def ws_stats() -> dict:
    """WebSocket connection statistics (unauthenticated, for monitoring)."""
    return manager.get_stats()
