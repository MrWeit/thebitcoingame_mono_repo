"""Pydantic response models for gamification endpoints."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


# --- Badge ---


class BadgeDefinitionResponse(BaseModel):
    slug: str
    name: str
    description: str
    category: str
    rarity: str
    xp_reward: int
    total_earned: int = 0
    percentage: float = 0.0


class BadgeDetailResponse(BaseModel):
    slug: str
    name: str
    description: str
    category: str
    rarity: str
    xp_reward: int
    total_earned: int = 0
    percentage: float = 0.0
    recent_earners: list[dict] = []


class EarnedBadgeResponse(BaseModel):
    slug: str
    earned_at: datetime
    metadata: dict = {}


class UserBadgesResponse(BaseModel):
    earned: list[EarnedBadgeResponse]
    total_available: int
    total_earned: int


class AllBadgesResponse(BaseModel):
    badges: list[BadgeDefinitionResponse]


# --- XP ---


class XPResponse(BaseModel):
    total_xp: int
    level: int
    level_title: str
    xp_into_level: int
    xp_for_level: int
    next_level: int
    next_title: str


class XPHistoryEntry(BaseModel):
    amount: int
    source: str
    source_id: str | None = None
    description: str | None = None
    created_at: datetime | None = None


class XPHistoryResponse(BaseModel):
    entries: list[XPHistoryEntry]
    total: int
    page: int
    per_page: int


# --- Streak ---


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    streak_start_date: date | None = None
    last_active_week: str | None = None
    is_active_this_week: bool = False
    effective_streak: int = 0  # Accounts for gap between weekly evaluations


class StreakWeekEntry(BaseModel):
    week_iso: str
    week_start: date
    share_count: int
    best_diff: float
    is_active: bool


class StreakCalendarResponse(BaseModel):
    weeks: list[StreakWeekEntry]


# --- Gamification Summary ---


class GamificationSummaryResponse(BaseModel):
    xp: XPResponse
    streak: StreakResponse
    badges: dict  # {earned: int, total: int}
    stats: dict  # {total_shares: int, best_difficulty: float, blocks_found: int}


# --- Levels ---


class LevelEntry(BaseModel):
    level: int
    title: str
    xp_required: int
    cumulative: int


class AllLevelsResponse(BaseModel):
    levels: list[LevelEntry]


# --- Level Celebrations ---


class PendingLevelCelebrationItem(BaseModel):
    celebration_id: int
    old_level: int
    new_level: int
    new_title: str
    created_at: datetime


class PendingLevelCelebrationsResponse(BaseModel):
    celebrations: list[PendingLevelCelebrationItem]


# --- Streak Celebrations ---


class PendingStreakCelebrationItem(BaseModel):
    celebration_id: int
    streak_weeks: int
    milestone: str
    created_at: datetime


class PendingStreakCelebrationsResponse(BaseModel):
    celebrations: list[PendingStreakCelebrationItem]
