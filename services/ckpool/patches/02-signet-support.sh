#!/bin/bash
# 02-signet-support.sh — Add signet network support to bitcoin.c
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors

echo "=== Patch 02: Signet Support ==="

echo "  Patching bitcoin.c..."
if ! grep -q 'signet' "${BITCOIN}"; then
    # 1. Add "signet" to the GBT JSON request rules array
    sedi 's/\\"rules\\" : \[\\"segwit\\"\]/\\"rules\\" : [\\"segwit\\", \\"signet\\"]/' "${BITCOIN}"
    # 2. Add "signet" to the understood_rules array so ckpool accepts the signet rule from bitcoind
    sedi 's/understood_rules\[\] = {"segwit"}/understood_rules[] = {"segwit", "signet"}/' "${BITCOIN}"
    if grep -q 'signet' "${BITCOIN}"; then
        echo "    Done (added signet support to GBT request + understood_rules)"
    else
        echo "    FATAL: Could not patch GBT rules in bitcoin.c"; exit 1
    fi
else
    echo "    Already patched"
fi

echo "  Patch 02 complete"
