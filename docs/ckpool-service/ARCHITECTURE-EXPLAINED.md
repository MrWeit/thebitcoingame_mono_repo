# TheBitcoinGame CKPool Service -- Architecture Explained

Comprehensive technical reference for the mining engine layer of TheBitcoinGame.
Covers every service, every file, every event hook, and every design decision.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Docker Stack Architecture](#2-docker-stack-architecture)
  - [2.1 Service Map](#21-service-map)
  - [2.2 Data Flow](#22-data-flow)
  - [2.3 Volumes](#23-volumes)
  - [2.4 Health Checks and Startup Order](#24-health-checks-and-startup-order)
- [3. CKPool Patching System](#3-ckpool-patching-system)
  - [3.1 How It Works](#31-how-it-works)
  - [3.2 Version Pinning (UPSTREAM.lock)](#32-version-pinning-upstreamlock)
  - [3.3 The 8 Event Hooks](#33-the-8-event-hooks)
  - [3.4 Event Emission C Code](#34-event-emission-c-code)
  - [3.5 Patched Files Summary](#35-patched-files-summary)
- [4. Event Collector (Python)](#4-event-collector-python)
  - [4.1 collector.py -- Main Service](#41-collectorpy----main-service)
  - [4.2 schemas.py -- Event Type Definitions](#42-schemaspy----event-type-definitions)
  - [4.3 redis_publisher.py -- Stream and PUB/SUB](#43-redis_publisherpy----stream-and-pubsub)
  - [4.4 db_writer.py -- Batch Insert to TimescaleDB](#44-db_writerpy----batch-insert-to-timescaledb)
  - [4.5 config.py -- Environment Configuration](#45-configpy----environment-configuration)
- [5. Database Schema (init.sql)](#5-database-schema-initsql)
  - [5.1 Tables](#51-tables)
  - [5.2 Hypertables](#52-hypertables)
  - [5.3 Compression and Retention](#53-compression-and-retention)
  - [5.4 Continuous Aggregates](#54-continuous-aggregates)
  - [5.5 Seed Data](#55-seed-data)
- [6. GPL Compliance](#6-gpl-compliance)
- [7. Dockerfile Build Process](#7-dockerfile-build-process)
  - [7.1 CKPool Dockerfile (Multi-Stage)](#71-ckpool-dockerfile-multi-stage)
  - [7.2 Event Collector Dockerfile](#72-event-collector-dockerfile)
- [8. Configuration Reference](#8-configuration-reference)
  - [8.1 ckpool-signet.conf](#81-ckpool-signetconf)
  - [8.2 Event Collector Environment Variables](#82-event-collector-environment-variables)
- [9. File Reference](#9-file-reference)

---

## 1. Overview

TheBitcoinGame is a gamification platform built on top of real Bitcoin mining. The mining engine layer is responsible for:

1. Running a Bitcoin node on signet (test network) for development
2. Running a modified ckpool-solo instance that speaks the Stratum V1 protocol to miners
3. Emitting real-time JSON events for every meaningful mining action (shares, blocks, connections, difficulty changes)
4. Collecting those events and fanning them out to Redis (real-time) and TimescaleDB (persistence)

**The key architectural insight** is the use of a Unix domain socket as the bridge between GPL-licensed C code (ckpool) and proprietary Python code (event collector, game engine, frontend). The ckpool process sends fire-and-forget UDP-style datagrams over a `SOCK_DGRAM` Unix socket. The event collector binds that socket as a separate OS process. There is zero linking, zero shared memory, and zero function calls between the two codebases. This keeps the GPL boundary clean: all C modifications to ckpool are open source under GPLv3, while everything downstream (event collector, API, game engine, frontend) can use any license.

```
                        GPL BOUNDARY
                             |
  +-----------+    Stratum   |  +----------+   Unix Socket   +------------------+
  |   Miner   | ----------->|  |  ckpool  | --------------> | Event Collector  |
  | (Bitaxe,  |   TCP:3333  |  |   (C)    |   SOCK_DGRAM    |    (Python)      |
  |  cpuminer)|             |  +----------+                 +--------+---------+
  +-----------+             |       |                            |         |
                             |       v                           v         v
                             |  Bitcoin Core              Redis Streams  TimescaleDB
                             |  (signet RPC)              (real-time)   (persistence)
```

---

## 2. Docker Stack Architecture

### 2.1 Service Map

The full stack is defined in `services/docker-compose.yml` and consists of 5 services:

| Service | Image | Purpose | Ports |
|---|---|---|---|
| **bitcoin-signet** | `lncm/bitcoind:v27.0` | Bitcoin Core on the signet test network. Provides RPC for block template and submission. ZMQ for real-time block/tx notifications. | 38332 (RPC), 28332 (ZMQ hashblock) |
| **ckpool** | Custom build from `./ckpool/Dockerfile` | Modified ckpool-solo mining engine. Accepts Stratum V1 connections from miners, validates shares, submits blocks. Emits JSON events via Unix socket. | 3333 (Stratum) |
| **redis** | `redis:7-alpine` | Event streams (Redis Streams) for real-time consumers. PUB/SUB channel for block-found notifications. AOF persistence enabled. | 6379 |
| **timescaledb** | `timescale/timescaledb:latest-pg16` | PostgreSQL 16 with TimescaleDB extension. Stores shares as a hypertable with automatic compression and retention policies. | 5432 |
| **event-collector** | Custom build from `./event-collector/Dockerfile` | Python 3.12 async service. Binds the Unix socket, receives ckpool events, validates with Pydantic, fans out to Redis + TimescaleDB. | None (internal) |

### 2.2 Data Flow

```
Miner (Bitaxe, cpuminer, etc.)
  |
  | Stratum V1 (TCP port 3333)
  v
ckpool (C process)
  |
  |-- Bitcoin Core RPC (38332): getblocktemplate, submitblock
  |
  |-- Unix DGRAM socket (/tmp/ckpool/events.sock): JSON events
  v
Event Collector (Python process)
  |
  |-- Redis XADD --> mining:share_submitted, mining:block_found, etc.
  |-- Redis PUBLISH --> blocks:found (PUB/SUB, block events only)
  |
  |-- PostgreSQL INSERT --> mining_events (all events)
  |-- PostgreSQL INSERT --> shares (share_submitted events only)
  v
Downstream consumers (future: FastAPI, Game Engine, WebSocket gateway)
```

### 2.3 Volumes

| Volume | Shared Between | Purpose |
|---|---|---|
| `bitcoin-signet-data` | bitcoin-signet only | Bitcoin blockchain data (~500MB for signet) |
| `ckpool-logs` | ckpool only | CKPool log files (`/var/log/ckpool`) |
| `ckpool-run` | ckpool only | CKPool runtime socket (`/var/run/ckpool`) |
| `ckpool-events` | ckpool + event-collector | **The bridge volume.** Contains the Unix socket file at `/tmp/ckpool/events.sock`. Both containers mount this volume so they share the socket filesystem. |
| `redis-data` | redis only | Redis AOF persistence |
| `timescaledb-data` | timescaledb only | PostgreSQL data directory |

### 2.4 Health Checks and Startup Order

The startup dependency chain ensures services come up in the correct order:

```
bitcoin-signet (healthcheck: bitcoin-cli getblockchaininfo)
  |
  v
ckpool (depends_on: bitcoin-signet healthy)
  |
  +--> redis (healthcheck: redis-cli ping)
  |      |
  +--> timescaledb (healthcheck: pg_isready)
         |
         v
  event-collector (depends_on: redis healthy, timescaledb healthy)
```

The event collector starts *before* ckpool needs it -- it binds the Unix socket and waits. If the collector is not running when ckpool starts, ckpool silently drops events (the `sendto()` call with `MSG_DONTWAIT` returns an error that is intentionally ignored).

---

## 3. CKPool Patching System

### 3.1 How It Works

We do **not** maintain a full fork of ckpool. Instead, we clone the official upstream repository at a pinned commit and apply targeted patches using `sed` injection at specific anchor points in the source code. This makes upstream upgrades manageable -- we only need to verify that our anchor points still exist in the new version.

The patch pipeline:

```
1. Clone upstream ckpool at PINNED commit (88e99e0b...)
2. Verify SHA256 checksums of the 3 files we modify
3. Run apply-patches.sh, which uses sed to inject C code
4. Build with autotools (autogen.sh + configure + make)
```

Three source files are modified:

| File | What We Add |
|---|---|
| `src/ckpool.h` | One new field in `struct ckpool_instance`: `char *event_socket_path` |
| `src/ckpool.c` | One line in the config parser: `json_get_string(&ckp->event_socket_path, ...)` |
| `src/stratifier.c` | ~150 lines of event emission code + 8 hook insertions |
| `src/bitcoin.c` | Add `"signet"` to GBT request rules and `understood_rules[]` array (signet network support) |

### 3.2 Version Pinning (UPSTREAM.lock)

The file `patches/UPSTREAM.lock` is the integrity anchor for the entire patching system. It contains:

```bash
CKPOOL_REPO=https://bitbucket.org/ckolivas/ckpool.git
CKPOOL_COMMIT=88e99e0b6fc7e28796c8450b42fa00070b66c6e3
CKPOOL_VERSION=1.0
CKPOOL_DATE=2025-01-15

# SHA256 checksums of the unmodified source files we patch
SHA256_STRATIFIER=4dfa73d4184d64cdd709a0794c6e3e54bf4c94a620cc6afa8cbb80d5c5ddd583
SHA256_CKPOOL_H=5e9efeaeacceb2a396db6df9af572a23458feb60556d4c8793642c4102236101
SHA256_CKPOOL_C=9121501b257836ab3d259c99e617e3be6685c7723a4dc3ad80883e8df46eaa49
SHA256_BITCOIN_C=435d9363f11282608466cab4df5ceff592a114bf95f8817c4c7463db589662c1
```

**Before any patching occurs**, `apply-patches.sh` verifies the SHA256 of all 4 source files against these checksums. If ckpool has been updated and the files have changed, the script refuses to apply patches with a detailed error message explaining how to re-verify and update.

**Updating the lock file** when upgrading ckpool:

```bash
# 1. Clone the new ckpool version
git clone https://bitbucket.org/ckolivas/ckpool.git /tmp/ckpool-new
cd /tmp/ckpool-new && git checkout <new-commit>

# 2. Manually verify all 8 hook anchor points still exist
# 3. Test that apply-patches.sh works (with TBG_SKIP_VERIFY=1)
# 4. Verify the build compiles and passes tests

# 5. Regenerate the lock file
./patches/update-lock.sh /tmp/ckpool-new
```

**Escape hatch** for development/testing:

```bash
export TBG_SKIP_VERIFY=1
./patches/apply-patches.sh /path/to/ckpool
# WARNING: Patches may apply to wrong locations
```

### 3.3 The 8 Event Hooks

Each hook is a single line of C code injected at a specific anchor point in `stratifier.c`. The anchor is identified by a unique string match (e.g., a log message or variable assignment that only appears once or at a known occurrence).

| # | Hook | Anchor Point | What It Captures |
|---|---|---|---|
| 1 | **Init** | `sdata->ckp = ckp;` | Calls `tbg_init_events(ckp)` to create the Unix socket. Runs once at stratifier startup. |
| 2 | **Share submitted** | After `check_best_diff(...)` call | Emits `share_submitted` with user, worker, diff, sdiff, accepted=1. Fires on every valid share. |
| 3 | **Best diff** | Before `user->best_diff = sdiff` | Emits `share_best_diff` with new_best and prev_best. Fires when a user beats their all-time best difficulty. |
| 4 | **Block found (unnamed)** | `"Solved and confirmed block!"` | Emits `block_found` with user="pool". Pool-wide block notification (when the block solver is not identified by name). |
| 5 | **Block found (named)** | `"Solved and confirmed block %d"` | Emits `block_found` with the actual user and worker who found the block. |
| 6 | **New network block** | `"Block hash changed to"` | Emits `new_block_network` with hash, height, diff. Fires when the Bitcoin network produces a new block. |
| 7 | **Client disconnect** | 2nd occurrence of `__del_client(sdata, client);` | Emits `miner_disconnected` with user, worker, IP. Fires when a miner drops their Stratum connection. |
| 8 | **Miner authorized** | After `client->authorised = ret` | Emits `miner_connected` (only if `ret` is true) with user, worker, IP, initial_diff. |

**Hook insertion technique**: Each hook is inserted using `sed` relative to its anchor line. Hooks are inserted either on the line after the anchor (`a\` in sed) or on the line before (`i\`). The best-diff hook uses `i\` (insert before) because we need to capture the *old* value of `user->best_diff` before the assignment overwrites it.

### 3.4 Event Emission C Code

The event emission system is a self-contained block of ~150 lines of C code injected into `stratifier.c` before the first `static` declaration. It consists of:

**Core infrastructure:**

```c
static int tbg_event_fd = -1;              // Socket file descriptor
static struct sockaddr_un tbg_event_addr;  // Target address struct
static int tbg_active = 0;                 // Guard flag

static void tbg_init_events(ckpool_t *ckp)
{
    const char *path = "/tmp/ckpool/events.sock";
    if (ckp && ckp->event_socket_path)
        path = ckp->event_socket_path;

    tbg_event_fd = socket(AF_UNIX, SOCK_DGRAM, 0);
    // Set non-blocking
    int fl = fcntl(tbg_event_fd, F_GETFL, 0);
    if (fl >= 0) fcntl(tbg_event_fd, F_SETFL, fl | O_NONBLOCK);
    // Configure target address
    memset(&tbg_event_addr, 0, sizeof(tbg_event_addr));
    tbg_event_addr.sun_family = AF_UNIX;
    strncpy(tbg_event_addr.sun_path, path, sizeof(...) - 1);
    tbg_active = 1;
}

static void tbg_emit(const char *buf, int len)
{
    if (!tbg_active || tbg_event_fd < 0 || len <= 0) return;
    sendto(tbg_event_fd, buf, len, MSG_DONTWAIT,
           (struct sockaddr *)&tbg_event_addr, sizeof(tbg_event_addr));
    // Return value intentionally ignored -- fire and forget
}
```

**Key design decisions:**

- **SOCK_DGRAM** (datagram, not stream): Each event is a self-contained message. No framing, no buffering, no partial reads. The receiver gets the complete JSON or nothing.
- **MSG_DONTWAIT**: The `sendto()` call never blocks. If the collector is not running or the socket buffer is full, the event is silently dropped. This ensures ckpool's mining performance is never impacted by the event system.
- **Non-blocking fd**: The socket file descriptor itself is set to `O_NONBLOCK` as a defense-in-depth measure alongside `MSG_DONTWAIT`.
- **No acknowledgment**: ckpool never waits for a response. This is a one-way data flow by design.

**Helper functions (6 total):**

| Function | Event Type | Key Fields |
|---|---|---|
| `tbg_emit_share()` | `share_submitted` | user, worker, diff, sdiff, accepted |
| `tbg_emit_connect()` | `miner_connected` | user, worker, ip, initial_diff |
| `tbg_emit_disconnect()` | `miner_disconnected` | user, worker, ip |
| `tbg_emit_block()` | `block_found` | user, worker, height, diff, network_diff |
| `tbg_emit_newblock()` | `new_block_network` | hash, height, diff |
| `tbg_emit_bestdiff()` | `share_best_diff` | user, worker, new_best, prev_best, timeframe |

**Every event includes `"source": "hosted"`**. This field is future-proofing for decentralized mining support, where users running their own pools will submit events with `"source": "proxy"` or `"source": "self-hosted"`. The game engine can then apply different trust levels and verification requirements based on the source.

**Example emitted JSON:**

```json
{
  "event": "share_submitted",
  "ts": 1708617600.123456,
  "source": "hosted",
  "data": {
    "user": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
    "worker": "bitaxe-01",
    "diff": 1.00000000,
    "sdiff": 2.50000000,
    "accepted": true
  }
}
```

### 3.5 Patched Files Summary

```
ckpool.h:       +1 line   (event_socket_path field in struct)
ckpool.c:       +1 line   (config parser for event_socket_path)
stratifier.c:   ~150 lines (event code block) + 8 lines (hooks)
                Total: ~160 lines of C added to the entire codebase
```

---

## 4. Event Collector (Python)

The event collector is a standalone Python 3.12 async service located at `services/event-collector/`. It is licensed as proprietary (not GPL) because it runs as a separate process with no linking dependency on ckpool.

### 4.1 collector.py -- Main Service

The `EventCollector` class is the orchestrator. Its lifecycle:

```
start()
  |-> connect to Redis (redis.asyncio)
  |-> connect to TimescaleDB (asyncpg connection pool, 2-10 connections)
  |-> start periodic DB flush (background asyncio task)
  |-> bind Unix DGRAM socket at /tmp/ckpool/events.sock
  |-> enter receive loop
        |
        | (for each datagram)
        |-> decode UTF-8 JSON
        |-> validate with Pydantic via parse_event()
        |-> fan out concurrently:
        |     |-> Redis: XADD to stream (+ PUBLISH for blocks)
        |     |-> DB: add to write batch
        |-> log stats every 100 events
        |
stop()
  |-> close socket, unlink socket file
  |-> flush remaining DB batch
  |-> close Redis, close DB pool
```

**Error handling**: JSON decode failures and Pydantic validation failures are logged and counted but do not crash the service. Socket errors trigger a 100ms backoff. The service handles SIGTERM and SIGINT for graceful shutdown.

**Socket binding**: The collector creates the socket file and sets permissions to `0o666` so the ckpool process (potentially running as a different user) can write to it. If a stale socket file exists from a previous run, it is removed before binding.

### 4.2 schemas.py -- Event Type Definitions

Eight event types are defined as a `str` enum:

```python
class EventType(str, Enum):
    SHARE_SUBMITTED    = "share_submitted"
    BLOCK_FOUND        = "block_found"
    MINER_CONNECTED    = "miner_connected"
    MINER_DISCONNECTED = "miner_disconnected"
    DIFF_UPDATED       = "diff_updated"
    HASHRATE_UPDATE    = "hashrate_update"
    NEW_BLOCK_NETWORK  = "new_block_network"
    SHARE_BEST_DIFF    = "share_best_diff"
```

Each event type has a corresponding Pydantic model for its `data` payload:

| Model | Key Fields |
|---|---|
| `ShareSubmittedData` | user, worker, client_id, diff, sdiff, accepted, reject_reason, ip |
| `BlockFoundData` | user, worker, height, hash, diff, network_diff, reward_sats, coinbase_sig |
| `MinerConnectedData` | user, worker, client_id, ip, useragent, initial_diff |
| `MinerDisconnectedData` | user, worker, client_id, ip, session_duration, shares_session |
| `DiffUpdatedData` | user, worker, client_id, old_diff, new_diff |
| `HashrateUpdateData` | user, worker, hashrate_1m, hashrate_5m, hashrate_1h, hashrate_1d |
| `NewBlockNetworkData` | height, hash, diff, prev_hash |
| `ShareBestDiffData` | user, worker, new_best, prev_best, timeframe |

All fields have safe defaults (e.g., `user="unknown"`, `diff=0.0`), so partial events from ckpool are accepted gracefully. The `parse_event()` function validates the outer envelope (`BaseEvent`) and then validates the inner `data` dict against the appropriate model if the event type is recognized. Unknown event types are passed through without data validation, providing forward compatibility.

### 4.3 redis_publisher.py -- Stream and PUB/SUB

Events are published to Redis Streams using `XADD`:

```
Stream key pattern: mining:{event_type}
Examples:
  mining:share_submitted
  mining:block_found
  mining:miner_connected
```

Each stream entry contains:

```
{
  "event": "share_submitted",
  "ts": "1708617600.123456",
  "source": "hosted",
  "data": "{\"user\":\"tb1q...\",\"diff\":1.0,...}"  // JSON string
}
```

**Stream capping**: Each stream is capped at approximately 100,000 entries using `MAXLEN ~ 100000` (the `~` enables approximate trimming for better performance -- Redis may keep slightly more entries to avoid trimming on every write).

**Block found special handling**: `block_found` events are rare and critical. In addition to the normal stream write, they are also published to a Redis PUB/SUB channel named `blocks:found`. This allows instant push notification to subscribers without polling.

```python
async def publish_block_found(self, event: BaseEvent) -> None:
    await self.publish(event)                      # Normal stream write
    await self._client.publish("blocks:found", json.dumps(event.model_dump()))  # PUB/SUB
```

### 4.4 db_writer.py -- Batch Insert to TimescaleDB

The DB writer uses batch INSERT for performance. Events are accumulated in memory and flushed to the database either:

1. When the batch reaches **500 events** (configurable via `BATCH_MAX_SIZE`), or
2. Every **1 second** (configurable via `BATCH_FLUSH_INTERVAL`), whichever comes first.

**Two tables are written to:**

| Table | Events Written | Write Method |
|---|---|---|
| `mining_events` | All events | `INSERT INTO mining_events (ts, event_type, source, payload)` |
| `shares` | `share_submitted` only | `INSERT INTO shares (time, btc_address, worker_name, difficulty, share_diff, is_valid, ip_address, source)` |

**Retry logic**: If a batch write fails (e.g., database temporarily unavailable), the failed batch is prepended back to the current batch for retry on the next flush cycle. To prevent unbounded memory growth, retried events are only re-queued if the total batch size is below `2 * BATCH_MAX_SIZE`.

**Connection pool**: Uses `asyncpg.create_pool()` with `min_size=2, max_size=10` connections.

### 4.5 config.py -- Environment Configuration

Configuration is a frozen dataclass that reads all values from environment variables at startup:

```python
@dataclass(frozen=True)
class Config:
    socket_path: str          # SOCKET_PATH, default: /tmp/ckpool/events.sock
    redis_url: str            # REDIS_URL, default: redis://localhost:6379/0
    database_url: str         # DATABASE_URL, default: postgresql://tbg:tbgdev2026@localhost:5432/thebitcoingame
    log_level: str            # LOG_LEVEL, default: INFO
    batch_flush_interval: float  # BATCH_FLUSH_INTERVAL, default: 1.0
    batch_max_size: int       # BATCH_MAX_SIZE, default: 500
    redis_stream_maxlen: int  # REDIS_STREAM_MAXLEN, default: 100000
    socket_buffer_size: int   # Fixed: 65536 (64KB, max datagram size)
```

---

## 5. Database Schema (init.sql)

The schema is defined in `services/event-collector/sql/init.sql` and is auto-executed on first container start via Docker's `docker-entrypoint-initdb.d/` mechanism.

### 5.1 Tables

| Table | Purpose | Key Columns |
|---|---|---|
| **users** | One row per miner, identified by BTC address | `btc_address` (unique), `display_name`, `country_code`, `last_seen`, `is_verified` |
| **workers** | One row per physical mining device | `user_id` (FK), `worker_name`, hashrate fields (1m/5m/1h/24h), `is_online`, `source` |
| **shares** | One row per submitted share (hypertable) | `time`, `btc_address`, `worker_name`, `difficulty`, `share_diff`, `is_valid`, `is_block`, `source` |
| **blocks** | One row per found block | `block_height`, `block_hash`, `user_id` (FK), `reward_btc`, `difficulty`, `confirmed`, `coinbase_sig`, `source` |
| **weekly_best_diff** | Tracks weekly best difficulty per user | `btc_address`, `week_start`, `best_difficulty`, `total_shares` |
| **mining_events** | Raw event log for debugging/replay (hypertable) | `ts`, `event_type`, `source`, `payload` (JSONB) |

### 5.2 Hypertables

Two tables are converted to TimescaleDB hypertables for efficient time-series storage:

```sql
-- Shares: chunked by day
SELECT create_hypertable('shares', 'time',
    chunk_time_interval => INTERVAL '1 day');

-- Mining events: chunked by day
SELECT create_hypertable('mining_events', 'ts',
    chunk_time_interval => INTERVAL '1 day');
```

### 5.3 Compression and Retention

| Table | Compression After | Retention Period | Segment By | Order By |
|---|---|---|---|---|
| **shares** | 7 days | 90 days | `btc_address` | `time DESC` |
| **mining_events** | 3 days | 30 days | `event_type` | `ts DESC` |

Compression policies automatically compress old chunks to reduce storage. Retention policies automatically drop data older than the specified interval.

### 5.4 Continuous Aggregates

Two materialized views provide pre-computed rollups:

**hourly_shares** (refreshed every 1 hour, looking back 3 hours):

```sql
SELECT
    time_bucket('1 hour', time) AS bucket,
    btc_address,
    COUNT(*) AS total_shares,
    COUNT(*) FILTER (WHERE is_valid) AS accepted_shares,
    COUNT(*) FILTER (WHERE NOT is_valid) AS rejected_shares,
    MAX(share_diff) AS best_diff,
    AVG(share_diff) AS avg_diff
FROM shares
GROUP BY bucket, btc_address;
```

**daily_shares** (refreshed every 1 day, looking back 2 days):

```sql
SELECT
    time_bucket('1 day', time) AS bucket,
    btc_address,
    COUNT(*) AS total_shares,
    COUNT(*) FILTER (WHERE is_valid) AS accepted_shares,
    MAX(share_diff) AS best_diff
FROM shares
GROUP BY bucket, btc_address;
```

### 5.5 Seed Data

A default test user is inserted for development:

```sql
INSERT INTO users (btc_address, display_name, country_code)
VALUES ('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'Test Miner', 'US')
ON CONFLICT (btc_address) DO NOTHING;
```

This is the same signet address used in `ckpool-signet.conf`, so shares submitted by the test miner are automatically associated with this user.

---

## 6. GPL Compliance

CKPool is licensed under **GPLv3**. This has specific implications for our architecture:

**What must be open source (GPLv3):**
- All modifications to ckpool C source code (the patches in `patches/apply-patches.sh`)
- The ckpool binary itself and everything linked into it
- The `Dockerfile` and build scripts that produce the ckpool binary

**What is NOT a derivative work of ckpool:**
- The Event Collector (Python, separate process)
- The Game Engine (future, separate process)
- The Frontend (React, no connection to ckpool)
- The API layer (FastAPI, separate process)
- The database schema and data

**The legal basis** is the process boundary. The Unix domain socket is an inter-process communication mechanism, not linking. The event collector has zero compile-time or runtime dependency on any ckpool code. It communicates via a well-defined JSON protocol over a standard OS facility. This is the same pattern used by:

- **MySQL** (GPL) communicating with application servers (any license) via TCP sockets
- **Linux kernel** (GPL) running proprietary userspace programs via syscalls
- **GCC** (GPL) producing binaries from proprietary source code

The `event-collector/pyproject.toml` explicitly declares `license = {text = "Proprietary"}`, and `collector.py` includes a header comment: `License: Proprietary (separate process from GPL ckpool)`.

---

## 7. Dockerfile Build Process

### 7.1 CKPool Dockerfile (Multi-Stage)

Located at `services/ckpool/Dockerfile`. Two-stage build:

**Stage 1: Builder** (`ubuntu:22.04`)

```
1. Install build dependencies:
   build-essential, autoconf, automake, libtool, pkg-config,
   yasm, libjansson-dev, libcap2-bin, git

2. Clone official ckpool:
   git clone https://bitbucket.org/ckolivas/ckpool.git
   git checkout 88e99e0b6fc7e28796c8450b42fa00070b66c6e3

3. Copy patches/ directory into the build context

4. Run apply-patches.sh:
   - Verify SHA256 checksums of source files
   - Inject event emission code into stratifier.c
   - Add event_socket_path field to ckpool.h
   - Add config parser line to ckpool.c

5. Build:
   ./autogen.sh
   ./configure --prefix=/opt/ckpool --without-ckdb
   make -j$(nproc)

6. Manual binary copy (instead of make install):
   cp src/ckpool src/ckpmsg src/notifier /build/install/opt/ckpool/bin/
```

**Why manual copy instead of `make install`**: The `make install` target in ckpool tries to run `setcap` to grant network capabilities to the binary. This requires elevated privileges that are not available inside a Docker build. Since Docker containers already run with the necessary capabilities, we skip this step entirely.

**Stage 2: Runtime** (`ubuntu:22.04`)

```
1. Install runtime dependencies only:
   libjansson4, libcap2-bin

2. Copy built binaries from builder stage

3. Create directories:
   /var/log/ckpool, /var/run/ckpool, /tmp/ckpool, /etc/ckpool

4. Expose ports: 3333 (Stratum), 8080 (future health endpoint)

5. Entrypoint: ckpool
   CMD: -c /etc/ckpool/ckpool-signet.conf -s /var/run/ckpool -l 7 -S
```

**Command-line flags:**
- `-c`: Config file path
- `-s`: Socket directory for ckpool's internal IPC
- `-l 7`: Log level 7 (maximum verbosity for development)
- `-S`: Solo mining mode

### 7.2 Event Collector Dockerfile

Located at `services/event-collector/Dockerfile`. Single-stage build:

```dockerfile
FROM python:3.12-slim

# Install asyncpg build dependencies
RUN apt-get install -y gcc libpq-dev

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

RUN mkdir -p /tmp/ckpool

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

CMD ["python", "-m", "src.collector"]
```

Dependencies: `redis[hiredis]>=5.0`, `asyncpg>=0.29`, `pydantic>=2.5`

---

## 8. Configuration Reference

### 8.1 ckpool-signet.conf

Located at `services/ckpool/config/ckpool-signet.conf`:

```json
{
    "btcd": [{
        "url": "bitcoin-signet:38332",
        "auth": "tbg",
        "pass": "tbgdev2026",
        "notify": true
    }],
    "btcaddress": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
    "btcsig": "/TheBitcoinGame-dev/",
    "blockpoll": 500,
    "donation": 0.0,
    "serverurl": ["0.0.0.0:3333"],
    "mindiff": 1,
    "startdiff": 1,
    "maxdiff": 0,
    "update_interval": 30,
    "version_mask": "1fffe000",
    "nonce1length": 4,
    "nonce2length": 8,
    "logdir": "/var/log/ckpool",
    "maxclients": 1000
}
```

| Field | Value | Purpose |
|---|---|---|
| `btcd.url` | `bitcoin-signet:38332` | Bitcoin Core RPC endpoint (Docker service name) |
| `btcd.auth/pass` | `tbg/tbgdev2026` | RPC credentials |
| `btcaddress` | `tb1qw508d...` | Default payout address (signet testnet) |
| `btcsig` | `/TheBitcoinGame-dev/` | Custom string embedded in coinbase transactions |
| `blockpoll` | `500` | Check for new blocks every 500ms |
| `donation` | `0.0` | No donation to ckpool author (solo mining) |
| `mindiff` | `1` | Minimum share difficulty (low for signet dev) |
| `startdiff` | `1` | Initial share difficulty for new connections |
| `maxdiff` | `0` | No maximum difficulty cap (VarDiff adjusts freely) |
| `update_interval` | `30` | VarDiff recalculation interval in seconds |
| `maxclients` | `1000` | Maximum simultaneous Stratum connections |

### 8.2 Event Collector Environment Variables

Set in `docker-compose.yml` under the `event-collector` service:

| Variable | Docker Compose Value | Default | Description |
|---|---|---|---|
| `SOCKET_PATH` | `/tmp/ckpool/events.sock` | `/tmp/ckpool/events.sock` | Unix socket where ckpool sends events |
| `REDIS_URL` | `redis://redis:6379/0` | `redis://localhost:6379/0` | Redis connection string |
| `DATABASE_URL` | `postgresql://tbg:tbgdev2026@timescaledb:5432/thebitcoingame` | `postgresql://tbg:tbgdev2026@localhost:5432/thebitcoingame` | TimescaleDB connection string |
| `LOG_LEVEL` | `DEBUG` | `INFO` | Python logging level |
| `BATCH_FLUSH_INTERVAL` | `1.0` | `1.0` | Seconds between DB batch flushes |
| `BATCH_MAX_SIZE` | `500` | `500` | Events per DB batch before forced flush |
| `REDIS_STREAM_MAXLEN` | `100000` | `100000` | Max entries per Redis stream (~MAXLEN) |

---

## 9. File Reference

### services/docker-compose.yml

Top-level Docker Compose file defining all 5 services, 6 volumes, health checks, and startup dependencies.

### services/ckpool/

| File | Description |
|---|---|
| `Dockerfile` | Multi-stage Docker build: clones upstream ckpool, applies patches, builds binary, creates minimal runtime image |
| `README.md` | Project overview, quick start guide, upstream comparison table |
| `CHANGELOG.md` | Version history (currently v0.1.0 -- initial event emission system) |
| `LICENSE` | GNU General Public License v3.0 (full text) |
| `.gitignore` | Ignores `ckpool-patched/` directory (cloned upstream, for local inspection only) |
| `config/ckpool-signet.conf` | CKPool configuration for Bitcoin signet: RPC credentials, Stratum settings, difficulty params |
| `patches/apply-patches.sh` | Main patching script: SHA256 verification, sed-based C code injection into 3 ckpool source files |
| `patches/UPSTREAM.lock` | Version pin: git commit hash + SHA256 checksums of the 3 files we patch |
| `patches/update-lock.sh` | Regenerates UPSTREAM.lock from a clean (unpatched) ckpool checkout |
| `ckpool-patched/` | Git clone of upstream ckpool (in .gitignore, for local development/inspection only) |

### services/event-collector/

| File | Description |
|---|---|
| `Dockerfile` | Python 3.12-slim image with asyncpg build deps, installs requirements, runs collector |
| `README.md` | Event collector overview, architecture diagram, configuration table, usage instructions |
| `pyproject.toml` | Python project metadata: name, version, dependencies (redis, asyncpg, pydantic), dev deps (pytest) |
| `requirements.txt` | Pinned runtime + dev dependencies for pip install |
| `src/__init__.py` | Package marker (empty) |
| `src/collector.py` | Main service: Unix socket binding, async receive loop, JSON parsing, Pydantic validation, fan-out to Redis + DB |
| `src/schemas.py` | 8 event type definitions as Pydantic models, `parse_event()` validator, `EventType` enum |
| `src/redis_publisher.py` | Redis Streams writer (XADD with MAXLEN), PUB/SUB publisher for block_found events |
| `src/db_writer.py` | Batch INSERT writer for TimescaleDB: mining_events table (all events) + shares table (shares only), periodic flush, retry logic |
| `src/config.py` | Frozen dataclass config loaded from environment variables |
| `sql/init.sql` | TimescaleDB schema: 6 tables, 2 hypertables, compression policies, retention policies, 2 continuous aggregates, seed data |
| `tests/__init__.py` | Test package marker (empty) |
| `tests/test_schemas.py` | Unit tests for event parsing: all event types, defaults, unknown events, source field |
| `tests/test_collector.py` | Integration tests: config loading from env vars, Unix DGRAM socket round-trip, non-blocking send behavior |
