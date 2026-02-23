#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Cron Backup Wrapper
# =============================================================================
# Orchestrates all backup operations in sequence:
#   1. TimescaleDB backup (pg_dump)
#   2. Redis backup (BGSAVE + copy)
#   3. Backup verification (on TimescaleDB backup)
#
# Designed for crontab:
#   0 2 * * * /path/to/cron_backup.sh >> /var/log/tbg-backup.log 2>&1
#
# On failure, writes errors to stderr (captured by Docker/cron logging) and
# optionally sends alerts via a webhook URL if ALERT_WEBHOOK_URL is set.
#
# Exit codes:
#   0 — all backups completed and verified successfully
#   1 — one or more backups failed
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR_TSDB="${BACKUP_DIR_TSDB:-/backups/timescaledb}"
BACKUP_DIR_REDIS="${BACKUP_DIR_REDIS:-/backups/redis}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"  # Optional: Slack/Discord webhook
LOCK_FILE="/tmp/tbg-backup.lock"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CRON]  [INFO]  $*"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CRON]  [WARN]  $*" >&2; }
err()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [CRON]  [ERROR] $*" >&2; }

# ---------------------------------------------------------------------------
# Prevent concurrent runs
# ---------------------------------------------------------------------------
if [[ -f "${LOCK_FILE}" ]]; then
    LOCK_PID=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
    if [[ -n "${LOCK_PID}" ]] && kill -0 "${LOCK_PID}" 2>/dev/null; then
        err "Another backup is already running (PID ${LOCK_PID}). Exiting."
        exit 1
    else
        warn "Stale lock file found. Removing and proceeding."
        rm -f "${LOCK_FILE}"
    fi
fi

echo $$ > "${LOCK_FILE}"
trap 'rm -f "${LOCK_FILE}"' EXIT

# ---------------------------------------------------------------------------
# Alert helper
# ---------------------------------------------------------------------------
send_alert() {
    local message="$1"
    local severity="${2:-error}"

    # Always log to stderr for Docker/syslog capture
    err "BACKUP ALERT [${severity}]: ${message}"

    # Send webhook if configured
    if [[ -n "${ALERT_WEBHOOK_URL}" ]]; then
        local payload
        payload=$(cat <<PAYLOAD
{
    "text": "[TheBitcoinGame Backup] [${severity}] ${message}",
    "username": "TBG Backup Bot",
    "icon_emoji": ":floppy_disk:"
}
PAYLOAD
)
        curl -s -X POST \
            -H "Content-Type: application/json" \
            -d "${payload}" \
            "${ALERT_WEBHOOK_URL}" >/dev/null 2>&1 || true
    fi
}

# ---------------------------------------------------------------------------
# Track overall status
# ---------------------------------------------------------------------------
OVERALL_STATUS=0
BACKUP_START=$(date +%s)

log "=========================================="
log "TheBitcoinGame Backup — Starting"
log "=========================================="

# ---------------------------------------------------------------------------
# Step 1: TimescaleDB Backup
# ---------------------------------------------------------------------------
log "Step 1/3: TimescaleDB backup..."
TSDB_START=$(date +%s)

if "${SCRIPT_DIR}/backup_timescaledb.sh" --backup-dir "${BACKUP_DIR_TSDB}"; then
    TSDB_END=$(date +%s)
    TSDB_DURATION=$((TSDB_END - TSDB_START))
    log "Step 1/3: TimescaleDB backup completed in ${TSDB_DURATION}s"
else
    TSDB_EXIT=$?
    TSDB_END=$(date +%s)
    TSDB_DURATION=$((TSDB_END - TSDB_START))
    err "Step 1/3: TimescaleDB backup FAILED (exit ${TSDB_EXIT}) after ${TSDB_DURATION}s"
    send_alert "TimescaleDB backup failed (exit code ${TSDB_EXIT})"
    OVERALL_STATUS=1
fi

# ---------------------------------------------------------------------------
# Step 2: Redis Backup
# ---------------------------------------------------------------------------
log "Step 2/3: Redis backup..."
REDIS_START=$(date +%s)

if "${SCRIPT_DIR}/backup_redis.sh" --backup-dir "${BACKUP_DIR_REDIS}"; then
    REDIS_END=$(date +%s)
    REDIS_DURATION=$((REDIS_END - REDIS_START))
    log "Step 2/3: Redis backup completed in ${REDIS_DURATION}s"
else
    REDIS_EXIT=$?
    REDIS_END=$(date +%s)
    REDIS_DURATION=$((REDIS_END - REDIS_START))
    err "Step 2/3: Redis backup FAILED (exit ${REDIS_EXIT}) after ${REDIS_DURATION}s"
    send_alert "Redis backup failed (exit code ${REDIS_EXIT})"
    OVERALL_STATUS=1
fi

# ---------------------------------------------------------------------------
# Step 3: Verify TimescaleDB Backup
# ---------------------------------------------------------------------------
log "Step 3/3: Verifying TimescaleDB backup..."

# Find the most recent TimescaleDB backup
LATEST_TSDB_BACKUP=$(find "${BACKUP_DIR_TSDB}/daily" -name "*.dump.gz" -type f 2>/dev/null \
    | sort -r \
    | head -n 1)

if [[ -z "${LATEST_TSDB_BACKUP}" ]]; then
    err "Step 3/3: No TimescaleDB backup found to verify"
    if [[ ${OVERALL_STATUS} -eq 0 ]]; then
        send_alert "No TimescaleDB backup file found for verification"
    fi
    OVERALL_STATUS=1
else
    VERIFY_START=$(date +%s)

    if "${SCRIPT_DIR}/verify_backup.sh" "${LATEST_TSDB_BACKUP}"; then
        VERIFY_END=$(date +%s)
        VERIFY_DURATION=$((VERIFY_END - VERIFY_START))
        log "Step 3/3: Backup verification passed in ${VERIFY_DURATION}s"
    else
        VERIFY_EXIT=$?
        VERIFY_END=$(date +%s)
        VERIFY_DURATION=$((VERIFY_END - VERIFY_START))
        err "Step 3/3: Backup verification FAILED (exit ${VERIFY_EXIT}) after ${VERIFY_DURATION}s"
        send_alert "TimescaleDB backup verification failed for ${LATEST_TSDB_BACKUP}"
        OVERALL_STATUS=1
    fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
BACKUP_END=$(date +%s)
TOTAL_DURATION=$((BACKUP_END - BACKUP_START))

log "=========================================="
if [[ ${OVERALL_STATUS} -eq 0 ]]; then
    log "Backup completed SUCCESSFULLY in ${TOTAL_DURATION}s"

    # Report disk usage
    if [[ -d "${BACKUP_DIR_TSDB}" ]]; then
        TSDB_USAGE=$(du -sh "${BACKUP_DIR_TSDB}" 2>/dev/null | cut -f1)
        log "  TimescaleDB backup storage: ${TSDB_USAGE}"
    fi
    if [[ -d "${BACKUP_DIR_REDIS}" ]]; then
        REDIS_USAGE=$(du -sh "${BACKUP_DIR_REDIS}" 2>/dev/null | cut -f1)
        log "  Redis backup storage: ${REDIS_USAGE}"
    fi
else
    err "Backup completed with ERRORS in ${TOTAL_DURATION}s"
    send_alert "Backup run completed with failures (total: ${TOTAL_DURATION}s)" "warning"
fi
log "=========================================="

exit ${OVERALL_STATUS}
