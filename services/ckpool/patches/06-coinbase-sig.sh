#!/bin/bash
# 06-coinbase-sig.sh — Per-user coinbase signature support
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds hooks for looking up per-user custom coinbase signatures from a
# Redis-backed cache. The actual cache implementation is in tbg_coinbase_sig.c
# (a new TBG file, not a patch).

echo "=== Patch 06: Per-User Coinbase Signature ==="

# ─── Add #include for tbg_coinbase_sig.h ──────────────────────────────
echo "  Adding tbg_coinbase_sig.h include..."
if ! grep -q "tbg_coinbase_sig.h" "${STRAT}"; then
    LINE=$(getline "tbg_metrics.h" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
#include \"tbg_coinbase_sig.h\" /* TBG: Per-user coinbase signatures */" "${STRAT}"
        echo "    Include added after line ${LINE}"
    else
        # Fallback: add after stratifier.h
        LINE=$(getline '#include "stratifier.h"' "${STRAT}")
        if [ -n "${LINE}" ]; then
            sedi "${LINE}a\\
#include \"tbg_coinbase_sig.h\" /* TBG: Per-user coinbase signatures */" "${STRAT}"
            echo "    Include added after stratifier.h (fallback)"
        else
            echo "    FATAL: Cannot find insertion point for include"; exit 1
        fi
    fi
else
    echo "    Already patched"
fi

# ─── Add redis_url to ckpool.h ────────────────────────────────────────
echo "  Adding redis_url to ckpool.h..."
if ! grep -q "redis_url" "${HEADER}"; then
    LINE=$(getline "metrics_port" "${HEADER}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline "event_socket_path" "${HEADER}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tchar *redis_url; /* TBG: Redis URL for caches */" "${HEADER}"
        echo "    redis_url field added"
    else
        echo "    WARNING: Could not find insertion point in ckpool.h"
    fi
else
    echo "    Already patched"
fi

# ─── Parse redis_url from config in ckpool.c ──────────────────────────
echo "  Adding redis_url config parsing..."
if ! grep -q "redis_url" "${MAIN}"; then
    LINE=$(getline "metrics_port" "${MAIN}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline "event_socket_path" "${MAIN}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tjson_get_string(\&ckp->redis_url, json_conf, \"redis_url\"); /* TBG */" "${MAIN}"
        echo "    redis_url config parsing added"
    else
        echo "    WARNING: Could not find insertion point in ckpool.c"
    fi
else
    echo "    Already patched"
fi

# ─── Init sig cache in stratifier() ──────────────────────────────────
echo "  Adding sig cache init hook..."
if ! grep -q "tbg_sig_cache_init" "${STRAT}"; then
    LINE=$(getline "tbg_metrics_init" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tif (ckp->redis_url) tbg_sig_cache_init(ckp->redis_url); /* TBG */" "${STRAT}"
        echo "    Sig cache init hook added"
        apply_hook
    else
        echo "    WARNING: tbg_metrics_init not found (apply 05-metrics-hooks.sh first)"
    fi
else
    echo "    Already patched"
fi

# ─── Modify per-user workbase generation to include custom sig ────────
# In __generate_userwb(), after copying base coinb2, insert user's sig
echo "  Adding per-user sig insertion in workbase generation..."
if ! grep -q "tbg_get_user_sig" "${STRAT}"; then
    # Find the line: memcpy(userwb->coinb2bin, wb->coinb2bin, wb->coinb2len);
    LINE=$(getline "memcpy(userwb->coinb2bin, wb->coinb2bin, wb->coinb2len)" "${STRAT}")
    if [ -n "${LINE}" ]; then
        # Insert after the base coinb2 copy, before address append
        NEXT=$((LINE + 2))
        sedi "${NEXT}i\\
\t/* TBG: Insert per-user coinbase signature if available */\\
\t{\\
\t\tconst char *usig = tbg_get_user_sig(user->username);\\
\t\tif (usig) {\\
\t\t\tint ulen = strlen(usig);\\
\t\t\tif (ulen > 0 && ulen <= TBG_MAX_USER_SIG_LEN) {\\
\t\t\t\tuserwb->coinb2bin[userwb->coinb2len++] = (unsigned char)ulen;\\
\t\t\t\tmemcpy(userwb->coinb2bin + userwb->coinb2len, usig, ulen);\\
\t\t\t\tuserwb->coinb2len += ulen;\\
\t\t\t}\\
\t\t}\\
\t}" "${STRAT}"
        echo "    User sig insertion added in __generate_userwb"
        apply_hook
    else
        echo "    WARNING: coinb2bin copy not found in __generate_userwb"
    fi
else
    echo "    Already patched"
fi

# ─── Add coinbase_sig field to block_found event ─────────────────────
# Modify tbg_emit_block to accept and include coinbase_sig
echo "  Note: block_found event enhancement deferred to tbg_coinbase_sig.c wrapper"

echo "  Patch 06 complete"
