/*
 * tbg_metrics.h — Prometheus metrics for ckpool
 * THE BITCOIN GAME — GPLv3
 *
 * Thread-safe atomic counters exposed via HTTP on a configurable port
 * in Prometheus exposition text format.
 */

#ifndef TBG_METRICS_H
#define TBG_METRICS_H

#include <stdatomic.h>
#include <stdint.h>
#include <time.h>

typedef struct ckpool_metrics {
	_Atomic uint64_t shares_valid;
	_Atomic uint64_t shares_invalid;
	_Atomic uint64_t shares_stale;
	_Atomic uint64_t blocks_found;
	_Atomic int64_t  connected_miners;
	_Atomic int64_t  bitcoin_height;
	_Atomic int32_t  bitcoin_connected;
	_Atomic uint64_t asicboost_miners;
	_Atomic uint64_t total_diff_accepted;
	time_t start_time;
} ckpool_metrics_t;

extern ckpool_metrics_t g_metrics;

/* Start the metrics HTTP server on the given port (default 9100) */
void tbg_metrics_init(int port);

/* Gracefully shut down the metrics server */
void tbg_metrics_shutdown(void);

/* Format all metrics into a buffer in Prometheus exposition format.
 * Returns the number of bytes written, or 0 on failure. */
int tbg_format_metrics(char *buf, int buflen);

/* Convenience macros for thread-safe metric updates */
#define METRIC_INC(field) atomic_fetch_add(&g_metrics.field, 1)
#define METRIC_DEC(field) atomic_fetch_sub(&g_metrics.field, 1)
#define METRIC_SET(field, val) atomic_store(&g_metrics.field, (val))
#define METRIC_ADD(field, val) atomic_fetch_add(&g_metrics.field, (val))
#define METRIC_GET(field) atomic_load(&g_metrics.field)

#endif /* TBG_METRICS_H */
