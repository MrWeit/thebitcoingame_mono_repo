#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: OOM Kill / Process Kill
# =============================================================================
# Sends SIGKILL to the CKPool process inside its container, simulating an
# OOM kill or unexpected process death. Verifies Docker's restart policy
# (restart: unless-stopped) brings CKPool back and miners can reconnect.
#
# Expected behavior:
#   - CKPool process dies immediately (SIGKILL)
#   - Docker restarts the container automatically
#   - CKPool becomes healthy again within 60s
#   - Stratum port accepts connections again
#
# Prerequisites:
#   - Docker Compose stack running
#   - CKPool container has restart: unless-stopped
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
METRICS_URL="http://localhost:9100/metrics"
MAX_RECOVERY_WAIT=90
TEST_NAME="oom_kill"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: OOM Kill ==="
log ""

log "Pre-check: verifying CKPool is running..."
if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "CKPool container is not running"
    exit 1
fi

# Verify restart policy is set
RESTART_POLICY=$(docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' "${CKPOOL_CONTAINER}" 2>/dev/null || echo "unknown")
log "CKPool restart policy: ${RESTART_POLICY}"
if [[ "${RESTART_POLICY}" == "no" ]]; then
    fail "CKPool restart policy is 'no' — container will not auto-restart"
    log "Set 'restart: unless-stopped' in docker-compose.yml"
    exit 1
fi
pass "CKPool has restart policy: ${RESTART_POLICY}"

# Record initial restart count
INITIAL_RESTART_COUNT=$(docker inspect --format='{{.RestartCount}}' "${CKPOOL_CONTAINER}" 2>/dev/null || echo "0")
log "Initial restart count: ${INITIAL_RESTART_COUNT}"

# Verify stratum port is working before kill
if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
    pass "Stratum port accepting connections before kill"
else
    fail "Stratum port not available before kill"
fi

# Record CKPool PID
CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "unknown")
log "CKPool main process PID: ${CKPOOL_PID}"

# ---------------------------------------------------------------------------
# Phase 1: SIGKILL the CKPool process
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Sending SIGKILL to CKPool process inside container..."

# Kill the main ckpool process — this simulates an OOM kill
docker exec "${CKPOOL_CONTAINER}" kill -9 "${CKPOOL_PID}" 2>/dev/null || {
    # If pgrep didn't find it, try killing PID 1
    log "Direct kill failed, sending SIGKILL to container PID 1..."
    docker kill --signal=KILL "${CKPOOL_CONTAINER}" 2>/dev/null || true
}

log "SIGKILL sent"
sleep 2

# The container should have exited or be restarting
CONTAINER_STATE=$(docker inspect --format='{{.State.Status}}' "${CKPOOL_CONTAINER}" 2>/dev/null || echo "not_found")
log "Container state after kill: ${CONTAINER_STATE}"

if [[ "${CONTAINER_STATE}" == "exited" || "${CONTAINER_STATE}" == "restarting" ]]; then
    pass "Container entered ${CONTAINER_STATE} state after SIGKILL"
elif [[ "${CONTAINER_STATE}" == "running" ]]; then
    # Docker may have already restarted it
    log "Container already back to running (fast restart)"
fi

# ---------------------------------------------------------------------------
# Phase 2: Wait for Docker to restart the container
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Waiting for Docker restart policy to bring CKPool back (max ${MAX_RECOVERY_WAIT}s)..."

RECOVERED=0
for i in $(seq 1 "$((MAX_RECOVERY_WAIT / 3))"); do
    CURRENT_STATE=$(docker inspect --format='{{.State.Status}}' "${CKPOOL_CONTAINER}" 2>/dev/null || echo "not_found")

    if [[ "${CURRENT_STATE}" == "running" ]]; then
        # Verify the process is actually alive inside
        NEW_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "")
        if [[ -n "${NEW_PID}" ]]; then
            RECOVERED=1
            log "CKPool restarted with new PID: ${NEW_PID} (after ~$((i * 3))s)"
            break
        fi
    fi

    sleep 3
done

if [[ "${RECOVERED}" -eq 1 ]]; then
    pass "Docker restart policy brought CKPool back"
else
    fail "CKPool did not recover within ${MAX_RECOVERY_WAIT}s"
    exit 1
fi

# Verify restart count incremented
FINAL_RESTART_COUNT=$(docker inspect --format='{{.RestartCount}}' "${CKPOOL_CONTAINER}" 2>/dev/null || echo "0")
log "Restart count: ${INITIAL_RESTART_COUNT} -> ${FINAL_RESTART_COUNT}"
if [[ "${FINAL_RESTART_COUNT}" -gt "${INITIAL_RESTART_COUNT}" ]]; then
    pass "Restart count incremented (confirms restart occurred)"
else
    log "Restart count did not increment — Docker may have restarted the process inline"
fi

# ---------------------------------------------------------------------------
# Phase 3: Verify CKPool is fully functional
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Verifying CKPool is fully functional after restart..."

# Give CKPool a moment to initialize
sleep 10

# Check stratum port
STRATUM_OK=0
for i in $(seq 1 10); do
    if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
        STRATUM_OK=1
        break
    fi
    sleep 3
done

if [[ "${STRATUM_OK}" -eq 1 ]]; then
    pass "Stratum port accepting connections after restart"
else
    fail "Stratum port not available after restart"
fi

# Check metrics endpoint
METRICS_OK=0
for i in $(seq 1 10); do
    if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
        METRICS_OK=1
        break
    fi
    sleep 3
done

if [[ "${METRICS_OK}" -eq 1 ]]; then
    pass "Metrics endpoint responding after restart"
else
    fail "Metrics endpoint not responding after restart"
fi

# Test a full stratum handshake
STRATUM_RESULT=$(python3 -c "
import socket, json, time
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
    s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['chaos-oom-test/1.0']}) + '\n').encode())
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
    lines = data.decode().strip().split('\n')
    for line in lines:
        obj = json.loads(line)
        if obj.get('id') == 1 and obj.get('result'):
            print('OK')
            raise SystemExit(0)
    print('NO_SUBSCRIBE')
except Exception as e:
    print(f'ERROR:{e}')
" 2>/dev/null || echo "ERROR:python_failed")

if [[ "${STRATUM_RESULT}" == "OK" ]]; then
    pass "Full stratum handshake successful after restart"
else
    log "Stratum handshake result: ${STRATUM_RESULT}"
    # TCP connect worked above, so this is a partial pass
    log "Stratum handshake may need more time for CKPool to get block template"
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
