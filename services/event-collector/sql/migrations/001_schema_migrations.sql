-- =============================================================================
-- Migration 001: Schema Migrations Table
-- =============================================================================
-- Creates the schema_migrations tracking table used by the migration runner.
-- This is the foundation for all subsequent database migrations.
--
-- Applied by: services/scripts/backup/migrate.sh
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    applied_at  TIMESTAMPTZ DEFAULT NOW(),
    checksum    VARCHAR(64)
);

-- Register this migration itself
INSERT INTO schema_migrations (version, name, checksum)
VALUES (1, 'initial_schema', md5('001_schema_migrations'))
ON CONFLICT DO NOTHING;
