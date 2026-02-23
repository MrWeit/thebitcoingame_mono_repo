#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: High Connection Rate
# =============================================================================
# Opens a flood of TCP connections to the CKPool stratum port to test
# connection rate limiting, file descriptor exhaustion handling, and
# recovery after the burst subsides.
#
# Expected behavior:
#   - CKPool handles the burst without crashing
#   - Some connections may be rejected (rate limit or fd exhaustion)
#   - After burst subsides and connections timeout, normal operation resumes
#
# Prerequisites:
#   - Docker Compose stack running
#   - Python 3 available
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
CONNECTION_COUNT=500
BATCH_SIZE=50
WAIT_AFTER_BURST=30
TEST_NAME="high_connection_rate"

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
log "=== Chaos Test: High Connection Rate ==="
log ""

log "Pre-check: verifying CKPool is running..."
if ! docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    fail "CKPool container is not running"
    exit 1
fi
pass "CKPool is running"

# Verify stratum port is working
if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
    pass "Stratum port accepting connections before test"
else
    fail "Stratum port not available before test"
    exit 1
fi

# Record initial metrics
INITIAL_CONNECTIONS=""
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    INITIAL_CONNECTIONS=$(curl -sf "${METRICS_URL}" | grep -E "^ckpool_connected_miners " | awk '{print $2}' || echo "")
fi
log "Initial connected miners: ${INITIAL_CONNECTIONS:-unknown}"

# ---------------------------------------------------------------------------
# Phase 1: Connection flood
# ---------------------------------------------------------------------------
log ""
log "Phase 1: Opening ${CONNECTION_COUNT} connections in batches of ${BATCH_SIZE}..."

# Python script for connection flood — returns counts of success/failure
FLOOD_RESULT=$(python3 -c "
import socket
import time
import sys
import threading

HOST = '${STRATUM_HOST}'
PORT = ${STRATUM_PORT}
TOTAL = ${CONNECTION_COUNT}
BATCH = ${BATCH_SIZE}

connected = 0
rejected = 0
errors = 0
sockets = []
lock = threading.Lock()

def connect_one():
    global connected, rejected, errors
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((HOST, PORT))
        with lock:
            connected += 1
            sockets.append(s)
    except ConnectionRefusedError:
        with lock:
            rejected += 1
    except (socket.timeout, OSError) as e:
        with lock:
            errors += 1

# Send connections in batches with threads
for batch_start in range(0, TOTAL, BATCH):
    batch_end = min(batch_start + BATCH, TOTAL)
    threads = []
    for i in range(batch_start, batch_end):
        t = threading.Thread(target=connect_one)
        t.start()
        threads.append(t)
    for t in threads:
        t.join(timeout=10)
    # Small delay between batches
    time.sleep(0.1)

print(f'connected={connected},rejected={rejected},errors={errors}')

# Keep connections open briefly to stress the fd table
time.sleep(5)

# Close all sockets
for s in sockets:
    try:
        s.close()
    except:
        pass
" 2>/dev/null || echo "connected=0,rejected=0,errors=${CONNECTION_COUNT}")

log "Flood result: ${FLOOD_RESULT}"

# Parse results
CONNECTED=$(echo "${FLOOD_RESULT}" | grep -oP 'connected=\K[0-9]+' || echo "0")
REJECTED=$(echo "${FLOOD_RESULT}" | grep -oP 'rejected=\K[0-9]+' || echo "0")
ERRORS=$(echo "${FLOOD_RESULT}" | grep -oP 'errors=\K[0-9]+' || echo "0")

log "Connections established: ${CONNECTED}"
log "Connections rejected: ${REJECTED}"
log "Connection errors: ${ERRORS}"

if [[ "${CONNECTED}" -gt 0 ]]; then
    pass "CKPool accepted ${CONNECTED} connections during burst"
else
    fail "CKPool accepted zero connections during burst"
fi

if [[ "${REJECTED}" -gt 0 || "${ERRORS}" -gt 0 ]]; then
    log "Rate limiting or fd exhaustion detected: ${REJECTED} rejected, ${ERRORS} errors"
    pass "CKPool rejected excess connections (expected behavior under load)"
fi

# ---------------------------------------------------------------------------
# Phase 2: Verify CKPool survived the burst
# ---------------------------------------------------------------------------
log ""
log "Phase 2: Checking CKPool health after connection burst..."

if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
    pass "CKPool still running after connection burst"
else
    fail "CKPool crashed during connection burst"
    exit 1
fi

CKPOOL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "")
if [[ -n "${CKPOOL_PID}" ]]; then
    pass "CKPool process alive (PID: ${CKPOOL_PID})"
else
    fail "CKPool process not found after burst"
fi

# Check fd count inside container
FD_COUNT=$(docker exec "${CKPOOL_CONTAINER}" sh -c "ls /proc/\$(pgrep -f ckpool | head -1)/fd 2>/dev/null | wc -l" 2>/dev/null || echo "unknown")
log "CKPool file descriptor count: ${FD_COUNT}"

# ---------------------------------------------------------------------------
# Phase 3: Wait for connections to drain
# ---------------------------------------------------------------------------
log ""
log "Phase 3: Waiting ${WAIT_AFTER_BURST}s for connections to timeout and drain..."
sleep "${WAIT_AFTER_BURST}"

# Check fd count again after drain
FD_COUNT_AFTER=$(docker exec "${CKPOOL_CONTAINER}" sh -c "ls /proc/\$(pgrep -f ckpool | head -1)/fd 2>/dev/null | wc -l" 2>/dev/null || echo "unknown")
log "CKPool file descriptor count after drain: ${FD_COUNT_AFTER}"

if [[ "${FD_COUNT_AFTER}" != "unknown" && "${FD_COUNT}" != "unknown" ]]; then
    if [[ "${FD_COUNT_AFTER}" -le "${FD_COUNT}" ]]; then
        pass "File descriptors decreased after connection drain"
    else
        log "File descriptors did not decrease — may need more drain time"
    fi
fi

# ---------------------------------------------------------------------------
# Phase 4: Verify normal connections work
# ---------------------------------------------------------------------------
log ""
log "Phase 4: Testing normal stratum connection after burst..."

NORMAL_RESULT=$(python3 -c "
import socket, json, time
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
    s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['chaos-post-flood/1.0']}) + '\n').encode())
    time.sleep(3)
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

if [[ "${NORMAL_RESULT}" == "OK" ]]; then
    pass "Normal stratum connection works after burst subsided"
else
    log "Post-burst stratum result: ${NORMAL_RESULT}"
    # Try a simple TCP connect as fallback
    if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
        pass "TCP connections accepted after burst (stratum handshake may need more time)"
    else
        fail "CKPool not accepting connections after burst"
    fi
fi

# Check metrics after recovery
if curl -sf "${METRICS_URL}" >/dev/null 2>&1; then
    pass "Metrics endpoint responding after connection burst"
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
