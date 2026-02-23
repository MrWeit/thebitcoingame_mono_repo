/*
 * tbg_vardiff.c — Enhanced VarDiff reconnect memory via Redis
 * THE BITCOIN GAME — GPLv3
 *
 * Maintains an in-memory hash table of worker→difficulty mappings.
 * A background thread periodically persists entries to Redis and
 * loads them on startup for cross-restart memory.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>
#include <time.h>

#include "tbg_vardiff.h"
#include "uthash.h"

#ifdef HAVE_HIREDIS
#include <hiredis/hiredis.h>
#endif

#define PERSIST_INTERVAL 30      /* seconds between Redis persist cycles */
#define REDIS_KEY_PREFIX "vardiff:"
#define REDIS_KEY_PREFIX_LEN 8
#define MAX_WORKER_LEN 256

typedef struct diff_entry {
	UT_hash_handle hh;
	char worker[MAX_WORKER_LEN];
	int64_t diff;
	time_t last_seen;
} diff_entry_t;

static diff_entry_t *diff_cache = NULL;
static pthread_rwlock_t diff_lock = PTHREAD_RWLOCK_INITIALIZER;
static pthread_t persist_thread;
static volatile int vd_running = 0;
static char *vd_redis_url = NULL;
static int vd_ttl = 86400;  /* Default 24h TTL */

int64_t tbg_get_reconnect_diff(const char *worker_name)
{
	diff_entry_t *entry = NULL;
	int64_t result = 0;

	if (!worker_name)
		return 0;

	pthread_rwlock_rdlock(&diff_lock);
	HASH_FIND_STR(diff_cache, worker_name, entry);
	if (entry)
		result = entry->diff;
	pthread_rwlock_unlock(&diff_lock);

	return result;
}

void tbg_save_reconnect_diff(const char *worker_name, int64_t diff)
{
	diff_entry_t *entry = NULL;

	if (!worker_name || diff <= 0)
		return;

	pthread_rwlock_wrlock(&diff_lock);
	HASH_FIND_STR(diff_cache, worker_name, entry);
	if (entry) {
		entry->diff = diff;
		entry->last_seen = time(NULL);
	} else {
		entry = calloc(1, sizeof(diff_entry_t));
		if (entry) {
			strncpy(entry->worker, worker_name, MAX_WORKER_LEN - 1);
			entry->diff = diff;
			entry->last_seen = time(NULL);
			HASH_ADD_STR(diff_cache, worker, entry);
		}
	}
	pthread_rwlock_unlock(&diff_lock);
}

#ifdef HAVE_HIREDIS
static redisContext *connect_redis(void)
{
	redisContext *ctx = NULL;
	char *host = NULL;
	int port = 6379;
	int db = 0;

	if (!vd_redis_url)
		return NULL;

	if (strncmp(vd_redis_url, "redis://", 8) == 0) {
		const char *p = vd_redis_url + 8;
		char *colon = strchr(p, ':');
		char *slash = strchr(p, '/');

		if (colon && (!slash || colon < slash)) {
			host = strndup(p, colon - p);
			port = atoi(colon + 1);
		} else if (slash) {
			host = strndup(p, slash - p);
		} else {
			host = strdup(p);
		}

		if (slash)
			db = atoi(slash + 1);
	} else {
		host = strdup(vd_redis_url);
	}

	if (!host)
		return NULL;

	ctx = redisConnect(host, port);
	free(host);

	if (!ctx || ctx->err) {
		if (ctx)
			redisFree(ctx);
		return NULL;
	}

	if (db > 0) {
		redisReply *reply = redisCommand(ctx, "SELECT %d", db);
		if (reply)
			freeReplyObject(reply);
	}

	return ctx;
}

static void persist_to_redis(void)
{
	redisContext *ctx;
	diff_entry_t *entry, *tmp;
	time_t now = time(NULL);

	ctx = connect_redis();
	if (!ctx)
		return;

	pthread_rwlock_rdlock(&diff_lock);
	HASH_ITER(hh, diff_cache, entry, tmp) {
		/* Only persist entries seen within TTL */
		if (now - entry->last_seen < vd_ttl) {
			redisCommand(ctx, "SETEX %s%s %d %lld",
				     REDIS_KEY_PREFIX, entry->worker,
				     vd_ttl, (long long)entry->diff);
		}
	}
	pthread_rwlock_unlock(&diff_lock);

	redisFree(ctx);
}

static void load_from_redis(void)
{
	redisContext *ctx;
	redisReply *reply = NULL;
	unsigned long long cursor = 0;

	ctx = connect_redis();
	if (!ctx)
		return;

	do {
		reply = redisCommand(ctx, "SCAN %llu MATCH %s* COUNT 100",
				     cursor, REDIS_KEY_PREFIX);
		if (!reply || reply->type != REDIS_REPLY_ARRAY || reply->elements != 2)
			break;

		cursor = strtoull(reply->element[0]->str, NULL, 10);

		redisReply *keys = reply->element[1];
		unsigned int i;
		for (i = 0; i < keys->elements; i++) {
			const char *key = keys->element[i]->str;
			const char *worker = key + REDIS_KEY_PREFIX_LEN;
			redisReply *val_reply;

			val_reply = redisCommand(ctx, "GET %s", key);
			if (val_reply && val_reply->type == REDIS_REPLY_STRING) {
				int64_t diff = strtoll(val_reply->str, NULL, 10);
				if (diff > 0)
					tbg_save_reconnect_diff(worker, diff);
			}
			if (val_reply)
				freeReplyObject(val_reply);
		}

		freeReplyObject(reply);
		reply = NULL;
	} while (cursor != 0);

	if (reply)
		freeReplyObject(reply);
	redisFree(ctx);
}
#endif /* HAVE_HIREDIS */

static void *vardiff_persist_thread(void *arg)
{
	(void)arg;

#ifdef HAVE_HIREDIS
	/* Load initial data from Redis */
	load_from_redis();
#endif

	while (vd_running) {
#ifdef HAVE_HIREDIS
		persist_to_redis();
#endif
		/* Sleep in 1-second intervals to check vd_running */
		int i;
		for (i = 0; i < PERSIST_INTERVAL && vd_running; i++)
			sleep(1);
	}

	/* Final persist before shutdown */
#ifdef HAVE_HIREDIS
	persist_to_redis();
#endif

	return NULL;
}

/* Evict stale entries from the in-memory cache */
static void evict_stale(void)
{
	diff_entry_t *entry, *tmp;
	time_t now = time(NULL);

	pthread_rwlock_wrlock(&diff_lock);
	HASH_ITER(hh, diff_cache, entry, tmp) {
		if (now - entry->last_seen > vd_ttl) {
			HASH_DEL(diff_cache, entry);
			free(entry);
		}
	}
	pthread_rwlock_unlock(&diff_lock);
}

void tbg_vardiff_init(const char *redis_url)
{
	if (vd_running)
		return;

	if (redis_url)
		vd_redis_url = strdup(redis_url);

	vd_running = 1;

	if (pthread_create(&persist_thread, NULL, vardiff_persist_thread, NULL) != 0) {
		vd_running = 0;
	}
}

void tbg_vardiff_shutdown(void)
{
	diff_entry_t *entry, *tmp;

	if (!vd_running)
		return;

	vd_running = 0;
	pthread_join(persist_thread, NULL);

	pthread_rwlock_wrlock(&diff_lock);
	HASH_ITER(hh, diff_cache, entry, tmp) {
		HASH_DEL(diff_cache, entry);
		free(entry);
	}
	pthread_rwlock_unlock(&diff_lock);

	free(vd_redis_url);
	vd_redis_url = NULL;
}
