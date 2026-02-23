#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — TimescaleDB Restore Script
# =============================================================================
# Restores the thebitcoingame database from a pg_dump custom-format backup.
# DESTRUCTIVE: Drops and recreates the target database.
#
# Usage:
#   ./restore_timescaledb.sh <backup_file> [--confirm] [--container NAME]
#
# Safety:
#   Without --confirm, shows a preview of what will be restored and exits.
#   With --confirm, actually performs the restore.
#
# Exit codes:
#   0 — restore completed and verified successfully
#   1 — restore failed or validation error
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
CONTAINER_NAME="${CONTAINER_NAME:-tbg-timescaledb}"
DB_NAME="${DB_NAME:-thebitcoingame}"
DB_USER="${DB_USER:-tbg}"
CONFIRM=false
BACKUP_FILE=""

# Expected tables for post-restore verification
EXPECTED_TABLES=(
    "users"
    "workers"
    "shares"
    "blocks"
    "weekly_best_diff"
    "mining_events"
)

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]  $*"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]  $*" >&2; }
err()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --confirm)
            CONFIRM=true
            shift
            ;;
        --container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --db)
            DB_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 <backup_file> [--confirm] [--container NAME] [--db NAME]"
            echo ""
            echo "Arguments:"
            echo "  backup_file    Path to the .dump.gz backup file"
            echo ""
            echo "Options:"
            echo "  --confirm      Actually perform the restore (DESTRUCTIVE)"
            echo "  --container    Docker container name (default: tbg-timescaledb)"
            echo "  --db           Database name (default: thebitcoingame)"
            echo ""
            echo "Without --confirm, shows a preview of the backup contents."
            exit 0
            ;;
        -*)
            err "Unknown option: $1"
            exit 1
            ;;
        *)
            if [[ -z "${BACKUP_FILE}" ]]; then
                BACKUP_FILE="$1"
            else
                err "Unexpected argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Validate inputs
# ---------------------------------------------------------------------------
if [[ -z "${BACKUP_FILE}" ]]; then
    err "Backup file path is required"
    echo "Usage: $0 <backup_file> [--confirm]" >&2
    exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
    err "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Check file is a valid gzip
if ! file "${BACKUP_FILE}" | grep -qi 'gzip'; then
    err "File does not appear to be gzip compressed: ${BACKUP_FILE}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Preview mode: show backup contents
# ---------------------------------------------------------------------------
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
BACKUP_DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${BACKUP_FILE}" 2>/dev/null \
    || stat -c "%y" "${BACKUP_FILE}" 2>/dev/null \
    || echo "unknown")

echo "============================================================"
echo "  TimescaleDB Restore Preview"
echo "============================================================"
echo ""
echo "  Backup file : ${BACKUP_FILE}"
echo "  File size   : ${BACKUP_SIZE}"
echo "  File date   : ${BACKUP_DATE}"
echo "  Target DB   : ${DB_NAME}"
echo "  Container   : ${CONTAINER_NAME}"
echo ""

# Extract table list from backup
log "Inspecting backup contents..."
TEMP_DUMP=$(mktemp)
trap 'rm -f "${TEMP_DUMP}"' EXIT

gunzip -c "${BACKUP_FILE}" > "${TEMP_DUMP}"

echo "  Tables found in backup:"
pg_restore --list "${TEMP_DUMP}" 2>/dev/null \
    | grep -E "^[0-9]+;.*TABLE " \
    | awk '{for(i=4;i<=NF;i++) printf "%s ", $i; print ""}' \
    | sed 's/^ */    - /' \
    || echo "    (could not parse table list)"

echo ""

# Count items in the backup TOC
TOC_COUNT=$(pg_restore --list "${TEMP_DUMP}" 2>/dev/null | grep -c "^[0-9]" || echo "0")
echo "  Total objects in backup: ${TOC_COUNT}"
echo ""

if [[ "${CONFIRM}" != true ]]; then
    echo "============================================================"
    echo "  DRY RUN — No changes made."
    echo "  To restore, run again with --confirm flag:"
    echo ""
    echo "    $0 ${BACKUP_FILE} --confirm"
    echo "============================================================"
    exit 0
fi

# ---------------------------------------------------------------------------
# Confirm restore (destructive operation)
# ---------------------------------------------------------------------------
echo "============================================================"
echo "  WARNING: This will DROP and recreate '${DB_NAME}'"
echo "  All existing data will be permanently lost!"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# Perform restore
# ---------------------------------------------------------------------------
log "Starting database restore..."

# Step 1: Terminate all existing connections to the target database
log "Terminating existing connections to '${DB_NAME}'..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || true

# Step 2: Drop and recreate the database
log "Dropping database '${DB_NAME}'..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c \
    "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null

log "Creating fresh database '${DB_NAME}'..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null

# Step 3: Enable TimescaleDB extension before restore
log "Enabling TimescaleDB extension..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -c \
    "CREATE EXTENSION IF NOT EXISTS timescaledb;" >/dev/null

# Step 4: Run timescaledb pre-restore (disables background workers during restore)
log "Running TimescaleDB pre-restore hooks..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -c \
    "SELECT timescaledb_pre_restore();" >/dev/null 2>&1 || true

# Step 5: Restore from backup
log "Restoring from backup (this may take a while)..."
cat "${TEMP_DUMP}" \
    | docker exec -i "${CONTAINER_NAME}" \
        pg_restore \
            -U "${DB_USER}" \
            -d "${DB_NAME}" \
            --no-owner \
            --no-privileges \
            --verbose \
            --exit-on-error \
    2>&1 | while IFS= read -r line; do
        log "  pg_restore: ${line}"
    done

RESTORE_EXIT=${PIPESTATUS[1]:-0}

# Step 6: Run timescaledb post-restore (re-enables background workers)
log "Running TimescaleDB post-restore hooks..."
docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -c \
    "SELECT timescaledb_post_restore();" >/dev/null 2>&1 || true

if [[ "${RESTORE_EXIT}" -ne 0 ]]; then
    err "pg_restore exited with code ${RESTORE_EXIT}"
    exit 1
fi

# ---------------------------------------------------------------------------
# Post-restore verification
# ---------------------------------------------------------------------------
log "Verifying restore..."
echo ""
echo "  Table verification:"

VERIFY_FAILED=false
for table in "${EXPECTED_TABLES[@]}"; do
    ROW_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" \
        -t -A -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "MISSING")

    if [[ "${ROW_COUNT}" == "MISSING" ]]; then
        echo "    [FAIL] ${table} — table not found"
        VERIFY_FAILED=true
    else
        echo "    [OK]   ${table} — ${ROW_COUNT} rows"
    fi
done

echo ""

# Check hypertables
HYPERTABLE_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" \
    -t -A -c "SELECT COUNT(*) FROM timescaledb_information.hypertables;" 2>/dev/null || echo "0")
echo "  Hypertables: ${HYPERTABLE_COUNT}"

# Check continuous aggregates
CAGG_COUNT=$(docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" \
    -t -A -c "SELECT COUNT(*) FROM timescaledb_information.continuous_aggregates;" 2>/dev/null || echo "0")
echo "  Continuous aggregates: ${CAGG_COUNT}"

echo ""

if [[ "${VERIFY_FAILED}" == true ]]; then
    err "Restore verification FAILED — some tables are missing"
    exit 1
fi

log "Restore completed and verified successfully"
exit 0
