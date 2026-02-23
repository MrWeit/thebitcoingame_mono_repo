#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — TimescaleDB Backup Script
# =============================================================================
# Creates timestamped pg_dump backups of the thebitcoingame database.
# Supports --full (pg_dump custom format) and --wal (pgBackRest, if configured).
# Manages retention: keeps last 7 daily backups + 4 weekly backups.
#
# Usage:
#   ./backup_timescaledb.sh [--full|--wal] [--backup-dir /path/to/dir]
#
# Exit codes:
#   0 — backup completed successfully
#   1 — backup failed
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/backups/timescaledb}"
CONTAINER_NAME="${CONTAINER_NAME:-tbg-timescaledb}"
DB_NAME="${DB_NAME:-thebitcoingame}"
DB_USER="${DB_USER:-tbg}"
BACKUP_MODE="full"
DAILY_RETENTION=7
WEEKLY_RETENTION=4
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DAY_OF_WEEK="$(date +%u)"  # 1=Monday, 7=Sunday

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
        --full)
            BACKUP_MODE="full"
            shift
            ;;
        --wal)
            BACKUP_MODE="wal"
            shift
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--full|--wal] [--backup-dir DIR] [--container NAME]"
            echo ""
            echo "Options:"
            echo "  --full         pg_dump custom format backup (default)"
            echo "  --wal          pgBackRest WAL-based backup (requires pgBackRest configured)"
            echo "  --backup-dir   Directory to store backups (default: /backups/timescaledb)"
            echo "  --container    Docker container name (default: tbg-timescaledb)"
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
log "Starting TimescaleDB backup (mode=${BACKUP_MODE})"

# Ensure backup directories exist
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"

# Verify the container is running
if ! docker inspect --format='{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true; then
    err "Container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# Verify database connectivity
if ! docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" -q; then
    err "Database '${DB_NAME}' is not accepting connections"
    exit 1
fi

log "Container '${CONTAINER_NAME}' is healthy, database '${DB_NAME}' is ready"

# ---------------------------------------------------------------------------
# Perform backup
# ---------------------------------------------------------------------------
BACKUP_FILE="daily/${DB_NAME}_${TIMESTAMP}.dump.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

case "${BACKUP_MODE}" in
    full)
        log "Running pg_dump (custom format) with gzip compression..."

        # Use pg_dump custom format piped through gzip for optimal compression.
        # --no-owner and --no-privileges make restore more portable across environments.
        # TimescaleDB pre-restore/post-restore hooks are handled by timescaledb-backup if needed,
        # but pg_dump custom format captures all necessary schema + data.
        docker exec "${CONTAINER_NAME}" \
            pg_dump \
                -U "${DB_USER}" \
                -d "${DB_NAME}" \
                --format=custom \
                --compress=0 \
                --no-owner \
                --no-privileges \
                --verbose \
            2>/dev/null \
        | gzip -9 > "${BACKUP_PATH}"

        if [[ ! -s "${BACKUP_PATH}" ]]; then
            err "Backup file is empty or was not created: ${BACKUP_PATH}"
            rm -f "${BACKUP_PATH}"
            exit 1
        fi

        BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
        log "pg_dump backup completed: ${BACKUP_PATH} (${BACKUP_SIZE})"
        ;;

    wal)
        log "Running pgBackRest backup..."

        # pgBackRest must be configured inside the container with a stanza
        # pointing to /backups/timescaledb. This mode assumes pgBackRest is
        # installed and the stanza has been created via `pgbackrest stanza-create`.
        if ! docker exec "${CONTAINER_NAME}" which pgbackrest &>/dev/null; then
            err "pgBackRest is not installed in container '${CONTAINER_NAME}'"
            err "Install pgBackRest or use --full mode instead"
            exit 1
        fi

        docker exec "${CONTAINER_NAME}" \
            pgbackrest \
                --stanza="${DB_NAME}" \
                --type=incr \
                --log-level-console=info \
                backup

        log "pgBackRest incremental backup completed"

        # For WAL mode, we still create a marker file so retention logic can track it
        touch "${BACKUP_PATH%.dump.gz}.wal-marker"
        ;;
esac

# ---------------------------------------------------------------------------
# Weekly backup promotion
# ---------------------------------------------------------------------------
# On Sundays (day 7), copy the daily backup to the weekly directory
if [[ "${DAY_OF_WEEK}" == "7" ]]; then
    WEEKLY_FILE="weekly/${DB_NAME}_weekly_${TIMESTAMP}.dump.gz"
    WEEKLY_PATH="${BACKUP_DIR}/${WEEKLY_FILE}"
    cp "${BACKUP_PATH}" "${WEEKLY_PATH}"
    log "Promoted daily backup to weekly: ${WEEKLY_FILE}"
fi

# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------
log "Applying retention policy: ${DAILY_RETENTION} daily, ${WEEKLY_RETENTION} weekly"

# Clean up daily backups beyond retention (keep newest N)
DAILY_COUNT=$(find "${BACKUP_DIR}/daily" -name "*.dump.gz" -o -name "*.wal-marker" | wc -l | tr -d ' ')
if [[ "${DAILY_COUNT}" -gt "${DAILY_RETENTION}" ]]; then
    REMOVE_COUNT=$((DAILY_COUNT - DAILY_RETENTION))
    log "Removing ${REMOVE_COUNT} old daily backup(s)..."
    find "${BACKUP_DIR}/daily" \( -name "*.dump.gz" -o -name "*.wal-marker" \) -print0 \
        | xargs -0 ls -t \
        | tail -n "${REMOVE_COUNT}" \
        | xargs rm -f
fi

# Clean up weekly backups beyond retention
WEEKLY_COUNT=$(find "${BACKUP_DIR}/weekly" -name "*.dump.gz" 2>/dev/null | wc -l | tr -d ' ')
if [[ "${WEEKLY_COUNT}" -gt "${WEEKLY_RETENTION}" ]]; then
    REMOVE_COUNT=$((WEEKLY_COUNT - WEEKLY_RETENTION))
    log "Removing ${REMOVE_COUNT} old weekly backup(s)..."
    find "${BACKUP_DIR}/weekly" -name "*.dump.gz" -print0 \
        | xargs -0 ls -t \
        | tail -n "${REMOVE_COUNT}" \
        | xargs rm -f
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
REMAINING_DAILY=$(find "${BACKUP_DIR}/daily" -name "*.dump.gz" -o -name "*.wal-marker" | wc -l | tr -d ' ')
REMAINING_WEEKLY=$(find "${BACKUP_DIR}/weekly" -name "*.dump.gz" 2>/dev/null | wc -l | tr -d ' ')

log "Backup complete. Retained: ${REMAINING_DAILY} daily, ${REMAINING_WEEKLY} weekly"
log "Latest backup: ${BACKUP_PATH}"

exit 0
