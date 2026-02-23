# Testing

This document describes the test suite for TheBitcoinGame Mining Engine, how to run tests, and how to write new ones.

## Table of Contents

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
  - [Load Tests](#load-tests)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)
- [Signet Testing Guide](#signet-testing-guide)

---

## Overview

The test suite is organized into three categories:

| Category | Language | Location | Requires bitcoind | Requires Miner |
|---|---|---|---|---|
| Unit | C | `tests/unit/` | No | No |
| Integration | Python | `tests/integration/` | Yes (signet) | Optional |
| Load | Python | `tests/load/` | Yes (signet) | Yes (simulated) |

Unit tests verify individual functions in isolation. Integration tests verify that the mining engine works correctly as a whole, including event emission and difficulty tracking. Load tests verify behavior under sustained high-throughput conditions.

---

## Running Tests

### Quick Start: Run All Unit Tests

```bash
make check
```

This compiles and runs all unit tests. It does not require a running Bitcoin Core node.

### Run All Tests (Including Integration)

```bash
# Requires: running bitcoind on signet, running ckpool
python3 -m pytest tests/ -v
```

### Run a Specific Test Category

```bash
# Unit tests only
make check

# Integration tests only
python3 -m pytest tests/integration/ -v

# Load tests only
python3 -m pytest tests/load/ -v --timeout=300
```

### Run a Specific Test File

```bash
python3 -m pytest tests/integration/test_events.py -v
```

### Run a Specific Test Function

```bash
python3 -m pytest tests/integration/test_events.py::test_share_event_emitted -v
```

---

## Test Categories

### Unit Tests

Unit tests are written in C and test individual functions without external dependencies. They compile as standalone executables.

**Location**: `tests/unit/`

**Files**:

| File | Tests |
|---|---|
| `test_events.c` | Event serialization, envelope fields, event type filtering, JSON schema validation |
| `test_bestdiff.c` | Difficulty comparison, scope detection (session/weekly/alltime), weekly reset logic |
| `test_bech32m.c` | Bech32m encoding/decoding, Taproot address validation, checksum verification |
| `test_health.c` | Health response JSON structure, metrics formatting |

**Running**:

```bash
# Build and run all unit tests
make check

# Build unit tests without running
make check-build

# Run a specific unit test
./tests/unit/test_events
./tests/unit/test_bestdiff
./tests/unit/test_bech32m
./tests/unit/test_health
```

**Example unit test** (`tests/unit/test_events.c`):

```c
#include "test_common.h"
#include "events.h"

static void test_event_envelope_fields(void)
{
	json_t *event;

	event = create_test_event("share.submitted");

	/* Verify envelope fields exist and have correct types */
	assert_json_string(event, "event_id");
	assert_json_string(event, "type");
	assert_json_string(event, "timestamp");
	assert_json_string(event, "pool_instance");
	assert_json_object(event, "payload");

	/* Verify type value */
	assert_string_equal(
		json_string_value(json_object_get(event, "type")),
		"share.submitted"
	);

	/* Verify timestamp is ISO 8601 */
	assert_iso8601(json_string_value(json_object_get(event, "timestamp")));

	/* Verify event_id is UUIDv4 format */
	assert_uuidv4(json_string_value(json_object_get(event, "event_id")));

	json_decref(event);
}

static void test_event_type_filtering(void)
{
	event_config_t config;

	/* Configure to only emit block.found events */
	config.event_mask = EVENT_BLOCK_FOUND;

	assert_true(event_type_enabled(&config, "block.found"));
	assert_false(event_type_enabled(&config, "share.submitted"));
	assert_false(event_type_enabled(&config, "miner.connected"));
}

static void test_event_serialization_compact(void)
{
	json_t *event;
	char *serialized;

	event = create_test_event("share.accepted");
	serialized = event_serialize(event);

	/* Verify no whitespace (compact JSON) */
	assert_null(strchr(serialized, '\n'));
	assert_null(strchr(serialized, '\t'));

	/* Verify valid JSON */
	json_t *parsed = json_loads(serialized, 0, NULL);
	assert_not_null(parsed);

	json_decref(parsed);
	free(serialized);
	json_decref(event);
}

int main(void)
{
	run_test(test_event_envelope_fields);
	run_test(test_event_type_filtering);
	run_test(test_event_serialization_compact);

	return test_report();
}
```

### Integration Tests

Integration tests verify end-to-end behavior of the mining engine, including stratum protocol handling, event emission, and interaction with Bitcoin Core.

**Location**: `tests/integration/`

**Prerequisites**:
- Running Bitcoin Core on signet
- Running ckpool instance (with events enabled)
- Python 3.10+
- Python packages: `pytest`, `requests`, `websockets` (or plain socket)

**Install test dependencies**:

```bash
pip install -r tests/requirements.txt
```

**Files**:

| File | Tests |
|---|---|
| `test_events.py` | Event socket connection, all 8 event types received, JSON schema validation |
| `test_stratum.py` | Stratum protocol compliance (subscribe, authorize, notify, submit) |
| `test_difficulty.py` | Variable difficulty adjustment, best-diff tracking across scopes |
| `test_taproot.py` | Taproot address acceptance in stratum authorization |
| `test_coinbase.py` | Custom coinbase signature presence in generated blocks |
| `test_health.py` | Health endpoint response, Prometheus metrics format |
| `conftest.py` | Shared fixtures: ckpool connection, event socket, test miner |

**Running**:

```bash
# Start required services first
bitcoind -signet -daemon -rpcuser=btcuser -rpcpassword=btcpass
./src/ckpool -c tests/fixtures/ckpool-test.conf -s /tmp/ckpool-test -l debug

# Run integration tests
python3 -m pytest tests/integration/ -v

# Run with detailed event logging
python3 -m pytest tests/integration/ -v -s --log-cli-level=DEBUG
```

**Example integration test** (`tests/integration/test_events.py`):

```python
import json
import os
import socket
import time

import pytest

SOCKET_PATH = "/tmp/ckpool-events-test.sock"
BUFFER_SIZE = 65536


@pytest.fixture(scope="module")
def event_socket():
    """Create and bind the event consumer socket."""
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    sock.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o666)
    sock.settimeout(10)  # 10-second timeout for receiving events

    yield sock

    sock.close()
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)


@pytest.fixture(scope="module")
def stratum_connection():
    """Connect a simulated miner to the stratum server."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(("localhost", 3333))
    sock.settimeout(10)

    # Subscribe
    subscribe = json.dumps({
        "id": 1,
        "method": "mining.subscribe",
        "params": ["test-miner/1.0"]
    }) + "\n"
    sock.send(subscribe.encode())
    response = sock.recv(4096).decode()

    # Authorize
    authorize = json.dumps({
        "id": 2,
        "method": "mining.authorize",
        "params": ["tb1qtest_signet_address", "x"]
    }) + "\n"
    sock.send(authorize.encode())
    response = sock.recv(4096).decode()

    yield sock

    sock.close()


def receive_event(event_socket, expected_type=None, timeout=10):
    """Receive an event, optionally filtering by type."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            data = event_socket.recv(BUFFER_SIZE)
            event = json.loads(data.decode("utf-8"))
            if expected_type is None or event.get("type") == expected_type:
                return event
        except socket.timeout:
            break
    return None


class TestEventEnvelope:
    """Test that all events have the correct envelope structure."""

    def test_miner_connected_event(self, event_socket, stratum_connection):
        event = receive_event(event_socket, "miner.connected")

        assert event is not None, "Did not receive miner.connected event"
        assert "event_id" in event
        assert "timestamp" in event
        assert "pool_instance" in event
        assert "payload" in event
        assert event["type"] == "miner.connected"

    def test_event_id_is_uuid(self, event_socket, stratum_connection):
        event = receive_event(event_socket)

        assert event is not None
        event_id = event["event_id"]
        # UUIDv4 format: 8-4-4-4-12 hex characters
        parts = event_id.split("-")
        assert len(parts) == 5
        assert len(parts[0]) == 8
        assert len(parts[1]) == 4
        assert len(parts[2]) == 4
        assert len(parts[3]) == 4
        assert len(parts[4]) == 12

    def test_timestamp_is_iso8601(self, event_socket, stratum_connection):
        event = receive_event(event_socket)

        assert event is not None
        ts = event["timestamp"]
        # Should end with Z and contain T separator
        assert "T" in ts
        assert ts.endswith("Z")


class TestShareEvents:
    """Test share-related event emission."""

    def test_share_submitted_contains_diff(self, event_socket, stratum_connection):
        # Submit a share (this depends on having work from mining.notify)
        # In practice, the simulated miner handles this
        event = receive_event(event_socket, "share.submitted", timeout=30)

        if event:  # May not fire if no work is available
            payload = event["payload"]
            assert "diff" in payload
            assert "address" in payload
            assert "worker" in payload
            assert isinstance(payload["diff"], (int, float))
```

### Load Tests

Load tests verify that the mining engine and event system perform correctly under sustained high-throughput conditions.

**Location**: `tests/load/`

**Files**:

| File | Tests |
|---|---|
| `test_concurrent_miners.py` | Multiple simultaneous miner connections |
| `test_event_throughput.py` | Event emission rate under load |
| `test_share_flood.py` | Rapid share submission handling |
| `sim_miner.py` | Simulated miner tool (also in `tests/tools/`) |

**Running**:

```bash
# Run load tests (longer timeout)
python3 -m pytest tests/load/ -v --timeout=600

# Run with custom parameters
python3 -m pytest tests/load/test_concurrent_miners.py -v \
    --miners=50 --duration=120
```

**Simulated miner**:

The `sim_miner.py` tool simulates one or more stratum miners for testing:

```bash
# Simulate 10 miners connecting to the pool
python3 tests/tools/sim_miner.py \
    --host localhost \
    --port 3333 \
    --miners 10 \
    --address tb1qtest_signet_address \
    --duration 60
```

---

## Writing New Tests

### Unit Tests (C)

1. Create a new file in `tests/unit/`, e.g., `test_your_feature.c`.
2. Include `test_common.h` for test macros.
3. Write test functions using the `assert_*` macros.
4. Add a `main()` function that calls `run_test()` for each test.
5. Add the test to `tests/unit/Makefile.am`.

Available test macros (from `test_common.h`):

```c
assert_true(condition)
assert_false(condition)
assert_null(ptr)
assert_not_null(ptr)
assert_int_equal(actual, expected)
assert_string_equal(actual, expected)
assert_double_close(actual, expected, tolerance)
assert_json_string(json_obj, key)
assert_json_number(json_obj, key)
assert_json_object(json_obj, key)
assert_json_array(json_obj, key)
assert_json_boolean(json_obj, key)
assert_iso8601(timestamp_string)
assert_uuidv4(uuid_string)
```

### Integration Tests (Python)

1. Create a new file in `tests/integration/`, e.g., `test_your_feature.py`.
2. Use fixtures from `conftest.py` for common setup (event socket, stratum connection).
3. Follow pytest conventions: test functions start with `test_`, classes start with `Test`.
4. Add any new dependencies to `tests/requirements.txt`.

### Test Fixtures

Common fixtures available in `conftest.py`:

| Fixture | Scope | Provides |
|---|---|---|
| `event_socket` | module | Bound Unix domain socket for receiving events |
| `stratum_connection` | module | Connected and authorized stratum TCP socket |
| `health_url` | session | URL for the health endpoint |
| `ckpool_process` | session | Running ckpool process (started/stopped by the fixture) |
| `bitcoind_rpc` | session | Bitcoin Core RPC client for the test network |

---

## CI/CD Integration

### GitHub Actions

The repository includes a CI workflow at `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-22.04
    strategy:
      matrix:
        compiler: [gcc, clang]

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            build-essential autoconf automake libtool \
            pkg-config libjansson-dev

      - name: Build
        env:
          CC: ${{ matrix.compiler }}
        run: |
          autoreconf -fi
          ./configure
          make -j$(nproc)

      - name: Unit tests
        run: make check

  integration:
    runs-on: ubuntu-22.04
    needs: build

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            build-essential autoconf automake libtool \
            pkg-config libjansson-dev python3-pip

      - name: Install Python test dependencies
        run: pip install -r tests/requirements.txt

      - name: Build
        run: |
          autoreconf -fi
          ./configure
          make -j$(nproc)

      - name: Install Bitcoin Core (signet)
        run: |
          wget https://bitcoincore.org/bin/bitcoin-core-27.0/bitcoin-27.0-x86_64-linux-gnu.tar.gz
          tar xzf bitcoin-27.0-x86_64-linux-gnu.tar.gz
          sudo cp bitcoin-27.0/bin/* /usr/local/bin/

      - name: Start bitcoind (signet)
        run: |
          mkdir -p /tmp/bitcoin-signet
          bitcoind -signet -daemon \
            -datadir=/tmp/bitcoin-signet \
            -rpcuser=ci_user -rpcpassword=ci_pass \
            -rpcport=38332
          sleep 10

      - name: Start ckpool
        run: |
          mkdir -p /tmp/ckpool-ci
          ./src/ckpool -c tests/fixtures/ckpool-ci.conf \
            -s /tmp/ckpool-ci -l debug &
          sleep 5

      - name: Run integration tests
        run: |
          python3 -m pytest tests/integration/ -v \
            --timeout=60 --junitxml=test-results.xml

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results.xml

  lint:
    runs-on: ubuntu-22.04

    steps:
      - uses: actions/checkout@v4

      - name: Check formatting
        run: |
          # Verify no trailing whitespace
          ! grep -rn ' $' src/ --include='*.c' --include='*.h'

      - name: Check license headers
        run: |
          python3 tests/tools/check_headers.py src/
```

### What CI Checks

| Check | Required to Pass |
|---|---|
| Build with GCC | Yes |
| Build with Clang | Yes |
| Unit tests (`make check`) | Yes |
| Integration tests (signet) | Yes |
| No trailing whitespace | Yes |
| License headers present | Yes |
| No compiler warnings | Yes (`-Werror` in CI) |

---

## Signet Testing Guide

Signet is the preferred test network for manual testing and development. This section walks through common testing scenarios.

### Setup

1. Build the mining engine (see [building.md](building.md))
2. Start Bitcoin Core on signet
3. Start ckpool with signet configuration
4. Start the event consumer (optional, for observing events)

### Scenario: Verify Event Emission

```bash
# Terminal 1: Start event consumer
python3 tests/tools/event_consumer.py --socket /tmp/ckpool-events.sock

# Terminal 2: Connect a simulated miner
python3 tests/tools/sim_miner.py --host localhost --port 3333 \
    --address tb1qTEST_ADDRESS --duration 60

# Expected: Terminal 1 shows miner.connected, then share.submitted/accepted,
#           difficulty.update, hashrate.update events
```

### Scenario: Verify Best Difficulty Tracking

```bash
# Start event consumer filtering for bestdiff events
python3 tests/tools/event_consumer.py --socket /tmp/ckpool-events.sock \
    --filter bestdiff.update

# Connect a miner on low difficulty (signet)
# The first share should trigger a bestdiff.update for all three scopes
# Subsequent shares that exceed the best should trigger new events
```

### Scenario: Verify Taproot Address

```bash
# Generate a taproot address
bitcoin-cli -signet getnewaddress "" bech32m
# Output: tb1p...

# Use it as the stratum username
minerd -o stratum+tcp://localhost:3333 -u tb1pYOUR_TAPROOT_ADDRESS -p x

# Verify in ckpool logs that the address was accepted
# Verify miner.connected event shows address_type: "bech32m"
```

### Scenario: Verify Health Endpoint

```bash
# Check health
curl -s http://localhost:8080/health | jq .

# Check Prometheus metrics
curl -s http://localhost:8080/metrics

# Verify miners_connected increases when a miner connects
# Verify events.emitted increases as events are generated
```

### Scenario: Verify Coinbase Signature

This requires finding an actual block on signet, which happens when the trusted signer produces one and your miner happens to submit a share that meets the target.

For testing purposes, you can lower the difficulty artificially or check the coinbase of blocks found by the pool in the Bitcoin Core debug log.

```bash
# Check the latest block's coinbase
bitcoin-cli -signet getblock $(bitcoin-cli -signet getbestblockhash) 2 \
    | jq '.tx[0].vin[0].coinbase'

# The hex-encoded coinbase should contain your configured btcsig text
```
