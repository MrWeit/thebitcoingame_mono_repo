#!/bin/bash
# run_fuzz.sh - Build and run CKPool fuzzing campaign
#
# Part of THE BITCOIN GAME - CKPool fuzzing infrastructure
# Builds the fuzz Docker image and runs a libFuzzer campaign
# against the Stratum parser, share validation, and bech32 decoder.
#
# Copyright (c) 2024-2026 THE BITCOIN GAME
# Licensed under the GNU General Public License v3.0
# See LICENSE file for details.
#
# Usage:
#   ./run_fuzz.sh [duration_seconds] [target]
#
# Arguments:
#   duration_seconds  Total fuzzing duration in seconds (default: 3600 = 1 hour)
#   target            Optional: run only one target (stratum|share|bech32|all)
#
# Examples:
#   ./run_fuzz.sh                  # Fuzz all targets for 1 hour
#   ./run_fuzz.sh 7200             # Fuzz all targets for 2 hours
#   ./run_fuzz.sh 600 stratum     # Fuzz only stratum parser for 10 minutes
#   ./run_fuzz.sh 1800 bech32     # Fuzz only bech32 decoder for 30 minutes

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="ckpool-fuzz"
CONTAINER_NAME="ckpool-fuzz-campaign"
DURATION="${1:-3600}"
TARGET="${2:-all}"
OUTPUT_DIR="${SCRIPT_DIR}/fuzz-output"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
RUN_DIR="${OUTPUT_DIR}/${TIMESTAMP}"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

log_info() {
    echo -e "${CYAN}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

print_banner() {
    echo ""
    echo "=========================================="
    echo "  CKPool Fuzzing Campaign"
    echo "  THE BITCOIN GAME"
    echo "=========================================="
    echo "  Duration:  ${DURATION}s ($((DURATION / 60))m)"
    echo "  Target:    ${TARGET}"
    echo "  Output:    ${RUN_DIR}"
    echo "  Timestamp: ${TIMESTAMP}"
    echo "=========================================="
    echo ""
}

check_docker() {
    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed or not in PATH."
        exit 1
    fi

    if ! docker info &>/dev/null; then
        log_error "Docker daemon is not running."
        exit 1
    fi
}

build_image() {
    log_info "Building fuzz Docker image: ${IMAGE_NAME}"
    docker build \
        -f "${SCRIPT_DIR}/Dockerfile.fuzz" \
        -t "${IMAGE_NAME}" \
        "${SCRIPT_DIR}"

    if [ $? -eq 0 ]; then
        log_success "Docker image built successfully."
    else
        log_error "Docker image build failed."
        exit 1
    fi
}

run_all_targets() {
    log_info "Running all fuzz targets for ${DURATION}s total..."

    docker run \
        --rm \
        --name "${CONTAINER_NAME}" \
        --memory=4g \
        --cpus=2 \
        -e "FUZZ_DURATION=${DURATION}" \
        -v "${RUN_DIR}:/fuzz/output" \
        -v "${RUN_DIR}/crashes:/fuzz/crashes" \
        "${IMAGE_NAME}"
}

run_single_target() {
    local target_name="$1"
    local binary_name
    local corpus_dir="/fuzz/corpus"
    local output_subdir

    case "${target_name}" in
        stratum)
            binary_name="fuzz_stratum_parser"
            output_subdir="stratum"
            ;;
        share)
            binary_name="fuzz_share_validation"
            output_subdir="share"
            ;;
        bech32)
            binary_name="fuzz_bech32"
            output_subdir="bech32"
            ;;
        *)
            log_error "Unknown target: ${target_name}"
            log_info "Valid targets: stratum, share, bech32, all"
            exit 1
            ;;
    esac

    log_info "Running single target: ${target_name} for ${DURATION}s..."

    docker run \
        --rm \
        --name "${CONTAINER_NAME}" \
        --memory=4g \
        --cpus=2 \
        -v "${RUN_DIR}/${output_subdir}:/fuzz/target_output" \
        -v "${RUN_DIR}/crashes:/fuzz/crashes" \
        --entrypoint "/fuzz/${binary_name}" \
        "${IMAGE_NAME}" \
        -max_total_time="${DURATION}" \
        -max_len=4096 \
        -timeout=5 \
        -rss_limit_mb=2048 \
        -print_final_stats=1 \
        -artifact_prefix="/fuzz/target_output/" \
        "/fuzz/target_output" \
        "${corpus_dir}"
}

collect_results() {
    echo ""
    echo "=========================================="
    echo "  Fuzzing Campaign Results"
    echo "=========================================="

    local crash_count=0
    if [ -d "${RUN_DIR}/crashes" ]; then
        crash_count=$(find "${RUN_DIR}/crashes" -type f 2>/dev/null | wc -l | tr -d ' ')
    fi

    if [ "${crash_count}" -gt 0 ]; then
        log_error "Found ${crash_count} crash artifact(s)!"
        echo ""
        echo "Crash files:"
        ls -la "${RUN_DIR}/crashes/" 2>/dev/null
        echo ""
        log_info "To reproduce a crash:"
        echo "  docker run --rm -v ${RUN_DIR}:/data ${IMAGE_NAME} \\"
        echo "    /fuzz/fuzz_stratum_parser /data/crashes/crash-XXXXX"
    else
        log_success "No crashes found. Clean run."
    fi

    # Count corpus entries generated
    local corpus_count=0
    for dir in "${RUN_DIR}"/*/; do
        if [ -d "${dir}" ]; then
            local count
            count=$(find "${dir}" -type f 2>/dev/null | wc -l | tr -d ' ')
            corpus_count=$((corpus_count + count))
        fi
    done

    echo ""
    log_info "Total corpus entries generated: ${corpus_count}"
    log_info "Output directory: ${RUN_DIR}"
    echo "=========================================="
}

cleanup() {
    log_warn "Caught interrupt signal. Stopping fuzzer..."
    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    collect_results
    exit 130
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

trap cleanup INT TERM

print_banner
check_docker

# Create output directories
mkdir -p "${RUN_DIR}/stratum" "${RUN_DIR}/share" "${RUN_DIR}/bech32" "${RUN_DIR}/crashes"

# Build the Docker image
build_image

# Run the fuzzing campaign
START_TIME=$(date +%s)

if [ "${TARGET}" = "all" ]; then
    run_all_targets
else
    run_single_target "${TARGET}"
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

log_info "Campaign ran for ${ELAPSED}s ($((ELAPSED / 60))m $((ELAPSED % 60))s)"

# Collect and display results
collect_results
