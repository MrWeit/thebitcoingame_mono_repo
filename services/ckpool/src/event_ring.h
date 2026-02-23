/*
 * event_ring.h — Lock-free ring buffer for event emission
 * THE BITCOIN GAME — GPLv3
 *
 * Replaces per-event sendto() with a lock-free SPMC ring buffer.
 * The hot path (emit_event_fast) performs an atomic write with zero
 * syscalls. A background thread drains the ring buffer using writev()
 * for batched sends to the Unix socket.
 *
 * Target: <1ms from share validation to event appearing on Unix socket.
 */

#ifndef TBG_EVENT_RING_H
#define TBG_EVENT_RING_H

#include <stdatomic.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

/* Ring buffer size MUST be a power of 2 for masking */
#define EVENT_RING_SIZE       4096
#define EVENT_RING_MASK       (EVENT_RING_SIZE - 1)

/* Maximum size of a single serialized event (JSON string) */
#define EVENT_MAX_SIZE        4096

/* Maximum events per writev() batch call */
#define EVENT_BATCH_MAX       64

/* Polling interval for the flush thread (microseconds) */
#define EVENT_FLUSH_INTERVAL_US  100   /* 0.1ms */

/* Ring buffer slot states */
#define SLOT_EMPTY   0
#define SLOT_WRITING 1
#define SLOT_READY   2

typedef struct event_slot {
	_Atomic uint8_t state;
	uint16_t len;
	char data[EVENT_MAX_SIZE];
} event_slot_t;

typedef struct event_ring {
	event_slot_t slots[EVENT_RING_SIZE];
	_Atomic uint64_t write_pos;   /* Next write position (monotonic) */
	_Atomic uint64_t read_pos;    /* Next read position (monotonic) */
	_Atomic uint64_t events_queued;
	_Atomic uint64_t events_sent;
	_Atomic uint64_t events_dropped;  /* Ring full drops */
	_Atomic uint64_t batch_count;     /* Number of writev calls */
} event_ring_t;

/*
 * Initialize the event ring buffer.
 * Must be called once at startup before any events are emitted.
 */
void tbg_event_ring_init(event_ring_t *ring);

/*
 * Enqueue an event into the ring buffer (hot path).
 * This is lock-free and performs no syscalls. Returns true if the
 * event was queued, false if the ring buffer is full (event dropped).
 */
bool tbg_event_ring_push(event_ring_t *ring, const char *json, size_t len);

/*
 * Start the background flush thread.
 * The thread drains the ring buffer to the given socket fd using
 * writev() for batched sends.
 */
void tbg_event_ring_start_flusher(event_ring_t *ring, int socket_fd);

/*
 * Stop the background flush thread and drain remaining events.
 */
void tbg_event_ring_stop_flusher(event_ring_t *ring);

/*
 * Get ring buffer statistics.
 */
uint64_t tbg_event_ring_queued(const event_ring_t *ring);
uint64_t tbg_event_ring_sent(const event_ring_t *ring);
uint64_t tbg_event_ring_dropped(const event_ring_t *ring);

#endif /* TBG_EVENT_RING_H */
