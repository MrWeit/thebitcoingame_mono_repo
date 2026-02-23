# Prompt: CKPool Service — Phase 5 (Production Hardening)

You are hardening the mining engine service for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend mining engine (a fork of ckpool-solo, GPLv3, by Con Kolivas) has been built through Phases 1-4: core fork with event emission, comprehensive test suite, enhanced features (VarDiff, Prometheus metrics, coinbase signatures, ASICBoost), and multi-instance geo-distribution with NATS replication.

Phase 5 introduces **zero new features**. Every change is about making existing features **safe, fast, observable, and recoverable** for mainnet production deployment.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. The mining engine lives at `services/ckpool/`. The event collector lives at `services/event-collector/`. The Docker Compose stack lives at `services/docker-compose.yml`.

---

## IMPORTANT CONSTRAINTS

1. **macOS development machine** — ckpool is Linux-only (epoll, Unix-specific syscalls). ALL ckpool building and running MUST happen inside Docker containers. Do NOT attempt to build ckpool natively on macOS.
2. **GPLv3 compliance** — All C code modifications to ckpool MUST remain GPLv3. The event collector (Python), monitoring configs, and infrastructure tooling are separate processes — they are NOT GPL.
3. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
4. **No corners cut on security** — This phase protects real Bitcoin. Every input validation rule, every rate limit, every hardening flag is mandatory. Do not skip any item in the security checklist.
5. **Mainnet configuration in this phase** — Phase 5 creates mainnet-ready configs. However, actual mainnet deployment only begins at the internal testing stage (Stage 1 of gradual rollout). Signet remains the default for development.
6. **Docker-first production** — Production deployment uses Docker (multi-stage builds, minimal images). Kubernetes manifests are optional but Docker Compose production config is mandatory.

---

## Before You Start — Read These Files (in order)

1. `docs/ckpool-service/00-master-plan.md` — Architecture overview, communication flows, event system design. Your primary reference.
2. `docs/ckpool-service/roadmap/phase-05-production.md` — The detailed Phase 5 specification. This is the authoritative source for everything in this phase.
3. `docs/ckpool-service/roadmap/phase-04-multi-instance.md` — Phase 4 context (what was built: multi-region, NATS, relay/primary architecture).
4. `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` — Phase 3 context (VarDiff, Prometheus metrics, ASICBoost detection).
5. `docs/ckpool-service/open-source/events.md` — Full event system documentation with JSON schemas.
6. `docs/ckpool-service/open-source/configuration.md` — Configuration reference.
7. `docs/ckpool-service/open-source/architecture.md` — Technical architecture of the fork.

Read ALL of these before writing any code. Phase 5 touches every layer of the stack.

---

## What You Are Building

### Part 1: Security Hardening of C Code

#### 1.1 Compiler Hardening Flags

Modify the ckpool build system (Makefile / Dockerfile) to enable all hardening flags for the production build:

```makefile
# Production hardening flags
CFLAGS += -fstack-protector-strong    # Stack canaries on all functions with buffers
CFLAGS += -D_FORTIFY_SOURCE=2         # Buffer overflow detection at runtime
CFLAGS += -Wformat -Wformat-security  # Format string warnings as errors
CFLAGS += -fPIE                       # Position-independent executable
CFLAGS += -Werror=format-security     # Promote format warnings to errors
LDFLAGS += -pie                       # PIE linking
LDFLAGS += -Wl,-z,relro,-z,now       # Full RELRO (GOT write protection)
LDFLAGS += -Wl,-z,noexecstack        # Non-executable stack
```

These flags MUST be enabled in the production Docker build. The development build may keep them optional (behind a `HARDENED=1` make variable) to avoid slowing iteration, but the production Dockerfile MUST use them unconditionally.

#### 1.2 Input Validation on All Miner-Supplied Data

Add validation functions to `stratifier.c` (or a new `input_validation.c` / `input_validation.h` pair) and call them at every point where miner data enters the system. The validation matrix:

| Input | Source | Validation | Max Length | On Failure |
|---|---|---|---|---|
| Bitcoin address | `mining.authorize` | Full address decode + checksum verification (base58check for P2PKH/P2SH, bech32/bech32m for segwit) | 90 chars | Reject auth, disconnect |
| Worker name | `mining.authorize` (after `.` separator) | Alphanumeric + `_` + `-` + `.` only, no control chars | 128 chars | Reject auth, disconnect |
| Nonce | `mining.submit` | Hex string, exact 8 chars (32-bit) | 8 chars | Reject share |
| Nonce2 | `mining.submit` | Hex string, exact length matching `nonce2length` config | 16 chars (default) | Reject share |
| Job ID | `mining.submit` | Hex string, bounded length | 8 chars | Reject share |
| ntime | `mining.submit` | Hex string, 8 chars, value within +/- 7200s of current time | 8 chars | Reject share |
| Version bits | `mining.submit` | Hex string, value within `version_mask` | 8 chars | Reject share |
| User agent | `mining.subscribe` | Printable ASCII only (0x20-0x7E), no control characters | 256 chars | Truncate silently |
| JSON payload (any) | TCP socket | Well-formed JSON, single object, no nesting beyond depth 3 | 4096 bytes | Disconnect |

Implement these validation functions in C:

```c
/* Validate worker name: alphanumeric + _-. only */
static bool validate_worker_name(const char *name);

/* Validate hex string of exact expected length */
static bool validate_hex_string(const char *hex, size_t expected_len);

/* Validate hex string within a time range (for ntime) */
static bool validate_ntime(const char *ntime_hex, time_t current_time, int max_drift_seconds);

/* Validate JSON payload size and structure */
static bool validate_json_payload(const char *buf, size_t len, size_t max_size);

/* Validate Bitcoin address (bech32, bech32m, base58check) */
static bool validate_btc_address(const char *address);
```

Every validation failure MUST be logged at WARNING level with the client IP and the offending input (truncated to 64 chars to prevent log injection).

#### 1.3 Rate Limiting

Implement a token-bucket rate limiter in `stratifier.c` (or a new `rate_limit.c` / `rate_limit.h` pair):

| Resource | Limit | Window | Action on Exceed |
|---|---|---|---|
| New connections per IP | 10 | 60 seconds | Reject with TCP RST |
| Total concurrent connections per IP | 50 | N/A (concurrent) | Reject new connections |
| `mining.subscribe` per connection | 3 | 60 seconds | Disconnect |
| `mining.authorize` per connection | 5 | 60 seconds | Disconnect |
| `mining.submit` per connection | 1000 | 60 seconds | Soft-ban IP for 5 minutes |
| Invalid shares per connection | 100 | 60 seconds | Disconnect |
| Global total connections | 100,000 | Concurrent | Reject lowest-difficulty connections |

The rate limiter uses a hash map (uthash) keyed by IP address, with atomic counters for thread safety. A background cleanup thread removes stale entries every 60 seconds.

#### 1.4 Stratum Protocol Fuzzing

Create a fuzzing harness for AFL++ and libFuzzer:

1. Create `services/ckpool/fuzz/fuzz_stratum_parser.c` — libFuzzer target that feeds arbitrary bytes into the Stratum JSON-RPC parser
2. Create `services/ckpool/fuzz/fuzz_share_validation.c` — libFuzzer target for share validation logic
3. Create `services/ckpool/fuzz/fuzz_bech32.c` — libFuzzer target for bech32/bech32m address decoding
4. Create `services/ckpool/fuzz/corpus/` — Seed corpus with valid Stratum messages (subscribe, authorize, submit)
5. Create `services/ckpool/fuzz/Dockerfile.fuzz` — Docker image with AFL++ and ASAN instrumentation
6. Create `services/ckpool/fuzz/run_fuzz.sh` — Script to run fuzzing campaign (configurable duration, default 1 hour)

The fuzzing Dockerfile should:
- Build ckpool with `CC=afl-clang-fast CFLAGS="-fsanitize=address,undefined"`
- Include seed corpus
- Run AFL++ with `afl-fuzz -i corpus/ -o findings/ -m 512 -t 1000`

#### 1.5 Memory Safety Verification

Create a Valgrind testing script:

1. Create `services/ckpool/scripts/valgrind_test.sh` — Runs ckpool under Valgrind memcheck while cpuminer submits shares for 5 minutes, then gracefully shuts down and reports leaks
2. Create `services/ckpool/scripts/asan_build.sh` — Builds ckpool with AddressSanitizer (`-fsanitize=address`) for development testing

Any memory issues found MUST be fixed in the C source before proceeding.

---

### Part 2: Performance Optimization

#### 2.1 CPU Profiling

Create profiling tooling:

1. Create `services/ckpool/scripts/profile_cpu.sh` — Runs `perf record` on ckpool under simulated load, generates flame graph SVG
2. Create `services/ckpool/scripts/profile_memory.sh` — Runs Valgrind massif on ckpool, generates memory profile
3. Create `services/ckpool/Dockerfile.profile` — Docker image with `perf`, `flamegraph.pl`, Valgrind massif tools installed
4. Document expected CPU hotspots and optimizations applied in `services/ckpool/docs/performance.md`

Install FlameGraph tools (`stackcollapse-perf.pl`, `flamegraph.pl`) in the profiling Docker image.

#### 2.2 SHA256 Hardware Acceleration Verification

Add a startup check in ckpool that logs whether SHA256 hardware acceleration is available:

```c
/* Check for SHA-NI (x86_64) or Crypto Extensions (ARM) at startup */
static void check_sha256_support(void);
```

This is a detection + logging function only. If hardware SHA256 is not available, log a WARNING but continue with software SHA256. The check should run once at `ckpool` startup and emit a LOGNOTICE with the result.

#### 2.3 Event Emission Ring Buffer

Replace the current per-event `send()` on the Unix socket with a lock-free ring buffer + background flush thread:

```c
#define EVENT_RING_SIZE 4096  /* Must be power of 2 */

typedef struct event_ring {
    char events[EVENT_RING_SIZE][EVENT_MAX_SIZE];
    _Atomic uint32_t write_pos;
    _Atomic uint32_t read_pos;
} event_ring_t;
```

- Hot path (`emit_event_fast`): atomic write to ring buffer, zero syscalls
- Background thread: drains ring buffer every 0.1ms using `writev()` for batch sends
- Target: <1ms from share validation to event appearing on Unix socket

#### 2.4 Connection Scalability

Create Linux kernel tuning documentation and apply it in Docker:

1. Create `services/ckpool/config/sysctl.conf` — Kernel parameters for 100k connections:
   - `net.core.somaxconn = 65535`
   - `net.ipv4.tcp_max_syn_backlog = 65535`
   - `net.core.netdev_max_backlog = 65535`
   - `net.ipv4.tcp_tw_reuse = 1`
   - `net.ipv4.ip_local_port_range = 1024 65535`
   - File descriptor limit: 200,000

2. Create `services/load-test/` directory with a Stratum load testing tool:
   - `services/load-test/stratum_load_test.py` — Python script using `asyncio` to simulate thousands of Stratum miners
   - `services/load-test/Dockerfile` — Docker image for the load tester
   - `services/load-test/README.md` — Usage instructions
   - Target: simulate 10k+ miners, each submitting shares at configurable intervals

3. Document load test results template in `services/ckpool/docs/load-test-results.md`

#### 2.5 Memory Optimization

Implement pool allocators for hot-path allocations:

```c
/* Pool allocator: pre-allocate slabs for share structs and event buffers */
typedef struct memory_pool {
    void **free_list;
    size_t item_size;
    size_t items_per_slab;
    int total_allocated;
    int total_free;
    pthread_mutex_t lock;
} memory_pool_t;

static memory_pool_t share_pool;   /* Pre-allocated share structs */
static memory_pool_t event_pool;   /* Pre-allocated event buffers */
```

- `pool_init()`: pre-allocate initial slabs (cache-line aligned with `aligned_alloc(64, ...)`)
- `pool_alloc()`: O(1) allocation from free list, falls back to `aligned_alloc` if exhausted
- `pool_return()`: O(1) return to free list
- Target: <300MB total memory at 100k connections (down from estimated ~600MB)

---

### Part 3: Production Docker Configuration

#### 3.1 Production Dockerfile (Multi-Stage)

Create `services/ckpool/Dockerfile.production`:

```dockerfile
# Stage 1: Build
FROM ubuntu:22.04 AS builder
# Install build deps, compile with hardening flags
# ...

# Stage 2: Production runtime
FROM ubuntu:22.04-minimal AS runtime
# Copy ONLY the binary + minimal runtime deps
# No build tools, no git, no development headers
# Target: <100MB final image
```

Requirements:
- Multi-stage build: build stage has all dev tools, runtime stage has only the binary and minimal shared libraries
- Runtime stage uses a non-root user (`ckpool:ckpool`, UID 1000)
- Health check: HTTP GET to `/metrics` endpoint (Prometheus)
- Signal handling: `SIGTERM` for graceful shutdown
- Target image size: <100MB

#### 3.2 Production Docker Compose

Create `services/docker-compose.production.yml`:

- All services with resource limits (CPU, memory)
- Production ckpool config mounted
- Production bitcoin.conf for mainnet
- Secrets via environment variables (not hardcoded)
- Restart policies: `unless-stopped` for all services
- Network isolation: internal network for inter-service communication, only Stratum port (3333) and metrics port (9100) exposed
- Logging: JSON driver with max-size and max-file limits
- No published ports except Stratum (3333) and metrics (9100)

Resource limits:

| Service | CPU Limit | Memory Limit | Memory Reservation |
|---|---|---|---|
| ckpool | 4 cores | 4GB | 1GB |
| bitcoin-core | 4 cores | 16GB | 8GB |
| event-collector | 1 core | 1GB | 256MB |
| redis | 1 core | 2GB | 512MB |
| timescaledb | 2 cores | 8GB | 2GB |
| prometheus | 1 core | 2GB | 512MB |
| grafana | 0.5 core | 512MB | 256MB |

#### 3.3 Production CKPool Configuration

Create `services/ckpool/config/ckpool-mainnet.conf`:

```json
{
    "btcd": [{
        "url": "127.0.0.1:8332",
        "auth": "${BITCOIN_RPC_USER}",
        "pass": "${BITCOIN_RPC_PASS}",
        "notify": true
    }],
    "btcsig": "/TheBitcoinGame/",
    "blockpoll": 100,
    "donation": 0.0,
    "serverurl": ["0.0.0.0:3333"],
    "mindiff": 512,
    "startdiff": 10000,
    "maxdiff": 0,
    "update_interval": 30,
    "version_mask": "1fffe000",
    "nonce1length": 4,
    "nonce2length": 8,
    "logdir": "/var/log/tbg-mining",
    "zmqblock": "tcp://127.0.0.1:28332",
    "maxclients": 100000,
    "events": {
        "enabled": true,
        "socket_path": "/var/run/ckpool/events.sock",
        "include": ["share_submitted", "block_found", "miner_connected",
                     "miner_disconnected", "diff_updated", "hashrate_update",
                     "new_block_network", "share_best_diff", "asicboost_detected"]
    },
    "vardiff": {
        "target_share_interval": 10,
        "retarget_interval": 30,
        "ema_alpha": 0.3,
        "dampening": 0.5,
        "dead_band_percent": 20,
        "reconnect_memory_ttl": 86400
    },
    "metrics": {
        "enabled": true,
        "port": 9100,
        "path": "/metrics"
    },
    "rate_limits": {
        "connections_per_ip_per_minute": 10,
        "max_connections_per_ip": 50,
        "max_shares_per_minute": 1000,
        "max_invalid_shares_per_minute": 100
    }
}
```

Note: `${BITCOIN_RPC_USER}` and `${BITCOIN_RPC_PASS}` are placeholders. Create an `envsubst`-based entrypoint script that substitutes environment variables into the config at container startup.

#### 3.4 Production Bitcoin Core Configuration

Create `services/bitcoin-node/bitcoin-mainnet.conf`:

```ini
chain=main
server=1
txindex=1
prune=0

rpcuser=${BITCOIN_RPC_USER}
rpcpassword=${BITCOIN_RPC_PASS}
rpcallowip=127.0.0.1
rpcport=8332
rpcbind=127.0.0.1

zmqpubhashblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333

dbcache=8192
maxconnections=125
par=4
rpcthreads=8

# Security
disablewallet=1
```

#### 3.5 Secrets Management

Create `services/scripts/generate_secrets.sh`:

- Generates random 64-character passwords for Bitcoin RPC, TimescaleDB, Redis
- Outputs a `.env.production` template (NOT committed to git — add to `.gitignore`)
- Includes instructions for using Docker secrets or Vault in production

Create `services/.env.example`:

```env
# Copy to .env.production and fill in real values
BITCOIN_RPC_USER=ckpool_primary
BITCOIN_RPC_PASS=CHANGE_ME_64_CHAR_RANDOM
POSTGRES_USER=tbg
POSTGRES_PASSWORD=CHANGE_ME_64_CHAR_RANDOM
REDIS_PASSWORD=CHANGE_ME_64_CHAR_RANDOM
GRAFANA_ADMIN_PASSWORD=CHANGE_ME
```

---

### Part 4: Monitoring & Alerting Stack

#### 4.1 Prometheus Configuration

Create `services/monitoring/prometheus/prometheus.yml`:

- Scrape targets: ckpool (:9100), node-exporter (:9100), redis-exporter (:9121), postgres-exporter (:9187)
- Scrape interval: 15s for ckpool metrics, 30s for infrastructure metrics
- Retention: 30 days local, with remote_write to long-term storage (optional)
- Alert rules loaded from `alerts/` directory

Create `services/monitoring/prometheus/alerts/ckpool.yml` with these alert rules:

**CRITICAL alerts (page on-call immediately):**

| Alert | Expression | For | Description |
|---|---|---|---|
| CKPoolProcessDown | `up{job="ckpool"} == 0` | 30s | CKPool process is not running |
| BitcoinCoreDesync | `ckpool_bitcoin_connected == 0` | 60s | Bitcoin Core unreachable from CKPool |
| ZeroSharesReceived | `rate(ckpool_shares_total[5m]) == 0 AND ckpool_connected_miners > 0` | 5m | No shares despite connected miners |
| BlockSubmitFailed | `increase(ckpool_block_submit_failures_total[1h]) > 0` | 0s | Block found but submission to Bitcoin Core failed |

**WARNING alerts (Slack notification):**

| Alert | Expression | For | Description |
|---|---|---|---|
| HighEventLatency | `histogram_quantile(0.99, ckpool_event_emit_latency_us) > 5000` | 5m | P99 event latency above 5ms |
| HighInvalidShareRate | `rate(ckpool_shares_total{valid="false"}[5m]) / rate(ckpool_shares_total[5m]) > 0.05` | 10m | Invalid share rate above 5% |
| RelayTemplateDelay | `ckpool_relay_template_latency_ms > 500` | 5m | Template sync to relay exceeds 500ms |
| HighMemoryUsage | `ckpool_memory_bytes / 1024^3 > 3` | 10m | CKPool memory above 3GB |
| RelayIndependentMode | `ckpool_relay_independent_mode == 1` | 60s | Relay operating without primary |
| RedisStreamBackup | `redis_stream_length{stream=~"mining:.*"} > 500000` | 5m | Redis stream backing up |
| DBReplicationLag | `pg_replication_lag_seconds > 30` | 5m | TimescaleDB replication lag >30s |
| HighConnectionRate | `rate(ckpool_connections_total[1m]) > 1000` | 2m | Possible DDoS (>1000 new connections/min) |

Create `services/monitoring/prometheus/alerts/bitcoin.yml` with Bitcoin Core alerts:

| Alert | Expression | For | Description |
|---|---|---|---|
| BitcoinCoreBehind | `bitcoin_blocks - bitcoin_headers > 2` | 5m | Bitcoin Core more than 2 blocks behind |
| BitcoinCorePeerLow | `bitcoin_peer_count < 3` | 10m | Bitcoin Core has fewer than 3 peers |

#### 4.2 Grafana Dashboards

Create provisioned Grafana dashboards as JSON:

**Dashboard 1: `services/monitoring/grafana/dashboards/ckpool-overview.json`**

| Panel | Type | Description |
|---|---|---|
| Connected Miners | Stat | `sum(ckpool_connected_miners)` |
| Pool Hashrate | Time series | `sum(ckpool_hashrate_total)` over time |
| Blocks Found (all time) | Stat | `sum(ckpool_blocks_found_total)` |
| Share Rate | Time series | `sum(rate(ckpool_shares_total[5m]))` |
| Invalid Share % | Gauge | Invalid / total shares percentage |
| Event Emission Latency | Heatmap | `ckpool_event_emit_latency_us` histogram |
| Regional Distribution | Pie chart | `ckpool_connected_miners` by `region` label |

**Dashboard 2: `services/monitoring/grafana/dashboards/ckpool-regional.json`**

| Panel | Type | Description |
|---|---|---|
| Region Health | Status map | `up{job="ckpool"}` by region |
| Template Sync Latency | Time series | Per-region template sync times |
| Stale Share Rate | Time series | Per-region stale share percentage |
| NATS Replication Lag | Time series | Per-region NATS lag |
| Independent Mode Status | Status light | Whether any relay is in independent mode |

**Dashboard 3: `services/monitoring/grafana/dashboards/bitcoin-core.json`**

| Panel | Type | Description |
|---|---|---|
| Block Height | Stat | Current block height |
| Sync Status | Status light | Connected or not |
| Mempool Size | Time series | Mempool transaction count |
| RPC Latency | Time series | Bitcoin Core RPC response time |
| Peer Count | Stat | Number of connected peers |

**Dashboard 4: `services/monitoring/grafana/dashboards/event-pipeline.json`**

| Panel | Type | Description |
|---|---|---|
| Redis Stream Lengths | Time series | Length of each `mining:*` stream |
| DB Write Latency | Time series | TimescaleDB insert latency |
| Collector Throughput | Time series | Events processed per second |
| Event Types Distribution | Pie chart | Breakdown by event type |
| Pipeline End-to-End Latency | Time series | Time from ckpool emit to DB persist |

Create Grafana provisioning configs:
- `services/monitoring/grafana/provisioning/datasources/prometheus.yml`
- `services/monitoring/grafana/provisioning/dashboards/dashboards.yml`

#### 4.3 Monitoring Docker Services

Add to `services/docker-compose.production.yml` (or create `services/docker-compose.monitoring.yml` as an override):

- `prometheus`: Prometheus server with config and alert rules mounted
- `grafana`: Grafana with provisioned dashboards and datasources
- `alertmanager`: Prometheus Alertmanager with routing config
- `node-exporter`: System metrics exporter
- `redis-exporter`: Redis metrics exporter (`oliver006/redis_exporter`)
- `postgres-exporter`: PostgreSQL metrics exporter (`prometheuscommunity/postgres-exporter`)

---

### Part 5: Backup & Recovery

#### 5.1 TimescaleDB Backup

Create `services/backup/timescaledb/`:

1. `backup.sh` — WAL archiving setup script using `pgBackRest` or `pg_basebackup`
2. `restore.sh` — Point-in-time recovery script
3. `verify_backup.sh` — Backup integrity verification (restore to temp instance, check row counts)
4. `cron/backup_schedule.sh` — Cron entries for:
   - Full backup: weekly (Sunday 02:00 UTC)
   - Differential backup: daily (02:00 UTC, except Sunday)
   - WAL archiving: continuous

For the development environment, back up to a local Docker volume. For production, document S3 configuration with pgBackRest.

#### 5.2 Redis Backup

Configure Redis RDB snapshots:
- Add `save 300 1` to Redis config (snapshot every 5 minutes if at least 1 key changed)
- Mount RDB file to a persistent volume
- Create `services/backup/redis/backup.sh` — copies RDB to timestamped backup location

#### 5.3 Configuration Backup

All configuration files are already in git. Create `services/backup/verify_config_in_git.sh`:
- Checks that all `.conf`, `.yml`, `.json` config files are tracked by git
- Warns about any untracked config files
- Verifies `.env.production` is in `.gitignore` (secrets must NOT be in git)

#### 5.4 Database Migration Scripts

Create `services/event-collector/sql/migrations/`:

1. `001_initial_schema.sql` — The current schema (copy from `init.sql`)
2. `migrate.sh` — Migration runner that:
   - Tracks applied migrations in a `schema_migrations` table
   - Applies pending migrations in order
   - Supports dry-run mode
   - Logs all migrations

#### 5.5 Disaster Recovery Documentation

Create `services/docs/disaster-recovery.md`:

Document recovery procedures for each failure scenario:

| Scenario | RTO | Procedure |
|---|---|---|
| CKPool process crash | <5 seconds | systemd/Docker auto-restart |
| Bitcoin Core crash | <5 minutes | Auto-restart, ckpool waits for reconnect |
| Primary server total loss | 24-48 hours | Relays serve miners independently while new primary is provisioned |
| TimescaleDB corruption | <1 hour | Restore from WAL archive using pgBackRest |
| Redis data loss | <5 minutes | Restart with last RDB snapshot, ckpool re-populates real-time data |
| Complete data center outage | <5 minutes per region | Relay nodes in other regions continue serving, DNS failover |

---

### Part 6: Gradual Rollout Plan (Documentation)

Create `services/docs/rollout-plan.md`:

Document the 4-stage rollout:

**Stage 1: Internal Testing (Team Only)**
- Duration: 3 days minimum
- Miners: 5-10 (team members)
- Gate to Stage 2: Zero crashes in 48h, all events flowing, dashboard displays real mainnet data

**Stage 2: Invite-Only Beta (50-100 miners)**
- Duration: 2 weeks minimum
- Mix of Bitaxe and ASIC miners
- Gate to Stage 3: Zero crashes in 2 weeks, <0.5% stale shares, block submission verified (if any found)

**Stage 3: Public Beta (1000+ miners)**
- Duration: 2 weeks minimum
- Open registration
- Gate to Stage 4: Zero crashes in 2 weeks, scalability validated, all alerts tuned, runbooks tested

**Stage 4: General Availability**
- No restrictions, marketing push

Include rollback procedure for each stage:
- Emergency shutdown commands
- Rollback to previous version
- DNS failover steps
- Communication template for users

---

### Part 7: Production Tests

#### 7.1 Chaos Engineering

Create `services/tests/chaos/`:

1. `kill_ckpool.sh` — Kills ckpool container, verifies Docker auto-restart within 5s
2. `kill_bitcoin.sh` — Kills Bitcoin Core, verifies ckpool logs error and waits for reconnect
3. `network_partition.sh` — Disconnects relay from primary (iptables), verifies relay enters independent mode
4. `disk_full.sh` — Fills disk, verifies ckpool continues mining (logging may stop)
5. `oom_test.sh` — Sets low memory limit, verifies OOM killer handles it gracefully
6. `clock_skew.sh` — Skews container clock, verifies share timestamps are off but no crash
7. `cpu_stress.sh` — Runs stress tool, verifies shares still processed (higher latency acceptable)
8. `corrupt_event_socket.sh` — Removes Unix socket file, verifies event emitter reconnects

Each script:
- Sets up the chaos condition
- Waits for expected behavior
- Verifies recovery
- Outputs PASS/FAIL with timing

Create `services/tests/chaos/run_all.sh` — Runs all chaos tests sequentially with a summary report.

#### 7.2 Load Testing

Create `services/load-test/`:

1. `stratum_load_test.py` — Async Python Stratum client simulator:
   - Configurable number of simulated miners (default: 10,000)
   - Configurable ramp-up time (default: 300s)
   - Each miner: subscribe, authorize, submit shares at configurable interval
   - Measures: connection time, share RTT, error rate
   - Outputs: real-time metrics to stdout, final report as JSON
2. `run_load_test.sh` — Wrapper script with standard configurations:
   - Smoke test: 100 miners, 60s
   - Medium: 1,000 miners, 300s
   - Full: 10,000 miners, 3600s
3. `Dockerfile` — Docker image for load tester
4. `README.md` — Usage, interpreting results

#### 7.3 Penetration Test Checklist

Create `services/docs/pentest-checklist.md`:

| # | Test | Tool | Target | Expected Result |
|---|---|---|---|---|
| 1 | Port scan | nmap | All host ports | Only 3333 (Stratum) and 9100 (metrics) open |
| 2 | Stratum connection flood | Custom script | :3333 | Rate limiter kicks in at 10 conn/IP/min |
| 3 | Malformed JSON flood | Custom script | :3333 | No crash, connections closed |
| 4 | Oversized payload | Custom script | :3333 | Rejected at 4KB, connection closed |
| 5 | Auth bypass (empty address) | Custom script | :3333 | Rejected, disconnected |
| 6 | Auth bypass (invalid address) | Custom script | :3333 | Rejected, disconnected |
| 7 | Share replay attack | Custom script | :3333 | Duplicate share rejected |
| 8 | Log injection | Custom script | :3333 | Special chars sanitized in logs |
| 9 | TLS audit (NATS) | testssl.sh | :7422 | TLS 1.3, strong ciphers only |
| 10 | Dependency CVE scan | `trivy` | Docker images | No critical/high CVEs |

#### 7.4 Backup Recovery Test

Create `services/tests/backup/test_restore.sh`:

1. Start full stack, run load for 5 minutes
2. Record share count and latest block height
3. Stop TimescaleDB, take backup
4. Destroy TimescaleDB data volume
5. Restore from backup
6. Verify: share count matches, no data loss
7. Output PASS/FAIL

---

## Rules

1. **Read the Phase 5 roadmap doc first.** `docs/ckpool-service/roadmap/phase-05-production.md` is the authoritative specification. This prompt summarizes it — the roadmap doc has all the details.
2. **Docker everything.** ckpool does not build on macOS. All builds, tests, profiling, and fuzzing happen inside Docker.
3. **Don't modify `dashboard/`.** The frontend is done.
4. **GPLv3 compliance.** All C modifications carry the GPL header. Python/YAML/JSON files are not GPL.
5. **No hardcoded secrets.** All passwords, API keys, and tokens come from environment variables or Docker secrets. Never commit secrets to git.
6. **Every input validation is mandatory.** Do not skip any row in the validation matrix. Every miner-supplied field must be validated before use.
7. **Test everything.** Chaos tests, load tests, backup recovery, fuzzing — every test must exist and pass.
8. **Log security events.** All rate limit hits, validation failures, and suspicious activity must be logged at WARNING or higher.
9. **Keep signet as default.** The development stack (`docker-compose.yml`) continues to use signet. Mainnet configs are separate files.
10. **Minimal production images.** Production Docker images must be <100MB. No build tools, no git, no development headers in the runtime image.
11. **Document everything.** Every operational procedure, every alert, every recovery step must be documented. An on-call engineer at 3am should be able to follow the runbook.

---

## Files to Create

### Security

| Action | File |
|---|---|
| CREATE | `services/ckpool/src/input_validation.c` |
| CREATE | `services/ckpool/src/input_validation.h` |
| CREATE | `services/ckpool/src/rate_limit.c` |
| CREATE | `services/ckpool/src/rate_limit.h` |
| CREATE | `services/ckpool/fuzz/fuzz_stratum_parser.c` |
| CREATE | `services/ckpool/fuzz/fuzz_share_validation.c` |
| CREATE | `services/ckpool/fuzz/fuzz_bech32.c` |
| CREATE | `services/ckpool/fuzz/corpus/subscribe.json` |
| CREATE | `services/ckpool/fuzz/corpus/authorize.json` |
| CREATE | `services/ckpool/fuzz/corpus/submit.json` |
| CREATE | `services/ckpool/fuzz/Dockerfile.fuzz` |
| CREATE | `services/ckpool/fuzz/run_fuzz.sh` |
| CREATE | `services/ckpool/scripts/valgrind_test.sh` |
| CREATE | `services/ckpool/scripts/asan_build.sh` |

### Performance

| Action | File |
|---|---|
| CREATE | `services/ckpool/src/event_ring.c` |
| CREATE | `services/ckpool/src/event_ring.h` |
| CREATE | `services/ckpool/src/memory_pool.c` |
| CREATE | `services/ckpool/src/memory_pool.h` |
| CREATE | `services/ckpool/scripts/profile_cpu.sh` |
| CREATE | `services/ckpool/scripts/profile_memory.sh` |
| CREATE | `services/ckpool/Dockerfile.profile` |
| CREATE | `services/ckpool/config/sysctl.conf` |
| CREATE | `services/ckpool/docs/performance.md` |
| CREATE | `services/load-test/stratum_load_test.py` |
| CREATE | `services/load-test/run_load_test.sh` |
| CREATE | `services/load-test/Dockerfile` |
| CREATE | `services/load-test/requirements.txt` |
| CREATE | `services/load-test/README.md` |
| CREATE | `services/ckpool/docs/load-test-results.md` |

### Production Docker

| Action | File |
|---|---|
| CREATE | `services/ckpool/Dockerfile.production` |
| CREATE | `services/ckpool/docker-entrypoint.sh` |
| CREATE | `services/docker-compose.production.yml` |
| CREATE | `services/ckpool/config/ckpool-mainnet.conf` |
| CREATE | `services/bitcoin-node/bitcoin-mainnet.conf` |
| CREATE | `services/.env.example` |
| CREATE | `services/scripts/generate_secrets.sh` |

### Monitoring

| Action | File |
|---|---|
| CREATE | `services/monitoring/prometheus/prometheus.yml` |
| CREATE | `services/monitoring/prometheus/alerts/ckpool.yml` |
| CREATE | `services/monitoring/prometheus/alerts/bitcoin.yml` |
| CREATE | `services/monitoring/alertmanager/alertmanager.yml` |
| CREATE | `services/monitoring/grafana/dashboards/ckpool-overview.json` |
| CREATE | `services/monitoring/grafana/dashboards/ckpool-regional.json` |
| CREATE | `services/monitoring/grafana/dashboards/bitcoin-core.json` |
| CREATE | `services/monitoring/grafana/dashboards/event-pipeline.json` |
| CREATE | `services/monitoring/grafana/provisioning/datasources/prometheus.yml` |
| CREATE | `services/monitoring/grafana/provisioning/dashboards/dashboards.yml` |
| CREATE | `services/monitoring/docker-compose.monitoring.yml` |

### Backup & Recovery

| Action | File |
|---|---|
| CREATE | `services/backup/timescaledb/backup.sh` |
| CREATE | `services/backup/timescaledb/restore.sh` |
| CREATE | `services/backup/timescaledb/verify_backup.sh` |
| CREATE | `services/backup/timescaledb/cron/backup_schedule.sh` |
| CREATE | `services/backup/redis/backup.sh` |
| CREATE | `services/backup/verify_config_in_git.sh` |
| CREATE | `services/event-collector/sql/migrations/001_initial_schema.sql` |
| CREATE | `services/event-collector/sql/migrations/migrate.sh` |

### Documentation

| Action | File |
|---|---|
| CREATE | `services/docs/disaster-recovery.md` |
| CREATE | `services/docs/rollout-plan.md` |
| CREATE | `services/docs/pentest-checklist.md` |
| CREATE | `services/docs/runbooks/ckpool-down.md` |
| CREATE | `services/docs/runbooks/bitcoin-core-desync.md` |
| CREATE | `services/docs/runbooks/block-submit-failed.md` |
| CREATE | `services/docs/runbooks/high-event-latency.md` |

### Tests

| Action | File |
|---|---|
| CREATE | `services/tests/chaos/kill_ckpool.sh` |
| CREATE | `services/tests/chaos/kill_bitcoin.sh` |
| CREATE | `services/tests/chaos/network_partition.sh` |
| CREATE | `services/tests/chaos/disk_full.sh` |
| CREATE | `services/tests/chaos/oom_test.sh` |
| CREATE | `services/tests/chaos/clock_skew.sh` |
| CREATE | `services/tests/chaos/cpu_stress.sh` |
| CREATE | `services/tests/chaos/corrupt_event_socket.sh` |
| CREATE | `services/tests/chaos/run_all.sh` |
| CREATE | `services/tests/backup/test_restore.sh` |

### Existing Files to Modify

| Action | File | Change |
|---|---|---|
| EDIT | `services/ckpool/Makefile` | Add hardening flags, fuzzing targets, ASAN build target |
| EDIT | `services/ckpool/Dockerfile` | Add production build variant with hardening flags |
| EDIT | `services/ckpool/src/stratifier.c` | Add input validation calls, rate limiting hooks, ring buffer integration, pool allocator usage |
| EDIT | `services/ckpool/src/ckpool.c` | Add SHA256 hardware detection at startup |
| EDIT | `services/ckpool/src/ckpool.h` | Add rate_limit and input_validation includes, event_ring config struct fields |
| EDIT | `services/docker-compose.yml` | Add monitoring services for development |
| EDIT | `services/event-collector/sql/init.sql` | Add `schema_migrations` table |
| EDIT | `services/.gitignore` | Add `.env.production`, `findings/` (fuzzer output), `*.rdb` |

---

## Definition of Done

1. **ckpool builds with all hardening flags enabled** — `docker build -f Dockerfile.production .` succeeds with `-fstack-protector-strong`, `-D_FORTIFY_SOURCE=2`, PIE, full RELRO
2. **AFL++ fuzzing runs for 1 hour with no crashes** — `run_fuzz.sh` completes with zero crashes in the findings directory
3. **Valgrind reports no memory leaks in modified code** — `valgrind_test.sh` shows "no leaks are possible" for all TBG-modified code paths
4. **Production Docker images are minimal** — ckpool production image is <100MB (`docker images` output)
5. **All input validation rules enforced** — Every row in the validation matrix has a corresponding validation function called before the input is used
6. **Rate limiting works** — Connecting >10 times per minute from one IP results in rejected connections (testable with the load tester)
7. **Grafana dashboards display all key metrics** — All 4 dashboards load in Grafana with real data from the development stack
8. **Alert rules fire correctly** — Killing the ckpool container triggers CKPoolProcessDown critical alert within 30 seconds
9. **Database backup and restore works** — `test_restore.sh` passes: backup, destroy, restore, verify data integrity
10. **Load test at 10k miners passes** — `stratum_load_test.py` with 10,000 simulated miners runs for 1 hour with no crashes, <100ms P99 event latency, <0.5% error rate
11. **Chaos tests all pass** — `run_all.sh` reports PASS for all 8 chaos scenarios
12. **Secrets not in git** — `git grep -l "password\|secret\|CHANGE_ME"` returns zero results in non-example files
13. **Production deployment documentation is complete** — `disaster-recovery.md`, `rollout-plan.md`, and all runbooks are written
14. **Mainnet configuration is ready** — `ckpool-mainnet.conf` and `bitcoin-mainnet.conf` are created with appropriate production values

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Input validation functions** — Write `input_validation.c/h`, add validation calls to `stratifier.c`. This is the highest-priority security work.
2. **Rate limiting** — Write `rate_limit.c/h`, integrate into connection handling and share submission paths.
3. **Compiler hardening** — Update Makefile/Dockerfile with hardening flags, verify ckpool builds and passes existing tests.
4. **Fuzzing harness** — Create fuzzing targets, Dockerfile, seed corpus. Run initial 1-hour campaign. Fix any crashes found.
5. **Valgrind/ASAN testing** — Run Valgrind memcheck and ASAN build. Fix any memory issues.
6. **Event ring buffer** — Replace per-event `send()` with ring buffer + flush thread. Benchmark latency improvement.
7. **Memory pool allocator** — Implement pool allocator for hot-path allocations. Benchmark memory reduction.
8. **CPU profiling** — Profile under load, generate flame graph, apply any obvious optimizations.
9. **Production Docker** — Create multi-stage Dockerfile.production, production Docker Compose, mainnet configs.
10. **Monitoring stack** — Prometheus config, Grafana dashboards, alert rules. Deploy in dev stack and verify.
11. **Backup system** — TimescaleDB WAL archiving, Redis snapshots, migration framework. Test backup+restore.
12. **Load testing** — Create Stratum load tester, run at 10k miners. Fix any issues found.
13. **Chaos testing** — Create and run all 8 chaos scenarios. Fix any recovery issues.
14. **Documentation** — Disaster recovery, rollout plan, runbooks, pentest checklist.
15. **Final integration test** — Full stack with monitoring, run load test + chaos test simultaneously, verify everything holds.

**Critical: Steps 1-5 (security) must be completed before steps 9+ (production deployment). Never deploy unhardened code to production.**
