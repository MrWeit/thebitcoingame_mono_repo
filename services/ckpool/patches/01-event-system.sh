#!/bin/bash
# 01-event-system.sh — Event emission system for stratifier.c
# Extracted from the original monolithic apply-patches.sh
# GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors

echo "=== Patch 01: Event Emission System ==="

# ─── PATCH: ckpool.h ─────────────────────────────────────────────────
# Add event_socket_path field to struct ckpool_instance.
echo "  Patching ckpool.h..."
if ! grep -q "event_socket_path" "${HEADER}"; then
    LINE=$(getline "void \*cdata;" "${HEADER}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tchar *event_socket_path; /* THE BITCOIN GAME */" "${HEADER}"
        echo "    Done (after line ${LINE})"
    else
        echo "    FATAL: Could not find cdata field in struct"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── PATCH: ckpool.c ─────────────────────────────────────────────────
echo "  Patching ckpool.c..."
if ! grep -q "event_socket_path" "${MAIN}"; then
    LINE=$(getline "btcsig" "${MAIN}")
    if [ -n "${LINE}" ]; then
        sedi "${LINE}a\\
\tjson_get_string(\&ckp->event_socket_path, json_conf, \"event_socket_path\"); /* TBG */" "${MAIN}"
        echo "    Done (line ${LINE})"
    else
        echo "    FATAL: Could not find btcsig anchor in ckpool.c"; exit 1
    fi
else
    echo "    Already patched"
fi

# ─── PATCH: stratifier.c — Event emission code ───────────────────────
echo "  Patching stratifier.c (event emission)..."
if grep -q "tbg_emit" "${STRAT}"; then
    echo "    Already patched"
else
    # Write event emission C code to temp file
    cat > /tmp/tbg_events.c << 'TBGEOF'

/* ======================================================================
 * THE BITCOIN GAME: Event Emission System
 * Non-blocking event emission via Unix domain socket (SOCK_DGRAM).
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 * ====================================================================== */
#include <sys/un.h>

static int tbg_event_fd = -1;
static struct sockaddr_un tbg_event_addr;
static int tbg_active = 0;

static void tbg_init_events(ckpool_t *ckp)
{
	const char *path = "/tmp/ckpool/events.sock";

	if (ckp && ckp->event_socket_path)
		path = ckp->event_socket_path;

	tbg_event_fd = socket(AF_UNIX, SOCK_DGRAM, 0);
	if (tbg_event_fd < 0) {
		LOGWARNING("TBG: Cannot create event socket: %s", strerror(errno));
		return;
	}

	int fl = fcntl(tbg_event_fd, F_GETFL, 0);
	if (fl >= 0) fcntl(tbg_event_fd, F_SETFL, fl | O_NONBLOCK);

	memset(&tbg_event_addr, 0, sizeof(tbg_event_addr));
	tbg_event_addr.sun_family = AF_UNIX;
	strncpy(tbg_event_addr.sun_path, path, sizeof(tbg_event_addr.sun_path) - 1);

	tbg_active = 1;
	LOGNOTICE("TBG: Event emitter ready -> %s", path);
}

static void tbg_emit(const char *buf, int len)
{
	if (!tbg_active || tbg_event_fd < 0 || len <= 0) return;
	sendto(tbg_event_fd, buf, len, MSG_DONTWAIT,
	       (struct sockaddr *)&tbg_event_addr, sizeof(tbg_event_addr));
}

static void tbg_emit_share(const char *user, const char *worker,
			    double diff, double sdiff, int accepted)
{
	char buf[2048];
	struct timeval tv;
	gettimeofday(&tv, NULL);
	int n = snprintf(buf, sizeof(buf),
		"{\"event\":\"share_submitted\",\"ts\":%ld.%06ld,"
		"\"source\":\"hosted\",\"data\":{"
		"\"user\":\"%s\",\"worker\":\"%s\","
		"\"diff\":%.8f,\"sdiff\":%.8f,\"accepted\":%s}}",
		(long)tv.tv_sec, (long)tv.tv_usec,
		user ? user : "unknown",
		worker ? worker : "unknown",
		diff, sdiff,
		accepted ? "true" : "false");
	tbg_emit(buf, n);
}

static void tbg_emit_connect(const char *user, const char *worker,
			      const char *ip, double diff)
{
	char buf[2048];
	struct timeval tv;
	gettimeofday(&tv, NULL);
	int n = snprintf(buf, sizeof(buf),
		"{\"event\":\"miner_connected\",\"ts\":%ld.%06ld,"
		"\"source\":\"hosted\",\"data\":{"
		"\"user\":\"%s\",\"worker\":\"%s\","
		"\"ip\":\"%s\",\"initial_diff\":%.8f}}",
		(long)tv.tv_sec, (long)tv.tv_usec,
		user ? user : "unknown",
		worker ? worker : "unknown",
		ip ? ip : "0.0.0.0", diff);
	tbg_emit(buf, n);
}

static void tbg_emit_disconnect(const char *user, const char *worker,
				const char *ip)
{
	char buf[2048];
	struct timeval tv;
	gettimeofday(&tv, NULL);
	int n = snprintf(buf, sizeof(buf),
		"{\"event\":\"miner_disconnected\",\"ts\":%ld.%06ld,"
		"\"source\":\"hosted\",\"data\":{"
		"\"user\":\"%s\",\"worker\":\"%s\","
		"\"ip\":\"%s\"}}",
		(long)tv.tv_sec, (long)tv.tv_usec,
		user ? user : "unknown",
		worker ? worker : "unknown",
		ip ? ip : "0.0.0.0");
	tbg_emit(buf, n);
}

static void tbg_emit_block(const char *user, const char *worker,
			    int height, double sdiff, double ndiff)
{
	char buf[2048];
	struct timeval tv;
	gettimeofday(&tv, NULL);
	int n = snprintf(buf, sizeof(buf),
		"{\"event\":\"block_found\",\"ts\":%ld.%06ld,"
		"\"source\":\"hosted\",\"data\":{"
		"\"user\":\"%s\",\"worker\":\"%s\","
		"\"height\":%d,\"diff\":%.8f,\"network_diff\":%.8f}}",
		(long)tv.tv_sec, (long)tv.tv_usec,
		user ? user : "unknown",
		worker ? worker : "unknown",
		height, sdiff, ndiff);
	tbg_emit(buf, n);
}

static void tbg_emit_newblock(const char *hash, int height, double diff)
{
	char buf[2048];
	struct timeval tv;
	gettimeofday(&tv, NULL);
	int n = snprintf(buf, sizeof(buf),
		"{\"event\":\"new_block_network\",\"ts\":%ld.%06ld,"
		"\"source\":\"hosted\",\"data\":{"
		"\"hash\":\"%s\",\"height\":%d,\"diff\":%.8f}}",
		(long)tv.tv_sec, (long)tv.tv_usec,
		hash ? hash : "", height, diff);
	tbg_emit(buf, n);
}

static void tbg_emit_bestdiff(const char *user, const char *worker,
			       double newbest, double prevbest)
{
	char buf[2048];
	struct timeval tv;
	gettimeofday(&tv, NULL);
	int n = snprintf(buf, sizeof(buf),
		"{\"event\":\"share_best_diff\",\"ts\":%ld.%06ld,"
		"\"source\":\"hosted\",\"data\":{"
		"\"user\":\"%s\",\"worker\":\"%s\","
		"\"new_best\":%.8f,\"prev_best\":%.8f,\"timeframe\":\"alltime\"}}",
		(long)tv.tv_sec, (long)tv.tv_usec,
		user ? user : "unknown",
		worker ? worker : "unknown",
		newbest, prevbest);
	tbg_emit(buf, n);
}

/* === THE BITCOIN GAME: End of event emission === */

TBGEOF

    # Insert event code before first static declaration
    FIRST_STATIC=$(getline "^static " "${STRAT}")
    if [ -n "${FIRST_STATIC}" ]; then
        sedi "$((FIRST_STATIC - 1))r /tmp/tbg_events.c" "${STRAT}"
        echo "    Event code inserted at line $((FIRST_STATIC - 1))"
    else
        echo "    FATAL: No static declaration found in stratifier.c"; exit 1
    fi
    rm -f /tmp/tbg_events.c
fi

# ─── Hook: Initialize events in stratifier() entry ───────────────────
# NOTE: Idempotency checks use "/* TBG */" suffix to distinguish hook CALLS
# from function DEFINITIONS in the event emission code block above.
LINE=$(getline "sdata->ckp = ckp;" "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q "tbg_init_events(ckp);.*/\* TBG" "${STRAT}"; then
        sedi "${LINE}a\\
\ttbg_init_events(ckp); /* TBG */" "${STRAT}"
        echo "    Init hook: line $((LINE+1))"
    fi
    apply_hook
else
    echo "    WARNING: Init hook point not found (sdata->ckp = ckp)"
fi

# ─── Hook: Share accepted (after check_best_diff CALL) ───────────────
LINE=$(grep -n "check_best_diff.*sdiff, client);" "${STRAT}" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE}" ]; then
    if ! grep -q "tbg_emit_share.*/\* TBG" "${STRAT}"; then
        sedi "${LINE}a\\
\t\ttbg_emit_share(user->username, client->workername, client->diff, sdiff, 1); /* TBG */" "${STRAT}"
        echo "    Share hook: line $((LINE+1))"
    fi
    apply_hook
else
    echo "    WARNING: Share hook point not found (check_best_diff call)"
fi

# ─── Hook: Best diff update ──────────────────────────────────────────
LINE=$(getline "user->best_diff = sdiff" "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q "tbg_emit_bestdiff.*/\* TBG" "${STRAT}"; then
        sedi "${LINE}i\\
\t\ttbg_emit_bestdiff(user->username, worker->workername, sdiff, user->best_diff); /* TBG */" "${STRAT}"
        echo "    Best diff hook: line ${LINE}"
    fi
    apply_hook
else
    echo "    WARNING: Best diff hook point not found (user->best_diff = sdiff)"
fi

# ─── Hook: Block solved (unnamed) ────────────────────────────────────
LINE=$(getline 'Solved and confirmed block!"' "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q 'tbg_emit_block("pool".*/\* TBG' "${STRAT}"; then
        sedi "${LINE}a\\
\t\ttbg_emit_block(\"pool\", \"pool\", height, 0, 0); /* TBG */" "${STRAT}"
        echo "    Block hook (unnamed): line $((LINE+1))"
    fi
    apply_hook
else
    echo "    WARNING: Block hook (unnamed) not found"
fi

# ─── Hook: Block solved (named) ──────────────────────────────────────
LINE=$(getline 'Solved and confirmed block %d' "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q 'tbg_emit_block(user.*/\* TBG' "${STRAT}"; then
        sedi "${LINE}a\\
\t\ttbg_emit_block(user ? user->username : \"unknown\", workername, height, 0, 0); /* TBG */" "${STRAT}"
        echo "    Block hook (named): line $((LINE+1))"
    fi
    apply_hook
else
    echo "    WARNING: Block hook (named) not found"
fi

# ─── Hook: New block on network ──────────────────────────────────────
LINE=$(getline 'Block hash changed to' "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q "tbg_emit_newblock.*/\* TBG" "${STRAT}"; then
        sedi "${LINE}a\\
\t\tif(sdata->current_workbase) tbg_emit_newblock(sdata->lastswaphash, sdata->current_workbase->height, sdata->current_workbase->diff); /* TBG */" "${STRAT}"
        echo "    New block hook: line $((LINE+1))"
    fi
    apply_hook
else
    echo "    WARNING: New block hook not found (Block hash changed to)"
fi

# ─── Hook: Client disconnect ─────────────────────────────────────────
LINE=$(getline_nth "__del_client(sdata, client);" "${STRAT}" 2)
if [ -n "${LINE}" ]; then
    if ! grep -q "tbg_emit_disconnect.*/\* TBG" "${STRAT}"; then
        sedi "${LINE}i\\
\ttbg_emit_disconnect(client->user_instance ? client->user_instance->username : \"unknown\", client->workername ? client->workername : \"unknown\", client->address); /* TBG */" "${STRAT}"
        echo "    Disconnect hook: line ${LINE}"
    fi
    apply_hook
else
    echo "    WARNING: Disconnect hook not found (__del_client 2nd occurrence)"
fi

# ─── Hook: Miner authorized ──────────────────────────────────────────
LINE=$(getline "client->authorised = ret" "${STRAT}")
if [ -n "${LINE}" ]; then
    if ! grep -q "tbg_emit_connect.*/\* TBG" "${STRAT}"; then
        sedi "${LINE}a\\
\t\tif(ret) tbg_emit_connect(user->username, client->workername ? client->workername : \"unknown\", client->address, client->diff); /* TBG */" "${STRAT}"
        echo "    Auth hook: line $((LINE+1))"
    fi
    apply_hook
else
    echo "    WARNING: Auth hook not found (client->authorised = ret)"
fi

echo "  Patch 01 complete"
