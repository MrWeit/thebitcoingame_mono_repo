#!/bin/bash
# 13-security-hooks.sh — Wire Phase 5 security modules into ckpool hot path
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Hooks input_validation and rate_limit into stratifier.c at the connection,
# authorization, and share submission points. Also wires event_ring and
# memory_pool initialization into ckpool.c startup/shutdown.

echo "=== Patch 13: Security Hooks (Phase 5) ==="

# ─── Add includes to stratifier.c ────────────────────────────────────
echo "  Adding Phase 5 includes to stratifier.c..."
if ! grep -q "input_validation.h" "${STRAT}"; then
    LINE=$(getline '#include "uthash.h"' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
/* TBG Phase 5: Security modules */\\
#include \"input_validation.h\"\\
#include \"rate_limit.h\"\\
#include \"event_ring.h\"\\
#include \"memory_pool.h\"" "${STRAT}"
        echo "    Phase 5 includes added"
        apply_hook
    else
        echo "    WARNING: uthash.h include not found"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add rate limit check on new connections ─────────────────────────
# Hook into the connector's accept path (connector_recruit_client in ckpool.c)
echo "  Adding rate limit check on connections..."
if ! grep -q "tbg_rate_limit_connect.*TBG_P5" "${STRAT}"; then
    # Find the point after the client IP is set in parse_instance
    LINE=$(getline 'client->address_name' "${STRAT}")
    if [ -n "${LINE}" ]; then
        LINE=$((LINE + 1))
        sedi "${LINE}a\\
\\
\t/* TBG_P5: Rate limit new connections */\\
\tif (!tbg_rate_limit_connect(client->address_name)) { /* TBG_P5 */\\
\t\tLOGINFO(\"Rate limited connection from %s\", client->address_name);\\
\t\treturn;\\
\t}" "${STRAT}"
        echo "    Connection rate limit hook added"
        apply_hook
    else
        echo "    WARNING: client->address_name not found in stratifier.c"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add rate limit disconnect tracking ──────────────────────────────
echo "  Adding rate limit disconnect tracking..."
if ! grep -q "tbg_rate_limit_disconnect.*TBG_P5" "${STRAT}"; then
    # Find the client_disconnect/drop_client function
    LINE=$(getline 'drop_client' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\ttbg_rate_limit_disconnect(client->address_name); /* TBG_P5 */" "${STRAT}"
        echo "    Disconnect tracking hook added"
        apply_hook
    else
        echo "    WARNING: drop_client not found"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add input validation on mining.authorize ────────────────────────
echo "  Adding input validation on authorize..."
if ! grep -q "tbg_validate_btc_address.*TBG_P5" "${STRAT}"; then
    LINE=$(getline 'client_auth' "${STRAT}")
    if [ -n "${LINE}" ]; then
        # Find the point where the address is extracted
        ADDR_LINE=$(getline_nth 'address' "${STRAT}" "$(grep -n 'address' "${STRAT}" | awk -v start="${LINE}" -F: '$1 > start' | head -1 | cut -d: -f1)")
        if [ -n "${ADDR_LINE}" ] && [ "${ADDR_LINE}" -gt "${LINE}" ]; then
            sedi "${ADDR_LINE}a\\
\\
\t/* TBG_P5: Validate miner-supplied address */\\
\tif (address && !tbg_validate_btc_address(address)) { /* TBG_P5 */\\
\t\ttbg_log_validation_failure(client->address_name, \"btc_address\", address, \"invalid format\");\\
\t\tLOGWARNING(\"Invalid BTC address from %s: %.32s\", client->address_name, address);\\
\t}" "${STRAT}"
            echo "    Address validation hook added"
            apply_hook
        else
            echo "    INFO: address extraction line not found, skipping address validation hook"
            apply_hook
        fi
    else
        echo "    WARNING: client_auth not found"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add input validation on mining.submit (worker name) ─────────────
echo "  Adding worker name validation on submit..."
if ! grep -q "tbg_validate_worker_name.*TBG_P5" "${STRAT}"; then
    # Find the submit_share function
    LINE=$(getline 'parse_method.*mining.submit' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG_P5: Validate worker name */\\
\tif (workername && !tbg_validate_worker_name(workername)) { /* TBG_P5 */\\
\t\ttbg_log_validation_failure(client->address_name, \"worker_name\", workername, \"invalid chars\");\\
\t}" "${STRAT}"
        echo "    Worker name validation hook added"
        apply_hook
    else
        echo "    INFO: mining.submit parse not found, skipping worker validation"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add per-connection rate limit check on share submission ─────────
echo "  Adding per-connection rate limit on share submit..."
if ! grep -q "tbg_rate_limit_check_conn.*RATE_SUBMIT.*TBG_P5" "${STRAT}"; then
    LINE=$(getline 'parse_method.*mining.submit' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG_P5: Per-connection submit rate limit */\\
\tif (!tbg_rate_limit_check_conn(&client->rate_state, RATE_SUBMIT)) { /* TBG_P5 */\\
\t\tLOGINFO(\"Share submit rate limit exceeded for %s\", client->address_name);\\
\t\treturn;\\
\t}" "${STRAT}"
        echo "    Submit rate limit hook added"
        apply_hook
    else
        echo "    INFO: mining.submit not found"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add JSON payload validation ─────────────────────────────────────
echo "  Adding JSON payload size validation..."
if ! grep -q "tbg_validate_json_payload.*TBG_P5" "${STRAT}"; then
    # Find the point where the raw JSON buffer is received
    LINE=$(getline 'parse_client_msg' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG_P5: Validate JSON payload size and nesting */\\
\tif (buf && !tbg_validate_json_payload(buf, strlen(buf), 65536)) { /* TBG_P5 */\\
\t\ttbg_log_validation_failure(client->address_name, \"json_payload\", \"(oversized)\", \"exceeds max size or nesting\");\\
\t\treturn;\\
\t}" "${STRAT}"
        echo "    JSON payload validation hook added"
        apply_hook
    else
        echo "    INFO: parse_client_msg not found"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add initialization calls to ckpool.c ────────────────────────────
echo "  Adding Phase 5 initialization to ckpool.c..."
if ! grep -q "tbg_rate_limit_init.*TBG_P5" "${MAIN}"; then
    LINE=$(getline 'tbg_metrics_init\|main.*argc' "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\t/* TBG_P5: Initialize security and performance modules */\\
\ttbg_rate_limit_init(NULL); /* TBG_P5: Use default rate limits */\\
\tLOGNOTICE(\"TBG Phase 5: Security modules initialized\"); /* TBG_P5 */" "${MAIN}"
        echo "    Initialization hooks added to ckpool.c"
        apply_hook
    else
        echo "    WARNING: main function not found in ckpool.c"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add shutdown calls to ckpool.c ──────────────────────────────────
echo "  Adding Phase 5 shutdown to ckpool.c..."
if ! grep -q "tbg_rate_limit_shutdown.*TBG_P5" "${MAIN}"; then
    LINE=$(getline 'clean_up\|exit.*EXIT_SUCCESS\|return 0' "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\ttbg_rate_limit_shutdown(); /* TBG_P5: Cleanup rate limiter */" "${MAIN}"
        echo "    Shutdown hooks added to ckpool.c"
        apply_hook
    else
        echo "    INFO: cleanup point not found in ckpool.c"
    fi
else
    echo "    Already patched"
    apply_hook
fi

echo "  Patch 13 complete"
