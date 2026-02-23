# Prompt: CKPool Service — Phase 3 (Enhanced Features)

You are continuing development of the mining engine service for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend mining engine (a fork of **ckpool-solo**, GPLv3, by Con Kolivas) was built in Phase 1, and testing infrastructure was added in Phase 2. Now you are implementing Phase 3: Enhanced Features.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. The mining engine lives at `services/ckpool/` and the event collector at `services/event-collector/`. The Docker Compose stack is at `services/docker-compose.yml`.

---

## IMPORTANT CONSTRAINTS

1. **macOS development machine** — ckpool is Linux-only (epoll, Unix-specific syscalls). ALL ckpool building and running MUST happen inside Docker containers. Do NOT attempt to build ckpool natively on macOS.
2. **No local Bitcoin node** — Use the existing Docker container running `bitcoind` in **signet mode** from the Phase 1 stack.
3. **GPLv3 compliance** — All C code modifications to ckpool MUST remain GPLv3. The event collector (Python) and monitoring configs are separate — they are NOT GPL.
4. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
5. **Phase 1 & 2 must be intact** — Do not break existing functionality. All existing events, hooks, tests, and Docker services must continue to work after Phase 3 modifications.
6. **Signet, not mainnet** — All Bitcoin operations are on signet. Never configure for mainnet in development.

---

## Before You Start — Read These Files (in order)

1. `docs/ckpool-service/00-master-plan.md` — Architecture overview, communication flows, event system design. Your primary reference.
2. `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` — **The detailed specification for Phase 3.** This document contains code snippets, data structures, event schemas, architecture diagrams, and the full deliverables checklist. Read it cover to cover.
3. `docs/ckpool-service/roadmap/phase-01-core-fork.md` — Phase 1 implementation details (for understanding the codebase you are modifying).
4. `docs/ckpool-service/roadmap/phase-02-testing.md` — Phase 2 testing infrastructure (for understanding the test harness you will extend).
5. `docs/ckpool-service/open-source/events.md` — Full event system documentation with JSON schemas. You will be adding new event fields and new event types.
6. `docs/ckpool-service/open-source/architecture.md` — Technical architecture of the fork.
7. `docs/ckpool-service/open-source/configuration.md` — Configuration reference. You will be adding new configuration parameters.
8. `docs/ckpool-service/open-source/building.md` — Build from source guide.
9. `docs/ckpool-service/open-source/testing.md` — Testing guide (Phase 2).

Read ALL of these before writing any code. They contain the exact specifications for what to build.

---

## Prerequisites — Verify Before Starting

Before implementing any Phase 3 features, verify the existing stack is healthy:

```bash
# 1. Start the Docker stack
cd services && docker compose up -d

# 2. Verify Bitcoin signet is synced
docker exec tbg-bitcoin-signet bitcoin-cli -signet -rpcuser=tbg -rpcpassword=tbgdev2026 getblockchaininfo

# 3. Verify ckpool is running and accepting connections
docker exec tbg-ckpool ps aux | grep ckpool
docker logs tbg-ckpool --tail 20

# 4. Verify event collector is receiving events
docker logs tbg-event-collector --tail 20

# 5. Verify Redis is up
docker exec tbg-redis redis-cli ping

# 6. Verify existing tests pass
docker exec tbg-ckpool /opt/ckpool/tests/run_tests.sh
```

If any of these fail, fix them before proceeding. Phase 3 builds on a working Phase 1 + Phase 2 foundation.

---

## What You Are Building

Phase 3 has six features. Each one directly feeds the gamification layer or operational reliability of The Bitcoin Game.

### Feature 1: Per-User Coinbase Signature Customization

**Why:** When a solo miner finds a block, the coinbase transaction is permanently written to the Bitcoin blockchain. Allowing users to put a custom message in the coinbase transforms block-finding from a financial event into a personal, shareable moment — a core gamification mechanic.

**What to implement:**

1. **Signature validation function** in `stratifier.c` or a new `coinbase_sig.c`:
   - Allowed characters: `[A-Za-z0-9_\-.:!#]` (safe ASCII subset, no control characters)
   - Maximum length: 73 bytes for the user portion (100-byte coinbase limit minus BIP34 height encoding minus `/TheBitcoinGame:` prefix minus `/` suffix)
   - Function: `validate_coinbase_sig(const char *sig)` returns `bool`

2. **Signature cache** — a thread-safe hash table in the generator process:
   - Data structure: `user_sig_entry_t` with `btc_address`, `coinbase_sig`, `last_updated`, and `UT_hash_handle`
   - Protected by `pthread_rwlock_t` for concurrent reads
   - Background thread refreshes from Redis every 30 seconds
   - Cache-first lookup: generator reads from in-memory hash table (O(1), no I/O on the hot path)
   - Cache invalidation via Redis Pub/Sub for immediate updates when a user changes their signature

3. **Coinbase construction** in `generator.c`:
   - Modify `generate_coinbase()` (or equivalent function) to call `get_user_coinbase_sig()`
   - Format: `/TheBitcoinGame:UserCustomText/` if custom sig exists, `/TheBitcoinGame/` otherwise
   - Function: `construct_coinbase_sig(char *sig_buf, size_t max_len, const char *pool_sig, const char *user_sig)`

4. **Redis integration for signature storage:**
   - Key pattern: `user_coinbase:{btc_address}` (string value)
   - The API (not built yet) will SET these keys; ckpool only READs them
   - Use `hiredis` library for Redis connectivity from C (add to build dependencies)
   - Fallback gracefully if Redis is unavailable — use default pool sig

5. **Event schema extension** for `block_found`:
   - Add `"coinbase_sig"` field (string, the full constructed signature)
   - Add `"coinbase_sig_custom"` field (boolean, true if user had a custom sig)

**Reference:** See `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` Section 2 for the complete architecture diagram, code snippets, and validation rules.

### Feature 2: Taproot (bc1p) Address Support

**Why:** Taproot (BIP341/BIP350) addresses using bech32m encoding (`bc1p...`) are increasingly the default in modern wallets. Without support, users with taproot-only wallets cannot mine on The Bitcoin Game.

**What to implement:**

1. **Bech32m decoding** in `bitcoin.c`:
   - BIP350 defines bech32m with constant `0x2bc830a3` (vs bech32's constant `1`)
   - Witness version 0 uses bech32 (existing `bc1q` support), witness version 1+ uses bech32m
   - Function: `bech32m_decode(int *witness_version, uint8_t *program, size_t *program_len, const char *address)`
   - Function: `verify_bech32m_checksum(const char *hrp, const uint8_t *data, size_t data_len)`
   - Reuse the existing `bech32_polymod()` function — only the final constant comparison changes

2. **P2TR script construction** in `bitcoin.c`:
   - Taproot output script: `OP_1 (0x51) | OP_PUSHBYTES_32 (0x20) | <32-byte x-only pubkey>`
   - Total script length: 34 bytes
   - Witness version must be 1, program must be exactly 32 bytes
   - Function: `address_to_p2tr_script(const char *address, uint8_t *script, size_t *script_len)`

3. **Extended address validation** in `bitcoin.c`:
   - Modify `validate_address()` to accept a `bool *is_taproot` output parameter
   - When address starts with `bc1p`, use bech32m decoding and P2TR validation
   - When address starts with `bc1q`, use existing bech32 decoding (unchanged)
   - Legacy (`1...`) and P2SH (`3...`) addresses remain unchanged

4. **Coinbase output adaptation** in `generator.c`:
   - When a miner authorizes with a `bc1p...` address, construct the coinbase output using `address_to_p2tr_script()` instead of `address_to_p2wpkh_script()`
   - Add `is_taproot` flag to the relevant user/client struct so the generator knows which script type to use

5. **Signet testing:**
   - Generate a Taproot address on signet: `bitcoin-cli -signet getnewaddress "" bech32m`
   - Mine with cpuminer using the Taproot address
   - Verify shares are accepted and coinbase output script is correct P2TR

**Reference:** See `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` Section 3 for the complete code snippets, address format comparison table, and BIP341 test vectors.

### Feature 3: Enhanced VarDiff Algorithm

**Why:** The stock ckpool VarDiff works well for stable, always-on miners but has shortcomings for The Bitcoin Game's diverse user base: Bitaxe devices that restart frequently, high-hashrate Antminers that take too long to ramp up, and hobbyist miners with intermittent schedules.

**What to implement:**

1. **Fast ramp-up for high-hashrate miners** in `stratifier.c`:
   - After the first share, estimate the miner's hashrate from how quickly it was submitted
   - If the share came in 4x+ faster than the target interval, jump difficulty aggressively (up to 64x per step)
   - Function: `estimate_initial_diff(double time_for_first_share, int64_t current_diff)`
   - This prevents thousands of low-diff shares flooding the system when an S19 connects at `startdiff: 1`

2. **Reconnection memory (difficulty persistence)** in `stratifier.c`:
   - Data structure: `worker_diff_memory_t` hash table keyed by `worker_name` (e.g., `"bc1q...:bitaxe-office"`)
   - Store: `last_stable_diff` (difficulty that was stable for >5 minutes), `last_seen` timestamp, `avg_hashrate`
   - On reconnect: if the worker was seen within 24 hours, restore their last stable difficulty instead of starting from `startdiff`
   - Protected by `pthread_rwlock_t`
   - Persist to Redis with TTL of 86400 seconds (24h) so data survives ckpool restarts
   - Function: `get_reconnect_diff(const char *worker_name, int64_t default_diff)`

3. **EMA-based share rate estimation** in `stratifier.c`:
   - Replace simple average share rate with Exponential Moving Average
   - Data structure: `enhanced_vardiff_t` per client with `ema_share_rate`, `ema_alpha` (configurable, default 0.3), `current_diff`, `adjustment_count`, `last_adjustment`, `stable_intervals`
   - Function: `calculate_new_diff(enhanced_vardiff_t *vd, double measured_share_rate)`

4. **Dead band to prevent oscillation:**
   - If the current share rate is within 20% of the target rate (configurable), do NOT adjust difficulty
   - This prevents constant difficulty flip-flopping due to natural mining variance
   - Increment `stable_intervals` counter when in the dead band

5. **Dampening factor:**
   - Apply only 50% (configurable) of the calculated difficulty change
   - Combined with EMA, this produces smooth, stable adjustments

6. **Minimum adjustment cooldown:**
   - Do not change difficulty more often than every 30 seconds (configurable)
   - Prevents rapid oscillation for volatile share rates

7. **New configuration parameters** in `ckpool.conf`:
   ```json
   {
       "vardiff": {
           "target_share_interval": 10,
           "retarget_interval": 30,
           "ema_alpha": 0.3,
           "dampening": 0.5,
           "dead_band_percent": 20,
           "fast_ramp_threshold": 4.0,
           "fast_ramp_max_jump": 64,
           "reconnect_memory_ttl": 86400,
           "min_adjustment_interval": 30
       }
   }
   ```

8. **Extended `diff_updated` event:**
   ```json
   {
       "event": "diff_updated",
       "data": {
           "user": "bc1q...",
           "worker": "bitaxe-living-room",
           "old_diff": 512,
           "new_diff": 2048,
           "reason": "fast_ramp",
           "ema_share_rate": 3.2,
           "target_share_rate": 0.1,
           "reconnect_restored": false,
           "session_adjustments": 3
       }
   }
   ```
   - The `reason` field values: `"fast_ramp"`, `"ema_adjust"`, `"reconnect_restore"`, `"manual"`

**Reference:** See `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` Section 4 for the complete algorithm code, configuration schema, and event schema.

### Feature 4: Health Monitoring Endpoint

**Why:** Production observability is non-negotiable. ckpool currently logs to files, but we need machine-readable metrics for Prometheus/Grafana dashboards, alerting, and capacity planning.

**What to implement:**

1. **Metrics collection** — a new file `metrics.c` / `metrics.h`:
   - Global `ckpool_metrics_t` struct using C11 `_Atomic` types for thread safety
   - Counters (only increment): `shares_valid`, `shares_invalid`, `shares_stale`, `blocks_found`, `vardiff_adjustments_up`, `vardiff_adjustments_down`, `connection_errors`, `asicboost_sessions`
   - Gauges (can go up/down): `connected_miners`, `event_queue_depth`, `bitcoin_height`, `bitcoin_connected`
   - Derived: `uptime_seconds` (calculated from `start_time` on each scrape)
   - Initialize at ckpool startup, increment/decrement at the appropriate hook points throughout `stratifier.c`, `connector.c`, and `generator.c`

2. **HTTP metrics endpoint** on a dedicated thread:
   - Bind to port 9100 (configurable)
   - Serve only `GET /metrics` — return Prometheus exposition text format
   - Lightweight: plain C socket, no HTTP library needed (just parse `GET /metrics` from the request line)
   - Function: `format_metrics(char *buf, size_t buflen)` — writes all metrics in Prometheus text format with `# HELP` and `# TYPE` annotations
   - Function: `metrics_thread(void *arg)` — the HTTP server thread

3. **Full metrics catalog** (Prometheus text format):
   ```
   # HELP ckpool_uptime_seconds Time since process start
   # TYPE ckpool_uptime_seconds gauge
   ckpool_uptime_seconds 3600

   # HELP ckpool_connected_miners Current connected miners
   # TYPE ckpool_connected_miners gauge
   ckpool_connected_miners 42

   # HELP ckpool_shares_total Total shares submitted
   # TYPE ckpool_shares_total counter
   ckpool_shares_total{valid="true"} 150000
   ckpool_shares_total{valid="false"} 230

   # HELP ckpool_blocks_found_total Blocks found since startup
   # TYPE ckpool_blocks_found_total counter
   ckpool_blocks_found_total 3

   # HELP ckpool_hashrate_total Estimated total pool hashrate in TH/s
   # TYPE ckpool_hashrate_total gauge
   ckpool_hashrate_total 450.5

   # HELP ckpool_event_emit_count Total events emitted
   # TYPE ckpool_event_emit_count counter
   ckpool_event_emit_count 250000

   # HELP ckpool_event_emit_errors Event emission errors
   # TYPE ckpool_event_emit_errors counter
   ckpool_event_emit_errors 12

   # HELP ckpool_bitcoin_height Latest known block height
   # TYPE ckpool_bitcoin_height gauge
   ckpool_bitcoin_height 891234

   # HELP ckpool_last_template_age_seconds Age of current block template
   # TYPE ckpool_last_template_age_seconds gauge
   ckpool_last_template_age_seconds 15.3

   # HELP ckpool_vardiff_adjustments_total VarDiff adjustments
   # TYPE ckpool_vardiff_adjustments_total counter
   ckpool_vardiff_adjustments_total{direction="up"} 5000
   ckpool_vardiff_adjustments_total{direction="down"} 3200

   # HELP ckpool_asicboost_miners Miners using version rolling
   # TYPE ckpool_asicboost_miners gauge
   ckpool_asicboost_miners 8

   # HELP ckpool_stale_shares_total Stale or rejected shares
   # TYPE ckpool_stale_shares_total counter
   ckpool_stale_shares_total{reason="stale"} 45
   ckpool_stale_shares_total{reason="duplicate"} 12

   # HELP ckpool_memory_bytes RSS memory usage
   # TYPE ckpool_memory_bytes gauge
   ckpool_memory_bytes 52428800

   # HELP ckpool_bitcoin_connected Bitcoin Core RPC reachable
   # TYPE ckpool_bitcoin_connected gauge
   ckpool_bitcoin_connected 1
   ```

4. **Unix socket alternative** for locked-down environments:
   - Serve the same metrics on a Unix domain socket at `/tmp/ckpool/metrics.sock`
   - Testable with: `curl --unix-socket /tmp/ckpool/metrics.sock http://localhost/metrics`

5. **Prometheus + Grafana Docker services** — add to `services/docker-compose.yml`:
   ```yaml
   prometheus:
     image: prom/prometheus:v2.51.0
     container_name: tbg-prometheus
     ports:
       - "9090:9090"
     volumes:
       - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
       - prometheus-data:/prometheus

   grafana:
     image: grafana/grafana:10.4.0
     container_name: tbg-grafana
     ports:
       - "3000:3000"
     environment:
       GF_SECURITY_ADMIN_PASSWORD: tbgdev2026
       GF_AUTH_ANONYMOUS_ENABLED: "true"
     volumes:
       - grafana-data:/var/lib/grafana
       - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
       - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
   ```

6. **Prometheus configuration** at `services/monitoring/prometheus.yml`:
   - Scrape ckpool metrics endpoint every 15 seconds
   - Scrape target: `ckpool:9100`

7. **Grafana dashboard JSON** at `services/monitoring/grafana/dashboards/ckpool.json`:
   - Panels: Connected Miners (stat+sparkline), Pool Hashrate (time series), Share Rate (time series), Invalid Share % (gauge), Blocks Found (counter), Uptime (stat), Bitcoin Core Status (status light)
   - Auto-provisioned via Grafana provisioning config

**Reference:** See `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` Section 5 for the complete metrics catalog, architecture diagram, and Grafana panel specifications.

### Feature 5: AsicBoost (Version Rolling) Detection & Logging

**Why:** AsicBoost via version rolling (overt, BIP310) is a legitimate optimization. Detecting and logging it enables a gamification feature ("Efficient Miner" badge) and provides analytics on miner hardware capabilities.

**What to implement:**

1. **Version rolling detection** in `stratifier.c`:
   - In the share validation path (where submitted version is compared against the job version), detect version rolling
   - XOR submitted_version with job_version to get `version_bits`
   - If `version_bits != 0` AND `(version_bits & ~mask) == 0`: legitimate version rolling (AsicBoost active)
   - If `version_bits != 0` AND `(version_bits & ~mask) != 0`: invalid version rolling (log warning)
   - Function: `check_asicboost(stratum_instance_t *client, uint32_t submitted_version, uint32_t job_version)`

2. **Per-client tracking:**
   - Add fields to the client/stratum_instance struct: `asicboost_active` (bool), `asicboost_rolls` (counter), `asicboost_logged` (bool, to log only once per session)
   - On first detection, emit an event and set `asicboost_logged = true`

3. **AsicBoost event emission:**
   ```json
   {
       "event": "asicboost_detected",
       "timestamp": 1714500000000000,
       "source": "hosted",
       "data": {
           "user": "bc1q...",
           "worker": "antminer-s19-rack3",
           "version_mask": "0x1fffe000",
           "version_bits_rolled": "0x04000000",
           "first_detection": true
       }
   }
   ```

4. **Enhanced `miner_connected` event:**
   - Add `"asicboost": true/false` field to the existing `miner_connected` event data
   - This is determined from whether the miner negotiated `version-rolling` during `mining.configure`

5. **Metrics integration:**
   - Increment `g_metrics.asicboost_sessions` gauge when AsicBoost is first detected for a client
   - Decrement when the client disconnects

**Reference:** See `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` Section 6 for the complete detection code and event schema.

### Feature 6: Tests for All New Features

**Why:** Every Phase 3 feature must be testable and tested. Extend the Phase 2 test infrastructure with new test suites.

**What to implement:**

#### C Unit Tests

| Test Suite | File | What to Test |
|---|---|---|
| Bech32m decoding | `tests/unit/test_bech32m.c` | Valid bc1p addresses, invalid checksums, wrong witness version, empty input, max-length addresses |
| P2TR script construction | `tests/unit/test_p2tr.c` | Script bytes match known BIP341 test vectors, invalid inputs, boundary cases |
| Address validation (all types) | `tests/unit/test_address.c` | Legacy (1...), P2SH (3...), P2WPKH (bc1q...), P2TR (bc1p...), invalid addresses, testnet/signet prefixes |
| Coinbase signature validation | `tests/unit/test_coinbase_sig.c` | Length limits, allowed characters, disallowed characters, injection attempts, empty string, NULL input |
| Coinbase construction | `tests/unit/test_coinbase.c` | Default sig format, custom sig format, oversized sig truncation, multi-byte UTF-8 rejection |
| VarDiff EMA | `tests/unit/test_vardiff.c` | EMA calculation accuracy, ramp-up thresholds, dampening factor, dead band behavior, min/max clamping, reconnect diff restoration |
| Metrics formatting | `tests/unit/test_metrics.c` | Prometheus text format compliance, counter monotonicity, gauge accuracy, buffer overflow protection |
| AsicBoost detection | `tests/unit/test_asicboost.c` | Valid rolling within mask, invalid rolling outside mask, no rolling (identical versions), edge cases with mask boundaries |

Each test file should:
- Include a `main()` function that runs all tests and reports pass/fail counts
- Use simple assert macros (no external test framework required, but use the Phase 2 framework if one was established)
- Return 0 on all-pass, non-zero on any failure
- Be compiled by the Makefile with a `make test` target

#### Python Integration Tests

| Test | File | What to Test |
|---|---|---|
| Taproot mining | `tests/integration/test_taproot_mining.py` | Connect cpuminer with a bc1p address, submit shares, verify they are accepted and coinbase output is P2TR |
| Coinbase signature | `tests/integration/test_coinbase_sig.py` | Set custom sig in Redis, mine a block on signet, verify the coinbase transaction contains the custom signature |
| VarDiff ramp-up | `tests/integration/test_vardiff_rampup.py` | Simulate a high-hashrate miner (rapid share submission), verify difficulty jumps quickly |
| VarDiff reconnect | `tests/integration/test_vardiff_reconnect.py` | Connect, let difficulty stabilize, disconnect, reconnect, verify difficulty is restored (not reset to startdiff) |
| Health metrics | `tests/integration/test_health_metrics.py` | HTTP GET to :9100/metrics, parse response, verify valid Prometheus format, check counter values are sane |
| AsicBoost logging | `tests/integration/test_asicboost.py` | Send shares with version-rolled headers, verify `asicboost_detected` event is emitted |

Integration tests should:
- Run on the Docker signet stack
- Use the Stratum protocol (TCP socket to port 3333) to simulate miners
- Have a runner script: `tests/integration/run_phase3_tests.sh`
- Be independent of each other (each test sets up and tears down its own state)

#### Performance Tests

| Test | Target | Method |
|---|---|---|
| VarDiff ramp-up time (100 TH/s simulated) | < 60 seconds to optimal diff | Simulated rapid share submission, measure time to stable diff |
| Metrics endpoint latency | < 5ms per scrape | Concurrent HTTP requests to :9100/metrics |
| Coinbase sig cache lookup | < 1 microsecond | Microbenchmark with 10,000 cached entries |
| Bech32m decode | < 10 microseconds per address | 1M iterations benchmark |

**Reference:** See `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` Section 7 for the complete test specifications and Section 8 for the deliverables checklist.

---

## Rules

1. **Read all the docs first.** The `docs/ckpool-service/` directory has comprehensive specifications. Don't reinvent -- implement what's documented.
2. **Docker everything.** ckpool does not build on macOS. The entire dev stack runs in Docker Compose.
3. **Don't modify `dashboard/`.** The frontend is done.
4. **GPLv3 compliance.** All C modifications carry the GPL header. Python code, monitoring configs, and Grafana dashboards are not GPL.
5. **Include `source: "hosted"` in ALL new events** (existing events already have this). This is critical for future-proofing.
6. **Don't break Phase 1 or Phase 2.** Existing events, hooks, event collector, database schema, and tests must continue to work. Run the existing test suite after your modifications.
7. **Test end-to-end.** Every new feature must be verified with integration tests on the signet Docker stack.
8. **Start with Taproot + Coinbase Sig** (Week 1 features), then VarDiff + Health Monitoring (Week 2), then AsicBoost + Testing (Week 3). This matches the timeline in the roadmap.
9. **Signet, not mainnet.** All Bitcoin operations are on signet. Never configure for mainnet in development.
10. **Log extensively.** During development, log every new event and feature activation at appropriate log levels. Use `LOGINFO` for first-time detections and state changes, `LOGDEBUG` for per-share details.
11. **Atomic operations for metrics.** Use C11 `_Atomic` types for all metrics counters and gauges. Never use unprotected shared state across threads.
12. **Add hiredis dependency.** The coinbase signature cache and VarDiff reconnect memory both use Redis. Add `libhiredis-dev` to the Dockerfile build dependencies and link against `-lhiredis`.

---

## Files to Create

| Action | File | Description |
|---|---|---|
| CREATE | `services/ckpool/src/metrics.c` | Metrics collection + HTTP endpoint thread |
| CREATE | `services/ckpool/src/metrics.h` | Metrics struct definitions, extern declarations |
| CREATE | `services/ckpool/src/coinbase_sig.c` | Coinbase signature cache, validation, Redis lookup |
| CREATE | `services/ckpool/src/coinbase_sig.h` | Coinbase signature function declarations |
| CREATE | `services/ckpool/tests/unit/test_bech32m.c` | Bech32m decoding unit tests |
| CREATE | `services/ckpool/tests/unit/test_p2tr.c` | P2TR script construction unit tests |
| CREATE | `services/ckpool/tests/unit/test_address.c` | Address validation unit tests (all types) |
| CREATE | `services/ckpool/tests/unit/test_coinbase_sig.c` | Coinbase signature validation unit tests |
| CREATE | `services/ckpool/tests/unit/test_coinbase.c` | Coinbase construction unit tests |
| CREATE | `services/ckpool/tests/unit/test_vardiff.c` | Enhanced VarDiff algorithm unit tests |
| CREATE | `services/ckpool/tests/unit/test_metrics.c` | Metrics formatting unit tests |
| CREATE | `services/ckpool/tests/unit/test_asicboost.c` | AsicBoost detection unit tests |
| CREATE | `services/ckpool/tests/integration/test_taproot_mining.py` | Taproot address integration test |
| CREATE | `services/ckpool/tests/integration/test_coinbase_sig.py` | Coinbase signature integration test |
| CREATE | `services/ckpool/tests/integration/test_vardiff_rampup.py` | VarDiff fast ramp-up integration test |
| CREATE | `services/ckpool/tests/integration/test_vardiff_reconnect.py` | VarDiff reconnect memory integration test |
| CREATE | `services/ckpool/tests/integration/test_health_metrics.py` | Health endpoint integration test |
| CREATE | `services/ckpool/tests/integration/test_asicboost.py` | AsicBoost detection integration test |
| CREATE | `services/ckpool/tests/integration/run_phase3_tests.sh` | Phase 3 integration test runner |
| CREATE | `services/monitoring/prometheus.yml` | Prometheus scrape configuration |
| CREATE | `services/monitoring/grafana/provisioning/datasources/prometheus.yml` | Grafana datasource provisioning |
| CREATE | `services/monitoring/grafana/provisioning/dashboards/dashboard.yml` | Grafana dashboard provisioning config |
| CREATE | `services/monitoring/grafana/dashboards/ckpool.json` | Grafana dashboard JSON |

## Files to Edit

| Action | File | What to Change |
|---|---|---|
| EDIT | `services/ckpool/src/bitcoin.c` | Add bech32m decoding, P2TR script construction, extend `validate_address()` |
| EDIT | `services/ckpool/src/bitcoin.h` | Add bech32m/P2TR function declarations, `BECH32M_CONST` define |
| EDIT | `services/ckpool/src/stratifier.c` | Enhanced VarDiff algorithm, AsicBoost detection, new event emissions, metrics increment calls |
| EDIT | `services/ckpool/src/generator.c` | Per-user coinbase signature in coinbase construction, Taproot output script selection |
| EDIT | `services/ckpool/src/ckpool.c` | Initialize metrics, start metrics thread, start sig cache thread |
| EDIT | `services/ckpool/src/ckpool.h` | Add metrics and coinbase_sig includes, new config fields for VarDiff params |
| EDIT | `services/ckpool/Dockerfile` | Add `libhiredis-dev` build dependency, compile new source files, expose port 9100 |
| EDIT | `services/ckpool/Makefile` | Add `metrics.c`, `coinbase_sig.c` to build, add test targets for new unit tests, link `-lhiredis` |
| EDIT | `services/ckpool/config/ckpool-signet.conf` | Add `vardiff` configuration block, `metrics_port` parameter |
| EDIT | `services/docker-compose.yml` | Add Prometheus and Grafana services, expose port 9100 on ckpool, add monitoring volumes |
| EDIT | `services/event-collector/src/schemas.py` | Add `asicboost_detected` event schema, update `block_found` with coinbase_sig fields, update `diff_updated` with new fields, update `miner_connected` with asicboost field |
| EDIT | `services/event-collector/src/collector.py` | Handle new event types (`asicboost_detected`) |
| EDIT | `docs/ckpool-service/open-source/events.md` | Document new event schemas and field additions |
| EDIT | `docs/ckpool-service/open-source/configuration.md` | Document new VarDiff and metrics configuration parameters |

---

## Order of Implementation

Do these in order -- each step builds on the previous:

### Week 1: Taproot + Coinbase Signatures

1. **Bech32m decoder** -- Implement `bech32m_decode()` and `verify_bech32m_checksum()` in `bitcoin.c`. Write `test_bech32m.c` unit tests with BIP350 test vectors. Verify tests pass.
2. **P2TR script construction** -- Implement `address_to_p2tr_script()` in `bitcoin.c`. Write `test_p2tr.c` unit tests. Verify correct script bytes against BIP341 test vectors.
3. **Extended address validation** -- Modify `validate_address()` to handle bc1p addresses. Write `test_address.c` covering all address types. Verify all tests pass.
4. **Coinbase output for Taproot** -- Modify `generator.c` to select P2TR output script when miner has a Taproot address. Rebuild ckpool. Test with cpuminer using a bc1p address on signet.
5. **Coinbase signature validation** -- Implement `validate_coinbase_sig()`. Write `test_coinbase_sig.c`. Verify character filtering and length limits.
6. **Signature cache infrastructure** -- Implement the hash table cache with rwlock, background Redis sync thread, and Redis Pub/Sub listener. Add hiredis dependency.
7. **Coinbase construction modification** -- Modify `generate_coinbase()` to include per-user signatures. Write `test_coinbase.c`. Test on signet by setting a key in Redis and mining a block.
8. **Integration tests** -- Write and run `test_taproot_mining.py` and `test_coinbase_sig.py`.

### Week 2: VarDiff + Health Monitoring

9. **Enhanced VarDiff data structures** -- Add `enhanced_vardiff_t` and `worker_diff_memory_t` structs to `stratifier.c`. Add new config parameters to `ckpool.conf` parsing.
10. **EMA-based VarDiff calculation** -- Replace the existing VarDiff logic with EMA + dampening + dead band. Write `test_vardiff.c` with algorithmic tests (not requiring ckpool to be running).
11. **Fast ramp-up** -- Implement `estimate_initial_diff()` and integrate into the first-share handler. Test with simulated rapid share submission.
12. **Reconnect memory** -- Implement the worker diff memory hash table and Redis persistence. Test: connect, wait for stable diff, disconnect, reconnect, verify diff restored.
13. **Metrics collection** -- Create `metrics.c` / `metrics.h` with the `ckpool_metrics_t` struct. Add increment/decrement calls at hook points throughout `stratifier.c`, `connector.c`, `generator.c`.
14. **HTTP metrics endpoint** -- Implement the metrics thread with socket bind on :9100. Write `format_metrics()` for Prometheus text format. Write `test_metrics.c`.
15. **Prometheus + Grafana** -- Add Docker services, create `prometheus.yml`, create Grafana provisioning configs and dashboard JSON.
16. **Integration tests** -- Write and run `test_vardiff_rampup.py`, `test_vardiff_reconnect.py`, `test_health_metrics.py`.

### Week 3: AsicBoost + Final Testing + Polish

17. **AsicBoost detection** -- Implement `check_asicboost()` in `stratifier.c`. Add per-client tracking fields. Write `test_asicboost.c`.
18. **AsicBoost event emission** -- Emit `asicboost_detected` event on first detection. Add `asicboost` field to `miner_connected` event. Update event collector schemas.
19. **AsicBoost metrics integration** -- Increment/decrement `asicboost_miners` gauge.
20. **Integration test** -- Write and run `test_asicboost.py`.
21. **Run ALL tests** -- Run the complete test suite: all Phase 2 existing tests + all Phase 3 unit tests + all Phase 3 integration tests. Fix any regressions.
22. **Performance benchmarks** -- Run VarDiff ramp-up timing, metrics endpoint latency, coinbase sig cache lookup, and bech32m decode benchmarks. Verify they meet targets.
23. **Documentation** -- Update event schemas doc, configuration doc. Commit Grafana dashboard JSON.
24. **Final verification** -- `docker compose down && docker compose up --build` from scratch. Verify the entire stack comes up healthy, metrics are scraped, and the Grafana dashboard shows data.

**Critical: Verify existing Phase 1/2 tests still pass after EVERY major change. Do not accumulate breakage.**

---

## Definition of Done

1. **Taproot addresses (bc1p...) are accepted** by ckpool for miner authorization. Shares are validated and the coinbase output uses the correct P2TR script. Verified with cpuminer on signet using a Taproot address.
2. **Custom coinbase signatures work.** Setting `user_coinbase:{address}` in Redis causes the coinbase transaction to include `/TheBitcoinGame:CustomText/`. Verified on signet by mining a block and inspecting the coinbase.
3. **VarDiff fast ramp-up works.** A simulated high-hashrate miner reaches optimal difficulty within 60 seconds (not minutes).
4. **VarDiff reconnect memory works.** Disconnect a miner, reconnect within 24 hours, and the difficulty is restored to the previous stable value instead of starting from `startdiff`.
5. **VarDiff EMA + dead band works.** Difficulty does not oscillate when the share rate is within 20% of target. Adjustments are smooth and dampened.
6. **Health endpoint returns valid Prometheus metrics** on `:9100/metrics`. All declared metrics are present, counters are monotonically increasing, gauges reflect current state.
7. **Prometheus scrapes ckpool metrics** every 15 seconds. Data is visible in the Prometheus UI at `:9090`.
8. **Grafana dashboard shows basic ckpool metrics** with auto-provisioned panels. Accessible at `:3000` with no manual configuration.
9. **AsicBoost detection is logged** when a miner uses version rolling. The `asicboost_detected` event is emitted and received by the event collector. The `miner_connected` event includes the `asicboost` field.
10. **All 8 unit test suites pass** (bech32m, p2tr, address, coinbase_sig, coinbase, vardiff, metrics, asicboost).
11. **All 6 integration tests pass** on the signet Docker stack (taproot_mining, coinbase_sig, vardiff_rampup, vardiff_reconnect, health_metrics, asicboost).
12. **All existing Phase 1 and Phase 2 tests still pass.** No regressions.
13. **Performance targets met**: VarDiff ramp-up < 60s, metrics latency < 5ms, sig cache lookup < 1us, bech32m decode < 10us.
14. **Docker Compose stack starts cleanly** with `docker compose up --build` including the new Prometheus and Grafana services.
15. **Event collector handles all new event types** without errors. New events are published to Redis Streams and persisted to TimescaleDB.
