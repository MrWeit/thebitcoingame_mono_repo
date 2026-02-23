#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TheBitcoinGame — Chaos Test Suite Orchestrator
# =============================================================================
# Runs all chaos tests in sequence, collects results, and prints a summary.
#
# Usage:
#   ./run_all_chaos.sh                  # Run all tests
#   ./run_all_chaos.sh --test NAME      # Run a single test (e.g., "redis_failure")
#   ./run_all_chaos.sh --list           # List available tests
#   ./run_all_chaos.sh --skip NAME      # Skip a specific test
#   ./run_all_chaos.sh --help           # Show help
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/services/docker-compose.yml"

# ---------------------------------------------------------------------------
# Test registry — order matters (less destructive first)
# ---------------------------------------------------------------------------
declare -a ALL_TESTS=(
    "malformed_stratum"
    "high_connection_rate"
    "redis_failure"
    "db_failure"
    "disk_full"
    "bitcoin_disconnect"
    "network_partition"
    "oom_kill"
    "backup_restore"
    "clock_skew"
    "cpu_stress"
    "corrupt_event_socket"
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SINGLE_TEST=""
SKIP_TESTS=()
LOG_DIR="${SCRIPT_DIR}/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "[$(date '+%H:%M:%S')] $*"; }
header() { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --test|-t)
            SINGLE_TEST="$2"
            shift 2
            ;;
        --skip|-s)
            SKIP_TESTS+=("$2")
            shift 2
            ;;
        --list|-l)
            echo "Available chaos tests:"
            for test in "${ALL_TESTS[@]}"; do
                echo "  - ${test}"
            done
            exit 0
            ;;
        --help|-h)
            echo "TheBitcoinGame Chaos Test Suite"
            echo ""
            echo "Usage:"
            echo "  $0                      Run all chaos tests"
            echo "  $0 --test NAME          Run a single test"
            echo "  $0 --skip NAME          Skip a test (can be repeated)"
            echo "  $0 --list               List available tests"
            echo ""
            echo "Available tests:"
            for test in "${ALL_TESTS[@]}"; do
                echo "  - ${test}"
            done
            echo ""
            echo "Examples:"
            echo "  $0 --test redis_failure"
            echo "  $0 --skip oom_kill --skip backup_restore"
            exit 0
            ;;
        *)
            echo "Unknown option: $1 (use --help for usage)"
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Build test list
# ---------------------------------------------------------------------------
declare -a TESTS_TO_RUN=()

if [[ -n "${SINGLE_TEST}" ]]; then
    # Validate the test name
    FOUND=0
    for test in "${ALL_TESTS[@]}"; do
        if [[ "${test}" == "${SINGLE_TEST}" ]]; then
            FOUND=1
            break
        fi
    done
    if [[ "${FOUND}" -eq 0 ]]; then
        echo "Unknown test: ${SINGLE_TEST}"
        echo "Available tests: ${ALL_TESTS[*]}"
        exit 1
    fi
    TESTS_TO_RUN=("${SINGLE_TEST}")
else
    for test in "${ALL_TESTS[@]}"; do
        SKIP=0
        for skip in "${SKIP_TESTS[@]+"${SKIP_TESTS[@]}"}"; do
            if [[ "${test}" == "${skip}" ]]; then
                SKIP=1
                break
            fi
        done
        if [[ "${SKIP}" -eq 0 ]]; then
            TESTS_TO_RUN+=("${test}")
        fi
    done
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
header "=== TheBitcoinGame Chaos Test Suite ==="
log "Date: $(date)"
log "Tests to run: ${#TESTS_TO_RUN[@]}"
log "Tests: ${TESTS_TO_RUN[*]}"
log ""

# Verify Docker is available
if ! command -v docker &>/dev/null; then
    log "${RED}ERROR: docker command not found${NC}"
    exit 1
fi

# Verify the stack is running
log "Pre-flight: checking Docker Compose stack..."
REQUIRED_CONTAINERS=("tbg-ckpool" "tbg-bitcoin-signet" "tbg-redis" "tbg-timescaledb")
MISSING=0
for container in "${REQUIRED_CONTAINERS[@]}"; do
    if docker inspect --format='{{.State.Running}}' "${container}" 2>/dev/null | grep -q true; then
        log "  ${GREEN}OK${NC}  ${container}"
    else
        log "  ${RED}DOWN${NC}  ${container}"
        MISSING=$((MISSING + 1))
    fi
done

if [[ "${MISSING}" -gt 0 ]]; then
    log ""
    log "${RED}ERROR: ${MISSING} required container(s) not running${NC}"
    log "Start the stack first: docker compose -f ${COMPOSE_FILE} up -d"
    exit 1
fi

# Verify Python 3 is available (needed by several tests)
if ! command -v python3 &>/dev/null; then
    log "${YELLOW}WARNING: python3 not found — some tests may fail${NC}"
fi

# Create log directory
mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Run tests
# ---------------------------------------------------------------------------
declare -A RESULTS
declare -A DURATIONS
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0

for test_name in "${TESTS_TO_RUN[@]}"; do
    TEST_SCRIPT="${SCRIPT_DIR}/test_${test_name}.sh"

    if [[ ! -f "${TEST_SCRIPT}" ]]; then
        log "${YELLOW}SKIP: ${test_name} — script not found (${TEST_SCRIPT})${NC}"
        RESULTS["${test_name}"]="SKIP"
        DURATIONS["${test_name}"]="0s"
        TOTAL_SKIP=$((TOTAL_SKIP + 1))
        continue
    fi

    header "--- Running: ${test_name} ---"
    TEST_LOG="${LOG_DIR}/${test_name}_${TIMESTAMP}.log"
    START_TIME=$(date +%s)

    set +e
    bash "${TEST_SCRIPT}" 2>&1 | tee "${TEST_LOG}"
    EXIT_CODE=${PIPESTATUS[0]}
    set -e

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    DURATIONS["${test_name}"]="${DURATION}s"

    if [[ "${EXIT_CODE}" -eq 0 ]]; then
        RESULTS["${test_name}"]="PASS"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    else
        RESULTS["${test_name}"]="FAIL"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi

    log "Log saved: ${TEST_LOG}"

    # Brief pause between tests to let the stack settle
    if [[ "${test_name}" != "${TESTS_TO_RUN[-1]}" ]]; then
        log "Waiting 10s before next test..."
        sleep 10
    fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
header "=== Chaos Test Summary ==="
log ""

# Table header
printf "  ${BOLD}%-30s %-10s %-10s${NC}\n" "TEST" "RESULT" "DURATION"
printf "  %-30s %-10s %-10s\n" "------------------------------" "----------" "----------"

for test_name in "${TESTS_TO_RUN[@]}"; do
    RESULT="${RESULTS[${test_name}]:-UNKNOWN}"
    DURATION="${DURATIONS[${test_name}]:-?}"

    case "${RESULT}" in
        PASS)
            COLOR="${GREEN}"
            ;;
        FAIL)
            COLOR="${RED}"
            ;;
        SKIP)
            COLOR="${YELLOW}"
            ;;
        *)
            COLOR="${NC}"
            ;;
    esac

    printf "  %-30s ${COLOR}%-10s${NC} %-10s\n" "${test_name}" "${RESULT}" "${DURATION}"
done

printf "  %-30s %-10s %-10s\n" "------------------------------" "----------" "----------"
log ""
log "Total: ${#TESTS_TO_RUN[@]}  |  ${GREEN}Pass: ${TOTAL_PASS}${NC}  |  ${RED}Fail: ${TOTAL_FAIL}${NC}  |  ${YELLOW}Skip: ${TOTAL_SKIP}${NC}"
log "Logs: ${LOG_DIR}/"
log ""

if [[ "${TOTAL_FAIL}" -gt 0 ]]; then
    log "${RED}${BOLD}=== SUITE RESULT: FAIL ===${NC}"
    exit 1
else
    log "${GREEN}${BOLD}=== SUITE RESULT: PASS ===${NC}"
    exit 0
fi
