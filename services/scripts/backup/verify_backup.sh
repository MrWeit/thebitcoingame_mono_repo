#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Backup Verification Script
# =============================================================================
# Verifies the integrity of a TimescaleDB pg_dump backup file.
# Checks: file existence, gzip validity, pg_restore table of contents,
# and presence of all expected tables.
#
# Usage:
#   ./verify_backup.sh <backup_file>
#
# Exit codes:
#   0 — backup is valid and contains all expected tables
#   1 — backup is corrupt, incomplete, or missing expected tables
# =============================================================================

# ---------------------------------------------------------------------------
# Expected tables that must be present in any valid TBG backup
# ---------------------------------------------------------------------------
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
BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" || "${BACKUP_FILE}" == "--help" || "${BACKUP_FILE}" == "-h" ]]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Verifies a TimescaleDB backup file for integrity and completeness."
    echo "The file should be a gzip-compressed pg_dump custom-format backup."
    [[ "${BACKUP_FILE}" == "--help" || "${BACKUP_FILE}" == "-h" ]] && exit 0
    exit 1
fi

# ---------------------------------------------------------------------------
# Temporary file cleanup
# ---------------------------------------------------------------------------
TEMP_DUMP=""
cleanup() {
    [[ -n "${TEMP_DUMP}" && -f "${TEMP_DUMP}" ]] && rm -f "${TEMP_DUMP}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Check 1: File existence
# ---------------------------------------------------------------------------
echo "============================================================"
echo "  Backup Verification Report"
echo "============================================================"
echo ""

if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "  [FAIL] File does not exist: ${BACKUP_FILE}"
    echo ""
    echo "  Result: INVALID"
    exit 1
fi
echo "  [OK] File exists: ${BACKUP_FILE}"

# ---------------------------------------------------------------------------
# Check 2: File size
# ---------------------------------------------------------------------------
FILE_SIZE_BYTES=$(stat -f "%z" "${BACKUP_FILE}" 2>/dev/null \
    || stat -c "%s" "${BACKUP_FILE}" 2>/dev/null \
    || echo "0")
FILE_SIZE_HUMAN=$(du -sh "${BACKUP_FILE}" | cut -f1)

if [[ "${FILE_SIZE_BYTES}" -eq 0 ]]; then
    echo "  [FAIL] File is empty (0 bytes)"
    echo ""
    echo "  Result: INVALID"
    exit 1
fi
echo "  [OK] File size: ${FILE_SIZE_HUMAN} (${FILE_SIZE_BYTES} bytes)"

# ---------------------------------------------------------------------------
# Check 3: File date
# ---------------------------------------------------------------------------
FILE_DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${BACKUP_FILE}" 2>/dev/null \
    || stat -c "%y" "${BACKUP_FILE}" 2>/dev/null \
    || echo "unknown")
echo "  [OK] Created: ${FILE_DATE}"

# ---------------------------------------------------------------------------
# Check 4: Valid gzip
# ---------------------------------------------------------------------------
if ! file "${BACKUP_FILE}" | grep -qi 'gzip'; then
    echo "  [FAIL] File is not a valid gzip archive"
    echo ""
    echo "  Result: INVALID"
    exit 1
fi

# Test gzip integrity (reads entire file)
if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
    echo "  [FAIL] Gzip integrity check failed (file may be truncated or corrupt)"
    echo ""
    echo "  Result: INVALID"
    exit 1
fi
echo "  [OK] Gzip integrity verified"

# ---------------------------------------------------------------------------
# Check 5: Valid pg_dump custom format
# ---------------------------------------------------------------------------
log "Decompressing backup for pg_restore analysis..."
TEMP_DUMP=$(mktemp)
gunzip -c "${BACKUP_FILE}" > "${TEMP_DUMP}"

DECOMPRESSED_SIZE=$(du -sh "${TEMP_DUMP}" | cut -f1)
echo "  [OK] Decompressed size: ${DECOMPRESSED_SIZE}"

# Run pg_restore --list to extract table of contents
TOC_OUTPUT=$(pg_restore --list "${TEMP_DUMP}" 2>/dev/null) || {
    echo "  [FAIL] pg_restore --list failed (not a valid pg_dump custom format)"
    echo ""
    echo "  Result: INVALID"
    exit 1
}
echo "  [OK] Valid pg_dump custom format"

# ---------------------------------------------------------------------------
# Check 6: Expected tables present
# ---------------------------------------------------------------------------
echo ""
echo "  Table presence check:"

TABLES_FOUND=0
TABLES_MISSING=0

for table in "${EXPECTED_TABLES[@]}"; do
    if echo "${TOC_OUTPUT}" | grep -qE "TABLE.*${table}"; then
        # Try to extract row count hint from TABLE DATA entry
        HAS_DATA="yes"
        if ! echo "${TOC_OUTPUT}" | grep -qE "TABLE DATA.*${table}"; then
            HAS_DATA="no data section"
        fi
        echo "    [OK]   ${table} (data: ${HAS_DATA})"
        TABLES_FOUND=$((TABLES_FOUND + 1))
    else
        echo "    [FAIL] ${table} — NOT FOUND in backup"
        TABLES_MISSING=$((TABLES_MISSING + 1))
    fi
done

# ---------------------------------------------------------------------------
# Check 7: Additional objects summary
# ---------------------------------------------------------------------------
echo ""
echo "  Backup contents summary:"

TOTAL_OBJECTS=$(echo "${TOC_OUTPUT}" | grep -c "^[0-9]" || echo "0")
TABLE_COUNT=$(echo "${TOC_OUTPUT}" | grep -cE "^[0-9]+;.*TABLE " || echo "0")
INDEX_COUNT=$(echo "${TOC_OUTPUT}" | grep -cE "^[0-9]+;.*INDEX " || echo "0")
SEQUENCE_COUNT=$(echo "${TOC_OUTPUT}" | grep -cE "^[0-9]+;.*SEQUENCE " || echo "0")
CONSTRAINT_COUNT=$(echo "${TOC_OUTPUT}" | grep -cE "^[0-9]+;.*CONSTRAINT " || echo "0")
FK_COUNT=$(echo "${TOC_OUTPUT}" | grep -cE "^[0-9]+;.*FK CONSTRAINT " || echo "0")

echo "    Total objects : ${TOTAL_OBJECTS}"
echo "    Tables        : ${TABLE_COUNT}"
echo "    Indexes       : ${INDEX_COUNT}"
echo "    Sequences     : ${SEQUENCE_COUNT}"
echo "    Constraints   : ${CONSTRAINT_COUNT}"
echo "    Foreign keys  : ${FK_COUNT}"

# ---------------------------------------------------------------------------
# Final verdict
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"

if [[ "${TABLES_MISSING}" -gt 0 ]]; then
    echo "  Result: INCOMPLETE"
    echo "  ${TABLES_MISSING} expected table(s) missing from backup"
    echo "============================================================"
    exit 1
fi

echo "  Result: VALID"
echo "  All ${TABLES_FOUND} expected tables present, backup is complete"
echo "============================================================"
exit 0
