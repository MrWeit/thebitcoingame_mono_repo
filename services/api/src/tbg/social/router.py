"""Social API endpoints — 13 routes.

Cooperative (10), Activity (1), Public Profile (2).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.database import get_session
from tbg.db.models import User
from tbg.social.activity_service import get_activity_feed
from tbg.social.cooperative_service import (
    create_cooperative,
    dissolve_cooperative,
    get_cooperative,
    get_cooperative_members,
    get_user_membership,
    join_cooperative,
    leave_cooperative,
    list_cooperatives,
    regenerate_invite_code,
    remove_member,
    update_cooperative,
)
from tbg.social.public_profile_service import get_public_profile, get_public_stats
from tbg.social.schemas import (
    ActivityFeedResponse,
    ActivityResponse,
    CoopMemberResponse,
    CooperativeListResponse,
    CooperativeResponse,
    CooperativeStatsResponse,
    CreateCooperativeRequest,
    InviteCodeResponse,
    JoinCooperativeRequest,
    PublicProfileResponse,
    PublicStatsResponse,
    RemoveMemberRequest,
    UpdateCooperativeRequest,
)

router = APIRouter(prefix="/api/v1", tags=["Social"])


# ── Helper ──


def _build_coop_response(
    coop,
    members: list | None = None,
    show_invite: bool = False,
) -> CooperativeResponse:
    """Build a CooperativeResponse from ORM model."""
    member_responses = []
    if members:
        for cm, user in members:
            member_responses.append(CoopMemberResponse(
                user_id=str(cm.user_id),
                display_name=user.display_name or f"Miner-{user.btc_address[:8]}",
                hashrate=cm.hashrate,
                shares_today=cm.shares_today,
                is_online=cm.is_online,
                role=cm.role,
            ))

    return CooperativeResponse(
        id=str(coop.id),
        name=coop.name,
        motto=coop.motto,
        member_count=coop.member_count,
        combined_hashrate=coop.combined_hashrate,
        weekly_streak=coop.weekly_streak,
        best_combined_diff=coop.best_combined_diff,
        blocks_found=coop.blocks_found,
        total_shares_week=coop.total_shares_week,
        weekly_rank=coop.weekly_rank,
        members=member_responses,
        invite_code=coop.invite_code if show_invite else None,
    )


# ── Cooperative Endpoints (10) ──


@router.get("/cooperatives", response_model=CooperativeListResponse)
async def list_cooperatives_endpoint(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """List all active cooperatives (paginated, public)."""
    coops, total = await list_cooperatives(db, page, per_page)
    items = [_build_coop_response(c) for c in coops]
    return CooperativeListResponse(
        cooperatives=items, total=total, page=page, per_page=per_page,
    )


@router.post("/cooperatives", response_model=CooperativeResponse, status_code=201)
async def create_cooperative_endpoint(
    body: CreateCooperativeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Create a new cooperative. The creator becomes admin."""
    try:
        coop = await create_cooperative(db, user.id, body.name, body.motto)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    members = await get_cooperative_members(db, coop.id)
    return _build_coop_response(coop, members, show_invite=True)


@router.get("/cooperatives/{coop_id}", response_model=CooperativeResponse)
async def get_cooperative_endpoint(
    coop_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get cooperative detail with members (public, no invite code)."""
    coop = await get_cooperative(db, coop_id)
    if not coop or not coop.is_active:
        raise HTTPException(status_code=404, detail="Cooperative not found")

    members = await get_cooperative_members(db, coop_id)
    return _build_coop_response(coop, members, show_invite=False)


@router.put("/cooperatives/{coop_id}", response_model=CooperativeResponse)
async def update_cooperative_endpoint(
    coop_id: int,
    body: UpdateCooperativeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Update cooperative name/motto (admin only)."""
    try:
        coop = await update_cooperative(db, coop_id, user.id, body.name, body.motto)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    members = await get_cooperative_members(db, coop_id)
    return _build_coop_response(coop, members, show_invite=True)


@router.delete("/cooperatives/{coop_id}", status_code=204)
async def dissolve_cooperative_endpoint(
    coop_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Dissolve a cooperative (admin only, must be empty)."""
    try:
        await dissolve_cooperative(db, coop_id, user.id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/cooperatives/join", response_model=CooperativeResponse)
async def join_cooperative_endpoint(
    body: JoinCooperativeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Join a cooperative via invite code."""
    try:
        member = await join_cooperative(db, user.id, body.invite_code)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    coop = await get_cooperative(db, member.cooperative_id)
    members = await get_cooperative_members(db, coop.id)
    return _build_coop_response(coop, members, show_invite=True)


@router.post("/cooperatives/leave", status_code=200)
async def leave_cooperative_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Leave the current cooperative."""
    try:
        await leave_cooperative(db, user.id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"detail": "Left cooperative successfully"}


@router.post("/cooperatives/{coop_id}/remove-member", status_code=200)
async def remove_member_endpoint(
    coop_id: int,
    body: RemoveMemberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Remove a member from the cooperative (admin only)."""
    try:
        await remove_member(db, user.id, int(body.user_id))
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"detail": "Member removed successfully"}


@router.post("/cooperatives/{coop_id}/regenerate-code", response_model=InviteCodeResponse)
async def regenerate_code_endpoint(
    coop_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Regenerate the cooperative invite code (admin only)."""
    try:
        new_code = await regenerate_invite_code(db, user.id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return InviteCodeResponse(invite_code=new_code)


@router.get("/cooperatives/{coop_id}/stats", response_model=CooperativeStatsResponse)
async def get_coop_stats_endpoint(
    coop_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get cooperative stats."""
    coop = await get_cooperative(db, coop_id)
    if not coop or not coop.is_active:
        raise HTTPException(status_code=404, detail="Cooperative not found")

    members = await get_cooperative_members(db, coop_id)
    online_count = sum(1 for cm, _ in members if cm.is_online)

    return CooperativeStatsResponse(
        combined_hashrate=coop.combined_hashrate,
        total_shares_week=coop.total_shares_week,
        member_count=coop.member_count,
        online_count=online_count,
        blocks_found=coop.blocks_found,
        weekly_streak=coop.weekly_streak,
        best_combined_diff=coop.best_combined_diff,
    )


# ── Activity Feed (1) ──


@router.get("/activity/feed", response_model=ActivityFeedResponse)
async def get_activity_feed_endpoint(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get the current user's activity feed (personal history)."""
    activities, total = await get_activity_feed(db, user.id, page, per_page)
    return ActivityFeedResponse(
        activities=[
            ActivityResponse(
                id=str(a.id),
                type=a.activity_type,
                title=a.title,
                description=a.description,
                timestamp=a.created_at,
                metadata=a.activity_metadata or {},
            )
            for a in activities
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


# ── Public Profile (2) ──


@router.get("/users/{address}/profile", response_model=PublicProfileResponse)
async def get_user_public_profile(
    address: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a user's public profile by Bitcoin address."""
    profile = await get_public_profile(db, address)
    if profile is None:
        raise HTTPException(status_code=404, detail="User not found")
    return PublicProfileResponse(**profile)


@router.get("/users/{address}/stats", response_model=PublicStatsResponse)
async def get_user_public_stats(
    address: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a user's public mining stats by Bitcoin address."""
    stats = await get_public_stats(db, address)
    if stats is None:
        raise HTTPException(status_code=404, detail="User not found")
    return PublicStatsResponse(**stats)
