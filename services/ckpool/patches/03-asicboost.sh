#!/bin/bash
# 03-asicboost.sh — AsicBoost (version rolling) detection & event emission
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors

echo "=== Patch 03: AsicBoost Detection ==="

# ─── Add fields to stratum_instance struct ────────────────────────────
echo "  Adding AsicBoost fields to stratum_instance..."
if ! grep -q "asicboost_capable" "${STRAT}"; then
    # Insert after best_diff field in stratum_instance (use unique comment to avoid other structs)
    LINE=$(getline "Best share found by this instance" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\\
\tbool asicboost_capable;\t/* TBG: Sent mining.configure with version-rolling */\\
\tbool asicboost_active;\t/* TBG: Actually submitted shares with version rolling */\\
\tbool asicboost_logged;\t/* TBG: Detection event already emitted */" "${STRAT}"
        echo "    Struct fields added after line ${LINE}"
    else
        echo "    FATAL: Could not find best_diff in stratum_instance"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── Add tbg_emit_asicboost function ─────────────────────────────────
echo "  Adding tbg_emit_asicboost function..."
if ! grep -q "tbg_emit_asicboost" "${STRAT}"; then
    # Insert after the last TBG event function (tbg_emit_bestdiff)
    LINE=$(getline "End of event emission" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
static void tbg_emit_asicboost(const char *user, const char *worker,\\
\t\t\t\tuint32_t pool_mask, uint32_t miner_mask)\\
{\\
\tchar buf[2048];\\
\tstruct timeval tv;\\
\tgettimeofday(\&tv, NULL);\\
\tint n = snprintf(buf, sizeof(buf),\\
\t\t\"{\\\\\"event\\\\\":\\\\\"asicboost_detected\\\\\",\\\\\"ts\\\\\":%ld.%06ld,\"\\
\t\t\"\\\\\"source\\\\\":\\\\\"hosted\\\\\",\\\\\"data\\\\\":{\"\\
\t\t\"\\\\\"user\\\\\":\\\\\"%s\\\\\",\\\\\"worker\\\\\":\\\\\"%s\\\\\",\"\\
\t\t\"\\\\\"pool_mask\\\\\":\\\\\"%08x\\\\\",\\\\\"miner_mask\\\\\":\\\\\"%08x\\\\\"}}\",\\
\t\t(long)tv.tv_sec, (long)tv.tv_usec,\\
\t\tuser ? user : \"unknown\",\\
\t\tworker ? worker : \"unknown\",\\
\t\tpool_mask, miner_mask);\\
\ttbg_emit(buf, n);\\
}\\
" "${STRAT}"
        echo "    tbg_emit_asicboost added"
    else
        echo "    FATAL: Could not find event emission end marker"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── Hook: mining.configure sets asicboost_capable ────────────────────
echo "  Adding mining.configure AsicBoost hook..."
LINE=$(getline 'stratum_add_send(sdata, val, client_id, SM_CONFIGURE)' "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q "asicboost_capable = true" "${STRAT}"; then
        sedi "${LINE}i\\
\t\tclient->asicboost_capable = true; /* TBG: AsicBoost detection */" "${STRAT}"
        echo "    mining.configure hook: line ${LINE}"
    fi
    apply_hook
else
    echo "    WARNING: mining.configure hook point not found"
fi

# ─── Hook: parse_submit detects version rolling ──────────────────────
# We need to find the version_mask32 validation block and add detection after it
echo "  Adding share submission AsicBoost detection hook..."
# Find the line where version_mask is applied to block header (inside submission_diff)
# The detection should go in parse_submit where version_mask32 is validated
LINE=$(getline 'sscanf(version_mask, "%x", &version_mask32)' "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q "!client->asicboost_logged" "${STRAT}"; then
        # Find the closing brace of the version_mask if-block (after the sscanf)
        # Insert detection after the version_mask32 is parsed
        DETECT_LINE=$((LINE + 1))
        sedi "${DETECT_LINE}a\\
\t\t\tif (version_mask32 && !client->asicboost_logged) { /* TBG */\\
\t\t\t\tclient->asicboost_active = true;\\
\t\t\t\tclient->asicboost_logged = true;\\
\t\t\t\tif (user) tbg_emit_asicboost(user->username, client->workername, ckp->version_mask, version_mask32);\\
\t\t\t}" "${STRAT}"
        echo "    AsicBoost detection hook added after line ${DETECT_LINE}"
    fi
    apply_hook
else
    echo "    WARNING: version_mask32 sscanf not found in parse_submit"
fi

# ─── Enhance tbg_emit_connect with asicboost_capable ─────────────────
# Modify the existing miner_connected event to include asicboost field
echo "  Enhancing miner_connected event with asicboost field..."
if grep -q "asicboost_capable.*miner_connected" "${STRAT}"; then
    echo "    Already patched"
else
    # Replace the existing tbg_emit_connect call in the auth hook to pass asicboost
    # The existing call is:
    #   if(ret) tbg_emit_connect(user->username, client->workername ? ...
    # We need to enhance it. Since the function signature would need to change,
    # let's add a separate emit right after the connect emit
    LINE=$(getline 'tbg_emit_connect(user->username' "${STRAT}")
    if [ -n "${LINE}" ]; then
        # We'll emit the asicboost status as part of an enhanced connect event
        # For now, the asicboost_capable flag won't be set at connect time
        # (it's set during mining.configure which happens before auth usually)
        # So we can just note it - the flag gets set in mining.configure handler
        echo "    Note: asicboost_capable tracked via mining.configure hook"
    fi
fi

echo "  Patch 03 complete"
