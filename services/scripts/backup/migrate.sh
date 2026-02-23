#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Database Migration Runner
# =============================================================================
# Reads SQL migration files and applies them in order, tracking applied
# versions in the schema_migrations table.
#
# Usage:
#   ./migrate.sh [--dry-run] [--rollback N] [--container NAME] [--migrations-dir DIR]
#
# Migration file naming convention:
#   NNN_description.sql  (e.g., 001_schema_migrations.sql, 002_add_region_column.sql)
#   The version number is extracted from the filename prefix.
#
# Options:
#   --dry-run          Show what would be applied without executing
#   --rollback N       Mark migration N as unapplied (does NOT undo SQL changes)
#   --container NAME   Docker container name (default: tbg-timescaledb)
#   --migrations-dir   Path to migrations directory
#
# Exit codes:
#   0 — all migrations applied successfully (or nothing to apply)
#   1 — migration failed
# =============================================================================

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
CONTAINER_NAME="${CONTAINER_NAME:-tbg-timescaledb}"
DB_NAME="${DB_NAME:-thebitcoingame}"
DB_USER="${DB_USER:-tbg}"
DRY_RUN=false
ROLLBACK_VERSION=""

# Auto-detect migrations directory relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${SCRIPT_DIR}/../../event-collector/sql/migrations}"

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
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            ROLLBACK_VERSION="$2"
            shift 2
            ;;
        --container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --db)
            DB_NAME="$2"
            shift 2
            ;;
        --migrations-dir)
            MIGRATIONS_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run          Show what would be applied without executing"
            echo "  --rollback N       Mark migration version N as unapplied"
            echo "  --container NAME   Docker container name (default: tbg-timescaledb)"
            echo "  --db NAME          Database name (default: thebitcoingame)"
            echo "  --migrations-dir   Path to migrations directory"
            exit 0
            ;;
        *)
            err "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Helper: execute SQL against the database via Docker
# ---------------------------------------------------------------------------
exec_sql() {
    docker exec "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "$1" 2>/dev/null
}

exec_sql_file() {
    docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" 2>&1
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "TheBitcoinGame — Database Migration Runner"

# Resolve the migrations directory to an absolute path
MIGRATIONS_DIR="$(cd "${MIGRATIONS_DIR}" 2>/dev/null && pwd)" || {
    err "Migrations directory not found: ${MIGRATIONS_DIR}"
    exit 1
}
log "Migrations directory: ${MIGRATIONS_DIR}"

# Verify container is running
if ! docker inspect --format='{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true; then
    err "Container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# Verify database is accessible
if ! docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" -q; then
    err "Database '${DB_NAME}' is not accepting connections"
    exit 1
fi

log "Connected to '${DB_NAME}' on container '${CONTAINER_NAME}'"

# ---------------------------------------------------------------------------
# Handle rollback mode
# ---------------------------------------------------------------------------
if [[ -n "${ROLLBACK_VERSION}" ]]; then
    log "Rollback requested for migration version ${ROLLBACK_VERSION}"

    if [[ "${DRY_RUN}" == true ]]; then
        log "[DRY RUN] Would mark migration ${ROLLBACK_VERSION} as unapplied"
        exit 0
    fi

    # Check if the schema_migrations table exists
    TABLE_EXISTS=$(exec_sql "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations');")
    if [[ "${TABLE_EXISTS}" != "t" ]]; then
        err "schema_migrations table does not exist — nothing to roll back"
        exit 1
    fi

    # Check if the version exists
    VERSION_EXISTS=$(exec_sql "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ${ROLLBACK_VERSION});")
    if [[ "${VERSION_EXISTS}" != "t" ]]; then
        err "Migration version ${ROLLBACK_VERSION} is not recorded in schema_migrations"
        exit 1
    fi

    # Get migration name for logging
    MIGRATION_NAME=$(exec_sql "SELECT name FROM schema_migrations WHERE version = ${ROLLBACK_VERSION};")

    # Delete the record (mark as unapplied)
    exec_sql "DELETE FROM schema_migrations WHERE version = ${ROLLBACK_VERSION};"
    log "Marked migration ${ROLLBACK_VERSION} (${MIGRATION_NAME}) as unapplied"
    warn "NOTE: The SQL changes from this migration have NOT been reversed."
    warn "You must manually undo any schema changes if needed."
    exit 0
fi

# ---------------------------------------------------------------------------
# Ensure schema_migrations table exists
# ---------------------------------------------------------------------------
# We need the tracking table before we can check applied versions.
# Migration 001 creates this table, but we bootstrap it here so the
# runner can track migration 001 itself.
exec_sql "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        applied_at  TIMESTAMPTZ DEFAULT NOW(),
        checksum    VARCHAR(64)
    );
" >/dev/null

# ---------------------------------------------------------------------------
# Get list of already-applied migrations
# ---------------------------------------------------------------------------
APPLIED_VERSIONS=$(exec_sql "SELECT version FROM schema_migrations ORDER BY version;" 2>/dev/null || echo "")

log "Applied migrations: ${APPLIED_VERSIONS:-none}"

# ---------------------------------------------------------------------------
# Discover and sort migration files
# ---------------------------------------------------------------------------
MIGRATION_FILES=()
while IFS= read -r -d '' file; do
    MIGRATION_FILES+=("$file")
done < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -name "*.sql" -print0 | sort -z)

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
    log "No migration files found in ${MIGRATIONS_DIR}"
    exit 0
fi

log "Found ${#MIGRATION_FILES[@]} migration file(s)"

# ---------------------------------------------------------------------------
# Apply pending migrations
# ---------------------------------------------------------------------------
APPLIED_COUNT=0
SKIPPED_COUNT=0
FAILED=false

for migration_file in "${MIGRATION_FILES[@]}"; do
    filename=$(basename "${migration_file}")

    # Extract version number from filename (e.g., "001_schema_migrations.sql" -> 1)
    version_str=$(echo "${filename}" | grep -oE '^[0-9]+' || echo "")
    if [[ -z "${version_str}" ]]; then
        warn "Skipping file with no version prefix: ${filename}"
        continue
    fi

    # Remove leading zeros for integer comparison
    version=$((10#${version_str}))

    # Extract description from filename
    description=$(echo "${filename}" | sed -E 's/^[0-9]+_//' | sed 's/\.sql$//' | tr '_' ' ')

    # Check if already applied
    if echo "${APPLIED_VERSIONS}" | grep -qw "${version}"; then
        log "  [SKIP] ${filename} (version ${version} already applied)"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi

    # Compute checksum
    CHECKSUM=$(md5sum "${migration_file}" 2>/dev/null | cut -d' ' -f1 \
        || md5 -q "${migration_file}" 2>/dev/null \
        || echo "unknown")

    if [[ "${DRY_RUN}" == true ]]; then
        log "  [DRY RUN] Would apply: ${filename} (version ${version})"
        APPLIED_COUNT=$((APPLIED_COUNT + 1))
        continue
    fi

    # Apply the migration
    log "  [APPLY] ${filename} (version ${version})..."

    OUTPUT=$(cat "${migration_file}" | exec_sql_file) || {
        err "Migration ${filename} FAILED"
        err "Output: ${OUTPUT}"
        FAILED=true
        break
    }

    # Verify it was registered (the SQL file should INSERT into schema_migrations,
    # but if it doesn't, we register it here as a fallback)
    IS_REGISTERED=$(exec_sql "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ${version});")
    if [[ "${IS_REGISTERED}" != "t" ]]; then
        exec_sql "INSERT INTO schema_migrations (version, name, checksum) VALUES (${version}, '${description}', '${CHECKSUM}');"
    fi

    log "  [DONE] ${filename} applied successfully"
    APPLIED_COUNT=$((APPLIED_COUNT + 1))
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Migration Summary"
echo "============================================================"

if [[ "${DRY_RUN}" == true ]]; then
    echo "  Mode     : DRY RUN (no changes made)"
fi

echo "  Applied  : ${APPLIED_COUNT}"
echo "  Skipped  : ${SKIPPED_COUNT} (already applied)"
echo "  Total    : ${#MIGRATION_FILES[@]} migration file(s)"

if [[ "${FAILED}" == true ]]; then
    echo "  Status   : FAILED"
    echo "============================================================"
    exit 1
fi

echo "  Status   : SUCCESS"
echo "============================================================"

# Show current state
log "Current schema version:"
exec_sql "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;" 2>/dev/null \
    | while IFS='|' read -r ver name applied; do
        echo "    v${ver}: ${name} (applied: ${applied})"
    done

exit 0
