#!/bin/bash
# =============================================================================
# asan_build.sh — Build ckpool with AddressSanitizer (ASan) for dev testing
# =============================================================================
#
# Purpose:
#   Creates a Docker image that compiles ckpool with Clang's AddressSanitizer
#   instrumentation. The sanitized binary catches memory errors at runtime:
#     - Buffer overflows (heap, stack, global)
#     - Use-after-free / use-after-return
#     - Double-free / invalid-free
#     - Memory leaks (at exit)
#     - Stack buffer underflows
#
# Usage:
#   ./asan_build.sh                          # Build and extract binary
#   ./asan_build.sh --output /path/to/dir    # Custom output directory
#   ./asan_build.sh --run                    # Build and immediately run
#   ./asan_build.sh --interactive            # Build and drop into shell
#
# Output:
#   - Docker image: tbg-ckpool-asan:latest
#   - Binary extracted to: ./asan-build/ (or --output path)
#   - Run instructions printed to stdout
#
# Requirements:
#   - Docker
#
# How ASan works with ckpool:
#   ASan instruments every memory access at compile time. When ckpool runs,
#   ASan checks each read/write against shadow memory. On error, it prints
#   a detailed report with the allocation/deallocation stack traces and the
#   exact byte that was accessed illegally, then aborts.
#
#   The runtime overhead is ~2x CPU and ~3x memory, which is acceptable for
#   development/testing but NOT for production.
#
# Note: ckpool is Linux-only. This builds inside Docker so it works from
# macOS or Linux hosts.
# =============================================================================
set -e

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CKPOOL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICES_DIR="$(cd "${CKPOOL_DIR}/.." && pwd)"

OUTPUT_DIR="${SCRIPT_DIR}/asan-build"
IMAGE_NAME="tbg-ckpool-asan"
IMAGE_TAG="latest"
DO_RUN=0
DO_INTERACTIVE=0

# ─── Argument parsing ───────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output|-o)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --run)
            DO_RUN=1
            shift
            ;;
        --interactive|-i)
            DO_INTERACTIVE=1
            shift
            ;;
        --help|-h)
            head -38 "$0" | tail -33
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
    echo "ERROR: Docker not found in PATH."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon not running."
    exit 1
fi

echo "============================================================"
echo "  ckpool AddressSanitizer Build"
echo "============================================================"
echo "  Source:  ${CKPOOL_DIR}"
echo "  Output:  ${OUTPUT_DIR}"
echo "  Image:   ${IMAGE_NAME}:${IMAGE_TAG}"
echo "============================================================"
echo ""

# ─── Step 1: Create the ASan Dockerfile ──────────────────────────────────────

echo "[1/3] Preparing ASan Dockerfile..."

DOCKERFILE_ASAN=$(mktemp)
cat > "${DOCKERFILE_ASAN}" <<'DOCKERFILE_EOF'
## ckpool AddressSanitizer build
## Compiles with -fsanitize=address for runtime memory error detection.
##
## Key compiler flags:
##   -fsanitize=address           Enable ASan instrumentation
##   -fno-omit-frame-pointer      Accurate stack traces in error reports
##   -fno-optimize-sibling-calls  Prevent tail-call optimization (better traces)
##   -g                           Full debug symbols for source-level reports
##   -O1                          Light optimization (ASan works best at -O1,
##                                -O0 misses some optimizations ASan relies on,
##                                -O2+ can eliminate checks)
##
## Key linker flags:
##   -fsanitize=address           Link the ASan runtime library
##   -static-libasan              Statically link ASan (avoids LD_PRELOAD issues)

FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies.
# We use gcc here (not clang) because ckpool's configure.ac assumes gcc.
# GCC's -fsanitize=address works just as well as Clang's for our purposes.
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

# Copy and apply TBG patches
COPY patches/ /build/patches/
RUN chmod +x /build/patches/apply-patches.sh /build/patches/[0-9][0-9]-*.sh && \
    /build/patches/apply-patches.sh /build/ckpool-src

# Copy TBG extension source files
COPY src/tbg_*.c src/tbg_*.h /build/ckpool-src/src/

# Build with AddressSanitizer.
#
# IMPORTANT notes on the flags:
#   - We do NOT use -march=native because ASan instrumentation can conflict
#     with some SIMD optimizations. The build uses generic x86_64 codegen.
#   - We pass CFLAGS to configure so it does NOT override with its default
#     "-O2 -Wall -march=native" (see configure.ac line 19-24).
#   - LDFLAGS gets -fsanitize=address too, which links libasan.
#   - -static-libasan avoids needing LD_PRELOAD at runtime.
RUN ./autogen.sh && \
    CFLAGS="-g -O1 -fsanitize=address -fno-omit-frame-pointer -fno-optimize-sibling-calls -Wall" \
    LDFLAGS="-fsanitize=address -static-libasan" \
    ./configure --prefix=/opt/ckpool --without-ckdb && \
    make -j$(nproc)

# Install manually (skip make install / setcap issues)
RUN mkdir -p /build/install/opt/ckpool/bin && \
    cp src/ckpool src/ckpmsg src/notifier /build/install/opt/ckpool/bin/ && \
    echo "ASan build completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > /build/install/opt/ckpool/BUILD_INFO && \
    echo "CFLAGS: -g -O1 -fsanitize=address -fno-omit-frame-pointer -fno-optimize-sibling-calls -Wall" >> /build/install/opt/ckpool/BUILD_INFO && \
    echo "LDFLAGS: -fsanitize=address -static-libasan" >> /build/install/opt/ckpool/BUILD_INFO

# --- Runtime image ---
# We need a full Ubuntu (not Alpine) because ASan uses glibc internals.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libjansson4 \
    libhiredis0.14 \
    libcap2-bin \
    libasan6 \
    && rm -rf /var/lib/apt/lists/*

# Copy ASan-instrumented binaries (NOT stripped — symbols required)
COPY --from=builder /build/install/opt/ckpool /opt/ckpool

# Create necessary directories
RUN mkdir -p /var/log/ckpool /var/run/ckpool /tmp/ckpool /etc/ckpool && \
    chmod 777 /tmp/ckpool /var/log/ckpool /var/run/ckpool

ENV PATH="/opt/ckpool/bin:${PATH}"

# ─── Default ASAN_OPTIONS ────────────────────────────────────────────────────
# These can be overridden at runtime via environment variable.
#
#   detect_leaks=1           Enable leak detection at exit
#   halt_on_error=0          Don't abort on first error (log all errors)
#   print_stats=1            Print ASan statistics at exit
#   check_initialization_order=1  Detect init-order bugs
#   detect_stack_use_after_return=1  Detect use-after-return
#   strict_string_checks=1   Check string function arguments
#   log_path=/var/log/ckpool/asan  Write reports to file (one per PID)
#   exitcode=42              Distinctive exit code for ASan errors
#
ENV ASAN_OPTIONS="detect_leaks=1:halt_on_error=0:print_stats=1:check_initialization_order=1:detect_stack_use_after_return=1:strict_string_checks=1:log_path=/var/log/ckpool/asan:exitcode=42"

# ─── Default LSAN_OPTIONS (LeakSanitizer, part of ASan) ──────────────────────
#   suppressions: file listing known-safe leak patterns to ignore
#   max_leaks: limit the number of leak reports (0 = unlimited)
ENV LSAN_OPTIONS="max_leaks=50"

EXPOSE 3333
EXPOSE 9100
EXPOSE 8881

ENTRYPOINT ["ckpool"]
CMD ["-c", "/etc/ckpool/ckpool-signet.conf", "-s", "/var/run/ckpool", "-l", "7"]
DOCKERFILE_EOF

echo "  Dockerfile created."

# ─── Step 2: Build the Docker image ─────────────────────────────────────────

echo ""
echo "[2/3] Building ASan Docker image (this may take a few minutes)..."

docker build \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -f "${DOCKERFILE_ASAN}" \
    "${CKPOOL_DIR}" \
    2>&1

rm -f "${DOCKERFILE_ASAN}"

echo ""
echo "  Image built: ${IMAGE_NAME}:${IMAGE_TAG}"

# ─── Step 3: Extract binaries to output directory ────────────────────────────

echo ""
echo "[3/3] Extracting ASan binaries to ${OUTPUT_DIR}..."

mkdir -p "${OUTPUT_DIR}"

# Create a temporary container to copy files from
TEMP_CONTAINER=$(docker create "${IMAGE_NAME}:${IMAGE_TAG}")
docker cp "${TEMP_CONTAINER}:/opt/ckpool/." "${OUTPUT_DIR}/"
docker rm "${TEMP_CONTAINER}" >/dev/null

echo "  Extracted files:"
ls -la "${OUTPUT_DIR}/bin/" 2>/dev/null || echo "    (no bin directory)"
echo ""

# Verify the binary has ASan linked
if docker run --rm "${IMAGE_NAME}:${IMAGE_TAG}" \
    sh -c "ldd /opt/ckpool/bin/ckpool 2>/dev/null | grep -q asan && echo 'DYNAMIC' || (nm /opt/ckpool/bin/ckpool 2>/dev/null | grep -q __asan && echo 'STATIC' || echo 'NONE')" 2>/dev/null | grep -qE "DYNAMIC|STATIC"; then
    echo "  ASan linkage verified in binary."
else
    echo "  WARNING: Could not verify ASan linkage. Binary may still be instrumented"
    echo "           (static linking may not show in ldd/nm output)."
fi

# ─── Print usage instructions ────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  Build Complete"
echo "============================================================"
echo ""
echo "  Image:    ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  Binaries: ${OUTPUT_DIR}/bin/"
echo ""
echo "─── Running with Docker (recommended) ───"
echo ""
echo "  # Basic run (uses default ASAN_OPTIONS from image):"
echo "  docker run --rm \\"
echo "    -v \$(pwd)/config:/etc/ckpool:ro \\"
echo "    -p 3333:3333 \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "  # Run with custom ASAN_OPTIONS:"
echo "  docker run --rm \\"
echo "    -e ASAN_OPTIONS=\"detect_leaks=1:halt_on_error=1:log_path=/var/log/ckpool/asan\" \\"
echo "    -v \$(pwd)/config:/etc/ckpool:ro \\"
echo "    -v /tmp/asan-logs:/var/log/ckpool \\"
echo "    -p 3333:3333 \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "  # Interactive shell for debugging:"
echo "  docker run --rm -it \\"
echo "    -v \$(pwd)/config:/etc/ckpool:ro \\"
echo "    --entrypoint /bin/bash \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "─── ASAN_OPTIONS Reference ───"
echo ""
echo "  Key options (colon-separated in ASAN_OPTIONS env var):"
echo ""
echo "    detect_leaks=1              Enable leak detection at exit"
echo "    halt_on_error=1             Abort on FIRST error (default: 0, log all)"
echo "    print_stats=1               Print ASan memory statistics at exit"
echo "    log_path=/path/to/asan      Write reports to file (appends PID)"
echo "    exitcode=42                 Exit code when ASan detects an error"
echo "    suppressions=/path/file     File listing functions to ignore"
echo "    detect_stack_use_after_return=1  Catch use-after-return bugs"
echo "    check_initialization_order=1    Catch C++ init-order bugs"
echo "    strict_string_checks=1      Validate string function arguments"
echo "    malloc_context_size=30      Stack frames in alloc/dealloc traces"
echo "    fast_unwind_on_malloc=0     Slower but more accurate stack traces"
echo "    symbolize=1                 Resolve function names (needs debug info)"
echo ""
echo "  Example for strict testing:"
echo "    ASAN_OPTIONS=\"detect_leaks=1:halt_on_error=1:check_initialization_order=1:detect_stack_use_after_return=1:strict_string_checks=1:fast_unwind_on_malloc=0:malloc_context_size=30\""
echo ""
echo "  Example for CI (log everything, don't abort):"
echo "    ASAN_OPTIONS=\"detect_leaks=1:halt_on_error=0:log_path=/tmp/asan:exitcode=42:print_stats=1\""
echo ""
echo "─── Interpreting ASan Output ───"
echo ""
echo "  ASan errors look like:"
echo "    ==================================================================="
echo "    ==12345==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x..."
echo "    READ of size 4 at 0x... thread T0"
echo "        #0 0x... in function_name file.c:123"
echo "        #1 0x... in caller_name file.c:456"
echo "    ..."
echo "    ==================================================================="
echo ""
echo "  Common error types:"
echo "    heap-buffer-overflow      Read/write past end of malloc'd buffer"
echo "    stack-buffer-overflow     Read/write past end of stack variable"
echo "    heap-use-after-free       Access freed memory"
echo "    stack-use-after-return    Access stack variable after function returned"
echo "    double-free               free() called twice on same pointer"
echo "    alloc-dealloc-mismatch    malloc/free vs new/delete mismatch"
echo "    SEGV on unknown address   Null pointer dereference or wild pointer"
echo ""
echo "  Exit code 42 means ASan detected at least one error."
echo "  Check /var/log/ckpool/asan.* files for full reports."
echo ""
echo "─── Creating Suppression Files ───"
echo ""
echo "  If you need to suppress known-safe patterns (e.g., third-party libs):"
echo ""
echo "    # Create a suppressions file:"
echo "    cat > asan_suppressions.txt << 'EOF'"
echo "    # Suppress known jansson leak (third-party, not our code)"
echo "    leak:jansson"
echo "    # Suppress pthread internals"
echo "    leak:__pthread"
echo "    EOF"
echo ""
echo "    # Mount it and reference in LSAN_OPTIONS:"
echo "    docker run --rm \\"
echo "      -v ./asan_suppressions.txt:/etc/ckpool/asan_suppressions.txt:ro \\"
echo "      -e LSAN_OPTIONS=\"suppressions=/etc/ckpool/asan_suppressions.txt\" \\"
echo "      ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "============================================================"

# ─── Optional: Run the image ────────────────────────────────────────────────

if [ "${DO_INTERACTIVE}" -eq 1 ]; then
    echo ""
    echo "Launching interactive shell..."
    docker run --rm -it \
        -v "${CKPOOL_DIR}/config:/etc/ckpool:ro" \
        -p 3333:3333 \
        --entrypoint /bin/bash \
        "${IMAGE_NAME}:${IMAGE_TAG}"
elif [ "${DO_RUN}" -eq 1 ]; then
    echo ""
    echo "Launching ckpool with ASan..."
    echo "(ASan errors will appear on stderr and in /var/log/ckpool/asan.*)"
    echo "Press Ctrl+C to stop."
    echo ""
    docker run --rm \
        -v "${CKPOOL_DIR}/config:/etc/ckpool:ro" \
        -p 3333:3333 \
        "${IMAGE_NAME}:${IMAGE_TAG}" \
        -c /etc/ckpool/ckpool-signet.conf \
        -s /var/run/ckpool \
        -l 7
fi
