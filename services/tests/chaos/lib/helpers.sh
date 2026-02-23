#!/usr/bin/env bash
# =============================================================================
# TheBitcoinGame — Chaos Test Shared Helpers
# =============================================================================
# Common functions used across chaos tests. Source this file at the top of
# each test script:
#
#   HELPERS="${SCRIPT_DIR}/lib/helpers.sh"
#   if [[ -f "${HELPERS}" ]]; then source "${HELPERS}"; fi
# =============================================================================

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly CHAOS_CKPOOL_CONTAINER="${CHAOS_CKPOOL_CONTAINER:-tbg-ckpool}"
readonly CHAOS_BITCOIN_CONTAINER="${CHAOS_BITCOIN_CONTAINER:-tbg-bitcoin-signet}"
readonly CHAOS_REDIS_CONTAINER="${CHAOS_REDIS_CONTAINER:-tbg-redis}"
readonly CHAOS_DB_CONTAINER="${CHAOS_DB_CONTAINER:-tbg-timescaledb}"
readonly CHAOS_COLLECTOR_CONTAINER="${CHAOS_COLLECTOR_CONTAINER:-tbg-event-collector}"
readonly CHAOS_STRATUM_HOST="${CHAOS_STRATUM_HOST:-localhost}"
readonly CHAOS_STRATUM_PORT="${CHAOS_STRATUM_PORT:-3333}"
readonly CHAOS_METRICS_URL="${CHAOS_METRICS_URL:-http://localhost:9100/metrics}"

# ---------------------------------------------------------------------------
# Container helpers
# ---------------------------------------------------------------------------

# Check if a Docker container is running
# Usage: container_running "tbg-ckpool"
container_running() {
    local container="$1"
    docker inspect --format='{{.State.Running}}' "${container}" 2>/dev/null | grep -q true
}

# Wait for a container to be running (with timeout)
# Usage: wait_container_running "tbg-ckpool" 60
wait_container_running() {
    local container="$1"
    local timeout="${2:-60}"
    local elapsed=0

    while [[ "${elapsed}" -lt "${timeout}" ]]; do
        if container_running "${container}"; then
            return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
    done
    return 1
}

# Get the restart count of a container
# Usage: get_restart_count "tbg-ckpool"
get_restart_count() {
    local container="$1"
    docker inspect --format='{{.RestartCount}}' "${container}" 2>/dev/null || echo "0"
}

# ---------------------------------------------------------------------------
# CKPool helpers
# ---------------------------------------------------------------------------

# Check if CKPool process is alive inside the container
# Usage: ckpool_process_alive
ckpool_process_alive() {
    local pid
    pid=$(docker exec "${CHAOS_CKPOOL_CONTAINER}" pgrep -f ckpool 2>/dev/null | head -1 || echo "")
    [[ -n "${pid}" ]]
}

# Get CKPool block height from Prometheus metrics
# Usage: get_block_height
get_block_height() {
    curl -sf "${CHAOS_METRICS_URL}" 2>/dev/null \
        | grep -E "^ckpool_block_height " \
        | awk '{print $2}' \
        || echo ""
}

# Test if stratum port is accepting TCP connections
# Usage: stratum_port_open
stratum_port_open() {
    timeout 5 bash -c "echo > /dev/tcp/${CHAOS_STRATUM_HOST}/${CHAOS_STRATUM_PORT}" 2>/dev/null
}

# Perform a full stratum subscribe handshake
# Returns "OK" on success, "ERROR:..." on failure
# Usage: stratum_subscribe "test-client/1.0"
stratum_subscribe() {
    local client_name="${1:-chaos-helper/1.0}"
    python3 -c "
import socket, json, time
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10)
    s.connect(('${CHAOS_STRATUM_HOST}', ${CHAOS_STRATUM_PORT}))
    s.sendall((json.dumps({'id': 1, 'method': 'mining.subscribe', 'params': ['${client_name}']}) + '\n').encode())
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
" 2>/dev/null || echo "ERROR:python_failed"
}

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

# Run a SQL query against TimescaleDB
# Usage: run_sql "SELECT COUNT(*) FROM mining_events;"
run_sql() {
    local query="$1"
    docker exec "${CHAOS_DB_CONTAINER}" psql -U tbg -d thebitcoingame -t -A -c "${query}" 2>/dev/null
}

# Get the current mining_events count
# Usage: get_event_count
get_event_count() {
    run_sql "SELECT COUNT(*) FROM mining_events;" || echo "0"
}

# ---------------------------------------------------------------------------
# Timing helpers
# ---------------------------------------------------------------------------

# Record a timestamp for duration tracking
# Usage: start_timer; ... ; elapsed=$(elapsed_time)
_TIMER_START=0
start_timer() {
    _TIMER_START=$(date +%s)
}

elapsed_time() {
    local now
    now=$(date +%s)
    echo $((now - _TIMER_START))
}
