/*
 * tbg_coinbase_sig.c — Per-user coinbase signature cache backed by Redis
 * THE BITCOIN GAME — GPLv3
 *
 * Maintains an in-memory hash table of user coinbase signatures, refreshed
 * from Redis every 60 seconds via a background thread.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>

#include "tbg_coinbase_sig.h"
#include "uthash.h"

/* Optional hiredis support — compiled in only if available */
#ifdef HAVE_HIREDIS
#include <hiredis/hiredis.h>
#endif

#define SIG_REFRESH_INTERVAL 60  /* seconds between cache refreshes */
#define REDIS_KEY_PREFIX "user_coinbase:"
#define REDIS_KEY_PREFIX_LEN 15

typedef struct sig_entry {
	UT_hash_handle hh;
	char address[128];
	char sig[TBG_MAX_USER_SIG_LEN + 1];
} sig_entry_t;

static sig_entry_t *sig_cache = NULL;
static pthread_rwlock_t sig_lock = PTHREAD_RWLOCK_INITIALIZER;
static pthread_t sig_thread;
static volatile int sig_running = 0;
static char *sig_redis_url = NULL;

bool tbg_validate_sig(const char *sig)
{
	int i, len;

	if (!sig)
		return false;

	len = strlen(sig);
	if (len < 1 || len > TBG_MAX_USER_SIG_LEN)
		return false;

	for (i = 0; i < len; i++) {
		if (!strchr(TBG_SIG_ALLOWED_CHARS, sig[i]))
			return false;
	}

	return true;
}

const char *tbg_get_user_sig(const char *btc_address)
{
	sig_entry_t *entry = NULL;
	const char *result = NULL;

	if (!btc_address)
		return NULL;

	pthread_rwlock_rdlock(&sig_lock);
	HASH_FIND_STR(sig_cache, btc_address, entry);
	if (entry)
		result = entry->sig;
	pthread_rwlock_unlock(&sig_lock);

	return result;
}

static void clear_cache(sig_entry_t **cache)
{
	sig_entry_t *entry, *tmp;

	HASH_ITER(hh, *cache, entry, tmp) {
		HASH_DEL(*cache, entry);
		free(entry);
	}
}

#ifdef HAVE_HIREDIS
static void refresh_from_redis(void)
{
	redisContext *ctx = NULL;
	redisReply *reply = NULL;
	sig_entry_t *new_cache = NULL;
	char *host = NULL;
	int port = 6379;
	int db = 0;

	/* Parse redis URL: redis://host:port/db */
	if (!sig_redis_url)
		return;

	/* Simple URL parsing */
	if (strncmp(sig_redis_url, "redis://", 8) == 0) {
		const char *p = sig_redis_url + 8;
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
		host = strdup(sig_redis_url);
	}

	if (!host)
		return;

	ctx = redisConnect(host, port);
	free(host);

	if (!ctx || ctx->err)
		goto out;

	if (db > 0) {
		reply = redisCommand(ctx, "SELECT %d", db);
		if (reply)
			freeReplyObject(reply);
		reply = NULL;
	}

	/* SCAN for user_coinbase:* keys */
	{
		unsigned long long cursor = 0;
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
				const char *addr = key + REDIS_KEY_PREFIX_LEN;
				redisReply *val_reply;

				val_reply = redisCommand(ctx, "GET %s", key);
				if (val_reply && val_reply->type == REDIS_REPLY_STRING) {
					if (tbg_validate_sig(val_reply->str)) {
						sig_entry_t *entry = calloc(1, sizeof(sig_entry_t));
						if (entry) {
							strncpy(entry->address, addr, sizeof(entry->address) - 1);
							strncpy(entry->sig, val_reply->str, TBG_MAX_USER_SIG_LEN);
							HASH_ADD_STR(new_cache, address, entry);
						}
					}
				}
				if (val_reply)
					freeReplyObject(val_reply);
			}

			freeReplyObject(reply);
			reply = NULL;
		} while (cursor != 0);
	}

	/* Swap the caches under write lock */
	pthread_rwlock_wrlock(&sig_lock);
	clear_cache(&sig_cache);
	sig_cache = new_cache;
	pthread_rwlock_unlock(&sig_lock);
	new_cache = NULL;  /* Ownership transferred */

out:
	if (reply)
		freeReplyObject(reply);
	if (ctx)
		redisFree(ctx);
	if (new_cache)
		clear_cache(&new_cache);
}
#endif /* HAVE_HIREDIS */

static void *sig_refresh_thread(void *arg)
{
	(void)arg;

	while (sig_running) {
#ifdef HAVE_HIREDIS
		refresh_from_redis();
#endif
		/* Sleep in 1-second intervals so we can check sig_running */
		int i;
		for (i = 0; i < SIG_REFRESH_INTERVAL && sig_running; i++)
			sleep(1);
	}

	return NULL;
}

void tbg_sig_cache_init(const char *redis_url)
{
	if (sig_running)
		return;

	if (redis_url)
		sig_redis_url = strdup(redis_url);

	sig_running = 1;

	if (pthread_create(&sig_thread, NULL, sig_refresh_thread, NULL) != 0) {
		sig_running = 0;
	}
}

void tbg_sig_cache_shutdown(void)
{
	if (!sig_running)
		return;

	sig_running = 0;
	pthread_join(sig_thread, NULL);

	pthread_rwlock_wrlock(&sig_lock);
	clear_cache(&sig_cache);
	pthread_rwlock_unlock(&sig_lock);

	free(sig_redis_url);
	sig_redis_url = NULL;
}
