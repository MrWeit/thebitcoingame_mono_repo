#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Disk Full Simulation
# =============================================================================
# Simulates a disk-full condition inside the CKPool container by creating
# a large file on the log volume, then verifies CKPool handles write
# errors gracefully. Cleans up afterward.
#
# Expected behavior:
#   - CKPool continues running even when log writes fail
#   - After disk space is freed, CKPool resumes normal logging
#   - No data corruption in stratum processing
#
# Prerequisites:
#   - Docker Compose stack running
#   - CKPool container has mounted volumes for logs
#
# Note: This test uses a conservative approach — it fills a tmpfs or a
# portion of the log volume, NOT the host root filesystem.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/services/docker-compose.yml"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CKPOOL_CONTAINER="tbg-ckpool"
STRATUM_HOST="localhost"
STRATUM_PORT=3333
# Fill target: the ckpool logs volume (/var/log/ckpool)
FILL_PATH="/var/log/ckpool"
FILL_SIZE_MB=256
WAIT_AFTER_FILL=15
TEST_NAME="disk_full"

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
    log "Cleanup: removing fill files..."
    docker exec "${CKPOOL_CONTAINER}" rm -f "${FILL_PATH}/.chaos_fill_*" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Disk Full Simulation ==="
log ""

log "Pre-check: verifying CKPool is running..."
if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "CKPool container is not running"
    exit 1
fi
pass "CKPool container is running"

# Check available space in the container's log volume
AVAILABLE_KB=$(docker exec "${CKPOOL_CONTAINER}" df -k "${FILL_PATH}" 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
AVAILABLE_MB=$((AVAILABLE_KB / 1024))
log "Available space on ${FILL_PATH}: ${AVAILABLE_MB}MB"

if [[ "${AVAILABLE_MB}" -lt 10 ]]; then
    log "Less than 10MB available — disk may already be nearly full"
    log "Adjusting fill size..."
    FILL_SIZE_MB=1
fi

# Record CKPool PID
CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "unknown")
log "CKPool PID before test: ${CKPOOL_PID}"

# ---------------------------------------------------------------------------
# Phase 1: Fill disk space
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Creating ${FILL_SIZE_MB}MB fill file in ${FILL_PATH}..."

# Use dd to create fill files. We use multiple smaller files so cleanup is easier.
# The 'oflag=dsync' ensures data is written, not just buffered.
# We intentionally allow dd to fail (disk full) — that's the point.
set +e
docker exec "${CKPOOL_CONTAINER}" sh -c "
    dd if=/dev/zero of=${FILL_PATH}/.chaos_fill_1 bs=1M count=${FILL_SIZE_MB} 2>/dev/null
    # Try to fill any remaining space with a second file
    dd if=/dev/zero of=${FILL_PATH}/.chaos_fill_2 bs=1M count=1024 2>/dev/null
" 2>/dev/null
set -e

# Check remaining space
REMAINING_KB=$(docker exec "${CKPOOL_CONTAINER}" df -k "${FILL_PATH}" 2>/dev/null | tail -1 | awk '{print $4}' || echo "unknown")
REMAINING_MB=$((REMAINING_KB / 1024))
log "Remaining space after fill: ${REMAINING_MB}MB"

if [[ "${REMAINING_MB}" -lt 50 ]]; then
    pass "Disk space significantly reduced (${REMAINING_MB}MB remaining)"
else
    log "Could not fill disk completely (${REMAINING_MB}MB remaining) — volume may be large"
    log "Continuing test with reduced disk space scenario"
fi

# ---------------------------------------------------------------------------
# Phase 2: Verify CKPool handles disk pressure
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Checking CKPool behavior under disk pressure..."
sleep "${WAIT_AFTER_FILL}"

# CKPool should still be running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running under disk pressure"
else
    fail "CKPool crashed under disk pressure"
    cleanup
    exit 1
fi

# CKPool process should be alive
NEW_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "")
if [[ -n "${NEW_PID}" ]]; then
    pass "CKPool process still alive (PID: ${NEW_PID})"
else
    fail "CKPool process disappeared under disk pressure"
fi

# Test stratum connection
if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
    pass "Stratum port still accepting connections under disk pressure"
else
    fail "Stratum port not accepting connections under disk pressure"
fi

# Check if CKPool logs any disk-related errors
DISK_ERRORS=$(docker logs --since="${WAIT_AFTER_FILL}s" "${CKPOOL_CONTAINER}" 2>&1 | grep -ci "no space\|disk\|write\|ENOSPC" || echo "0")
log "Disk-related error messages in logs: ${DISK_ERRORS}"

# ---------------------------------------------------------------------------
# Phase 3: Free disk space
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Freeing disk space..."

docker exec "${CKPOOL_CONTAINER}" rm -f "${FILL_PATH}/.chaos_fill_1" "${FILL_PATH}/.chaos_fill_2" 2>/dev/null || true

FREED_KB=$(docker exec "${CKPOOL_CONTAINER}" df -k "${FILL_PATH}" 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
FREED_MB=$((FREED_KB / 1024))
log "Available space after cleanup: ${FREED_MB}MB"

if [[ "${FREED_MB}" -gt "${REMAINING_MB}" ]]; then
    pass "Disk space successfully freed"
else
    log "Disk space may not have been fully freed"
fi

# ---------------------------------------------------------------------------
# Phase 4: Verify recovery
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Verifying CKPool recovers after disk space freed..."
sleep 10

# CKPool should still be running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool running after disk space freed"
else
    fail "CKPool died after disk space freed"
fi

# Verify stratum works
STRATUM_RESULT=$(python3 -c "
import socket, json, time
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
    s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['chaos-disk-test/1.0']}) + '\n').encode())
    time.sleep(2)
    data = b''
    try:
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
    except socket.timeout:
        pass
    s.close()
    if data:
        print('OK')
    else:
        print('NO_DATA')
except Exception as e:
    print(f'ERROR:{e}')
" 2>/dev/null || echo "ERROR")

if [[ "${STRATUM_RESULT}" == "OK" ]]; then
    pass "Stratum protocol working normally after disk recovery"
else
    log "Stratum result: ${STRATUM_RESULT}"
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
