"""Phase 4: Gamification tables.

Creates badge_definitions, user_badges, xp_ledger, user_gamification,
streak_calendar, and badge_stats tables for the gamification engine.

Revision ID: 005_gamification_tables
Revises: 004_dashboard_tables
Create Date: 2026-02-24
"""

from collections.abc import Sequence

from alembic import op

revision: str = "005_gamification_tables"
down_revision: str | None = "004_dashboard_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Badge Definitions ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS badge_definitions (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(64) UNIQUE NOT NULL,
            name VARCHAR(128) NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(32) NOT NULL,
            rarity VARCHAR(16) NOT NULL,
            xp_reward INTEGER NOT NULL,
            trigger_type VARCHAR(32) NOT NULL,
            trigger_config JSONB NOT NULL DEFAULT '{}',
            icon_url VARCHAR(256),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_badge_defs_category
        ON badge_definitions(category)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_badge_defs_trigger
        ON badge_definitions(trigger_type)
    """)

    # --- User Badges ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_badges (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            badge_id INTEGER NOT NULL REFERENCES badge_definitions(id),
            earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata JSONB DEFAULT '{}',
            notified BOOLEAN NOT NULL DEFAULT false,
            UNIQUE(user_id, badge_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_badges_user
        ON user_badges(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_badges_earned
        ON user_badges(earned_at)
    """)

    # --- XP Ledger ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS xp_ledger (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            source VARCHAR(32) NOT NULL,
            source_id VARCHAR(128),
            description VARCHAR(256),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            idempotency_key VARCHAR(256) UNIQUE
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_xp_ledger_user
        ON xp_ledger(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_xp_ledger_source
        ON xp_ledger(source)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_xp_ledger_created
        ON xp_ledger(created_at)
    """)

    # --- User Gamification (denormalized) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_gamification (
            user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            total_xp BIGINT NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            level_title VARCHAR(64) NOT NULL DEFAULT 'Nocoiner',
            badges_earned INTEGER NOT NULL DEFAULT 0,
            current_streak INTEGER NOT NULL DEFAULT 0,
            longest_streak INTEGER NOT NULL DEFAULT 0,
            streak_start_date DATE,
            last_active_week VARCHAR(10),
            total_shares BIGINT NOT NULL DEFAULT 0,
            best_difficulty DOUBLE PRECISION NOT NULL DEFAULT 0,
            blocks_found INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # --- Streak Calendar ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS streak_calendar (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            week_iso VARCHAR(10) NOT NULL,
            week_start DATE NOT NULL,
            share_count INTEGER NOT NULL DEFAULT 0,
            best_diff DOUBLE PRECISION NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT false,
            UNIQUE(user_id, week_iso)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_streak_cal_user
        ON streak_calendar(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_streak_cal_week
        ON streak_calendar(week_start)
    """)

    # --- Badge Stats ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS badge_stats (
            badge_id INTEGER PRIMARY KEY REFERENCES badge_definitions(id),
            total_earned INTEGER NOT NULL DEFAULT 0,
            percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
            last_earned_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # --- Notifications (for persisted notifications) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(32) NOT NULL,
            subtype VARCHAR(64) NOT NULL,
            title VARCHAR(256) NOT NULL,
            description TEXT,
            action_url VARCHAR(256),
            action_label VARCHAR(64),
            read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_user
        ON notifications(user_id, created_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_unread
        ON notifications(user_id)
        WHERE read = false
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications CASCADE")
    op.execute("DROP TABLE IF EXISTS badge_stats CASCADE")
    op.execute("DROP TABLE IF EXISTS streak_calendar CASCADE")
    op.execute("DROP TABLE IF EXISTS user_gamification CASCADE")
    op.execute("DROP TABLE IF EXISTS xp_ledger CASCADE")
    op.execute("DROP TABLE IF EXISTS user_badges CASCADE")
    op.execute("DROP TABLE IF EXISTS badge_definitions CASCADE")
