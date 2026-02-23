#!/bin/bash
# 11-relay-build.sh — Add relay source files to the build system
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds tbg_relay_server.c/h and tbg_relay_client.c/h to Makefile.am

echo "=== Patch 11: Relay Build System ==="

MAKEFILE_AM="${CKPOOL_DIR}/src/Makefile.am"

if [ ! -f "${MAKEFILE_AM}" ]; then
    echo "  FATAL: ${MAKEFILE_AM} not found"; exit 1
fi

# ─── Add relay source files to ckpool_SOURCES ──────────────────────────
echo "  Patching Makefile.am (relay sources)..."
if ! grep -q "tbg_relay" "${MAKEFILE_AM}"; then
    # The previous patch (08) added tbg_vardiff.c tbg_vardiff.h at the end
    sedi 's/tbg_vardiff\.c tbg_vardiff\.h$/tbg_vardiff.c tbg_vardiff.h \\\
\t\t tbg_relay.h tbg_relay_server.c tbg_relay_server.h \\\
\t\t tbg_relay_client.c tbg_relay_client.h/' "${MAKEFILE_AM}"
    echo "    Relay source files added to ckpool_SOURCES"
else
    echo "    Already patched"
fi

echo "  Patch 11 complete"
