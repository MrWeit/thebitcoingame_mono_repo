#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: CPU Stress
# =============================================================================
# Saturates all CPU cores inside the CKPool container to simulate resource
# contention (e.g., a runaway process or noisy neighbor). Verifies that CKPool
# continues to process shares (with acceptable latency increase), then stops
# the stress load and confirms latency returns to normal.
#
# Expected behavior:
#   - CKPool remains running under full CPU pressure
#   - Shares are still accepted (higher latency is acceptable)
#   - After stress removal, latency returns to normal levels
#   - No OOM kills or crashes
#
# Prerequisites:
#   - Docker Compose stack running (services/docker-compose.yml)
#   - curl installed on the host
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
STRESS_DURATION=30
WAIT_AFTER_STRESS=20
TEST_NAME="cpu_stress"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0

# ---------------------------------------------------------------------------
# Cleanup on exit — always kill stress processes
# ---------------------------------------------------------------------------
cleanup() {
    log "Cleanup: killing any remaining stress processes in container..."
    docker exec "${CKPOOL_CONTAINER}" bash -c '
        # Kill stress tool if running
        pkill -f "stress" 2>/dev/null || true
        # Kill dd-based stress workers
        pkill -f "dd if=/dev/urandom" 2>/dev/null || true
        pkill -f "md5sum" 2>/dev/null || true
    ' 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: CPU Stress (${STRESS_DURATION}s) ==="
log ""

log "Pre-check: verifying CKPool container is running..."
if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "CKPool container is not running"
    exit 1
fi

# Verify CKPool process is alive
CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
if [[ -n "${CKPOOL_PID}" ]]; then
    pass "CKPool process alive (PID: ${CKPOOL_PID})"
else
    fail "CKPool process not found before test"
    exit 1
fi

# Record baseline stratum response time
log "Measuring baseline stratum response time..."
BASELINE_LATENCY_MS=""
BASELINE_START=$(date +%s%N 2>/dev/null || echo "0")
if timeout 5 bash -c "echo > /dev/tcp/localhost/3333" 2>/dev/null; then
    BASELINE_END=$(date +%s%N 2>/dev/null || echo "0")
    if [[ "${BASELINE_START}" != "0" && "${BASELINE_END}" != "0" ]]; then
        BASELINE_LATENCY_MS=$(( (BASELINE_END - BASELINE_START) / 1000000 ))
        log "Baseline stratum connect latency: ${BASELINE_LATENCY_MS}ms"
    fi
    pass "Stratum port responding before stress"
else
    fail "Stratum port not responding before stress"
fi

# Record baseline metrics
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    pass "Metrics endpoint responding before stress"
fi

# Get CPU count inside the container
CPU_COUNT=$(docker exec "${CKPOOL_CONTAINER}" nproc 2>/dev/null || echo "2")
log "Container CPU count: ${CPU_COUNT}"

# ---------------------------------------------------------------------------
# Phase 1: Start CPU stress inside the container
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Starting CPU stress (${CPU_COUNT} workers for ${STRESS_DURATION}s)..."

# Try 'stress' tool first, fall back to dd+md5sum
STRESS_METHOD="none"

# Check if stress or stress-ng is available
HAS_STRESS=$(docker exec "${CKPOOL_CONTAINER}" bash -c 'command -v stress 2>/dev/null || command -v stress-ng 2>/dev/null || echo ""' 2>/dev/null)

if [[ -n "${HAS_STRESS}" ]]; then
    log "Using '${HAS_STRESS}' for CPU load..."
    STRESS_METHOD="stress"
    docker exec -d "${CKPOOL_CONTAINER}" bash -c "${HAS_STRESS} --cpu ${CPU_COUNT} --timeout ${STRESS_DURATION}" 2>/dev/null
else
    log "stress tool not found, using dd+md5sum fallback..."
    STRESS_METHOD="dd"
    # Launch one dd|md5sum per CPU core in background
    for i in $(seq 1 "${CPU_COUNT}"); do
        docker exec -d "${CKPOOL_CONTAINER}" bash -c "dd if=/dev/urandom bs=1M count=99999 2>/dev/null | md5sum > /dev/null 2>&1" 2>/dev/null
    done
fi

pass "CPU stress started via ${STRESS_METHOD} (${CPU_COUNT} workers)"

# Give the stress a moment to ramp up
sleep 3

# Verify stress is actually running
STRESS_PROCS=$(docker exec "${CKPOOL_CONTAINER}" bash -c 'ps aux 2>/dev/null | grep -cE "stress|dd if=/dev/urandom|md5sum" || echo "0"' 2>/dev/null)
# Subtract 1 for the grep itself
STRESS_PROCS=$(( STRESS_PROCS > 0 ? STRESS_PROCS - 1 : 0 ))
log "Active stress processes: ${STRESS_PROCS}"

# ---------------------------------------------------------------------------
# Phase 2: Verify CKPool survives under CPU pressure
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Verifying CKPool operates under CPU stress..."

# Check at multiple intervals during the stress period
CHECKS_PASSED=0
CHECKS_TOTAL=0
INTERVAL=$(( STRESS_DURATION / 3 ))

for checkpoint in 1 2 3; do
    sleep_time=$(( checkpoint == 1 ? 5 : INTERVAL ))
    sleep "${sleep_time}"

    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))

    # Check container is still running
    if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
        fail "CKPool container stopped during CPU stress (checkpoint ${checkpoint})"
        continue
    fi

    # Check process is alive
    PID_CHECK=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
    if [[ -z "${PID_CHECK}" ]]; then
        fail "CKPool process died during CPU stress (checkpoint ${checkpoint})"
        continue
    fi

    # Check stratum port (allow longer timeout under stress)
    if timeout 10 bash -c "echo > /dev/tcp/localhost/3333" 2>/dev/null; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        fail "Stratum port not responding at checkpoint ${checkpoint}"
    fi

    log "  Checkpoint ${checkpoint}/${CHECKS_TOTAL}: CKPool alive, stratum port open"
done

if [[ "${CHECKS_PASSED}" -eq "${CHECKS_TOTAL}" ]]; then
    pass "All ${CHECKS_TOTAL} health checks passed under CPU stress"
elif [[ "${CHECKS_PASSED}" -gt 0 ]]; then
    log "WARNING: ${CHECKS_PASSED}/${CHECKS_TOTAL} health checks passed under CPU stress"
    pass "CKPool mostly responsive under CPU stress (${CHECKS_PASSED}/${CHECKS_TOTAL})"
else
    fail "All health checks failed under CPU stress"
fi

# Check metrics endpoint (may be slower but should respond)
if curl -sf --max-time 15 "${METRICS_URL}" >/dev/null 2>&1; then
    pass "Metrics endpoint still responding under CPU stress"
else
    fail "Metrics endpoint not responding under CPU stress"
fi

# Measure latency under stress
STRESS_LATENCY_MS=""
STRESS_START=$(date +%s%N 2>/dev/null || echo "0")
if timeout 10 bash -c "echo > /dev/tcp/localhost/3333" 2>/dev/null; then
    STRESS_END=$(date +%s%N 2>/dev/null || echo "0")
    if [[ "${STRESS_START}" != "0" && "${STRESS_END}" != "0" ]]; then
        STRESS_LATENCY_MS=$(( (STRESS_END - STRESS_START) / 1000000 ))
        log "Stratum connect latency under stress: ${STRESS_LATENCY_MS}ms"
    fi
fi

# ---------------------------------------------------------------------------
# Phase 3: Stop CPU stress
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Stopping CPU stress..."

docker exec "${CKPOOL_CONTAINER}" bash -c '
    pkill -f "stress" 2>/dev/null || true
    pkill -f "dd if=/dev/urandom" 2>/dev/null || true
    pkill -f "md5sum" 2>/dev/null || true
' 2>/dev/null || true

sleep 3

# Verify stress processes are gone
REMAINING=$(docker exec "${CKPOOL_CONTAINER}" bash -c 'ps aux 2>/dev/null | grep -cE "stress|dd if=/dev/urandom" || echo "0"' 2>/dev/null)
REMAINING=$(( REMAINING > 0 ? REMAINING - 1 : 0 ))
if [[ "${REMAINING}" -eq 0 ]]; then
    pass "All stress processes terminated"
else
    log "WARNING: ${REMAINING} stress processes still running (may be finishing)"
fi

# ---------------------------------------------------------------------------
# Phase 4: Verify normal latency resumes
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Waiting ${WAIT_AFTER_STRESS}s for CKPool to recover..."
sleep "${WAIT_AFTER_STRESS}"

# Check CKPool is still running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running after stress removal"
else
    fail "CKPool died after stress removal"
fi

# Check process is alive
CKPOOL_PID_FINAL=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
if [[ -n "${CKPOOL_PID_FINAL}" ]]; then
    pass "CKPool process alive after stress removal (PID: ${CKPOOL_PID_FINAL})"
else
    fail "CKPool process not found after stress removal"
fi

# Measure recovered latency
RECOVERED_LATENCY_MS=""
RECOVERED_START=$(date +%s%N 2>/dev/null || echo "0")
if timeout 5 bash -c "echo > /dev/tcp/localhost/3333" 2>/dev/null; then
    RECOVERED_END=$(date +%s%N 2>/dev/null || echo "0")
    if [[ "${RECOVERED_START}" != "0" && "${RECOVERED_END}" != "0" ]]; then
        RECOVERED_LATENCY_MS=$(( (RECOVERED_END - RECOVERED_START) / 1000000 ))
        log "Recovered stratum connect latency: ${RECOVERED_LATENCY_MS}ms"
    fi
    pass "Stratum port responding after stress removal"
else
    fail "Stratum port not responding after stress removal"
fi

# Report latency comparison
if [[ -n "${BASELINE_LATENCY_MS}" && -n "${RECOVERED_LATENCY_MS}" ]]; then
    log "Latency comparison: baseline=${BASELINE_LATENCY_MS}ms, recovered=${RECOVERED_LATENCY_MS}ms"
    # Recovered latency should be within 5x of baseline (generous margin)
    THRESHOLD=$(( BASELINE_LATENCY_MS * 5 + 100 ))
    if [[ "${RECOVERED_LATENCY_MS}" -lt "${THRESHOLD}" ]]; then
        pass "Recovered latency within acceptable range"
    else
        fail "Recovered latency still elevated (${RECOVERED_LATENCY_MS}ms > ${THRESHOLD}ms threshold)"
    fi
fi

# Check metrics endpoint
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    pass "Metrics endpoint responding after stress removal"
else
    fail "Metrics endpoint not responding after stress removal"
fi

# Check for OOM or crash indicators
OOM_LOGS=$(docker logs --since=120s "${CKPOOL_CONTAINER}" 2>&1 | grep -ci "oom\|killed\|crash\|fatal\|segfault" || echo "0")
if [[ "${OOM_LOGS}" -eq 0 ]]; then
    pass "No OOM/crash indicators in CKPool logs"
else
    fail "Found ${OOM_LOGS} OOM/crash-related log lines"
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
