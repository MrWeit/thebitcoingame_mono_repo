#!/bin/bash
# 09-region-tag.sh — Add region tag to ckpool config and event emission
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
#
# Adds tbg_region[32] field to the ckpool config struct,
# parses it from JSON config, and injects it into every emitted event.

echo "=== Patch 09: Region Tag ==="

# ─── PATCH: ckpool.h — Add tbg_region field ────────────────────────────
echo "  Patching ckpool.h (tbg_region)..."
if ! grep -q "tbg_region" "${HEADER}"; then
    LINE=$(getline "event_socket_path" "${HEADER}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tchar tbg_region[32]; /* TBG: region tag for multi-instance */" "${HEADER}"
        echo "    Done (after line ${LINE})"
    else
        echo "    FATAL: Could not find event_socket_path in ckpool.h"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── PATCH: ckpool.c — Parse tbg_region from config ───────────────────
echo "  Patching ckpool.c (parse tbg_region)..."
if ! grep -q "tbg_region" "${MAIN}"; then
    LINE=$(getline "event_socket_path" "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\t{ /* TBG: region tag */\\
\t\tchar *region = NULL;\\
\t\tjson_get_string(\&region, json_conf, \"tbg_region\");\\
\t\tif (region) {\\
\t\t\tstrncpy(ckp->tbg_region, region, sizeof(ckp->tbg_region) - 1);\\
\t\t\tckp->tbg_region[sizeof(ckp->tbg_region) - 1] = '\\\\0';\\
\t\t} else {\\
\t\t\tstrcpy(ckp->tbg_region, \"default\");\\
\t\t}\\
\t}" "${MAIN}"
        echo "    Done (after line ${LINE})"
    else
        echo "    FATAL: Could not find event_socket_path in ckpool.c"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── PATCH: stratifier.c — Inject region into tbg_emit() ──────────────
echo "  Patching stratifier.c (region injection in tbg_emit)..."
if ! grep -q "tbg_region_tag" "${STRAT}"; then
    # Add global region tag variable after tbg_active declaration
    LINE=$(getline "static int tbg_active" "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
static char tbg_region_tag[32] = \"default\"; /* TBG: region for event tagging */" "${STRAT}"
        echo "    Region tag variable added after line ${LINE}"
    else
        echo "    WARNING: tbg_active not found"
    fi

    # Set region in tbg_init_events from ckp->tbg_region
    LINE=$(getline 'tbg_active = 1;' "${STRAT}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}i\\
\tif (ckp && ckp->tbg_region[0])\\
\t\tstrncpy(tbg_region_tag, ckp->tbg_region, sizeof(tbg_region_tag) - 1);" "${STRAT}"
        echo "    Region copy added before tbg_active"
    else
        echo "    WARNING: tbg_active = 1 not found"
    fi

    # Modify tbg_emit() to inject region into JSON
    # Replace the sendto call with region-injecting version.
    # We use a temp file + line-number sed to avoid escaping issues with
    # C string literals containing backslash-quotes.
    SENDTO_LINE=$(getline 'sendto(tbg_event_fd, buf, len, MSG_DONTWAIT' "${STRAT}")
    if [ -n "${SENDTO_LINE}" ]; then
        # The sendto spans two lines:
        #   sendto(tbg_event_fd, buf, len, MSG_DONTWAIT,
        #          (struct sockaddr *)&tbg_event_addr, sizeof(tbg_event_addr));
        SENDTO_END=$((SENDTO_LINE + 1))

        # Write replacement C code to temp file (heredoc preserves quotes)
        cat > /tmp/tbg_region_inject.c << 'REGIONEOF'
	/* TBG: inject region tag into event JSON */
	char rbuf[4096];
	int rlen = snprintf(rbuf, sizeof(rbuf), "{\"region\":\"%s\",%s", tbg_region_tag, buf + 1);
	if (rlen > 0 && rlen < (int)sizeof(rbuf))
		sendto(tbg_event_fd, rbuf, rlen, MSG_DONTWAIT,
		       (struct sockaddr *)&tbg_event_addr, sizeof(tbg_event_addr));
REGIONEOF

        # Delete the original 2-line sendto, then insert replacement
        sedi "${SENDTO_LINE},${SENDTO_END}d" "${STRAT}"
        sedi "$((SENDTO_LINE - 1))r /tmp/tbg_region_inject.c" "${STRAT}"
        rm -f /tmp/tbg_region_inject.c
        echo "    Region injection applied to tbg_emit()"
    else
        echo "    WARNING: sendto pattern not found in tbg_emit()"
    fi
    apply_hook
else
    echo "    Already patched"
    apply_hook
fi

echo "  Patch 09 complete"
