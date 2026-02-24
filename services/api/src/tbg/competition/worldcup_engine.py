"""World Cup tournament engine — state machine and mechanics.

State progression: upcoming -> registration -> group_stage -> knockout -> completed
Transitions are validated — no skipping states or going backwards.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    Competition,
    CompetitionRegistration,
    CompetitionTeam,
    Match,
    User,
)

logger = logging.getLogger(__name__)

VALID_TRANSITIONS: dict[str, list[str]] = {
    "upcoming": ["registration"],
    "registration": ["group_stage"],
    "group_stage": ["knockout"],
    "knockout": ["completed"],
    "completed": [],
}

# Country code → name lookup (shared with leaderboard_service)
COUNTRY_NAMES: dict[str, str] = {
    "US": "United States", "JP": "Japan", "DE": "Germany", "GB": "United Kingdom",
    "CA": "Canada", "BR": "Brazil", "AU": "Australia", "FR": "France",
    "ES": "Spain", "NL": "Netherlands", "NO": "Norway", "PT": "Portugal",
    "CH": "Switzerland", "KR": "South Korea", "SE": "Sweden", "IT": "Italy",
    "MX": "Mexico", "AR": "Argentina", "IN": "India", "SG": "Singapore",
}


def validate_transition(current_status: str, target_status: str) -> None:
    """Validate a state transition. Raises ValueError if invalid."""
    valid = VALID_TRANSITIONS.get(current_status, [])
    if target_status not in valid:
        raise ValueError(
            f"Invalid transition: {current_status} -> {target_status}. "
            f"Valid transitions: {valid}"
        )


async def get_competition(db: AsyncSession, competition_id: int) -> Competition:
    """Get a competition by ID."""
    result = await db.execute(
        select(Competition).where(Competition.id == competition_id)
    )
    comp = result.scalar_one_or_none()
    if comp is None:
        raise ValueError(f"Competition {competition_id} not found")
    return comp


async def create_competition(
    db: AsyncSession,
    name: str,
    comp_type: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    config: dict | None = None,
) -> Competition:
    """Create a new competition."""
    now = datetime.now(timezone.utc)
    comp = Competition(
        name=name,
        type=comp_type,
        status="upcoming",
        start_date=(start_date or now).date() if isinstance(start_date or now, datetime) else start_date or now.date(),
        end_date=(end_date or now + timedelta(days=60)).date() if isinstance(end_date or now + timedelta(days=60), datetime) else end_date,
        config=config or {"min_miners_per_country": 5, "baseline_hashrate": 1e15},
        created_at=now,
        updated_at=now,
    )
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    return comp


async def transition_state(
    db: AsyncSession,
    competition_id: int,
    target_state: str,
) -> Competition:
    """Transition World Cup to a new state with validation."""
    competition = await get_competition(db, competition_id)
    validate_transition(competition.status, target_state)

    # State-specific validation
    if target_state == "group_stage":
        await _validate_registration_complete(db, competition)
    elif target_state == "knockout":
        await _validate_group_stage_complete(db, competition)
    elif target_state == "completed":
        await _validate_knockout_complete(db, competition)

    competition.status = target_state
    competition.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # Trigger state entry actions
    if target_state == "group_stage":
        await generate_group_matches(db, competition)
    elif target_state == "knockout":
        await generate_knockout_bracket(db, competition)

    return competition


async def _validate_registration_complete(
    db: AsyncSession, competition: Competition,
) -> None:
    """Validate registration meets minimum requirements."""
    min_miners = competition.config.get("min_miners_per_country", 5)

    # Count teams with enough miners
    result = await db.execute(
        select(CompetitionTeam.id, func.count(CompetitionRegistration.id).label("miner_count"))
        .join(CompetitionRegistration, CompetitionRegistration.team_id == CompetitionTeam.id)
        .where(CompetitionTeam.competition_id == competition.id)
        .group_by(CompetitionTeam.id)
        .having(func.count(CompetitionRegistration.id) >= min_miners)
    )
    eligible_teams = result.all()

    if len(eligible_teams) < 4:
        raise ValueError(
            f"Need at least 4 countries with {min_miners}+ miners. "
            f"Currently have {len(eligible_teams)} eligible teams."
        )


async def _validate_group_stage_complete(
    db: AsyncSession, competition: Competition,
) -> None:
    """Validate all group stage matches are completed."""
    result = await db.execute(
        select(func.count(Match.id))
        .where(
            Match.competition_id == competition.id,
            Match.round == "group",
            Match.status != "completed",
        )
    )
    pending = result.scalar_one()
    if pending > 0:
        raise ValueError(f"Cannot advance to knockout: {pending} group matches still pending")


async def _validate_knockout_complete(
    db: AsyncSession, competition: Competition,
) -> None:
    """Validate final match is completed."""
    result = await db.execute(
        select(func.count(Match.id))
        .where(
            Match.competition_id == competition.id,
            Match.round == "final",
            Match.status == "completed",
        )
    )
    completed_finals = result.scalar_one()
    if completed_finals == 0:
        raise ValueError("Cannot complete competition: final match not yet played")


async def get_or_create_team(
    db: AsyncSession,
    competition_id: int,
    country_code: str,
) -> CompetitionTeam:
    """Get or create a country team for a competition."""
    result = await db.execute(
        select(CompetitionTeam).where(
            CompetitionTeam.competition_id == competition_id,
            CompetitionTeam.country_code == country_code,
        )
    )
    team = result.scalar_one_or_none()
    if team:
        return team

    team = CompetitionTeam(
        competition_id=competition_id,
        country_code=country_code,
        country_name=COUNTRY_NAMES.get(country_code, country_code),
    )
    db.add(team)
    await db.flush()
    return team


async def register_for_worldcup(
    db: AsyncSession,
    competition_id: int,
    user_id: int,
    country_code: str,
) -> CompetitionRegistration:
    """Register a miner for the World Cup with their country."""
    competition = await get_competition(db, competition_id)

    if competition.status != "registration":
        raise ValueError("Registration is not open")

    # Check for existing registration
    existing = await db.execute(
        select(CompetitionRegistration).where(
            CompetitionRegistration.competition_id == competition_id,
            CompetitionRegistration.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Already registered for this competition")

    team = await get_or_create_team(db, competition_id, country_code)

    registration = CompetitionRegistration(
        competition_id=competition_id,
        user_id=user_id,
        team_id=team.id,
        registered_at=datetime.now(timezone.utc),
    )
    db.add(registration)
    await db.commit()

    # Trigger world_cup_participant badge
    try:
        from tbg.gamification.trigger_engine import TriggerEngine
        engine = TriggerEngine(db, None)
        await engine.check_event_trigger(user_id, "world_cup_participate")
    except Exception:
        logger.warning("Badge trigger failed for world_cup_participate", exc_info=True)

    return registration


async def assign_groups(db: AsyncSession, competition: Competition) -> None:
    """Assign eligible teams to groups (4 teams per group)."""
    min_miners = competition.config.get("min_miners_per_country", 5)

    # Get teams with enough registrations
    result = await db.execute(
        select(CompetitionTeam, func.count(CompetitionRegistration.id).label("miner_count"))
        .join(CompetitionRegistration, CompetitionRegistration.team_id == CompetitionTeam.id)
        .where(CompetitionTeam.competition_id == competition.id)
        .group_by(CompetitionTeam.id)
        .having(func.count(CompetitionRegistration.id) >= min_miners)
        .order_by(func.count(CompetitionRegistration.id).desc())
    )
    eligible = [row[0] for row in result.all()]

    # Trim to multiple of 4
    num_teams = (len(eligible) // 4) * 4
    eligible = eligible[:num_teams]

    group_labels = [chr(65 + i) for i in range(num_teams // 4)]  # A, B, C, D, ...
    for i, team in enumerate(eligible):
        group_idx = i % len(group_labels)
        team.group_name = f"Group {group_labels[group_idx]}"

    await db.commit()


async def generate_group_matches(
    db: AsyncSession, competition: Competition,
) -> list[Match]:
    """Generate round-robin group stage matches."""
    await assign_groups(db, competition)

    result = await db.execute(
        select(CompetitionTeam)
        .where(
            CompetitionTeam.competition_id == competition.id,
            CompetitionTeam.group_name.isnot(None),
        )
        .order_by(CompetitionTeam.group_name)
    )
    teams = result.scalars().all()

    # Group teams by group
    groups: dict[str, list[CompetitionTeam]] = defaultdict(list)
    for team in teams:
        groups[team.group_name].append(team)

    matches = []
    base_date = datetime.combine(competition.start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    match_day = 0

    for group_name, group_teams in sorted(groups.items()):
        # Round-robin: each team plays every other team once
        for i, team_a in enumerate(group_teams):
            for team_b in group_teams[i + 1:]:
                match = Match(
                    competition_id=competition.id,
                    round="group",
                    team_a_id=team_a.id,
                    team_b_id=team_b.id,
                    status="scheduled",
                    match_date=base_date + timedelta(days=match_day),
                )
                db.add(match)
                matches.append(match)
                match_day += 1

    await db.commit()
    return matches


async def get_group_standings(
    db: AsyncSession, competition_id: int,
) -> dict[str, list[CompetitionTeam]]:
    """Get group standings sorted by points then hashrate."""
    result = await db.execute(
        select(CompetitionTeam)
        .where(
            CompetitionTeam.competition_id == competition_id,
            CompetitionTeam.group_name.isnot(None),
        )
        .order_by(CompetitionTeam.group_name)
    )
    teams = result.scalars().all()

    groups: dict[str, list[CompetitionTeam]] = defaultdict(list)
    for team in teams:
        groups[team.group_name].append(team)

    # Sort each group by points (desc) then hashrate (desc)
    for group_name in groups:
        groups[group_name].sort(key=lambda t: (t.points, t.hashrate), reverse=True)

    return dict(sorted(groups.items()))


async def generate_knockout_bracket(
    db: AsyncSession, competition: Competition,
) -> list[Match]:
    """Generate knockout bracket from group stage results."""
    groups = await get_group_standings(db, competition.id)

    # Top 2 from each group
    qualifiers = []
    for group_name in sorted(groups.keys()):
        standings = groups[group_name]
        qualifiers.extend(standings[:2])

    num_qualifiers = len(qualifiers)
    if num_qualifiers < 4:
        raise ValueError(f"Need at least 4 qualifiers, got {num_qualifiers}")

    matches = []
    base_date = datetime.combine(competition.end_date - timedelta(days=14), datetime.min.time()).replace(tzinfo=timezone.utc)

    if num_qualifiers >= 8:
        # Quarter-finals: 1A vs 2B, 1B vs 2A, 1C vs 2D, 1D vs 2C
        qf_matchups = [
            (qualifiers[0], qualifiers[3]),  # 1A vs 2B
            (qualifiers[2], qualifiers[1]),  # 1B vs 2A
            (qualifiers[4], qualifiers[7]),  # 1C vs 2D
            (qualifiers[6], qualifiers[5]),  # 1D vs 2C
        ]
        for i, (team_a, team_b) in enumerate(qf_matchups):
            match = Match(
                competition_id=competition.id,
                round="quarter",
                team_a_id=team_a.id,
                team_b_id=team_b.id,
                status="scheduled",
                match_date=base_date + timedelta(days=i),
            )
            db.add(match)
            matches.append(match)
    elif num_qualifiers == 4:
        # Semi-finals directly
        sf_matchups = [
            (qualifiers[0], qualifiers[3]),
            (qualifiers[2], qualifiers[1]),
        ]
        for i, (team_a, team_b) in enumerate(sf_matchups):
            match = Match(
                competition_id=competition.id,
                round="semi",
                team_a_id=team_a.id,
                team_b_id=team_b.id,
                status="scheduled",
                match_date=base_date + timedelta(days=7 + i),
            )
            db.add(match)
            matches.append(match)

    await db.commit()
    return matches


async def advance_knockout(
    db: AsyncSession, competition_id: int, completed_round: str,
) -> list[Match]:
    """Create next round matches from completed knockout matches."""
    round_order = ["quarter", "semi", "final"]
    current_idx = round_order.index(completed_round)
    if current_idx >= len(round_order) - 1:
        return []  # Final is last round

    next_round = round_order[current_idx + 1]

    # Get winners of completed round
    result = await db.execute(
        select(Match)
        .where(
            Match.competition_id == competition_id,
            Match.round == completed_round,
            Match.status == "completed",
        )
        .order_by(Match.id)
    )
    completed_matches = result.scalars().all()

    winners = []
    for match in completed_matches:
        if match.score_a > match.score_b:
            winners.append(match.team_a_id)
        elif match.score_b > match.score_a:
            winners.append(match.team_b_id)
        else:
            # Tiebreaker: higher hashrate advances
            winners.append(match.team_a_id if match.hashrate_a >= match.hashrate_b else match.team_b_id)

    if len(winners) < 2:
        return []

    comp = await get_competition(db, competition_id)
    base_date = datetime.combine(comp.end_date - timedelta(days=7), datetime.min.time()).replace(tzinfo=timezone.utc)
    if next_round == "final":
        base_date = datetime.combine(comp.end_date, datetime.min.time()).replace(tzinfo=timezone.utc)

    matches = []
    for i in range(0, len(winners), 2):
        if i + 1 >= len(winners):
            break
        match = Match(
            competition_id=competition_id,
            round=next_round,
            team_a_id=winners[i],
            team_b_id=winners[i + 1],
            status="scheduled",
            match_date=base_date + timedelta(days=i // 2),
        )
        db.add(match)
        matches.append(match)

    await db.commit()
    return matches


def calculate_goals(hashrate: float, blocks_found: int, baseline: float) -> int:
    """Calculate goals from mining performance (deterministic).

    goals = floor(hashrate / baseline) + (blocks_found * 3)
    """
    if baseline <= 0:
        return 0
    return int(math.floor(hashrate / baseline)) + (blocks_found * 3)
