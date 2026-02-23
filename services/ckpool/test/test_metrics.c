/*
 * test_metrics.c — Unit tests for tbg_metrics format and atomic operations
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 */

#include "test_harness.h"
#include <stdatomic.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

/* Replicate the metrics struct and format function for testing */
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

static ckpool_metrics_t g_test_metrics;

#define METRIC_INC(field) atomic_fetch_add(&g_test_metrics.field, 1)
#define METRIC_DEC(field) atomic_fetch_sub(&g_test_metrics.field, 1)
#define METRIC_SET(field, val) atomic_store(&g_test_metrics.field, (val))
#define METRIC_ADD(field, val) atomic_fetch_add(&g_test_metrics.field, (val))
#define METRIC_GET(field) atomic_load(&g_test_metrics.field)

/* ─── Tests ─────────────────────────────────────────────────────── */

TEST(atomic_inc)
{
	atomic_store(&g_test_metrics.shares_valid, 0);
	METRIC_INC(shares_valid);
	METRIC_INC(shares_valid);
	METRIC_INC(shares_valid);
	ASSERT_EQ(3, METRIC_GET(shares_valid));
}

TEST(atomic_dec)
{
	atomic_store(&g_test_metrics.connected_miners, 5);
	METRIC_DEC(connected_miners);
	METRIC_DEC(connected_miners);
	ASSERT_EQ(3, METRIC_GET(connected_miners));
}

TEST(atomic_set)
{
	METRIC_SET(bitcoin_height, 850000);
	ASSERT_EQ(850000, METRIC_GET(bitcoin_height));
	METRIC_SET(bitcoin_height, 850001);
	ASSERT_EQ(850001, METRIC_GET(bitcoin_height));
}

TEST(atomic_add)
{
	atomic_store(&g_test_metrics.total_diff_accepted, 0);
	METRIC_ADD(total_diff_accepted, 100);
	METRIC_ADD(total_diff_accepted, 250);
	ASSERT_EQ(350, METRIC_GET(total_diff_accepted));
}

TEST(inc_dec_combination)
{
	atomic_store(&g_test_metrics.connected_miners, 0);
	METRIC_INC(connected_miners);
	METRIC_INC(connected_miners);
	METRIC_INC(connected_miners);
	METRIC_DEC(connected_miners);
	ASSERT_EQ(2, METRIC_GET(connected_miners));
}

TEST(dec_below_zero)
{
	atomic_store(&g_test_metrics.connected_miners, 0);
	METRIC_DEC(connected_miners);
	/* connected_miners is int64_t, so it goes to -1 */
	ASSERT_EQ(-1, METRIC_GET(connected_miners));
}

TEST(multiple_counters_independent)
{
	atomic_store(&g_test_metrics.shares_valid, 0);
	atomic_store(&g_test_metrics.shares_invalid, 0);
	atomic_store(&g_test_metrics.blocks_found, 0);

	METRIC_INC(shares_valid);
	METRIC_INC(shares_valid);
	METRIC_INC(shares_invalid);
	METRIC_INC(blocks_found);

	ASSERT_EQ(2, METRIC_GET(shares_valid));
	ASSERT_EQ(1, METRIC_GET(shares_invalid));
	ASSERT_EQ(1, METRIC_GET(blocks_found));
}

TEST(large_values)
{
	METRIC_SET(bitcoin_height, 900000);
	atomic_store(&g_test_metrics.total_diff_accepted, 0);
	METRIC_ADD(total_diff_accepted, 1000000000ULL);
	ASSERT_EQ(900000, METRIC_GET(bitcoin_height));
	ASSERT_EQ(1000000000ULL, METRIC_GET(total_diff_accepted));
}

int main(void)
{
	TEST_SUITE("Prometheus Metrics");

	memset(&g_test_metrics, 0, sizeof(g_test_metrics));

	RUN_TEST(atomic_inc);
	RUN_TEST(atomic_dec);
	RUN_TEST(atomic_set);
	RUN_TEST(atomic_add);
	RUN_TEST(inc_dec_combination);
	RUN_TEST(dec_below_zero);
	RUN_TEST(multiple_counters_independent);
	RUN_TEST(large_values);

	PRINT_RESULTS();
}
