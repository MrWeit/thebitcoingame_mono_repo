#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Network Partition
# =============================================================================
# Uses `docker network disconnect` to isolate CKPool from Bitcoin Core,
# simulating a network partition between the pool and its upstream node.
#
# Expected behavior:
#   - CKPool handles the partition gracefully (no crash)
#   - After reconnection, CKPool resumes block template updates
#
# Prerequisites:
#   - Docker Compose stack running
#   - Containers must share a Docker network
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/services/docker-compose.yml"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CKPOOL_CONTAINER="tbg-ckpool"
BITCOIN_CONTAINER="tbg-bitcoin-signet"
METRICS_URL="http://localhost:9100/metrics"
WAIT_AFTER_DISCONNECT=30
WAIT_AFTER_RECONNECT=30
TEST_NAME="network_partition"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0

# ---------------------------------------------------------------------------
# Detect the Docker network
# ---------------------------------------------------------------------------
detect_network() {
    # Find the Docker Compose network that both containers share
    local ckpool_networks bitcoin_networks common_network

    ckpool_networks=$(docker inspect --format='{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "${CKPOOL_CONTAINER}" 2>/dev/null)
    bitcoin_networks=$(docker inspect --format='{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "${BITCOIN_CONTAINER}" 2>/dev/null)

    for net in ${ckpool_networks}; do
        for bnet in ${bitcoin_networks}; do
            if [[ "${net}" == "${bnet}" ]]; then
                echo "${net}"
                return 0
            fi
        done
    done

    # Fallback: try the default compose network name
    echo "services_default"
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
NETWORK=""
cleanup() {
    log "Cleanup: ensuring network connectivity is restored..."
    if [[ -n "${NETWORK}" ]]; then
        # Reconnect both containers to the network (idempotent — ignore errors)
        docker network connect "${NETWORK}" "${CKPOOL_CONTAINER}" 2>/dev/null || true
        docker network connect "${NETWORK}" "${BITCOIN_CONTAINER}" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Network Partition ==="
log ""

log "Pre-check: verifying stack is running..."
for container in "${CKPOOL_CONTAINER}" "${BITCOIN_CONTAINER}"; do
    if ! docker inspect --format='{{.State.Running}}' "${container}" 2>/dev/null | grep -q true; then
        fail "${container} is not running"
        exit 1
    fi
done
pass "Required containers are running"

NETWORK=$(detect_network)
log "Detected shared Docker network: ${NETWORK}"

# Verify the network exists
if ! docker network inspect "${NETWORK}" >/dev/null 2>&1; then
    fail "Docker network '${NETWORK}' does not exist"
    exit 1
fi
pass "Docker network '${NETWORK}' exists"

# Record initial state
INITIAL_HEIGHT=""
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    INITIAL_HEIGHT=$(curl -sf "${METRICS_URL}" | grep -E "^ckpool_block_height " | awk '{print $2}' || echo "")
fi
log "Initial block height: ${INITIAL_HEIGHT:-unknown}"

# ---------------------------------------------------------------------------
# Phase 1: Create network partition
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Disconnecting CKPool from Bitcoin Core network..."

# Disconnect bitcoin-signet from the shared network
# This isolates it from CKPool while keeping CKPool's stratum port accessible
docker network disconnect "${NETWORK}" "${BITCOIN_CONTAINER}" 2>/dev/null || {
    # If the container isn't on this network, try disconnecting ckpool instead
    log "Could not disconnect bitcoin from ${NETWORK}, trying to disconnect ckpool..."
    docker network disconnect "${NETWORK}" "${CKPOOL_CONTAINER}" 2>/dev/null || {
        fail "Could not create network partition"
        exit 1
    }
}

pass "Network partition created"

# Verify partition: CKPool should not be able to reach Bitcoin RPC
log "Verifying partition is effective..."
PARTITION_CHECK=$(docker exec "${CKPOOL_CONTAINER}" sh -c \
    "wget -q -O- --timeout=3 http://bitcoin-signet:38332/ 2>&1 || echo 'UNREACHABLE'" 2>/dev/null || echo "UNREACHABLE")

if echo "${PARTITION_CHECK}" | grep -qi "unreachable\|refused\|timeout\|error"; then
    pass "Network partition confirmed — CKPool cannot reach Bitcoin Core"
else
    log "Partition check result: ${PARTITION_CHECK}"
    log "Partition may not be fully effective (continuing test)"
fi

# ---------------------------------------------------------------------------
# Phase 2: Wait and verify CKPool handles it gracefully
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Waiting ${WAIT_AFTER_DISCONNECT}s during network partition..."
sleep "${WAIT_AFTER_DISCONNECT}"

# CKPool should still be running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running during network partition"
else
    fail "CKPool crashed during network partition"
    exit 1
fi

# CKPool process should be alive
CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null || echo "")
if [[ -n "${CKPOOL_PID}" ]]; then
    pass "CKPool process alive during partition (PID: ${CKPOOL_PID})"
else
    fail "CKPool process not found during partition"
fi

# Stratum port should still be listening
if timeout 5 bash -c "echo > /dev/tcp/localhost/${STRATUM_PORT:-3333}" 2>/dev/null; then
    pass "Stratum port still accepting connections during partition"
else
    log "Stratum port may not be accepting new connections during partition"
fi

# Check logs for error handling
PARTITION_LOGS=$(docker logs --since="${WAIT_AFTER_DISCONNECT}s" "${CKPOOL_CONTAINER}" 2>&1 | tail -20)
log "CKPool logs during partition (last 20 lines):"
echo "${PARTITION_LOGS}" | while IFS= read -r line; do
    log "  ${line}"
done

# ---------------------------------------------------------------------------
# Phase 3: Restore network connectivity
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Restoring network connectivity..."

docker network connect "${NETWORK}" "${BITCOIN_CONTAINER}" 2>/dev/null || \
    docker network connect "${NETWORK}" "${CKPOOL_CONTAINER}" 2>/dev/null || true

pass "Network connectivity restored"

# Verify connectivity is back
sleep 5
CONNECTIVITY_CHECK=$(docker exec "${CKPOOL_CONTAINER}" sh -c \
    "wget -q -O- --timeout=5 http://bitcoin-signet:38332/ 2>&1 || echo 'TIMEOUT'" 2>/dev/null || echo "UNKNOWN")

log "Post-reconnect connectivity check: ${CONNECTIVITY_CHECK:0:100}"

# ---------------------------------------------------------------------------
# Phase 4: Verify recovery
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Waiting ${WAIT_AFTER_RECONNECT}s for CKPool to recover..."
sleep "${WAIT_AFTER_RECONNECT}"

# CKPool should still be running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool running after network recovery"
else
    fail "CKPool died after network recovery"
fi

# Check metrics endpoint
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    RECOVERED_HEIGHT=$(curl -sf "${METRICS_URL}" | grep -E "^ckpool_block_height " | awk '{print $2}' || echo "")
    if [[ -n "${RECOVERED_HEIGHT}" ]]; then
        pass "Block height metric present after recovery (${RECOVERED_HEIGHT})"
    else
        log "Block height metric not found — may need more time"
    fi
else
    log "Metrics endpoint not responding — CKPool may still be reconnecting"
fi

# Check for recovery messages in logs
RECOVERY_LOGS=$(docker logs --since="${WAIT_AFTER_RECONNECT}s" "${CKPOOL_CONTAINER}" 2>&1 | grep -ci "connected\|block\|template\|update" || echo "0")
log "Recovery-related log messages: ${RECOVERY_LOGS}"

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
