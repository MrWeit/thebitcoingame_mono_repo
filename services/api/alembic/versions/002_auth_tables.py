"""Phase 1: Authentication tables and user extensions.

Adds email/password auth columns to users table.
Creates refresh_tokens, api_keys, user_settings,
email_verification_tokens, and password_reset_tokens tables.

Revision ID: 002_auth_tables
Revises: 001_baseline
Create Date: 2026-02-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "002_auth_tables"
down_revision: str | None = "001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add authentication columns and tables."""
    # --- Extend users table ---
    op.add_column("users", sa.Column("email", sa.String(320), nullable=True))
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("password_hash", sa.String(256), nullable=True))
    op.add_column("users", sa.Column("auth_method", sa.String(16), server_default="wallet", nullable=False))
    op.add_column("users", sa.Column("display_name_normalized", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(280), nullable=True))
    op.add_column("users", sa.Column("is_banned", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("login_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))

    # Unique indexes on users
    op.create_index("ix_users_email", "users", ["email"], unique=True, postgresql_where=sa.text("email IS NOT NULL"))
    op.create_index(
        "ix_users_display_name_normalized",
        "users",
        ["display_name_normalized"],
        unique=True,
        postgresql_where=sa.text("display_name_normalized IS NOT NULL"),
    )

    # Check constraints
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_auth_method "
        "CHECK (auth_method IN ('wallet', 'email'))"
    )
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_email_auth "
        "CHECK (auth_method != 'email' OR (email IS NOT NULL AND password_hash IS NOT NULL))"
    )

    # --- Create refresh_tokens table ---
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("replaced_by", postgresql.UUID(as_uuid=False), nullable=True),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    # --- Create api_keys table ---
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("key_hash", sa.String(256), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("permissions", postgresql.JSONB(), server_default='["read"]', nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_prefix", "api_keys", ["key_prefix"])

    # --- Create user_settings table ---
    op.create_table(
        "user_settings",
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("notifications", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("privacy", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("mining", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("sound", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- Create email_verification_tokens table ---
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_email_verification_token_hash",
        "email_verification_tokens",
        ["token_hash"],
        postgresql_where=sa.text("used_at IS NULL"),
    )
    op.create_index("ix_email_verification_user", "email_verification_tokens", ["user_id"])

    # --- Create password_reset_tokens table ---
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
    )
    op.create_index(
        "ix_password_reset_token_hash",
        "password_reset_tokens",
        ["token_hash"],
        postgresql_where=sa.text("used_at IS NULL"),
    )
    op.create_index("ix_password_reset_user", "password_reset_tokens", ["user_id"])


def downgrade() -> None:
    """Reverse all Phase 1 changes."""
    # Drop new tables
    op.drop_table("password_reset_tokens")
    op.drop_table("email_verification_tokens")
    op.drop_table("user_settings")
    op.drop_table("api_keys")
    op.drop_table("refresh_tokens")

    # Drop constraints on users
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_email_auth")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_auth_method")

    # Drop indexes on users
    op.drop_index("ix_users_display_name_normalized", table_name="users")
    op.drop_index("ix_users_email", table_name="users")

    # Drop columns on users
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_attempts")
    op.drop_column("users", "login_count")
    op.drop_column("users", "last_login")
    op.drop_column("users", "is_banned")
    op.drop_column("users", "bio")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name_normalized")
    op.drop_column("users", "auth_method")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "email")
