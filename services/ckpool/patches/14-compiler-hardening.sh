#!/bin/bash
# 14-compiler-hardening.sh — Add compiler hardening flags
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds security-focused compiler and linker flags to the build:
# - Stack protector (canary-based stack overflow detection)
# - FORTIFY_SOURCE (compile-time and runtime buffer overflow checks)
# - PIE (position-independent executable for ASLR)
# - Full RELRO (read-only relocations to prevent GOT overwrites)
# - Non-executable stack

echo "=== Patch 14: Compiler Hardening (Phase 5) ==="

CONFIGURE_AC="${CKPOOL_DIR}/configure.ac"

if [ ! -f "${CONFIGURE_AC}" ]; then
    echo "  FATAL: ${CONFIGURE_AC} not found"; exit 1
fi

echo "  Adding hardening flags to configure.ac..."
if ! grep -q "fstack-protector-strong" "${CONFIGURE_AC}"; then
    LINE=$(getline 'AC_OUTPUT' "${CONFIGURE_AC}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\\
# TBG Phase 5: Compiler hardening flags\\
HARDENING_CFLAGS=\"-fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE -Wformat -Wformat-security\"\\
HARDENING_LDFLAGS=\"-Wl,-z,relro -Wl,-z,now -Wl,-z,noexecstack -pie\"\\
\\
AC_SUBST([HARDENING_CFLAGS])\\
AC_SUBST([HARDENING_LDFLAGS])\\
CFLAGS=\"\$CFLAGS \$HARDENING_CFLAGS\"\\
LDFLAGS=\"\$LDFLAGS \$HARDENING_LDFLAGS\"\\
AC_MSG_NOTICE([TBG: Compiler hardening flags enabled])" "${CONFIGURE_AC}"
        echo "    Hardening flags added"
        apply_hook
    else
        echo "    WARNING: AC_OUTPUT not found in configure.ac"
    fi
else
    echo "    Already patched"
    apply_hook
fi

echo "  Patch 14 complete"
