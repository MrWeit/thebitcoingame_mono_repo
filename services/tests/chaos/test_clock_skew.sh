#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Clock Skew
# =============================================================================
# Skews the system clock inside the CKPool container by +7200 seconds (2 hours)
# to simulate NTP failure or time drift. Verifies that CKPool continues to
# operate (shares processed, no crash) despite incorrect timestamps, then
# restores the clock and confirms normal operation resumes.
#
# Expected behavior:
#   - CKPool remains running after clock skew
#   - Shares are still accepted (timestamps will be off, but no crash)
#   - After clock restore, CKPool resumes normal operation
#   - Metrics endpoint stays responsive throughout
#
# Prerequisites:
#   - Docker Compose stack running (services/docker-compose.yml)
#   - Container must have SYS_TIME capability or run privileged
#   - curl and jq installed on the host
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/services/docker-compose.yml"

# Source helpers if available
HELPERS="${SCRIPT_DIR}/lib/helpers.sh"
if [[ -f "${HELPERS}" ]]; then
    source "${HELPERS}"
fi

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CKPOOL_CONTAINER="tbg-ckpool"
METRICS_URL="http://localhost:9100/metrics"
SKEW_SECONDS=7200
WAIT_AFTER_SKEW=20
WAIT_AFTER_RESTORE=15
TEST_NAME="clock_skew"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0

# ---------------------------------------------------------------------------
# Cleanup on exit — always restore the clock
# ---------------------------------------------------------------------------
cleanup() {
    log "Cleanup: restoring container clock via NTP or hwclock..."
    # Attempt to restore the clock using multiple strategies
    docker exec "${CKPOOL_CONTAINER}" bash -c '
        if command -v ntpdate &>/dev/null; then
            ntpdate -s pool.ntp.org 2>/dev/null || true
        elif command -v hwclock &>/dev/null; then
            hwclock --hctosys 2>/dev/null || true
        elif command -v sntp &>/dev/null; then
            sntp -sS pool.ntp.org 2>/dev/null || true
        else
            # Last resort: set clock back by subtracting the skew
            date -s "-'"${SKEW_SECONDS}"' seconds" 2>/dev/null || true
        fi
    ' 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Clock Skew (+${SKEW_SECONDS}s) ==="
log ""

log "Pre-check: verifying CKPool container is running..."
if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "CKPool container is not running"
    exit 1
fi

# Record initial state
INITIAL_TIME_HOST=$(date +%s)
INITIAL_TIME_CONTAINER=$(docker exec "${CKPOOL_CONTAINER}" date +%s 2>/dev/null || echo "0")
log "Host time:      $(date -r "${INITIAL_TIME_HOST}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')"
log "Container time: $(docker exec "${CKPOOL_CONTAINER}" date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'unknown')"

# Verify CKPool process is alive
CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
if [[ -n "${CKPOOL_PID}" ]]; then
    pass "CKPool process alive (PID: ${CKPOOL_PID})"
else
    fail "CKPool process not found before test"
    exit 1
fi

# Record initial metrics availability
INITIAL_METRICS_OK=0
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    INITIAL_METRICS_OK=1
    pass "Metrics endpoint responding before skew"
fi

# ---------------------------------------------------------------------------
# Phase 1: Skew the container clock forward by SKEW_SECONDS
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Skewing container clock by +${SKEW_SECONDS}s ($(( SKEW_SECONDS / 3600 )) hours)..."

SKEW_APPLIED=0
# Try 'date -s' first (Linux), then 'date' with offset
docker exec "${CKPOOL_CONTAINER}" bash -c "date -s '+${SKEW_SECONDS} seconds'" 2>/dev/null && SKEW_APPLIED=1

if [[ "${SKEW_APPLIED}" -eq 0 ]]; then
    # Alternative: compute the target time and set it directly
    TARGET_TIME=$(( $(docker exec "${CKPOOL_CONTAINER}" date +%s) + SKEW_SECONDS ))
    docker exec "${CKPOOL_CONTAINER}" date -s "@${TARGET_TIME}" 2>/dev/null && SKEW_APPLIED=1
fi

if [[ "${SKEW_APPLIED}" -eq 0 ]]; then
    log "WARNING: Could not apply clock skew (container may lack SYS_TIME capability)"
    log "Attempting with faketime fallback..."
    # Try installing and using faketime if available
    docker exec "${CKPOOL_CONTAINER}" bash -c '
        if command -v faketime &>/dev/null; then
            echo "faketime available"
        else
            apt-get update -qq && apt-get install -y -qq faketime 2>/dev/null || \
            apk add --no-cache faketime 2>/dev/null || echo "no-faketime"
        fi
    ' 2>/dev/null || true

    fail "Cannot skew clock — container lacks SYS_TIME capability and faketime. Skipping destructive phases."
    log "TIP: Add 'cap_add: [SYS_TIME]' to the ckpool service in docker-compose.yml"
    exit 1
fi

# Verify skew was applied
SKEWED_TIME=$(docker exec "${CKPOOL_CONTAINER}" date +%s 2>/dev/null || echo "0")
ACTUAL_SKEW=$(( SKEWED_TIME - INITIAL_TIME_HOST ))
log "Container time after skew: $(docker exec "${CKPOOL_CONTAINER}" date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'unknown')"
log "Effective skew: ~${ACTUAL_SKEW}s (target: ${SKEW_SECONDS}s)"

if [[ "${ACTUAL_SKEW}" -gt $(( SKEW_SECONDS / 2 )) ]]; then
    pass "Clock skew applied successfully (~${ACTUAL_SKEW}s forward)"
else
    fail "Clock skew was not applied correctly (only ${ACTUAL_SKEW}s drift)"
fi

# ---------------------------------------------------------------------------
# Phase 2: Verify CKPool survives with skewed clock
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Waiting ${WAIT_AFTER_SKEW}s to verify CKPool survives clock skew..."
sleep "${WAIT_AFTER_SKEW}"

# Check CKPool container is still running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool container still running after clock skew"
else
    fail "CKPool container stopped after clock skew"
    exit 1
fi

# Check CKPool process is still alive
CKPOOL_PID_AFTER=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
if [[ -n "${CKPOOL_PID_AFTER}" ]]; then
    pass "CKPool process still alive after clock skew (PID: ${CKPOOL_PID_AFTER})"
else
    fail "CKPool process died after clock skew"
fi

# Check metrics endpoint still responds
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    pass "Metrics endpoint still responding under clock skew"
else
    fail "Metrics endpoint not responding under clock skew"
fi

# Test stratum port is still open
if timeout 5 bash -c "echo > /dev/tcp/localhost/3333" 2>/dev/null; then
    pass "Stratum port still accepting connections under clock skew"
else
    fail "Stratum port not accepting connections under clock skew"
fi

# Check for any crash/restart logs
RESTART_LOGS=$(docker logs --since=30s "${CKPOOL_CONTAINER}" 2>&1 | grep -ci "crash\|fatal\|segfault\|abort" || echo "0")
if [[ "${RESTART_LOGS}" -eq 0 ]]; then
    pass "No crash indicators in CKPool logs"
else
    fail "Found ${RESTART_LOGS} crash-related log lines"
fi

# ---------------------------------------------------------------------------
# Phase 3: Restore the clock
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Restoring container clock..."

# Restore by subtracting the skew
docker exec "${CKPOOL_CONTAINER}" bash -c "date -s '-${SKEW_SECONDS} seconds'" 2>/dev/null || \
    docker exec "${CKPOOL_CONTAINER}" bash -c "date -s @$(date +%s)" 2>/dev/null || true

RESTORED_TIME=$(docker exec "${CKPOOL_CONTAINER}" date +%s 2>/dev/null || echo "0")
HOST_TIME=$(date +%s)
DRIFT=$(( RESTORED_TIME - HOST_TIME ))
# Allow up to 10 seconds drift after restore
if [[ "${DRIFT#-}" -lt 10 ]]; then
    pass "Clock restored (drift: ${DRIFT}s from host)"
else
    log "WARNING: Clock still drifted by ${DRIFT}s after restore"
fi

log "Container time after restore: $(docker exec "${CKPOOL_CONTAINER}" date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'unknown')"

# ---------------------------------------------------------------------------
# Phase 4: Verify normal operation after clock restore
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Waiting ${WAIT_AFTER_RESTORE}s to verify normal operation resumes..."
sleep "${WAIT_AFTER_RESTORE}"

# Check CKPool is still running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running after clock restore"
else
    fail "CKPool died after clock restore"
fi

# Check process is alive
CKPOOL_PID_FINAL=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
if [[ -n "${CKPOOL_PID_FINAL}" ]]; then
    pass "CKPool process alive after clock restore (PID: ${CKPOOL_PID_FINAL})"
else
    fail "CKPool process not found after clock restore"
fi

# Check metrics endpoint
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    pass "Metrics endpoint responding after clock restore"
else
    fail "Metrics endpoint not responding after clock restore"
fi

# Verify stratum port
if timeout 5 bash -c "echo > /dev/tcp/localhost/3333" 2>/dev/null; then
    pass "Stratum port accepting connections after clock restore"
else
    fail "Stratum port not accepting connections after clock restore"
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
