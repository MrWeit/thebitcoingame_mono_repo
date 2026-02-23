/*
 * test_coinbase_sig.c — Unit tests for tbg_coinbase_sig validation
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 */

#include "test_harness.h"
#include <stdbool.h>
#include <string.h>

/* Re-implement the validation logic here to test it independently
 * (avoids linking against the full ckpool binary) */
#define TBG_MAX_USER_SIG_LEN 20
#define TBG_SIG_ALLOWED_CHARS "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.:!#/ "

static bool test_validate_sig(const char *sig)
{
	int len;
	int i;

	if (!sig)
		return false;
	len = strlen(sig);
	if (len == 0 || len > TBG_MAX_USER_SIG_LEN)
		return false;
	for (i = 0; i < len; i++) {
		if (!strchr(TBG_SIG_ALLOWED_CHARS, sig[i]))
			return false;
	}
	return true;
}

/* ─── Tests ─────────────────────────────────────────────────────── */

TEST(valid_simple_sig)
{
	ASSERT_TRUE(test_validate_sig("hello"));
}

TEST(valid_with_special_chars)
{
	ASSERT_TRUE(test_validate_sig("Go Bitcoin!"));
	ASSERT_TRUE(test_validate_sig("miner_01"));
	ASSERT_TRUE(test_validate_sig("pool-v2.0"));
	ASSERT_TRUE(test_validate_sig("#HODL"));
	ASSERT_TRUE(test_validate_sig("a/b:c"));
}

TEST(valid_max_length)
{
	ASSERT_TRUE(test_validate_sig("12345678901234567890")); /* exactly 20 */
}

TEST(valid_single_char)
{
	ASSERT_TRUE(test_validate_sig("x"));
}

TEST(invalid_null)
{
	ASSERT_FALSE(test_validate_sig(NULL));
}

TEST(invalid_empty)
{
	ASSERT_FALSE(test_validate_sig(""));
}

TEST(invalid_too_long)
{
	ASSERT_FALSE(test_validate_sig("123456789012345678901")); /* 21 chars */
}

TEST(invalid_control_chars)
{
	ASSERT_FALSE(test_validate_sig("hello\nworld"));
	ASSERT_FALSE(test_validate_sig("tab\there"));
	char ctrl[] = {'\x01', 'b', 'a', 'd', '\0'};
	ASSERT_FALSE(test_validate_sig(ctrl));
}

TEST(invalid_special_chars)
{
	ASSERT_FALSE(test_validate_sig("no@email"));
	ASSERT_FALSE(test_validate_sig("no$money"));
	ASSERT_FALSE(test_validate_sig("no%percent"));
	ASSERT_FALSE(test_validate_sig("no&and"));
	ASSERT_FALSE(test_validate_sig("no*star"));
	ASSERT_FALSE(test_validate_sig("no<html>"));
}

TEST(invalid_unicode)
{
	/* é in UTF-8 is \xc3\xa9 — both bytes are > 127 so not in allowed set */
	char utf8[] = {'n', 'o', '\xc3', '\xa9', 'a', 'c', '\0'};
	ASSERT_FALSE(test_validate_sig(utf8));
}

int main(void)
{
	TEST_SUITE("Coinbase Signature Validation");

	RUN_TEST(valid_simple_sig);
	RUN_TEST(valid_with_special_chars);
	RUN_TEST(valid_max_length);
	RUN_TEST(valid_single_char);
	RUN_TEST(invalid_null);
	RUN_TEST(invalid_empty);
	RUN_TEST(invalid_too_long);
	RUN_TEST(invalid_control_chars);
	RUN_TEST(invalid_special_chars);
	RUN_TEST(invalid_unicode);

	PRINT_RESULTS();
}
