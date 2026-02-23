# Prompt: CKPool Service — Phase 2 (Testing Infrastructure)

You are continuing to build the mining engine service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phase 1 is complete: the ckpool fork with event emission, the Python event collector, and the Docker Compose stack (bitcoin-signet, ckpool, redis, timescaledb, event-collector) are all working. Phase 2 builds the comprehensive testing infrastructure on top of this foundation.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/` (do not touch). The mining engine lives in `services/ckpool/`. The event collector lives in `services/event-collector/`. The Docker Compose stack is at `services/docker-compose.yml`.

---

## IMPORTANT CONSTRAINTS

1. **Phase 1 is already complete.** The Docker stack runs. ckpool is modified with event emission. The event collector publishes to Redis Streams and TimescaleDB. Do NOT recreate any of this. You are building tests for the existing code.
2. **Do not modify core ckpool source or event collector code.** You are ONLY adding test files, test infrastructure, and CI/CD configuration. If you find a bug during testing, document it — do not fix it in this phase.
3. **macOS development machine** — All C code building and testing MUST happen inside Docker containers. Do NOT attempt native macOS builds for C code. Python tests can run natively or in Docker.
4. **GPLv3 compliance** — Test files for C code are also GPLv3 (they link against ckpool). Python test files are not GPL (they are separate processes).
5. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.

---

## Before You Start — Read These Files (in order)

1. `docs/ckpool-service/00-master-plan.md` — Architecture overview, communication flows, event system design.
2. `docs/ckpool-service/roadmap/phase-02-testing.md` — **PRIMARY REFERENCE.** Contains complete test specifications, code examples, diagrams, and deliverables. This is your bible for this phase.
3. `docs/ckpool-service/roadmap/phase-01-core-fork.md` — What Phase 1 built (the code you are testing).
4. `docs/ckpool-service/open-source/events.md` — Full event system documentation with JSON schemas for all 8 event types.
5. `docs/ckpool-service/open-source/architecture.md` — Technical architecture of the fork.
6. `docs/ckpool-service/open-source/configuration.md` — Configuration reference (useful for test fixtures).

Read ALL of these before writing any code. The Phase 2 roadmap document contains detailed code examples for every test — use them as your starting point, then adapt to match the actual code from Phase 1.

---

## What You Are Building

### Part 1: C Unit Test Harness and Tests

Create a minimal C test framework and 6 test files covering ckpool's core logic. All unit tests run without network access — they test pure functions in isolation.

#### 1.1 Test Harness (`services/ckpool/tests/test_harness.h`)

Create a zero-dependency C test framework using macros only. No external test libraries (keep the GPL fork lean). The harness provides:

- `TEST(name)` — Define a test function
- `RUN_TEST(name)` — Execute a test and print PASS/FAIL
- `ASSERT_TRUE(expr)` — Assert expression is truthy
- `ASSERT_EQ(a, b)` — Assert equality
- `ASSERT_NEQ(a, b)` — Assert inequality
- `ASSERT_STR_EQ(a, b)` — Assert string equality (strcmp)
- `ASSERT_FLOAT_EQ(a, b, epsilon)` — Assert float equality within tolerance
- `TEST_SUMMARY()` — Print results and return exit code

The harness tracks `_tests_run`, `_tests_passed`, `_tests_failed` counters. Each test binary has its own `main()` that runs all tests and exits with `0` on success, `1` on failure.

See `docs/ckpool-service/roadmap/phase-02-testing.md` Section 2.3.1 for the complete implementation.

#### 1.2 Test Files

Create these 6 test files in `services/ckpool/tests/`:

| Test File | Tests | Focus Area |
|---|---|---|
| `test_share_validation.c` | 6 | Share difficulty calculation, share acceptance/rejection at boundaries, edge case exact-diff matching |
| `test_difficulty.c` | 5 | Target-to-difficulty conversion (genesis block, high-diff), diff-to-target roundtrip, network diff from nbits, difficulty scaling with leading zero bits |
| `test_address_validation.c` | 13 | Legacy P2PKH (mainnet + testnet), SegWit bech32 (mainnet + testnet), Taproot bech32m (mainnet + testnet), invalid checksums, bad HRP, wrong witness version, empty/null/too-long edge cases |
| `test_event_serialization.c` | 5 | Valid JSON output, timestamp freshness, payload field completeness, overflow truncation, special character escaping. **IMPORTANT:** Must verify the `source` field is present in events. |
| `test_vardiff.c` | 7 | VarDiff increases when shares are fast, decreases when slow, respects min/max limits, max jump up is 2x, max jump down is 0.5x, stable when on target |
| `test_block_solve.c` | 5 | Hash below target is solve, hash above target is not solve, hash exactly at target is solve (edge case), high-difficulty solve, coinbase subsidy at various halving heights |

**Total: 41 unit tests.**

Refer to `docs/ckpool-service/roadmap/phase-02-testing.md` Sections 2.3.2 through 2.3.7 for the complete implementation of every test. Use those as your starting point, then adapt function signatures and includes to match the actual ckpool source code from Phase 1.

**IMPORTANT:** The test code in the roadmap document references functions like `share_diff()`, `share_meets_diff()`, `compact_to_diff()`, `diff_to_target()`, `target_to_diff()`, `validate_address()`, `format_event()`, `calculate_vardiff()`, `is_block_solve()`, `block_subsidy()`. These are the functions that Phase 1 exposed. You MUST read the actual Phase 1 source code in `services/ckpool/src/` to verify function names, signatures, and include paths. Adapt the tests to match reality — do not blindly copy from the roadmap.

#### 1.3 Test Makefile (`services/ckpool/tests/Makefile`)

Create a Makefile that:

- Compiles each test against the ckpool source (linking `libckpool.o`, `bitcoin.o`)
- Uses flags: `-Wall -Werror -g -O0 -I../src -DTESTING`
- Links: `-lm -ljson-c`
- Target `all` builds all test binaries
- Target `run` executes all tests sequentially and reports overall pass/fail
- Target `clean` removes test binaries

See `docs/ckpool-service/roadmap/phase-02-testing.md` Section 2.3.9 for the complete Makefile.

#### 1.4 Docker Test Runner

The C unit tests must run inside Docker (same build environment as ckpool). Either:

- Add a `test` target to the existing ckpool Dockerfile (multi-stage build)
- Or create a `services/ckpool/Dockerfile.test` that extends the build image

The key requirement: `make test-unit` from the `services/` directory compiles and runs all C tests in Docker, and the exit code propagates correctly.

---

### Part 2: Python Event Collector Tests

Create comprehensive pytest tests for the event collector service.

#### 2.1 Test Directory Structure

```
services/event-collector/
├── tests/
│   ├── __init__.py            (already exists from Phase 1)
│   ├── conftest.py            NEW — Shared fixtures for Redis, TimescaleDB, Unix socket
│   ├── unit/
│   │   ├── __init__.py
│   │   ├── test_schemas.py    NEW — All 8 event type schema validations
│   │   ├── test_redis_publisher.py   NEW — Redis stream operations
│   │   └── test_db_writer.py  NEW — TimescaleDB write operations
│   └── integration/
│       ├── __init__.py
│       └── test_pipeline.py   NEW — End-to-end pipeline tests
├── requirements-test.txt      NEW — Test dependencies
```

#### 2.2 Test Dependencies (`requirements-test.txt`)

```
pytest>=8.0
pytest-asyncio>=0.23
pytest-cov>=5.0
pytest-timeout>=2.3
testcontainers>=4.0    # Optional: for isolated Redis/Postgres containers
fakeredis>=2.0         # For unit tests without real Redis
```

#### 2.3 Shared Fixtures (`conftest.py`)

Create fixtures for:

- **Redis client** — Connect to test Redis instance (use `fakeredis` for unit tests, real Redis for integration)
- **TimescaleDB connection pool** — Connect to test database (use testcontainers or the Docker Compose stack)
- **Unix socket** — Create a temporary Unix socket pair for testing the collector's socket reading
- **Mock event generator** — A fixture that produces valid JSON events for all 8 event types

#### 2.4 Schema Validation Tests (`test_schemas.py`)

Test all 8 event type schemas defined in `docs/ckpool-service/open-source/events.md`:

| Event Type | Required Fields | Special Validations |
|---|---|---|
| `share_submitted` | user, worker, diff, sdiff, accepted, source | `source` must be `"hosted"` |
| `block_found` | user, worker, height, hash, diff, reward, source | reward must be positive integer |
| `miner_connected` | user, worker, ip, agent, source | ip must be valid format |
| `miner_disconnected` | user, worker, duration, shares_submitted, source | duration must be non-negative |
| `diff_updated` | user, worker, old_diff, new_diff, source | new_diff must differ from old_diff |
| `hashrate_update` | user, worker, hashrate_1m, hashrate_5m, hashrate_1h, source | hashrates must be non-negative |
| `new_block_network` | height, hash, diff, source | height must be positive |
| `share_best_diff` | user, worker, diff, period, source | period must be one of session/week/alltime |

Each schema test should verify:
- All required fields are present
- Field types are correct
- Invalid events are rejected with appropriate errors
- The `source: "hosted"` field is present and correct in every event

#### 2.5 Redis Publisher Tests (`test_redis_publisher.py`)

- `XADD` writes to the correct stream key (`events:{event_type}`)
- `maxlen` enforcement works (stream does not exceed configured max)
- Stream key naming follows the convention
- Events with missing fields are handled gracefully (not silently dropped)
- Batch publishing performance is acceptable
- Connection retry logic works when Redis is temporarily unavailable

#### 2.6 Database Writer Tests (`test_db_writer.py`)

- Events are inserted into the correct TimescaleDB tables
- Batch writes work (accumulate events, flush after N events or T seconds)
- The `mining_events` table is a proper TimescaleDB hypertable
- Timestamps are stored correctly (UTC, microsecond precision)
- Duplicate events are handled gracefully (idempotency)
- The `source` column is populated correctly

#### 2.7 Pipeline Integration Tests (`test_pipeline.py`)

End-to-end tests that require running infrastructure:

- Send a mock event to the Unix socket, verify it appears in Redis Streams within 5 seconds
- Send a mock event to the Unix socket, verify it appears in TimescaleDB within 10 seconds
- Send 1000 events rapidly, verify all arrive in both Redis and TimescaleDB
- Send an invalid event (bad JSON), verify it is logged as error and does not crash the collector
- Send an event with an unknown type, verify it is handled gracefully

---

### Part 3: Bitcoin Signet Integration Tests

Full-stack integration tests that require the entire Docker Compose stack running.

#### 3.1 Directory Structure

```
services/tests/
├── integration/
│   ├── __init__.py
│   ├── conftest.py            Shared fixtures (stratum client, Redis, DB connections)
│   ├── test_stratum_connection.py   Stratum protocol compliance
│   ├── test_event_flow.py           Full pipeline: miner -> events -> Redis -> DB
│   └── test_block_template.py       Block template updates from bitcoind
├── tools/
│   └── stratum_sim.py         Stratum protocol simulator
└── load/
    ├── load_test.py           Load testing harness
    └── measure_latency.py     Event pipeline latency measurement
```

#### 3.2 Stratum Connection Tests (`test_stratum_connection.py`)

Implement a minimal async Stratum client (asyncio TCP) and test:

- **`mining.subscribe`** — Send subscribe, verify response contains subscription ID, extranonce1, and extranonce2_size
- **`mining.authorize`** — Subscribe then authorize with a valid signet address, verify `result: true`
- **`mining.authorize` with invalid address** — Verify proper rejection
- **`mining.submit`** — Submit a share (even if it's rejected for bad nonce), verify the response format is correct
- **`mining.set_difficulty`** — Verify ckpool sends a `set_difficulty` message after connection
- **Connection lifecycle** — Connect, subscribe, authorize, submit shares, disconnect cleanly

Use raw TCP sockets with asyncio (`asyncio.open_connection`), not a library. The Stratum protocol is newline-delimited JSON-RPC — each message is one JSON object followed by `\n`.

#### 3.3 Event Flow Tests (`test_event_flow.py`)

These tests verify the full pipeline from miner to database:

- Connect a simulated miner via Stratum, verify a `miner_connected` event appears in Redis within 5 seconds
- Disconnect the simulated miner, verify a `miner_disconnected` event appears in Redis within 10 seconds
- Start cpuminer (via Docker) for 30 seconds, verify `share_submitted` events appear in both Redis and TimescaleDB
- Verify all events have the `source: "hosted"` field
- Verify event timestamps are within 2 seconds of the current time

**IMPORTANT:** These tests require the full Docker stack to be running. They should have generous timeouts (signet can be slow) and use `pytest.skip()` when infrastructure is unavailable rather than failing hard.

#### 3.4 Block Template Tests (`test_block_template.py`)

- Verify ckpool receives block templates from bitcoind (check ckpool logs for `getblocktemplate` calls)
- When a new signet block appears, verify a `new_block_network` event is eventually emitted
- This is inherently slow (signet blocks ~10 minutes apart). Use `pytest.mark.slow` and `pytest.skip()` if no blocks arrive within the test window.

---

### Part 4: Stratum Protocol Simulator

Create `services/tests/tools/stratum_sim.py` — a Python script that simulates multiple concurrent miner connections for manual testing and load testing.

**Features:**

- Configurable number of miners (command-line argument)
- Each miner: connects, subscribes, authorizes, submits shares at a configurable interval
- Random worker names (`sim-worker-0`, `sim-worker-1`, etc.)
- Uses asyncio for concurrent connections
- Ramp-up period (don't connect all miners simultaneously)
- Real-time stats output: connections/sec, shares/sec, accepted/rejected
- Final summary report with throughput metrics

**Usage:**

```bash
# Simulate 100 miners, each submitting a share every 2 seconds, for 60 seconds
python services/tests/tools/stratum_sim.py --miners 100 --interval 2 --duration 60

# Quick smoke test: 10 miners for 30 seconds
python services/tests/tools/stratum_sim.py --miners 10 --duration 30
```

See `docs/ckpool-service/roadmap/phase-02-testing.md` Section 2.6.2 for the complete implementation. Adapt as needed.

---

### Part 5: Load Testing

Create load testing tools in `services/tests/load/`.

#### 5.1 Load Test Harness (`load_test.py`)

A wrapper around the stratum simulator that:

- Runs predefined scenarios (smoke, medium, high, burst, endurance)
- Collects metrics: connection throughput, share processing rate, event emission latency
- Outputs results as JSON for machine parsing AND human-readable summary
- Exits with non-zero code if key metrics fall below thresholds

**Scenarios:**

| Scenario | Miners | Share Interval | Duration | Purpose |
|---|---|---|---|---|
| Smoke | 10 | 5s | 60s | Basic functionality under mild load |
| Medium | 500 | 2s | 300s | Typical production-like load |
| High | 5,000 | 1s | 300s | Stress test connections + VarDiff |
| Burst | 10,000 | 0.5s | 60s | Peak load / connection storm |
| Endurance | 1,000 | 2s | 3600s | Memory leak detection (1 hour) |

#### 5.2 Latency Measurement (`measure_latency.py`)

Measures end-to-end event latency from ckpool emission to Redis availability:

- Reads events from Redis Streams
- Compares the `ts` field (event timestamp from ckpool) against the Redis XADD timestamp (entry ID milliseconds)
- Computes p50, p95, p99, min, max, average latency
- Reports per-stream results for all event types

See `docs/ckpool-service/roadmap/phase-02-testing.md` Section 2.6.3 for the implementation.

**Performance targets:**

| Metric | Target |
|---|---|
| Event pipeline latency p99 (ckpool to Redis) | < 50ms |
| Event pipeline latency p99 (ckpool to TimescaleDB) | < 500ms |
| ckpool memory at 10k miners | < 2 GB |
| Share throughput | > 50,000 shares/sec |

---

### Part 6: CI/CD Pipeline

Create `.github/workflows/ckpool-tests.yml` — a GitHub Actions workflow with 4 jobs.

#### 6.1 Job 1: Unit Tests (fast, no infrastructure)

- Runs on `ubuntu-22.04`
- Installs C build dependencies (`build-essential`, `autoconf`, `automake`, `libtool`, `yasm`, `libzmq3-dev`, `libjson-c-dev`, `libcurl4-openssl-dev`, `libssl-dev`)
- Builds ckpool from source
- Runs all C unit tests (`make run` in `services/ckpool/tests/`)
- Uploads test results as artifacts

#### 6.2 Job 2: Collector Tests (Python)

- Runs on `ubuntu-22.04`
- Sets up Python 3.12
- Installs event collector dependencies + test dependencies
- Runs pytest on `services/event-collector/tests/unit/`
- Uploads test results as JUnit XML

#### 6.3 Job 3: Integration Tests (requires Docker stack)

- Depends on Jobs 1 and 2 passing
- Runs on `ubuntu-22.04`
- Starts the full Docker Compose test stack
- Waits for services to be healthy (ckpool accepting connections on port 3333)
- Starts cpuminer as a background Docker container
- Runs integration tests with 120-second timeout
- Collects Docker logs on failure
- Tears down the stack in the `always` step

#### 6.4 Job 4: Load Tests (manual trigger only)

- Only runs on `workflow_dispatch` (manual trigger)
- Depends on Job 3 passing
- Starts the Docker Compose test stack
- Runs the medium load test (500 miners, 5 minutes)
- Runs latency measurement
- Uploads results as artifacts
- Tears down the stack

**Trigger conditions:**
- Push to paths: `services/ckpool/**`, `services/event-collector/**`, `services/**tests**`
- Pull request to same paths
- Load tests: manual trigger only (not on every push)

See `docs/ckpool-service/roadmap/phase-02-testing.md` Section 2.7.1 for the complete workflow YAML.

---

### Part 7: Makefile Targets

Create or update `services/Makefile` with top-level test orchestration targets:

```makefile
# === Test Targets ===

test-unit:       ## Run C unit tests in Docker
	@echo "Running C unit tests..."
	docker compose run --rm --build ckpool-test make -C /opt/ckpool/tests run

test-collector:  ## Run Python event collector tests
	@echo "Running event collector tests..."
	cd event-collector && pytest tests/unit/ -v --tb=short

test-integration: ## Run full-stack integration tests (requires Docker stack)
	@echo "Starting test infrastructure..."
	docker compose up -d
	@echo "Waiting for services..."
	sleep 30
	@echo "Running integration tests..."
	pytest tests/integration/ -v --tb=short --timeout=120
	@echo "Tearing down..."
	docker compose down -v

test-load:       ## Run load tests (requires Docker stack)
	@echo "Starting test infrastructure..."
	docker compose up -d
	sleep 30
	@echo "Running load test (500 miners, 5 min)..."
	python tests/load/load_test.py --scenario medium
	python tests/load/measure_latency.py
	docker compose down -v

test-all:        ## Run all tests (unit + collector + integration)
	$(MAKE) test-unit
	$(MAKE) test-collector
	$(MAKE) test-integration
```

Adjust paths and commands as needed to match the actual project structure from Phase 1.

---

### Part 8: Docker Compose Test Profile

Create `services/tests/docker-compose.test.yml` — a Docker Compose file specifically for testing, with lighter resource usage suitable for CI:

- Same services as the main `docker-compose.yml` but with:
  - Lower memory limits
  - Smaller database cache
  - Test-specific credentials (`test`/`test`)
  - Test database name (`thebitcoingame_test`)
  - Explicit healthchecks with reasonable intervals
  - A cpuminer service for automated test mining
- Shared volumes for ckpool events socket
- No persistent data volumes (use tmpfs or ephemeral volumes)

See `docs/ckpool-service/roadmap/phase-02-testing.md` Section 2.4.2 for the complete Docker Compose test stack YAML.

---

## Rules

1. **Do not modify core ckpool source or event collector code.** Only add test files and infrastructure.
2. **All C tests run in Docker** — no native macOS builds. The test Makefile runs inside the ckpool build container.
3. **Integration tests use the existing Docker Compose stack from Phase 1** (or the test profile variant). They do not create their own infrastructure from scratch.
4. **Python tests use pytest with async support** (`pytest-asyncio`). Mark async tests with `@pytest.mark.asyncio`.
5. **C tests use the minimal custom harness** (`test_harness.h`). No external test framework dependency (no cmocka, no CUnit, no Unity).
6. **Include `source: "hosted"` verification in event schema tests.** Every event schema test must assert that the `source` field is present and equals `"hosted"`.
7. **Signet integration tests must handle slow block times gracefully.** Use generous timeouts and `pytest.skip()` rather than hard failures when signet blocks are not available within the test window.
8. **Read the actual Phase 1 source code.** The roadmap document has example function signatures that may not exactly match what Phase 1 implemented. Always verify against the real code in `services/ckpool/src/` and `services/event-collector/src/`.
9. **Test files have headers.** C test files carry the GPLv3 header (they link against GPL code). Python test files can use a simple copyright header.
10. **Keep tests deterministic.** Avoid tests that depend on timing, network conditions, or external state. Use mocks and fixtures for unit tests. Reserve non-determinism for integration tests only, and protect those with timeouts and retries.

---

## Files to Create

| Action | File |
|---|---|
| CREATE | `services/ckpool/tests/test_harness.h` |
| CREATE | `services/ckpool/tests/test_share_validation.c` |
| CREATE | `services/ckpool/tests/test_difficulty.c` |
| CREATE | `services/ckpool/tests/test_address_validation.c` |
| CREATE | `services/ckpool/tests/test_event_serialization.c` |
| CREATE | `services/ckpool/tests/test_vardiff.c` |
| CREATE | `services/ckpool/tests/test_block_solve.c` |
| CREATE | `services/ckpool/tests/Makefile` |
| CREATE | `services/ckpool/Dockerfile.test` (or add test stage to existing Dockerfile) |
| CREATE | `services/event-collector/tests/conftest.py` |
| CREATE | `services/event-collector/tests/unit/__init__.py` |
| CREATE | `services/event-collector/tests/unit/test_schemas.py` |
| CREATE | `services/event-collector/tests/unit/test_redis_publisher.py` |
| CREATE | `services/event-collector/tests/unit/test_db_writer.py` |
| CREATE | `services/event-collector/tests/integration/__init__.py` |
| CREATE | `services/event-collector/tests/integration/test_pipeline.py` |
| CREATE | `services/event-collector/requirements-test.txt` |
| CREATE | `services/tests/__init__.py` |
| CREATE | `services/tests/integration/__init__.py` |
| CREATE | `services/tests/integration/conftest.py` |
| CREATE | `services/tests/integration/test_stratum_connection.py` |
| CREATE | `services/tests/integration/test_event_flow.py` |
| CREATE | `services/tests/integration/test_block_template.py` |
| CREATE | `services/tests/tools/stratum_sim.py` |
| CREATE | `services/tests/load/load_test.py` |
| CREATE | `services/tests/load/measure_latency.py` |
| CREATE | `services/tests/docker-compose.test.yml` |
| CREATE | `services/tests/fixtures/ckpool-test.conf` |
| CREATE | `.github/workflows/ckpool-tests.yml` |
| EDIT   | `services/Makefile` (add test targets) |

---

## Definition of Done

1. **`make test-unit` passes all 41 C unit tests in Docker.** All 6 test binaries compile cleanly with `-Wall -Werror`, execute, and report `All test suites PASSED`.
2. **`make test-collector` passes all Python event collector tests.** Schema validation covers all 8 event types. Redis publisher and DB writer unit tests pass. All tests verify the `source: "hosted"` field.
3. **`make test-integration` passes with full Docker stack.** Stratum connection lifecycle works. Events flow from simulated miner through ckpool to Redis and TimescaleDB. Event timestamps are valid.
4. **Stratum simulator can connect 100 miners and submit shares.** `stratum_sim.py --miners 100 --duration 60` completes without errors, and accepted shares > 0.
5. **CI workflow runs on push and reports results.** GitHub Actions executes unit tests and collector tests on every push to `services/` paths. Integration tests run after unit tests pass. Load tests are manual-trigger only.
6. **All 8 event types have schema validation tests.** `share_submitted`, `block_found`, `miner_connected`, `miner_disconnected`, `diff_updated`, `hashrate_update`, `new_block_network`, `share_best_diff` — each has at least 3 test cases (valid event, missing required field, wrong field type).
7. **Share validation edge cases covered.** Boundary difficulty (exact match), invalid nonces, zero difficulty, maximum difficulty — all tested in C unit tests.
8. **Address validation covers all three formats.** Legacy (P2PKH: `1...`), SegWit (P2WPKH: `bc1q...`), and Taproot (P2TR: `bc1p...`) — with valid, invalid checksum, and edge case tests for each format.
9. **Load test baseline recorded.** At least one successful run of the medium load test (500 miners, 5 minutes) with results saved.
10. **Latency measurement tool works.** `measure_latency.py` produces p50/p95/p99 latency numbers for at least the `share_submitted` event stream.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Read Phase 1 source code** — Examine `services/ckpool/src/stratifier.c`, `services/ckpool/src/bitcoin.c`, `services/ckpool/src/libckpool.c` to understand the actual function signatures and includes. Map the roadmap's test code to the real API.
2. **Test harness + first C test** — Create `test_harness.h` and `test_share_validation.c`. Get one test compiling and passing in Docker before writing the rest.
3. **Remaining C unit tests** — Implement `test_difficulty.c`, `test_address_validation.c`, `test_event_serialization.c`, `test_vardiff.c`, `test_block_solve.c`. Verify all 41 tests pass.
4. **C test Makefile** — Create the Makefile with `all`, `run`, and `clean` targets. Verify `make run` passes.
5. **Docker test runner** — Create `Dockerfile.test` or add a test stage. Verify `make test-unit` from `services/` level works.
6. **Python test dependencies** — Create `requirements-test.txt`, install in the event collector's virtual environment.
7. **Python unit tests** — Create `conftest.py`, `test_schemas.py`, `test_redis_publisher.py`, `test_db_writer.py`. Verify `make test-collector` passes.
8. **Docker Compose test stack** — Create `docker-compose.test.yml` and test fixtures. Verify the test stack starts and all services are healthy.
9. **Stratum connection tests** — Create `test_stratum_connection.py` with a minimal async Stratum client. Verify against the running Docker stack.
10. **Event flow tests** — Create `test_event_flow.py`. Connect a simulated miner, verify events in Redis and TimescaleDB.
11. **Stratum simulator** — Create `stratum_sim.py`. Test with 10, then 100 simulated miners.
12. **Load testing tools** — Create `load_test.py` and `measure_latency.py`. Run the smoke and medium scenarios.
13. **CI/CD workflow** — Create `.github/workflows/ckpool-tests.yml`. Push and verify the pipeline runs.
14. **Makefile targets** — Update `services/Makefile` with all test targets. Verify `make test-all` runs the full suite.
15. **Block template tests** — Create `test_block_template.py` (these are slow/flaky by nature — save for last).

**Critical: Get step 2 working before attempting the rest.** One passing C test in Docker proves the build chain works. Everything else builds on that foundation.

---

## Debugging Tips

- **C test won't compile:** Check include paths. The test needs `-I../src` and the ckpool source objects. Read the actual header files in `services/ckpool/src/` for the correct function declarations.
- **Docker build fails:** Check the base image matches Phase 1's Dockerfile. The build dependencies must be identical.
- **Stratum connection refused:** ckpool takes 10-30 seconds to start after bitcoind becomes healthy. Add explicit waits. Check `docker compose logs ckpool` for startup messages.
- **No events in Redis:** Check that the event collector is connected to the Unix socket. Check `docker compose logs event-collector` for socket binding messages.
- **Integration tests flaky:** Signet block times are ~10 minutes. For share-based tests, use `mindiff: 1` so cpuminer submits shares immediately. For block-based tests, use `pytest.skip()` with a message.
- **Load test connections failing:** ckpool has a `maxclients` setting. Verify it's high enough for the test scenario. Also check file descriptor limits in Docker (`ulimit -n`).
