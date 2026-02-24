"""Games & Lottery API — 7 endpoints."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.database import get_session
from tbg.db.models import (
    GameSession,
    LotteryDraw,
    LotteryResult,
    User,
)
from tbg.games.game_data_service import get_live_weekly_rank, get_weekly_game_data
from tbg.games.lottery_service import get_lottery_results, get_user_lottery_result
from tbg.games.schemas import (
    GameHistoryResponse,
    GamePlayRequest,
    GamePlayResponse,
    LotteryCurrentResponse,
    LotteryDrawResponse,
    LotteryResultEntry,
    LotteryResultsResponse,
    LotteryStatsResponse,
    LotteryWeekResultsResponse,
    PastWeekResultResponse,
    WeeklyGameDataResponse,
)
from tbg.games.week_utils import (
    get_current_week_boundaries,
    get_current_week_iso,
    get_week_boundaries,
    iso_week_to_dates,
)
from tbg.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Games & Lottery"])

VALID_GAME_TYPES = {"hammer", "horse_race", "slot_machine", "scratch_card"}


# ── Helpers (must be defined before endpoints that reference them) ──


async def _optional_user(
    db: AsyncSession = Depends(get_session),
) -> User | None:
    """Optional auth — returns None if no valid token. Used for public endpoints."""
    return None


async def _get_top_results(
    db: AsyncSession, draw_id: int, limit: int = 10
) -> list[LotteryResultEntry]:
    """Get top N results for a draw."""
    results_query = await db.execute(
        select(LotteryResult)
        .where(LotteryResult.draw_id == draw_id)
        .order_by(LotteryResult.rank)
        .limit(limit)
    )
    results = results_query.scalars().all()

    entries = []
    for lr in results:
        user_name = await _get_user_display_name(db, lr.user_id)
        entries.append(LotteryResultEntry(
            user_id=lr.user_id,
            user_name=user_name,
            rank=lr.rank,
            best_difficulty=lr.best_difficulty,
            total_shares=lr.total_shares,
            xp_awarded=lr.xp_awarded,
            percentile=float(lr.percentile),
        ))

    return entries


async def _get_user_display_name(db: AsyncSession, user_id: int) -> str:
    """Get user display name, falling back to truncated BTC address."""
    result = await db.execute(
        select(User.display_name, User.btc_address).where(User.id == user_id)
    )
    row = result.one_or_none()
    if row is None:
        return "Unknown"
    return row.display_name or (row.btc_address[:12] + "..." if row.btc_address else "Unknown")


def _draw_to_response(draw: LotteryDraw) -> LotteryDrawResponse:
    """Convert ORM LotteryDraw to response model."""
    return LotteryDrawResponse(
        id=draw.id,
        week_iso=draw.week_iso,
        week_start=draw.week_start,
        week_end=draw.week_end,
        total_participants=draw.total_participants,
        total_shares=draw.total_shares,
        winning_difficulty=draw.winning_difficulty,
        winner_user_id=draw.winner_user_id,
        status=draw.status,
        drawn_at=draw.drawn_at,
    )


# ── Game Data Endpoints ──


@router.get("/games/weekly", response_model=WeeklyGameDataResponse)
async def get_weekly_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get current week's game data for the authenticated user."""
    redis = get_redis()
    return await get_weekly_game_data(db, redis, current_user)


@router.get("/games/history", response_model=GameHistoryResponse)
async def get_game_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get past weeks' game results (paginated)."""
    # Total count of draws where user participated
    total_result = await db.execute(
        select(func.count()).select_from(LotteryResult).where(
            LotteryResult.user_id == current_user.id,
        )
    )
    total = total_result.scalar_one() or 0

    # Get paginated results
    offset = (page - 1) * per_page
    results = await db.execute(
        select(LotteryResult, LotteryDraw)
        .join(LotteryDraw, LotteryResult.draw_id == LotteryDraw.id)
        .where(LotteryResult.user_id == current_user.id)
        .order_by(LotteryDraw.week_start.desc())
        .offset(offset)
        .limit(per_page)
    )

    # Get the most recent game played per week for the user
    weeks = []
    for row in results:
        lr: LotteryResult = row.LotteryResult
        ld: LotteryDraw = row.LotteryDraw

        # Find the most recent game played that week
        game_result = await db.execute(
            select(GameSession.game_type)
            .where(
                GameSession.user_id == current_user.id,
                GameSession.week_iso == ld.week_iso,
            )
            .order_by(GameSession.played_at.desc())
            .limit(1)
        )
        game_played = game_result.scalar_one_or_none() or "none"

        week_start_dt, week_end_dt = get_week_boundaries(
            datetime.combine(ld.week_start, datetime.min.time(), tzinfo=timezone.utc)
        )

        weeks.append(PastWeekResultResponse(
            week_start=week_start_dt,
            week_end=week_end_dt,
            best_difficulty=lr.best_difficulty,
            weekly_rank=lr.rank,
            game_played=game_played,
        ))

    return GameHistoryResponse(
        weeks=weeks,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/games/play", response_model=GamePlayResponse)
async def record_game_session(
    body: GamePlayRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Record that a user played a game. For analytics only."""
    if body.game_type not in VALID_GAME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid game_type. Must be one of: {', '.join(VALID_GAME_TYPES)}",
        )

    session = GameSession(
        user_id=current_user.id,
        game_type=body.game_type,
        week_iso=get_current_week_iso(),
        played_at=datetime.now(timezone.utc),
        game_metadata=body.metadata or {},
    )
    db.add(session)
    await db.commit()

    return GamePlayResponse(session_id=session.id)


# ── Lottery Endpoints ──


@router.get("/lottery/current", response_model=LotteryCurrentResponse)
async def get_lottery_current(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get current week's lottery status with user's live rank."""
    week_iso = get_current_week_iso()
    week_start, _ = get_current_week_boundaries()
    redis = get_redis()

    # Check if there's an open draw
    draw_result = await db.execute(
        select(LotteryDraw).where(LotteryDraw.week_iso == week_iso)
    )
    draw = draw_result.scalar_one_or_none()

    # Get live rank
    rank_info = await get_live_weekly_rank(db, redis, current_user.id, week_start)

    return LotteryCurrentResponse(
        week_iso=week_iso,
        status=draw.status if draw else "open",
        total_participants=rank_info["total_participants"],
        your_rank=rank_info["rank"],
        your_diff=0.0,  # Will be populated from WeeklyBestDiff
        your_percentile=rank_info["percentile"],
    )


@router.get("/lottery/results", response_model=LotteryResultsResponse)
async def get_latest_lottery_results(
    current_user: User | None = Depends(_optional_user),
    db: AsyncSession = Depends(get_session),
):
    """Get the latest completed lottery results."""
    draw_result = await db.execute(
        select(LotteryDraw)
        .where(LotteryDraw.status == "completed")
        .order_by(LotteryDraw.drawn_at.desc())
        .limit(1)
    )
    draw = draw_result.scalar_one_or_none()
    if draw is None:
        raise HTTPException(status_code=404, detail="No completed lottery draws found")

    top_10 = await _get_top_results(db, draw.id, limit=10)

    your_result = None
    if current_user:
        ur = await get_user_lottery_result(db, draw.id, current_user.id)
        if ur:
            user_name = await _get_user_display_name(db, ur.user_id)
            your_result = LotteryResultEntry(
                user_id=ur.user_id,
                user_name=user_name,
                rank=ur.rank,
                best_difficulty=ur.best_difficulty,
                total_shares=ur.total_shares,
                xp_awarded=ur.xp_awarded,
                percentile=float(ur.percentile),
            )

    return LotteryResultsResponse(
        draw=_draw_to_response(draw),
        top_10=top_10,
        your_result=your_result,
    )


@router.get("/lottery/results/{week}", response_model=LotteryWeekResultsResponse)
async def get_week_lottery_results(
    week: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """Get specific week's lottery results (paginated)."""
    draw_result = await db.execute(
        select(LotteryDraw).where(LotteryDraw.week_iso == week)
    )
    draw = draw_result.scalar_one_or_none()
    if draw is None:
        raise HTTPException(status_code=404, detail=f"No lottery draw found for {week}")

    total_result = await db.execute(
        select(func.count()).select_from(LotteryResult).where(
            LotteryResult.draw_id == draw.id,
        )
    )
    total = total_result.scalar_one() or 0

    offset = (page - 1) * per_page
    results_query = await db.execute(
        select(LotteryResult)
        .where(LotteryResult.draw_id == draw.id)
        .order_by(LotteryResult.rank)
        .offset(offset)
        .limit(per_page)
    )
    results = results_query.scalars().all()

    entries = []
    for lr in results:
        user_name = await _get_user_display_name(db, lr.user_id)
        entries.append(LotteryResultEntry(
            user_id=lr.user_id,
            user_name=user_name,
            rank=lr.rank,
            best_difficulty=lr.best_difficulty,
            total_shares=lr.total_shares,
            xp_awarded=lr.xp_awarded,
            percentile=float(lr.percentile),
        ))

    return LotteryWeekResultsResponse(
        draw=_draw_to_response(draw),
        results=entries,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/lottery/stats", response_model=LotteryStatsResponse)
async def get_lottery_stats(
    db: AsyncSession = Depends(get_session),
):
    """Get overall lottery statistics."""
    # Total completed draws
    total_draws_result = await db.execute(
        select(func.count()).select_from(LotteryDraw).where(
            LotteryDraw.status == "completed",
        )
    )
    total_draws = total_draws_result.scalar_one() or 0

    if total_draws == 0:
        return LotteryStatsResponse(
            total_draws=0,
            total_participants_all_time=0,
            average_participants_per_draw=0.0,
            average_best_diff=0.0,
            highest_winning_diff=None,
            most_recent_draw=None,
        )

    # Aggregate stats
    stats_result = await db.execute(
        select(
            func.sum(LotteryDraw.total_participants).label("total_p"),
            func.avg(LotteryDraw.total_participants).label("avg_p"),
            func.max(LotteryDraw.winning_difficulty).label("max_diff"),
        ).where(LotteryDraw.status == "completed")
    )
    stats = stats_result.one()

    avg_diff_result = await db.execute(
        select(func.avg(LotteryResult.best_difficulty))
    )
    avg_diff = avg_diff_result.scalar_one() or 0.0

    most_recent_result = await db.execute(
        select(LotteryDraw.week_iso)
        .where(LotteryDraw.status == "completed")
        .order_by(LotteryDraw.drawn_at.desc())
        .limit(1)
    )
    most_recent = most_recent_result.scalar_one_or_none()

    return LotteryStatsResponse(
        total_draws=total_draws,
        total_participants_all_time=int(stats.total_p or 0),
        average_participants_per_draw=round(float(stats.avg_p or 0), 1),
        average_best_diff=round(float(avg_diff), 2),
        highest_winning_diff=float(stats.max_diff) if stats.max_diff else None,
        most_recent_draw=most_recent,
    )


