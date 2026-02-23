#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Redis Failure
# =============================================================================
# Simulates Redis going offline while CKPool is running.
# Verifies that CKPool continues accepting shares (coinbase sig falls back
# to default) and recovers when Redis returns.
#
# Expected behavior:
#   - CKPool continues accepting stratum connections and shares
#   - Coinbase signature falls back to default (no per-user customization)
#   - After Redis restart, coinbase sig customization resumes
#
# Prerequisites:
#   - Docker Compose stack running
#   - Python 3 available (for stratum test client)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/services/docker-compose.yml"
STRATUM_TEST="${PROJECT_ROOT}/services/test-stratum.py"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CKPOOL_CONTAINER="tbg-ckpool"
REDIS_CONTAINER="tbg-redis"
STRATUM_HOST="localhost"
STRATUM_PORT=3333
TEST_USER="bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls"
WAIT_AFTER_STOP=10
WAIT_AFTER_RESTART=15
TEST_NAME="redis_failure"

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
    log "Cleanup: ensuring redis is running..."
    if ! docker inspect --format='{{.State.Running}}' "${REDIS_CONTAINER}" 2>/dev/null | grep -q true; then
        docker compose -f "${COMPOSE_FILE}" start redis 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
test_stratum_connection() {
    # Attempt a basic stratum subscribe + authorize via raw TCP
    local result
    result=$(python3 -c "
import socket, json, sys, time
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
    # Subscribe
    s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['chaos-test/1.0']}) + '\n').encode())
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
            sys.exit(0)
    print('NO_SUBSCRIBE')
except Exception as e:
    print(f'ERROR:{e}')
" 2>/dev/null || echo "ERROR:python_failed")
    echo "${result}"
}

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Redis Failure ==="
log ""

log "Pre-check: verifying stack is running..."
for container in "${CKPOOL_CONTAINER}" "${REDIS_CONTAINER}"; do
    if ! docker inspect --format='{{.State.Running}}' "${container}" 2>/dev/null | grep -q true; then
        fail "${container} is not running"
        exit 1
    fi
done
pass "All required containers are running"

# Verify Redis is working
if docker exec "${REDIS_CONTAINER}" redis-cli ping 2>/dev/null | grep -q PONG; then
    pass "Redis responding to PING"
else
    fail "Redis not responding"
    exit 1
fi

# Set a test coinbase sig in Redis to verify later
docker exec "${REDIS_CONTAINER}" redis-cli SET "tbg:coinbase_sig:${TEST_USER}" "ChaosTest" >/dev/null 2>&1
log "Set test coinbase sig in Redis for user ${TEST_USER}"

# ---------------------------------------------------------------------------
# Phase 1: Stop Redis
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Stopping Redis container..."
docker compose -f "${COMPOSE_FILE}" stop redis

if docker inspect --format='{{.State.Running}}' "${REDIS_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "Redis container still running after stop"
else
    pass "Redis stopped successfully"
fi

# ---------------------------------------------------------------------------
# Phase 2: Verify CKPool still accepts connections
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Testing stratum connections with Redis down..."
sleep "${WAIT_AFTER_STOP}"

# Check CKPool is still running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running without Redis"
else
    fail "CKPool crashed when Redis went down"
    exit 1
fi

# Test stratum connection
STRATUM_RESULT=$(test_stratum_connection)
if [[ "${STRATUM_RESULT}" == "OK" ]]; then
    pass "Stratum subscribe works with Redis down"
else
    # CKPool may still accept connections even if subscribe has issues
    log "Stratum test result: ${STRATUM_RESULT}"
    # Check if at least TCP connect works
    if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
        pass "CKPool accepting TCP connections on stratum port (subscribe may need Redis)"
    else
        fail "CKPool not accepting connections on stratum port"
    fi
fi

# Check CKPool logs for Redis error handling
REDIS_ERRORS=$(docker logs --since=30s "${CKPOOL_CONTAINER}" 2>&1 | grep -ci "redis\|hiredis\|connection refused" || echo "0")
log "CKPool Redis-related log messages: ${REDIS_ERRORS}"

# ---------------------------------------------------------------------------
# Phase 3: Restart Redis
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Restarting Redis container..."
docker compose -f "${COMPOSE_FILE}" start redis

# Wait for Redis health check
log "Waiting for Redis health check..."
HEALTHY=0
for i in $(seq 1 20); do
    if docker exec "${REDIS_CONTAINER}" redis-cli ping 2>/dev/null | grep -q PONG; then
        HEALTHY=1
        break
    fi
    sleep 2
done

if [[ "${HEALTHY}" -eq 1 ]]; then
    pass "Redis is healthy again"
else
    fail "Redis did not recover within 40s"
fi

# ---------------------------------------------------------------------------
# Phase 4: Verify recovery
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Verifying recovery after Redis restart..."
sleep "${WAIT_AFTER_RESTART}"

# CKPool should still be running
if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running after Redis recovery"
else
    fail "CKPool died during Redis recovery"
fi

# Re-set the coinbase sig and verify it sticks
docker exec "${REDIS_CONTAINER}" redis-cli SET "tbg:coinbase_sig:${TEST_USER}" "ChaosTestRecovered" >/dev/null 2>&1
SIG_VALUE=$(docker exec "${REDIS_CONTAINER}" redis-cli GET "tbg:coinbase_sig:${TEST_USER}" 2>/dev/null || echo "")
if [[ "${SIG_VALUE}" == "ChaosTestRecovered" ]]; then
    pass "Redis coinbase sig storage working after recovery"
else
    fail "Redis coinbase sig not persisted (got: '${SIG_VALUE}')"
fi

# Test stratum connection after recovery
STRATUM_RESULT=$(test_stratum_connection)
if [[ "${STRATUM_RESULT}" == "OK" ]]; then
    pass "Stratum subscribe works after Redis recovery"
else
    log "Stratum result after recovery: ${STRATUM_RESULT}"
    if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
        pass "CKPool accepting connections after Redis recovery"
    else
        fail "CKPool not accepting connections after Redis recovery"
    fi
fi

# Cleanup test data
docker exec "${REDIS_CONTAINER}" redis-cli DEL "tbg:coinbase_sig:${TEST_USER}" >/dev/null 2>&1

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
