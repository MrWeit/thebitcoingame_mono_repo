# Runbook: Database Maintenance

**Service:** TimescaleDB (PostgreSQL 16 + TimescaleDB Extensions)
**Container:** tbg-timescaledb
**Database:** thebitcoingame
**Trigger:** Slow queries, high disk usage, degraded dashboard performance
**Severity:** MEDIUM
**Estimated Time:** 15-60 minutes

---

## When to Use This Runbook

- Grafana dashboards loading slowly (> 5 second query times)
- Disk usage alert fires (> 70% of volume capacity)
- Event collector logs show slow INSERT times
- Periodic maintenance schedule (weekly/monthly)
- After major schema changes or data imports

---

## Pre-Checks

### 1. Database Health

```bash
# Is the database accepting connections?
docker exec tbg-timescaledb pg_isready -U tbg -d thebitcoingame

# Check active connections
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT count(*) as total_connections,
         count(*) FILTER (WHERE state = 'active') as active,
         count(*) FILTER (WHERE state = 'idle') as idle,
         count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_txn
  FROM pg_stat_activity
  WHERE datname = 'thebitcoingame';
"

# Check for long-running queries
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, state, query
  FROM pg_stat_activity
  WHERE datname = 'thebitcoingame'
    AND state != 'idle'
    AND query_start < now() - interval '1 minute'
  ORDER BY duration DESC;
"
```

### 2. Disk Usage

```bash
# Overall disk usage
docker exec tbg-timescaledb df -h /var/lib/postgresql/data

# Database size
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pg_size_pretty(pg_database_size('thebitcoingame')) as database_size;
"
```

---

## Monitoring Queries

### Table Sizes

```sql
-- All tables sorted by size
SELECT
  schemaname || '.' || tablename AS table,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS data_size,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename) -
                 pg_relation_size(schemaname || '.' || tablename)) AS index_size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema', '_timescaledb_catalog', '_timescaledb_internal', '_timescaledb_config')
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

Run via:
```bash
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "<QUERY>"
```

### TimescaleDB Hypertable Info

```sql
-- Hypertable sizes and chunk info
SELECT
  hypertable_name,
  pg_size_pretty(hypertable_size(format('%I.%I', hypertable_schema, hypertable_name)::regclass)) AS total_size,
  num_chunks,
  pg_size_pretty(
    hypertable_size(format('%I.%I', hypertable_schema, hypertable_name)::regclass) /
    GREATEST(num_chunks, 1)
  ) AS avg_chunk_size
FROM timescaledb_information.hypertables;
```

### Chunk Details

```sql
-- List chunks for a hypertable (e.g., mining_events)
SELECT
  chunk_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', chunk_schema, chunk_name)::regclass)) AS size,
  range_start,
  range_end,
  is_compressed
FROM timescaledb_information.chunks
WHERE hypertable_name = 'mining_events'
ORDER BY range_start DESC
LIMIT 20;
```

### Slow Query Analysis

```sql
-- Top 10 slowest queries (requires pg_stat_statements extension)
SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS avg_ms,
  round(max_exec_time::numeric, 2) AS max_ms,
  rows,
  left(query, 100) AS query_preview
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'thebitcoingame')
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Maintenance Procedures

### Manual VACUUM

VACUUM reclaims space from dead tuples and updates statistics. Run when:
- Table bloat is detected (large difference between pg_relation_size and actual data)
- After large DELETE operations

```bash
# Standard VACUUM (non-blocking, safe during production)
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  VACUUM (VERBOSE) mining_events;
"

# VACUUM ANALYZE (also updates query planner statistics)
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  VACUUM (VERBOSE, ANALYZE) mining_events;
"

# Full VACUUM (rewrites table, requires exclusive lock — schedule during maintenance window)
# WARNING: This blocks all reads and writes on the table
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  VACUUM (FULL, VERBOSE) mining_events;
"
```

### Reindex

Reindex when:
- Index bloat detected
- After VACUUM FULL
- Query performance degraded on indexed columns

```bash
# Reindex a specific table
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  REINDEX TABLE mining_events;
"

# Reindex entire database (maintenance window recommended)
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  REINDEX DATABASE thebitcoingame;
"

# Concurrent reindex (PostgreSQL 12+, non-blocking)
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  REINDEX TABLE CONCURRENTLY mining_events;
"
```

### TimescaleDB Compression

Enable compression on older chunks to reduce disk usage.

```sql
-- Enable compression on a hypertable (one-time setup)
ALTER TABLE mining_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'event_type',
  timescaledb.compress_orderby = 'received_at DESC'
);

-- Add a compression policy (compress chunks older than 7 days)
SELECT add_compression_policy('mining_events', INTERVAL '7 days');

-- Manually compress a specific chunk
SELECT compress_chunk('<chunk_name>');

-- Check compression status
SELECT
  chunk_name,
  is_compressed,
  pg_size_pretty(before_compression_total_bytes) AS before,
  pg_size_pretty(after_compression_total_bytes) AS after,
  round((1 - after_compression_total_bytes::numeric / before_compression_total_bytes) * 100, 1) AS reduction_pct
FROM timescaledb_information.compressed_chunk_stats
WHERE hypertable_name = 'mining_events';
```

### Retention Policy

Add retention policies to automatically drop old data.

```sql
-- Drop chunks older than 90 days
SELECT add_retention_policy('mining_events', INTERVAL '90 days');

-- View existing policies
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention';

-- Remove a retention policy
SELECT remove_retention_policy('mining_events');

-- Manually drop old chunks
SELECT drop_chunks('mining_events', older_than => INTERVAL '90 days');
```

### Adding a New Retention Policy

When deciding on retention periods:

| Data Type | Suggested Retention | Rationale |
|-----------|-------------------|-----------|
| share_submitted events | 30 days | High volume, aggregated in Grafana |
| block_found events | Forever | Rare and valuable |
| miner_connected events | 7 days | Debugging only |
| difficulty_change events | 90 days | Useful for trend analysis |
| All events (compressed) | 90 days | Balance of storage vs. history |

---

## Emergency Procedures

### Kill Long-Running Query

```bash
# Find the PID of the problematic query
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pid, now() - query_start AS duration, query
  FROM pg_stat_activity
  WHERE state = 'active'
    AND query_start < now() - interval '5 minutes'
  ORDER BY duration DESC;
"

# Cancel the query gracefully
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pg_cancel_backend(<PID>);
"

# Force terminate if cancel doesn't work
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pg_terminate_backend(<PID>);
"
```

### Emergency Disk Space Recovery

```bash
# Quick wins for freeing space:

# 1. Drop old chunks
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT drop_chunks('mining_events', older_than => INTERVAL '7 days');
"

# 2. Truncate WAL (if not using replication)
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pg_switch_wal();
  CHECKPOINT;
"

# 3. Clear pg_stat_statements
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT pg_stat_statements_reset();
"

# 4. Remove old PostgreSQL logs inside container
docker exec tbg-timescaledb sh -c "rm -f /var/lib/postgresql/data/log/postgresql-*.log"
```

---

## Scheduled Maintenance Calendar

| Task | Frequency | Procedure | Downtime |
|------|-----------|-----------|----------|
| VACUUM ANALYZE | Daily (auto) | Autovacuum handles this | None |
| Update statistics | Weekly | `ANALYZE mining_events;` | None |
| Check bloat | Weekly | Run monitoring queries above | None |
| Backup verification | Weekly | Run `test_backup_restore.sh` | None |
| Compression check | Weekly | Verify compression policy running | None |
| REINDEX CONCURRENTLY | Monthly | Reindex large tables | None |
| Review retention policies | Monthly | Adjust based on disk growth | None |
| VACUUM FULL | Quarterly | Schedule maintenance window | YES (minutes) |
| pg_dump backup test | Quarterly | Full restore to test environment | None |

---

## Related Runbooks

- [CKPool Restart](runbook-ckpool-restart.md) — if DB issues cause CKPool problems
- [Emergency Shutdown](runbook-emergency-shutdown.md) — for critical situations
- [Disaster Recovery](disaster-recovery.md) — for DB corruption/loss scenarios
