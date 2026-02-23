#!/usr/bin/env bash
# =============================================================================
# CKPool Memory Profiling Script
# =============================================================================
# Uses Valgrind's Massif tool to profile heap memory usage of ckpool,
# then generates a human-readable report.
#
# Two modes:
#   1. Launch mode (default): Starts ckpool under Valgrind/Massif
#   2. Attach mode: Monitors an already-running ckpool via /proc/PID/smaps
#
# Usage:
#   ./profile_memory.sh                            # Launch ckpool under massif (30s)
#   ./profile_memory.sh --duration 120             # Profile for 2 minutes
#   ./profile_memory.sh --config /etc/ckpool.conf  # Custom config
#   ./profile_memory.sh --attach --pid 1234        # Monitor running process
#   ./profile_memory.sh --output /tmp/memprof      # Custom output dir
#
# Prerequisites:
#   - Valgrind (apt-get install valgrind)
#   - ckpool binary (for launch mode)
#   - /proc filesystem (for attach mode)
#
# Output:
#   /profiles/mem_YYYYMMDD_HHMMSS/
#     massif.out.XXXX     - Raw Massif data file
#     massif_report.txt   - ms_print human-readable report
#     peak_summary.txt    - Peak memory usage summary
#     smaps_snapshot.txt  - /proc/PID/smaps snapshot (if available)
#
# Part of The Bitcoin Game - Phase 5 Production Hardening.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DURATION=30
OUTPUT_BASE="/profiles"
CKPOOL_BIN="/usr/local/bin/ckpool"
CKPOOL_CONFIG="/etc/ckpool/ckpool.conf"
PID=""
ATTACH_MODE=false
DETAILED_FREQ=10
THRESHOLD=0.5

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

Modes:
  Launch mode (default): Start ckpool under Valgrind Massif
  Attach mode:           Monitor running ckpool memory via /proc

Options:
  --duration SECONDS    Profile duration (default: 30)
  --output DIR          Output base directory (default: /profiles)
  --ckpool PATH         Path to ckpool binary (default: /usr/local/bin/ckpool)
  --config PATH         Path to ckpool.conf (default: /etc/ckpool/ckpool.conf)
  --attach              Use attach mode (monitor running process)
  --pid PID             PID to monitor in attach mode
  --threshold PCT       Minimum allocation % to report (default: 0.5)
  --help, -h            Show this help
EOF
    exit 0
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --duration)      DURATION="$2";      shift 2 ;;
        --output)        OUTPUT_BASE="$2";   shift 2 ;;
        --ckpool)        CKPOOL_BIN="$2";    shift 2 ;;
        --config)        CKPOOL_CONFIG="$2"; shift 2 ;;
        --attach)        ATTACH_MODE=true;   shift ;;
        --pid)           PID="$2";           shift 2 ;;
        --threshold)     THRESHOLD="$2";     shift 2 ;;
        --help|-h)       usage ;;
        *)               echo -e "${RED}Unknown option: $1${NC}"; usage ;;
    esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  CKPool Memory Profiler${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="${OUTPUT_BASE}/mem_${TIMESTAMP}"
mkdir -p "${OUTPUT_DIR}"

if [[ "${ATTACH_MODE}" == true ]]; then
    # Attach mode: monitor via /proc
    if [[ -z "${PID}" ]]; then
        PID=$(pgrep -x "ckpool" 2>/dev/null | head -1 || true)
        if [[ -z "${PID}" ]]; then
            PID=$(pgrep -f "ckpool" 2>/dev/null | head -1 || true)
        fi
        if [[ -z "${PID}" ]]; then
            echo -e "${RED}Error: No ckpool process found for attach mode.${NC}"
            exit 1
        fi
    fi

    echo -e "  Mode:       ${GREEN}attach (monitoring PID ${PID})${NC}"
    echo -e "  Duration:   ${GREEN}${DURATION}s${NC}"
    echo -e "  Output:     ${GREEN}${OUTPUT_DIR}${NC}"
    echo ""

    # ---------------------------------------------------------------------------
    # Attach mode: Sample /proc/PID/smaps periodically
    # ---------------------------------------------------------------------------
    echo -e "${CYAN}Sampling memory usage every 1s for ${DURATION}s...${NC}"

    SAMPLES_FILE="${OUTPUT_DIR}/memory_samples.csv"
    echo "timestamp_s,rss_kb,pss_kb,shared_clean_kb,shared_dirty_kb,private_clean_kb,private_dirty_kb,swap_kb" \
        > "${SAMPLES_FILE}"

    PEAK_RSS=0
    PEAK_PSS=0
    START_TIME=$(date +%s)

    for ((i=0; i<DURATION; i++)); do
        if [[ ! -d "/proc/${PID}" ]]; then
            echo -e "${YELLOW}Process ${PID} exited after ${i}s.${NC}"
            break
        fi

        # Parse smaps_rollup if available, otherwise fall back to status
        if [[ -f "/proc/${PID}/smaps_rollup" ]]; then
            RSS=$(awk '/^Rss:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
            PSS=$(awk '/^Pss:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
            SHARED_CLEAN=$(awk '/^Shared_Clean:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
            SHARED_DIRTY=$(awk '/^Shared_Dirty:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
            PRIVATE_CLEAN=$(awk '/^Private_Clean:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
            PRIVATE_DIRTY=$(awk '/^Private_Dirty:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
            SWAP=$(awk '/^Swap:/ {print $2}' "/proc/${PID}/smaps_rollup" 2>/dev/null || echo 0)
        else
            RSS=$(awk '/^VmRSS:/ {print $2}' "/proc/${PID}/status" 2>/dev/null || echo 0)
            PSS=${RSS}
            SHARED_CLEAN=0
            SHARED_DIRTY=0
            PRIVATE_CLEAN=0
            PRIVATE_DIRTY=0
            SWAP=$(awk '/^VmSwap:/ {print $2}' "/proc/${PID}/status" 2>/dev/null || echo 0)
        fi

        echo "${i},${RSS},${PSS},${SHARED_CLEAN},${SHARED_DIRTY},${PRIVATE_CLEAN},${PRIVATE_DIRTY},${SWAP}" \
            >> "${SAMPLES_FILE}"

        # Track peaks
        if [[ ${RSS} -gt ${PEAK_RSS} ]]; then PEAK_RSS=${RSS}; fi
        if [[ ${PSS} -gt ${PEAK_PSS} ]]; then PEAK_PSS=${PSS}; fi

        # Progress indicator every 10s
        if (( i % 10 == 0 && i > 0 )); then
            echo -e "  [${i}/${DURATION}s] RSS=${RSS} KB, PSS=${PSS} KB"
        fi

        sleep 1
    done

    # Take a final smaps snapshot
    if [[ -f "/proc/${PID}/smaps" ]]; then
        cp "/proc/${PID}/smaps" "${OUTPUT_DIR}/smaps_snapshot.txt" 2>/dev/null || true
    fi

    # Write peak summary
    PEAK_SUMMARY="${OUTPUT_DIR}/peak_summary.txt"
    {
        echo "CKPool Memory Profile - Attach Mode"
        echo "===================================="
        echo "PID:                ${PID}"
        echo "Duration:           ${DURATION}s"
        echo "Timestamp:          $(date -Iseconds)"
        echo ""
        echo "Peak RSS:           ${PEAK_RSS} KB ($(echo "scale=1; ${PEAK_RSS}/1024" | bc 2>/dev/null || echo '?') MB)"
        echo "Peak PSS:           ${PEAK_PSS} KB ($(echo "scale=1; ${PEAK_PSS}/1024" | bc 2>/dev/null || echo '?') MB)"
        echo ""
        echo "Samples recorded:   ${SAMPLES_FILE}"
    } > "${PEAK_SUMMARY}"

    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${GREEN}  Memory Profiling Complete (Attach Mode)${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "  Peak RSS:  ${GREEN}${PEAK_RSS} KB ($(echo "scale=1; ${PEAK_RSS}/1024" | bc 2>/dev/null || echo '?') MB)${NC}"
    echo -e "  Peak PSS:  ${GREEN}${PEAK_PSS} KB ($(echo "scale=1; ${PEAK_PSS}/1024" | bc 2>/dev/null || echo '?') MB)${NC}"
    echo ""
    echo "  Output files:"
    for f in "${OUTPUT_DIR}"/*; do
        size=$(du -sh "$f" 2>/dev/null | cut -f1)
        echo "    $(basename "$f")  (${size})"
    done
    echo ""
    exit 0
fi

# ---------------------------------------------------------------------------
# Launch mode: Run ckpool under Valgrind Massif
# ---------------------------------------------------------------------------

# Check Valgrind
if ! command -v valgrind &>/dev/null; then
    echo -e "${RED}Error: 'valgrind' not found.${NC}"
    echo "Install with: apt-get install valgrind"
    exit 1
fi

echo -e "  Valgrind:   ${GREEN}$(valgrind --version 2>&1)${NC}"

# Check ckpool binary
if [[ ! -x "${CKPOOL_BIN}" ]]; then
    echo -e "${RED}Error: ckpool binary not found at ${CKPOOL_BIN}${NC}"
    echo "Use --ckpool to specify the path."
    exit 1
fi

# Check config
if [[ ! -f "${CKPOOL_CONFIG}" ]]; then
    echo -e "${YELLOW}Warning: Config not found at ${CKPOOL_CONFIG}${NC}"
    echo -e "${YELLOW}CKPool may fail to start without a valid config.${NC}"
fi

echo -e "  Mode:       ${GREEN}launch (Valgrind Massif)${NC}"
echo -e "  Binary:     ${GREEN}${CKPOOL_BIN}${NC}"
echo -e "  Config:     ${GREEN}${CKPOOL_CONFIG}${NC}"
echo -e "  Duration:   ${GREEN}${DURATION}s${NC}"
echo -e "  Output:     ${GREEN}${OUTPUT_DIR}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Run Massif
# ---------------------------------------------------------------------------
MASSIF_FILE="${OUTPUT_DIR}/massif.out"

echo -e "${CYAN}Starting ckpool under Valgrind Massif...${NC}"
echo -e "${CYAN}Will terminate after ${DURATION}s.${NC}"
echo ""

# Run ckpool under massif in background
valgrind \
    --tool=massif \
    --massif-out-file="${MASSIF_FILE}" \
    --detailed-freq="${DETAILED_FREQ}" \
    --threshold="${THRESHOLD}" \
    --pages-as-heap=no \
    --stacks=no \
    --max-snapshots=200 \
    --time-unit=ms \
    "${CKPOOL_BIN}" -c "${CKPOOL_CONFIG}" -l 7 &

VALGRIND_PID=$!
CKPOOL_PID=""

echo -e "  Valgrind PID: ${GREEN}${VALGRIND_PID}${NC}"

# Wait for the configured duration
sleep "${DURATION}"

# Gracefully terminate
echo ""
echo -e "${CYAN}Duration elapsed. Sending SIGTERM to Valgrind...${NC}"

kill -TERM "${VALGRIND_PID}" 2>/dev/null || true

# Give it time to flush massif data
for i in $(seq 1 15); do
    if ! kill -0 "${VALGRIND_PID}" 2>/dev/null; then
        break
    fi
    sleep 1
done

# Force kill if still running
if kill -0 "${VALGRIND_PID}" 2>/dev/null; then
    echo -e "${YELLOW}Force killing Valgrind process...${NC}"
    kill -9 "${VALGRIND_PID}" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Process Massif output
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}Processing Massif output...${NC}"

if [[ -f "${MASSIF_FILE}" ]]; then
    # Generate ms_print report
    ms_print "${MASSIF_FILE}" > "${OUTPUT_DIR}/massif_report.txt" 2>/dev/null || {
        echo -e "${YELLOW}Warning: ms_print failed. The massif output may be incomplete.${NC}"
    }

    # Extract peak memory
    if [[ -f "${OUTPUT_DIR}/massif_report.txt" ]]; then
        # Parse peak from ms_print output
        PEAK_LINE=$(grep -E "^\s*(peak|Peak)" "${OUTPUT_DIR}/massif_report.txt" 2>/dev/null || true)
        PEAK_BYTES=$(grep -oP "mem_heap_B=\K[0-9]+" "${MASSIF_FILE}" | sort -n | tail -1 || echo "0")
        PEAK_EXTRA=$(grep -oP "mem_heap_extra_B=\K[0-9]+" "${MASSIF_FILE}" | sort -n | tail -1 || echo "0")
        PEAK_STACKS=$(grep -oP "mem_stacks_B=\K[0-9]+" "${MASSIF_FILE}" | sort -n | tail -1 || echo "0")

        PEAK_TOTAL=$((PEAK_BYTES + PEAK_EXTRA + PEAK_STACKS))
        PEAK_MB=$(echo "scale=2; ${PEAK_TOTAL}/1048576" | bc 2>/dev/null || echo "?")

        # Write peak summary
        {
            echo "CKPool Memory Profile - Massif Mode"
            echo "===================================="
            echo "Binary:             ${CKPOOL_BIN}"
            echo "Config:             ${CKPOOL_CONFIG}"
            echo "Duration:           ${DURATION}s"
            echo "Timestamp:          $(date -Iseconds)"
            echo ""
            echo "Peak Heap:          ${PEAK_BYTES} bytes ($(echo "scale=2; ${PEAK_BYTES}/1048576" | bc 2>/dev/null || echo '?') MB)"
            echo "Peak Heap Extra:    ${PEAK_EXTRA} bytes"
            echo "Peak Stacks:        ${PEAK_STACKS} bytes"
            echo "Peak Total:         ${PEAK_TOTAL} bytes (${PEAK_MB} MB)"
            echo ""
            echo "Massif data:        ${MASSIF_FILE}"
            echo "Full report:        ${OUTPUT_DIR}/massif_report.txt"
        } > "${OUTPUT_DIR}/peak_summary.txt"
    fi
else
    echo -e "${YELLOW}Warning: Massif output file not found.${NC}"
    echo -e "${YELLOW}Valgrind may have exited before writing data.${NC}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  Memory Profiling Complete${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [[ -f "${OUTPUT_DIR}/peak_summary.txt" ]]; then
    cat "${OUTPUT_DIR}/peak_summary.txt"
    echo ""
fi

echo "  Output files:"
for f in "${OUTPUT_DIR}"/*; do
    size=$(du -sh "$f" 2>/dev/null | cut -f1)
    echo "    $(basename "$f")  (${size})"
done
echo ""

echo -e "${GREEN}Analyze the full report:${NC}"
echo "  cat ${OUTPUT_DIR}/massif_report.txt"
echo ""
echo -e "${GREEN}Visualize with massif-visualizer (GUI):${NC}"
echo "  massif-visualizer ${MASSIF_FILE}"
echo ""
