/*
 * event_ring.c — Lock-free ring buffer for event emission
 * THE BITCOIN GAME — GPLv3
 *
 * The hot path (push) is lock-free and performs no syscalls.
 * A background flush thread drains the ring using writev() for
 * batched sends, targeting <1ms latency from share validation
 * to event appearing on the Unix domain socket.
 */

#include "config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/uio.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <errno.h>

#include "event_ring.h"
#include "libckpool.h"

/* ── Flush thread state ──────────────────────────────────────────── */

static volatile int flusher_running = 0;
static pthread_t flusher_thread;
static int flusher_socket_fd = -1;

/* ── Ring buffer operations ──────────────────────────────────────── */

void tbg_event_ring_init(event_ring_t *ring)
{
	size_t i;

	memset(ring, 0, sizeof(*ring));
	atomic_store(&ring->write_pos, 0);
	atomic_store(&ring->read_pos, 0);
	atomic_store(&ring->events_queued, 0);
	atomic_store(&ring->events_sent, 0);
	atomic_store(&ring->events_dropped, 0);
	atomic_store(&ring->batch_count, 0);

	for (i = 0; i < EVENT_RING_SIZE; i++)
		atomic_store(&ring->slots[i].state, SLOT_EMPTY);
}

bool tbg_event_ring_push(event_ring_t *ring, const char *json, size_t len)
{
	uint64_t pos;
	uint64_t idx;
	event_slot_t *slot;
	uint8_t expected;

	if (!ring || !json || len == 0)
		return false;

	if (len >= EVENT_MAX_SIZE)
		len = EVENT_MAX_SIZE - 1;

	/* Claim a write position atomically */
	pos = atomic_fetch_add(&ring->write_pos, 1);
	idx = pos & EVENT_RING_MASK;
	slot = &ring->slots[idx];

	/* Check if the slot is available */
	expected = SLOT_EMPTY;
	if (!atomic_compare_exchange_strong(&slot->state, &expected,
	                                     SLOT_WRITING)) {
		/* Slot still occupied (ring full, consumer too slow) */
		atomic_fetch_add(&ring->events_dropped, 1);
		return false;
	}

	/* Write the event data */
	memcpy(slot->data, json, len);
	slot->data[len] = '\0';
	slot->len = (uint16_t)len;

	/* Mark slot as ready for reading */
	atomic_store(&slot->state, SLOT_READY);
	atomic_fetch_add(&ring->events_queued, 1);

	return true;
}

/* ── Flush thread ────────────────────────────────────────────────── */

static void flush_batch(event_ring_t *ring, int sock_fd)
{
	struct iovec iov[EVENT_BATCH_MAX];
	uint64_t read_pos;
	int count = 0;
	uint64_t positions[EVENT_BATCH_MAX];
	int i;

	read_pos = atomic_load(&ring->read_pos);

	/* Collect ready slots into iovec batch */
	while (count < EVENT_BATCH_MAX) {
		uint64_t idx = (read_pos + (uint64_t)count) & EVENT_RING_MASK;
		event_slot_t *slot = &ring->slots[idx];

		if (atomic_load(&slot->state) != SLOT_READY)
			break;

		iov[count].iov_base = slot->data;
		iov[count].iov_len = slot->len;
		positions[count] = idx;
		count++;
	}

	if (count == 0)
		return;

	/*
	 * For Unix DGRAM sockets, we need to send each event as a
	 * separate datagram. writev() on a DGRAM socket sends all iovecs
	 * as a single datagram, which is not what we want.
	 * Instead, send each event individually with MSG_DONTWAIT.
	 */
	for (i = 0; i < count; i++) {
		ssize_t ret = send(sock_fd, iov[i].iov_base, iov[i].iov_len,
		                   MSG_DONTWAIT | MSG_NOSIGNAL);
		if (ret < 0 && errno != EAGAIN && errno != EWOULDBLOCK &&
		    errno != ECONNREFUSED && errno != ENOENT) {
			/* Unexpected error — log once, don't spam */
			if (i == 0)
				LOGINFO("Event ring: send error: %s",
				        strerror(errno));
		}

		/* Mark slot as empty regardless of send result */
		atomic_store(&ring->slots[positions[i]].state, SLOT_EMPTY);
	}

	/* Advance read position */
	atomic_fetch_add(&ring->read_pos, (uint64_t)count);
	atomic_fetch_add(&ring->events_sent, (uint64_t)count);
	atomic_fetch_add(&ring->batch_count, 1);
}

static void *flusher_thread_func(void *arg)
{
	event_ring_t *ring = (event_ring_t *)arg;

	while (flusher_running) {
		flush_batch(ring, flusher_socket_fd);

		/* Sleep briefly if no events were pending */
		if (atomic_load(&ring->write_pos) ==
		    atomic_load(&ring->read_pos))
			usleep(EVENT_FLUSH_INTERVAL_US);
	}

	/* Final drain on shutdown */
	flush_batch(ring, flusher_socket_fd);

	return NULL;
}

void tbg_event_ring_start_flusher(event_ring_t *ring, int socket_fd)
{
	if (flusher_running || socket_fd < 0)
		return;

	flusher_socket_fd = socket_fd;
	flusher_running = 1;

	if (pthread_create(&flusher_thread, NULL, flusher_thread_func,
	                    ring) != 0) {
		LOGWARNING("Failed to start event ring flusher thread");
		flusher_running = 0;
	} else {
		LOGNOTICE("Event ring flusher started (ring size: %d, "
		          "batch max: %d)", EVENT_RING_SIZE, EVENT_BATCH_MAX);
	}
}

void tbg_event_ring_stop_flusher(event_ring_t *ring)
{
	(void)ring;

	if (!flusher_running)
		return;

	flusher_running = 0;
	pthread_join(flusher_thread, NULL);
	flusher_socket_fd = -1;
}

/* ── Statistics ──────────────────────────────────────────────────── */

uint64_t tbg_event_ring_queued(const event_ring_t *ring)
{
	return atomic_load(&ring->events_queued);
}

uint64_t tbg_event_ring_sent(const event_ring_t *ring)
{
	return atomic_load(&ring->events_sent);
}

uint64_t tbg_event_ring_dropped(const event_ring_t *ring)
{
	return atomic_load(&ring->events_dropped);
}
