"""League system service — standings and promotion/relegation."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import League, LeagueClub, Match

logger = logging.getLogger(__name__)


def apply_promotion_relegation(standings: list[dict]) -> list[dict]:
    """Mark top 2 as promoted, bottom 2 as relegated.

    Input: list of dicts with at least 'id' and 'points' keys.
    Returns: same list with 'is_promoted' and 'is_relegated' added.
    """
    total = len(standings)
    for i, club in enumerate(standings):
        club["is_promoted"] = i < 2
        club["is_relegated"] = i >= total - 2 if total > 4 else False
    return standings


async def get_leagues(
    db: AsyncSession, status: str = "active",
) -> list[League]:
    """Get leagues filtered by status."""
    result = await db.execute(
        select(League)
        .where(League.status == status)
        .order_by(League.division, League.name)
    )
    return list(result.scalars().all())


async def get_league_with_standings(
    db: AsyncSession, league_id: int, current_user_coop_id: int | None = None,
) -> dict:
    """Get league with clubs sorted by standings."""
    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise ValueError(f"League {league_id} not found")

    clubs_result = await db.execute(
        select(LeagueClub)
        .where(LeagueClub.league_id == league_id)
        .order_by(LeagueClub.points.desc(), LeagueClub.hashrate.desc())
    )
    clubs = list(clubs_result.scalars().all())

    # Apply promotion/relegation zones
    total = len(clubs)
    for i, club in enumerate(clubs):
        club.is_promoted = i < 2
        club.is_relegated = i >= total - 2 if total > 4 else False

    return {
        "league": league,
        "clubs": clubs,
        "current_user_coop_id": current_user_coop_id,
    }


async def create_league(
    db: AsyncSession,
    name: str,
    division: int,
    season: str,
    start_date: datetime,
    end_date: datetime,
) -> League:
    """Create a new league."""
    league = League(
        name=name,
        division=division,
        season=season,
        start_date=start_date.date() if isinstance(start_date, datetime) else start_date,
        end_date=end_date.date() if isinstance(end_date, datetime) else end_date,
        created_at=datetime.now(timezone.utc),
    )
    db.add(league)
    await db.commit()
    await db.refresh(league)
    return league


async def add_club_to_league(
    db: AsyncSession,
    league_id: int,
    cooperative_id: int,
    name: str,
) -> LeagueClub:
    """Add a club (cooperative) to a league."""
    club = LeagueClub(
        league_id=league_id,
        cooperative_id=cooperative_id,
        name=name,
    )
    db.add(club)
    await db.commit()
    await db.refresh(club)
    return club


async def update_club_result(
    db: AsyncSession,
    club_id: int,
    result_type: str,  # "win", "draw", "loss"
    hashrate: float = 0,
) -> LeagueClub:
    """Update a club's record after a league match."""
    result = await db.execute(select(LeagueClub).where(LeagueClub.id == club_id))
    club = result.scalar_one_or_none()
    if not club:
        raise ValueError(f"Club {club_id} not found")

    club.played += 1
    if result_type == "win":
        club.won += 1
        club.points += 3
    elif result_type == "draw":
        club.drawn += 1
        club.points += 1
    elif result_type == "loss":
        club.lost += 1
    else:
        raise ValueError(f"Invalid result_type: {result_type}")

    if hashrate > 0:
        club.hashrate = hashrate

    await db.commit()
    return club


async def get_league_results(
    db: AsyncSession,
    league_id: int,
    page: int = 1,
    per_page: int = 20,
) -> list[dict]:
    """Get recent match results for a league. Placeholder until cooperatives have matches."""
    # For now return empty list — league matches are cooperative-based (Phase 7)
    return []
