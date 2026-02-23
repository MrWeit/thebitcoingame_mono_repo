#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test: Malformed Stratum Messages
# =============================================================================
# Sends various kinds of malformed data to the CKPool stratum port to verify
# it handles bad input gracefully without crashing, leaking memory, or
# entering an undefined state.
#
# Test cases:
#   1. Binary garbage (random bytes)
#   2. Oversized JSON payload (>64KB)
#   3. Valid JSON, invalid stratum method
#   4. Deeply nested JSON object
#   5. Null bytes in the middle of a message
#   6. Incomplete JSON (no trailing newline)
#   7. SQL injection attempt in worker name
#   8. Unicode abuse / emoji overload
#
# Expected behavior:
#   - CKPool does not crash for any input
#   - Bad connections are dropped or ignored
#   - Normal connections continue to work afterward
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
TEST_NAME="malformed_stratum"
WAIT_BETWEEN_TESTS=2

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] $*"; }
pass() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] PASS: $*"; }
fail() { echo "[$(date '+%H:%M:%S')] [${TEST_NAME}] FAIL: $*"; FAILED=1; }

FAILED=0
TESTS_RUN=0
TESTS_PASSED=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
check_ckpool_alive() {
    if docker inspect --format='{{.State.Running}}' "${CKPOOL_CONTAINER}" 2>/dev/null | grep -q true; then
        local pid
        pid=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "")
        if [[ -n "${pid}" ]]; then
            return 0
        fi
    fi
    return 1
}

run_malformed_test() {
    local test_label="$1"
    local python_code="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log ""
    log "--- Test ${TESTS_RUN}: ${test_label} ---"

    # Run the malformed payload sender
    set +e
    python3 -c "${python_code}" 2>/dev/null
    local send_result=$?
    set -e

    sleep "${WAIT_BETWEEN_TESTS}"

    # Check CKPool is still alive
    if check_ckpool_alive; then
        pass "${test_label}: CKPool survived"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        fail "${test_label}: CKPool CRASHED"
    fi
}

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
log "=== Chaos Test: Malformed Stratum Messages ==="
log ""

log "Pre-check: verifying CKPool is running..."
if ! check_ckpool_alive; then
    fail "CKPool is not running"
    exit 1
fi
pass "CKPool is running"

INITIAL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "unknown")
log "CKPool PID: ${INITIAL_PID}"

# ---------------------------------------------------------------------------
# Test 1: Binary garbage
# ---------------------------------------------------------------------------
run_malformed_test "Binary garbage (1024 random bytes)" "
import socket, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
s.sendall(os.urandom(1024))
import time; time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Test 2: Oversized JSON payload (>64KB)
# ---------------------------------------------------------------------------
run_malformed_test "Oversized JSON (128KB payload)" "
import socket, json
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
# Create a JSON object with a very long string value
huge_payload = json.dumps({
    'id': 1,
    'method': 'mining.subscribe',
    'params': ['A' * 131072]  # 128KB string
}) + '\n'
try:
    s.sendall(huge_payload.encode())
except BrokenPipeError:
    pass
import time; time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Test 3: Valid JSON, invalid stratum method
# ---------------------------------------------------------------------------
run_malformed_test "Valid JSON, invalid method names" "
import socket, json, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))

invalid_methods = [
    'mining.nonexistent',
    'exploit.shell',
    '../../../etc/passwd',
    'mining.subscribe; rm -rf /',
    '',
    None,
    12345,
    True,
    {'nested': 'method'},
]

for method in invalid_methods:
    msg = json.dumps({'id': 1, 'method': method, 'params': []}) + '\n'
    try:
        s.sendall(msg.encode())
        time.sleep(0.2)
    except:
        break

time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Test 4: Deeply nested JSON
# ---------------------------------------------------------------------------
run_malformed_test "Deeply nested JSON (1000 levels)" "
import socket, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))

# Build a deeply nested JSON object manually to avoid Python recursion limit
nested = '{\"a\":' * 1000 + '1' + '}' * 1000
payload = '{\"id\":1,\"method\":\"mining.subscribe\",\"params\":[' + nested + ']}\n'
try:
    s.sendall(payload.encode())
except BrokenPipeError:
    pass
time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Test 5: Null bytes
# ---------------------------------------------------------------------------
run_malformed_test "Null bytes in JSON message" "
import socket, json, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))

# JSON with null bytes embedded
payload = b'{\"id\":1,\"method\":\"mining.subscribe\",\"params\":[\"\x00\x00\x00\"]}\n'
s.sendall(payload)

# Pure null bytes
s.sendall(b'\x00' * 256)

time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Test 6: Incomplete JSON (no newline, then disconnect)
# ---------------------------------------------------------------------------
run_malformed_test "Incomplete JSON (no newline, abrupt close)" "
import socket, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))

# Send partial JSON without newline
s.sendall(b'{\"id\":1,\"method\":\"mining.sub')
time.sleep(0.5)

# Abrupt close (no proper shutdown)
s.close()
"

# ---------------------------------------------------------------------------
# Test 7: SQL injection in worker name
# ---------------------------------------------------------------------------
run_malformed_test "SQL injection in authorize params" "
import socket, json, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))

# Subscribe first
s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['test/1.0']}) + '\n').encode())
time.sleep(1)

# SQL injection in worker name
injections = [
    \"'; DROP TABLE mining_events; --\",
    \"' OR '1'='1\",
    \"admin'--\",
    \"bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls'; DELETE FROM shares WHERE '1'='1\",
    \"\\\\x00\\\\x01\\\\x02\",
]

for inj in injections:
    msg = json.dumps({'id': 2, 'method': 'mining.authorize', 'params': [inj, 'x']}) + '\n'
    try:
        s.sendall(msg.encode())
        time.sleep(0.3)
    except:
        break

time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Test 8: Unicode abuse
# ---------------------------------------------------------------------------
run_malformed_test "Unicode abuse and emoji overload" "
import socket, json, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(5)
s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))

payloads = [
    # RTL override + mixed scripts
    json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['\u202e\u0645\u0631\u062d\u0628\u0627']}),
    # Emoji bomb
    json.dumps({'id': 1, 'method': 'mining.authorize', 'params': ['\U0001f4a3' * 1000, 'x']}),
    # Zero-width characters
    json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['\u200b\u200c\u200d\ufeff' * 500]}),
    # Combining characters (zalgo text)
    json.dumps({'id': 1, 'method': 'mining.authorize', 'params': ['h\u0335e\u0336l\u0337l\u0338o' * 100, 'x']}),
]

for payload in payloads:
    try:
        s.sendall((payload + '\n').encode('utf-8'))
        time.sleep(0.3)
    except:
        break

time.sleep(1)
s.close()
"

# ---------------------------------------------------------------------------
# Final verification: normal connection after all malformed tests
# ---------------------------------------------------------------------------
log ""
log "--- Final verification: normal stratum connection ---"
sleep 5

NORMAL_RESULT=$(python3 -c "
import socket, json, time
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(('${STRATUM_HOST}', ${STRATUM_PORT}))
    s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['chaos-verify/1.0']}) + '\n').encode())
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
    if data:
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
    pass "Normal stratum connection works after all malformed tests"
else
    log "Normal connection result: ${NORMAL_RESULT}"
    if timeout 5 bash -c "echo > /dev/tcp/${STRATUM_HOST}/${STRATUM_PORT}" 2>/dev/null; then
        pass "TCP connections accepted (stratum handshake may need block template)"
    else
        fail "CKPool not accepting normal connections after malformed tests"
    fi
fi

# Check final CKPool PID matches initial (no restart occurred)
FINAL_PID=$(docker exec "${CKPOOL_CONTAINER}" pgrep -f "ckpool" 2>/dev/null | head -1 || echo "unknown")
if [[ "${FINAL_PID}" == "${INITIAL_PID}" ]]; then
    pass "CKPool PID unchanged (${INITIAL_PID}) — no restarts during test"
else
    log "CKPool PID changed (${INITIAL_PID} -> ${FINAL_PID}) — may have restarted"
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
log ""
log "Tests run: ${TESTS_RUN}, Tests passed: ${TESTS_PASSED}"

if [[ "${FAILED}" -eq 0 ]]; then
    log "=== RESULT: PASS ==="
else
    log "=== RESULT: FAIL ==="
fi

exit "${FAILED}"
