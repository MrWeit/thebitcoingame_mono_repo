#!/bin/bash
# =============================================================================
# valgrind_test.sh — Memory leak detection for ckpool via Valgrind + Docker
# =============================================================================
#
# Purpose:
#   Builds ckpool with debug symbols inside Docker, runs it under Valgrind
#   memcheck while a Python stratum client submits shares for 5 minutes,
#   then gracefully shuts down ckpool and reports memory leak results.
#
# Usage:
#   ./valgrind_test.sh                   # Full 5-minute test
#   ./valgrind_test.sh --duration 60     # Custom duration in seconds
#   ./valgrind_test.sh --quick           # 30-second quick smoke test
#   ./valgrind_test.sh --keep            # Keep containers after test
#
# Requirements:
#   - Docker and Docker Compose
#   - Network access to pull base images (first run only)
#
# What it does:
#   1. Builds a debug Docker image with Valgrind and debug symbols (-g -O0)
#   2. Starts Bitcoin Core signet in a container
#   3. Starts ckpool under Valgrind memcheck in another container
#   4. Waits for ckpool stratum port to become ready
#   5. Runs a Python stratum client that subscribes + authorizes + submits
#   6. Sends SIGTERM to ckpool for graceful shutdown
#   7. Parses Valgrind output for "definitely lost" and "indirectly lost"
#   8. Outputs PASS/FAIL with detailed leak summary
#
# Exit codes:
#   0 — PASS (no definite or indirect leaks)
#   1 — FAIL (leaks detected or infrastructure error)
#   2 — SKIP (Docker not available)
#
# Note: ckpool is Linux-only. This script runs everything inside Docker
# so it works from macOS or Linux hosts.
# =============================================================================
set -e

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CKPOOL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICES_DIR="$(cd "${CKPOOL_DIR}/.." && pwd)"

# Default test duration: 5 minutes (300 seconds)
TEST_DURATION=300
KEEP_CONTAINERS=0
PROJECT_NAME="tbg-valgrind"
VALGRIND_LOG="/tmp/valgrind-ckpool.log"

# Leak thresholds (bytes). Set to 0 for zero-tolerance.
# "possibly lost" is excluded because Valgrind often misclassifies
# pthread stack frames as possibly-lost.
MAX_DEFINITELY_LOST=0
MAX_INDIRECTLY_LOST=0

# ─── Argument parsing ───────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --duration)
            TEST_DURATION="$2"
            shift 2
            ;;
        --quick)
            TEST_DURATION=30
            shift
            ;;
        --keep)
            KEEP_CONTAINERS=1
            shift
            ;;
        --help|-h)
            head -35 "$0" | tail -30
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ─── Preflight checks ───────────────────────────────────────────────────────

if ! command -v docker >/dev/null 2>&1; then
    echo "SKIP: Docker not found in PATH."
    exit 2
fi

if ! docker info >/dev/null 2>&1; then
    echo "SKIP: Docker daemon not running."
    exit 2
fi

echo "============================================================"
echo "  ckpool Valgrind Memory Leak Test"
echo "============================================================"
echo "  Duration:    ${TEST_DURATION}s"
echo "  Project:     ${PROJECT_NAME}"
echo "  Ckpool dir:  ${CKPOOL_DIR}"
echo "============================================================"
echo ""

# ─── Cleanup function ───────────────────────────────────────────────────────

cleanup() {
    local exit_code=$?
    echo ""
    echo "--- Cleaning up ---"

    if [ "${KEEP_CONTAINERS}" -eq 0 ]; then
        docker compose -p "${PROJECT_NAME}" -f "${SERVICES_DIR}/docker-compose.yml" \
            down -v --remove-orphans 2>/dev/null || true
        docker rm -f "${PROJECT_NAME}-valgrind" 2>/dev/null || true
        docker rm -f "${PROJECT_NAME}-stratum-client" 2>/dev/null || true
        docker network rm "${PROJECT_NAME}_default" 2>/dev/null || true
    else
        echo "  --keep flag set, leaving containers running."
        echo "  Clean up manually with:"
        echo "    docker compose -p ${PROJECT_NAME} down -v"
        echo "    docker rm -f ${PROJECT_NAME}-valgrind ${PROJECT_NAME}-stratum-client"
    fi

    exit ${exit_code}
}
trap cleanup EXIT

# ─── Step 1: Build debug Docker image with Valgrind ─────────────────────────

echo "[1/7] Building ckpool debug image with Valgrind..."

# Create a temporary Dockerfile that extends the normal build with debug
# symbols and includes Valgrind in the runtime image.
DOCKERFILE_DEBUG=$(mktemp)
cat > "${DOCKERFILE_DEBUG}" <<'DOCKERFILE_EOF'
## ckpool debug build with Valgrind support
## Based on the production Dockerfile but with:
##   - Debug symbols (-g -O0) instead of optimization
##   - Valgrind installed in the runtime image
##   - No stripped binaries

FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    yasm \
    libjansson-dev \
    libhiredis-dev \
    libcap2-bin \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone and pin upstream ckpool
RUN git clone https://bitbucket.org/ckolivas/ckpool.git /build/ckpool-src && \
    cd /build/ckpool-src && \
    git checkout 88e99e0b6fc7e28796c8450b42fa00070b66c6e3

WORKDIR /build/ckpool-src

# Copy and apply patches
COPY patches/ /build/patches/
RUN chmod +x /build/patches/apply-patches.sh /build/patches/[0-9][0-9]-*.sh && \
    /build/patches/apply-patches.sh /build/ckpool-src

# Copy TBG extension source files
COPY src/tbg_*.c src/tbg_*.h /build/ckpool-src/src/

# Build with DEBUG SYMBOLS and NO OPTIMIZATION for Valgrind accuracy.
# -g: full debug info, -O0: no optimization (prevents inlining/reordering),
# -fno-omit-frame-pointer: accurate stack traces in Valgrind output.
RUN ./autogen.sh && \
    CFLAGS="-g -O0 -fno-omit-frame-pointer -Wall" \
    ./configure --prefix=/opt/ckpool --without-ckdb && \
    make -j$(nproc)

# Install manually (skip make install / setcap issues in Docker)
RUN mkdir -p /build/install/opt/ckpool/bin && \
    cp src/ckpool src/ckpmsg src/notifier /build/install/opt/ckpool/bin/

# --- Runtime image with Valgrind ---
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libjansson4 \
    libhiredis0.14 \
    libcap2-bin \
    valgrind \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy built debug binary (NOT stripped)
COPY --from=builder /build/install/opt/ckpool /opt/ckpool

# Create necessary directories
RUN mkdir -p /var/log/ckpool /var/run/ckpool /tmp/ckpool /etc/ckpool && \
    chmod 777 /tmp/ckpool /var/log/ckpool /var/run/ckpool

ENV PATH="/opt/ckpool/bin:${PATH}"

EXPOSE 3333
EXPOSE 9100
EXPOSE 8881
DOCKERFILE_EOF

docker build \
    -t "${PROJECT_NAME}-ckpool-debug:latest" \
    -f "${DOCKERFILE_DEBUG}" \
    "${CKPOOL_DIR}" \
    2>&1 | tail -5

rm -f "${DOCKERFILE_DEBUG}"
echo "  Debug image built successfully."

# ─── Step 2: Create Docker network and start Bitcoin Core signet ─────────────

echo ""
echo "[2/7] Starting Bitcoin Core signet..."

docker network create "${PROJECT_NAME}_default" 2>/dev/null || true

docker run -d \
    --name "${PROJECT_NAME}-bitcoin" \
    --network "${PROJECT_NAME}_default" \
    --network-alias bitcoin-signet \
    lncm/bitcoind:v27.0 \
    -signet \
    -server=1 \
    -rpcuser=tbg \
    -rpcpassword=tbgdev2026 \
    -rpcallowip=0.0.0.0/0 \
    -rpcbind=0.0.0.0 \
    -rpcport=38332 \
    -txindex=1 \
    -fallbackfee=0.00001 \
    -dbcache=256

# Wait for Bitcoin Core to be ready (up to 120s)
echo "  Waiting for Bitcoin Core RPC..."
BITCOIN_READY=0
for i in $(seq 1 120); do
    if docker exec "${PROJECT_NAME}-bitcoin" \
        bitcoin-cli -signet -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 \
        getblockchaininfo >/dev/null 2>&1; then
        BITCOIN_READY=1
        break
    fi
    sleep 1
done

if [ "${BITCOIN_READY}" -eq 0 ]; then
    echo "  FAIL: Bitcoin Core did not become ready within 120s."
    echo "  Logs:"
    docker logs "${PROJECT_NAME}-bitcoin" 2>&1 | tail -20
    exit 1
fi
echo "  Bitcoin Core signet is ready."

# ─── Step 3: Start ckpool under Valgrind ─────────────────────────────────────

echo ""
echo "[3/7] Starting ckpool under Valgrind memcheck..."

# Mount the ckpool config and run under Valgrind.
# Key Valgrind flags:
#   --leak-check=full          Show details for each leak
#   --show-leak-kinds=all      Report definite, indirect, possible, reachable
#   --track-origins=yes        Show where uninitialized values came from
#   --log-file=<path>          Write Valgrind output to file (not mixed with ckpool logs)
#   --error-exitcode=0         Don't change ckpool's exit code (we parse the log ourselves)
#   --suppressions             Suppress known-safe patterns (pthread, glibc)
docker run -d \
    --name "${PROJECT_NAME}-valgrind" \
    --network "${PROJECT_NAME}_default" \
    -v "${CKPOOL_DIR}/config:/etc/ckpool:ro" \
    -p 13333:3333 \
    "${PROJECT_NAME}-ckpool-debug:latest" \
    /bin/sh -c "
        rm -f /var/run/ckpool/main.pid && \
        valgrind \
            --tool=memcheck \
            --leak-check=full \
            --show-leak-kinds=all \
            --track-origins=yes \
            --verbose \
            --log-file=${VALGRIND_LOG} \
            --error-exitcode=0 \
            --num-callers=30 \
            --track-fds=yes \
            /opt/ckpool/bin/ckpool \
                -c /etc/ckpool/ckpool-signet.conf \
                -s /var/run/ckpool \
                -l 7 \
        ; echo \"VALGRIND_EXIT=\$?\" >> ${VALGRIND_LOG} \
        ; sleep 5
    "

# ─── Step 4: Wait for ckpool stratum port to be ready ────────────────────────

echo ""
echo "[4/7] Waiting for ckpool stratum port (3333)..."

# Under Valgrind, ckpool starts much slower (10-50x). Give it up to 180s.
CKPOOL_READY=0
for i in $(seq 1 180); do
    # Check if the container is still running
    if ! docker inspect "${PROJECT_NAME}-valgrind" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
        echo "  FAIL: ckpool container exited prematurely."
        echo "  Container logs:"
        docker logs "${PROJECT_NAME}-valgrind" 2>&1 | tail -30
        exit 1
    fi

    # Try connecting to stratum port inside the container
    if docker exec "${PROJECT_NAME}-valgrind" \
        sh -c "echo '' | timeout 2 python3 -c \"
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect(('127.0.0.1', 3333))
    s.close()
    sys.exit(0)
except:
    sys.exit(1)
\"" 2>/dev/null; then
        CKPOOL_READY=1
        break
    fi

    if [ $((i % 15)) -eq 0 ]; then
        echo "  Still waiting... (${i}s elapsed, Valgrind is slow)"
    fi
    sleep 1
done

if [ "${CKPOOL_READY}" -eq 0 ]; then
    echo "  FAIL: ckpool stratum port did not open within 180s."
    echo "  Container logs:"
    docker logs "${PROJECT_NAME}-valgrind" 2>&1 | tail -40
    exit 1
fi
echo "  ckpool is accepting stratum connections."

# ─── Step 5: Run stratum client for TEST_DURATION seconds ───────────────────

echo ""
echo "[5/7] Running stratum client for ${TEST_DURATION}s..."

# We use a self-contained Python stratum client instead of cpuminer-multi
# because: (a) it's simpler to package, (b) we don't need real mining,
# just protocol exercise to stress ckpool's memory paths, and (c) we can
# control the exact sequence of subscribe/authorize/submit calls.

STRATUM_CLIENT=$(mktemp)
cat > "${STRATUM_CLIENT}" <<'PYTHON_EOF'
#!/usr/bin/env python3
"""
Minimal Stratum v1 client for memory leak testing.

Connects to ckpool, performs mining.subscribe + mining.authorize,
then periodically submits dummy shares to exercise ckpool's
memory allocation paths (client handling, share processing,
difficulty adjustment, etc.).

This is NOT a real miner — shares will be rejected, but that's
fine. The goal is to exercise code paths that allocate/free memory.
"""
import socket
import json
import time
import sys
import signal
import random
import string

# Configuration
HOST = "127.0.0.1"
PORT = 3333
WORKER_NAME = "bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls.valgrind-test"
DURATION = int(sys.argv[1]) if len(sys.argv) > 1 else 300
NUM_WORKERS = 3  # Simulate multiple workers connecting

running = True

def signal_handler(sig, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def random_hex(length):
    return ''.join(random.choices('0123456789abcdef', k=length))

def send_json(sock, obj):
    """Send a JSON-RPC message over the stratum socket."""
    line = json.dumps(obj) + "\n"
    sock.sendall(line.encode())

def recv_json(sock, timeout=10):
    """Receive a JSON-RPC response (line-delimited)."""
    sock.settimeout(timeout)
    buf = b""
    try:
        while b"\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                return None
            buf += chunk
    except socket.timeout:
        return None

    lines = buf.split(b"\n")
    results = []
    for line in lines:
        line = line.strip()
        if line:
            try:
                results.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return results

def run_worker(worker_id, duration):
    """Simulate a single stratum worker."""
    global running

    worker_name = f"{WORKER_NAME}-{worker_id}"
    print(f"  Worker {worker_id}: connecting as {worker_name}")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(15)
        sock.connect((HOST, PORT))
    except Exception as e:
        print(f"  Worker {worker_id}: connection failed: {e}")
        return

    msg_id = 1

    try:
        # mining.subscribe
        send_json(sock, {
            "id": msg_id,
            "method": "mining.subscribe",
            "params": ["valgrind-test/1.0"]
        })
        msg_id += 1

        resp = recv_json(sock)
        if resp:
            print(f"  Worker {worker_id}: subscribed")
        else:
            print(f"  Worker {worker_id}: no subscribe response")
            return

        # mining.authorize
        send_json(sock, {
            "id": msg_id,
            "method": "mining.authorize",
            "params": [worker_name, "x"]
        })
        msg_id += 1

        resp = recv_json(sock)
        if resp:
            print(f"  Worker {worker_id}: authorized")

        # Submit dummy shares in a loop to exercise memory paths
        start = time.time()
        shares_submitted = 0
        reconnects = 0

        while running and (time.time() - start) < duration:
            try:
                # Submit a dummy share (will be rejected — that's fine)
                send_json(sock, {
                    "id": msg_id,
                    "method": "mining.submit",
                    "params": [
                        worker_name,
                        random_hex(8),        # job_id
                        random_hex(8),        # extranonce2
                        random_hex(8),        # ntime
                        random_hex(8),        # nonce
                    ]
                })
                msg_id += 1
                shares_submitted += 1

                # Drain any incoming messages (notifications, responses)
                try:
                    sock.settimeout(0.5)
                    data = sock.recv(8192)
                    if not data:
                        raise ConnectionError("Server closed connection")
                except socket.timeout:
                    pass
                except ConnectionError:
                    # Reconnect
                    reconnects += 1
                    if reconnects > 10:
                        print(f"  Worker {worker_id}: too many reconnects, stopping")
                        break
                    print(f"  Worker {worker_id}: reconnecting ({reconnects})...")
                    sock.close()
                    time.sleep(2)
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(15)
                    sock.connect((HOST, PORT))
                    # Re-subscribe + authorize
                    send_json(sock, {"id": msg_id, "method": "mining.subscribe", "params": ["valgrind-test/1.0"]})
                    msg_id += 1
                    recv_json(sock)
                    send_json(sock, {"id": msg_id, "method": "mining.authorize", "params": [worker_name, "x"]})
                    msg_id += 1
                    recv_json(sock)

                # Pace: ~2 shares/second per worker to keep ckpool busy but not flooded
                time.sleep(0.5)

            except Exception as e:
                print(f"  Worker {worker_id}: error: {e}")
                time.sleep(1)

        elapsed = time.time() - start
        print(f"  Worker {worker_id}: done. {shares_submitted} shares in {elapsed:.0f}s ({reconnects} reconnects)")

    finally:
        try:
            sock.close()
        except:
            pass

def main():
    print(f"Stratum client starting: {NUM_WORKERS} workers, {DURATION}s duration")

    import threading
    threads = []

    # Stagger worker starts to simulate real-world connection patterns
    for i in range(NUM_WORKERS):
        t = threading.Thread(target=run_worker, args=(i, DURATION), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(2)  # Stagger by 2s

    # Wait for all workers to finish
    for t in threads:
        t.join(timeout=DURATION + 30)

    print("Stratum client finished.")

if __name__ == "__main__":
    main()
PYTHON_EOF

# Run the stratum client inside the valgrind container (which has python3)
docker cp "${STRATUM_CLIENT}" "${PROJECT_NAME}-valgrind:/tmp/stratum_client.py"
rm -f "${STRATUM_CLIENT}"

# Execute stratum client in the background inside the container
docker exec -d "${PROJECT_NAME}-valgrind" \
    python3 /tmp/stratum_client.py "${TEST_DURATION}"

# Show progress while waiting
ELAPSED=0
while [ "${ELAPSED}" -lt "${TEST_DURATION}" ]; do
    sleep 10
    ELAPSED=$((ELAPSED + 10))
    REMAINING=$((TEST_DURATION - ELAPSED))
    if [ "${REMAINING}" -gt 0 ]; then
        echo "  ${REMAINING}s remaining..."
    fi
done

# Small grace period for the client to finish cleanly
sleep 5
echo "  Share submission complete."

# ─── Step 6: Graceful shutdown — send SIGTERM to ckpool ──────────────────────

echo ""
echo "[6/7] Sending SIGTERM to ckpool for graceful shutdown..."

# Find the ckpool PID inside the container (child of valgrind)
CKPOOL_PID=$(docker exec "${PROJECT_NAME}-valgrind" \
    sh -c "ps aux | grep '[/]opt/ckpool/bin/ckpool' | head -1 | awk '{print \$2}'" 2>/dev/null || echo "")

if [ -n "${CKPOOL_PID}" ]; then
    echo "  Found ckpool PID: ${CKPOOL_PID}"
    docker exec "${PROJECT_NAME}-valgrind" kill -TERM "${CKPOOL_PID}" 2>/dev/null || true
else
    echo "  WARNING: Could not find ckpool PID. Sending SIGTERM to Valgrind wrapper."
    # SIGTERM to PID 1 (valgrind) which will forward to ckpool
    docker exec "${PROJECT_NAME}-valgrind" kill -TERM 1 2>/dev/null || true
fi

# Wait for Valgrind to finish its leak summary (can take 30-60s)
echo "  Waiting for Valgrind to complete leak analysis..."
SHUTDOWN_TIMEOUT=120
for i in $(seq 1 "${SHUTDOWN_TIMEOUT}"); do
    if ! docker inspect "${PROJECT_NAME}-valgrind" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
        break
    fi
    if [ $((i % 15)) -eq 0 ]; then
        echo "  Still waiting for Valgrind... (${i}s)"
    fi
    sleep 1
done

# If still running after timeout, force stop
if docker inspect "${PROJECT_NAME}-valgrind" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "  WARNING: Force-stopping container after ${SHUTDOWN_TIMEOUT}s timeout."
    docker stop -t 10 "${PROJECT_NAME}-valgrind" 2>/dev/null || true
fi

# ─── Step 7: Extract and parse Valgrind output ──────────────────────────────

echo ""
echo "[7/7] Parsing Valgrind results..."

# Copy the Valgrind log out of the container
VALGRIND_OUTPUT=$(mktemp)
docker cp "${PROJECT_NAME}-valgrind:${VALGRIND_LOG}" "${VALGRIND_OUTPUT}" 2>/dev/null || true

if [ ! -s "${VALGRIND_OUTPUT}" ]; then
    echo "  WARNING: Valgrind log is empty or missing."
    echo "  Container logs:"
    docker logs "${PROJECT_NAME}-valgrind" 2>&1 | tail -40
    rm -f "${VALGRIND_OUTPUT}"
    echo ""
    echo "============================================================"
    echo "  RESULT: FAIL (no Valgrind output captured)"
    echo "============================================================"
    exit 1
fi

# ─── Parse the Valgrind leak summary ────────────────────────────────────────
# Valgrind LEAK SUMMARY looks like:
#   ==PID== LEAK SUMMARY:
#   ==PID==    definitely lost: X bytes in Y blocks
#   ==PID==    indirectly lost: X bytes in Y blocks
#   ==PID==      possibly lost: X bytes in Y blocks
#   ==PID==    still reachable: X bytes in Y blocks
#   ==PID==         suppressed: X bytes in Y blocks

echo ""
echo "─── Valgrind Leak Summary ───"

# Extract the LEAK SUMMARY section
DEFINITELY_LOST=$(grep "definitely lost:" "${VALGRIND_OUTPUT}" | tail -1 | grep -oP '[\d,]+(?= bytes)' | tr -d ',' || echo "0")
INDIRECTLY_LOST=$(grep "indirectly lost:" "${VALGRIND_OUTPUT}" | tail -1 | grep -oP '[\d,]+(?= bytes)' | tr -d ',' || echo "0")
POSSIBLY_LOST=$(grep "possibly lost:" "${VALGRIND_OUTPUT}" | tail -1 | grep -oP '[\d,]+(?= bytes)' | tr -d ',' || echo "0")
STILL_REACHABLE=$(grep "still reachable:" "${VALGRIND_OUTPUT}" | tail -1 | grep -oP '[\d,]+(?= bytes)' | tr -d ',' || echo "0")

# Handle case where grep -P is not available (macOS)
if [ -z "${DEFINITELY_LOST}" ] || [ "${DEFINITELY_LOST}" = "0" ]; then
    DEFINITELY_LOST=$(grep "definitely lost:" "${VALGRIND_OUTPUT}" | tail -1 | \
        sed 's/.*definitely lost: //; s/ bytes.*//' | tr -d ',' || echo "0")
fi
if [ -z "${INDIRECTLY_LOST}" ] || [ "${INDIRECTLY_LOST}" = "0" ]; then
    INDIRECTLY_LOST=$(grep "indirectly lost:" "${VALGRIND_OUTPUT}" | tail -1 | \
        sed 's/.*indirectly lost: //; s/ bytes.*//' | tr -d ',' || echo "0")
fi
if [ -z "${POSSIBLY_LOST}" ] || [ "${POSSIBLY_LOST}" = "0" ]; then
    POSSIBLY_LOST=$(grep "possibly lost:" "${VALGRIND_OUTPUT}" | tail -1 | \
        sed 's/.*possibly lost: //; s/ bytes.*//' | tr -d ',' || echo "0")
fi
if [ -z "${STILL_REACHABLE}" ] || [ "${STILL_REACHABLE}" = "0" ]; then
    STILL_REACHABLE=$(grep "still reachable:" "${VALGRIND_OUTPUT}" | tail -1 | \
        sed 's/.*still reachable: //; s/ bytes.*//' | tr -d ',' || echo "0")
fi

# Default to 0 if parsing produced empty strings
DEFINITELY_LOST="${DEFINITELY_LOST:-0}"
INDIRECTLY_LOST="${INDIRECTLY_LOST:-0}"
POSSIBLY_LOST="${POSSIBLY_LOST:-0}"
STILL_REACHABLE="${STILL_REACHABLE:-0}"

echo "  Definitely lost:  ${DEFINITELY_LOST} bytes"
echo "  Indirectly lost:  ${INDIRECTLY_LOST} bytes"
echo "  Possibly lost:    ${POSSIBLY_LOST} bytes (informational, not counted)"
echo "  Still reachable:  ${STILL_REACHABLE} bytes (informational, not counted)"

# Show error summary
ERROR_SUMMARY=$(grep "ERROR SUMMARY:" "${VALGRIND_OUTPUT}" | tail -1 || echo "  (not found)")
echo ""
echo "  ${ERROR_SUMMARY}"

# Count unique leak call stacks for detailed reporting
LEAK_STACKS=$(grep -c "blocks are definitely lost\|blocks are indirectly lost" "${VALGRIND_OUTPUT}" 2>/dev/null || echo "0")
if [ "${LEAK_STACKS}" -gt 0 ]; then
    echo ""
    echo "─── Leak Details (${LEAK_STACKS} unique leak sites) ───"
    # Show the first few leak backtraces
    grep -A 15 "blocks are definitely lost\|blocks are indirectly lost" "${VALGRIND_OUTPUT}" | head -80
fi

# Show file descriptor leaks if any
FD_LEAKS=$(grep "Open file descriptor" "${VALGRIND_OUTPUT}" | grep -v "inherited" | wc -l | tr -d ' ')
if [ "${FD_LEAKS}" -gt 0 ]; then
    echo ""
    echo "─── File Descriptor Leaks: ${FD_LEAKS} ───"
    grep -A 5 "Open file descriptor" "${VALGRIND_OUTPUT}" | grep -v "inherited" | head -30
fi

# ─── PASS/FAIL determination ────────────────────────────────────────────────

echo ""
echo "============================================================"

PASS=1
FAILURES=""

if [ "${DEFINITELY_LOST}" -gt "${MAX_DEFINITELY_LOST}" ]; then
    PASS=0
    FAILURES="${FAILURES}\n  - definitely lost: ${DEFINITELY_LOST} bytes (threshold: ${MAX_DEFINITELY_LOST})"
fi

if [ "${INDIRECTLY_LOST}" -gt "${MAX_INDIRECTLY_LOST}" ]; then
    PASS=0
    FAILURES="${FAILURES}\n  - indirectly lost: ${INDIRECTLY_LOST} bytes (threshold: ${MAX_INDIRECTLY_LOST})"
fi

if [ "${PASS}" -eq 1 ]; then
    echo "  RESULT: PASS"
    echo "  No definite or indirect memory leaks detected."
else
    echo "  RESULT: FAIL"
    echo "  Memory leaks exceed thresholds:"
    echo -e "${FAILURES}"
fi

echo ""
echo "  Full Valgrind log saved to: ${VALGRIND_OUTPUT}"
echo "  Tip: inspect with 'less ${VALGRIND_OUTPUT}'"
echo "============================================================"

# Save a copy alongside the script for easy access
cp "${VALGRIND_OUTPUT}" "${SCRIPT_DIR}/valgrind-latest.log" 2>/dev/null || true

if [ "${PASS}" -eq 1 ]; then
    exit 0
else
    exit 1
fi
