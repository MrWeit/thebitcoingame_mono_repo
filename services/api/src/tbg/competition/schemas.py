"""Pydantic response models for competition endpoints.

Shapes match the frontend TypeScript interfaces in dashboard/src/mocks/competition.ts.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


# ── Leaderboard ──


class LeaderboardEntryResponse(BaseModel):
    rank: int
    user_id: str
    display_name: str
    country_code: str
    best_difficulty: float
    total_shares: int
    rank_change: int
    is_current_user: bool
    hashrate: float | None = None
    worker_count: int | None = None
    badges: list[str] | None = None
    join_date: datetime | None = None


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntryResponse]
    total: int
    page: int
    per_page: int


class CountryRankingResponse(BaseModel):
    rank: int
    country_code: str
    country_name: str
    miner_count: int
    total_hashrate: float


class CountryLeaderboardResponse(BaseModel):
    entries: list[CountryRankingResponse]
    total: int


class UserRankResponse(BaseModel):
    period: str
    rank: int
    score: float
    total: int
    percentile: float


class UserRankSummaryResponse(BaseModel):
    weekly: UserRankResponse
    monthly: UserRankResponse
    alltime: UserRankResponse


# ── Competition / World Cup ──


class MatchTeamResponse(BaseModel):
    country_code: str
    score: int
    hashrate: float
    miners: int


class TopMinerResponse(BaseModel):
    name: str
    hashrate: float


class MatchResponse(BaseModel):
    id: str
    round: str
    team_a: MatchTeamResponse
    team_b: MatchTeamResponse
    status: str
    match_date: datetime
    man_of_the_match: str | None = None
    man_of_the_match_diff: float | None = None
    ai_recap: str | None = None
    top_miners_a: list[TopMinerResponse] | None = None
    top_miners_b: list[TopMinerResponse] | None = None


class GroupTeamResponse(BaseModel):
    country_code: str
    country_name: str
    points: int
    played: int
    won: int
    drawn: int
    lost: int
    hashrate: float


class GroupResponse(BaseModel):
    name: str
    teams: list[GroupTeamResponse]


class CompetitionResponse(BaseModel):
    id: str
    name: str
    type: str
    status: str
    start_date: date
    end_date: date
    groups: list[GroupResponse]
    knockout_matches: list[MatchResponse]


class CompetitionListResponse(BaseModel):
    competitions: list[CompetitionResponse]


class RegistrationResponse(BaseModel):
    competition_id: str
    team_country_code: str
    team_country_name: str
    registered_at: datetime


class RegisterRequest(BaseModel):
    country_code: str


class MyTeamResponse(BaseModel):
    team_country_code: str
    team_country_name: str
    group_name: str | None
    points: int
    played: int
    won: int
    drawn: int
    lost: int
    hashrate: float
    miner_count: int
    rank_in_group: int | None = None


# ── League ──


class LeagueClubResponse(BaseModel):
    id: str
    name: str
    played: int
    won: int
    drawn: int
    lost: int
    points: int
    hashrate: float
    is_user_club: bool


class LeagueResponse(BaseModel):
    id: str
    name: str
    division: int
    clubs: list[LeagueClubResponse]


class LeagueListResponse(BaseModel):
    leagues: list[LeagueResponse]


class LeagueResultResponse(BaseModel):
    match_id: str
    club_a: str
    club_b: str
    score_a: int
    score_b: int
    match_date: datetime
