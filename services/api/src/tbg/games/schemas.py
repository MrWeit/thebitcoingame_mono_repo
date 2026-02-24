"""Pydantic schemas for games and lottery API responses."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel


# --- Game data response (matches frontend WeeklyGameData) ---


class BlockFoundDataResponse(BaseModel):
    height: int
    reward: float
    hash: str


class WeeklyGameDataResponse(BaseModel):
    week_start: datetime
    week_end: datetime
    best_difficulty: float
    best_difficulty_time: datetime | None
    best_hash: str
    network_difficulty: float
    progress_ratio: float
    daily_best_diffs: dict[str, float]  # {"mon": N, "tue": N, ..., "sun": N}
    total_shares: int
    weekly_rank: int
    percentile: float
    block_found: bool
    block_data: BlockFoundDataResponse | None = None
    user_name: str


class PastWeekResultResponse(BaseModel):
    week_start: datetime
    week_end: datetime
    best_difficulty: float
    weekly_rank: int
    game_played: str


class GameHistoryResponse(BaseModel):
    weeks: list[PastWeekResultResponse]
    total: int
    page: int
    per_page: int


# --- Game session ---


class GamePlayRequest(BaseModel):
    game_type: str  # hammer, horse_race, slot_machine, scratch_card
    metadata: dict[str, Any] | None = None


class GamePlayResponse(BaseModel):
    session_id: int


# --- Lottery ---


class LotteryCurrentResponse(BaseModel):
    week_iso: str
    status: str
    total_participants: int
    your_rank: int
    your_diff: float
    your_percentile: float


class LotteryResultEntry(BaseModel):
    user_id: int
    user_name: str
    rank: int
    best_difficulty: float
    total_shares: int
    xp_awarded: int
    percentile: float


class LotteryDrawResponse(BaseModel):
    id: int
    week_iso: str
    week_start: date
    week_end: date
    total_participants: int
    total_shares: int
    winning_difficulty: float | None
    winner_user_id: int | None
    status: str
    drawn_at: datetime | None


class LotteryResultsResponse(BaseModel):
    draw: LotteryDrawResponse
    top_10: list[LotteryResultEntry]
    your_result: LotteryResultEntry | None = None


class LotteryWeekResultsResponse(BaseModel):
    draw: LotteryDrawResponse
    results: list[LotteryResultEntry]
    total: int
    page: int
    per_page: int


class LotteryStatsResponse(BaseModel):
    total_draws: int
    total_participants_all_time: int
    average_participants_per_draw: float
    average_best_diff: float
    highest_winning_diff: float | None
    most_recent_draw: str | None  # week_iso
