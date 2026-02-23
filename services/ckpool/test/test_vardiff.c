/*
 * test_vardiff.c — Unit tests for Enhanced VarDiff EMA calculations
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 */

#include "test_harness.h"
#include <math.h>

/* ─── Re-implement EMA VarDiff logic for unit testing ───────────── */

typedef struct {
	double ema_share_rate;
	double current_diff;
	int adjustment_count;
	int stable_intervals;
	/* Config */
	double ema_alpha;
	int target_interval;
	double dead_band_low;
	double dead_band_high;
	double dampening;
	double fast_ramp_threshold;
	int fast_ramp_max_jump;
	double mindiff;
	double maxdiff;
} vardiff_state_t;

static void init_state(vardiff_state_t *s)
{
	s->ema_share_rate = 0.0;
	s->current_diff = 1.0;
	s->adjustment_count = 0;
	s->stable_intervals = 0;
	s->ema_alpha = 0.3;
	s->target_interval = 10;
	s->dead_band_low = 0.8;
	s->dead_band_high = 1.2;
	s->dampening = 0.5;
	s->fast_ramp_threshold = 4.0;
	s->fast_ramp_max_jump = 64;
	s->mindiff = 0.001;
	s->maxdiff = 1000000.0;
}

/* Returns new difficulty, or 0 if no change needed */
static double vardiff_calc(vardiff_state_t *s, double measured_rate)
{
	double target_rate, ratio, new_diff, jump;

	/* Update EMA */
	if (s->ema_share_rate <= 0)
		s->ema_share_rate = measured_rate;
	else
		s->ema_share_rate = s->ema_alpha * measured_rate +
				    (1.0 - s->ema_alpha) * s->ema_share_rate;

	target_rate = 1.0 / s->target_interval;
	if (target_rate <= 0) return 0;

	ratio = s->ema_share_rate / target_rate;

	/* Dead band */
	if (ratio >= s->dead_band_low && ratio <= s->dead_band_high) {
		s->stable_intervals++;
		return 0;
	}

	s->stable_intervals = 0;

	/* Fast ramp-up for new miners */
	if (s->adjustment_count < 3 && ratio > s->fast_ramp_threshold) {
		jump = ratio;
		if (jump > s->fast_ramp_max_jump) jump = s->fast_ramp_max_jump;
		new_diff = s->current_diff * jump;
	} else {
		/* Dampened adjustment */
		new_diff = s->current_diff * (1.0 + (ratio - 1.0) * s->dampening);
	}

	/* Clamp */
	if (new_diff < s->mindiff) new_diff = s->mindiff;
	if (new_diff > s->maxdiff) new_diff = s->maxdiff;

	s->adjustment_count++;
	s->current_diff = new_diff;
	return new_diff;
}

/* ─── Tests ─────────────────────────────────────────────────────── */

TEST(ema_first_measurement)
{
	vardiff_state_t s;
	init_state(&s);
	vardiff_calc(&s, 0.5);
	ASSERT_NEAR(0.5, s.ema_share_rate, 0.001);
}

TEST(ema_smoothing)
{
	vardiff_state_t s;
	init_state(&s);

	vardiff_calc(&s, 1.0); /* ema = 1.0 (first) */
	ASSERT_NEAR(1.0, s.ema_share_rate, 0.001);

	vardiff_calc(&s, 2.0); /* ema = 0.3*2.0 + 0.7*1.0 = 1.3 */
	ASSERT_NEAR(1.3, s.ema_share_rate, 0.001);

	vardiff_calc(&s, 2.0); /* ema = 0.3*2.0 + 0.7*1.3 = 1.51 */
	ASSERT_NEAR(1.51, s.ema_share_rate, 0.01);
}

TEST(dead_band_no_change)
{
	vardiff_state_t s;
	double result;
	init_state(&s);

	/* Target rate = 1/10 = 0.1 shares/sec */
	/* Measured rate 0.1 → ratio = 1.0 → within dead band [0.8, 1.2] */
	result = vardiff_calc(&s, 0.1);
	ASSERT_NEAR(0, result, 0.001);
	ASSERT_EQ(1, s.stable_intervals);
}

TEST(dead_band_boundary)
{
	vardiff_state_t s;
	double result;
	init_state(&s);

	/* Measured rate 0.085 → ratio = 0.85 → safely inside dead band [0.8, 1.2] */
	result = vardiff_calc(&s, 0.085);
	ASSERT_NEAR(0, result, 0.001);
}

TEST(dampened_increase)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.adjustment_count = 5; /* Not in fast ramp-up */

	/* Measured rate 0.2 → ratio = 2.0 → outside dead band */
	/* new_diff = 1.0 * (1 + (2.0 - 1.0) * 0.5) = 1.5 */
	result = vardiff_calc(&s, 0.2);
	ASSERT_NEAR(1.5, result, 0.01);
}

TEST(dampened_decrease)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.current_diff = 10.0;
	s.adjustment_count = 5;

	/* Measured rate 0.01 → ratio = 0.1 → below dead band */
	/* new_diff = 10.0 * (1 + (0.1 - 1.0) * 0.5) = 10.0 * 0.55 = 5.5 */
	result = vardiff_calc(&s, 0.01);
	ASSERT_NEAR(5.5, result, 0.1);
}

TEST(fast_ramp_up)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.adjustment_count = 0; /* In fast ramp-up phase */

	/* Measured rate 0.5 → ratio = 5.0 → exceeds fast_ramp_threshold (4.0) */
	/* jump = min(5.0, 64) = 5.0, new_diff = 1.0 * 5.0 = 5.0 */
	result = vardiff_calc(&s, 0.5);
	ASSERT_NEAR(5.0, result, 0.1);
}

TEST(fast_ramp_capped)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.adjustment_count = 0;
	s.fast_ramp_max_jump = 8;

	/* Measured rate 10.0 → ratio = 100.0 → jump capped at max_jump (8) */
	result = vardiff_calc(&s, 10.0);
	ASSERT_NEAR(8.0, result, 0.1);
}

TEST(fast_ramp_only_first_3)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.adjustment_count = 3; /* No longer in fast ramp-up */

	/* Same high rate but uses dampened instead of fast ramp */
	result = vardiff_calc(&s, 0.5);
	/* ratio = 5.0, dampened: 1.0 * (1 + 4.0 * 0.5) = 3.0 */
	ASSERT_NEAR(3.0, result, 0.1);
}

TEST(clamp_mindiff)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.current_diff = 0.01;
	s.adjustment_count = 5;
	s.mindiff = 0.001;

	/* Very low measured rate → tries to decrease below mindiff */
	result = vardiff_calc(&s, 0.001);
	ASSERT_TRUE(result >= 0.001);
}

TEST(clamp_maxdiff)
{
	vardiff_state_t s;
	double result;
	init_state(&s);
	s.current_diff = 500000.0;
	s.adjustment_count = 0;
	s.maxdiff = 1000000.0;

	/* Very high rate, fast ramp tries to exceed maxdiff */
	result = vardiff_calc(&s, 100.0);
	ASSERT_TRUE(result <= 1000000.0);
}

TEST(stable_interval_counter)
{
	vardiff_state_t s;
	init_state(&s);

	/* Within dead band */
	vardiff_calc(&s, 0.1);
	ASSERT_EQ(1, s.stable_intervals);
	vardiff_calc(&s, 0.1);
	ASSERT_EQ(2, s.stable_intervals);

	/* Outside dead band resets */
	s.adjustment_count = 5;
	vardiff_calc(&s, 0.5);
	ASSERT_EQ(0, s.stable_intervals);
}

int main(void)
{
	TEST_SUITE("Enhanced VarDiff EMA Algorithm");

	RUN_TEST(ema_first_measurement);
	RUN_TEST(ema_smoothing);
	RUN_TEST(dead_band_no_change);
	RUN_TEST(dead_band_boundary);
	RUN_TEST(dampened_increase);
	RUN_TEST(dampened_decrease);
	RUN_TEST(fast_ramp_up);
	RUN_TEST(fast_ramp_capped);
	RUN_TEST(fast_ramp_only_first_3);
	RUN_TEST(clamp_mindiff);
	RUN_TEST(clamp_maxdiff);
	RUN_TEST(stable_interval_counter);

	PRINT_RESULTS();
}
