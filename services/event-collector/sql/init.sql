-- TheBitcoinGame — Database Schema (TimescaleDB)
-- This file is run automatically on first container start via docker-entrypoint-initdb.d

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users register by connecting with their BTC address
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    btc_address     VARCHAR(62) NOT NULL UNIQUE,
    display_name    VARCHAR(64),
    country_code    CHAR(2),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_seen       TIMESTAMPTZ,
    is_verified     BOOLEAN DEFAULT FALSE
);

-- Each physical mining device
CREATE TABLE IF NOT EXISTS workers (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id),
    worker_name     VARCHAR(128) NOT NULL,
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_share      TIMESTAMPTZ,
    current_diff    DOUBLE PRECISION,
    hashrate_1m     DOUBLE PRECISION,
    hashrate_5m     DOUBLE PRECISION,
    hashrate_1h     DOUBLE PRECISION,
    hashrate_24h    DOUBLE PRECISION,
    is_online       BOOLEAN DEFAULT FALSE,
    source          VARCHAR(16) DEFAULT 'hosted'
);

CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers(user_id);
CREATE INDEX IF NOT EXISTS idx_workers_online ON workers(is_online) WHERE is_online = TRUE;

-- ============================================================
-- SHARES HYPERTABLE (TimescaleDB)
-- High-frequency time-series data — one row per submitted share
-- ============================================================

CREATE TABLE IF NOT EXISTS shares (
    time            TIMESTAMPTZ NOT NULL,
    btc_address     VARCHAR(62) NOT NULL,
    worker_name     VARCHAR(128) NOT NULL DEFAULT '',
    difficulty      DOUBLE PRECISION NOT NULL,
    share_diff      DOUBLE PRECISION NOT NULL,
    is_valid        BOOLEAN NOT NULL DEFAULT TRUE,
    is_block        BOOLEAN DEFAULT FALSE,
    ip_address      INET,
    nonce           VARCHAR(16),
    nonce2          VARCHAR(32),
    block_hash      VARCHAR(64),
    source          VARCHAR(16) DEFAULT 'hosted'
);

-- Convert to hypertable (1 day chunks)
SELECT create_hypertable('shares', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_shares_address ON shares(btc_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_shares_valid ON shares(is_valid, time DESC);

-- ============================================================
-- BLOCKS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS blocks (
    id              BIGSERIAL PRIMARY KEY,
    block_height    INTEGER NOT NULL,
    block_hash      VARCHAR(64) NOT NULL UNIQUE,
    prev_hash       VARCHAR(64),
    user_id         BIGINT REFERENCES users(id),
    worker_id       BIGINT REFERENCES workers(id),
    btc_address     VARCHAR(62),
    reward_btc      NUMERIC(16,8),
    fees_btc        NUMERIC(16,8),
    difficulty      DOUBLE PRECISION,
    confirmations   INTEGER DEFAULT 0,
    found_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed       BOOLEAN DEFAULT FALSE,
    coinbase_sig    VARCHAR(128),
    source          VARCHAR(16) DEFAULT 'hosted'
);

CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id);

-- ============================================================
-- WEEKLY BEST DIFFICULTY
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_best_diff (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id),
    btc_address     VARCHAR(62) NOT NULL,
    week_start      DATE NOT NULL,
    best_difficulty DOUBLE PRECISION NOT NULL,
    best_share_time TIMESTAMPTZ,
    total_shares    BIGINT DEFAULT 0,
    UNIQUE(btc_address, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_best_user ON weekly_best_diff(btc_address, week_start DESC);

-- ============================================================
-- MINING EVENTS TABLE (raw event log)
-- Used for debugging and event replay
-- ============================================================

CREATE TABLE IF NOT EXISTS mining_events (
    ts              TIMESTAMPTZ NOT NULL,
    event_type      TEXT NOT NULL,
    source          VARCHAR(16) DEFAULT 'hosted',
    payload         JSONB NOT NULL
);

SELECT create_hypertable('mining_events', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_events_type_ts ON mining_events(event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_user ON mining_events ((payload->>'user'));

-- ============================================================
-- TIMESCALEDB POLICIES
-- ============================================================

-- Compression policy for shares (after 7 days)
ALTER TABLE shares SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'btc_address',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('shares', INTERVAL '7 days', if_not_exists => TRUE);

-- Compression policy for mining_events (after 3 days)
ALTER TABLE mining_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'event_type',
    timescaledb.compress_orderby = 'ts DESC'
);
SELECT add_compression_policy('mining_events', INTERVAL '3 days', if_not_exists => TRUE);

-- Retention policy: drop raw shares after 90 days
SELECT add_retention_policy('shares', INTERVAL '90 days', if_not_exists => TRUE);

-- Retention policy: drop raw events after 30 days
SELECT add_retention_policy('mining_events', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================
-- CONTINUOUS AGGREGATES
-- ============================================================

-- Hourly share statistics per user
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_shares
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    btc_address,
    COUNT(*) AS total_shares,
    COUNT(*) FILTER (WHERE is_valid) AS accepted_shares,
    COUNT(*) FILTER (WHERE NOT is_valid) AS rejected_shares,
    MAX(share_diff) AS best_diff,
    AVG(share_diff) AS avg_diff
FROM shares
GROUP BY bucket, btc_address
WITH NO DATA;

SELECT add_continuous_aggregate_policy('hourly_shares',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Daily share statistics per user
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_shares
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    btc_address,
    COUNT(*) AS total_shares,
    COUNT(*) FILTER (WHERE is_valid) AS accepted_shares,
    MAX(share_diff) AS best_diff
FROM shares
GROUP BY bucket, btc_address
WITH NO DATA;

SELECT add_continuous_aggregate_policy('daily_shares',
    start_offset    => INTERVAL '2 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- ============================================================
-- SCHEMA MIGRATIONS TRACKING (Phase 5)
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    applied_at  TIMESTAMPTZ DEFAULT NOW(),
    checksum    VARCHAR(64)
);

INSERT INTO schema_migrations (version, name)
VALUES (1, 'initial_schema')
ON CONFLICT DO NOTHING;

-- ============================================================
-- RATE LIMIT EVENTS (Phase 5 — security auditing)
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_events (
    ts              TIMESTAMPTZ NOT NULL,
    ip_address      INET NOT NULL,
    event_type      VARCHAR(32) NOT NULL,  -- 'connect_rejected', 'submit_limited', 'softban'
    details         JSONB,
    region          VARCHAR(8) DEFAULT 'eu'
);

SELECT create_hypertable('rate_limit_events', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_ratelimit_ip ON rate_limit_events(ip_address, ts DESC);

-- Retention: drop rate limit events after 14 days
SELECT add_retention_policy('rate_limit_events', INTERVAL '14 days', if_not_exists => TRUE);

-- ============================================================
-- SEED DATA (for development)
-- ============================================================

-- Insert a default test user so shares can reference it
INSERT INTO users (btc_address, display_name, country_code)
VALUES ('bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls', 'Dev Miner', 'PT')
ON CONFLICT (btc_address) DO NOTHING;
