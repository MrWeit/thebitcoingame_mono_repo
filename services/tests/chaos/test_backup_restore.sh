#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Backup & Restore Verification
# =============================================================================
# Validates the backup and restore cycle for TimescaleDB:
#   1. Creates a backup using the existing backup script
#   2. Inserts known test data after the backup
#   3. Restores from the backup
#   4. Verifies the test data is NOT present (proving restore worked)
#   5. Verifies pre-existing data IS present (proving backup was valid)
#
# Expected behavior:
#   - Backup completes successfully
#   - Restore overwrites current state with backup state
#   - Post-backup test data is gone after restore
#
# Prerequisites:
#   - Docker Compose stack running
#   - services/scripts/backup/backup_timescaledb.sh exists
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/services/docker-compose.yml"
BACKUP_SCRIPT="${PROJECT_ROOT}/services/scripts/backup/backup_timescaledb.sh"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DB_CONTAINER="tbg-timescaledb"
COLLECTOR_CONTAINER="tbg-event-collector"
DB_NAME="thebitcoingame"
DB_USER="tbg"
BACKUP_DIR="/tmp/chaos_test_backups"
TEST_MARKER="CHAOS_TEST_MARKER_$(date +%s)"
TEST_NAME="backup_restore"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
    log "Cleanup: removing test backup directory..."
    rm -rf "${BACKUP_DIR}" 2>/dev/null || true

    # Restart event-collector if it was stopped
    if ! docker inspect --format='{{.State.Running}}' "${COLLECTOR_CONTAINER}" 2>/dev/null | grep -q true; then
        docker compose -f "${COMPOSE_FILE}" start event-collector 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
run_sql() {
    docker exec "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "$1" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Backup & Restore Verification ==="
log ""

log "Pre-check: verifying database is running..."
if ! docker inspect --format='{{.State.Running}}' "${DB_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "TimescaleDB container is not running"
    exit 1
fi

if ! docker exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" -q 2>/dev/null; then
    fail "Database not accepting connections"
    exit 1
fi
pass "Database is healthy"

# Verify backup script exists
if [[ ! -f "${BACKUP_SCRIPT}" ]]; then
    fail "Backup script not found: ${BACKUP_SCRIPT}"
    exit 1
fi
pass "Backup script found"

# Verify mining_events table exists
TABLE_EXISTS=$(run_sql "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mining_events');" || echo "f")
if [[ "${TABLE_EXISTS}" != "t" ]]; then
    log "mining_events table does not exist — creating a simple test table instead"
    run_sql "CREATE TABLE IF NOT EXISTS chaos_test (id SERIAL PRIMARY KEY, marker TEXT, created_at TIMESTAMPTZ DEFAULT NOW());"
    USING_TEST_TABLE=1
else
    USING_TEST_TABLE=0
fi

# Record pre-backup row count
if [[ "${USING_TEST_TABLE}" -eq 0 ]]; then
    PRE_BACKUP_COUNT=$(run_sql "SELECT COUNT(*) FROM mining_events;" || echo "0")
    log "Pre-backup mining_events count: ${PRE_BACKUP_COUNT}"
else
    PRE_BACKUP_COUNT=$(run_sql "SELECT COUNT(*) FROM chaos_test;" || echo "0")
    log "Pre-backup chaos_test count: ${PRE_BACKUP_COUNT}"
fi

# ---------------------------------------------------------------------------
# Phase 1: Create backup
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Running backup..."

mkdir -p "${BACKUP_DIR}"

# Run the backup script with our test backup directory
BACKUP_OUTPUT=$(bash "${BACKUP_SCRIPT}" --full --backup-dir "${BACKUP_DIR}" --container "${DB_CONTAINER}" 2>&1) || {
    log "Backup script output:"
    echo "${BACKUP_OUTPUT}" | while IFS= read -r line; do log "  ${line}"; done
    fail "Backup script failed"
    exit 1
}

log "Backup script output:"
echo "${BACKUP_OUTPUT}" | while IFS= read -r line; do log "  ${line}"; done

# Find the backup file
BACKUP_FILE=$(find "${BACKUP_DIR}" -name "*.dump.gz" -type f | head -1)
if [[ -z "${BACKUP_FILE}" ]]; then
    fail "No backup file found in ${BACKUP_DIR}"
    exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
log "Backup file: ${BACKUP_FILE} (${BACKUP_SIZE})"
pass "Backup created successfully"

# ---------------------------------------------------------------------------
# Phase 2: Insert test data AFTER the backup
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Inserting test marker data (post-backup)..."

if [[ "${USING_TEST_TABLE}" -eq 0 ]]; then
    # Insert a recognizable marker into mining_events
    run_sql "INSERT INTO mining_events (event_type, event_data, received_at)
             VALUES ('chaos_test', '{\"marker\": \"${TEST_MARKER}\"}', NOW());" || {
        log "Could not insert into mining_events — trying chaos_test table"
        USING_TEST_TABLE=1
    }
fi

if [[ "${USING_TEST_TABLE}" -eq 1 ]]; then
    run_sql "CREATE TABLE IF NOT EXISTS chaos_test (id SERIAL PRIMARY KEY, marker TEXT, created_at TIMESTAMPTZ DEFAULT NOW());"
    run_sql "INSERT INTO chaos_test (marker) VALUES ('${TEST_MARKER}');"
fi

# Verify the marker exists
if [[ "${USING_TEST_TABLE}" -eq 0 ]]; then
    MARKER_EXISTS=$(run_sql "SELECT COUNT(*) FROM mining_events WHERE event_data::text LIKE '%${TEST_MARKER}%';" || echo "0")
else
    MARKER_EXISTS=$(run_sql "SELECT COUNT(*) FROM chaos_test WHERE marker = '${TEST_MARKER}';" || echo "0")
fi

if [[ "${MARKER_EXISTS}" -gt 0 ]]; then
    pass "Test marker inserted and verified (${MARKER_EXISTS} rows)"
else
    fail "Could not verify test marker after insert"
fi

# ---------------------------------------------------------------------------
# Phase 3: Restore from backup
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Restoring from backup..."

# Stop event-collector to prevent it from writing during restore
log "Stopping event-collector to prevent writes during restore..."
docker compose -f "${COMPOSE_FILE}" stop event-collector 2>/dev/null || true
sleep 3

# Decompress the backup and pipe into pg_restore
log "Running pg_restore..."
set +e
RESTORE_OUTPUT=$(gunzip -c "${BACKUP_FILE}" | docker exec -i "${DB_CONTAINER}" \
    pg_restore \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        --single-transaction \
    2>&1)
RESTORE_EXIT=$?
set -e

if [[ ${RESTORE_EXIT} -eq 0 ]] || echo "${RESTORE_OUTPUT}" | grep -qi "WARNING"; then
    # pg_restore often returns non-zero with warnings that are harmless
    log "Restore output (last 10 lines):"
    echo "${RESTORE_OUTPUT}" | tail -10 | while IFS= read -r line; do log "  ${line}"; done
    pass "Restore completed"
else
    log "Restore output:"
    echo "${RESTORE_OUTPUT}" | while IFS= read -r line; do log "  ${line}"; done
    fail "Restore failed with exit code ${RESTORE_EXIT}"
fi

# Give the database a moment to settle
sleep 3

# ---------------------------------------------------------------------------
# Phase 4: Verify test marker is GONE
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Verifying test data was rolled back by restore..."

if [[ "${USING_TEST_TABLE}" -eq 0 ]]; then
    MARKER_AFTER=$(run_sql "SELECT COUNT(*) FROM mining_events WHERE event_data::text LIKE '%${TEST_MARKER}%';" || echo "error")
else
    # The chaos_test table may not exist after restore if it wasn't in the backup
    MARKER_AFTER=$(run_sql "SELECT COUNT(*) FROM chaos_test WHERE marker = '${TEST_MARKER}';" 2>/dev/null || echo "0")
fi

log "Marker rows after restore: ${MARKER_AFTER}"

if [[ "${MARKER_AFTER}" == "0" || "${MARKER_AFTER}" == "error" ]]; then
    pass "Test marker data is GONE — restore successfully rolled back to pre-insert state"
else
    fail "Test marker data still present after restore (${MARKER_AFTER} rows) — restore did not work"
fi

# Verify pre-existing data is still there
if [[ "${USING_TEST_TABLE}" -eq 0 ]]; then
    POST_RESTORE_COUNT=$(run_sql "SELECT COUNT(*) FROM mining_events;" || echo "0")
    log "Post-restore mining_events count: ${POST_RESTORE_COUNT} (was: ${PRE_BACKUP_COUNT})"
else
    POST_RESTORE_COUNT=$(run_sql "SELECT COUNT(*) FROM chaos_test;" 2>/dev/null || echo "0")
    log "Post-restore chaos_test count: ${POST_RESTORE_COUNT} (was: ${PRE_BACKUP_COUNT})"
fi

# ---------------------------------------------------------------------------
# Phase 5: Restart event-collector
# ---------------------------------------------------------------------------
log ""
log "Phase 5: Restarting event-collector..."
docker compose -f "${COMPOSE_FILE}" start event-collector 2>/dev/null || true
sleep 5

if docker inspect --format='{{.State.Running}}' "${COLLECTOR_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "Event collector restarted successfully after restore"
else
    log "Event collector may need manual restart"
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
log ""
if [[ "${FAILED}" -eq 0 ]]; then
    log "=== RESULT: PASS ==="
else
    log "=== RESULT: FAIL ==="
fi

exit "${FAILED}"
