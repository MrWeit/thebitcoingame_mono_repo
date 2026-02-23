#!/bin/bash
# 08-build-system.sh — Patch Makefile.am and configure.ac for TBG extensions
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds TBG source files to ckpool_SOURCES and links hiredis.

echo "=== Patch 08: Build System ==="

MAKEFILE_AM="${CKPOOL_DIR}/src/Makefile.am"
CONFIGURE_AC="${CKPOOL_DIR}/configure.ac"

if [ ! -f "${MAKEFILE_AM}" ]; then
    echo "  FATAL: ${MAKEFILE_AM} not found"; exit 1
fi
if [ ! -f "${CONFIGURE_AC}" ]; then
    echo "  FATAL: ${CONFIGURE_AC} not found"; exit 1
fi

# ─── Add TBG source files to ckpool_SOURCES ───────────────────────────
echo "  Patching Makefile.am (ckpool_SOURCES)..."
if ! grep -q "tbg_metrics" "${MAKEFILE_AM}"; then
    # The current ckpool_SOURCES ends with "utlist.h"
    sedi 's/utlist\.h$/utlist.h \\\
\t\t tbg_metrics.c tbg_metrics.h tbg_coinbase_sig.c tbg_coinbase_sig.h \\\
\t\t tbg_vardiff.c tbg_vardiff.h/' "${MAKEFILE_AM}"
    echo "    TBG source files added to ckpool_SOURCES"
else
    echo "    Already patched"
fi

# ─── Add hiredis to ckpool_LDADD ──────────────────────────────────────
echo "  Patching Makefile.am (ckpool_LDADD)..."
if ! grep -q "HIREDIS" "${MAKEFILE_AM}"; then
    sedi 's/ckpool_LDADD = libckpool.a @JANSSON_LIBS@ @LIBS@/ckpool_LDADD = libckpool.a @JANSSON_LIBS@ @LIBS@ @HIREDIS_LIBS@/' "${MAKEFILE_AM}"
    echo "    hiredis added to ckpool_LDADD"
else
    echo "    Already patched"
fi

# ─── Add hiredis check to configure.ac ────────────────────────────────
echo "  Patching configure.ac..."
if ! grep -q "HIREDIS" "${CONFIGURE_AC}"; then
    # Add hiredis check before AC_SUBST(JANSSON_LIBS)
    LINE=$(getline "AC_SUBST(JANSSON_LIBS)" "${CONFIGURE_AC}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
# TBG: Check for hiredis (Redis client library)\\
AC_CHECK_LIB([hiredis], [redisConnect], [HIREDIS_LIBS=\"-lhiredis\"], [AC_MSG_WARN([libhiredis not found, Redis features disabled])])\\
AC_SUBST(HIREDIS_LIBS)" "${CONFIGURE_AC}"
        echo "    hiredis check added to configure.ac"
    else
        echo "    WARNING: AC_SUBST(JANSSON_LIBS) not found in configure.ac"
    fi
else
    echo "    Already patched"
fi

echo "  Patch 08 complete"
