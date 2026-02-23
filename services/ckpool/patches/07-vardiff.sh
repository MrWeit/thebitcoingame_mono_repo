#!/bin/bash
# 07-vardiff.sh — Enhanced VarDiff with EMA, dead band, dampening, reconnect memory
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds EMA-based difficulty fields to stratum_instance, VarDiff config fields
# to ckpool_instance, and hooks for reconnect memory. The actual VarDiff logic
# enhancement and reconnect memory implementation is in tbg_vardiff.c.

echo "=== Patch 07: Enhanced VarDiff ==="

# ─── Add #include for tbg_vardiff.h ───────────────────────────────────
echo "  Adding tbg_vardiff.h include..."
if ! grep -q "tbg_vardiff.h" "${STRAT}"; then
    LINE=$(getline "tbg_coinbase_sig.h" "${STRAT}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline "tbg_metrics.h" "${STRAT}")
    fi
    if [ -z "${LINE}" ]; then
        LINE=$(getline '#include "stratifier.h"' "${STRAT}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
#include \"tbg_vardiff.h\" /* TBG: Enhanced VarDiff with reconnect memory */" "${STRAT}"
        echo "    Include added after line ${LINE}"
    else
        echo "    FATAL: Cannot find insertion point for include"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── Add EMA fields to stratum_instance struct ───────────────────────
echo "  Adding EMA fields to stratum_instance..."
if ! grep -q "ema_share_rate" "${STRAT}"; then
    LINE=$(getline "asicboost_logged" "${STRAT}")
    if [ -z "${LINE}" ]; then
        # Use unique comment from stratum_instance, not other structs
        LINE=$(getline "Best share found by this instance" "${STRAT}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG: Enhanced VarDiff EMA state */\\
\tdouble ema_share_rate;\t\t/* Exponential moving average of share rate */\\
\ttime_t last_diff_adjust;\t/* Timestamp of last difficulty change */\\
\tint adjustment_count;\t\t/* Number of adjustments this session */\\
\tint stable_intervals;\t\t/* Consecutive intervals without adjustment */" "${STRAT}"
        echo "    EMA fields added to stratum_instance"
    else
        echo "    FATAL: Could not find insertion point in stratum_instance"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── Add VarDiff config fields to ckpool.h ────────────────────────────
echo "  Adding VarDiff config to ckpool.h..."
if ! grep -q "vardiff_ema_alpha" "${HEADER}"; then
    LINE=$(getline "redis_url" "${HEADER}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline "event_socket_path" "${HEADER}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG: Enhanced VarDiff settings */\\
\tdouble vardiff_ema_alpha;\t\t/* EMA smoothing factor (default 0.3) */\\
\tint vardiff_target_interval;\t\t/* Target share interval in seconds (default 10) */\\
\tdouble vardiff_dead_band_low;\t\t/* Dead band lower bound (default 0.8) */\\
\tdouble vardiff_dead_band_high;\t\t/* Dead band upper bound (default 1.2) */\\
\tdouble vardiff_dampening;\t\t/* Dampening factor (default 0.5) */\\
\tint vardiff_cooldown;\t\t\t/* Min seconds between adjustments (default 30) */\\
\tdouble vardiff_fast_ramp_threshold;\t/* Fast ramp-up ratio (default 4.0) */\\
\tint vardiff_fast_ramp_max_jump;\t\t/* Max multiplier for fast ramp (default 64) */\\
\tint vardiff_reconnect_ttl;\t\t/* Reconnect memory TTL in seconds (default 86400) */" "${HEADER}"
        echo "    VarDiff config fields added to ckpool.h"
    else
        echo "    WARNING: Could not find insertion point in ckpool.h"
    fi
else
    echo "    Already patched"
fi

# ─── Parse VarDiff config from JSON in ckpool.c ──────────────────────
echo "  Adding VarDiff config parsing..."
if ! grep -q "vardiff_ema_alpha" "${MAIN}"; then
    LINE=$(getline "redis_url" "${MAIN}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline "event_socket_path" "${MAIN}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG: Enhanced VarDiff config — parse vardiff sub-object */\\
\t{\\
\t\tjson_t *vd = json_object_get(json_conf, \"vardiff\");\\
\t\tif (vd) {\\
\t\t\tjson_get_double(\&ckp->vardiff_ema_alpha, vd, \"ema_alpha\");\\
\t\t\tjson_get_int(\&ckp->vardiff_target_interval, vd, \"target_share_interval\");\\
\t\t\tjson_get_double(\&ckp->vardiff_dead_band_low, vd, \"dead_band_low\");\\
\t\t\tjson_get_double(\&ckp->vardiff_dead_band_high, vd, \"dead_band_high\");\\
\t\t\tjson_get_double(\&ckp->vardiff_dampening, vd, \"dampening\");\\
\t\t\tjson_get_int(\&ckp->vardiff_cooldown, vd, \"cooldown\");\\
\t\t\tjson_get_double(\&ckp->vardiff_fast_ramp_threshold, vd, \"fast_ramp_threshold\");\\
\t\t\tjson_get_int(\&ckp->vardiff_fast_ramp_max_jump, vd, \"fast_ramp_max_jump\");\\
\t\t\tjson_get_int(\&ckp->vardiff_reconnect_ttl, vd, \"reconnect_memory_ttl\");\\
\t\t}\\
\t\t/* Defaults */\\
\t\tif (ckp->vardiff_ema_alpha <= 0) ckp->vardiff_ema_alpha = 0.3;\\
\t\tif (ckp->vardiff_target_interval <= 0) ckp->vardiff_target_interval = 10;\\
\t\tif (ckp->vardiff_dead_band_low <= 0) ckp->vardiff_dead_band_low = 0.8;\\
\t\tif (ckp->vardiff_dead_band_high <= 0) ckp->vardiff_dead_band_high = 1.2;\\
\t\tif (ckp->vardiff_dampening <= 0) ckp->vardiff_dampening = 0.5;\\
\t\tif (ckp->vardiff_cooldown <= 0) ckp->vardiff_cooldown = 30;\\
\t\tif (ckp->vardiff_fast_ramp_threshold <= 0) ckp->vardiff_fast_ramp_threshold = 4.0;\\
\t\tif (ckp->vardiff_fast_ramp_max_jump <= 0) ckp->vardiff_fast_ramp_max_jump = 64;\\
\t\tif (ckp->vardiff_reconnect_ttl <= 0) ckp->vardiff_reconnect_ttl = 86400;\\
\t} /* TBG */" "${MAIN}"
        echo "    VarDiff config parsing added to ckpool.c"
    else
        echo "    WARNING: Could not find insertion point in ckpool.c"
    fi
else
    echo "    Already patched"
fi

# ─── Init VarDiff in stratifier() ────────────────────────────────────
echo "  Adding VarDiff init hook..."
if ! grep -q "tbg_vardiff_init" "${STRAT}"; then
    LINE=$(getline "tbg_sig_cache_init" "${STRAT}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline "tbg_metrics_init" "${STRAT}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tif (ckp->redis_url) tbg_vardiff_init(ckp->redis_url); /* TBG */" "${STRAT}"
        echo "    VarDiff init hook added"
        apply_hook
    else
        echo "    WARNING: Could not find init insertion point"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Reconnect memory — save diff on disconnect ────────────────
# Match the HOOK line with /* TBG */ suffix, not the function definition
echo "  Adding reconnect diff save hook..."
if ! grep -q "tbg_save_reconnect_diff" "${STRAT}"; then
    LINE=$(getline "tbg_emit_disconnect(client.*TBG" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tif (client->workername) tbg_save_reconnect_diff(client->workername, client->diff); /* TBG */" "${STRAT}"
        echo "    Reconnect diff save hook added"
        apply_hook
    else
        echo "    WARNING: tbg_emit_disconnect hook point not found (apply 01-event-system.sh first)"
    fi
else
    echo "    Already patched"
fi

# ─── Hook: Reconnect memory — restore diff on auth ───────────────────
# Match the HOOK line with /* TBG */ suffix, not the function definition
echo "  Adding reconnect diff restore hook..."
if ! grep -q "tbg_get_reconnect_diff" "${STRAT}"; then
    LINE=$(getline "if(ret) tbg_emit_connect.*TBG" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t\t{\\
\t\t\tint64_t rdiff = tbg_get_reconnect_diff(client->workername);\\
\t\t\tif (rdiff > 0 && rdiff != client->diff) {\\
\t\t\t\tclient->diff = rdiff;\\
\t\t\t\tstratum_send_diff(client->sdata, client);\\
\t\t\t}\\
\t\t} /* TBG: reconnect memory */" "${STRAT}"
        echo "    Reconnect diff restore hook added"
        apply_hook
    else
        echo "    WARNING: tbg_emit_connect hook point not found (apply 01-event-system.sh first)"
    fi
else
    echo "    Already patched"
fi

echo "  Patch 07 complete"
