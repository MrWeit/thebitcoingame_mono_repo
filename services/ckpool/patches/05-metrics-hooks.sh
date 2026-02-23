#!/bin/bash
# 05-metrics-hooks.sh — Prometheus metrics increment hooks in stratifier.c
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# This patch adds METRIC_INC/DEC/SET calls at the HOOK POINTS (marked with
# /* TBG */ comments) in stratifier.c. The actual metrics implementation is
# in tbg_metrics.c (a new TBG file, copied into the build tree by Dockerfile).
#
# IMPORTANT: We must search for the hook-point lines (with "/* TBG */" suffix),
# NOT the function definitions in the event emission code block.

echo "=== Patch 05: Metrics Hooks ==="

# ─── Add #include for tbg_metrics.h AFTER the event emission block ────
# The event emission code is injected before the first "static" declaration.
# We need our include to be right after the "End of event emission" marker.
echo "  Adding tbg_metrics.h include..."
if ! grep -q "tbg_metrics.h" "${STRAT}"; then
    LINE=$(getline "End of event emission" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
#include \"tbg_metrics.h\" /* TBG: Prometheus metrics */" "${STRAT}"
        echo "    Include added after event emission block (line ${LINE})"
    else
        # Fallback: add after stratifier.h include
        LINE=$(getline '#include "stratifier.h"' "${STRAT}")
        if [ -n "${LINE}" ]; then
            sedi "${LINE}a\\
#include \"tbg_metrics.h\" /* TBG: Prometheus metrics */" "${STRAT}"
            echo "    Include added after stratifier.h (fallback)"
        else
            echo "    FATAL: Cannot find insertion point for include"; exit 1
        fi
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Initialize metrics in stratifier() entry ──────────────────
echo "  Adding metrics init hook..."
if ! grep -q "tbg_metrics_init" "${STRAT}"; then
    # Find the hook point: "tbg_init_events(ckp); /* TBG */"
    LINE=$(getline "tbg_init_events(ckp).*TBG" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\ttbg_metrics_init(ckp->metrics_port > 0 ? ckp->metrics_port : 9100); /* TBG */" "${STRAT}"
        echo "    Metrics init hook: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: tbg_init_events hook point not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Share accepted → METRIC_INC(shares_valid) ─────────────────
# Match the HOOK line "tbg_emit_share(..., 1); /* TBG */" not the function definition
echo "  Adding share accepted metric hook..."
if ! grep -q "METRIC_INC(shares_valid)" "${STRAT}"; then
    LINE=$(getline "tbg_emit_share.*TBG" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t\tMETRIC_INC(shares_valid); /* TBG */" "${STRAT}"
        echo "    shares_valid metric: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: tbg_emit_share hook not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Share rejected ─────────────────────────────────────────────
# The rejection path starts at "if (!sdata->wbincomplete && ((!result && !submit) || !share))"
# We insert our metric right before that check, for all !result && !stale cases
echo "  Adding share rejected metric hook..."
if ! grep -q "METRIC_INC(shares_invalid)" "${STRAT}"; then
    LINE=$(getline 'wbincomplete.*result.*submit.*share' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\tif (!result && !stale) METRIC_INC(shares_invalid); /* TBG */\\
\tif (stale) METRIC_INC(shares_stale); /* TBG */" "${STRAT}"
        echo "    shares_invalid/stale metric: line ${LINE}"
        apply_hook
    else
        echo "    WARNING: share rejection path not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Block found → METRIC_INC(blocks_found) ────────────────────
# Match the HOOK line with user, not the function definition
echo "  Adding block found metric hook..."
if ! grep -q "METRIC_INC(blocks_found)" "${STRAT}"; then
    LINE=$(getline 'tbg_emit_block(user.*TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t\tMETRIC_INC(blocks_found); /* TBG */" "${STRAT}"
        echo "    blocks_found metric: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: tbg_emit_block(user) hook not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Client connect → METRIC_INC(connected_miners) ─────────────
# Match the HOOK line "if(ret) tbg_emit_connect(...) /* TBG */"
echo "  Adding client connect metric hook..."
if ! grep -q "METRIC_INC(connected_miners)" "${STRAT}"; then
    LINE=$(getline 'if(ret) tbg_emit_connect.*TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t\tMETRIC_INC(connected_miners); /* TBG */" "${STRAT}"
        echo "    connected_miners++ metric: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: tbg_emit_connect hook not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Client disconnect → METRIC_DEC(connected_miners) ──────────
# Match the HOOK line "tbg_emit_disconnect(client->user_instance..." which has /* TBG */
echo "  Adding client disconnect metric hook..."
if ! grep -q "METRIC_DEC(connected_miners)" "${STRAT}"; then
    LINE=$(getline 'tbg_emit_disconnect(client.*TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tMETRIC_DEC(connected_miners); /* TBG */" "${STRAT}"
        echo "    connected_miners-- metric: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: tbg_emit_disconnect hook not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: New block network → METRIC_SET(bitcoin_height) ────────────
# Match the HOOK line "if(sdata->current_workbase) tbg_emit_newblock..." with /* TBG */
echo "  Adding network block metric hook..."
if ! grep -q "METRIC_SET(bitcoin_height" "${STRAT}"; then
    LINE=$(getline 'tbg_emit_newblock(sdata.*TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t\tMETRIC_SET(bitcoin_height, sdata->current_workbase->height); /* TBG */" "${STRAT}"
        echo "    bitcoin_height metric: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: tbg_emit_newblock hook not found"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: AsicBoost detected → METRIC_INC(asicboost_miners) ─────────
# Match the asicboost detection block from patch 03: "if (version_mask32 && !client->asicboost_logged)"
echo "  Adding AsicBoost metric hook..."
if ! grep -q "METRIC_INC(asicboost_miners)" "${STRAT}"; then
    LINE=$(getline '!client->asicboost_logged' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t\t\t\tMETRIC_INC(asicboost_miners); /* TBG */" "${STRAT}"
        echo "    asicboost_miners metric: line $((LINE+1))"
        apply_hook
    else
        echo "    WARNING: asicboost_logged hook not found (apply 03-asicboost.sh first)"
    fi
else
    echo "    Already patched"
fi

# ─── Add metrics_port to ckpool.h ────────────────────────────────────
echo "  Adding metrics_port to ckpool.h..."
if ! grep -q "metrics_port" "${HEADER}"; then
    LINE=$(getline "event_socket_path" "${HEADER}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tint metrics_port; /* TBG: Prometheus metrics HTTP port */" "${HEADER}"
        echo "    metrics_port field added"
    else
        echo "    WARNING: event_socket_path not found in ckpool.h"
    fi
else
    echo "    Already patched"
fi

# ─── Parse metrics_port from config in ckpool.c ──────────────────────
echo "  Adding metrics_port config parsing..."
if ! grep -q "metrics_port" "${MAIN}"; then
    LINE=$(getline "event_socket_path.*TBG" "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tjson_get_int(\&ckp->metrics_port, json_conf, \"metrics_port\"); /* TBG */" "${MAIN}"
        echo "    metrics_port config parsing added"
    else
        echo "    WARNING: event_socket_path not found in ckpool.c"
    fi
else
    echo "    Already patched"
fi

echo "  Patch 05 complete"
