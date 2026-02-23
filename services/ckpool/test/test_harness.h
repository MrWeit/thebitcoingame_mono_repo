/*
 * test_harness.h — Minimal C test framework for TBG ckpool extensions
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 *
 * Usage:
 *   #include "test_harness.h"
 *   TEST(test_name) { ASSERT_TRUE(1 == 1); }
 *   int main() { RUN_TEST(test_name); PRINT_RESULTS(); }
 */

#ifndef TBG_TEST_HARNESS_H
#define TBG_TEST_HARNESS_H

#include <stdio.h>
#include <string.h>
#include <math.h>

static int _tests_run = 0;
static int _tests_passed = 0;
static int _tests_failed = 0;
static int _current_test_failed = 0;

#define TEST(name) static void test_##name(void)

#define RUN_TEST(name) do { \
	_tests_run++; \
	_current_test_failed = 0; \
	printf("  %-50s ", #name); \
	test_##name(); \
	if (_current_test_failed) { \
		_tests_failed++; \
		printf("FAIL\n"); \
	} else { \
		_tests_passed++; \
		printf("OK\n"); \
	} \
} while (0)

#define ASSERT_TRUE(expr) do { \
	if (!(expr)) { \
		fprintf(stderr, "\n    ASSERT_TRUE failed: %s\n    at %s:%d\n", \
			#expr, __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define ASSERT_FALSE(expr) ASSERT_TRUE(!(expr))

#define ASSERT_EQ(expected, actual) do { \
	long long _e = (long long)(expected); \
	long long _a = (long long)(actual); \
	if (_e != _a) { \
		fprintf(stderr, "\n    ASSERT_EQ failed: expected %lld, got %lld\n    at %s:%d\n", \
			_e, _a, __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define ASSERT_NEQ(expected, actual) do { \
	long long _e = (long long)(expected); \
	long long _a = (long long)(actual); \
	if (_e == _a) { \
		fprintf(stderr, "\n    ASSERT_NEQ failed: both are %lld\n    at %s:%d\n", \
			_e, __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define ASSERT_STR_EQ(expected, actual) do { \
	const char *_e = (expected); \
	const char *_a = (actual); \
	if (_e == NULL && _a == NULL) break; \
	if (_e == NULL || _a == NULL || strcmp(_e, _a) != 0) { \
		fprintf(stderr, "\n    ASSERT_STR_EQ failed: expected \"%s\", got \"%s\"\n    at %s:%d\n", \
			_e ? _e : "(null)", _a ? _a : "(null)", __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define ASSERT_NEAR(expected, actual, epsilon) do { \
	double _e = (double)(expected); \
	double _a = (double)(actual); \
	double _eps = (double)(epsilon); \
	if (fabs(_e - _a) > _eps) { \
		fprintf(stderr, "\n    ASSERT_NEAR failed: expected %.8f, got %.8f (epsilon %.8f)\n    at %s:%d\n", \
			_e, _a, _eps, __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define ASSERT_NOT_NULL(ptr) do { \
	if ((ptr) == NULL) { \
		fprintf(stderr, "\n    ASSERT_NOT_NULL failed: %s is NULL\n    at %s:%d\n", \
			#ptr, __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define ASSERT_NULL(ptr) do { \
	if ((ptr) != NULL) { \
		fprintf(stderr, "\n    ASSERT_NULL failed: %s is not NULL\n    at %s:%d\n", \
			#ptr, __FILE__, __LINE__); \
		_current_test_failed = 1; \
		return; \
	} \
} while (0)

#define PRINT_RESULTS() do { \
	printf("\n  Results: %d/%d passed", _tests_passed, _tests_run); \
	if (_tests_failed > 0) printf(", %d FAILED", _tests_failed); \
	printf("\n\n"); \
	return _tests_failed > 0 ? 1 : 0; \
} while (0)

#define TEST_SUITE(name) printf("\n=== %s ===\n", name)

#endif /* TBG_TEST_HARNESS_H */
