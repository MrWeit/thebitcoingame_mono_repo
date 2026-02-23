/*
 * rate_limit.c — Token-bucket rate limiter for ckpool
 * THE BITCOIN GAME — GPLv3
 *
 * Implements per-IP and per-connection rate limiting using token buckets
 * with a hash map (uthash) for IP state tracking. A background thread
 * periodically cleans up stale entries to prevent memory leaks from
 * transient connections.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>
#include <time.h>

#include "rate_limit.h"
#include "uthash.h"
#include "libckpool.h"

/* ── Internal uthash entry with actual hash handle ───────────────── */

typedef struct ip_rate_entry {
	char ip[INET6_ADDRSTRLEN];
	rate_bucket_t connect_bucket;
	_Atomic int32_t active_connections;
	time_t first_seen;
	time_t last_seen;
	time_t softban_until;
	UT_hash_handle hh;
} ip_rate_entry_t;

/* ── Global state ────────────────────────────────────────────────── */

static ip_rate_entry_t *ip_table = NULL;
static pthread_rwlock_t ip_table_lock = PTHREAD_RWLOCK_INITIALIZER;

static rate_limit_config_t g_config;
static _Atomic int32_t g_total_connections = ATOMIC_VAR_INIT(0);
static volatile int cleanup_running = 0;
static pthread_t cleanup_thread;

/* ── Token bucket operations ─────────────────────────────────────── */

static void bucket_init(rate_bucket_t *b, uint32_t max_tokens,
                        uint32_t refill_per_min)
{
	atomic_store(&b->tokens, max_tokens);
	b->max_tokens = max_tokens;
	b->refill_per_min = refill_per_min;
	b->last_refill = time(NULL);
}

static void bucket_refill(rate_bucket_t *b)
{
	time_t now = time(NULL);
	time_t elapsed = now - b->last_refill;
	uint32_t current, new_tokens, to_add;

	if (elapsed <= 0)
		return;

	/* Calculate tokens to add based on elapsed time */
	to_add = (uint32_t)((elapsed * b->refill_per_min) / 60);
	if (to_add == 0)
		return;

	current = atomic_load(&b->tokens);
	new_tokens = current + to_add;
	if (new_tokens > b->max_tokens)
		new_tokens = b->max_tokens;

	atomic_store(&b->tokens, new_tokens);
	b->last_refill = now;
}

static bool bucket_consume(rate_bucket_t *b)
{
	uint32_t current;

	bucket_refill(b);

	current = atomic_load(&b->tokens);
	if (current == 0)
		return false;

	/* Attempt to consume a token atomically */
	while (current > 0) {
		if (atomic_compare_exchange_weak(&b->tokens, &current,
		                                  current - 1))
			return true;
	}
	return false;
}

/* ── IP state management ─────────────────────────────────────────── */

static ip_rate_entry_t *find_ip_entry(const char *ip)
{
	ip_rate_entry_t *entry = NULL;

	HASH_FIND_STR(ip_table, ip, entry);
	return entry;
}

static ip_rate_entry_t *get_or_create_ip_entry(const char *ip)
{
	ip_rate_entry_t *entry;

	entry = find_ip_entry(ip);
	if (entry) {
		entry->last_seen = time(NULL);
		return entry;
	}

	entry = calloc(1, sizeof(*entry));
	if (!entry)
		return NULL;

	strncpy(entry->ip, ip, sizeof(entry->ip) - 1);
	entry->ip[sizeof(entry->ip) - 1] = '\0';
	entry->first_seen = time(NULL);
	entry->last_seen = entry->first_seen;
	entry->softban_until = 0;
	atomic_store(&entry->active_connections, 0);

	bucket_init(&entry->connect_bucket,
	            (uint32_t)g_config.connections_per_ip_per_minute,
	            (uint32_t)g_config.connections_per_ip_per_minute);

	HASH_ADD_STR(ip_table, ip, entry);
	return entry;
}

/* ── Background cleanup thread ───────────────────────────────────── */

static void *cleanup_thread_func(void *arg)
{
	(void)arg;

	while (cleanup_running) {
		ip_rate_entry_t *entry, *tmp;
		time_t now = time(NULL);
		time_t cutoff = now - RATE_STALE_THRESHOLD;

		sleep(RATE_CLEANUP_INTERVAL);

		if (!cleanup_running)
			break;

		pthread_rwlock_wrlock(&ip_table_lock);

		HASH_ITER(hh, ip_table, entry, tmp) {
			/* Don't remove entries with active connections */
			if (atomic_load(&entry->active_connections) > 0)
				continue;

			/* Remove stale entries */
			if (entry->last_seen < cutoff) {
				HASH_DEL(ip_table, entry);
				free(entry);
			}
		}

		pthread_rwlock_unlock(&ip_table_lock);
	}

	return NULL;
}

/* ── Public API ──────────────────────────────────────────────────── */

void tbg_rate_limit_init(const rate_limit_config_t *config)
{
	if (config) {
		memcpy(&g_config, config, sizeof(g_config));
	} else {
		/* Use defaults */
		g_config.connections_per_ip_per_minute = RATE_CONNECT_PER_MIN;
		g_config.max_connections_per_ip = RATE_CONNECT_MAX_CONCURRENT;
		g_config.max_subscribes_per_minute = RATE_SUBSCRIBE_PER_MIN;
		g_config.max_authorizes_per_minute = RATE_AUTHORIZE_PER_MIN;
		g_config.max_shares_per_minute = RATE_SUBMIT_PER_MIN;
		g_config.max_invalid_shares_per_minute = RATE_INVALID_PER_MIN;
		g_config.global_max_connections = RATE_GLOBAL_MAX_CONNS;
		g_config.softban_duration_seconds = RATE_SOFTBAN_DURATION;
	}

	atomic_store(&g_total_connections, 0);
	cleanup_running = 1;

	if (pthread_create(&cleanup_thread, NULL, cleanup_thread_func,
	                    NULL) != 0) {
		LOGWARNING("Failed to start rate limiter cleanup thread");
		cleanup_running = 0;
	}

	LOGNOTICE("Rate limiter initialized: %d conn/IP/min, %d max/IP, "
	          "%d global max",
	          g_config.connections_per_ip_per_minute,
	          g_config.max_connections_per_ip,
	          g_config.global_max_connections);
}

void tbg_rate_limit_shutdown(void)
{
	ip_rate_entry_t *entry, *tmp;

	cleanup_running = 0;
	pthread_join(cleanup_thread, NULL);

	pthread_rwlock_wrlock(&ip_table_lock);

	HASH_ITER(hh, ip_table, entry, tmp) {
		HASH_DEL(ip_table, entry);
		free(entry);
	}

	pthread_rwlock_unlock(&ip_table_lock);
}

bool tbg_rate_limit_connect(const char *ip)
{
	ip_rate_entry_t *entry;
	int32_t current_total;
	int32_t active;

	if (!ip)
		return false;

	/* Check global connection limit */
	current_total = atomic_load(&g_total_connections);
	if (current_total >= g_config.global_max_connections) {
		LOGWARNING("Rate limit: global connection limit reached (%d)",
		           current_total);
		return false;
	}

	pthread_rwlock_wrlock(&ip_table_lock);

	entry = get_or_create_ip_entry(ip);
	if (!entry) {
		pthread_rwlock_unlock(&ip_table_lock);
		return false;
	}

	/* Check soft-ban */
	if (entry->softban_until > 0 && time(NULL) < entry->softban_until) {
		pthread_rwlock_unlock(&ip_table_lock);
		LOGINFO("Rate limit: connection rejected, IP %s is soft-banned", ip);
		return false;
	}

	/* Clear expired soft-ban */
	if (entry->softban_until > 0 && time(NULL) >= entry->softban_until)
		entry->softban_until = 0;

	/* Check per-IP concurrent limit */
	active = atomic_load(&entry->active_connections);
	if (active >= g_config.max_connections_per_ip) {
		pthread_rwlock_unlock(&ip_table_lock);
		LOGINFO("Rate limit: max concurrent connections for IP %s (%d)",
		        ip, active);
		return false;
	}

	/* Check per-IP rate limit */
	if (!bucket_consume(&entry->connect_bucket)) {
		pthread_rwlock_unlock(&ip_table_lock);
		LOGWARNING("Rate limit: connection rate exceeded for IP %s", ip);
		return false;
	}

	/* Allow the connection */
	atomic_fetch_add(&entry->active_connections, 1);
	atomic_fetch_add(&g_total_connections, 1);

	pthread_rwlock_unlock(&ip_table_lock);
	return true;
}

void tbg_rate_limit_disconnect(const char *ip)
{
	ip_rate_entry_t *entry;

	if (!ip)
		return;

	atomic_fetch_sub(&g_total_connections, 1);

	pthread_rwlock_rdlock(&ip_table_lock);
	entry = find_ip_entry(ip);
	if (entry) {
		int32_t active = atomic_fetch_sub(&entry->active_connections, 1);
		/* Guard against underflow */
		if (active <= 0)
			atomic_store(&entry->active_connections, 0);
	}
	pthread_rwlock_unlock(&ip_table_lock);
}

bool tbg_rate_limit_is_banned(const char *ip)
{
	ip_rate_entry_t *entry;
	bool banned = false;

	if (!ip)
		return false;

	pthread_rwlock_rdlock(&ip_table_lock);
	entry = find_ip_entry(ip);
	if (entry && entry->softban_until > 0 &&
	    time(NULL) < entry->softban_until)
		banned = true;
	pthread_rwlock_unlock(&ip_table_lock);

	return banned;
}

void tbg_rate_limit_softban(const char *ip)
{
	ip_rate_entry_t *entry;

	if (!ip)
		return;

	pthread_rwlock_wrlock(&ip_table_lock);
	entry = get_or_create_ip_entry(ip);
	if (entry) {
		entry->softban_until = time(NULL) +
		                       g_config.softban_duration_seconds;
		LOGWARNING("Rate limit: soft-banned IP %s for %d seconds",
		           ip, g_config.softban_duration_seconds);
	}
	pthread_rwlock_unlock(&ip_table_lock);
}

/* ── Per-connection rate limiting ────────────────────────────────── */

void tbg_rate_limit_conn_init(conn_rate_state_t *state)
{
	if (!state)
		return;

	bucket_init(&state->subscribe_bucket,
	            (uint32_t)g_config.max_subscribes_per_minute,
	            (uint32_t)g_config.max_subscribes_per_minute);
	bucket_init(&state->authorize_bucket,
	            (uint32_t)g_config.max_authorizes_per_minute,
	            (uint32_t)g_config.max_authorizes_per_minute);
	bucket_init(&state->submit_bucket,
	            (uint32_t)g_config.max_shares_per_minute,
	            (uint32_t)g_config.max_shares_per_minute);
	bucket_init(&state->invalid_bucket,
	            (uint32_t)g_config.max_invalid_shares_per_minute,
	            (uint32_t)g_config.max_invalid_shares_per_minute);
}

bool tbg_rate_limit_check_conn(conn_rate_state_t *state,
                               rate_limit_type_t type)
{
	rate_bucket_t *b;

	if (!state)
		return false;

	switch (type) {
	case RATE_SUBSCRIBE:
		b = &state->subscribe_bucket;
		break;
	case RATE_AUTHORIZE:
		b = &state->authorize_bucket;
		break;
	case RATE_SUBMIT:
		b = &state->submit_bucket;
		break;
	case RATE_INVALID_SHARE:
		b = &state->invalid_bucket;
		break;
	default:
		return true;
	}

	return bucket_consume(b);
}

int tbg_rate_limit_global_connections(void)
{
	return atomic_load(&g_total_connections);
}
