"""ORM models matching the existing init.sql schema.

These models map to tables already created by init.sql.
They use extend_existing=True since the tables exist before Alembic runs.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tbg.db.base import Base


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


class User(Base):
    """Maps to the 'users' table."""

    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    btc_address: Mapped[str] = mapped_column(String(62), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Phase 1 additions ---
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, unique=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    auth_method: Mapped[str] = mapped_column(String(16), nullable=False, server_default="wallet")
    display_name_normalized: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(String(280), nullable=True)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    login_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- Relationships ---
    workers: Mapped[list[Worker]] = relationship("Worker", back_populates="user")
    blocks: Mapped[list[Block]] = relationship("Block", back_populates="user", foreign_keys="Block.user_id")
    refresh_tokens: Mapped[list[RefreshToken]] = relationship("RefreshToken", back_populates="user")
    api_keys: Mapped[list[ApiKey]] = relationship("ApiKey", back_populates="user")
    settings: Mapped[UserSettings | None] = relationship("UserSettings", back_populates="user", uselist=False)


# ---------------------------------------------------------------------------
# Auth: Refresh Tokens
# ---------------------------------------------------------------------------


class RefreshToken(Base):
    """JWT refresh token tracking for revocation and rotation."""

    __tablename__ = "refresh_tokens"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    replaced_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="refresh_tokens")


# ---------------------------------------------------------------------------
# Auth: API Keys
# ---------------------------------------------------------------------------


class ApiKey(Base):
    """API key for programmatic access."""

    __tablename__ = "api_keys"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    permissions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=["read"], server_default='["read"]')
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="api_keys")


# ---------------------------------------------------------------------------
# User Settings
# ---------------------------------------------------------------------------


class UserSettings(Base):
    """Per-user settings stored as JSONB."""

    __tablename__ = "user_settings"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    notifications: Mapped[dict[str, Any]] = mapped_column(JSONB, default={}, server_default="{}")
    privacy: Mapped[dict[str, Any]] = mapped_column(JSONB, default={}, server_default="{}")
    mining: Mapped[dict[str, Any]] = mapped_column(JSONB, default={}, server_default="{}")
    sound: Mapped[dict[str, Any]] = mapped_column(JSONB, default={}, server_default="{}")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="settings")


# ---------------------------------------------------------------------------
# Email Verification Tokens
# ---------------------------------------------------------------------------


class EmailVerificationToken(Base):
    """Token for email address verification."""

    __tablename__ = "email_verification_tokens"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User")


# ---------------------------------------------------------------------------
# Password Reset Tokens
# ---------------------------------------------------------------------------


class PasswordResetToken(Base):
    """Token for password reset flow."""

    __tablename__ = "password_reset_tokens"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)

    user: Mapped[User] = relationship("User")


# ---------------------------------------------------------------------------
# Mining (existing, unchanged)
# ---------------------------------------------------------------------------


class Worker(Base):
    """Maps to the 'workers' table."""

    __tablename__ = "workers"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    worker_name: Mapped[str] = mapped_column(String(128), nullable=False)
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_share: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_diff: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_1m: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_5m: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_1h: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_24h: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(16), default="hosted")

    user: Mapped[User | None] = relationship("User", back_populates="workers")
    blocks: Mapped[list[Block]] = relationship("Block", back_populates="worker")


class Share(Base):
    """Maps to the 'shares' hypertable."""

    __tablename__ = "shares"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    btc_address: Mapped[str] = mapped_column(String(62), nullable=False, primary_key=True)
    worker_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    difficulty: Mapped[float] = mapped_column(Float, nullable=False)
    share_diff: Mapped[float] = mapped_column(Float, nullable=False)
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_block: Mapped[bool | None] = mapped_column(Boolean, default=False)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    nonce: Mapped[str | None] = mapped_column(String(16), nullable=True)
    nonce2: Mapped[str | None] = mapped_column(String(32), nullable=True)
    block_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="hosted")


class Block(Base):
    """Maps to the 'blocks' table."""

    __tablename__ = "blocks"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    block_height: Mapped[int] = mapped_column(Integer, nullable=False)
    block_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    worker_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("workers.id"), nullable=True)
    btc_address: Mapped[str | None] = mapped_column(String(62), nullable=True)
    reward_btc: Mapped[Decimal | None] = mapped_column(Numeric(16, 8), nullable=True)
    fees_btc: Mapped[Decimal | None] = mapped_column(Numeric(16, 8), nullable=True)
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    confirmations: Mapped[int] = mapped_column(Integer, default=0)
    found_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    coinbase_sig: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="hosted")

    user: Mapped[User | None] = relationship("User", back_populates="blocks", foreign_keys=[user_id])
    worker: Mapped[Worker | None] = relationship("Worker", back_populates="blocks")
    celebrations: Mapped[list[BlockCelebration]] = relationship("BlockCelebration", back_populates="block")


class BlockCelebration(Base):
    """Tracks whether a user has seen the celebration for a found block."""

    __tablename__ = "block_celebrations"
    __table_args__ = (
        UniqueConstraint("block_id", "user_id", name="uq_block_celebrations_block_user"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    block_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    celebrated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    celebrated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    block: Mapped[Block] = relationship("Block", back_populates="celebrations")
    user: Mapped[User] = relationship("User")


class LevelCelebration(Base):
    """Tracks whether a user has seen the celebration for a level-up."""

    __tablename__ = "level_celebrations"
    __table_args__ = (
        UniqueConstraint("user_id", "new_level", name="uq_level_celebrations_user_level"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    old_level: Mapped[int] = mapped_column(Integer, nullable=False)
    new_level: Mapped[int] = mapped_column(Integer, nullable=False)
    new_title: Mapped[str] = mapped_column(String(100), nullable=False)
    celebrated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    celebrated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User")


class StreakCelebration(Base):
    """Tracks whether a user has seen the celebration for a streak milestone."""

    __tablename__ = "streak_celebrations"
    __table_args__ = (
        UniqueConstraint("user_id", "streak_weeks", name="uq_streak_celebrations_user_weeks"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    streak_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    milestone: Mapped[str] = mapped_column(String(100), nullable=False)
    celebrated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    celebrated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User")


class WeeklyBestDiff(Base):
    """Maps to the 'weekly_best_diff' table."""

    __tablename__ = "weekly_best_diff"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    btc_address: Mapped[str] = mapped_column(String(62), nullable=False)
    week_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    best_difficulty: Mapped[float] = mapped_column(Float, nullable=False)
    best_share_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_shares: Mapped[int] = mapped_column(BigInteger, default=0)


class MiningEvent(Base):
    """Maps to the 'mining_events' hypertable."""

    __tablename__ = "mining_events"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False, primary_key=True)
    source: Mapped[str] = mapped_column(String(16), default="hosted")
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)


class RateLimitEvent(Base):
    """Maps to the 'rate_limit_events' hypertable."""

    __tablename__ = "rate_limit_events"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    ip_address: Mapped[str] = mapped_column(INET, nullable=False, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    details: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    region: Mapped[str] = mapped_column(String(8), default="eu")


class SchemaMigration(Base):
    """Maps to the 'schema_migrations' table."""

    __tablename__ = "schema_migrations"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ---------------------------------------------------------------------------
# Phase 2: Mining Data
# ---------------------------------------------------------------------------


class PersonalBest(Base):
    """Personal best difficulty per user per timeframe."""

    __tablename__ = "personal_bests"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(16), nullable=False)
    period_key: Mapped[str | None] = mapped_column(String(16), nullable=True)
    best_difficulty: Mapped[float] = mapped_column(Float, nullable=False)
    share_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    worker_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    percentile: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User")


class UserDailyStats(Base):
    """Daily aggregated mining stats per user."""

    __tablename__ = "user_daily_stats"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    total_shares: Mapped[int] = mapped_column(BigInteger, default=0)
    accepted_shares: Mapped[int] = mapped_column(BigInteger, default=0)
    rejected_shares: Mapped[int] = mapped_column(BigInteger, default=0)
    best_diff: Mapped[float] = mapped_column(Float, default=0)
    avg_diff: Mapped[float] = mapped_column(Float, default=0)
    uptime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    workers_seen: Mapped[int] = mapped_column(Integer, default=0)


class HashrateSnapshot(Base):
    """5-minute hashrate snapshots (hypertable)."""

    __tablename__ = "hashrate_snapshots"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    worker_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    hashrate_1m: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_5m: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_1h: Mapped[float | None] = mapped_column(Float, nullable=True)
    hashrate_24h: Mapped[float | None] = mapped_column(Float, nullable=True)
    workers_online: Mapped[int] = mapped_column(Integer, default=0)


class NetworkDifficulty(Base):
    """Network difficulty history (hypertable)."""

    __tablename__ = "network_difficulty"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, nullable=False)
    block_height: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[float] = mapped_column(Float, nullable=False)
    block_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ---------------------------------------------------------------------------
# Phase 3: Dashboard
# ---------------------------------------------------------------------------


class ActivityFeed(Base):
    """Global activity feed for dashboard events."""

    __tablename__ = "activity_feed"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_data: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    is_global: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UpcomingEvent(Base):
    """Upcoming events for dashboard display."""

    __tablename__ = "upcoming_events"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    action_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action_href: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    target_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    extra_data: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Phase 4: Gamification
# ---------------------------------------------------------------------------


class BadgeDefinition(Base):
    """Badge definitions — 20 badges seeded on startup."""

    __tablename__ = "badge_definitions"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    rarity: Mapped[str] = mapped_column(String(16), nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger_config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    icon_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserBadge(Base):
    """Badges earned by users — UNIQUE(user_id, badge_id) prevents duplicates."""

    __tablename__ = "user_badges"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_id", name="user_badges_user_id_badge_id_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    badge_id: Mapped[int] = mapped_column(Integer, ForeignKey("badge_definitions.id"), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    badge_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    notified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    badge: Mapped[BadgeDefinition] = relationship("BadgeDefinition", lazy="joined")


class XPLedger(Base):
    """Immutable XP transaction log with idempotency key."""

    __tablename__ = "xp_ledger"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(256), unique=True, nullable=True)


class UserGamification(Base):
    """Denormalized gamification summary — single row per user, O(1) reads."""

    __tablename__ = "user_gamification"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    total_xp: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    level_title: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Nocoiner")
    badges_earned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    streak_start_date: Mapped[Any] = mapped_column(Date, nullable=True)
    last_active_week: Mapped[str | None] = mapped_column(String(10), nullable=True)
    total_shares: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    best_difficulty: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    blocks_found: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))


class StreakCalendar(Base):
    """Weekly mining activity for streak tracking."""

    __tablename__ = "streak_calendar"
    __table_args__ = (
        UniqueConstraint("user_id", "week_iso", name="streak_calendar_user_id_week_iso_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    week_iso: Mapped[str] = mapped_column(String(10), nullable=False)
    week_start: Mapped[Any] = mapped_column(Date, nullable=False)
    share_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    best_diff: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class BadgeStats(Base):
    """Aggregate badge statistics — how many users earned each badge."""

    __tablename__ = "badge_stats"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    badge_id: Mapped[int] = mapped_column(Integer, ForeignKey("badge_definitions.id"), primary_key=True)
    total_earned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")
    last_earned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    badge: Mapped[BadgeDefinition] = relationship("BadgeDefinition", lazy="joined")


# ---------------------------------------------------------------------------
# Phase 5: Games & Lottery
# ---------------------------------------------------------------------------


class LotteryDraw(Base):
    """Weekly lottery draw record."""

    __tablename__ = "lottery_draws"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    week_iso: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    week_start: Mapped[Any] = mapped_column(Date, nullable=False)
    week_end: Mapped[Any] = mapped_column(Date, nullable=False)
    total_participants: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_shares: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    winning_difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    winner_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="open")
    drawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    results: Mapped[list[LotteryResult]] = relationship("LotteryResult", back_populates="draw")
    winner: Mapped[User | None] = relationship("User", foreign_keys=[winner_user_id])


class LotteryResult(Base):
    """Individual user result within a lottery draw."""

    __tablename__ = "lottery_results"
    __table_args__ = (
        UniqueConstraint("draw_id", "user_id", name="lottery_results_draw_user_key"),
        UniqueConstraint("draw_id", "rank", name="lottery_results_draw_rank_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    draw_id: Mapped[int] = mapped_column(Integer, ForeignKey("lottery_draws.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    best_difficulty: Mapped[float] = mapped_column(Float, nullable=False)
    best_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total_shares: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    percentile: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")

    draw: Mapped[LotteryDraw] = relationship("LotteryDraw", back_populates="results")
    user: Mapped[User] = relationship("User")


class GameSession(Base):
    """Game play session for analytics tracking."""

    __tablename__ = "game_sessions"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    game_type: Mapped[str] = mapped_column(String(32), nullable=False)
    week_iso: Mapped[str] = mapped_column(String(10), nullable=False)
    played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    game_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    shared: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Phase 6: Competition System
# ---------------------------------------------------------------------------


class LeaderboardSnapshot(Base):
    """Historical leaderboard snapshots for rank change calculation."""

    __tablename__ = "leaderboard_snapshots"
    __table_args__ = (
        UniqueConstraint("period", "period_key", "user_id", name="lb_snapshots_period_user_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period: Mapped[str] = mapped_column(String(16), nullable=False)
    period_key: Mapped[str] = mapped_column(String(16), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    snapshot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CountryRanking(Base):
    """Country-level ranking aggregates."""

    __tablename__ = "country_rankings"
    __table_args__ = (
        UniqueConstraint("country_code", "period_key", name="country_rankings_code_period_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    country_name: Mapped[str] = mapped_column(String(64), nullable=False)
    period_key: Mapped[str] = mapped_column(String(16), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    miner_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_hashrate: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Competition(Base):
    """Competition events (e.g., World Cup)."""

    __tablename__ = "competitions"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="upcoming")
    start_date: Mapped[Any] = mapped_column(Date, nullable=False)
    end_date: Mapped[Any] = mapped_column(Date, nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    teams: Mapped[list[CompetitionTeam]] = relationship("CompetitionTeam", back_populates="competition", cascade="all, delete-orphan")
    matches: Mapped[list[Match]] = relationship("Match", back_populates="competition", cascade="all, delete-orphan")


class CompetitionTeam(Base):
    """Country team in a competition."""

    __tablename__ = "competition_teams"
    __table_args__ = (
        UniqueConstraint("competition_id", "country_code", name="comp_teams_comp_country_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    competition_id: Mapped[int] = mapped_column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    country_name: Mapped[str] = mapped_column(String(64), nullable=False)
    group_name: Mapped[str | None] = mapped_column(String(16), nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    played: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    won: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    drawn: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    lost: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    hashrate: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="active")

    competition: Mapped[Competition] = relationship("Competition", back_populates="teams")
    registrations: Mapped[list[CompetitionRegistration]] = relationship("CompetitionRegistration", back_populates="team")


class CompetitionRegistration(Base):
    """Individual miner registration for a competition."""

    __tablename__ = "competition_registrations"
    __table_args__ = (
        UniqueConstraint("competition_id", "user_id", name="comp_registrations_comp_user_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    competition_id: Mapped[int] = mapped_column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("competition_teams.id", ondelete="CASCADE"), nullable=False)
    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    team: Mapped[CompetitionTeam] = relationship("CompetitionTeam", back_populates="registrations")
    user: Mapped[User] = relationship("User")


class Match(Base):
    """Match between two teams in a competition."""

    __tablename__ = "matches"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    competition_id: Mapped[int] = mapped_column(Integer, ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    round: Mapped[str] = mapped_column(String(16), nullable=False)
    team_a_id: Mapped[int] = mapped_column(Integer, ForeignKey("competition_teams.id"), nullable=False)
    team_b_id: Mapped[int] = mapped_column(Integer, ForeignKey("competition_teams.id"), nullable=False)
    score_a: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    score_b: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    hashrate_a: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    hashrate_b: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    miners_a: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    miners_b: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="scheduled")
    match_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    man_of_match_user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    man_of_match_diff: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_recap: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    match_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")

    competition: Mapped[Competition] = relationship("Competition", back_populates="matches")
    team_a: Mapped[CompetitionTeam] = relationship("CompetitionTeam", foreign_keys=[team_a_id])
    team_b: Mapped[CompetitionTeam] = relationship("CompetitionTeam", foreign_keys=[team_b_id])
    man_of_match: Mapped[User | None] = relationship("User", foreign_keys=[man_of_match_user_id])


class League(Base):
    """League (quarterly season with promotion/relegation)."""

    __tablename__ = "leagues"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    division: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    season: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="active")
    start_date: Mapped[Any] = mapped_column(Date, nullable=False)
    end_date: Mapped[Any] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    clubs: Mapped[list[LeagueClub]] = relationship("LeagueClub", back_populates="league", cascade="all, delete-orphan")


class LeagueClub(Base):
    """Club (cooperative) in a league."""

    __tablename__ = "league_clubs"
    __table_args__ = (
        UniqueConstraint("league_id", "cooperative_id", name="league_clubs_league_coop_key"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    league_id: Mapped[int] = mapped_column(Integer, ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False)
    cooperative_id: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    played: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    won: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    drawn: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    lost: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    hashrate: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    is_promoted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_relegated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    league: Mapped[League] = relationship("League", back_populates="clubs")


# ---------------------------------------------------------------------------
# Phase 7: Social & Cooperatives
# ---------------------------------------------------------------------------


class Cooperative(Base):
    """Cooperative — small mining guilds (max 20 members)."""

    __tablename__ = "cooperatives"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    motto: Mapped[str | None] = mapped_column(String(256), nullable=True)
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    member_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    max_members: Mapped[int] = mapped_column(Integer, nullable=False, server_default="20")
    combined_hashrate: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    weekly_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    best_combined_diff: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    blocks_found: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_shares_week: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    weekly_rank: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    members: Mapped[list[CooperativeMember]] = relationship(
        "CooperativeMember", back_populates="cooperative", cascade="all, delete-orphan"
    )
    owner: Mapped[User] = relationship("User", foreign_keys=[owner_user_id])


class CooperativeMember(Base):
    """Cooperative membership — one user can only be in one cooperative."""

    __tablename__ = "cooperative_members"
    __table_args__ = (
        UniqueConstraint("cooperative_id", "user_id", name="coop_members_coop_user_key"),
        UniqueConstraint("user_id", name="coop_members_user_unique"),
        {"extend_existing": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cooperative_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cooperatives.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, server_default="member")
    hashrate: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    shares_today: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cooperative: Mapped[Cooperative] = relationship("Cooperative", back_populates="members")
    user: Mapped[User] = relationship("User")


class UserActivity(Base):
    """User activity log for personal feed."""

    __tablename__ = "user_activity"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    activity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User")


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class Notification(Base):
    """Persisted user notifications."""

    __tablename__ = "notifications"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    subtype: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    action_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    notification_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, server_default="{}")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Phase 8: Education
# ---------------------------------------------------------------------------


class EducationTrack(Base):
    """Education track — groups related lessons."""

    __tablename__ = "education_tracks"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    lesson_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lessons: Mapped[list[EducationLesson]] = relationship(
        "EducationLesson", back_populates="track", order_by="EducationLesson.order"
    )


class EducationLesson(Base):
    """Education lesson — stores Markdown content with dynamic placeholders."""

    __tablename__ = "education_lessons"
    __table_args__ = (
        UniqueConstraint("track_id", "order", name="uq_lesson_track_order"),
        {"extend_existing": True},
    )

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    track_id: Mapped[str] = mapped_column(
        String(10), ForeignKey("education_tracks.id", ondelete="CASCADE"), nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    track: Mapped[EducationTrack] = relationship("EducationTrack", back_populates="lessons")


class UserLessonCompletion(Base):
    """User lesson completion — UNIQUE(user_id, lesson_id) prevents duplicates."""

    __tablename__ = "user_lesson_completions"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_user_lesson"),
        {"extend_existing": True},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    track_id: Mapped[str] = mapped_column(String(10), ForeignKey("education_tracks.id"), nullable=False)
    lesson_id: Mapped[str] = mapped_column(String(10), ForeignKey("education_lessons.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserTrackCompletion(Base):
    """User track completion — UNIQUE(user_id, track_id) prevents duplicates."""

    __tablename__ = "user_track_completions"
    __table_args__ = (
        UniqueConstraint("user_id", "track_id", name="uq_user_track"),
        {"extend_existing": True},
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    track_id: Mapped[str] = mapped_column(String(10), ForeignKey("education_tracks.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
