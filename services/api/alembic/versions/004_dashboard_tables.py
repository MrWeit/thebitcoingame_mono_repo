"""Phase 3: Dashboard tables.

Creates activity_feed and upcoming_events tables for the global feed
and upcoming events dashboard components.

Revision ID: 004_dashboard_tables
Revises: 003_mining_data
Create Date: 2026-02-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "004_dashboard_tables"
down_revision: str | None = "003_mining_data"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Use raw SQL for full IF NOT EXISTS support (handles partial migration reruns)

    # --- Activity Feed ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS activity_feed (
            id BIGSERIAL PRIMARY KEY,
            event_type VARCHAR(32) NOT NULL,
            user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT,
            metadata JSONB DEFAULT '{}',
            is_global BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_activity_feed_global
        ON activity_feed (created_at DESC)
        WHERE is_global = TRUE
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_activity_feed_user
        ON activity_feed (user_id, created_at DESC)
    """)

    # --- Upcoming Events ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS upcoming_events (
            id VARCHAR(64) PRIMARY KEY,
            event_type VARCHAR(32) NOT NULL,
            title VARCHAR(256) NOT NULL,
            description TEXT,
            starts_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ NOT NULL,
            action_label VARCHAR(64),
            action_href VARCHAR(256),
            is_active BOOLEAN DEFAULT TRUE,
            target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_active
        ON upcoming_events (ends_at ASC)
        WHERE is_active = TRUE
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_events_user
        ON upcoming_events (target_user_id, ends_at ASC)
        WHERE is_active = TRUE
    """)


def downgrade() -> None:
    op.drop_table("upcoming_events")
    op.drop_table("activity_feed")
