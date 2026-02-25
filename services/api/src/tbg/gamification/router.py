"""Gamification API endpoints — 9 routes."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.database import get_session
from tbg.db.models import (
    BadgeDefinition,
    BadgeStats,
    Notification,
    StreakCalendar,
    User,
    UserBadge,
    UserGamification,
    XPLedger,
)
from tbg.gamification.level_thresholds import LEVEL_THRESHOLDS, compute_level
from tbg.gamification.schemas import (
    AllBadgesResponse,
    AllLevelsResponse,
    BadgeDefinitionResponse,
    BadgeDetailResponse,
    EarnedBadgeResponse,
    GamificationSummaryResponse,
    LevelEntry,
    PendingLevelCelebrationItem,
    PendingLevelCelebrationsResponse,
    PendingStreakCelebrationItem,
    PendingStreakCelebrationsResponse,
    StreakCalendarResponse,
    StreakResponse,
    StreakWeekEntry,
    UserBadgesResponse,
    XPHistoryEntry,
    XPHistoryResponse,
    XPResponse,
)
from tbg.gamification.streak_service import get_current_week_iso
from tbg.gamification.xp_service import get_or_create_gamification

router = APIRouter(prefix="/api/v1", tags=["Gamification"])


# ── Public endpoints ──


@router.get("/badges", response_model=AllBadgesResponse)
async def list_badges(db: AsyncSession = Depends(get_session)):
    """Get all badge definitions with stats."""
    result = await db.execute(
        select(BadgeDefinition)
        .where(BadgeDefinition.is_active.is_(True))
        .order_by(BadgeDefinition.sort_order)
    )
    badges = result.scalars().all()

    # Load stats
    stats_result = await db.execute(select(BadgeStats))
    stats_map = {s.badge_id: s for s in stats_result.scalars()}

    items = []
    for b in badges:
        s = stats_map.get(b.id)
        items.append(BadgeDefinitionResponse(
            slug=b.slug,
            name=b.name,
            description=b.description,
            category=b.category,
            rarity=b.rarity,
            xp_reward=b.xp_reward,
            total_earned=s.total_earned if s else 0,
            percentage=float(s.percentage) if s else 0.0,
        ))

    return AllBadgesResponse(badges=items)


@router.get("/badges/{slug}", response_model=BadgeDetailResponse)
async def get_badge(slug: str, db: AsyncSession = Depends(get_session)):
    """Get single badge detail with recent earners."""
    result = await db.execute(
        select(BadgeDefinition).where(BadgeDefinition.slug == slug)
    )
    badge = result.scalar_one_or_none()
    if badge is None:
        raise HTTPException(status_code=404, detail="Badge not found")

    # Stats
    stats_result = await db.execute(
        select(BadgeStats).where(BadgeStats.badge_id == badge.id)
    )
    stats = stats_result.scalar_one_or_none()

    # Recent earners (last 10)
    earners_result = await db.execute(
        select(UserBadge, User)
        .join(User, UserBadge.user_id == User.id)
        .where(UserBadge.badge_id == badge.id)
        .order_by(UserBadge.earned_at.desc())
        .limit(10)
    )
    recent_earners = [
        {
            "user": row.User.display_name or row.User.btc_address[:12] + "...",
            "earned_at": row.UserBadge.earned_at.isoformat(),
        }
        for row in earners_result
    ]

    return BadgeDetailResponse(
        slug=badge.slug,
        name=badge.name,
        description=badge.description,
        category=badge.category,
        rarity=badge.rarity,
        xp_reward=badge.xp_reward,
        total_earned=stats.total_earned if stats else 0,
        percentage=float(stats.percentage) if stats else 0.0,
        recent_earners=recent_earners,
    )


@router.get("/levels", response_model=AllLevelsResponse)
async def list_levels():
    """Get all level definitions."""
    return AllLevelsResponse(
        levels=[
            LevelEntry(
                level=t["level"],
                title=t["title"],
                xp_required=t["xp_required"],
                cumulative=t["cumulative"],
            )
            for t in LEVEL_THRESHOLDS
        ]
    )


# ── Authenticated endpoints ──


@router.get("/users/me/badges", response_model=UserBadgesResponse)
async def get_my_badges(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get current user's earned badges."""
    result = await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == user.id)
        .order_by(UserBadge.earned_at.desc())
    )
    earned_badges = result.scalars().all()

    total_available = await db.execute(
        select(func.count()).select_from(BadgeDefinition).where(BadgeDefinition.is_active.is_(True))
    )

    return UserBadgesResponse(
        earned=[
            EarnedBadgeResponse(
                slug=ub.badge.slug,
                earned_at=ub.earned_at,
                metadata=ub.badge_metadata or {},
            )
            for ub in earned_badges
        ],
        total_available=total_available.scalar_one(),
        total_earned=len(earned_badges),
    )


@router.get("/users/me/xp", response_model=XPResponse)
async def get_my_xp(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get current user's XP and level."""
    gam = await get_or_create_gamification(db, user.id)
    level_info = compute_level(gam.total_xp)

    return XPResponse(
        total_xp=gam.total_xp,
        level=level_info["level"],
        level_title=level_info["title"],
        xp_into_level=level_info["xp_into_level"],
        xp_for_level=level_info["xp_for_level"],
        next_level=level_info["next_level"],
        next_title=level_info["next_title"],
    )


@router.get("/users/me/xp/history", response_model=XPHistoryResponse)
async def get_xp_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get XP ledger history (paginated)."""
    # Total count
    total_result = await db.execute(
        select(func.count()).select_from(XPLedger).where(XPLedger.user_id == user.id)
    )
    total = total_result.scalar_one()

    # Paginated entries
    offset = (page - 1) * per_page
    result = await db.execute(
        select(XPLedger)
        .where(XPLedger.user_id == user.id)
        .order_by(XPLedger.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    entries = result.scalars().all()

    return XPHistoryResponse(
        entries=[
            XPHistoryEntry(
                amount=e.amount,
                source=e.source,
                source_id=e.source_id,
                description=e.description,
                created_at=e.created_at,
            )
            for e in entries
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/users/me/streak", response_model=StreakResponse)
async def get_my_streak(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get current streak info."""
    gam = await get_or_create_gamification(db, user.id)

    # Check if active this week
    current_week = get_current_week_iso()
    active_result = await db.execute(
        select(StreakCalendar).where(
            StreakCalendar.user_id == user.id,
            StreakCalendar.week_iso == current_week,
            StreakCalendar.is_active.is_(True),
        )
    )
    is_active = active_result.scalar_one_or_none() is not None

    # Effective streak: if the user is active this week but check_streaks()
    # hasn't run yet (e.g. current_streak=0 but active this week), show 1.
    # If they already have a streak and are active, show current + 1 (the
    # upcoming week hasn't been counted yet but they've already satisfied it).
    if is_active:
        effective = max(gam.current_streak, 1)
    else:
        effective = gam.current_streak

    return StreakResponse(
        current_streak=gam.current_streak,
        longest_streak=gam.longest_streak,
        streak_start_date=gam.streak_start_date,
        last_active_week=gam.last_active_week,
        is_active_this_week=is_active,
        effective_streak=effective,
    )


@router.get("/users/me/streak/calendar", response_model=StreakCalendarResponse)
async def get_streak_calendar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get weekly streak calendar (last 52 weeks)."""
    result = await db.execute(
        select(StreakCalendar)
        .where(StreakCalendar.user_id == user.id)
        .order_by(StreakCalendar.week_start.desc())
        .limit(52)
    )
    weeks = result.scalars().all()

    return StreakCalendarResponse(
        weeks=[
            StreakWeekEntry(
                week_iso=w.week_iso,
                week_start=w.week_start,
                share_count=w.share_count,
                best_diff=w.best_diff,
                is_active=w.is_active,
            )
            for w in weeks
        ]
    )


@router.get("/users/me/gamification", response_model=GamificationSummaryResponse)
async def get_gamification_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Full gamification summary — O(1) from denormalized table."""
    gam = await get_or_create_gamification(db, user.id)
    level_info = compute_level(gam.total_xp)

    # Check if active this week
    current_week = get_current_week_iso()
    active_result = await db.execute(
        select(StreakCalendar).where(
            StreakCalendar.user_id == user.id,
            StreakCalendar.week_iso == current_week,
            StreakCalendar.is_active.is_(True),
        )
    )
    is_active = active_result.scalar_one_or_none() is not None

    total_badges = await db.execute(
        select(func.count()).select_from(BadgeDefinition).where(BadgeDefinition.is_active.is_(True))
    )

    return GamificationSummaryResponse(
        xp=XPResponse(
            total_xp=gam.total_xp,
            level=level_info["level"],
            level_title=level_info["title"],
            xp_into_level=level_info["xp_into_level"],
            xp_for_level=level_info["xp_for_level"],
            next_level=level_info["next_level"],
            next_title=level_info["next_title"],
        ),
        streak=StreakResponse(
            current_streak=gam.current_streak,
            longest_streak=gam.longest_streak,
            streak_start_date=gam.streak_start_date,
            last_active_week=gam.last_active_week,
            is_active_this_week=is_active,
            effective_streak=max(gam.current_streak, 1) if is_active else gam.current_streak,
        ),
        badges={
            "earned": gam.badges_earned,
            "total": total_badges.scalar_one(),
        },
        stats={
            "total_shares": gam.total_shares,
            "best_difficulty": gam.best_difficulty,
            "blocks_found": gam.blocks_found,
        },
    )


# ── Level Celebrations ──


@router.get("/users/me/level-ups/pending", response_model=PendingLevelCelebrationsResponse)
async def get_pending_level_ups(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Return level-up celebrations the user hasn't seen yet."""
    from tbg.gamification.xp_service import get_pending_level_celebrations

    items = await get_pending_level_celebrations(db, user.id)
    return PendingLevelCelebrationsResponse(
        celebrations=[PendingLevelCelebrationItem(**item) for item in items],
    )


@router.post("/users/me/level-ups/{celebration_id}/ack", status_code=204)
async def acknowledge_level_up(
    celebration_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Mark a level-up celebration as seen."""
    from tbg.gamification.xp_service import acknowledge_level_celebration

    updated = await acknowledge_level_celebration(db, user.id, celebration_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Celebration not found or already acknowledged")


# ── Streak Celebrations ──


@router.get("/users/me/streak-milestones/pending", response_model=PendingStreakCelebrationsResponse)
async def get_pending_streak_milestones(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Return streak milestone celebrations the user hasn't seen yet."""
    from tbg.gamification.streak_service import get_pending_streak_celebrations

    items = await get_pending_streak_celebrations(db, user.id)
    return PendingStreakCelebrationsResponse(
        celebrations=[PendingStreakCelebrationItem(**item) for item in items],
    )


@router.post("/users/me/streak-milestones/{celebration_id}/ack", status_code=204)
async def acknowledge_streak_milestone(
    celebration_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Mark a streak milestone celebration as seen."""
    from tbg.gamification.streak_service import acknowledge_streak_celebration

    updated = await acknowledge_streak_celebration(db, user.id, celebration_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Celebration not found or already acknowledged")
