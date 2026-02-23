-- =============================================================================
-- Migration 002: Add Region Columns
-- =============================================================================
-- Adds region support to core tables for multi-instance / geo-distribution.
-- Default region is 'eu' (primary) to match Phase 4 multi-region setup.
--
-- Tables affected: shares, mining_events, blocks
-- New indexes: region-based lookups for cross-region queries
--
-- Applied by: services/scripts/backup/migrate.sh
-- =============================================================================

-- Add region column to shares (hypertable)
ALTER TABLE shares ADD COLUMN IF NOT EXISTS region VARCHAR(8) DEFAULT 'eu';

-- Add region column to mining_events (hypertable)
ALTER TABLE mining_events ADD COLUMN IF NOT EXISTS region VARCHAR(8) DEFAULT 'eu';

-- Add region column to blocks
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS region VARCHAR(8) DEFAULT 'eu';

-- Indexes for efficient region-based queries
-- Note: For TimescaleDB hypertables, these indexes are created on each chunk
CREATE INDEX IF NOT EXISTS idx_shares_region ON shares(region, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_region ON mining_events(region, ts DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_region ON blocks(region);

-- Register this migration
INSERT INTO schema_migrations (version, name, checksum)
VALUES (2, 'add_region_column', md5('002_add_region_column'))
ON CONFLICT DO NOTHING;
