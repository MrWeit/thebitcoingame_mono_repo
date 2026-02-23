/*
 * test_bech32m.c — Unit tests for BIP350 bech32m polymod verification
 * GPLv3 — Copyright (C) 2026 TheBitcoinGame Contributors
 *
 * Tests the bech32_polymod_step and tbg_bech32_verify_checksum functions
 * against official BIP350 test vectors.
 */

#include "test_harness.h"
#include <stdint.h>
#include <string.h>
#include <ctype.h>

/* ─── Re-implement bech32m verification for standalone testing ──── */

#define BECH32_CONST  1
#define BECH32M_CONST 0x2bc830a3

static const char BECH32_CHARSET[] = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

static uint32_t bech32_polymod_step(uint32_t pre)
{
	uint8_t b = pre >> 25;
	return ((pre & 0x1ffffff) << 5) ^
		(-((b >> 0) & 1) & 0x3b6a57b2UL) ^
		(-((b >> 1) & 1) & 0x26508e6dUL) ^
		(-((b >> 2) & 1) & 0x1ea119faUL) ^
		(-((b >> 3) & 1) & 0x3d4233ddUL) ^
		(-((b >> 4) & 1) & 0x2a1462b3UL);
}

static int charset_rev(char c)
{
	const char *p = strchr(BECH32_CHARSET, c);
	if (!p) return -1;
	return (int)(p - BECH32_CHARSET);
}

/* Verify a full bech32/bech32m address, returns the expected constant or 0 on error */
static uint32_t tbg_bech32_verify_checksum(const char *addr)
{
	uint32_t chk = 1;
	int hrp_len;
	int data_len;
	int i;
	int total_len = strlen(addr);
	const char *sep;
	char lc;
	int d;

	/* Find the last '1' separator */
	sep = strrchr(addr, '1');
	if (!sep || sep == addr)
		return 0;

	hrp_len = (int)(sep - addr);
	data_len = total_len - hrp_len - 1;

	if (data_len < 6)
		return 0;

	/* Expand HRP */
	for (i = 0; i < hrp_len; i++) {
		lc = tolower((unsigned char)addr[i]);
		chk = bech32_polymod_step(chk) ^ ((uint8_t)lc >> 5);
	}
	chk = bech32_polymod_step(chk);
	for (i = 0; i < hrp_len; i++) {
		lc = tolower((unsigned char)addr[i]);
		chk = bech32_polymod_step(chk) ^ ((uint8_t)lc & 0x1f);
	}

	/* Process data part */
	for (i = hrp_len + 1; i < total_len; i++) {
		d = charset_rev(tolower((unsigned char)addr[i]));
		if (d < 0)
			return 0;
		chk = bech32_polymod_step(chk) ^ d;
	}

	return chk;
}

/* ─── Tests ─────────────────────────────────────────────────────── */

/* BIP350 valid bech32m test vectors */
TEST(bech32m_valid_a)
{
	ASSERT_EQ(BECH32M_CONST, tbg_bech32_verify_checksum("A1LQFN3A"));
}

TEST(bech32m_valid_mainnet_p2tr)
{
	/* Valid Taproot address */
	ASSERT_EQ(BECH32M_CONST, tbg_bech32_verify_checksum(
		"bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0"));
}

TEST(bech32m_valid_testnet_p2tr)
{
	ASSERT_EQ(BECH32M_CONST, tbg_bech32_verify_checksum(
		"tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c"));
}

/* BIP173 valid bech32 (witness v0) test vectors */
TEST(bech32_valid_segwit_v0)
{
	/* bc1q... is witness v0 (bech32, not bech32m) */
	ASSERT_EQ(BECH32_CONST, tbg_bech32_verify_checksum(
		"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"));
}

TEST(bech32_valid_segwit_v0_p2wsh)
{
	/* tb1q... testnet P2WPKH (shorter, well-known valid bech32) */
	ASSERT_EQ(BECH32_CONST, tbg_bech32_verify_checksum(
		"tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"));
}

/* Invalid addresses */
TEST(invalid_wrong_checksum)
{
	/* Modified last char of valid address */
	ASSERT_NEQ(BECH32M_CONST, tbg_bech32_verify_checksum(
		"bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj1"));
}

TEST(invalid_empty_hrp)
{
	ASSERT_EQ(0, tbg_bech32_verify_checksum("1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqql5dn0p"));
}

TEST(invalid_no_separator)
{
	ASSERT_EQ(0, tbg_bech32_verify_checksum("noseparator"));
}

TEST(invalid_short_data)
{
	ASSERT_EQ(0, tbg_bech32_verify_checksum("bc1abc"));
}

/* Distinguish bech32 from bech32m */
TEST(bech32_not_bech32m)
{
	/* bc1q is witness v0, should verify as BECH32 not BECH32M */
	uint32_t result = tbg_bech32_verify_checksum(
		"bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
	ASSERT_EQ(BECH32_CONST, result);
	ASSERT_NEQ(BECH32M_CONST, result);
}

TEST(bech32m_not_bech32)
{
	/* bc1p is witness v1+, should verify as BECH32M not BECH32 */
	uint32_t result = tbg_bech32_verify_checksum(
		"bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0");
	ASSERT_EQ(BECH32M_CONST, result);
	ASSERT_NEQ(BECH32_CONST, result);
}

int main(void)
{
	TEST_SUITE("BIP350 Bech32m Verification");

	RUN_TEST(bech32m_valid_a);
	RUN_TEST(bech32m_valid_mainnet_p2tr);
	RUN_TEST(bech32m_valid_testnet_p2tr);
	RUN_TEST(bech32_valid_segwit_v0);
	RUN_TEST(bech32_valid_segwit_v0_p2wsh);
	RUN_TEST(invalid_wrong_checksum);
	RUN_TEST(invalid_empty_hrp);
	RUN_TEST(invalid_no_separator);
	RUN_TEST(invalid_short_data);
	RUN_TEST(bech32_not_bech32m);
	RUN_TEST(bech32m_not_bech32);

	PRINT_RESULTS();
}
