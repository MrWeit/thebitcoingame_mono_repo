# Phase 2 — Testing Infrastructure

| Field        | Value                                 |
| ------------ | ------------------------------------- |
| **Duration** | 3 weeks                               |
| **Status**   | Not Started                           |
| **Owner**    | TBD                                   |
| **Depends**  | Phase 1 — Core Fork & Event System    |
| **Blocks**   | Phase 3 — Production Deployment       |

---

## 2.1 Objectives

1. **Comprehensive unit test suite for C code** — share validation, difficulty calculation, address parsing, event serialization, VarDiff algorithm, and block solve detection, all runnable without a live Bitcoin node.
2. **Integration tests against Bitcoin signet** — full end-to-end flows from miner connection through share submission, event emission, and database persistence.
3. **Bitcoin signet infrastructure** — deterministic, reproducible test mining environment with documented setup and teardown procedures.
4. **Load testing framework** — simulate thousands of concurrent miners, measure throughput, latency, and resource consumption under sustained load.
5. **CI/CD test pipeline** — automated test execution on every push, with coverage targets and performance regression gates.

---

## 2.2 Test Architecture

```mermaid
graph TB
    subgraph "Unit Tests (no network)"
        UT1["Share Validation"]
        UT2["Difficulty Calculation"]
        UT3["Address Validation"]
        UT4["Event Serialization"]
        UT5["VarDiff Algorithm"]
        UT6["Block Solve Detection"]
    end

    subgraph "Integration Tests (signet)"
        IT1["ckpool ↔ Bitcoin Core"]
        IT2["Miner → Share → Event"]
        IT3["Block Template via ZMQ"]
        IT4["Event Collector Pipeline"]
    end

    subgraph "Load Tests"
        LT1["Concurrent Miners"]
        LT2["Share Throughput"]
        LT3["Event Pipeline Latency"]
        LT4["Memory/CPU Profiling"]
    end

    UT1 --> IT2
    UT6 --> IT1
    IT2 --> LT1
    IT4 --> LT3

    style UT1 fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style UT2 fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style UT3 fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style UT4 fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style UT5 fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style UT6 fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style IT1 fill:#1a1a2e,stroke:#a371f7,color:#fff
    style IT2 fill:#1a1a2e,stroke:#a371f7,color:#fff
    style IT3 fill:#1a1a2e,stroke:#a371f7,color:#fff
    style IT4 fill:#1a1a2e,stroke:#a371f7,color:#fff
    style LT1 fill:#1a1a2e,stroke:#f7931a,color:#fff
    style LT2 fill:#1a1a2e,stroke:#f7931a,color:#fff
    style LT3 fill:#1a1a2e,stroke:#f7931a,color:#fff
    style LT4 fill:#1a1a2e,stroke:#f7931a,color:#fff
```

---

## 2.3 Unit Tests — C Code

All unit tests are built with a minimal C test harness (no external framework dependency to keep the GPL fork lean). Each test file compiles independently and links only against `libckpool.c` helpers.

### 2.3.1 Test Framework

```c
/* test_harness.h — Minimal assertion macros for ckpool unit tests */

#ifndef TEST_HARNESS_H
#define TEST_HARNESS_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

static int _tests_run = 0;
static int _tests_passed = 0;
static int _tests_failed = 0;

#define TEST(name) static void test_##name(void)

#define RUN_TEST(name) do { \
    _tests_run++; \
    printf("  [RUN ] %s ... ", #name); \
    test_##name(); \
    _tests_passed++; \
    printf("PASS\n"); \
} while (0)

#define ASSERT_TRUE(expr) do { \
    if (!(expr)) { \
        printf("FAIL\n    Assertion failed: %s\n    at %s:%d\n", \
               #expr, __FILE__, __LINE__); \
        _tests_failed++; \
        _tests_passed--; \
        return; \
    } \
} while (0)

#define ASSERT_EQ(a, b) ASSERT_TRUE((a) == (b))
#define ASSERT_NEQ(a, b) ASSERT_TRUE((a) != (b))
#define ASSERT_STR_EQ(a, b) ASSERT_TRUE(strcmp((a), (b)) == 0)
#define ASSERT_FLOAT_EQ(a, b, eps) ASSERT_TRUE(fabs((a) - (b)) < (eps))

#define TEST_SUMMARY() do { \
    printf("\n%d tests run: %d passed, %d failed\n", \
           _tests_run, _tests_passed, _tests_failed); \
    return _tests_failed > 0 ? 1 : 0; \
} while (0)

#endif /* TEST_HARNESS_H */
```

### 2.3.2 Share Validation Tests

```c
/* test_share_validation.c */

#include "test_harness.h"
#include "stratifier.h"  /* exposes share validation helpers */

TEST(share_meets_target_at_diff_1) {
    /* A share at diff 1 means hash < target for diff 1.
     * Target for diff 1 = 0x00000000FFFF... (32-byte) */
    uint8_t hash[32] = {0};
    hash[3] = 0x01;  /* hash = 0x00000001... (well below diff-1 target) */

    double sdiff = share_diff(hash);
    ASSERT_TRUE(sdiff >= 1.0);
}

TEST(share_below_target_rejected) {
    /* A hash that is larger than the target should be rejected */
    uint8_t hash[32];
    memset(hash, 0xFF, sizeof(hash));  /* worst possible hash */

    double sdiff = share_diff(hash);
    ASSERT_FLOAT_EQ(sdiff, 0.0, 0.001);
}

TEST(share_diff_calculation_known_vector) {
    /* Known test vector: diff = 2^32 when first 4 bytes are 0x00000000
     * and the 5th byte is 0x01 */
    uint8_t hash[32] = {0};
    hash[4] = 0x01;

    double expected_diff = 4294967296.0;  /* 2^32 / 1.0 approx */
    double sdiff = share_diff(hash);
    ASSERT_FLOAT_EQ(sdiff, expected_diff, expected_diff * 0.01);
}

TEST(share_accepted_at_client_diff) {
    /* Share with sdiff=100 should be accepted when client diff=50 */
    ASSERT_TRUE(share_meets_diff(100.0, 50.0));
}

TEST(share_rejected_below_client_diff) {
    /* Share with sdiff=30 should be rejected when client diff=50 */
    ASSERT_TRUE(!share_meets_diff(30.0, 50.0));
}

TEST(share_edge_case_exact_diff) {
    /* Share with sdiff exactly equal to client diff — should accept */
    ASSERT_TRUE(share_meets_diff(50.0, 50.0));
}

int main(void) {
    printf("=== Share Validation Tests ===\n");
    RUN_TEST(share_meets_target_at_diff_1);
    RUN_TEST(share_below_target_rejected);
    RUN_TEST(share_diff_calculation_known_vector);
    RUN_TEST(share_accepted_at_client_diff);
    RUN_TEST(share_rejected_below_client_diff);
    RUN_TEST(share_edge_case_exact_diff);
    TEST_SUMMARY();
}
```

### 2.3.3 Difficulty Calculation Tests

```c
/* test_difficulty.c */

#include "test_harness.h"

TEST(target_to_diff_genesis) {
    /* Genesis block target: 0x1d00ffff (compact) = diff 1.0 */
    double diff = compact_to_diff(0x1d00ffff);
    ASSERT_FLOAT_EQ(diff, 1.0, 0.001);
}

TEST(target_to_diff_high) {
    /* A real mainnet compact target from ~2024 */
    uint32_t nbits = 0x17034219;
    double diff = compact_to_diff(nbits);
    ASSERT_TRUE(diff > 80e12);  /* > 80 trillion */
}

TEST(diff_to_target_roundtrip) {
    /* diff -> target -> diff should roundtrip within floating point error */
    double original = 65536.0;
    uint256_t target;
    diff_to_target(original, &target);
    double recovered = target_to_diff(&target);
    ASSERT_FLOAT_EQ(recovered, original, original * 0.0001);
}

TEST(network_diff_from_nbits) {
    /* Verify network difficulty extraction from block header nbits */
    uint32_t nbits = 0x1903a30c;  /* block 100000 */
    double diff = compact_to_diff(nbits);
    ASSERT_FLOAT_EQ(diff, 14484.162361, 0.01);
}

TEST(share_diff_scaling) {
    /* Difficulty doubles when one more leading zero bit in hash */
    uint8_t hash1[32] = {0};
    uint8_t hash2[32] = {0};
    hash1[3] = 0x80;  /* ...00000080... */
    hash2[3] = 0x40;  /* ...00000040... (one more zero bit) */

    double diff1 = share_diff(hash1);
    double diff2 = share_diff(hash2);
    ASSERT_FLOAT_EQ(diff2 / diff1, 2.0, 0.01);
}

int main(void) {
    printf("=== Difficulty Calculation Tests ===\n");
    RUN_TEST(target_to_diff_genesis);
    RUN_TEST(target_to_diff_high);
    RUN_TEST(diff_to_target_roundtrip);
    RUN_TEST(network_diff_from_nbits);
    RUN_TEST(share_diff_scaling);
    TEST_SUMMARY();
}
```

### 2.3.4 Address Validation Tests

```c
/* test_address_validation.c */

#include "test_harness.h"
#include "bitcoin.h"

/* --- Legacy (P2PKH) --- */

TEST(valid_p2pkh_mainnet) {
    ASSERT_TRUE(validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"));
}

TEST(valid_p2pkh_testnet) {
    ASSERT_TRUE(validate_address("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn"));
}

TEST(invalid_p2pkh_bad_checksum) {
    ASSERT_TRUE(!validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfxx"));
}

/* --- SegWit (P2WPKH / bech32) --- */

TEST(valid_bech32_mainnet) {
    ASSERT_TRUE(validate_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"));
}

TEST(valid_bech32_testnet) {
    ASSERT_TRUE(validate_address("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"));
}

TEST(invalid_bech32_bad_hrp) {
    ASSERT_TRUE(!validate_address("xc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"));
}

TEST(invalid_bech32_bad_checksum) {
    ASSERT_TRUE(!validate_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"));
}

/* --- Taproot (P2TR / bech32m) --- */

TEST(valid_taproot_mainnet) {
    ASSERT_TRUE(validate_address(
        "bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nk0jzgc9u7pxll8er5eqm2p058"));
}

TEST(valid_taproot_testnet) {
    ASSERT_TRUE(validate_address(
        "tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c"));
}

TEST(invalid_taproot_wrong_witness_version) {
    /* bech32m with witness version 0 (should be version 1 for taproot) */
    ASSERT_TRUE(!validate_address("bc1qft5p2uhsdcdc3l2ua4ap5qqfg4pjaqlp250x7us7a8qqhrxrxfsqseac85h"));
}

/* --- Edge Cases --- */

TEST(empty_address_rejected) {
    ASSERT_TRUE(!validate_address(""));
}

TEST(null_address_rejected) {
    ASSERT_TRUE(!validate_address(NULL));
}

TEST(address_too_long_rejected) {
    char addr[256];
    memset(addr, 'a', 255);
    addr[255] = '\0';
    ASSERT_TRUE(!validate_address(addr));
}

int main(void) {
    printf("=== Address Validation Tests ===\n");
    RUN_TEST(valid_p2pkh_mainnet);
    RUN_TEST(valid_p2pkh_testnet);
    RUN_TEST(invalid_p2pkh_bad_checksum);
    RUN_TEST(valid_bech32_mainnet);
    RUN_TEST(valid_bech32_testnet);
    RUN_TEST(invalid_bech32_bad_hrp);
    RUN_TEST(invalid_bech32_bad_checksum);
    RUN_TEST(valid_taproot_mainnet);
    RUN_TEST(valid_taproot_testnet);
    RUN_TEST(invalid_taproot_wrong_witness_version);
    RUN_TEST(empty_address_rejected);
    RUN_TEST(null_address_rejected);
    RUN_TEST(address_too_long_rejected);
    TEST_SUMMARY();
}
```

### 2.3.5 Event Serialization Tests

```c
/* test_event_serialization.c */

#include "test_harness.h"
#include <json-c/json.h>

/* Test that emit_event() produces valid JSON with required fields */

TEST(event_json_is_valid) {
    char buf[4096];
    int len = format_event(buf, sizeof(buf),
        "share_submitted",
        "\"user\":\"testuser\",\"diff\":1.0");
    ASSERT_TRUE(len > 0);

    json_object *obj = json_tokener_parse(buf);
    ASSERT_TRUE(obj != NULL);

    /* Must have "event" field */
    json_object *event_field;
    ASSERT_TRUE(json_object_object_get_ex(obj, "event", &event_field));
    ASSERT_STR_EQ(json_object_get_string(event_field), "share_submitted");

    /* Must have "ts" field */
    json_object *ts_field;
    ASSERT_TRUE(json_object_object_get_ex(obj, "ts", &ts_field));
    ASSERT_TRUE(json_object_get_double(ts_field) > 0);

    json_object_put(obj);
}

TEST(event_timestamp_is_current) {
    char buf[4096];
    format_event(buf, sizeof(buf), "test", "\"x\":1");

    json_object *obj = json_tokener_parse(buf);
    json_object *ts_field;
    json_object_object_get_ex(obj, "ts", &ts_field);

    double ts = json_object_get_double(ts_field);
    double now = (double)time(NULL);

    /* Timestamp should be within 2 seconds of now */
    ASSERT_TRUE(fabs(ts - now) < 2.0);
    json_object_put(obj);
}

TEST(event_payload_fields_present) {
    char buf[4096];
    format_event(buf, sizeof(buf),
        "share_submitted",
        "\"user\":\"alice\",\"diff\":65536.0,\"accepted\":true");

    json_object *obj = json_tokener_parse(buf);

    json_object *user_field;
    ASSERT_TRUE(json_object_object_get_ex(obj, "user", &user_field));
    ASSERT_STR_EQ(json_object_get_string(user_field), "alice");

    json_object *diff_field;
    ASSERT_TRUE(json_object_object_get_ex(obj, "diff", &diff_field));
    ASSERT_FLOAT_EQ(json_object_get_double(diff_field), 65536.0, 0.1);

    json_object_put(obj);
}

TEST(event_truncation_on_overflow) {
    /* Build a payload that exceeds EVENT_BUF_SIZE */
    char huge_payload[8192];
    memset(huge_payload, 'A', sizeof(huge_payload) - 1);
    huge_payload[sizeof(huge_payload) - 1] = '\0';

    char buf[4096];
    int len = format_event(buf, sizeof(buf), "test", huge_payload);

    /* Should return -1 or 0 indicating truncation/error */
    ASSERT_TRUE(len <= 0);
}

TEST(event_special_chars_escaped) {
    char buf[4096];
    format_event(buf, sizeof(buf),
        "test",
        "\"user\":\"alice\\\"bob\",\"data\":\"line1\\nline2\"");

    json_object *obj = json_tokener_parse(buf);
    /* If JSON is valid, escaping worked */
    ASSERT_TRUE(obj != NULL);
    json_object_put(obj);
}

int main(void) {
    printf("=== Event Serialization Tests ===\n");
    RUN_TEST(event_json_is_valid);
    RUN_TEST(event_timestamp_is_current);
    RUN_TEST(event_payload_fields_present);
    RUN_TEST(event_truncation_on_overflow);
    RUN_TEST(event_special_chars_escaped);
    TEST_SUMMARY();
}
```

### 2.3.6 VarDiff Algorithm Tests

```c
/* test_vardiff.c */

#include "test_harness.h"

/*
 * VarDiff in ckpool uses an exponential moving average of share
 * submission times. If shares come faster than the target interval,
 * difficulty increases; if slower, it decreases.
 *
 * Target: 1 share every N seconds (configurable, default ~10s).
 * Retarget check: every M shares (typically 10-30).
 * Limits: mindiff, maxdiff, maxjump (2x up, 0.5x down per retarget).
 */

TEST(vardiff_increases_when_shares_fast) {
    double current_diff = 1.0;
    double target_interval = 10.0;  /* want 1 share per 10s */
    double actual_interval = 2.0;   /* shares coming 5x too fast */

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, 0.5, 1024.0);
    ASSERT_TRUE(new_diff > current_diff);
}

TEST(vardiff_decreases_when_shares_slow) {
    double current_diff = 64.0;
    double target_interval = 10.0;
    double actual_interval = 50.0;  /* shares coming 5x too slow */

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, 0.5, 1024.0);
    ASSERT_TRUE(new_diff < current_diff);
}

TEST(vardiff_respects_min_diff) {
    double current_diff = 1.0;
    double target_interval = 10.0;
    double actual_interval = 1000.0;  /* very slow */
    double mindiff = 0.5;

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, mindiff, 1024.0);
    ASSERT_TRUE(new_diff >= mindiff);
}

TEST(vardiff_respects_max_diff) {
    double current_diff = 512.0;
    double target_interval = 10.0;
    double actual_interval = 0.001;  /* impossibly fast */
    double maxdiff = 1024.0;

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, 0.5, maxdiff);
    ASSERT_TRUE(new_diff <= maxdiff);
}

TEST(vardiff_max_jump_up_is_2x) {
    double current_diff = 100.0;
    double target_interval = 10.0;
    double actual_interval = 0.1;  /* 100x too fast */

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, 0.5, 100000.0);
    /* Should not jump more than 2x in a single retarget */
    ASSERT_TRUE(new_diff <= current_diff * 2.0);
}

TEST(vardiff_max_jump_down_is_half) {
    double current_diff = 100.0;
    double target_interval = 10.0;
    double actual_interval = 10000.0;  /* 1000x too slow */

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, 0.5, 100000.0);
    /* Should not drop more than half in a single retarget */
    ASSERT_TRUE(new_diff >= current_diff * 0.5);
}

TEST(vardiff_stable_when_on_target) {
    double current_diff = 64.0;
    double target_interval = 10.0;
    double actual_interval = 10.0;  /* exactly on target */

    double new_diff = calculate_vardiff(current_diff, target_interval,
                                        actual_interval, 0.5, 1024.0);
    /* Should remain approximately the same */
    ASSERT_FLOAT_EQ(new_diff, current_diff, current_diff * 0.1);
}

int main(void) {
    printf("=== VarDiff Algorithm Tests ===\n");
    RUN_TEST(vardiff_increases_when_shares_fast);
    RUN_TEST(vardiff_decreases_when_shares_slow);
    RUN_TEST(vardiff_respects_min_diff);
    RUN_TEST(vardiff_respects_max_diff);
    RUN_TEST(vardiff_max_jump_up_is_2x);
    RUN_TEST(vardiff_max_jump_down_is_half);
    RUN_TEST(vardiff_stable_when_on_target);
    TEST_SUMMARY();
}
```

### 2.3.7 Block Solve Detection Tests

```c
/* test_block_solve.c */

#include "test_harness.h"

TEST(hash_below_network_target_is_solve) {
    /* Network diff ~1.0 → target = 0x00000000FFFF...
     * Hash with leading zeros well below target */
    uint8_t hash[32] = {0};
    hash[4] = 0x01;
    uint8_t target[32] = {0};
    target[3] = 0xFF;
    memset(target + 4, 0xFF, 28);

    ASSERT_TRUE(is_block_solve(hash, target));
}

TEST(hash_above_network_target_is_not_solve) {
    uint8_t hash[32];
    memset(hash, 0xFF, sizeof(hash));
    uint8_t target[32] = {0};
    target[3] = 0xFF;

    ASSERT_TRUE(!is_block_solve(hash, target));
}

TEST(hash_exactly_at_target_is_solve) {
    /* Edge case: hash == target should be accepted (<=) */
    uint8_t hash[32] = {0};
    uint8_t target[32] = {0};
    hash[3] = 0x10;
    target[3] = 0x10;

    ASSERT_TRUE(is_block_solve(hash, target));
}

TEST(block_solve_at_high_difficulty) {
    /* Simulate high-diff scenario: target has many leading zeros */
    uint8_t hash[32] = {0};
    hash[8] = 0x01;  /* very low hash */
    uint8_t target[32] = {0};
    target[7] = 0xFF;  /* target starts with 7 zero bytes */

    ASSERT_TRUE(is_block_solve(hash, target));
}

TEST(coinbase_value_calculation) {
    /* Block subsidy at various heights */
    ASSERT_EQ(block_subsidy(0), 5000000000LL);       /* 50 BTC */
    ASSERT_EQ(block_subsidy(209999), 5000000000LL);   /* last block before halving */
    ASSERT_EQ(block_subsidy(210000), 2500000000LL);   /* 25 BTC (first halving) */
    ASSERT_EQ(block_subsidy(420000), 1250000000LL);   /* 12.5 BTC */
    ASSERT_EQ(block_subsidy(630000), 625000000LL);    /* 6.25 BTC */
    ASSERT_EQ(block_subsidy(840000), 312500000LL);    /* 3.125 BTC (current era) */
}

int main(void) {
    printf("=== Block Solve Detection Tests ===\n");
    RUN_TEST(hash_below_network_target_is_solve);
    RUN_TEST(hash_above_network_target_is_not_solve);
    RUN_TEST(hash_exactly_at_target_is_solve);
    RUN_TEST(block_solve_at_high_difficulty);
    RUN_TEST(coinbase_value_calculation);
    TEST_SUMMARY();
}
```

### 2.3.8 Unit Test Summary

| Test File                      | Tests | Focus Area                          |
|-------------------------------|-------|-------------------------------------|
| `test_share_validation.c`     | 6     | Share diff calculation, acceptance  |
| `test_difficulty.c`           | 5     | Target/diff conversion, scaling     |
| `test_address_validation.c`   | 13    | P2PKH, P2WPKH, P2TR, edge cases   |
| `test_event_serialization.c`  | 5     | JSON format, timestamps, overflow   |
| `test_vardiff.c`              | 7     | VarDiff up/down, limits, stability  |
| `test_block_solve.c`          | 5     | Block detection, subsidy calc       |
| **Total**                     | **41**| —                                   |

### 2.3.9 Build System for Tests

```makefile
# tests/Makefile

CC      = gcc
CFLAGS  = -Wall -Werror -g -O0 -I../src -DTESTING
LDFLAGS = -lm -ljson-c

TESTS = test_share_validation \
        test_difficulty \
        test_address_validation \
        test_event_serialization \
        test_vardiff \
        test_block_solve

HELPERS = ../src/libckpool.o ../src/bitcoin.o

all: $(TESTS)

test_%: test_%.c $(HELPERS) test_harness.h
	$(CC) $(CFLAGS) -o $@ $< $(HELPERS) $(LDFLAGS)

run: $(TESTS)
	@echo ""
	@echo "========================================="
	@echo "Running all unit tests"
	@echo "========================================="
	@failed=0; \
	for t in $(TESTS); do \
		echo ""; \
		./$$t || failed=$$((failed + 1)); \
	done; \
	echo ""; \
	echo "========================================"; \
	if [ $$failed -gt 0 ]; then \
		echo "$$failed test suite(s) FAILED"; \
		exit 1; \
	else \
		echo "All test suites PASSED"; \
	fi

clean:
	rm -f $(TESTS)

.PHONY: all run clean
```

---

## 2.4 Integration Tests

Integration tests require running infrastructure (Bitcoin Core signet, ckpool, Redis, TimescaleDB). They are implemented in Python using `pytest` for orchestration.

### 2.4.1 Test Infrastructure Stack

```mermaid
graph LR
    subgraph "Docker Compose (test stack)"
        BTC["bitcoind<br/>(signet)"]
        CK["ckpool<br/>(fork)"]
        RD["Redis 7"]
        TS["TimescaleDB"]
        EC["Event Collector"]
        CPU["cpuminer<br/>(test driver)"]
    end

    CPU -- "stratum :3333" --> CK
    CK -- "RPC :38332" --> BTC
    CK -- "events.sock" --> EC
    EC --> RD
    EC --> TS
    BTC -- "ZMQ :28332" --> CK

    style CPU fill:#0d1117,stroke:#58a6ff,color:#fff
```

### 2.4.2 Docker Compose for Tests

```yaml
# tests/docker-compose.test.yml
version: "3.9"

services:
  bitcoind-signet:
    image: lncm/bitcoind:v27.1
    command:
      - -signet
      - -server=1
      - -rpcuser=test
      - -rpcpassword=test
      - -rpcallowip=0.0.0.0/0
      - -rpcbind=0.0.0.0
      - -rpcport=38332
      - -zmqpubhashblock=tcp://0.0.0.0:28332
      - -txindex=1
    ports:
      - "38332:38332"
      - "28332:28332"
    volumes:
      - signet-data:/home/bitcoin/.bitcoin
    healthcheck:
      test: ["CMD", "bitcoin-cli", "-signet", "-rpcuser=test", "-rpcpassword=test", "getblockchaininfo"]
      interval: 10s
      timeout: 5s
      retries: 30

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  timescaledb:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: thebitcoingame_test
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s

  ckpool:
    build:
      context: ../services/ckpool
      dockerfile: Dockerfile
    depends_on:
      bitcoind-signet:
        condition: service_healthy
    volumes:
      - ckpool-run:/var/run/ckpool
      - ./fixtures/ckpool-test.conf:/etc/ckpool/ckpool.conf:ro
    ports:
      - "3333:3333"

  event-collector:
    build:
      context: ../services/event-collector
      dockerfile: Dockerfile
    depends_on:
      redis:
        condition: service_healthy
      timescaledb:
        condition: service_healthy
      ckpool:
        condition: service_started
    volumes:
      - ckpool-run:/var/run/ckpool
    environment:
      REDIS_URL: redis://redis:6379/0
      DATABASE_URL: postgresql://test:test@timescaledb:5432/thebitcoingame_test
      SOCKET_PATH: /var/run/ckpool/events.sock

volumes:
  signet-data:
  ckpool-run:
```

### 2.4.3 Integration Test Suite

```python
"""
tests/integration/test_mining_flow.py

Integration tests for the full ckpool → event collector pipeline.
Requires the Docker Compose test stack to be running.
"""

import asyncio
import json
import socket
import time

import asyncpg
import pytest
import redis.asyncio as aioredis


# --- Fixtures ---

@pytest.fixture(scope="session")
def redis_client():
    """Connect to test Redis instance."""
    client = aioredis.from_url("redis://localhost:6379/0")
    yield client
    asyncio.get_event_loop().run_until_complete(client.close())


@pytest.fixture(scope="session")
async def db_pool():
    """Connect to test TimescaleDB instance."""
    pool = await asyncpg.create_pool(
        "postgresql://test:test@localhost:5432/thebitcoingame_test"
    )
    yield pool
    await pool.close()


@pytest.fixture
def stratum_socket():
    """Raw TCP socket to ckpool stratum port."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(("localhost", 3333))
    sock.settimeout(10.0)
    yield sock
    sock.close()


def stratum_call(sock, method, params=None, msg_id=1):
    """Send a stratum JSON-RPC call and return the response."""
    request = {
        "id": msg_id,
        "method": method,
        "params": params or [],
    }
    sock.sendall((json.dumps(request) + "\n").encode())
    response = b""
    while b"\n" not in response:
        response += sock.recv(4096)
    return json.loads(response.decode().strip())


# --- Tests ---

class TestMinerConnection:
    """Test the miner connection lifecycle."""

    def test_subscribe(self, stratum_socket):
        """mining.subscribe should return subscription details."""
        result = stratum_call(stratum_socket, "mining.subscribe")
        assert result.get("error") is None
        assert result.get("result") is not None
        # Result should contain subscription ID and extranonce
        subs = result["result"]
        assert len(subs) >= 2  # [subscriptions, extranonce1, extranonce2_size]

    def test_authorize(self, stratum_socket):
        """mining.authorize should accept a valid signet address."""
        # Subscribe first
        stratum_call(stratum_socket, "mining.subscribe")
        # Authorize
        result = stratum_call(
            stratum_socket,
            "mining.authorize",
            ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx.worker1", ""],
            msg_id=2,
        )
        assert result.get("result") is True

    @pytest.mark.asyncio
    async def test_connect_event_in_redis(self, stratum_socket, redis_client):
        """Connecting a miner should produce a miner_connected event in Redis."""
        # Flush the stream
        await redis_client.delete("events:miner_connected")

        # Connect and authorize
        stratum_call(stratum_socket, "mining.subscribe")
        stratum_call(
            stratum_socket,
            "mining.authorize",
            ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx.worker1", ""],
            msg_id=2,
        )

        # Wait for event to propagate
        await asyncio.sleep(2.0)

        # Check Redis stream
        events = await redis_client.xrange("events:miner_connected", "-", "+")
        assert len(events) >= 1

        latest = events[-1][1]
        assert latest[b"user"] == b"tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
        assert latest[b"worker"] == b"worker1"

    @pytest.mark.asyncio
    async def test_disconnect_event_in_redis(self, redis_client):
        """Disconnecting a miner should produce a miner_disconnected event."""
        await redis_client.delete("events:miner_disconnected")

        # Connect and then immediately close
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect(("localhost", 3333))
        sock.settimeout(10.0)
        stratum_call(sock, "mining.subscribe")
        stratum_call(
            sock,
            "mining.authorize",
            ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx.dc_test", ""],
            msg_id=2,
        )
        sock.close()

        # Wait for disconnect detection
        await asyncio.sleep(5.0)

        events = await redis_client.xrange("events:miner_disconnected", "-", "+")
        assert len(events) >= 1


class TestShareSubmission:
    """Test share submission and event propagation."""

    @pytest.mark.asyncio
    async def test_share_event_in_redis(self, redis_client):
        """Submitting a share via cpuminer should produce events in Redis."""
        await redis_client.delete("events:share_submitted")

        # Note: This test assumes cpuminer is running against the test stack.
        # In CI, we start cpuminer as a background process for 30 seconds.
        await asyncio.sleep(15.0)  # wait for cpuminer to submit shares

        events = await redis_client.xrange("events:share_submitted", "-", "+")
        assert len(events) >= 1, "No share events found — is cpuminer running?"

        latest = events[-1][1]
        assert b"user" in latest
        assert b"diff" in latest
        assert b"sdiff" in latest
        assert b"accepted" in latest

    @pytest.mark.asyncio
    async def test_share_event_in_timescaledb(self, db_pool):
        """Share events should be persisted in TimescaleDB."""
        await asyncio.sleep(15.0)  # wait for batch flush

        async with db_pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM mining_events WHERE event_type = 'share_submitted'"
            )
            assert count >= 1, "No share events in TimescaleDB"


class TestBlockTemplateUpdates:
    """Test that new block notifications propagate correctly."""

    @pytest.mark.asyncio
    async def test_new_block_event(self, redis_client):
        """When signet produces a block, a new_block_network event should appear."""
        # This is a slow test — must wait for a signet block (~10 min)
        # In CI, we check for any existing events (signet produces blocks continuously)
        events = await redis_client.xrange("events:new_block_network", "-", "+")
        # On a fresh start, may not have events yet — mark as expected
        if len(events) == 0:
            pytest.skip("No signet blocks received yet (expected in short test runs)")

        latest = events[-1][1]
        assert b"height" in latest
        assert b"hash" in latest
        assert b"diff" in latest


class TestEventCollectorPipeline:
    """Test the event collector's processing pipeline."""

    @pytest.mark.asyncio
    async def test_redis_stream_has_correct_structure(self, redis_client):
        """All event streams should use the events: prefix."""
        keys = []
        async for key in redis_client.scan_iter("events:*"):
            keys.append(key.decode())

        expected_streams = [
            "events:share_submitted",
            "events:miner_connected",
        ]
        for stream in expected_streams:
            assert stream in keys, f"Missing stream: {stream}"

    @pytest.mark.asyncio
    async def test_timescaledb_schema_exists(self, db_pool):
        """The mining_events hypertable should exist and be a hypertable."""
        async with db_pool.acquire() as conn:
            is_hypertable = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM timescaledb_information.hypertables
                    WHERE hypertable_name = 'mining_events'
                )
            """)
            assert is_hypertable, "mining_events is not a hypertable"

    @pytest.mark.asyncio
    async def test_events_have_valid_timestamps(self, db_pool):
        """All events in the database should have valid timestamps."""
        async with db_pool.acquire() as conn:
            invalid_count = await conn.fetchval("""
                SELECT COUNT(*) FROM mining_events
                WHERE ts < '2024-01-01'::timestamptz
                   OR ts > NOW() + INTERVAL '1 hour'
            """)
            assert invalid_count == 0, f"{invalid_count} events with invalid timestamps"
```

---

## 2.5 Bitcoin Signet Setup — Detailed Guide

### 2.5.1 Why Signet Over Testnet3

| Criterion                | Testnet3                              | Signet                                |
|--------------------------|---------------------------------------|---------------------------------------|
| Block interval           | Unpredictable (20 min rule + reset)   | Deterministic ~10 min                 |
| Difficulty resets        | Yes (after 20 min no-block)           | No (controlled by signet authority)   |
| Spam/reorgs              | Frequent (permissionless)             | Rare (signed blocks only)             |
| Chain size               | ~50+ GB (spam bloat)                  | ~5 GB (clean history)                 |
| Faucet reliability       | Unreliable                            | More reliable (less abuse)            |
| Block production         | Sometimes stalls for hours            | Consistent and predictable            |
| Protocol development use | Legacy                                | **Recommended by Bitcoin Core team**  |

**Decision**: Use signet as the primary test network. Testnet3/testnet4 as optional secondary validation.

### 2.5.2 bitcoind Configuration for Signet

```ini
# ~/.bitcoin/bitcoin.conf (test environment)
signet=1
[signet]

# RPC
server=1
rpcuser=ckpool_test
rpcpassword=ckpool_test_pw
rpcallowip=127.0.0.1
rpcallowip=172.16.0.0/12  # Docker networks
rpcbind=0.0.0.0
rpcport=38332

# ZMQ
zmqpubhashblock=tcp://0.0.0.0:28332

# Mining support
# getblocktemplate requires a connected peer on signet
connect=seed.signet.bitcoin.sprovoost.nl:38333

# Performance
dbcache=512
maxmempool=256
prune=0  # keep full chain for testing

# Logging
debug=rpc
debug=zmq
```

### 2.5.3 ckpool Configuration for Signet

```json
{
    "btcd": [
        {
            "url": "127.0.0.1:38332",
            "auth": "ckpool_test",
            "pass": "ckpool_test_pw",
            "notify": "tcp://127.0.0.1:28332"
        }
    ],
    "btcaddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
    "btcsig": "/TBG-TEST/",
    "blockpoll": 500,
    "mindiff": 1,
    "startdiff": 1,
    "maxdiff": 0,
    "update_interval": 10,
    "logdir": "/tmp/ckpool-test",
    "event_socket_path": "/var/run/ckpool/events.sock",
    "event_enabled": true,
    "track_best_diff": true,
    "track_weekly_stats": true
}
```

### 2.5.4 Using cpuminer-multi for Automated Testing

```bash
#!/bin/bash
# scripts/test-mining-session.sh
#
# Runs cpuminer for a fixed duration, submitting shares to ckpool on signet.
# Used in integration tests and CI.

set -euo pipefail

CKPOOL_HOST="${CKPOOL_HOST:-127.0.0.1}"
CKPOOL_PORT="${CKPOOL_PORT:-3333}"
ADDRESS="${TEST_ADDRESS:-tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx}"
WORKER="${TEST_WORKER:-ci-test-worker}"
DURATION="${TEST_DURATION:-60}"  # seconds
THREADS="${TEST_THREADS:-1}"

echo "=== Test Mining Session ==="
echo "Target:   stratum+tcp://${CKPOOL_HOST}:${CKPOOL_PORT}"
echo "Address:  ${ADDRESS}.${WORKER}"
echo "Duration: ${DURATION}s"
echo "Threads:  ${THREADS}"
echo ""

timeout "${DURATION}" cpuminer \
    -a sha256d \
    -o "stratum+tcp://${CKPOOL_HOST}:${CKPOOL_PORT}" \
    -u "${ADDRESS}.${WORKER}" \
    -p x \
    --no-longpoll \
    --threads "${THREADS}" \
    2>&1 | tee /tmp/cpuminer-test.log

echo ""
echo "=== Mining session complete ==="

# Count accepted shares
ACCEPTED=$(grep -c "accepted" /tmp/cpuminer-test.log || true)
echo "Shares accepted: ${ACCEPTED}"

if [ "${ACCEPTED}" -eq 0 ]; then
    echo "WARNING: No shares were accepted!"
    exit 1
fi
```

### 2.5.5 Generating Test Blocks on Signet

On default signet, you cannot mine your own blocks (they require a signature from the signet authority). For block-found testing, use one of these approaches:

```mermaid
graph TD
    A["Need to test block_found events?"] --> B{"Custom signet<br/>or default?"}
    B -- "Default signet" --> C["Mock approach:<br/>Lower test_block_solve() threshold<br/>temporarily in test builds"]
    B -- "Custom signet" --> D["Run your own signet<br/>with -signetchallenge=OP_TRUE"]
    C --> E["share_submitted events trigger<br/>as if block was found"]
    D --> F["Actually mine blocks with<br/>cpuminer at trivial difficulty"]

    style D fill:#1a1a2e,stroke:#f7931a,color:#fff
    style F fill:#1a1a2e,stroke:#f7931a,color:#fff
```

**Custom signet for block-found testing:**

```bash
# Start a custom signet where anyone can mine (OP_TRUE challenge)
bitcoind -signet \
    -signetchallenge=51 \
    -signetseednode='' \
    -rpcuser=test \
    -rpcpassword=test \
    -rpcport=38332 \
    -zmqpubhashblock=tcp://0.0.0.0:28332 \
    -daemon

# With OP_TRUE challenge and mindiff=1, cpuminer can actually find blocks
```

---

## 2.6 Load Testing

### 2.6.1 Objectives

| Metric                          | Target                        | Measurement Tool       |
|---------------------------------|-------------------------------|------------------------|
| Concurrent miner connections    | 10,000+                       | stratum-sim            |
| Share submission throughput     | 50,000 shares/sec             | stratum-sim + ckpool stats |
| Event pipeline latency (p99)   | < 50ms (ckpool → Redis)       | timestamped events     |
| Event pipeline latency (p99)   | < 500ms (ckpool → TimescaleDB)| timestamped events     |
| ckpool memory under load        | < 2 GB at 10k miners         | Valgrind / /proc       |
| ckpool CPU under load           | < 80% single core at 50k sh/s| perf / htop            |
| Event collector throughput      | 100,000 events/sec            | Prometheus metrics     |

### 2.6.2 Stratum Simulator

```python
"""
tests/load/stratum_sim.py

Simulates thousands of concurrent stratum miners.
Each simulated miner:
  1. Connects via TCP
  2. Sends mining.subscribe
  3. Sends mining.authorize
  4. Periodically sends mining.submit with fake nonces
"""

import asyncio
import json
import random
import time
import sys
from dataclasses import dataclass, field


@dataclass
class SimStats:
    """Tracks simulation statistics."""
    connections_attempted: int = 0
    connections_successful: int = 0
    connections_failed: int = 0
    shares_submitted: int = 0
    shares_accepted: int = 0
    shares_rejected: int = 0
    start_time: float = field(default_factory=time.time)

    @property
    def elapsed(self) -> float:
        return time.time() - self.start_time

    @property
    def shares_per_sec(self) -> float:
        return self.shares_submitted / max(self.elapsed, 0.001)


stats = SimStats()


async def simulate_miner(
    host: str,
    port: int,
    address: str,
    worker_id: int,
    share_interval: float,
    duration: float,
):
    """Simulate a single miner connection."""
    stats.connections_attempted += 1
    worker_name = f"{address}.sim-worker-{worker_id}"

    try:
        reader, writer = await asyncio.open_connection(host, port)
        stats.connections_successful += 1
    except Exception as e:
        stats.connections_failed += 1
        return

    try:
        # mining.subscribe
        msg = json.dumps({"id": 1, "method": "mining.subscribe", "params": []})
        writer.write((msg + "\n").encode())
        await writer.drain()
        sub_response = await asyncio.wait_for(reader.readline(), timeout=10.0)
        sub_data = json.loads(sub_response)

        # Extract extranonce
        extranonce1 = sub_data.get("result", [None, "", 0])[1]
        enonce2_size = sub_data.get("result", [None, "", 4])[2]

        # mining.authorize
        msg = json.dumps({
            "id": 2,
            "method": "mining.authorize",
            "params": [worker_name, ""],
        })
        writer.write((msg + "\n").encode())
        await writer.drain()
        await asyncio.wait_for(reader.readline(), timeout=10.0)

        # Read initial mining.notify (job)
        job_line = await asyncio.wait_for(reader.readline(), timeout=30.0)
        job_data = json.loads(job_line)

        # If this is the set_difficulty, read the next line for the job
        if job_data.get("method") == "mining.set_difficulty":
            job_line = await asyncio.wait_for(reader.readline(), timeout=10.0)
            job_data = json.loads(job_line)

        if job_data.get("method") != "mining.notify":
            return

        job_id = job_data["params"][0]

        # Submit shares at the configured interval
        end_time = time.time() + duration
        submit_id = 10

        while time.time() < end_time:
            await asyncio.sleep(share_interval + random.uniform(-0.1, 0.1))

            # Generate random nonce and extranonce2
            nonce = f"{random.randint(0, 0xFFFFFFFF):08x}"
            enonce2 = f"{random.randint(0, (1 << (enonce2_size * 8)) - 1):0{enonce2_size * 2}x}"
            ntime = f"{int(time.time()):08x}"

            msg = json.dumps({
                "id": submit_id,
                "method": "mining.submit",
                "params": [worker_name, job_id, enonce2, ntime, nonce],
            })
            writer.write((msg + "\n").encode())
            await writer.drain()
            stats.shares_submitted += 1
            submit_id += 1

            # Read response (non-blocking drain)
            try:
                response_line = await asyncio.wait_for(
                    reader.readline(), timeout=2.0
                )
                resp = json.loads(response_line)
                if resp.get("result") is True:
                    stats.shares_accepted += 1
                else:
                    stats.shares_rejected += 1
            except asyncio.TimeoutError:
                pass  # response might come later

    except Exception as e:
        pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def run_simulation(
    host: str = "127.0.0.1",
    port: int = 3333,
    num_miners: int = 1000,
    share_interval: float = 1.0,
    duration: float = 60.0,
    ramp_up: float = 10.0,
    address: str = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
):
    """Run the load test simulation."""
    print(f"=== Stratum Load Test ===")
    print(f"Miners:         {num_miners}")
    print(f"Share interval: {share_interval}s")
    print(f"Duration:       {duration}s")
    print(f"Ramp-up:        {ramp_up}s")
    print(f"Target:         {host}:{port}")
    print()

    tasks = []
    ramp_delay = ramp_up / max(num_miners, 1)

    for i in range(num_miners):
        task = asyncio.create_task(
            simulate_miner(host, port, address, i, share_interval, duration)
        )
        tasks.append(task)
        if ramp_delay > 0:
            await asyncio.sleep(ramp_delay)

    # Print stats while running
    while not all(t.done() for t in tasks):
        await asyncio.sleep(5.0)
        print(
            f"[{stats.elapsed:.0f}s] "
            f"conn={stats.connections_successful}/{stats.connections_attempted} "
            f"shares={stats.shares_submitted} "
            f"({stats.shares_per_sec:.0f}/s) "
            f"accepted={stats.shares_accepted} "
            f"rejected={stats.shares_rejected}"
        )

    await asyncio.gather(*tasks, return_exceptions=True)

    # Final report
    print()
    print("=== Final Report ===")
    print(f"Duration:              {stats.elapsed:.1f}s")
    print(f"Connections attempted: {stats.connections_attempted}")
    print(f"Connections success:   {stats.connections_successful}")
    print(f"Connections failed:    {stats.connections_failed}")
    print(f"Shares submitted:      {stats.shares_submitted}")
    print(f"Shares accepted:       {stats.shares_accepted}")
    print(f"Shares rejected:       {stats.shares_rejected}")
    print(f"Throughput:            {stats.shares_per_sec:.0f} shares/sec")


if __name__ == "__main__":
    num_miners = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    duration = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    asyncio.run(run_simulation(num_miners=num_miners, duration=duration))
```

### 2.6.3 Profiling Procedures

#### Memory Profiling (Valgrind)

```bash
# Run ckpool under Valgrind (slow, but catches leaks)
valgrind --tool=massif \
    --pages-as-heap=yes \
    --massif-out-file=/tmp/ckpool-massif.out \
    ./src/ckpool -c /etc/ckpool/ckpool.conf

# Analyze after load test
ms_print /tmp/ckpool-massif.out > /tmp/ckpool-memory-report.txt
```

#### CPU Profiling (perf)

```bash
# Record CPU profile during load test
perf record -g -p $(pidof ckpool) -- sleep 60

# Generate flame graph
perf script | stackcollapse-perf.pl | flamegraph.pl > ckpool-flamegraph.svg
```

#### Event Pipeline Latency

```python
"""
tests/load/measure_latency.py

Measures end-to-end latency from ckpool event emission to Redis availability.
Relies on the 'ts' field in events vs. Redis XADD timestamp.
"""

import asyncio
import time
import redis.asyncio as aioredis


async def measure_event_latency(stream: str, sample_count: int = 1000):
    """Read events from Redis and compute latency statistics."""
    client = aioredis.from_url("redis://localhost:6379/0")
    latencies = []

    entries = await client.xrange(stream, "-", "+", count=sample_count)
    now = time.time()

    for entry_id, fields in entries:
        # entry_id format: <milliseconds>-<seq>
        redis_ts_ms = int(entry_id.decode().split("-")[0])
        redis_ts = redis_ts_ms / 1000.0

        event_ts = float(fields.get(b"ts", b"0"))

        if event_ts > 0:
            latency_ms = (redis_ts - event_ts) * 1000
            if 0 < latency_ms < 10000:  # filter obvious outliers
                latencies.append(latency_ms)

    await client.close()

    if not latencies:
        print(f"No valid latency samples for {stream}")
        return

    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]
    avg = sum(latencies) / len(latencies)

    print(f"=== Latency: {stream} ({len(latencies)} samples) ===")
    print(f"  avg:  {avg:.2f}ms")
    print(f"  p50:  {p50:.2f}ms")
    print(f"  p95:  {p95:.2f}ms")
    print(f"  p99:  {p99:.2f}ms")
    print(f"  min:  {latencies[0]:.2f}ms")
    print(f"  max:  {latencies[-1]:.2f}ms")


async def main():
    streams = [
        "events:share_submitted",
        "events:miner_connected",
        "events:diff_updated",
        "events:hashrate_update",
    ]
    for stream in streams:
        await measure_event_latency(stream)
        print()


if __name__ == "__main__":
    asyncio.run(main())
```

### 2.6.4 Load Test Scenarios

| Scenario                       | Miners | Share Interval | Duration | Purpose                              |
|-------------------------------|--------|----------------|----------|--------------------------------------|
| Smoke                          | 10     | 5s             | 60s      | Basic functionality under mild load  |
| Medium                         | 500    | 2s             | 300s     | Typical production-like load         |
| High                           | 5,000  | 1s             | 300s     | Stress test connections + VarDiff    |
| Burst                          | 10,000 | 0.5s           | 60s      | Peak load / connection storm         |
| Endurance                      | 1,000  | 2s             | 3600s    | Memory leak detection (1 hour)       |
| Churn                          | 1,000  | 2s             | 300s     | Rapid connect/disconnect cycling     |

---

## 2.7 CI/CD Test Pipeline

### 2.7.1 GitHub Actions Workflow

```yaml
# .github/workflows/ckpool-tests.yml
name: ckpool Tests

on:
  push:
    paths:
      - 'services/ckpool/**'
      - 'services/event-collector/**'
      - 'tests/**'
  pull_request:
    paths:
      - 'services/ckpool/**'
      - 'services/event-collector/**'
      - 'tests/**'

env:
  DOCKER_BUILDKIT: 1
  COMPOSE_DOCKER_CLI_BUILD: 1

jobs:
  # ─── Unit Tests (fast, no infrastructure) ──────────────────
  unit-tests:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Install C build dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            build-essential autoconf automake libtool \
            pkg-config yasm libzmq3-dev libjson-c-dev \
            libcurl4-openssl-dev libssl-dev

      - name: Build ckpool
        working-directory: services/ckpool
        run: |
          ./autogen.sh && ./configure && make -j$(nproc)

      - name: Run C unit tests
        working-directory: services/ckpool/tests
        run: |
          make run

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: unit-test-results
          path: services/ckpool/tests/*.log

  # ─── Python Tests (event collector) ────────────────────────
  collector-tests:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        working-directory: services/event-collector
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt

      - name: Run collector unit tests
        working-directory: services/event-collector
        run: |
          pytest tests/unit/ -v --tb=short --junitxml=test-results.xml

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: collector-test-results
          path: services/event-collector/test-results.xml

  # ─── Integration Tests (requires Docker stack) ─────────────
  integration-tests:
    needs: [unit-tests, collector-tests]
    runs-on: ubuntu-22.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install test dependencies
        run: |
          pip install pytest pytest-asyncio asyncpg redis

      - name: Start test infrastructure
        working-directory: tests
        run: |
          docker compose -f docker-compose.test.yml up -d
          echo "Waiting for services to be healthy..."
          docker compose -f docker-compose.test.yml ps
          sleep 30  # wait for signet sync + ckpool startup

      - name: Verify services are running
        working-directory: tests
        run: |
          docker compose -f docker-compose.test.yml ps
          # Check ckpool is listening
          timeout 10 bash -c 'until nc -z localhost 3333; do sleep 1; done'
          echo "ckpool is accepting connections"

      - name: Start test miner (background)
        run: |
          docker run -d --name test-miner \
            --network tests_default \
            cpuminer-multi:latest \
            -a sha256d \
            -o stratum+tcp://ckpool:3333 \
            -u tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx.ci-worker \
            -p x \
            --threads 1

      - name: Run integration tests
        run: |
          pytest tests/integration/ -v --tb=short \
            --junitxml=integration-results.xml \
            --timeout=120

      - name: Collect logs on failure
        if: failure()
        working-directory: tests
        run: |
          docker compose -f docker-compose.test.yml logs > docker-logs.txt 2>&1
          docker logs test-miner > cpuminer-logs.txt 2>&1

      - name: Upload logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: integration-failure-logs
          path: |
            tests/docker-logs.txt
            tests/cpuminer-logs.txt
            integration-results.xml

      - name: Tear down
        if: always()
        working-directory: tests
        run: |
          docker stop test-miner || true
          docker rm test-miner || true
          docker compose -f docker-compose.test.yml down -v

  # ─── Load Tests (manual trigger only) ──────────────────────
  load-tests:
    if: github.event_name == 'workflow_dispatch'
    needs: [integration-tests]
    runs-on: ubuntu-22.04
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install redis asyncpg

      - name: Start test infrastructure
        working-directory: tests
        run: |
          docker compose -f docker-compose.test.yml up -d
          sleep 30

      - name: Run load test (500 miners, 5 min)
        run: |
          python tests/load/stratum_sim.py 500 300 \
            | tee load-test-results.txt

      - name: Measure event pipeline latency
        run: |
          python tests/load/measure_latency.py \
            | tee latency-results.txt

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: |
            load-test-results.txt
            latency-results.txt

      - name: Tear down
        if: always()
        working-directory: tests
        run: |
          docker compose -f docker-compose.test.yml down -v
```

### 2.7.2 Pipeline Visualization

```mermaid
graph LR
    subgraph "Every Push"
        A["Unit Tests (C)"] --> D["Integration Tests"]
        B["Collector Tests (Python)"] --> D
        C["Static Analysis"] --> D
    end

    subgraph "Manual Trigger"
        D --> E["Load Tests<br/>(500 miners, 5 min)"]
        E --> F["Latency Report"]
        E --> G["Memory Profile"]
    end

    subgraph "Nightly"
        H["Endurance Test<br/>(1000 miners, 1 hour)"]
        I["Full Signet Sync"]
    end

    style A fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style B fill:#1a1a2e,stroke:#58a6ff,color:#fff
    style D fill:#1a1a2e,stroke:#a371f7,color:#fff
    style E fill:#1a1a2e,stroke:#f7931a,color:#fff
    style H fill:#1a1a2e,stroke:#ff6b6b,color:#fff
```

### 2.7.3 Test Coverage Targets

| Component              | Target Coverage | Measurement Tool                |
|------------------------|-----------------|---------------------------------|
| C unit tests           | 80% line        | gcov + lcov                     |
| Event serialization    | 100% branch     | gcov                            |
| Address validation     | 100% branch     | gcov (all address types tested) |
| Event Collector Python | 90% line        | pytest-cov                      |
| Schema validation      | 100% branch     | pytest (all 8 event types)      |

#### Coverage Generation (C)

```bash
# Build with coverage instrumentation
CFLAGS="-fprofile-arcs -ftest-coverage" ./configure
make -j$(nproc)

# Run tests
cd tests && make run

# Generate coverage report
lcov --capture --directory ../src --output-file coverage.info
lcov --remove coverage.info '/usr/*' --output-file coverage.info
genhtml coverage.info --output-directory coverage-report

echo "Coverage report: coverage-report/index.html"
```

---

## 2.8 Deliverables Checklist

| # | Deliverable                                                      | Owner | Status |
|---|------------------------------------------------------------------|-------|--------|
| 1 | C test harness (`test_harness.h`)                                | TBD   | [ ]    |
| 2 | Share validation unit tests (6 tests)                            | TBD   | [ ]    |
| 3 | Difficulty calculation unit tests (5 tests)                      | TBD   | [ ]    |
| 4 | Address validation unit tests (13 tests)                         | TBD   | [ ]    |
| 5 | Event serialization unit tests (5 tests)                         | TBD   | [ ]    |
| 6 | VarDiff algorithm unit tests (7 tests)                           | TBD   | [ ]    |
| 7 | Block solve detection unit tests (5 tests)                       | TBD   | [ ]    |
| 8 | Test Makefile for C unit tests                                   | TBD   | [ ]    |
| 9 | Docker Compose test stack (`docker-compose.test.yml`)            | TBD   | [ ]    |
| 10| Integration test: miner connection lifecycle                     | TBD   | [ ]    |
| 11| Integration test: share submission + event propagation           | TBD   | [ ]    |
| 12| Integration test: block template via ZMQ                         | TBD   | [ ]    |
| 13| Integration test: event collector → Redis → TimescaleDB          | TBD   | [ ]    |
| 14| Stratum simulator for load testing (`stratum_sim.py`)            | TBD   | [ ]    |
| 15| Event pipeline latency measurement tool                          | TBD   | [ ]    |
| 16| Load test: 500 miners, 5 min baseline                           | TBD   | [ ]    |
| 17| Load test: 5,000 miners stress test                             | TBD   | [ ]    |
| 18| Memory profiling report (Valgrind massif)                        | TBD   | [ ]    |
| 19| CPU profiling report (perf flamegraph)                           | TBD   | [ ]    |
| 20| GitHub Actions CI workflow (`ckpool-tests.yml`)                  | TBD   | [ ]    |
| 21| Test coverage report generation (gcov + lcov)                    | TBD   | [ ]    |
| 22| Coverage gate: 80% line coverage for C code                     | TBD   | [ ]    |
| 23| Custom signet setup for block-found testing                      | TBD   | [ ]    |
| 24| Test documentation (how to run locally, how to add tests)        | TBD   | [ ]    |

---

## 2.9 Week-by-Week Schedule

### Week 1 — Unit Tests

- Implement `test_harness.h` and test Makefile
- Write and pass `test_share_validation.c` (6 tests)
- Write and pass `test_difficulty.c` (5 tests)
- Write and pass `test_address_validation.c` (13 tests)
- Write and pass `test_event_serialization.c` (5 tests)
- Write and pass `test_vardiff.c` (7 tests)
- Write and pass `test_block_solve.c` (5 tests)
- Set up gcov + lcov coverage reporting
- Add unit tests to GitHub Actions CI

### Week 2 — Integration Tests & Signet

- Create Docker Compose test stack
- Configure signet node in Docker
- Write integration test: miner connection lifecycle
- Write integration test: share submission + events
- Write integration test: event collector pipeline
- Set up custom signet for block-found testing
- Write integration test: block template via ZMQ
- Add integration tests to GitHub Actions CI

### Week 3 — Load Tests & CI Polish

- Implement stratum simulator (`stratum_sim.py`)
- Implement latency measurement tool
- Run baseline load test (500 miners, 5 min)
- Run stress test (5,000 miners, 5 min)
- Run endurance test (1,000 miners, 1 hour)
- Memory profiling with Valgrind
- CPU profiling with perf + flame graphs
- Finalize CI pipeline with all stages
- Coverage gates enforced
- Write test documentation
- Phase 2 sign-off

---

## 2.10 Risk Register

| Risk                                                  | Impact | Likelihood | Mitigation                                                     |
|-------------------------------------------------------|--------|------------|----------------------------------------------------------------|
| Signet node slow to sync in CI                        | Medium | Medium     | Pre-built Docker image with synced chain; cache between runs   |
| cpuminer shares rejected at diff=1 on signet          | Medium | Medium     | Use custom signet with OP_TRUE challenge for deterministic tests|
| Load test flaky due to resource limits in CI           | Medium | High       | Run load tests as manual trigger, not on every push            |
| C test harness too limited                             | Low    | Low        | Keep harness minimal; upgrade to cmocka if needed              |
| Coverage target unreachable (ckpool code not modular)  | Medium | Medium     | Focus coverage on new code (event emission, diff tracking)     |
| Docker Compose startup order races                     | Medium | High       | healthcheck + depends_on conditions; explicit wait scripts      |
| Integration test timeout on slow CI runners            | Medium | Medium     | Generous timeouts; retry logic for network-dependent tests      |

---

*Phase 2 produces the safety net that allows confident iteration in subsequent phases. No production deployment should proceed until all tests pass and coverage targets are met.*
