"""Block celebration persistence — tracks which block celebrations users have seen.

When a user's miner finds a block, a celebration record is created. If the user
is offline, the pending celebration is delivered on next login/reconnect.

Revision ID: 010_block_celebrations
Revises: 009_education_tables
Create Date: 2026-02-25
"""

from collections.abc import Sequence

import sqlalchemy as sa  # noqa: F401
from alembic import op

revision: str = "010_block_celebrations"
down_revision: str | None = "009_education_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS block_celebrations (
            id          BIGSERIAL PRIMARY KEY,
            block_id    BIGINT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
            user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            celebrated  BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            celebrated_at TIMESTAMPTZ,
            UNIQUE (block_id, user_id)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_block_celebrations_user_pending
        ON block_celebrations (user_id)
        WHERE celebrated = FALSE
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_block_celebrations_block
        ON block_celebrations (block_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS block_celebrations CASCADE")
