#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Configuration Backup Script
# =============================================================================
# Backs up all configuration files into a single timestamped tar.gz archive:
#   - CKPool config files
#   - Docker Compose files
#   - Environment files (.env)
#   - Prometheus and Grafana configuration
#   - Alertmanager configuration
#   - NATS configuration
#
# Usage:
#   ./backup_config.sh [--backup-dir /path/to/dir] [--services-dir /path/to/services]
#
# Exit codes:
#   0 — backup completed successfully
#   1 — backup failed
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/backups/config}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RETENTION_COUNT=10

# Auto-detect the services directory relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="${SERVICES_DIR:-$(cd "${SCRIPT_DIR}/../../.." && pwd)/services}"

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
        --services-dir)
            SERVICES_DIR="$2"
            shift 2
            ;;
        --retention)
            RETENTION_COUNT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--backup-dir DIR] [--services-dir DIR] [--retention N]"
            echo ""
            echo "Options:"
            echo "  --backup-dir    Directory to store backup archives (default: /backups/config)"
            echo "  --services-dir  Path to the services directory (auto-detected by default)"
            echo "  --retention     Number of archives to retain (default: 10)"
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
log "Starting configuration backup"

if [[ ! -d "${SERVICES_DIR}" ]]; then
    err "Services directory not found: ${SERVICES_DIR}"
    exit 1
fi
log "Services directory: ${SERVICES_DIR}"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Create a temporary staging directory
STAGING_DIR=$(mktemp -d)
trap 'rm -rf "${STAGING_DIR}"' EXIT

log "Staging directory: ${STAGING_DIR}"

# ---------------------------------------------------------------------------
# Collect configuration files
# ---------------------------------------------------------------------------
FILES_COLLECTED=0

# --- CKPool configuration ---
CKPOOL_CONFIG_DIR="${SERVICES_DIR}/ckpool/config"
if [[ -d "${CKPOOL_CONFIG_DIR}" ]]; then
    log "Collecting CKPool config files..."
    mkdir -p "${STAGING_DIR}/ckpool/config"
    cp -a "${CKPOOL_CONFIG_DIR}/"* "${STAGING_DIR}/ckpool/config/" 2>/dev/null || true
    COUNT=$(find "${STAGING_DIR}/ckpool/config" -type f | wc -l | tr -d ' ')
    FILES_COLLECTED=$((FILES_COLLECTED + COUNT))
    log "  Collected ${COUNT} CKPool config file(s)"
else
    warn "CKPool config directory not found: ${CKPOOL_CONFIG_DIR}"
fi

# --- Docker Compose files ---
log "Collecting Docker Compose files..."
mkdir -p "${STAGING_DIR}/docker"
for compose_file in "${SERVICES_DIR}"/docker-compose*.yml; do
    if [[ -f "${compose_file}" ]]; then
        cp "${compose_file}" "${STAGING_DIR}/docker/"
        FILES_COLLECTED=$((FILES_COLLECTED + 1))
    fi
done
COMPOSE_COUNT=$(find "${STAGING_DIR}/docker" -name "docker-compose*.yml" -type f 2>/dev/null | wc -l | tr -d ' ')
log "  Collected ${COMPOSE_COUNT} Docker Compose file(s)"

# --- Environment files ---
log "Collecting environment files..."
mkdir -p "${STAGING_DIR}/env"
ENV_COUNT=0
# Check services root
for env_file in "${SERVICES_DIR}"/.env "${SERVICES_DIR}"/.env.*; do
    if [[ -f "${env_file}" ]]; then
        cp "${env_file}" "${STAGING_DIR}/env/"
        ENV_COUNT=$((ENV_COUNT + 1))
    fi
done
# Check project root (one level up)
PROJECT_ROOT="$(dirname "${SERVICES_DIR}")"
for env_file in "${PROJECT_ROOT}"/.env "${PROJECT_ROOT}"/.env.*; do
    if [[ -f "${env_file}" ]]; then
        cp "${env_file}" "${STAGING_DIR}/env/"
        ENV_COUNT=$((ENV_COUNT + 1))
    fi
done
FILES_COLLECTED=$((FILES_COLLECTED + ENV_COUNT))
if [[ ${ENV_COUNT} -gt 0 ]]; then
    log "  Collected ${ENV_COUNT} environment file(s)"
else
    log "  No environment files found (this may be expected)"
fi

# --- Prometheus configuration ---
PROMETHEUS_DIR="${SERVICES_DIR}/monitoring/prometheus"
PROMETHEUS_YML="${SERVICES_DIR}/monitoring/prometheus.yml"
PROMETHEUS_MULTI="${SERVICES_DIR}/monitoring/prometheus-multi-region.yml"

log "Collecting Prometheus configuration..."
mkdir -p "${STAGING_DIR}/monitoring/prometheus"

if [[ -f "${PROMETHEUS_YML}" ]]; then
    cp "${PROMETHEUS_YML}" "${STAGING_DIR}/monitoring/"
    FILES_COLLECTED=$((FILES_COLLECTED + 1))
fi
if [[ -f "${PROMETHEUS_MULTI}" ]]; then
    cp "${PROMETHEUS_MULTI}" "${STAGING_DIR}/monitoring/"
    FILES_COLLECTED=$((FILES_COLLECTED + 1))
fi
if [[ -d "${PROMETHEUS_DIR}" ]]; then
    cp -a "${PROMETHEUS_DIR}/"* "${STAGING_DIR}/monitoring/prometheus/" 2>/dev/null || true
    PROM_COUNT=$(find "${STAGING_DIR}/monitoring/prometheus" -type f | wc -l | tr -d ' ')
    FILES_COLLECTED=$((FILES_COLLECTED + PROM_COUNT))
    log "  Collected ${PROM_COUNT} Prometheus config file(s)"
fi

# --- Grafana configuration ---
GRAFANA_DIR="${SERVICES_DIR}/monitoring/grafana"
log "Collecting Grafana configuration..."
if [[ -d "${GRAFANA_DIR}" ]]; then
    mkdir -p "${STAGING_DIR}/monitoring/grafana"
    cp -a "${GRAFANA_DIR}/"* "${STAGING_DIR}/monitoring/grafana/" 2>/dev/null || true
    GRAF_COUNT=$(find "${STAGING_DIR}/monitoring/grafana" -type f | wc -l | tr -d ' ')
    FILES_COLLECTED=$((FILES_COLLECTED + GRAF_COUNT))
    log "  Collected ${GRAF_COUNT} Grafana config file(s)"
else
    warn "Grafana config directory not found: ${GRAFANA_DIR}"
fi

# --- Alertmanager configuration ---
ALERTMANAGER_DIR="${SERVICES_DIR}/monitoring/alertmanager"
log "Collecting Alertmanager configuration..."
if [[ -d "${ALERTMANAGER_DIR}" ]]; then
    mkdir -p "${STAGING_DIR}/monitoring/alertmanager"
    cp -a "${ALERTMANAGER_DIR}/"* "${STAGING_DIR}/monitoring/alertmanager/" 2>/dev/null || true
    ALERT_COUNT=$(find "${STAGING_DIR}/monitoring/alertmanager" -type f | wc -l | tr -d ' ')
    FILES_COLLECTED=$((FILES_COLLECTED + ALERT_COUNT))
    log "  Collected ${ALERT_COUNT} Alertmanager config file(s)"
fi

# --- NATS configuration ---
NATS_DIR="${SERVICES_DIR}/nats"
log "Collecting NATS configuration..."
if [[ -d "${NATS_DIR}" ]]; then
    mkdir -p "${STAGING_DIR}/nats"
    cp -a "${NATS_DIR}/"* "${STAGING_DIR}/nats/" 2>/dev/null || true
    NATS_COUNT=$(find "${STAGING_DIR}/nats" -type f | wc -l | tr -d ' ')
    FILES_COLLECTED=$((FILES_COLLECTED + NATS_COUNT))
    log "  Collected ${NATS_COUNT} NATS config file(s)"
fi

# --- SQL schema files ---
SQL_DIR="${SERVICES_DIR}/event-collector/sql"
log "Collecting SQL schema files..."
if [[ -d "${SQL_DIR}" ]]; then
    mkdir -p "${STAGING_DIR}/sql"
    cp -a "${SQL_DIR}/"* "${STAGING_DIR}/sql/" 2>/dev/null || true
    SQL_COUNT=$(find "${STAGING_DIR}/sql" -type f | wc -l | tr -d ' ')
    FILES_COLLECTED=$((FILES_COLLECTED + SQL_COUNT))
    log "  Collected ${SQL_COUNT} SQL file(s)"
fi

# ---------------------------------------------------------------------------
# Create the tar.gz archive
# ---------------------------------------------------------------------------
if [[ ${FILES_COLLECTED} -eq 0 ]]; then
    err "No configuration files found to back up"
    exit 1
fi

ARCHIVE_NAME="config_backup_${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

log "Creating archive: ${ARCHIVE_NAME} (${FILES_COLLECTED} files)..."
tar -czf "${ARCHIVE_PATH}" -C "${STAGING_DIR}" .

if [[ ! -s "${ARCHIVE_PATH}" ]]; then
    err "Archive creation failed or file is empty"
    exit 1
fi

ARCHIVE_SIZE=$(du -sh "${ARCHIVE_PATH}" | cut -f1)
log "Archive created: ${ARCHIVE_PATH} (${ARCHIVE_SIZE})"

# ---------------------------------------------------------------------------
# List archive contents
# ---------------------------------------------------------------------------
log "Archive contents:"
tar -tzf "${ARCHIVE_PATH}" | head -50 | while IFS= read -r line; do
    echo "    ${line}"
done
TOTAL_IN_ARCHIVE=$(tar -tzf "${ARCHIVE_PATH}" | wc -l | tr -d ' ')
if [[ ${TOTAL_IN_ARCHIVE} -gt 50 ]]; then
    echo "    ... and $((TOTAL_IN_ARCHIVE - 50)) more"
fi

# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------
log "Applying retention policy: keeping last ${RETENTION_COUNT} archives"

ARCHIVE_COUNT=$(find "${BACKUP_DIR}" -name "config_backup_*.tar.gz" | wc -l | tr -d ' ')

if [[ "${ARCHIVE_COUNT}" -gt "${RETENTION_COUNT}" ]]; then
    REMOVE_COUNT=$((ARCHIVE_COUNT - RETENTION_COUNT))
    log "Removing ${REMOVE_COUNT} old archive(s)..."
    find "${BACKUP_DIR}" -name "config_backup_*.tar.gz" -print0 \
        | xargs -0 ls -t \
        | tail -n "${REMOVE_COUNT}" \
        | xargs rm -f
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
REMAINING=$(find "${BACKUP_DIR}" -name "config_backup_*.tar.gz" | wc -l | tr -d ' ')
log "Config backup complete. ${REMAINING} archive(s) retained in ${BACKUP_DIR}"

exit 0
