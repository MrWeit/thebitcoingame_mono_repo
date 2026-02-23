#!/usr/bin/env bash
# =============================================================================
# Stratum Load Test Runner
# =============================================================================
# Wrapper script for stratum_load_test.py with predefined profiles.
#
# Usage:
#   ./run_load_test.sh --profile smoke
#   ./run_load_test.sh --profile standard --host pool.example.com
#   ./run_load_test.sh --profile stress --port 3334
#   ./run_load_test.sh --profile soak
#
# Profiles:
#   smoke     - Quick sanity check:  10 miners,   30s
#   standard  - Normal load test:   100 miners,   60s
#   stress    - High concurrency:  1000 miners,  120s
#   soak      - Long-running:       100 miners, 3600s (1 hour)
#
# Part of The Bitcoin Game - Phase 5 Production Hardening.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
LOAD_TEST_SCRIPT="${SCRIPT_DIR}/stratum_load_test.py"

# Terminal colors (if supported)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    CYAN=''
    NC=''
fi

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
PROFILE="standard"
HOST="localhost"
PORT="3333"
BTC_ADDRESS="bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls"
EXTRA_ARGS=""
VERBOSE=""

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --profile PROFILE   Test profile: smoke, standard, stress, soak (default: standard)
  --host HOST         Stratum host (default: localhost)
  --port PORT         Stratum port (default: 3333)
  --btc-address ADDR  BTC address for authorization
  --verbose, -v       Enable verbose output
  --help, -h          Show this help

Profiles:
  smoke     10 miners,    30s duration,   5 shares/min, 2s ramp-up
  standard  100 miners,   60s duration,  10 shares/min, 10s ramp-up
  stress    1000 miners, 120s duration,  20 shares/min, 30s ramp-up
  soak      100 miners, 3600s duration,  10 shares/min, 10s ramp-up
EOF
    exit 0
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            PROFILE="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --btc-address)
            BTC_ADDRESS="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE="--verbose"
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            EXTRA_ARGS="${EXTRA_ARGS} $1"
            shift
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Profile configuration
# ---------------------------------------------------------------------------
case "${PROFILE}" in
    smoke)
        MINERS=10
        DURATION=30
        SHARE_RATE=5
        RAMP_UP=2
        ;;
    standard)
        MINERS=100
        DURATION=60
        SHARE_RATE=10
        RAMP_UP=10
        ;;
    stress)
        MINERS=1000
        DURATION=120
        SHARE_RATE=20
        RAMP_UP=30
        ;;
    soak)
        MINERS=100
        DURATION=3600
        SHARE_RATE=10
        RAMP_UP=10
        ;;
    *)
        echo -e "${RED}Error: Unknown profile '${PROFILE}'${NC}"
        echo "Valid profiles: smoke, standard, stress, soak"
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Stratum Load Test Runner${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check Python 3
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Error: python3 not found in PATH${NC}"
    echo "Install Python 3.9+ to run the load test."
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1)
echo -e "  Python:     ${GREEN}${PYTHON_VERSION}${NC}"

# Check load test script exists
if [[ ! -f "${LOAD_TEST_SCRIPT}" ]]; then
    echo -e "${RED}Error: Load test script not found at ${LOAD_TEST_SCRIPT}${NC}"
    exit 1
fi

# Ensure results directory exists
mkdir -p "${RESULTS_DIR}"

# ---------------------------------------------------------------------------
# Build result filename
# ---------------------------------------------------------------------------
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULT_FILE="${RESULTS_DIR}/loadtest_${PROFILE}_${TIMESTAMP}.txt"

# ---------------------------------------------------------------------------
# Print configuration
# ---------------------------------------------------------------------------
echo -e "  Profile:    ${GREEN}${PROFILE}${NC}"
echo -e "  Target:     ${GREEN}${HOST}:${PORT}${NC}"
echo -e "  Miners:     ${GREEN}${MINERS}${NC}"
echo -e "  Duration:   ${GREEN}${DURATION}s${NC}"
echo -e "  Share rate: ${GREEN}${SHARE_RATE}/min${NC}"
echo -e "  Ramp-up:    ${GREEN}${RAMP_UP}s${NC}"
echo -e "  Output:     ${GREEN}${RESULT_FILE}${NC}"
echo ""

# ---------------------------------------------------------------------------
# Connectivity check
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Checking connectivity to ${HOST}:${PORT}...${NC}"

# Use Python for the connectivity check (portable across platforms)
if python3 -c "
import socket, sys
try:
    s = socket.create_connection(('${HOST}', ${PORT}), timeout=5)
    s.close()
    sys.exit(0)
except Exception as e:
    print(f'  Connection failed: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1; then
    echo -e "  ${GREEN}Connection OK${NC}"
else
    echo -e "  ${YELLOW}Warning: Cannot reach ${HOST}:${PORT}${NC}"
    echo -e "  ${YELLOW}The test will start but miners may fail to connect.${NC}"
    echo ""
    read -r -t 10 -p "Continue anyway? [y/N] " response || response="y"
    if [[ ! "${response}" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""

# ---------------------------------------------------------------------------
# Run the load test
# ---------------------------------------------------------------------------
echo -e "${CYAN}Starting load test (${PROFILE} profile)...${NC}"
echo -e "${CYAN}Results will be saved to: ${RESULT_FILE}${NC}"
echo ""

# Run with tee so output goes to both terminal and file
python3 "${LOAD_TEST_SCRIPT}" \
    --host "${HOST}" \
    --port "${PORT}" \
    --miners "${MINERS}" \
    --duration "${DURATION}" \
    --share-rate "${SHARE_RATE}" \
    --ramp-up "${RAMP_UP}" \
    --btc-address "${BTC_ADDRESS}" \
    ${VERBOSE} \
    ${EXTRA_ARGS} \
    2>&1 | tee "${RESULT_FILE}"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo -e "${CYAN}========================================${NC}"
if [[ ${EXIT_CODE} -eq 0 ]]; then
    echo -e "  ${GREEN}Load test completed successfully${NC}"
elif [[ ${EXIT_CODE} -eq 1 ]]; then
    echo -e "  ${YELLOW}Load test completed with warnings${NC}"
else
    echo -e "  ${RED}Load test completed with errors${NC}"
fi
echo -e "  Results saved to: ${RESULT_FILE}"
echo -e "${CYAN}========================================${NC}"

exit ${EXIT_CODE}
