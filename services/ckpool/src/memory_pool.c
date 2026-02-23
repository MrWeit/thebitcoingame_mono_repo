/*
 * memory_pool.c — Slab-based pool allocator for hot-path allocations
 * THE BITCOIN GAME — GPLv3
 *
 * Pre-allocates cache-line aligned memory slabs and manages them via
 * an intrusive free list. The first sizeof(void*) bytes of each free
 * item are used as a next pointer.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include "memory_pool.h"
#include "libckpool.h"

/* Round up to cache-line alignment */
static size_t align_up(size_t size, size_t alignment)
{
	return (size + alignment - 1) & ~(alignment - 1);
}

/* Allocate a new slab of items and add them to the free list */
static bool pool_grow(memory_pool_t *pool, int count)
{
	void *slab;
	char *ptr;
	int i;

	if (pool->total_allocated + count > pool->max_items) {
		count = pool->max_items - pool->total_allocated;
		if (count <= 0)
			return false;
	}

	/* Allocate the slab as a contiguous block */
	slab = aligned_alloc(POOL_CACHE_LINE_SIZE,
	                     (size_t)count * pool->aligned_size);
	if (!slab)
		return false;

	/* Track the slab pointer for cleanup */
	if (pool->slab_count >= pool->slabs_capacity) {
		int new_cap = pool->slabs_capacity * 2;
		void **new_slabs;

		if (new_cap == 0)
			new_cap = 16;

		new_slabs = realloc(pool->slabs,
		                     (size_t)new_cap * sizeof(void *));
		if (!new_slabs) {
			free(slab);
			return false;
		}
		pool->slabs = new_slabs;
		pool->slabs_capacity = new_cap;
	}
	pool->slabs[pool->slab_count++] = slab;

	/* Add all items in this slab to the free list */
	ptr = (char *)slab;
	for (i = 0; i < count; i++) {
		void *item = ptr + (size_t)i * pool->aligned_size;
		/* Intrusive free list: store next pointer at item start */
		*(void **)item = pool->free_list;
		pool->free_list = item;
	}

	pool->total_allocated += count;
	pool->total_free += count;

	return true;
}

void tbg_pool_init(memory_pool_t *pool, size_t item_size,
                   int initial_count, int max_items, const char *name)
{
	memset(pool, 0, sizeof(*pool));

	/* Ensure item is large enough to hold a next pointer */
	if (item_size < sizeof(void *))
		item_size = sizeof(void *);

	pool->item_size = item_size;
	pool->aligned_size = align_up(item_size, POOL_CACHE_LINE_SIZE);
	pool->max_items = max_items > 0 ? max_items : POOL_MAX_ITEMS;
	pool->name = name ? name : "unnamed";

	pthread_mutex_init(&pool->lock, NULL);

	/* Pre-allocate initial slabs */
	if (initial_count > 0) {
		pool_grow(pool, initial_count);
	}

	LOGNOTICE("Memory pool '%s': initialized (item=%zu, aligned=%zu, "
	          "initial=%d, max=%d)",
	          pool->name, pool->item_size, pool->aligned_size,
	          initial_count, pool->max_items);
}

void *tbg_pool_alloc(memory_pool_t *pool)
{
	void *item = NULL;

	if (!pool)
		return NULL;

	pthread_mutex_lock(&pool->lock);

	if (pool->free_list) {
		/* Fast path: pop from free list */
		item = pool->free_list;
		pool->free_list = *(void **)item;
		pool->total_free--;
	} else {
		/* Slow path: grow the pool */
		int grow_count = pool->total_allocated > 0
		                 ? pool->total_allocated / 2 : POOL_INITIAL_SLABS;
		if (grow_count < 64)
			grow_count = 64;
		if (grow_count > 4096)
			grow_count = 4096;

		if (pool_grow(pool, grow_count)) {
			item = pool->free_list;
			pool->free_list = *(void **)item;
			pool->total_free--;
		}
	}

	pthread_mutex_unlock(&pool->lock);

	/* Last resort: direct allocation */
	if (!item)
		item = aligned_alloc(POOL_CACHE_LINE_SIZE, pool->aligned_size);

	return item;
}

void tbg_pool_free(memory_pool_t *pool, void *item)
{
	if (!pool || !item)
		return;

	pthread_mutex_lock(&pool->lock);

	/* Push onto free list */
	*(void **)item = pool->free_list;
	pool->free_list = item;
	pool->total_free++;

	pthread_mutex_unlock(&pool->lock);
}

void tbg_pool_destroy(memory_pool_t *pool)
{
	int i;

	if (!pool)
		return;

	pthread_mutex_lock(&pool->lock);

	/* Free all slabs */
	for (i = 0; i < pool->slab_count; i++)
		free(pool->slabs[i]);

	free(pool->slabs);
	pool->slabs = NULL;
	pool->slab_count = 0;
	pool->slabs_capacity = 0;
	pool->free_list = NULL;
	pool->total_free = 0;
	pool->total_allocated = 0;

	pthread_mutex_unlock(&pool->lock);
	pthread_mutex_destroy(&pool->lock);
}

int tbg_pool_total_allocated(const memory_pool_t *pool)
{
	return pool ? pool->total_allocated : 0;
}

int tbg_pool_total_free(const memory_pool_t *pool)
{
	return pool ? pool->total_free : 0;
}

int tbg_pool_in_use(const memory_pool_t *pool)
{
	return pool ? pool->total_allocated - pool->total_free : 0;
}
