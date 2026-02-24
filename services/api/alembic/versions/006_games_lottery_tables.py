"""Phase 5: Games & weekly lottery tables.

Creates lottery_draws, lottery_results, and game_sessions tables
for the deterministic weekly lottery and game analytics.

Revision ID: 006_games_lottery_tables
Revises: 005_gamification_tables
Create Date: 2026-02-24
"""

from collections.abc import Sequence

from alembic import op

revision: str = "006_games_lottery_tables"
down_revision: str | None = "005_gamification_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Lottery Draws ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS lottery_draws (
            id SERIAL PRIMARY KEY,
            week_iso VARCHAR(10) UNIQUE NOT NULL,
            week_start DATE NOT NULL,
            week_end DATE NOT NULL,
            total_participants INTEGER NOT NULL DEFAULT 0,
            total_shares BIGINT NOT NULL DEFAULT 0,
            winning_difficulty DOUBLE PRECISION,
            winner_user_id BIGINT REFERENCES users(id),
            status VARCHAR(16) NOT NULL DEFAULT 'open',
            drawn_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lottery_draws_status
        ON lottery_draws(status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lottery_draws_week
        ON lottery_draws(week_start)
    """)

    # --- Lottery Results ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS lottery_results (
            id SERIAL PRIMARY KEY,
            draw_id INTEGER NOT NULL REFERENCES lottery_draws(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            rank INTEGER NOT NULL,
            best_difficulty DOUBLE PRECISION NOT NULL,
            best_hash VARCHAR(64),
            total_shares BIGINT NOT NULL DEFAULT 0,
            xp_awarded INTEGER NOT NULL DEFAULT 0,
            percentile DECIMAL(5,2) NOT NULL DEFAULT 0,
            UNIQUE(draw_id, user_id),
            UNIQUE(draw_id, rank)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lottery_results_draw
        ON lottery_results(draw_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lottery_results_user
        ON lottery_results(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lottery_results_rank
        ON lottery_results(rank)
    """)

    # --- Game Sessions ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS game_sessions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            game_type VARCHAR(32) NOT NULL,
            week_iso VARCHAR(10) NOT NULL,
            played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata JSONB DEFAULT '{}',
            shared BOOLEAN NOT NULL DEFAULT false
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_game_sessions_user
        ON game_sessions(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_game_sessions_game
        ON game_sessions(game_type)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_game_sessions_week
        ON game_sessions(week_iso)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS game_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS lottery_results CASCADE")
    op.execute("DROP TABLE IF EXISTS lottery_draws CASCADE")
