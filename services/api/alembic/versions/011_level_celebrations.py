"""Level celebration persistence — tracks which level-up celebrations users have seen.

When a user levels up, a celebration record is created. If the user
is offline, the pending celebration is delivered on next login/reconnect.

Revision ID: 011_level_celebrations
Revises: 010_block_celebrations
Create Date: 2026-02-25
"""

from collections.abc import Sequence

import sqlalchemy as sa  # noqa: F401
from alembic import op

revision: str = "011_level_celebrations"
down_revision: str | None = "010_block_celebrations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS level_celebrations (
            id            BIGSERIAL PRIMARY KEY,
            user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            old_level     INT NOT NULL,
            new_level     INT NOT NULL,
            new_title     VARCHAR(100) NOT NULL,
            celebrated    BOOLEAN NOT NULL DEFAULT FALSE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            celebrated_at TIMESTAMPTZ,
            UNIQUE (user_id, new_level)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_level_celebrations_user_pending
        ON level_celebrations (user_id)
        WHERE celebrated = FALSE
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS level_celebrations CASCADE")
