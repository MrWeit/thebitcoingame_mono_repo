#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Bitcoin Core Disconnect
# =============================================================================
# Simulates Bitcoin Core going offline while CKPool is running.
# Verifies that CKPool stays alive and recovers when Bitcoin Core returns.
#
# Expected behavior:
#   - CKPool remains running (does not crash)
#   - Prometheus metrics show stale block height
#   - After Bitcoin Core restart, CKPool resumes normal operation
#
# Prerequisites:
#   - Docker Compose stack running (services/docker-compose.yml)
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
BITCOIN_CONTAINER="tbg-bitcoin-signet"
PROMETHEUS_URL="http://localhost:9090"
METRICS_URL="http://localhost:9100/metrics"
WAIT_AFTER_STOP=30
WAIT_AFTER_RESTART=45
TEST_NAME="bitcoin_disconnect"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0

# ---------------------------------------------------------------------------
# Cleanup on exit
# ---------------------------------------------------------------------------
cleanup() {
    log "Cleanup: ensuring bitcoin-signet is running..."
    if ! docker inspect --format='{{.State.Running}}' "${BITCOIN_CONTAINER}" 2>/dev/null | grep -q true; then
        docker compose -f "${COMPOSE_FILE}" start bitcoin-signet 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Bitcoin Core Disconnect ==="
log ""

log "Pre-check: verifying stack is running..."
if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "CKPool container is not running"
    exit 1
fi

if ! docker inspect --format='{{.State.Running}}' "${BITCOIN_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "Bitcoin signet container is not running"
    exit 1
fi

# Record initial block height from Prometheus metrics
INITIAL_HEIGHT=""
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    INITIAL_HEIGHT=$(curl -sf "${METRICS_URL}" | grep -E "^ckpool_block_height " | awk '{print $2}' || echo "")
fi
log "Initial block height from metrics: ${INITIAL_HEIGHT:-unknown}"

# ---------------------------------------------------------------------------
# Phase 1: Stop Bitcoin Core
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Stopping bitcoin-signet container..."
docker compose -f "${COMPOSE_FILE}" stop bitcoin-signet

if docker inspect --format='{{.State.Running}}' "${BITCOIN_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "Bitcoin container still running after stop command"
else
    pass "Bitcoin signet stopped successfully"
fi

# ---------------------------------------------------------------------------
# Phase 2: Wait and verify CKPool survives
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Waiting ${WAIT_AFTER_STOP}s while Bitcoin Core is down..."
sleep "${WAIT_AFTER_STOP}"

# Check CKPool is still running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running after ${WAIT_AFTER_STOP}s without Bitcoin Core"
else
    fail "CKPool crashed when Bitcoin Core went down"
    exit 1
fi

# Check that CKPool process is actually alive inside the container
CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null || echo "")
if [[ -n "${CKPOOL_PID}" ]]; then
    pass "CKPool process alive inside container (PID: ${CKPOOL_PID})"
else
    fail "CKPool process not found inside container"
fi

# Check metrics endpoint still responds (even if stale)
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    pass "CKPool metrics endpoint still responding"

    # Check if height is stale (unchanged since Bitcoin went down)
    STALE_HEIGHT=$(curl -sf "${METRICS_URL}" | grep -E "^ckpool_block_height " | awk '{print $2}' || echo "")
    if [[ -n "${INITIAL_HEIGHT}" && -n "${STALE_HEIGHT}" ]]; then
        if [[ "${STALE_HEIGHT}" == "${INITIAL_HEIGHT}" ]]; then
            pass "Block height is stale as expected (${STALE_HEIGHT})"
        else
            log "Block height changed (${INITIAL_HEIGHT} -> ${STALE_HEIGHT}) — may have had a cached update"
        fi
    fi
else
    fail "CKPool metrics endpoint not responding"
fi

# ---------------------------------------------------------------------------
# Phase 3: Restart Bitcoin Core
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Restarting bitcoin-signet container..."
docker compose -f "${COMPOSE_FILE}" start bitcoin-signet

# Wait for Bitcoin Core to become healthy
log "Waiting for Bitcoin Core health check (up to 120s)..."
HEALTHY=0
for i in $(seq 1 24); do
    if docker inspect --format='{{.State.Health.Status}}' "${BITCOIN_CONTAINER}" 2>/dev/null | grep -q healthy; then
        HEALTHY=1
        break
    fi
    sleep 5
done

if [[ "${HEALTHY}" -eq 1 ]]; then
    pass "Bitcoin Core is healthy again"
else
    fail "Bitcoin Core did not become healthy within 120s"
fi

# ---------------------------------------------------------------------------
# Phase 4: Verify CKPool recovery
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Waiting ${WAIT_AFTER_RESTART}s for CKPool to recover..."
sleep "${WAIT_AFTER_RESTART}"

# Check CKPool is still running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running after Bitcoin Core recovery"
else
    fail "CKPool died during Bitcoin Core recovery"
fi

# Check block height is updating
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    RECOVERED_HEIGHT=$(curl -sf "${METRICS_URL}" | grep -E "^ckpool_block_height " | awk '{print $2}' || echo "")
    if [[ -n "${RECOVERED_HEIGHT}" ]]; then
        log "Recovered block height: ${RECOVERED_HEIGHT}"
        # On signet, height may not have changed if no new blocks, so just verify it's present
        pass "Block height metric is being reported (${RECOVERED_HEIGHT})"
    else
        fail "Block height metric missing after recovery"
    fi
else
    fail "CKPool metrics endpoint not responding after recovery"
fi

# Check CKPool logs for reconnection messages
RECONNECT_LOG=$(docker logs --since=60s "${CKPOOL_CONTAINER}" 2>&1 | grep -ci "connected\|reconnect\|block" || echo "0")
log "CKPool log activity in last 60s: ${RECONNECT_LOG} relevant lines"

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
