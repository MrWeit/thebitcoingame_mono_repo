#!/bin/bash
# 15-signet-compat.sh — Fix difficulty handling for signet/testnet/regtest
# License: GPLv3 (same as ckpool)
#
# On signet/regtest, network_diff is clamped to 1 (actual diff is trivial).
# This causes the vardiff calculation to be destroyed by MIN(optimal, network_diff).
# Fix: skip the network_diff clamp when it's trivially low.
#
# Also fixes the share event emission to fire for ALL accepted shares,
# not just personal-best shares (bug in patch 01 hook placement).

echo "  [15] Signet/regtest compatibility fixes..."

# ─── Fix 1: Skip network_diff clamp on signet/testnet/regtest ─────
# On these networks, network_diff is clamped to 1.0 internally. The line
# `optimal = MIN(optimal, network_diff)` wipes out the entire vardiff
# calculation (e.g. 196000 → 1). We must skip this clamp entirely
# when network_diff is trivially low, so vardiff can work properly.

if ! grep -q "TBG_SIGNET: Skip network_diff clamp" "${STRAT}"; then
    awk '
    /Set to lower of optimal and network_diff/ {
        print "\t/* TBG_SIGNET: Skip network_diff clamp on signet/testnet/regtest."
        print "\t * On these networks, network_diff is clamped to 1.0 which would"
        print "\t * destroy the vardiff calculation. Only apply this clamp"
        print "\t * when network_diff is meaningful (mainnet). */"
        print "\tif (network_diff > 1.0)"
        getline
        print "\t" $0
        next
    }
    { print }
    ' "${STRAT}" > "${STRAT}.tmp" && mv "${STRAT}.tmp" "${STRAT}"

    echo "    Fixed: VarDiff network_diff clamp skipped on low-diff networks"
    apply_hook
else
    echo "    Skipped (already applied): VarDiff network_diff fix"
fi

# ─── Fix 2: Emit share event for ALL accepted shares, not just best diff ─
# Patch 01 placed tbg_emit_share() inside the "if (sdiff > best_diff)" block,
# so only ~1% of shares generate events. Move it to fire for every accepted share.

if ! grep -q "TBG_FIX: Emit share for all accepted" "${STRAT}"; then
    awk '
    /Accepted client.*share diff/ {
        print
        getline
        print
        print "\t\t\t\ttbg_emit_share(user->username, client->workername, client->diff, sdiff, 1); /* TBG_FIX: Emit share for all accepted */"
        next
    }
    { print }
    ' "${STRAT}" > "${STRAT}.tmp" && mv "${STRAT}.tmp" "${STRAT}"

    echo "    Fixed: Share events now emitted for all accepted shares"
    apply_hook
else
    echo "    Skipped (already applied): Share emit fix"
fi

# ─── Fix 3: Also emit for rejected shares (stale/dupe/invalid) ──────

if ! grep -q "TBG_FIX: Emit rejected share" "${STRAT}"; then
    awk '
    /Rejected client.*invalid share/ {
        print
        print "\ttbg_emit_share(user->username, client->workername, client->diff, sdiff, 0); /* TBG_FIX: Emit rejected share */"
        next
    }
    { print }
    ' "${STRAT}" > "${STRAT}.tmp" && mv "${STRAT}.tmp" "${STRAT}"

    echo "    Fixed: Rejected share events now emitted"
    apply_hook
else
    echo "    Skipped (already applied): Rejected share emit fix"
fi

# ─── Fix 4: Move block_found emission AFTER user lookup ─────────────
# Patch 01 placed tbg_emit_block() BEFORE user_by_workername(), so
# the `user` pointer is uninitialized and falls back to "unknown".
# Fix: remove the misplaced emit and re-insert it after user lookup.

if ! grep -q "TBG_FIX: Block emit after user lookup" "${STRAT}"; then
    awk '
    # Remove the misplaced tbg_emit_block(user ? line
    /tbg_emit_block\(user \? user->username : "unknown"/ {
        next
    }
    # After user_by_workername lookup, insert the block emit
    /user = user_by_workername\(sdata, workername\)/ {
        print
        print "\t\ttbg_emit_block(user ? user->username : \"unknown\", workername, height, 0, 0); /* TBG_FIX: Block emit after user lookup */"
        next
    }
    { print }
    ' "${STRAT}" > "${STRAT}.tmp" && mv "${STRAT}.tmp" "${STRAT}"

    echo "    Fixed: Block event now emitted after user lookup (resolves user=unknown)"
    apply_hook
else
    echo "    Skipped (already applied): Block emit fix"
fi

echo "  [15] Signet/regtest compatibility + event fixes: done"
