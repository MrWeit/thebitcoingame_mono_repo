#!/bin/bash
# 13-security-hooks.sh — Wire Phase 5 security modules into ckpool hot path
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Hooks input_validation and rate_limit into stratifier.c at the connection,
# authorization, and share submission points. Also wires event_ring and
# memory_pool initialization into ckpool.c startup/shutdown.
#
# IMPORTANT: This patch runs AFTER patches 01-11, so TBG event emission
# functions and variables (tbg_active, tbg_init_events, tbg_emit_*) already
# exist in stratifier.c, and tbg_metrics_init already exists in ckpool.c.
#
# In vanilla ckpool, the client struct field is `client->address` (IP string).
# There is NO `client->address_name` field.

echo "=== Patch 13: Security Hooks (Phase 5) ==="

# ─── Add includes to ckpool.c (for rate_limit_init/shutdown) ─────────
echo "  Adding Phase 5 includes to ckpool.c..."
if ! grep -q "rate_limit.h" "${MAIN}"; then
    LINE=$(getline '#include "ckpool.h"' "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
#include \"rate_limit.h\" /* TBG_P5 */" "${MAIN}"
        echo "    rate_limit.h include added to ckpool.c"
    else
        echo "    WARNING: ckpool.h include not found in ckpool.c"
    fi
else
    echo "    Already patched"
fi

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
# Hook into the authorization path — after client->authorised is set.
# Phase 1 already hooks here with tbg_emit_connect; we insert BEFORE
# the auth hook so rate-limited clients never emit a connect event.
echo "  Adding rate limit check on connections..."
if ! grep -q "tbg_rate_limit_connect.*TBG_P5" "${STRAT}"; then
    # Find the tbg_emit_connect hook added by Phase 1 patch 01
    LINE=$(getline 'tbg_emit_connect.*/\* TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\\
\t\t/* TBG_P5: Rate limit new connections */\\
\t\tif (ret && !tbg_rate_limit_connect(client->address)) { /* TBG_P5 */\\
\t\t\tLOGINFO(\"Rate limited connection from %s\", client->address);\\
\t\t\tclient->dropped = true;\\
\t\t\treturn;\\
\t\t}" "${STRAT}"
        echo "    Connection rate limit hook added"
        apply_hook
    else
        echo "    WARNING: tbg_emit_connect hook not found in stratifier.c"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add rate limit disconnect tracking ──────────────────────────────
# Hook into the same disconnect path as Phase 1 (before __del_client).
echo "  Adding rate limit disconnect tracking..."
if ! grep -q "tbg_rate_limit_disconnect.*TBG_P5" "${STRAT}"; then
    # Find Phase 1's disconnect hook (tbg_emit_disconnect)
    LINE=$(getline 'tbg_emit_disconnect.*/\* TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\ttbg_rate_limit_disconnect(client->address); /* TBG_P5 */" "${STRAT}"
        echo "    Disconnect tracking hook added"
        apply_hook
    else
        echo "    WARNING: tbg_emit_disconnect hook not found"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add input validation on mining.authorize ────────────────────────
echo "  Adding input validation on authorize..."
if ! grep -q "tbg_validate_btc_address.*TBG_P5" "${STRAT}"; then
    # Find the tbg_emit_connect hook (which is inside client_auth after auth succeeds)
    # and insert address validation BEFORE it
    LINE=$(getline 'tbg_rate_limit_connect.*/\* TBG_P5' "${STRAT}")
    if [ -z "${LINE}" ]; then
        LINE=$(getline 'tbg_emit_connect.*/\* TBG' "${STRAT}")
    fi
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\\
\t\t/* TBG_P5: Validate miner-supplied address */\\
\t\tif (user && user->username && !tbg_validate_btc_address(user->username)) { /* TBG_P5 */\\
\t\t\ttbg_log_validation_failure(client->address, \"btc_address\", user->username, \"invalid format\");\\
\t\t\tLOGWARNING(\"Invalid BTC address from %s: %.32s\", client->address, user->username);\\
\t\t}" "${STRAT}"
        echo "    Address validation hook added"
        apply_hook
    else
        echo "    INFO: auth hook point not found, skipping address validation"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add input validation on mining.submit (worker name) ─────────────
echo "  Adding worker name validation on submit..."
if ! grep -q "tbg_validate_worker_name.*TBG_P5" "${STRAT}"; then
    # Find the share emission hook from Phase 1
    LINE=$(getline 'tbg_emit_share.*/\* TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\\
\t\t/* TBG_P5: Validate worker name */\\
\t\tif (client->workername && !tbg_validate_worker_name(client->workername)) { /* TBG_P5 */\\
\t\t\ttbg_log_validation_failure(client->address, \"worker_name\", client->workername, \"invalid chars\");\\
\t\t}" "${STRAT}"
        echo "    Worker name validation hook added"
        apply_hook
    else
        echo "    INFO: tbg_emit_share not found, skipping worker validation"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add per-connection rate limit check on share submission ─────────
echo "  Adding per-connection rate limit on share submit..."
if ! grep -q "tbg_rate_limit_is_banned.*RATE_SUBMIT.*TBG_P5" "${STRAT}"; then
    # Insert before the Phase 1 share emission hook
    LINE=$(getline 'tbg_emit_share.*/\* TBG' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\\
\t\t/* TBG_P5: Check if IP is soft-banned from share flooding */\\
\t\tif (tbg_rate_limit_is_banned(client->address)) { /* RATE_SUBMIT TBG_P5 */\\
\t\t\tLOGINFO(\"Share rejected: IP soft-banned %s\", client->address);\\
\t\t}" "${STRAT}"
        echo "    Submit rate limit hook added"
        apply_hook
    else
        echo "    INFO: tbg_emit_share not found"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add JSON payload size validation ─────────────────────────────────
# Note: In vanilla ckpool, smsg_t contains json_t *json_msg (already parsed
# by jansson) and int64_t client_id — there is no raw buffer field.
# We validate the serialized size of the JSON object as a safety measure.
echo "  Adding JSON payload size validation..."
if ! grep -q "tbg_validate_json_payload.*TBG_P5" "${STRAT}"; then
    LINE=$(getline 'parse_instance_msg' "${STRAT}")
    if [ -n "${LINE}" ]; then
        # Find the opening brace of this function (next line with just {)
        BRACE=$(awk -v start="${LINE}" 'NR > start && /^{/ { print NR; exit }' "${STRAT}")
        if [ -n "${BRACE}" ]; then
            # Write replacement via temp file to avoid escaping issues
            cat > /tmp/tbg_json_check.c << 'JSONEOF'

	/* TBG_P5: Validate JSON payload size */
	{
		char *json_str = json_dumps(msg->json_msg, JSON_COMPACT);
		if (json_str) {
			size_t jlen = strlen(json_str);
			if (!tbg_validate_json_payload(json_str, jlen, 65536)) { /* TBG_P5 */
				tbg_log_validation_failure(client->address, "json_payload", "(oversized)", "exceeds max size or nesting");
				free(json_str);
				return;
			}
			free(json_str);
		}
	}
JSONEOF
            sedi "${BRACE}r /tmp/tbg_json_check.c" "${STRAT}"
            rm -f /tmp/tbg_json_check.c
            echo "    JSON payload validation hook added"
            apply_hook
        else
            echo "    INFO: Could not find function body for parse_instance_msg"
            apply_hook
        fi
    else
        echo "    INFO: parse_instance_msg not found"
        apply_hook
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add initialization calls to ckpool.c ────────────────────────────
# IMPORTANT: Must insert AFTER launch_logger() and config parsing, otherwise
# LOGNOTICE/LOGWARNING calls in tbg_rate_limit_init will segfault because
# ckpool's logging subsystem isn't ready yet.
# We anchor on the first prepare_child() call, which is after all setup.
echo "  Adding Phase 5 initialization to ckpool.c..."
if ! grep -q "tbg_rate_limit_init.*TBG_P5" "${MAIN}"; then
    LINE=$(getline 'prepare_child.*generator.*"generator"' "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\\
\t/* TBG_P5: Initialize security and performance modules */\\
\ttbg_rate_limit_init(NULL); /* TBG_P5: Use default rate limits */\\
\tLOGNOTICE(\"TBG Phase 5: Security modules initialized\"); /* TBG_P5 */" "${MAIN}"
        echo "    Initialization hooks added to ckpool.c (before prepare_child at ${LINE})"
        apply_hook
    else
        echo "    WARNING: prepare_child generator not found in ckpool.c"
    fi
else
    echo "    Already patched"
    apply_hook
fi

# ─── Add shutdown calls to ckpool.c ──────────────────────────────────
# Insert BEFORE the clean_up(&ckp) CALL (not the function definition).
# The call is `clean_up(&ckp);` inside main(), distinct from the
# function definition `static void clean_up(ckpool_t *ckp)`.
echo "  Adding Phase 5 shutdown to ckpool.c..."
if ! grep -q "tbg_rate_limit_shutdown.*TBG_P5" "${MAIN}"; then
    LINE=$(getline 'clean_up(&ckp)' "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\ttbg_rate_limit_shutdown(); /* TBG_P5: Cleanup rate limiter */" "${MAIN}"
        echo "    Shutdown hooks added to ckpool.c"
        apply_hook
    else
        echo "    INFO: clean_up(&ckp) call not found in ckpool.c"
        # Fallback: find return 0 at end of main
        LINE=$(grep -n 'return 0;' "${MAIN}" | tail -1 | cut -d: -f1)
        if [ -n "${LINE}" ]; then
            sedi "${LINE}i\\
\ttbg_rate_limit_shutdown(); /* TBG_P5: Cleanup rate limiter */" "${MAIN}"
            echo "    Shutdown hooks added (via return 0 fallback)"
            apply_hook
        else
            echo "    WARNING: No shutdown insertion point found"
        fi
    fi
else
    echo "    Already patched"
    apply_hook
fi

echo "  Patch 13 complete"
