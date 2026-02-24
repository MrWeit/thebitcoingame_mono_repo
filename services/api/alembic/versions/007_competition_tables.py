"""Phase 6: Competition system — leaderboards, World Cup, leagues.

Creates leaderboard_snapshots, country_rankings, competitions,
competition_teams, competition_registrations, matches, leagues,
and league_clubs tables.

Revision ID: 007_competition_tables
Revises: 006_games_lottery_tables
Create Date: 2026-02-24
"""

from collections.abc import Sequence

from alembic import op

revision: str = "007_competition_tables"
down_revision: str | None = "006_games_lottery_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Leaderboard Snapshots ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
            id SERIAL PRIMARY KEY,
            period VARCHAR(16) NOT NULL,
            period_key VARCHAR(16) NOT NULL,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            rank INTEGER NOT NULL,
            score DOUBLE PRECISION NOT NULL,
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(period, period_key, user_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lb_snapshots_period
        ON leaderboard_snapshots(period, period_key)
    """)

    # --- Country Rankings ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS country_rankings (
            id SERIAL PRIMARY KEY,
            country_code VARCHAR(2) NOT NULL,
            country_name VARCHAR(64) NOT NULL,
            period_key VARCHAR(16) NOT NULL,
            rank INTEGER NOT NULL,
            miner_count INTEGER NOT NULL DEFAULT 0,
            total_hashrate DOUBLE PRECISION NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(country_code, period_key)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_country_rankings_period
        ON country_rankings(period_key)
    """)

    # --- Competitions (World Cup) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS competitions (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            type VARCHAR(32) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'upcoming',
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            config JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_competitions_status
        ON competitions(status)
    """)

    # --- Competition Teams ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS competition_teams (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            country_code VARCHAR(2) NOT NULL,
            country_name VARCHAR(64) NOT NULL,
            group_name VARCHAR(16),
            points INTEGER NOT NULL DEFAULT 0,
            played INTEGER NOT NULL DEFAULT 0,
            won INTEGER NOT NULL DEFAULT 0,
            drawn INTEGER NOT NULL DEFAULT 0,
            lost INTEGER NOT NULL DEFAULT 0,
            hashrate DOUBLE PRECISION NOT NULL DEFAULT 0,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            UNIQUE(competition_id, country_code)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_competition_teams_comp
        ON competition_teams(competition_id)
    """)

    # --- Competition Registrations ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS competition_registrations (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            team_id INTEGER NOT NULL REFERENCES competition_teams(id) ON DELETE CASCADE,
            registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(competition_id, user_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_comp_registrations_user
        ON competition_registrations(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_comp_registrations_team
        ON competition_registrations(team_id)
    """)

    # --- Matches ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS matches (
            id SERIAL PRIMARY KEY,
            competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            round VARCHAR(16) NOT NULL,
            team_a_id INTEGER NOT NULL REFERENCES competition_teams(id),
            team_b_id INTEGER NOT NULL REFERENCES competition_teams(id),
            score_a INTEGER NOT NULL DEFAULT 0,
            score_b INTEGER NOT NULL DEFAULT 0,
            hashrate_a DOUBLE PRECISION NOT NULL DEFAULT 0,
            hashrate_b DOUBLE PRECISION NOT NULL DEFAULT 0,
            miners_a INTEGER NOT NULL DEFAULT 0,
            miners_b INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
            match_date TIMESTAMPTZ NOT NULL,
            man_of_match_user_id BIGINT REFERENCES users(id),
            man_of_match_diff DOUBLE PRECISION,
            ai_recap TEXT,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            metadata JSONB DEFAULT '{}'
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_matches_competition
        ON matches(competition_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_matches_status
        ON matches(status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_matches_date
        ON matches(match_date)
    """)

    # --- Leagues ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS leagues (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            division INTEGER NOT NULL DEFAULT 0,
            season VARCHAR(16) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_leagues_status
        ON leagues(status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_leagues_season
        ON leagues(season)
    """)

    # --- League Clubs ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS league_clubs (
            id SERIAL PRIMARY KEY,
            league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
            cooperative_id INTEGER NOT NULL,
            name VARCHAR(128) NOT NULL,
            played INTEGER NOT NULL DEFAULT 0,
            won INTEGER NOT NULL DEFAULT 0,
            drawn INTEGER NOT NULL DEFAULT 0,
            lost INTEGER NOT NULL DEFAULT 0,
            points INTEGER NOT NULL DEFAULT 0,
            hashrate DOUBLE PRECISION NOT NULL DEFAULT 0,
            is_promoted BOOLEAN NOT NULL DEFAULT false,
            is_relegated BOOLEAN NOT NULL DEFAULT false,
            UNIQUE(league_id, cooperative_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_league_clubs_league
        ON league_clubs(league_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS league_clubs CASCADE")
    op.execute("DROP TABLE IF EXISTS leagues CASCADE")
    op.execute("DROP TABLE IF EXISTS matches CASCADE")
    op.execute("DROP TABLE IF EXISTS competition_registrations CASCADE")
    op.execute("DROP TABLE IF EXISTS competition_teams CASCADE")
    op.execute("DROP TABLE IF EXISTS competitions CASCADE")
    op.execute("DROP TABLE IF EXISTS country_rankings CASCADE")
    op.execute("DROP TABLE IF EXISTS leaderboard_snapshots CASCADE")
