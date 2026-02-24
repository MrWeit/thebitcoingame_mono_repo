"""Match scoring and management service."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    CompetitionRegistration,
    CompetitionTeam,
    Match,
    Share,
    User,
    Worker,
)
from tbg.competition.worldcup_engine import calculate_goals, get_competition

logger = logging.getLogger(__name__)


async def get_match(db: AsyncSession, match_id: int) -> Match:
    """Get a match by ID."""
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise ValueError(f"Match {match_id} not found")
    return match


async def get_matches(
    db: AsyncSession,
    competition_id: int,
    round_name: str | None = None,
    status: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> list[Match]:
    """Get matches for a competition with optional filters."""
    q = select(Match).where(Match.competition_id == competition_id)
    if round_name:
        q = q.where(Match.round == round_name)
    if status:
        q = q.where(Match.status == status)
    q = q.order_by(Match.match_date).offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(q)
    return list(result.scalars().all())


async def start_match(db: AsyncSession, match_id: int) -> Match:
    """Mark a match as live."""
    match = await get_match(db, match_id)
    if match.status != "scheduled":
        raise ValueError(f"Cannot start match in '{match.status}' state")
    match.status = "live"
    match.started_at = datetime.now(timezone.utc)
    await db.commit()
    return match


async def get_team_match_stats(
    db: AsyncSession,
    team_id: int,
    start_time: datetime | None,
    end_time: datetime | None,
) -> dict:
    """Get aggregated mining stats for a team during a match period."""
    # Get team members
    reg_result = await db.execute(
        select(CompetitionRegistration.user_id)
        .where(CompetitionRegistration.team_id == team_id)
    )
    user_ids = [row[0] for row in reg_result.all()]

    if not user_ids:
        return {"total_hashrate": 0, "miner_count": 0, "blocks_found": 0, "total_shares": 0}

    # Get hashrate from workers
    hr_result = await db.execute(
        select(func.sum(Worker.hashrate_1h))
        .where(Worker.user_id.in_(user_ids))
    )
    total_hashrate = float(hr_result.scalar_one() or 0)

    # Count miners with active workers
    miner_result = await db.execute(
        select(func.count(func.distinct(Worker.user_id)))
        .where(Worker.user_id.in_(user_ids))
    )
    miner_count = miner_result.scalar_one() or 0

    # Count blocks found during match window
    blocks_found = 0
    total_shares = 0
    if start_time and end_time:
        # Get user btc addresses
        users_result = await db.execute(
            select(User.btc_address).where(User.id.in_(user_ids))
        )
        addresses = [row[0] for row in users_result.all()]

        if addresses:
            block_result = await db.execute(
                select(func.count(Share.time))
                .where(
                    Share.btc_address.in_(addresses),
                    Share.is_block.is_(True),
                    Share.time >= start_time,
                    Share.time <= end_time,
                )
            )
            blocks_found = block_result.scalar_one() or 0

            share_result = await db.execute(
                select(func.count(Share.time))
                .where(
                    Share.btc_address.in_(addresses),
                    Share.time >= start_time,
                    Share.time <= end_time,
                )
            )
            total_shares = share_result.scalar_one() or 0

    return {
        "total_hashrate": total_hashrate,
        "miner_count": miner_count,
        "blocks_found": blocks_found,
        "total_shares": total_shares,
    }


async def get_man_of_match(
    db: AsyncSession,
    team_a_id: int,
    team_b_id: int,
    start_time: datetime | None,
    end_time: datetime | None,
) -> dict | None:
    """Find the player with the highest individual hashrate."""
    # Get all team members
    reg_result = await db.execute(
        select(CompetitionRegistration.user_id)
        .where(CompetitionRegistration.team_id.in_([team_a_id, team_b_id]))
    )
    user_ids = [row[0] for row in reg_result.all()]

    if not user_ids:
        return None

    # Find the user with highest hashrate
    result = await db.execute(
        select(Worker.user_id, func.sum(Worker.hashrate_1h).label("total_hr"))
        .where(Worker.user_id.in_(user_ids))
        .group_by(Worker.user_id)
        .order_by(func.sum(Worker.hashrate_1h).desc())
        .limit(1)
    )
    top = result.first()
    if not top:
        return None

    user_result = await db.execute(select(User).where(User.id == top.user_id))
    user = user_result.scalar_one_or_none()

    return {
        "user_id": top.user_id,
        "best_diff": float(top.total_hr or 0),
        "name": (user.display_name or f"Miner-{top.user_id}") if user else f"Miner-{top.user_id}",
    }


async def score_match(db: AsyncSession, match_id: int) -> Match:
    """Score a match based on mining performance. Deterministic formula."""
    match = await get_match(db, match_id)
    comp = await get_competition(db, match.competition_id)
    baseline = comp.config.get("baseline_hashrate", 1e15)

    # Get team stats
    team_a_stats = await get_team_match_stats(db, match.team_a_id, match.started_at, match.completed_at or datetime.now(timezone.utc))
    team_b_stats = await get_team_match_stats(db, match.team_b_id, match.started_at, match.completed_at or datetime.now(timezone.utc))

    match.hashrate_a = team_a_stats["total_hashrate"]
    match.hashrate_b = team_b_stats["total_hashrate"]
    match.miners_a = team_a_stats["miner_count"]
    match.miners_b = team_b_stats["miner_count"]

    match.score_a = calculate_goals(team_a_stats["total_hashrate"], team_a_stats["blocks_found"], baseline)
    match.score_b = calculate_goals(team_b_stats["total_hashrate"], team_b_stats["blocks_found"], baseline)

    # Man of the match
    mom = await get_man_of_match(db, match.team_a_id, match.team_b_id, match.started_at, match.completed_at)
    if mom:
        match.man_of_match_user_id = mom["user_id"]
        match.man_of_match_diff = mom["best_diff"]

    match.status = "completed"
    match.completed_at = datetime.now(timezone.utc)

    # Update group standings if group match
    if match.round == "group":
        await _update_group_standings(db, match)

    await db.commit()
    return match


async def complete_match(
    db: AsyncSession,
    match_id: int,
    score_a: int | None = None,
    score_b: int | None = None,
) -> Match:
    """Complete a match with explicit scores (for testing / admin override)."""
    match = await get_match(db, match_id)

    if score_a is not None:
        match.score_a = score_a
    if score_b is not None:
        match.score_b = score_b

    match.status = "completed"
    match.completed_at = datetime.now(timezone.utc)
    if not match.started_at:
        match.started_at = match.completed_at

    if match.round == "group":
        await _update_group_standings(db, match)

    await db.commit()
    return match


async def _update_group_standings(db: AsyncSession, match: Match) -> None:
    """Update group standings after a group stage match."""
    team_a = await db.get(CompetitionTeam, match.team_a_id)
    team_b = await db.get(CompetitionTeam, match.team_b_id)

    if not team_a or not team_b:
        return

    team_a.played += 1
    team_b.played += 1

    if match.score_a > match.score_b:
        team_a.won += 1
        team_a.points += 3
        team_b.lost += 1
    elif match.score_b > match.score_a:
        team_b.won += 1
        team_b.points += 3
        team_a.lost += 1
    else:
        team_a.drawn += 1
        team_b.drawn += 1
        team_a.points += 1
        team_b.points += 1

    team_a.hashrate = max(team_a.hashrate, match.hashrate_a)
    team_b.hashrate = max(team_b.hashrate, match.hashrate_b)

    await db.flush()


async def get_top_miners_for_team(
    db: AsyncSession, team_id: int, limit: int = 3,
) -> list[dict]:
    """Get top miners by hashrate for a team."""
    reg_result = await db.execute(
        select(CompetitionRegistration.user_id)
        .where(CompetitionRegistration.team_id == team_id)
    )
    user_ids = [row[0] for row in reg_result.all()]

    if not user_ids:
        return []

    result = await db.execute(
        select(Worker.user_id, func.sum(Worker.hashrate_1h).label("total_hr"))
        .where(Worker.user_id.in_(user_ids))
        .group_by(Worker.user_id)
        .order_by(func.sum(Worker.hashrate_1h).desc())
        .limit(limit)
    )

    miners = []
    for row in result.all():
        user_result = await db.execute(select(User).where(User.id == row.user_id))
        user = user_result.scalar_one_or_none()
        miners.append({
            "name": (user.display_name or f"Miner-{row.user_id}") if user else f"Miner-{row.user_id}",
            "hashrate": float(row.total_hr or 0),
        })

    return miners
