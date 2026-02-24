"""Competition API endpoints — 15 routes.

Leaderboard (5), World Cup (7), League (3).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.database import get_session
from tbg.db.models import (
    Competition,
    CompetitionRegistration,
    CompetitionTeam,
    League,
    LeagueClub,
    Match,
    User,
)
from tbg.competition.leaderboard_service import (
    get_country_leaderboard,
    get_leaderboard,
    get_user_rank,
)
from tbg.competition.match_service import get_top_miners_for_team
from tbg.competition.schemas import (
    CompetitionListResponse,
    CompetitionResponse,
    CountryLeaderboardResponse,
    CountryRankingResponse,
    GroupResponse,
    GroupTeamResponse,
    LeaderboardEntryResponse,
    LeaderboardResponse,
    LeagueClubResponse,
    LeagueListResponse,
    LeagueResponse,
    LeagueResultResponse,
    MatchResponse,
    MatchTeamResponse,
    MyTeamResponse,
    RegisterRequest,
    RegistrationResponse,
    TopMinerResponse,
    UserRankResponse,
    UserRankSummaryResponse,
)
from tbg.competition.worldcup_engine import get_group_standings
from tbg.redis_client import get_redis

router = APIRouter(prefix="/api/v1", tags=["Competition"])


# ── Helper ──


def _get_redis():
    return get_redis()


# ── Leaderboard Endpoints (5) ──


@router.get("/leaderboard/weekly", response_model=LeaderboardResponse)
async def get_weekly_leaderboard(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    week: str | None = Query(None, description="ISO week e.g. 2026-W09"),
    db: AsyncSession = Depends(get_session),
):
    """Weekly leaderboard — ranked by best difficulty this week."""
    redis = _get_redis()
    data = await get_leaderboard(redis, db, "weekly", page, per_page, week_iso=week)
    return LeaderboardResponse(
        entries=[LeaderboardEntryResponse(**e) for e in data["entries"]],
        total=data["total"],
        page=data["page"],
        per_page=data["per_page"],
    )


@router.get("/leaderboard/monthly", response_model=LeaderboardResponse)
async def get_monthly_leaderboard(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """Monthly leaderboard — ranked by best difficulty this month."""
    redis = _get_redis()
    data = await get_leaderboard(redis, db, "monthly", page, per_page)
    return LeaderboardResponse(
        entries=[LeaderboardEntryResponse(**e) for e in data["entries"]],
        total=data["total"],
        page=data["page"],
        per_page=data["per_page"],
    )


@router.get("/leaderboard/alltime", response_model=LeaderboardResponse)
async def get_alltime_leaderboard(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """All-time leaderboard — ranked by best difficulty ever."""
    redis = _get_redis()
    data = await get_leaderboard(redis, db, "alltime", page, per_page)
    return LeaderboardResponse(
        entries=[LeaderboardEntryResponse(**e) for e in data["entries"]],
        total=data["total"],
        page=data["page"],
        per_page=data["per_page"],
    )


@router.get("/leaderboard/country", response_model=CountryLeaderboardResponse)
async def get_country_rankings(
    week: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
):
    """Country rankings — ranked by combined hashrate."""
    redis = _get_redis()
    data = await get_country_leaderboard(redis, db, week_iso=week)
    return CountryLeaderboardResponse(
        entries=[CountryRankingResponse(**e) for e in data["entries"]],
        total=data["total"],
    )


@router.get("/leaderboard/me", response_model=UserRankSummaryResponse)
async def get_my_rank(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Current user's rank across all leaderboard periods."""
    redis = _get_redis()
    weekly = await get_user_rank(redis, "weekly", user.id)
    monthly = await get_user_rank(redis, "monthly", user.id)
    alltime = await get_user_rank(redis, "alltime", user.id)
    return UserRankSummaryResponse(
        weekly=UserRankResponse(**weekly),
        monthly=UserRankResponse(**monthly),
        alltime=UserRankResponse(**alltime),
    )


# ── Competition / World Cup Endpoints (7) ──


async def _build_competition_response(
    db: AsyncSession, comp: Competition,
) -> CompetitionResponse:
    """Build a full CompetitionResponse from a Competition model."""
    # Load groups
    groups_data = await get_group_standings(db, comp.id)
    groups = []
    for group_name, teams in groups_data.items():
        groups.append(GroupResponse(
            name=group_name,
            teams=[
                GroupTeamResponse(
                    country_code=t.country_code,
                    country_name=t.country_name,
                    points=t.points,
                    played=t.played,
                    won=t.won,
                    drawn=t.drawn,
                    lost=t.lost,
                    hashrate=t.hashrate,
                )
                for t in teams
            ],
        ))

    # Load knockout matches
    ko_result = await db.execute(
        select(Match)
        .where(
            Match.competition_id == comp.id,
            Match.round.in_(["quarter", "semi", "final"]),
        )
        .order_by(Match.match_date)
    )
    ko_matches = ko_result.scalars().all()

    knockout_responses = []
    for m in ko_matches:
        team_a = await db.get(CompetitionTeam, m.team_a_id)
        team_b = await db.get(CompetitionTeam, m.team_b_id)
        mom_name = None
        if m.man_of_match:
            mom_name = m.man_of_match.display_name or f"Miner-{m.man_of_match_user_id}"
        elif m.man_of_match_user_id:
            mom_user = await db.execute(select(User).where(User.id == m.man_of_match_user_id))
            mu = mom_user.scalar_one_or_none()
            mom_name = (mu.display_name or f"Miner-{m.man_of_match_user_id}") if mu else None

        knockout_responses.append(MatchResponse(
            id=str(m.id),
            round=m.round,
            team_a=MatchTeamResponse(
                country_code=team_a.country_code if team_a else "",
                score=m.score_a,
                hashrate=m.hashrate_a,
                miners=m.miners_a,
            ),
            team_b=MatchTeamResponse(
                country_code=team_b.country_code if team_b else "",
                score=m.score_b,
                hashrate=m.hashrate_b,
                miners=m.miners_b,
            ),
            status=m.status,
            match_date=m.match_date,
            man_of_the_match=mom_name,
            man_of_the_match_diff=m.man_of_match_diff,
            ai_recap=m.ai_recap,
        ))

    return CompetitionResponse(
        id=str(comp.id),
        name=comp.name,
        type=comp.type,
        status=comp.status,
        start_date=comp.start_date,
        end_date=comp.end_date,
        groups=groups,
        knockout_matches=knockout_responses,
    )


@router.get("/competitions", response_model=CompetitionListResponse)
async def list_competitions(
    db: AsyncSession = Depends(get_session),
):
    """List all competitions."""
    result = await db.execute(
        select(Competition).order_by(Competition.start_date.desc())
    )
    comps = result.scalars().all()
    competitions = [await _build_competition_response(db, c) for c in comps]
    return CompetitionListResponse(competitions=competitions)


@router.get("/competitions/{competition_id}", response_model=CompetitionResponse)
async def get_competition_detail(
    competition_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get competition detail with groups and knockout bracket."""
    result = await db.execute(
        select(Competition).where(Competition.id == competition_id)
    )
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    return await _build_competition_response(db, comp)


@router.get("/competitions/{competition_id}/groups")
async def get_competition_groups(
    competition_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get group standings for a competition."""
    result = await db.execute(
        select(Competition).where(Competition.id == competition_id)
    )
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")

    groups_data = await get_group_standings(db, comp.id)
    groups = []
    for group_name, teams in groups_data.items():
        groups.append({
            "name": group_name,
            "teams": [
                {
                    "country_code": t.country_code,
                    "country_name": t.country_name,
                    "points": t.points,
                    "played": t.played,
                    "won": t.won,
                    "drawn": t.drawn,
                    "lost": t.lost,
                    "hashrate": t.hashrate,
                }
                for t in teams
            ],
        })
    return {"groups": groups}


@router.get("/competitions/{competition_id}/matches")
async def list_competition_matches(
    competition_id: int,
    round: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """List matches for a competition."""
    q = select(Match).where(Match.competition_id == competition_id)
    if round:
        q = q.where(Match.round == round)
    if status:
        q = q.where(Match.status == status)
    q = q.order_by(Match.match_date).offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(q)
    matches = result.scalars().all()

    # Count total
    count_q = select(func.count(Match.id)).where(Match.competition_id == competition_id)
    if round:
        count_q = count_q.where(Match.round == round)
    if status:
        count_q = count_q.where(Match.status == status)
    total = (await db.execute(count_q)).scalar_one()

    match_responses = []
    for m in matches:
        team_a = await db.get(CompetitionTeam, m.team_a_id)
        team_b = await db.get(CompetitionTeam, m.team_b_id)

        mom_name = None
        if m.man_of_match_user_id:
            mom_result = await db.execute(select(User).where(User.id == m.man_of_match_user_id))
            mom_user = mom_result.scalar_one_or_none()
            mom_name = (mom_user.display_name or f"Miner-{m.man_of_match_user_id}") if mom_user else None

        match_responses.append(MatchResponse(
            id=str(m.id),
            round=m.round,
            team_a=MatchTeamResponse(
                country_code=team_a.country_code if team_a else "",
                score=m.score_a,
                hashrate=m.hashrate_a,
                miners=m.miners_a,
            ),
            team_b=MatchTeamResponse(
                country_code=team_b.country_code if team_b else "",
                score=m.score_b,
                hashrate=m.hashrate_b,
                miners=m.miners_b,
            ),
            status=m.status,
            match_date=m.match_date,
            man_of_the_match=mom_name,
            man_of_the_match_diff=m.man_of_match_diff,
            ai_recap=m.ai_recap,
        ))

    return {"matches": match_responses, "total": total, "page": page, "per_page": per_page}


@router.get("/competitions/{competition_id}/matches/{match_id}", response_model=MatchResponse)
async def get_match_detail(
    competition_id: int,
    match_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get match detail with recap and top miners."""
    result = await db.execute(
        select(Match).where(Match.id == match_id, Match.competition_id == competition_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")

    team_a = await db.get(CompetitionTeam, m.team_a_id)
    team_b = await db.get(CompetitionTeam, m.team_b_id)

    mom_name = None
    if m.man_of_match_user_id:
        mom_result = await db.execute(select(User).where(User.id == m.man_of_match_user_id))
        mom_user = mom_result.scalar_one_or_none()
        mom_name = (mom_user.display_name or f"Miner-{m.man_of_match_user_id}") if mom_user else None

    # Get top miners for each team
    top_a = await get_top_miners_for_team(db, m.team_a_id)
    top_b = await get_top_miners_for_team(db, m.team_b_id)

    return MatchResponse(
        id=str(m.id),
        round=m.round,
        team_a=MatchTeamResponse(
            country_code=team_a.country_code if team_a else "",
            score=m.score_a,
            hashrate=m.hashrate_a,
            miners=m.miners_a,
        ),
        team_b=MatchTeamResponse(
            country_code=team_b.country_code if team_b else "",
            score=m.score_b,
            hashrate=m.hashrate_b,
            miners=m.miners_b,
        ),
        status=m.status,
        match_date=m.match_date,
        man_of_the_match=mom_name,
        man_of_the_match_diff=m.man_of_match_diff,
        ai_recap=m.ai_recap,
        top_miners_a=[TopMinerResponse(**tm) for tm in top_a] if top_a else None,
        top_miners_b=[TopMinerResponse(**tm) for tm in top_b] if top_b else None,
    )


@router.post("/competitions/{competition_id}/register", response_model=RegistrationResponse)
async def register_for_competition(
    competition_id: int,
    body: RegisterRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Register for a World Cup with a country."""
    from tbg.competition.worldcup_engine import register_for_worldcup

    try:
        reg = await register_for_worldcup(db, competition_id, user.id, body.country_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    team = await db.get(CompetitionTeam, reg.team_id)
    return RegistrationResponse(
        competition_id=str(competition_id),
        team_country_code=team.country_code if team else body.country_code,
        team_country_name=team.country_name if team else body.country_code,
        registered_at=reg.registered_at,
    )


@router.get("/competitions/{competition_id}/my-team", response_model=MyTeamResponse)
async def get_my_team(
    competition_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get user's team in a competition."""
    reg_result = await db.execute(
        select(CompetitionRegistration).where(
            CompetitionRegistration.competition_id == competition_id,
            CompetitionRegistration.user_id == user.id,
        )
    )
    reg = reg_result.scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=404, detail="Not registered for this competition")

    team = await db.get(CompetitionTeam, reg.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Count team members
    member_count_result = await db.execute(
        select(func.count(CompetitionRegistration.id))
        .where(CompetitionRegistration.team_id == team.id)
    )
    miner_count = member_count_result.scalar_one()

    # Calculate rank in group if in group stage
    rank_in_group = None
    if team.group_name:
        groups = await get_group_standings(db, competition_id)
        group_teams = groups.get(team.group_name, [])
        for idx, t in enumerate(group_teams):
            if t.id == team.id:
                rank_in_group = idx + 1
                break

    return MyTeamResponse(
        team_country_code=team.country_code,
        team_country_name=team.country_name,
        group_name=team.group_name,
        points=team.points,
        played=team.played,
        won=team.won,
        drawn=team.drawn,
        lost=team.lost,
        hashrate=team.hashrate,
        miner_count=miner_count,
        rank_in_group=rank_in_group,
    )


# ── League Endpoints (3) ──


@router.get("/leagues", response_model=LeagueListResponse)
async def list_leagues(
    db: AsyncSession = Depends(get_session),
):
    """List active leagues with standings."""
    result = await db.execute(
        select(League)
        .where(League.status == "active")
        .order_by(League.division, League.name)
    )
    leagues = result.scalars().all()

    league_responses = []
    for league in leagues:
        clubs_result = await db.execute(
            select(LeagueClub)
            .where(LeagueClub.league_id == league.id)
            .order_by(LeagueClub.points.desc(), LeagueClub.hashrate.desc())
        )
        clubs = list(clubs_result.scalars().all())

        total = len(clubs)
        club_responses = []
        for i, club in enumerate(clubs):
            club_responses.append(LeagueClubResponse(
                id=str(club.id),
                name=club.name,
                played=club.played,
                won=club.won,
                drawn=club.drawn,
                lost=club.lost,
                points=club.points,
                hashrate=club.hashrate,
                is_user_club=False,
            ))

        league_responses.append(LeagueResponse(
            id=str(league.id),
            name=league.name,
            division=league.division,
            clubs=club_responses,
        ))

    return LeagueListResponse(leagues=league_responses)


@router.get("/leagues/{league_id}", response_model=LeagueResponse)
async def get_league_detail(
    league_id: int,
    db: AsyncSession = Depends(get_session),
):
    """Get league detail with standings."""
    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    clubs_result = await db.execute(
        select(LeagueClub)
        .where(LeagueClub.league_id == league.id)
        .order_by(LeagueClub.points.desc(), LeagueClub.hashrate.desc())
    )
    clubs = list(clubs_result.scalars().all())

    return LeagueResponse(
        id=str(league.id),
        name=league.name,
        division=league.division,
        clubs=[
            LeagueClubResponse(
                id=str(c.id),
                name=c.name,
                played=c.played,
                won=c.won,
                drawn=c.drawn,
                lost=c.lost,
                points=c.points,
                hashrate=c.hashrate,
                is_user_club=False,
            )
            for c in clubs
        ],
    )


@router.get("/leagues/{league_id}/results")
async def get_league_results(
    league_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """Get recent match results for a league."""
    result = await db.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise HTTPException(status_code=404, detail="League not found")

    # League matches are cooperative-based (Phase 7 — cooperatives)
    return {"results": [], "total": 0, "page": page, "per_page": per_page}
