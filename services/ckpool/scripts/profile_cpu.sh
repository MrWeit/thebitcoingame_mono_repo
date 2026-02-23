#!/usr/bin/env bash
# =============================================================================
# CKPool CPU Profiling Script
# =============================================================================
# Records CPU profile data for a running ckpool process and generates a
# FlameGraph SVG for visual analysis.
#
# Designed to run inside the Docker Dockerfile.profile image or on a Linux
# host with perf and FlameGraph tools installed.
#
# Usage:
#   ./profile_cpu.sh                      # Profile for 30s (default)
#   ./profile_cpu.sh --duration 60        # Profile for 60s
#   ./profile_cpu.sh --pid 1234           # Profile specific PID
#   ./profile_cpu.sh --frequency 999      # Custom sample frequency
#   ./profile_cpu.sh --output /tmp/prof   # Custom output directory
#
# Prerequisites:
#   - perf (linux-tools-generic or perf-tools package)
#   - FlameGraph tools (https://github.com/brendangregg/FlameGraph)
#     Auto-cloned to /tmp/FlameGraph if not found
#   - ckpool process must be running
#
# Output:
#   /profiles/cpu_YYYYMMDD_HHMMSS/
#     perf.data          - Raw perf recording
#     perf_stat.txt      - perf stat summary
#     perf_report.txt    - perf report text output
#     flamegraph.svg     - Interactive FlameGraph
#     collapsed.txt      - Collapsed stack traces
#
# Part of The Bitcoin Game - Phase 5 Production Hardening.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DURATION=30
FREQUENCY=99
OUTPUT_BASE="/profiles"
PID=""
FLAMEGRAPH_DIR="/tmp/FlameGraph"
CKPOOL_BIN="ckpool"

# Terminal colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --duration SECONDS    Profile duration (default: 30)
  --frequency HZ        Sample frequency (default: 99)
  --pid PID             Target PID (default: auto-detect ckpool)
  --output DIR          Output base directory (default: /profiles)
  --help, -h            Show this help
EOF
    exit 0
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --duration)   DURATION="$2";   shift 2 ;;
        --frequency)  FREQUENCY="$2";  shift 2 ;;
        --pid)        PID="$2";        shift 2 ;;
        --output)     OUTPUT_BASE="$2"; shift 2 ;;
        --help|-h)    usage ;;
        *)            echo -e "${RED}Unknown option: $1${NC}"; usage ;;
    esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  CKPool CPU Profiler${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check perf
if ! command -v perf &>/dev/null; then
    echo -e "${RED}Error: 'perf' not found.${NC}"
    echo "Install with: apt-get install linux-tools-generic linux-tools-\$(uname -r)"
    echo "In Docker, the host kernel's perf tools must match."
    exit 1
fi

echo -e "  perf:       ${GREEN}$(perf version 2>&1 | head -1)${NC}"

# Find or clone FlameGraph tools
if [[ ! -d "${FLAMEGRAPH_DIR}" ]]; then
    echo -e "${YELLOW}FlameGraph tools not found. Cloning...${NC}"
    if command -v git &>/dev/null; then
        git clone --depth 1 https://github.com/brendangregg/FlameGraph.git "${FLAMEGRAPH_DIR}" 2>/dev/null
    else
        echo -e "${RED}Error: git not available and FlameGraph not found at ${FLAMEGRAPH_DIR}${NC}"
        echo "Clone manually: git clone https://github.com/brendangregg/FlameGraph.git ${FLAMEGRAPH_DIR}"
        exit 1
    fi
fi

if [[ ! -f "${FLAMEGRAPH_DIR}/stackcollapse-perf.pl" ]]; then
    echo -e "${RED}Error: FlameGraph tools incomplete at ${FLAMEGRAPH_DIR}${NC}"
    exit 1
fi

echo -e "  FlameGraph: ${GREEN}${FLAMEGRAPH_DIR}${NC}"

# Find ckpool PID
if [[ -z "${PID}" ]]; then
    PID=$(pgrep -x "${CKPOOL_BIN}" 2>/dev/null | head -1 || true)
    if [[ -z "${PID}" ]]; then
        # Try broader match (ckpool may run as different binary name)
        PID=$(pgrep -f "ckpool" 2>/dev/null | head -1 || true)
    fi
    if [[ -z "${PID}" ]]; then
        echo -e "${RED}Error: No ckpool process found.${NC}"
        echo "Start ckpool first, or specify --pid manually."
        exit 1
    fi
fi

echo -e "  Target PID: ${GREEN}${PID}${NC}"
echo -e "  Process:    ${GREEN}$(cat /proc/${PID}/cmdline 2>/dev/null | tr '\0' ' ' || echo 'unknown')${NC}"
echo -e "  Duration:   ${GREEN}${DURATION}s${NC}"
echo -e "  Frequency:  ${GREEN}${FREQUENCY} Hz${NC}"
echo ""

# ---------------------------------------------------------------------------
# Create output directory
# ---------------------------------------------------------------------------
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="${OUTPUT_BASE}/cpu_${TIMESTAMP}"
mkdir -p "${OUTPUT_DIR}"

echo -e "  Output:     ${GREEN}${OUTPUT_DIR}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: perf stat (summary counters)
# ---------------------------------------------------------------------------
echo -e "${CYAN}[1/4] Running perf stat for ${DURATION}s...${NC}"

perf stat -p "${PID}" -o "${OUTPUT_DIR}/perf_stat.txt" -- sleep "${DURATION}" &
PERF_STAT_PID=$!

# ---------------------------------------------------------------------------
# Step 2: perf record (stack sampling)
# ---------------------------------------------------------------------------
echo -e "${CYAN}[2/4] Running perf record (frequency=${FREQUENCY} Hz)...${NC}"

perf record \
    -F "${FREQUENCY}" \
    -p "${PID}" \
    -g \
    --call-graph dwarf,16384 \
    -o "${OUTPUT_DIR}/perf.data" \
    -- sleep "${DURATION}" || {
        echo -e "${YELLOW}Warning: perf record exited with non-zero status.${NC}"
        echo -e "${YELLOW}This may happen if the process exited during profiling.${NC}"
    }

# Wait for perf stat to finish
wait "${PERF_STAT_PID}" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 3: Generate perf report
# ---------------------------------------------------------------------------
echo -e "${CYAN}[3/4] Generating perf report...${NC}"

if [[ -f "${OUTPUT_DIR}/perf.data" ]]; then
    perf report \
        -i "${OUTPUT_DIR}/perf.data" \
        --stdio \
        --no-children \
        --sort comm,dso,symbol \
        --percent-limit 0.5 \
        > "${OUTPUT_DIR}/perf_report.txt" 2>/dev/null || true
else
    echo -e "${YELLOW}Warning: perf.data not found, skipping report.${NC}"
fi

# ---------------------------------------------------------------------------
# Step 4: Generate FlameGraph
# ---------------------------------------------------------------------------
echo -e "${CYAN}[4/4] Generating FlameGraph SVG...${NC}"

if [[ -f "${OUTPUT_DIR}/perf.data" ]]; then
    # Collapse stacks
    perf script -i "${OUTPUT_DIR}/perf.data" 2>/dev/null \
        | "${FLAMEGRAPH_DIR}/stackcollapse-perf.pl" --all \
        > "${OUTPUT_DIR}/collapsed.txt" 2>/dev/null

    # Generate SVG
    "${FLAMEGRAPH_DIR}/flamegraph.pl" \
        --title "CKPool CPU Profile (${DURATION}s @ ${FREQUENCY}Hz)" \
        --subtitle "PID ${PID} - $(date -Iseconds)" \
        --width 1600 \
        --colors hot \
        "${OUTPUT_DIR}/collapsed.txt" \
        > "${OUTPUT_DIR}/flamegraph.svg" 2>/dev/null

    if [[ -f "${OUTPUT_DIR}/flamegraph.svg" ]]; then
        echo -e "  ${GREEN}FlameGraph saved: ${OUTPUT_DIR}/flamegraph.svg${NC}"
    else
        echo -e "  ${YELLOW}Warning: FlameGraph generation may have failed.${NC}"
    fi
else
    echo -e "  ${YELLOW}Skipped (no perf.data).${NC}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Profiling Complete${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "  Output files:"
for f in "${OUTPUT_DIR}"/*; do
    size=$(du -sh "$f" 2>/dev/null | cut -f1)
    echo "    $(basename "$f")  (${size})"
done
echo ""

# Print perf stat summary if available
if [[ -f "${OUTPUT_DIR}/perf_stat.txt" ]]; then
    echo -e "${CYAN}perf stat summary:${NC}"
    echo "---"
    cat "${OUTPUT_DIR}/perf_stat.txt"
    echo "---"
fi

echo ""
echo -e "${GREEN}View the flamegraph:${NC}"
echo "  Open ${OUTPUT_DIR}/flamegraph.svg in a browser"
echo "  Or copy out: docker cp <container>:${OUTPUT_DIR}/flamegraph.svg ."
echo ""
