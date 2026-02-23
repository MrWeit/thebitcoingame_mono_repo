/*
 * tbg_coinbase_sig.h — Per-user coinbase signature cache
 * THE BITCOIN GAME — GPLv3
 *
 * Redis-backed cache of per-user coinbase signatures. A background thread
 * refreshes the cache every 60 seconds. The cache is protected by a
 * read-write lock for concurrent access from stratifier threads.
 */

#ifndef TBG_COINBASE_SIG_H
#define TBG_COINBASE_SIG_H

#include <stdbool.h>

/* Maximum length of a user coinbase signature in bytes */
#define TBG_MAX_USER_SIG_LEN 20

/* Allowed characters in a coinbase signature */
#define TBG_SIG_ALLOWED_CHARS "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.:!#/ "

/* Initialize the signature cache and start the background refresh thread.
 * redis_url: Redis connection URL (e.g., "redis://redis:6379/0")
 * Key pattern in Redis: user_coinbase:{btc_address} = "signature string" */
void tbg_sig_cache_init(const char *redis_url);

/* Shut down the cache refresh thread and free all resources */
void tbg_sig_cache_shutdown(void);

/* Look up a user's custom coinbase signature.
 * Returns a pointer to the cached signature string, or NULL if not found.
 * The returned pointer is valid until the next cache refresh (~60s).
 * Thread-safe (uses read lock). */
const char *tbg_get_user_sig(const char *btc_address);

/* Validate a coinbase signature string.
 * Returns true if:
 *   - sig is not NULL
 *   - length is 1..TBG_MAX_USER_SIG_LEN
 *   - all characters are in TBG_SIG_ALLOWED_CHARS
 * Returns false otherwise. */
bool tbg_validate_sig(const char *sig);

#endif /* TBG_COINBASE_SIG_H */
