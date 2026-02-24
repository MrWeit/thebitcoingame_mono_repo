#!/bin/bash
# 12-security-modules.sh — Add Phase 5 security and performance modules to build
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds input_validation, rate_limit, event_ring, and memory_pool to
# ckpool_SOURCES and links pthreads (needed by rate_limit and memory_pool).

echo "=== Patch 12: Security & Performance Modules (Phase 5) ==="

MAKEFILE_AM="${CKPOOL_DIR}/src/Makefile.am"

if [ ! -f "${MAKEFILE_AM}" ]; then
    echo "  FATAL: ${MAKEFILE_AM} not found"; exit 1
fi

# ─── Add Phase 5 source files to ckpool_SOURCES ──────────────────────
echo "  Patching Makefile.am (Phase 5 sources)..."
if ! grep -q "input_validation" "${MAKEFILE_AM}"; then
    # Append after the last TBG file in ckpool_SOURCES.
    # Patch 11 may have added relay files, so try relay_client first, then vardiff.
    if grep -q "tbg_relay_client" "${MAKEFILE_AM}"; then
        sedi 's/tbg_relay_client\.c tbg_relay_client\.h$/tbg_relay_client.c tbg_relay_client.h \\\
\t\t input_validation.c input_validation.h \\\
\t\t rate_limit.c rate_limit.h \\\
\t\t event_ring.c event_ring.h \\\
\t\t memory_pool.c memory_pool.h/' "${MAKEFILE_AM}"
    else
        sedi 's/tbg_vardiff\.c tbg_vardiff\.h$/tbg_vardiff.c tbg_vardiff.h \\\
\t\t input_validation.c input_validation.h \\\
\t\t rate_limit.c rate_limit.h \\\
\t\t event_ring.c event_ring.h \\\
\t\t memory_pool.c memory_pool.h/' "${MAKEFILE_AM}"
    fi
    echo "    Phase 5 source files added to ckpool_SOURCES"
    apply_hook
else
    echo "    Already patched"
    apply_hook
fi

# ─── Copy Phase 5 source files into ckpool src directory ─────────────
echo "  Copying Phase 5 source files..."
TBG_SRC="${SCRIPT_DIR}/../src"
DEST="${CKPOOL_DIR}/src"

for f in input_validation.c input_validation.h \
         rate_limit.c rate_limit.h \
         event_ring.c event_ring.h \
         memory_pool.c memory_pool.h; do
    if [ -f "${TBG_SRC}/${f}" ]; then
        cp "${TBG_SRC}/${f}" "${DEST}/${f}"
        echo "    Copied ${f}"
    else
        echo "    WARNING: ${TBG_SRC}/${f} not found"
    fi
done

echo "  Patch 12 complete"
