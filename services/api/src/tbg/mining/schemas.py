"""Pydantic schemas for mining data API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Workers
# ---------------------------------------------------------------------------


class WorkerItem(BaseModel):
    """Single worker status from Redis."""

    name: str
    status: str = "offline"
    hashrate_1m: float = 0.0
    hashrate_5m: float = 0.0
    hashrate_1h: float = 0.0
    hashrate_24h: float = 0.0
    current_diff: float = 0.0
    best_diff: float = 0.0
    valid_shares: int = 0
    invalid_shares: int = 0
    accept_rate: float = 100.0
    last_share: str | None = None
    connected_at: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    shares_session: int = 0


class WorkerListResponse(BaseModel):
    """Response for GET /mining/workers."""

    workers: list[WorkerItem]
    online_count: int
    total_count: int


class WorkerDetailResponse(BaseModel):
    """Response for GET /mining/workers/{name}."""

    worker: WorkerItem
    recent_shares: list[ShareItem] = []


# ---------------------------------------------------------------------------
# Shares
# ---------------------------------------------------------------------------


class ShareItem(BaseModel):
    """Single share record."""

    time: datetime
    worker_name: str
    difficulty: float
    share_diff: float
    is_valid: bool
    is_block: bool = False


class PaginationInfo(BaseModel):
    """Cursor-based pagination metadata."""

    limit: int
    has_more: bool
    next_cursor: str | None = None


class SharePage(BaseModel):
    """Paginated share response."""

    data: list[ShareItem]
    pagination: PaginationInfo


class ShareStats(BaseModel):
    """Aggregate share statistics."""

    total_shares: int = 0
    accepted_shares: int = 0
    rejected_shares: int = 0
    acceptance_rate: float = 0.0
    shares_today: int = 0
    accepted_today: int = 0
    best_diff_today: float = 0.0


# ---------------------------------------------------------------------------
# Hashrate
# ---------------------------------------------------------------------------


class HashrateResponse(BaseModel):
    """Current hashrate summary."""

    hashrate_1m: float = 0.0
    hashrate_5m: float = 0.0
    hashrate_1h: float = 0.0
    hashrate_24h: float = 0.0
    workers_online: int = 0


class HashratePoint(BaseModel):
    """Single point in hashrate time series."""

    time: datetime
    hashrate: float


class HashrateChartResponse(BaseModel):
    """Hashrate time series response."""

    window: str
    points: list[HashratePoint]
    current: float = 0.0
    average: float = 0.0
    peak: float = 0.0


# ---------------------------------------------------------------------------
# Difficulty
# ---------------------------------------------------------------------------


class DifficultyBest(BaseModel):
    """Personal best for a timeframe."""

    timeframe: str
    period_key: str | None = None
    best_difficulty: float
    share_time: datetime
    worker_name: str | None = None
    percentile: float | None = None


class DifficultyScatterPoint(BaseModel):
    """Single point in difficulty scatter plot."""

    time: datetime
    difficulty: float


class DifficultyScatterResponse(BaseModel):
    """Difficulty scatter plot response."""

    points: list[DifficultyScatterPoint]
    count: int


class DifficultyBucket(BaseModel):
    """Single bucket in difficulty histogram."""

    range_min: float
    range_max: float
    label: str
    count: int


class DifficultyDistributionResponse(BaseModel):
    """Difficulty histogram response."""

    buckets: list[DifficultyBucket]
    total_shares: int


class PercentileResponse(BaseModel):
    """User's percentile rank."""

    timeframe: str
    percentile: float
    best_difficulty: float
    rank: int
    total_miners: int


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------


class BlockItem(BaseModel):
    """Block found by pool."""

    block_height: int
    block_hash: str
    difficulty: float | None = None
    reward_btc: float | None = None
    fees_btc: float | None = None
    found_at: datetime
    confirmed: bool = False
    confirmations: int = 0
    worker_name: str | None = None


class BlockDetailResponse(BaseModel):
    """Single block detail."""

    block: BlockItem
    finder_address: str | None = None
    coinbase_sig: str | None = None


# ---------------------------------------------------------------------------
# Mining Summary
# ---------------------------------------------------------------------------


class MiningSummaryResponse(BaseModel):
    """Dashboard mining summary."""

    hashrate_1m: float = 0.0
    hashrate_5m: float = 0.0
    hashrate_1h: float = 0.0
    hashrate_24h: float = 0.0
    workers_online: int = 0
    workers_total: int = 0
    shares_today: int = 0
    accepted_today: int = 0
    acceptance_rate: float = 0.0
    best_diff_today: float = 0.0
    best_diff_alltime: float = 0.0
    blocks_found: int = 0
    last_share: str | None = None


# ---------------------------------------------------------------------------
# Uptime
# ---------------------------------------------------------------------------


class UptimeDay(BaseModel):
    """Single day in uptime calendar."""

    date: str
    uptime_minutes: int = 0
    shares: int = 0
    active: bool = False


class UptimeCalendarResponse(BaseModel):
    """30-day uptime calendar."""

    days: list[UptimeDay]
    total_uptime_hours: float = 0.0
    days_active: int = 0


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------


class NetworkDifficultyItem(BaseModel):
    """Network difficulty data point."""

    block_height: int
    difficulty: float
    timestamp: datetime


class NetworkDifficultyResponse(BaseModel):
    """Network difficulty response."""

    current_difficulty: float = 0.0
    current_height: int = 0
    history: list[NetworkDifficultyItem] = []


class NetworkBlockItem(BaseModel):
    """Recent network block."""

    height: int
    hash: str
    difficulty: float
    timestamp: datetime


class NetworkBlocksResponse(BaseModel):
    """Recent network blocks response."""

    blocks: list[NetworkBlockItem]


# ---------------------------------------------------------------------------
# Block Celebrations
# ---------------------------------------------------------------------------


class CelebrationItem(BaseModel):
    """Pending block celebration for delivery to the frontend."""

    celebration_id: int
    block_id: int
    block_height: int
    block_hash: str
    reward_btc: float = 0.0
    found_at: datetime


class PendingCelebrationsResponse(BaseModel):
    """Response for GET /mining/celebrations/pending."""

    celebrations: list[CelebrationItem]


# ---------------------------------------------------------------------------
# Forward refs
# ---------------------------------------------------------------------------

WorkerDetailResponse.model_rebuild()
