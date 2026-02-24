"""Phase 7: Social & Cooperatives — cooperatives, members, user activity.

Creates cooperatives, cooperative_members, user_activity tables.
Adds metadata and expires_at columns to existing notifications table.

Revision ID: 008_social_tables
Revises: 007_competition_tables
Create Date: 2026-02-24
"""

from collections.abc import Sequence

from alembic import op

revision: str = "008_social_tables"
down_revision: str | None = "007_competition_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Cooperatives ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS cooperatives (
            id SERIAL PRIMARY KEY,
            name VARCHAR(64) NOT NULL,
            motto VARCHAR(256),
            invite_code VARCHAR(8) UNIQUE NOT NULL,
            owner_user_id INTEGER NOT NULL REFERENCES users(id),
            member_count INTEGER NOT NULL DEFAULT 1,
            max_members INTEGER NOT NULL DEFAULT 20,
            combined_hashrate DOUBLE PRECISION NOT NULL DEFAULT 0,
            weekly_streak INTEGER NOT NULL DEFAULT 0,
            best_combined_diff DOUBLE PRECISION NOT NULL DEFAULT 0,
            blocks_found INTEGER NOT NULL DEFAULT 0,
            total_shares_week BIGINT NOT NULL DEFAULT 0,
            weekly_rank INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cooperatives_name
        ON cooperatives(lower(name))
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_cooperatives_invite
        ON cooperatives(invite_code)
    """)

    # --- Cooperative Members ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS cooperative_members (
            id SERIAL PRIMARY KEY,
            cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(16) NOT NULL DEFAULT 'member',
            hashrate DOUBLE PRECISION NOT NULL DEFAULT 0,
            shares_today BIGINT NOT NULL DEFAULT 0,
            is_online BOOLEAN NOT NULL DEFAULT false,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(cooperative_id, user_id),
            UNIQUE(user_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_coop_members_coop
        ON cooperative_members(cooperative_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_coop_members_user
        ON cooperative_members(user_id)
    """)

    # --- Expand Notifications (add metadata + expires_at if missing) ---
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'notifications' AND column_name = 'metadata'
            ) THEN
                ALTER TABLE notifications ADD COLUMN metadata JSONB DEFAULT '{}';
            END IF;
        END
        $$
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'notifications' AND column_name = 'expires_at'
            ) THEN
                ALTER TABLE notifications ADD COLUMN expires_at TIMESTAMPTZ;
            END IF;
        END
        $$
    """)
    # Add indexes for notifications if not already present
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_user
        ON notifications(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_unread
        ON notifications(user_id, read) WHERE read = false
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_created
        ON notifications(created_at)
    """)

    # --- User Activity ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_activity (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            activity_type VARCHAR(64) NOT NULL,
            title VARCHAR(256) NOT NULL,
            description TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_activity_user
        ON user_activity(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_activity_type
        ON user_activity(activity_type)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_activity_created
        ON user_activity(created_at)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_activity CASCADE")
    op.execute("DROP TABLE IF EXISTS cooperative_members CASCADE")
    op.execute("DROP TABLE IF EXISTS cooperatives CASCADE")
    # Don't drop notifications — it existed before this migration
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS metadata")
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS expires_at")
