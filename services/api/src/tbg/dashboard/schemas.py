"""Dashboard Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DashboardStatsResponse(BaseModel):
    """Aggregated dashboard statistics — matches frontend mockDashboardStats shape."""

    hashrate: float
    hashrate_change: float
    shares_today: int
    shares_change: float
    workers_online: int
    workers_total: int
    streak: int
    best_diff_week: float
    network_diff: float
    best_diff_ratio: float
    level: int
    level_title: str
    xp: int
    xp_to_next: int
    badges_earned: int
    network_height: int


class FeedItemResponse(BaseModel):
    """Single activity feed item."""

    id: int
    type: str
    text: str
    description: str | None = None
    time: str
    metadata: dict[str, Any] = {}


class EventActionResponse(BaseModel):
    """Action button for an upcoming event."""

    label: str
    href: str


class UpcomingEventResponse(BaseModel):
    """Single upcoming event."""

    id: str
    type: str
    title: str
    description: str | None = None
    ends_at: str
    action: EventActionResponse | None = None


class BadgeResponse(BaseModel):
    """Recently earned badge."""

    slug: str
    name: str
    description: str
    rarity: str
    earned_at: str | None = None
