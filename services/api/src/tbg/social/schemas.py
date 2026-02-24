"""Pydantic schemas for social endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# --- Cooperative ---


class CreateCooperativeRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    motto: str | None = Field(None, max_length=256)


class UpdateCooperativeRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=64)
    motto: str | None = Field(None, max_length=256)


class JoinCooperativeRequest(BaseModel):
    invite_code: str = Field(..., min_length=8, max_length=8)


class RemoveMemberRequest(BaseModel):
    user_id: str


class CoopMemberResponse(BaseModel):
    user_id: str
    display_name: str
    hashrate: float
    shares_today: int
    is_online: bool
    role: str


class CooperativeResponse(BaseModel):
    id: str
    name: str
    motto: str | None = None
    member_count: int
    combined_hashrate: float
    weekly_streak: int
    best_combined_diff: float
    blocks_found: int
    total_shares_week: int
    weekly_rank: int
    members: list[CoopMemberResponse] = []
    invite_code: str | None = None  # Only shown to members


class CooperativeListResponse(BaseModel):
    cooperatives: list[CooperativeResponse]
    total: int
    page: int
    per_page: int


class CooperativeStatsResponse(BaseModel):
    combined_hashrate: float
    total_shares_week: int
    member_count: int
    online_count: int
    blocks_found: int
    weekly_streak: int
    best_combined_diff: float


# --- Notifications ---


class NotificationResponse(BaseModel):
    id: str
    type: str
    subtype: str
    title: str
    description: str | None = None
    timestamp: datetime
    read: bool
    action_url: str | None = None
    action_label: str | None = None


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    total: int
    page: int
    per_page: int


class UnreadCountResponse(BaseModel):
    unread_count: int


# --- Activity Feed ---


class ActivityResponse(BaseModel):
    id: str
    type: str
    title: str
    description: str | None = None
    timestamp: datetime
    metadata: dict = {}


class ActivityFeedResponse(BaseModel):
    activities: list[ActivityResponse]
    total: int
    page: int
    per_page: int


# --- Public Profile ---


class PublicProfileResponse(BaseModel):
    display_name: str
    btc_address: str
    level: int
    level_title: str
    badges_earned: int
    member_since: str
    country_code: str | None = None


class PublicStatsResponse(BaseModel):
    best_difficulty: float
    total_shares: int
    blocks_found: int
    current_streak: int
    badges: list[str] = []


# --- Invite Code ---


class InviteCodeResponse(BaseModel):
    invite_code: str
