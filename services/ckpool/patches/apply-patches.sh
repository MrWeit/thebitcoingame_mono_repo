#!/bin/bash
# apply-patches.sh — Apply TheBitcoinGame modifications to ckpool source
# License: GPLv3 (same as ckpool)
#
# SAFETY: This script verifies SHA256 checksums of the upstream files
# before patching. If ckpool updates, patches will refuse to apply
# until re-verified against the new version.
#
# Architecture: This is the orchestrator. Each [0-9][0-9]-*.sh script
# in the patches directory handles one feature. Scripts are sourced in
# order and share all variables/functions defined here.
set -e

CKPOOL_DIR="${1:?Usage: apply-patches.sh /path/to/ckpool}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK_FILE="${SCRIPT_DIR}/UPSTREAM.lock"

echo "=== TheBitcoinGame: Applying ckpool patches ==="
echo "    Phase 3: Enhanced Features + Phase 5: Production Hardening"

# ─── Load version lock ───────────────────────────────────────────────
if [ ! -f "${LOCK_FILE}" ]; then
    echo "FATAL: ${LOCK_FILE} not found."
    echo "  Cannot verify upstream version without lock file."
    exit 1
fi
# shellcheck source=UPSTREAM.lock
source "${LOCK_FILE}"

# ─── Verify source files exist ───────────────────────────────────────
HEADER="${CKPOOL_DIR}/src/ckpool.h"
MAIN="${CKPOOL_DIR}/src/ckpool.c"
STRAT="${CKPOOL_DIR}/src/stratifier.c"
BITCOIN="${CKPOOL_DIR}/src/bitcoin.c"

for f in "${HEADER}" "${MAIN}" "${STRAT}" "${BITCOIN}"; do
    if [ ! -f "${f}" ]; then
        echo "FATAL: ${f} not found."
        echo "  Is CKPOOL_DIR correct? Got: ${CKPOOL_DIR}"
        exit 1
    fi
done

# ─── SHA256 verification ─────────────────────────────────────────────
echo "Verifying upstream checksums (commit ${CKPOOL_COMMIT:0:12})..."

verify_sha256() {
    local file="$1" expected="$2" label="$3"
    local actual

    # shasum on macOS, sha256sum on Linux
    if command -v sha256sum >/dev/null 2>&1; then
        actual=$(sha256sum "${file}" | cut -d' ' -f1)
    else
        actual=$(shasum -a 256 "${file}" | cut -d' ' -f1)
    fi

    if [ "${actual}" != "${expected}" ]; then
        echo ""
        echo "FATAL: SHA256 mismatch on ${label}"
        echo "  Expected: ${expected}"
        echo "  Actual:   ${actual}"
        echo ""
        echo "  The upstream ckpool source has changed since patches were last verified."
        echo "  This means the hooks might land in wrong places and break the build."
        echo ""
        echo "  To update:"
        echo "    1. Review the upstream changes to ${label}"
        echo "    2. Verify each hook point still exists and is correct"
        echo "    3. Run: ./patches/update-lock.sh /path/to/ckpool"
        echo ""
        echo "  To force (DANGEROUS — may produce broken binary):"
        echo "    export TBG_SKIP_VERIFY=1"
        exit 1
    fi
    echo "  ${label}: OK"
}

if [ "${TBG_SKIP_VERIFY:-0}" = "1" ]; then
    echo "  WARNING: TBG_SKIP_VERIFY=1 — skipping checksum verification!"
    echo "  Patches may apply to wrong locations. You have been warned."
else
    verify_sha256 "${STRAT}"    "${SHA256_STRATIFIER}" "stratifier.c"
    verify_sha256 "${HEADER}"   "${SHA256_CKPOOL_H}"   "ckpool.h"
    verify_sha256 "${MAIN}"     "${SHA256_CKPOOL_C}"    "ckpool.c"
    verify_sha256 "${BITCOIN}"  "${SHA256_BITCOIN_C}"   "bitcoin.c"
    echo "  All checksums verified against ckpool ${CKPOOL_VERSION} (${CKPOOL_COMMIT:0:12})"
fi

# ─── Git commit verification (optional, if in git repo) ──────────────
if [ -d "${CKPOOL_DIR}/.git" ] && command -v git >/dev/null 2>&1; then
    ACTUAL_COMMIT=$(git -C "${CKPOOL_DIR}" rev-parse HEAD 2>/dev/null || true)
    if [ -n "${ACTUAL_COMMIT}" ] && [ "${ACTUAL_COMMIT}" != "${CKPOOL_COMMIT}" ]; then
        echo ""
        echo "WARNING: Git commit mismatch"
        echo "  Expected: ${CKPOOL_COMMIT}"
        echo "  Actual:   ${ACTUAL_COMMIT}"
        echo "  (Proceeding because file checksums passed)"
    fi
fi

# ─── macOS/Linux sed compatibility ───────────────────────────────────
if command -v gsed >/dev/null 2>&1; then
    SED="gsed"
elif sed --version 2>/dev/null | grep -q "GNU"; then
    SED="sed"
else
    SED="bsd"
fi

sedi() {
    if [ "${SED}" = "bsd" ]; then
        sed -i '' "$@"
    else
        ${SED} -i "$@"
    fi
}

# ─── Helpers ──────────────────────────────────────────────────────────
# Get first matching line number (returns empty if none)
getline() {
    grep -n "$1" "$2" | head -1 | cut -d: -f1 || true
}

# Get Nth matching line number
getline_nth() {
    grep -n "$1" "$2" | sed -n "${3}p" | cut -d: -f1 || true
}

# Track hook count for final verification
HOOKS_APPLIED=0

apply_hook() {
    HOOKS_APPLIED=$((HOOKS_APPLIED + 1))
}

# ─── Apply feature patches in order ──────────────────────────────────
echo ""
echo "Applying feature patches..."

for script in "${SCRIPT_DIR}"/[0-9][0-9]-*.sh; do
    if [ -f "${script}" ]; then
        echo ""
        # shellcheck source=/dev/null
        source "${script}"
    fi
done

# ─── Final verification ──────────────────────────────────────────────
echo ""
echo "─── Final Verification ───"
TBG_COUNT=$(grep -c "TBG" "${STRAT}" || true)
EXPECTED_MIN_HOOKS=20

if [ "${HOOKS_APPLIED}" -lt "${EXPECTED_MIN_HOOKS}" ]; then
    echo "ERROR: Only ${HOOKS_APPLIED}/${EXPECTED_MIN_HOOKS} minimum hooks applied!"
    echo "  Some hook anchor points were not found in the source."
    echo "  The upstream source may have changed. Check UPSTREAM.lock."
    exit 1
fi

echo "=== TheBitcoinGame: All ${HOOKS_APPLIED} hooks applied ==="
echo "TBG markers in stratifier.c: ${TBG_COUNT}"
echo "=== Patching complete ==="
