"""Baseline — matches existing init.sql schema.

This migration does NOT create tables (they already exist from init.sql).
It stamps the baseline so Alembic can manage future schema changes.

Revision ID: 001_baseline
Revises: None
Create Date: 2026-02-23
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Tables already exist via init.sql.

    This migration exists to establish Alembic's baseline version tracking.
    All tables referenced:
      - users
      - workers
      - shares (hypertable)
      - blocks
      - weekly_best_diff
      - mining_events (hypertable)
      - rate_limit_events (hypertable)
      - schema_migrations
      - hourly_shares (continuous aggregate)
      - daily_shares (continuous aggregate)
    """


def downgrade() -> None:
    """Cannot downgrade from baseline."""
