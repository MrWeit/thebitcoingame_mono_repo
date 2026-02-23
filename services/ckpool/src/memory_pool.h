/*
 * memory_pool.h — Slab-based pool allocator for hot-path allocations
 * THE BITCOIN GAME — GPLv3
 *
 * Pre-allocates cache-line aligned slabs for share structs and event
 * buffers, providing O(1) allocation and deallocation without syscalls
 * on the hot path. Falls back to aligned_alloc when the pool is exhausted.
 *
 * Target: <300MB total memory at 100k connections (down from ~600MB).
 */

#ifndef TBG_MEMORY_POOL_H
#define TBG_MEMORY_POOL_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include <pthread.h>

/* Cache line size for alignment */
#define POOL_CACHE_LINE_SIZE  64

/* Default initial slab count */
#define POOL_INITIAL_SLABS    256

/* Maximum items per pool before refusing to grow */
#define POOL_MAX_ITEMS        1000000

typedef struct memory_pool {
	void **free_list;           /* Intrusive free list (items point to next) */
	size_t item_size;           /* Size of each allocated item */
	size_t aligned_size;        /* item_size rounded up to cache line */
	int total_allocated;        /* Total items ever allocated */
	int total_free;             /* Items currently in the free list */
	int max_items;              /* Maximum pool growth limit */
	int slab_count;             /* Number of slabs allocated */
	void **slabs;               /* Array of slab base pointers for cleanup */
	int slabs_capacity;         /* Capacity of slabs array */
	pthread_mutex_t lock;       /* Protects free list and counters */
	const char *name;           /* Pool name for logging */
} memory_pool_t;

/*
 * Initialize a memory pool.
 *
 * item_size: Size of each item to allocate.
 * initial_count: Number of items to pre-allocate.
 * max_items: Maximum items the pool can ever hold (0 = POOL_MAX_ITEMS).
 * name: Human-readable name for logging (e.g., "share_pool").
 */
void tbg_pool_init(memory_pool_t *pool, size_t item_size,
                   int initial_count, int max_items, const char *name);

/*
 * Allocate an item from the pool.
 * O(1) from free list, falls back to aligned_alloc if free list is empty.
 * Returns NULL only on total memory exhaustion.
 *
 * The returned memory is NOT zeroed. Caller must initialize all fields.
 */
void *tbg_pool_alloc(memory_pool_t *pool);

/*
 * Return an item to the pool's free list.
 * O(1), always succeeds.
 */
void tbg_pool_free(memory_pool_t *pool, void *item);

/*
 * Destroy a memory pool and free all slabs.
 * All items must have been returned before calling this,
 * or they will be leaked.
 */
void tbg_pool_destroy(memory_pool_t *pool);

/*
 * Get pool statistics.
 */
int tbg_pool_total_allocated(const memory_pool_t *pool);
int tbg_pool_total_free(const memory_pool_t *pool);
int tbg_pool_in_use(const memory_pool_t *pool);

#endif /* TBG_MEMORY_POOL_H */
