"""Streak milestone celebration persistence.

When a user reaches a streak milestone (1, 4, 12, 26, 52 weeks),
a celebration record is created. If the user is offline, the pending
celebration is delivered on next login/reconnect.

Revision ID: 012_streak_celebrations
Revises: 011_level_celebrations
Create Date: 2026-02-25
"""

from collections.abc import Sequence

import sqlalchemy as sa  # noqa: F401
from alembic import op

revision: str = "012_streak_celebrations"
down_revision: str | None = "011_level_celebrations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS streak_celebrations (
            id            BIGSERIAL PRIMARY KEY,
            user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            streak_weeks  INT NOT NULL,
            milestone     VARCHAR(100) NOT NULL,
            celebrated    BOOLEAN NOT NULL DEFAULT FALSE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            celebrated_at TIMESTAMPTZ,
            UNIQUE (user_id, streak_weeks)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_streak_celebrations_user_pending
        ON streak_celebrations (user_id)
        WHERE celebrated = FALSE
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS streak_celebrations CASCADE")
