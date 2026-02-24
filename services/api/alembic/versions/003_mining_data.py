"""Phase 2: Mining data tables.

Creates personal_bests, user_daily_stats, hashrate_snapshots (hypertable),
and network_difficulty tables for the mining data API.

Revision ID: 003_mining_data
Revises: 002_auth_tables
Create Date: 2026-02-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "003_mining_data"
down_revision: str | None = "002_auth_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create Phase 2 mining data tables."""
    # --- personal_bests ---
    op.create_table(
        "personal_bests",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("timeframe", sa.String(16), nullable=False),
        sa.Column("period_key", sa.String(16), nullable=True),
        sa.Column("best_difficulty", sa.Float(), nullable=False),
        sa.Column("share_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("worker_name", sa.String(128), nullable=True),
        sa.Column("percentile", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "timeframe", "period_key", name="uq_personal_bests_user_timeframe_period"),
    )
    op.create_index("ix_personal_bests_user_id", "personal_bests", ["user_id"])
    op.create_index("ix_personal_bests_timeframe", "personal_bests", ["timeframe"])
    op.create_index("ix_personal_bests_best_difficulty", "personal_bests", ["best_difficulty"])

    # --- user_daily_stats ---
    op.create_table(
        "user_daily_stats",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("total_shares", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("accepted_shares", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("rejected_shares", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("best_diff", sa.Float(), server_default="0", nullable=False),
        sa.Column("avg_diff", sa.Float(), server_default="0", nullable=False),
        sa.Column("uptime_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("workers_seen", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("user_id", "day"),
    )

    # --- hashrate_snapshots (will be hypertable) ---
    op.create_table(
        "hashrate_snapshots",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("worker_name", sa.String(128), nullable=True),
        sa.Column("hashrate_1m", sa.Float(), nullable=True),
        sa.Column("hashrate_5m", sa.Float(), nullable=True),
        sa.Column("hashrate_1h", sa.Float(), nullable=True),
        sa.Column("hashrate_24h", sa.Float(), nullable=True),
        sa.Column("workers_online", sa.Integer(), server_default="0"),
    )
    op.create_index("ix_hashrate_snapshots_user_time", "hashrate_snapshots", ["user_id", "time"])

    # Convert to hypertable
    op.execute(
        "SELECT create_hypertable('hashrate_snapshots', 'time', "
        "chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE)"
    )

    # --- network_difficulty ---
    op.create_table(
        "network_difficulty",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("block_height", sa.Integer(), nullable=False),
        sa.Column("difficulty", sa.Float(), nullable=False),
        sa.Column("block_hash", sa.String(64), nullable=True),
    )
    op.create_index("ix_network_difficulty_block_height", "network_difficulty", ["block_height"])

    # Convert to hypertable
    op.execute(
        "SELECT create_hypertable('network_difficulty', 'time', "
        "chunk_time_interval => INTERVAL '30 days', if_not_exists => TRUE)"
    )


def downgrade() -> None:
    """Drop Phase 2 mining data tables."""
    op.drop_table("network_difficulty")
    op.drop_table("hashrate_snapshots")
    op.drop_table("user_daily_stats")
    op.drop_table("personal_bests")
