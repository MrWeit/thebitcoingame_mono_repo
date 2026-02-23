#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Redis Backup Script
# =============================================================================
# Triggers a BGSAVE on the Redis container, waits for completion, then copies
# the dump.rdb file to a timestamped backup location.
#
# Usage:
#   ./backup_redis.sh [--backup-dir /path/to/dir] [--container NAME]
#
# Retention: keeps last 14 backups by default.
#
# Exit codes:
#   0 — backup completed successfully
#   1 — backup failed
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/backups/redis}"
CONTAINER_NAME="${CONTAINER_NAME:-tbg-redis}"
RETENTION_COUNT=14
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BGSAVE_TIMEOUT=120  # seconds to wait for BGSAVE to complete

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
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --retention)
            RETENTION_COUNT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--backup-dir DIR] [--container NAME] [--retention N]"
            echo ""
            echo "Options:"
            echo "  --backup-dir   Directory to store backups (default: /backups/redis)"
            echo "  --container    Docker container name (default: tbg-redis)"
            echo "  --retention    Number of backups to retain (default: 14)"
            exit 0
            ;;
        *)
            err "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "Starting Redis backup"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Verify the container is running
if ! docker inspect --format='{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true; then
    err "Container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# Verify Redis is responsive
if ! docker exec "${CONTAINER_NAME}" redis-cli ping | grep -q PONG; then
    err "Redis is not responding to PING"
    exit 1
fi

log "Redis container '${CONTAINER_NAME}' is healthy"

# ---------------------------------------------------------------------------
# Step 1: Record the current LASTSAVE timestamp
# ---------------------------------------------------------------------------
LASTSAVE_BEFORE=$(docker exec "${CONTAINER_NAME}" redis-cli LASTSAVE | tr -d '(integer) ')
log "Current LASTSAVE timestamp: ${LASTSAVE_BEFORE}"

# ---------------------------------------------------------------------------
# Step 2: Trigger BGSAVE
# ---------------------------------------------------------------------------
log "Triggering BGSAVE..."
BGSAVE_RESULT=$(docker exec "${CONTAINER_NAME}" redis-cli BGSAVE 2>&1)

if echo "${BGSAVE_RESULT}" | grep -qi "error"; then
    # Check if a save is already in progress
    if echo "${BGSAVE_RESULT}" | grep -qi "already in progress"; then
        log "A background save is already in progress, waiting for it..."
    else
        err "BGSAVE failed: ${BGSAVE_RESULT}"
        exit 1
    fi
else
    log "BGSAVE initiated: ${BGSAVE_RESULT}"
fi

# ---------------------------------------------------------------------------
# Step 3: Wait for BGSAVE to complete
# ---------------------------------------------------------------------------
log "Waiting for BGSAVE to complete (timeout: ${BGSAVE_TIMEOUT}s)..."

ELAPSED=0
WAIT_INTERVAL=2

while [[ ${ELAPSED} -lt ${BGSAVE_TIMEOUT} ]]; do
    LASTSAVE_CURRENT=$(docker exec "${CONTAINER_NAME}" redis-cli LASTSAVE | tr -d '(integer) ')

    if [[ "${LASTSAVE_CURRENT}" != "${LASTSAVE_BEFORE}" ]]; then
        log "BGSAVE completed (new LASTSAVE: ${LASTSAVE_CURRENT})"
        break
    fi

    # Also check if a save is still in progress via INFO persistence
    BG_STATUS=$(docker exec "${CONTAINER_NAME}" redis-cli INFO persistence 2>/dev/null \
        | grep "rdb_bgsave_in_progress" \
        | cut -d: -f2 \
        | tr -d '[:space:]')

    if [[ "${BG_STATUS}" == "0" && "${LASTSAVE_CURRENT}" != "${LASTSAVE_BEFORE}" ]]; then
        log "BGSAVE completed"
        break
    fi

    sleep "${WAIT_INTERVAL}"
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

if [[ ${ELAPSED} -ge ${BGSAVE_TIMEOUT} ]]; then
    err "BGSAVE did not complete within ${BGSAVE_TIMEOUT} seconds"
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Copy dump.rdb from the container
# ---------------------------------------------------------------------------
BACKUP_FILE="${BACKUP_DIR}/redis_dump_${TIMESTAMP}.rdb"

log "Copying dump.rdb from container..."

# Redis in the alpine image stores data in /data/dump.rdb
docker cp "${CONTAINER_NAME}:/data/dump.rdb" "${BACKUP_FILE}"

if [[ ! -s "${BACKUP_FILE}" ]]; then
    err "Backup file is empty or was not copied: ${BACKUP_FILE}"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
log "Redis backup saved: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# Step 5: Verify the backup is a valid RDB file
# ---------------------------------------------------------------------------
# Redis RDB files start with the magic string "REDIS"
if ! head -c 5 "${BACKUP_FILE}" | grep -q "REDIS"; then
    warn "Backup file does not start with REDIS magic header — may be corrupt"
fi

# ---------------------------------------------------------------------------
# Step 6: Retention cleanup
# ---------------------------------------------------------------------------
log "Applying retention policy: keeping last ${RETENTION_COUNT} backups"

BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "redis_dump_*.rdb" | wc -l | tr -d ' ')

if [[ "${BACKUP_COUNT}" -gt "${RETENTION_COUNT}" ]]; then
    REMOVE_COUNT=$((BACKUP_COUNT - RETENTION_COUNT))
    log "Removing ${REMOVE_COUNT} old backup(s)..."
    find "${BACKUP_DIR}" -name "redis_dump_*.rdb" -print0 \
        | xargs -0 ls -t \
        | tail -n "${REMOVE_COUNT}" \
        | xargs rm -f
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
REMAINING=$(find "${BACKUP_DIR}" -name "redis_dump_*.rdb" | wc -l | tr -d ' ')
log "Backup complete. ${REMAINING} backup(s) retained in ${BACKUP_DIR}"

exit 0
