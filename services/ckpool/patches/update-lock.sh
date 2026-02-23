#!/bin/bash
# update-lock.sh — Regenerate UPSTREAM.lock after verifying patches on a new ckpool version
#
# Usage: ./patches/update-lock.sh /path/to/ckpool
#
# This script:
# 1. Verifies the given ckpool source is a git repo
# 2. Computes SHA256 of the 3 files we patch
# 3. Writes a new UPSTREAM.lock
#
# IMPORTANT: Only run this AFTER you have verified that apply-patches.sh
# works correctly against the new version and the build compiles.
set -e

CKPOOL_DIR="${1:?Usage: update-lock.sh /path/to/ckpool}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK_FILE="${SCRIPT_DIR}/UPSTREAM.lock"

HEADER="${CKPOOL_DIR}/src/ckpool.h"
MAIN="${CKPOOL_DIR}/src/ckpool.c"
STRAT="${CKPOOL_DIR}/src/stratifier.c"
BITCOIN="${CKPOOL_DIR}/src/bitcoin.c"

for f in "${HEADER}" "${MAIN}" "${STRAT}" "${BITCOIN}"; do
    if [ ! -f "${f}" ]; then
        echo "FATAL: ${f} not found."; exit 1
    fi
done

# Verify these are UNPATCHED files
if grep -q "tbg_emit" "${STRAT}"; then
    echo "FATAL: stratifier.c appears to already be patched!"
    echo "  Run this on a CLEAN (unpatched) ckpool source."
    exit 1
fi
if grep -q '"signet"' "${BITCOIN}"; then
    echo "FATAL: bitcoin.c appears to already be patched!"
    echo "  Run this on a CLEAN (unpatched) ckpool source."
    exit 1
fi

# Get commit info
COMMIT="unknown"
VERSION="unknown"
COMMIT_DATE="unknown"
if [ -d "${CKPOOL_DIR}/.git" ] && command -v git >/dev/null 2>&1; then
    COMMIT=$(git -C "${CKPOOL_DIR}" rev-parse HEAD)
    COMMIT_DATE=$(git -C "${CKPOOL_DIR}" log -1 --format=%ci HEAD | cut -d' ' -f1)
    # Try to get version from configure.ac
    VERSION=$(grep -oP 'AC_INIT\(\[ckpool\], \[\K[^\]]+' "${CKPOOL_DIR}/configure.ac" 2>/dev/null || echo "unknown")
fi

# Compute SHA256
sha() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

SHA_STRAT=$(sha "${STRAT}")
SHA_HEADER=$(sha "${HEADER}")
SHA_MAIN=$(sha "${MAIN}")
SHA_BITCOIN=$(sha "${BITCOIN}")

cat > "${LOCK_FILE}" << EOF
# UPSTREAM.lock — Pins the exact ckpool version our patches are tested against
# DO NOT edit manually. Update via: ./patches/update-lock.sh
#
# When upstream ckpool updates, you must:
# 1. Clone the new version
# 2. Test patches against it
# 3. Fix any broken hooks
# 4. Run ./patches/update-lock.sh /path/to/ckpool to regenerate this file

CKPOOL_REPO=https://bitbucket.org/ckolivas/ckpool.git
CKPOOL_COMMIT=${COMMIT}
CKPOOL_VERSION=${VERSION}
CKPOOL_DATE=${COMMIT_DATE}

# SHA256 checksums of the unmodified source files we patch
SHA256_STRATIFIER=${SHA_STRAT}
SHA256_CKPOOL_H=${SHA_HEADER}
SHA256_CKPOOL_C=${SHA_MAIN}
SHA256_BITCOIN_C=${SHA_BITCOIN}
EOF

echo "=== UPSTREAM.lock updated ==="
echo "  Commit:  ${COMMIT}"
echo "  Version: ${VERSION}"
echo "  Date:    ${COMMIT_DATE}"
echo ""
echo "  stratifier.c: ${SHA_STRAT}"
echo "  ckpool.h:     ${SHA_HEADER}"
echo "  ckpool.c:     ${SHA_MAIN}"
echo "  bitcoin.c:    ${SHA_BITCOIN}"
echo ""
echo "  NEXT: Commit this lock file to git."
