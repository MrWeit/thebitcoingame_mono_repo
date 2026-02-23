#!/bin/bash
# 10-relay-mode.sh — Add relay/primary mode support to ckpool
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds tbg_mode, tbg_relay_port, tbg_primary_url, tbg_failover_timeout
# config fields and hooks for relay server/client initialization.

echo "=== Patch 10: Relay Mode ==="

# ─── PATCH: ckpool.h — Add relay config fields ────────────────────────
echo "  Patching ckpool.h (relay fields)..."
if ! grep -q "tbg_mode" "${HEADER}"; then
    LINE=$(getline "tbg_region" "${HEADER}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tchar *tbg_mode; /* TBG: NULL=standalone, \"primary\", \"relay\" */\\
\tint tbg_relay_port; /* TBG: TCP port for relay listener (primary mode) */\\
\tchar *tbg_primary_url; /* TBG: host:port of primary (relay mode) */\\
\tint tbg_failover_timeout; /* TBG: seconds before independent mode */" "${HEADER}"
        echo "    Done (after line ${LINE})"
    else
        echo "    FATAL: Could not find tbg_region in ckpool.h"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── PATCH: ckpool.c — Parse relay config fields ─────────────────────
echo "  Patching ckpool.c (parse relay config)..."
if ! grep -q "tbg_mode" "${MAIN}"; then
    # Find the tbg_region parsing block we added in patch 09
    LINE=$(getline "tbg_region" "${MAIN}")
    if [ -n "${LINE}" ]; then
        # Find end of the region block (the closing brace)
        # Go forward to find the next blank or code line after the block
        BLOCK_END=$((LINE + 10))
        sedi "${BLOCK_END}a\\
\t/* TBG: relay mode configuration */\\
\tjson_get_string(\&ckp->tbg_mode, json_conf, \"tbg_mode\");\\
\tjson_get_int(\&ckp->tbg_relay_port, json_conf, \"tbg_relay_port\");\\
\tjson_get_string(\&ckp->tbg_primary_url, json_conf, \"tbg_primary_url\");\\
\tjson_get_int(\&ckp->tbg_failover_timeout, json_conf, \"tbg_failover_timeout\");\\
\tif (ckp->tbg_mode) {\\
\t\tif (strcmp(ckp->tbg_mode, \"primary\") == 0)\\
\t\t\tLOGNOTICE(\"TBG: Running in PRIMARY mode (relay port %d)\", ckp->tbg_relay_port > 0 ? ckp->tbg_relay_port : 8881);\\
\t\telse if (strcmp(ckp->tbg_mode, \"relay\") == 0)\\
\t\t\tLOGNOTICE(\"TBG: Running in RELAY mode (primary %s, failover %ds)\", ckp->tbg_primary_url ? ckp->tbg_primary_url : \"none\", ckp->tbg_failover_timeout > 0 ? ckp->tbg_failover_timeout : 10);\\
\t}" "${MAIN}"
        echo "    Done"
    else
        echo "    FATAL: Could not find tbg_region in ckpool.c"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── PATCH: stratifier.c — Include relay headers and init ─────────────
echo "  Patching stratifier.c (relay init hooks)..."

# Add relay header includes after the event system code
if ! grep -q "tbg_relay_server.h" "${STRAT}"; then
    LINE=$(getline "THE BITCOIN GAME: End of event emission" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
/* TBG: Relay mode support */\\
#include \"tbg_relay_server.h\"\\
#include \"tbg_relay_client.h\"" "${STRAT}"
        echo "    Relay headers added"
    else
        echo "    WARNING: Event emission end marker not found"
    fi
fi

# Add relay initialization after tbg_init_events hook
if ! grep -q "tbg_relay_server_init.*/\* TBG" "${STRAT}"; then
    LINE=$(getline "tbg_init_events(ckp);.*/\* TBG" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t/* TBG: Initialize relay mode */\\
\tif (ckp->tbg_mode && strcmp(ckp->tbg_mode, \"primary\") == 0) {\\
\t\ttbg_relay_server_init(ckp->tbg_relay_port > 0 ? ckp->tbg_relay_port : 8881);\\
\t} /* TBG relay-server-init */\\
\tif (ckp->tbg_mode && strcmp(ckp->tbg_mode, \"relay\") == 0) {\\
\t\ttbg_relay_client_init(ckp->tbg_primary_url,\\
\t\t\tckp->tbg_failover_timeout > 0 ? ckp->tbg_failover_timeout : 10,\\
\t\t\tckp->tbg_region);\\
\t} /* TBG relay-client-init */" "${STRAT}"
        echo "    Relay init hooks added"
    else
        echo "    FATAL: tbg_init_events hook not found"; exit 1
    fi
    apply_hook
else
    echo "    Relay init already patched"
    apply_hook
fi

# Add relay template push hook in update_base / new workbase path
echo "  Adding template push hook..."
if ! grep -q "tbg_relay_push_template.*/\* TBG" "${STRAT}"; then
    LINE=$(getline "Block hash changed to" "${STRAT}")
    if [ -n "${LINE}" ]; then
        # Add template push after the new block notification
        # The tbg_emit_newblock hook is already on LINE+1, add after it
        PUSH_LINE=$((LINE + 2))
        sedi "${PUSH_LINE}a\\
\t\t/* TBG: Push template to relay peers */\\
\t\tif (sdata->ckp->tbg_mode && strcmp(sdata->ckp->tbg_mode, \"primary\") == 0) {\\
\t\t\tchar *tmpl = json_dumps(json_object_get(sdata->current_workbase->json, \"result\"), JSON_COMPACT);\\
\t\t\tif (tmpl) { tbg_relay_push_template(tmpl, strlen(tmpl)); free(tmpl); }\\
\t\t} /* TBG relay-push-template */" "${STRAT}"
        echo "    Template push hook added"
    else
        echo "    WARNING: Block hash changed to not found"
    fi
    apply_hook
else
    echo "    Template push already patched"
    apply_hook
fi

echo "  Patch 10 complete"
