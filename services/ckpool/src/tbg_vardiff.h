/*
 * tbg_vardiff.h — Enhanced VarDiff with reconnect memory
 * THE BITCOIN GAME — GPLv3
 *
 * Provides reconnect difficulty memory via Redis so miners that
 * disconnect and reconnect get their previous difficulty restored
 * instead of starting from scratch.
 */

#ifndef TBG_VARDIFF_H
#define TBG_VARDIFF_H

#include <stdint.h>

/* Initialize the VarDiff reconnect memory system.
 * redis_url: Redis connection URL for persistence */
void tbg_vardiff_init(const char *redis_url);

/* Shut down and free resources */
void tbg_vardiff_shutdown(void);

/* Get the remembered difficulty for a worker.
 * Returns the last known difficulty, or 0 if not found.
 * Thread-safe (uses read lock). */
int64_t tbg_get_reconnect_diff(const char *worker_name);

/* Save a worker's current difficulty for reconnect memory.
 * Thread-safe (uses write lock). */
void tbg_save_reconnect_diff(const char *worker_name, int64_t diff);

#endif /* TBG_VARDIFF_H */
