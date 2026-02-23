# Phase 1 — Core Fork & Event System

| Field        | Value                                  |
| ------------ | -------------------------------------- |
| **Duration** | 4 weeks                                |
| **Status**   | Not Started                            |
| **Owner**    | TBD                                    |
| **Depends**  | Phase 0 — Foundation & Research        |
| **Blocks**   | Phase 2 — Testing Infrastructure       |

---

## 1.1 Objectives

1. **Implement a non-blocking event emission system** in the ckpool C code that pushes structured JSON events to a Unix domain socket on every meaningful mining event.
2. **Enhance difficulty tracking** by adding per-user session, weekly, and all-time best-diff fields, plus weekly share counters.
3. **Customize the coinbase signature** so every block mined through The Bitcoin Game carries a branded OP_RETURN or coinbase string.
4. **Build the Event Collector** — a Python asyncio service that reads from the Unix socket, enriches events, and fans them out to Redis Streams and TimescaleDB.
5. **Define and freeze the event schema** for all 8 event types so downstream services can build against a stable contract.

---

## 1.2 Architecture Overview

```mermaid
graph LR
    subgraph "GPL Boundary (C, open-source)"
        CK["ckpool-solo fork<br/><small>stratifier.c / generator.c</small>"]
    end

    subgraph "Proprietary Boundary (Python)"
        EC["Event Collector<br/><small>asyncio Unix socket</small>"]
        RS["Redis Streams"]
        TS["TimescaleDB"]
        API["FastAPI Backend"]
    end

    CK -- "Unix Domain Socket<br/>SOCK_DGRAM, non-blocking<br/>JSON datagrams" --> EC
    EC -- "XADD per event type" --> RS
    EC -- "Bulk INSERT (hypertable)" --> TS
    RS -- "XREADGROUP" --> API

    style CK fill:#1a1a2e,stroke:#f7931a,color:#fff
    style EC fill:#0d1117,stroke:#58a6ff,color:#fff
    style RS fill:#0d1117,stroke:#ff6b6b,color:#fff
    style TS fill:#0d1117,stroke:#a371f7,color:#fff
```

> **GPL boundary**: The Unix domain socket is the clean interface between GPL-licensed C code and proprietary Python code. The C side emits fire-and-forget datagrams. The Python side is a completely separate process with no linking dependency on ckpool.

---

## 1.3 C Code Modifications — Event Emission

All C modifications live in the existing ckpool-solo source files. No new `.c` files are added (to minimize fork divergence). New helper functions are added at the top of `stratifier.c`.

### 1.3.1 Event Emitter Initialization

```c
/* --- stratifier.c — new static globals --- */

static int event_fd = -1;                /* Unix datagram socket fd */
static struct sockaddr_un event_addr;    /* target address */
static bool event_enabled = false;       /* master switch */

/*
 * init_event_emitter() — called once from stratifier() entry point.
 *
 * Creates a SOCK_DGRAM Unix domain socket in non-blocking mode.
 * If the socket path does not exist (collector not running), events
 * are silently dropped — mining is never affected.
 */
static void init_event_emitter(ckpool_t *ckp)
{
    const char *path = ckp->event_socket_path;

    if (!path || !strlen(path)) {
        LOGWARNING("Event emission disabled (no socket path configured)");
        return;
    }

    event_fd = socket(AF_UNIX, SOCK_DGRAM, 0);
    if (event_fd < 0) {
        LOGWARNING("Failed to create event socket: %s", strerror(errno));
        return;
    }

    /* Non-blocking — sendto() must never block the stratum loop */
    int flags = fcntl(event_fd, F_GETFL, 0);
    fcntl(event_fd, F_SETFL, flags | O_NONBLOCK);

    memset(&event_addr, 0, sizeof(event_addr));
    event_addr.sun_family = AF_UNIX;
    strncpy(event_addr.sun_path, path, sizeof(event_addr.sun_path) - 1);

    event_enabled = true;
    LOGNOTICE("Event emitter initialized: %s", path);
}
```

### 1.3.2 Event Emission Function

```c
/*
 * emit_event() — fire-and-forget JSON datagram.
 *
 * Guarantees:
 *   - Never blocks (O_NONBLOCK + SOCK_DGRAM)
 *   - Never crashes (all failures are logged and swallowed)
 *   - Never allocates heap memory on the hot path (stack buffer)
 *   - Max datagram size: 4096 bytes (well within Unix DGRAM limit)
 */
#define EVENT_BUF_SIZE 4096

static void emit_event(const char *event_type, const char *payload_json)
{
    char buf[EVENT_BUF_SIZE];
    struct timeval tv;
    int len;

    if (!event_enabled || event_fd < 0)
        return;

    gettimeofday(&tv, NULL);

    len = snprintf(buf, sizeof(buf),
        "{\"event\":\"%s\",\"ts\":%ld.%06ld,%s}",
        event_type,
        (long)tv.tv_sec, (long)tv.tv_usec,
        payload_json);

    if (len <= 0 || len >= (int)sizeof(buf)) {
        LOGWARNING("Event too large or format error: %s", event_type);
        return;
    }

    ssize_t sent = sendto(event_fd, buf, len, 0,
                          (struct sockaddr *)&event_addr,
                          sizeof(event_addr));
    if (sent < 0) {
        /* EAGAIN/EWOULDBLOCK = collector behind, ENOENT = collector not running.
         * Both are expected and non-fatal. Log at debug level only. */
        if (errno != EAGAIN && errno != EWOULDBLOCK && errno != ENOENT &&
            errno != ECONNREFUSED)
            LOGWARNING("Event send failed (%s): %s", event_type, strerror(errno));
    }
}
```

### 1.3.3 Hook Points in stratifier.c

The following table maps each mining event to its hook location, the existing ckpool function, and the `emit_event()` call to insert.

| Event Type            | Hook Function          | Location in stratifier.c         | Trigger Condition                                |
|-----------------------|------------------------|----------------------------------|--------------------------------------------------|
| `share_submitted`     | `add_submit()`         | After share validation           | Every accepted/rejected share                    |
| `block_found`         | `test_block_solve()`   | After successful block detection | `hash <= network_target`                         |
| `miner_connected`     | `parse_subscribe()`    | After subscription accepted      | New stratum connection authorized                |
| `miner_disconnected`  | `__del_client()`       | Client cleanup                   | Socket close / timeout                           |
| `diff_updated`        | VarDiff code block     | After difficulty retarget        | New diff assigned to stratum_instance            |
| `hashrate_update`     | Rolling stats section  | Periodic hashrate recalculation  | Every `update_interval` seconds                  |
| `new_block_network`   | `update_base()`        | New workbase from generator      | Bitcoin network produced a new block             |
| `share_best_diff`     | `add_submit()`         | After best-diff comparison       | Share diff > user's previous best (any timeframe)|

#### Detailed Hook: `add_submit()`

```c
/* Inside add_submit(), after share validation and diff comparison */

static void add_submit(ckpool_t *ckp, stratum_instance_t *client,
                       /* ... existing params ... */)
{
    /* ... existing share validation logic ... */

    /* === EVENT: share_submitted === */
    {
        char payload[EVENT_BUF_SIZE - 128];
        snprintf(payload, sizeof(payload),
            "\"user\":\"%s\","
            "\"worker\":\"%s\","
            "\"client_id\":%" PRId64 ","
            "\"diff\":%.8f,"
            "\"sdiff\":%.8f,"  /* share actual difficulty */
            "\"accepted\":%s,"
            "\"reject_reason\":\"%s\","
            "\"ip\":\"%s\"",
            user->username,
            client->worker_instance->workername,
            client->id,
            client->diff,
            sdiff,
            result ? "true" : "false",
            result ? "" : reject_reason,
            client->address);
        emit_event("share_submitted", payload);
    }

    /* === EVENT: share_best_diff (conditional) === */
    if (sdiff > user->best_diff_alltime) {
        user->best_diff_alltime = sdiff;
        char payload[EVENT_BUF_SIZE - 128];
        snprintf(payload, sizeof(payload),
            "\"user\":\"%s\","
            "\"worker\":\"%s\","
            "\"new_best\":%.8f,"
            "\"prev_best\":%.8f,"
            "\"timeframe\":\"alltime\"",
            user->username,
            client->worker_instance->workername,
            sdiff, prev_best);
        emit_event("share_best_diff", payload);
    }

    /* ... existing code continues ... */
}
```

#### Detailed Hook: `test_block_solve()`

```c
/* Inside test_block_solve(), after successful block detection */

/* === EVENT: block_found === */
{
    char payload[EVENT_BUF_SIZE - 128];
    snprintf(payload, sizeof(payload),
        "\"user\":\"%s\","
        "\"worker\":\"%s\","
        "\"height\":%d,"
        "\"hash\":\"%s\","
        "\"diff\":%.8f,"
        "\"network_diff\":%.8f,"
        "\"reward_sats\":%" PRId64 ","
        "\"coinbase_sig\":\"%s\"",
        user->username,
        client->worker_instance->workername,
        wb->height,
        blockhash,
        sdiff,
        wb->diff,
        wb->coinbasevalue,
        ckp->btcsig);
    emit_event("block_found", payload);
}
```

### 1.3.4 All Hook Implementations — Summary

```mermaid
graph TD
    subgraph "stratifier.c Hook Points"
        A["parse_subscribe()"] -->|"miner_connected"| E["emit_event()"]
        B["add_submit()"] -->|"share_submitted<br/>share_best_diff"| E
        C["test_block_solve()"] -->|"block_found"| E
        D["__del_client()"] -->|"miner_disconnected"| E
        F["vardiff retarget"] -->|"diff_updated"| E
        G["rolling stats"] -->|"hashrate_update"| E
        H["update_base()"] -->|"new_block_network"| E
    end

    E --> S["Unix Socket<br/>(SOCK_DGRAM)"]
    S --> EC["Event Collector<br/>(Python)"]

    style E fill:#f7931a,stroke:#fff,color:#000
```

---

## 1.4 Enhanced Difficulty Tracking

### 1.4.1 New Fields in `user_instance_t`

```c
typedef struct user_instance {
    /* ... existing fields ... */

    /* --- The Bitcoin Game additions --- */
    double   best_diff_session;     /* best diff since last connect */
    double   best_diff_week;        /* best diff this ISO week */
    double   best_diff_alltime;     /* best diff ever (replaces vanilla best_diff) */
    int64_t  total_shares_week;     /* shares submitted this ISO week */
    int      current_week;          /* ISO week number for reset detection */
} user_instance_t;
```

### 1.4.2 Weekly Reset Logic

```c
/*
 * check_weekly_reset() — called at the top of add_submit().
 * Resets weekly counters when the ISO week number changes.
 */
static void check_weekly_reset(user_instance_t *user)
{
    time_t now = time(NULL);
    struct tm tm;
    gmtime_r(&now, &tm);

    char week_buf[8];
    strftime(week_buf, sizeof(week_buf), "%G%V", &tm); /* e.g., "202608" */
    int current_week = atoi(week_buf);

    if (user->current_week != current_week) {
        /* Emit the closing weekly stats before reset */
        if (user->current_week > 0) {
            char payload[EVENT_BUF_SIZE - 128];
            snprintf(payload, sizeof(payload),
                "\"user\":\"%s\","
                "\"week\":%d,"
                "\"best_diff_week\":%.8f,"
                "\"total_shares_week\":%" PRId64,
                user->username,
                user->current_week,
                user->best_diff_week,
                user->total_shares_week);
            emit_event("weekly_summary", payload);
        }

        user->best_diff_week = 0.0;
        user->total_shares_week = 0;
        user->current_week = current_week;
    }
}
```

### 1.4.3 Diff Comparison Cascade

On every share submission, the share difficulty (`sdiff`) is compared against three tiers:

```
sdiff > best_diff_session?  → update, emit share_best_diff (timeframe=session)
sdiff > best_diff_week?     → update, emit share_best_diff (timeframe=week)
sdiff > best_diff_alltime?  → update, emit share_best_diff (timeframe=alltime)
```

This enables the frontend to show "Personal Best!" celebrations at each tier.

---

## 1.5 Coinbase Signature Customization

### 1.5.1 Modifications to `build_coinbase()` in generator.c

The coinbase transaction's scriptSig field allows up to 100 bytes of arbitrary data. ckpool already writes the block height (required by BIP34) and `btcsig` from the config. We extend this to support dynamic per-user signatures.

```c
/*
 * Modified section of build_coinbase() in generator.c
 *
 * Format: /height/btcsig/username/
 * Example: /850001/The Bitcoin Game/satoshi.worker1/
 *
 * Total must fit in 100 bytes of scriptSig.
 */
static void build_coinbase(ckpool_t *ckp, workbase_t *wb)
{
    /* ... existing height encoding ... */

    char sig[96];
    int sig_len;

    if (ckp->btcsig && strlen(ckp->btcsig)) {
        /* Base signature from config */
        sig_len = snprintf(sig, sizeof(sig), "%s", ckp->btcsig);
    } else {
        sig_len = snprintf(sig, sizeof(sig), "/The Bitcoin Game/");
    }

    /* Append to coinb1 after height push */
    /* ... existing coinbase assembly ... */
}
```

### 1.5.2 Configuration

```json
{
    "btcsig": "/The Bitcoin Game/",
    "btcsig_max_len": 40,
    "btcsig_include_username": true
}
```

---

## 1.6 Event Collector Service (Python)

The Event Collector is a standalone Python asyncio service that runs as a separate process. It has **zero** linking dependency on ckpool (GPL boundary is the Unix socket).

### 1.6.1 Architecture

```mermaid
graph TD
    subgraph "Event Collector Process"
        UDS["Unix Socket Listener<br/><small>asyncio datagram protocol</small>"]
        VAL["Schema Validator<br/><small>msgspec / pydantic</small>"]
        ENR["Enricher<br/><small>add pool metadata</small>"]
        FAN["Fan-out"]
    end

    CK["ckpool<br/>(C process)"] -- "SOCK_DGRAM" --> UDS
    UDS --> VAL
    VAL --> ENR
    ENR --> FAN
    FAN --> RS["Redis Streams<br/><small>XADD per event type</small>"]
    FAN --> TS["TimescaleDB<br/><small>batch INSERT</small>"]
    FAN --> MET["Prometheus Metrics<br/><small>event counters</small>"]

    style CK fill:#1a1a2e,stroke:#f7931a,color:#fff
    style RS fill:#0d1117,stroke:#ff6b6b,color:#fff
    style TS fill:#0d1117,stroke:#a371f7,color:#fff
```

### 1.6.2 Core Implementation

```python
"""
event_collector.py — Async Unix socket listener for ckpool events.

Reads JSON datagrams from ckpool, validates schema, enriches with
pool metadata, and fans out to Redis Streams + TimescaleDB.
"""

import asyncio
import json
import logging
import time
from typing import Any

import msgspec
import redis.asyncio as redis

logger = logging.getLogger("event_collector")


# --- Event Schema (msgspec for zero-copy decoding) ---

class BaseEvent(msgspec.Struct, tag_field="event"):
    ts: float
    event: str


class ShareSubmitted(BaseEvent, tag="share_submitted"):
    user: str
    worker: str
    client_id: int
    diff: float
    sdiff: float
    accepted: bool
    reject_reason: str = ""
    ip: str = ""


class BlockFound(BaseEvent, tag="block_found"):
    user: str
    worker: str
    height: int
    hash: str
    diff: float
    network_diff: float
    reward_sats: int
    coinbase_sig: str = ""


class MinerConnected(BaseEvent, tag="miner_connected"):
    user: str
    worker: str
    client_id: int
    ip: str
    useragent: str = ""
    initial_diff: float = 1.0


class MinerDisconnected(BaseEvent, tag="miner_disconnected"):
    user: str
    worker: str
    client_id: int
    ip: str
    session_duration: float = 0.0
    shares_session: int = 0


class DiffUpdated(BaseEvent, tag="diff_updated"):
    user: str
    worker: str
    client_id: int
    old_diff: float
    new_diff: float


class HashrateUpdate(BaseEvent, tag="hashrate_update"):
    user: str
    worker: str
    hashrate_1m: float
    hashrate_5m: float
    hashrate_1h: float
    hashrate_1d: float = 0.0


class NewBlockNetwork(BaseEvent, tag="new_block_network"):
    height: int
    hash: str
    diff: float
    prev_hash: str = ""


class ShareBestDiff(BaseEvent, tag="share_best_diff"):
    user: str
    worker: str
    new_best: float
    prev_best: float
    timeframe: str  # "session" | "week" | "alltime"


# All event types for dispatching
EVENT_TYPES = {
    "share_submitted": ShareSubmitted,
    "block_found": BlockFound,
    "miner_connected": MinerConnected,
    "miner_disconnected": MinerDisconnected,
    "diff_updated": DiffUpdated,
    "hashrate_update": HashrateUpdate,
    "new_block_network": NewBlockNetwork,
    "share_best_diff": ShareBestDiff,
}


# --- Unix Socket Protocol ---

class EventProtocol(asyncio.DatagramProtocol):
    """Receives JSON datagrams from ckpool's event emitter."""

    def __init__(self, handler):
        self.handler = handler
        self.events_received = 0
        self.events_errors = 0

    def datagram_received(self, data: bytes, addr) -> None:
        self.events_received += 1
        try:
            raw = json.loads(data)
            event_type = raw.get("event")
            if event_type not in EVENT_TYPES:
                logger.warning("Unknown event type: %s", event_type)
                self.events_errors += 1
                return
            event = msgspec.json.decode(data, type=EVENT_TYPES[event_type])
            asyncio.create_task(self.handler(event))
        except Exception:
            logger.exception("Failed to decode event")
            self.events_errors += 1

    def error_received(self, exc: Exception) -> None:
        logger.error("Socket error: %s", exc)


# --- Fan-out Handler ---

class EventFanOut:
    """Distributes validated events to Redis Streams and TimescaleDB."""

    def __init__(self, redis_client: redis.Redis, db_pool):
        self.redis = redis_client
        self.db_pool = db_pool
        self._batch: list[dict[str, Any]] = []
        self._batch_flush_interval = 1.0  # seconds
        self._batch_max_size = 500

    async def handle(self, event: BaseEvent) -> None:
        event_dict = msgspec.json.decode(msgspec.json.encode(event))
        stream_key = f"events:{event.event}"

        # --- Redis Streams ---
        await self.redis.xadd(
            stream_key,
            event_dict,
            maxlen=100_000,  # cap per stream
        )

        # --- TimescaleDB batch ---
        self._batch.append(event_dict)
        if len(self._batch) >= self._batch_max_size:
            await self._flush_batch()

    async def _flush_batch(self) -> None:
        if not self._batch:
            return
        batch = self._batch
        self._batch = []
        # Bulk INSERT into hypertable (implementation depends on asyncpg)
        async with self.db_pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO mining_events (ts, event_type, payload)
                VALUES ($1, $2, $3)
                """,
                [
                    (e["ts"], e["event"], json.dumps(e))
                    for e in batch
                ],
            )
        logger.info("Flushed %d events to TimescaleDB", len(batch))

    async def periodic_flush(self) -> None:
        """Background task to flush partial batches."""
        while True:
            await asyncio.sleep(self._batch_flush_interval)
            await self._flush_batch()


# --- Main Entry Point ---

async def main():
    import asyncpg

    redis_client = redis.Redis(host="localhost", port=6379, db=0)
    db_pool = await asyncpg.create_pool(
        "postgresql://ckpool:password@localhost:5432/thebitcoingame"
    )

    fanout = EventFanOut(redis_client, db_pool)
    loop = asyncio.get_running_loop()

    # Bind Unix datagram socket
    socket_path = "/var/run/ckpool/events.sock"
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: EventProtocol(fanout.handle),
        local_addr=socket_path,
        family=asyncio.unix_events.socket.AF_UNIX,
    )

    # Start periodic batch flusher
    asyncio.create_task(fanout.periodic_flush())

    logger.info("Event Collector listening on %s", socket_path)

    try:
        await asyncio.Future()  # run forever
    finally:
        transport.close()
        await db_pool.close()
        await redis_client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
```

---

## 1.7 Event Schemas — Complete Reference

All events share a common envelope:

```json
{
    "event": "<event_type>",
    "ts": 1708617600.123456
    // ... type-specific fields
}
```

### 1.7.1 Schema Table

| Event Type           | Key Fields                                                                                      | Frequency                   | Redis Stream Key             |
|----------------------|-------------------------------------------------------------------------------------------------|-----------------------------|------------------------------|
| `share_submitted`    | user, worker, client_id, diff, sdiff, accepted, reject_reason, ip                               | High (every share)          | `events:share_submitted`     |
| `block_found`        | user, worker, height, hash, diff, network_diff, reward_sats, coinbase_sig                       | Very rare                   | `events:block_found`         |
| `miner_connected`    | user, worker, client_id, ip, useragent, initial_diff                                            | Low-Medium                  | `events:miner_connected`     |
| `miner_disconnected` | user, worker, client_id, ip, session_duration, shares_session                                   | Low-Medium                  | `events:miner_disconnected`  |
| `diff_updated`       | user, worker, client_id, old_diff, new_diff                                                     | Medium (VarDiff retargets)  | `events:diff_updated`        |
| `hashrate_update`    | user, worker, hashrate_1m, hashrate_5m, hashrate_1h, hashrate_1d                                | Medium (per update_interval)| `events:hashrate_update`     |
| `new_block_network`  | height, hash, diff, prev_hash                                                                   | Low (~144/day)              | `events:new_block_network`   |
| `share_best_diff`    | user, worker, new_best, prev_best, timeframe                                                    | Low-Medium                  | `events:share_best_diff`     |

### 1.7.2 Full JSON Examples

<details>
<summary><code>share_submitted</code></summary>

```json
{
    "event": "share_submitted",
    "ts": 1708617600.123456,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "client_id": 42,
    "diff": 65536.0,
    "sdiff": 131072.5,
    "accepted": true,
    "reject_reason": "",
    "ip": "192.168.1.100"
}
```
</details>

<details>
<summary><code>block_found</code></summary>

```json
{
    "event": "block_found",
    "ts": 1708617600.789012,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "height": 850001,
    "hash": "0000000000000000000234abc...",
    "diff": 92670429903014.0,
    "network_diff": 86388558925171.0,
    "reward_sats": 312500000,
    "coinbase_sig": "/The Bitcoin Game/bc1qxy2k.../"
}
```
</details>

<details>
<summary><code>miner_connected</code></summary>

```json
{
    "event": "miner_connected",
    "ts": 1708617500.000000,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "client_id": 42,
    "ip": "192.168.1.100",
    "useragent": "cpuminer/2.5.1",
    "initial_diff": 65536.0
}
```
</details>

<details>
<summary><code>miner_disconnected</code></summary>

```json
{
    "event": "miner_disconnected",
    "ts": 1708620000.000000,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "client_id": 42,
    "ip": "192.168.1.100",
    "session_duration": 2500.0,
    "shares_session": 384
}
```
</details>

<details>
<summary><code>diff_updated</code></summary>

```json
{
    "event": "diff_updated",
    "ts": 1708618000.000000,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "client_id": 42,
    "old_diff": 65536.0,
    "new_diff": 131072.0
}
```
</details>

<details>
<summary><code>hashrate_update</code></summary>

```json
{
    "event": "hashrate_update",
    "ts": 1708618030.000000,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "hashrate_1m": 110000000000000.0,
    "hashrate_5m": 108000000000000.0,
    "hashrate_1h": 107500000000000.0,
    "hashrate_1d": 107000000000000.0
}
```
</details>

<details>
<summary><code>new_block_network</code></summary>

```json
{
    "event": "new_block_network",
    "ts": 1708618600.000000,
    "height": 850002,
    "hash": "0000000000000000000345def...",
    "diff": 86388558925171.0,
    "prev_hash": "0000000000000000000234abc..."
}
```
</details>

<details>
<summary><code>share_best_diff</code></summary>

```json
{
    "event": "share_best_diff",
    "ts": 1708617600.123456,
    "user": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "worker": "antminer-s19.garage",
    "new_best": 262144.75,
    "prev_best": 131072.5,
    "timeframe": "alltime"
}
```
</details>

---

## 1.8 Configuration Additions

### 1.8.1 ckpool.conf Extensions

```json
{
    "btcd": [
        {
            "url": "127.0.0.1:38332",
            "auth": "ckpool",
            "pass": "ckpool_dev_password_change_me",
            "notify": "tcp://127.0.0.1:28332"
        }
    ],
    "btcaddress": "tb1q_YOUR_SIGNET_ADDRESS_HERE",
    "btcsig": "/The Bitcoin Game/",
    "blockpoll": 500,
    "mindiff": 1,
    "startdiff": 1,
    "maxdiff": 0,
    "update_interval": 30,
    "logdir": "/var/log/ckpool",

    "_comment_tbg": "=== The Bitcoin Game Extensions ===",
    "event_socket_path": "/var/run/ckpool/events.sock",
    "event_enabled": true,
    "btcsig_include_username": true,
    "btcsig_max_len": 40,
    "track_best_diff": true,
    "track_weekly_stats": true
}
```

### 1.8.2 Config Parsing in ckpool.c

```c
/* New fields in ckpool_t struct */
typedef struct ckpool {
    /* ... existing fields ... */
    char *event_socket_path;
    bool  event_enabled;
    bool  btcsig_include_username;
    int   btcsig_max_len;
    bool  track_best_diff;
    bool  track_weekly_stats;
} ckpool_t;

/* In parse_config() */
json_get_string(&ckp->event_socket_path, json_conf, "event_socket_path");
json_get_bool(&ckp->event_enabled, json_conf, "event_enabled");
json_get_bool(&ckp->btcsig_include_username, json_conf, "btcsig_include_username");
json_get_int(&ckp->btcsig_max_len, json_conf, "btcsig_max_len");
json_get_bool(&ckp->track_best_diff, json_conf, "track_best_diff");
json_get_bool(&ckp->track_weekly_stats, json_conf, "track_weekly_stats");

/* Defaults */
if (!ckp->btcsig_max_len)
    ckp->btcsig_max_len = 40;
```

---

## 1.9 TimescaleDB Schema

```sql
-- Create the hypertable for mining events
CREATE TABLE mining_events (
    ts          TIMESTAMPTZ     NOT NULL,
    event_type  TEXT            NOT NULL,
    payload     JSONB           NOT NULL
);

SELECT create_hypertable('mining_events', 'ts',
    chunk_time_interval => INTERVAL '1 day'
);

-- Indexes for common queries
CREATE INDEX idx_events_type_ts ON mining_events (event_type, ts DESC);
CREATE INDEX idx_events_user ON mining_events
    USING GIN ((payload->>'user'));

-- Compression policy (after 7 days)
ALTER TABLE mining_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'event_type',
    timescaledb.compress_orderby = 'ts DESC'
);
SELECT add_compression_policy('mining_events', INTERVAL '7 days');

-- Retention policy (keep 1 year of raw data)
SELECT add_retention_policy('mining_events', INTERVAL '365 days');

-- Continuous aggregates for dashboards
CREATE MATERIALIZED VIEW hourly_shares
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', ts) AS bucket,
    payload->>'user' AS username,
    COUNT(*) AS total_shares,
    COUNT(*) FILTER (WHERE (payload->>'accepted')::boolean) AS accepted_shares,
    MAX((payload->>'sdiff')::float) AS best_diff
FROM mining_events
WHERE event_type = 'share_submitted'
GROUP BY bucket, payload->>'user';

SELECT add_continuous_aggregate_policy('hourly_shares',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

---

## 1.10 Data Flow — End to End

```mermaid
sequenceDiagram
    participant Miner as cpuminer
    participant CK as ckpool (C)
    participant US as Unix Socket
    participant EC as Event Collector (Python)
    participant RD as Redis Streams
    participant TS as TimescaleDB
    participant API as FastAPI Backend
    participant FE as React Frontend

    Miner->>CK: mining.submit (share)
    CK->>CK: validate share, update stats
    CK->>US: emit_event("share_submitted", {...})
    US->>EC: datagram received
    EC->>EC: decode JSON, validate schema
    EC->>RD: XADD events:share_submitted {...}
    EC->>TS: batch INSERT mining_events

    API->>RD: XREADGROUP (consumer group)
    API->>API: process event, update game state
    API->>FE: WebSocket push (real-time)

    Note over CK,US: GPL boundary<br/>(fire-and-forget datagram)
    Note over EC,API: Proprietary boundary<br/>(Python, FastAPI)
```

---

## 1.11 Deliverables Checklist

| # | Deliverable                                                    | Owner | Status |
|---|----------------------------------------------------------------|-------|--------|
| 1 | `init_event_emitter()` and `emit_event()` in stratifier.c     | TBD   | [ ]    |
| 2 | Hook: `share_submitted` in `add_submit()`                     | TBD   | [ ]    |
| 3 | Hook: `block_found` in `test_block_solve()`                   | TBD   | [ ]    |
| 4 | Hook: `miner_connected` in `parse_subscribe()`                | TBD   | [ ]    |
| 5 | Hook: `miner_disconnected` in `__del_client()`                | TBD   | [ ]    |
| 6 | Hook: `diff_updated` in VarDiff retarget block                | TBD   | [ ]    |
| 7 | Hook: `hashrate_update` in rolling stats recalculation        | TBD   | [ ]    |
| 8 | Hook: `new_block_network` in `update_base()`                  | TBD   | [ ]    |
| 9 | Hook: `share_best_diff` in `add_submit()` (conditional)       | TBD   | [ ]    |
| 10| New `user_instance_t` fields (best_diff tiers, weekly stats)  | TBD   | [ ]    |
| 11| Weekly reset logic with `check_weekly_reset()`                | TBD   | [ ]    |
| 12| Coinbase signature customization in `build_coinbase()`        | TBD   | [ ]    |
| 13| Config parsing for all new ckpool.conf fields                 | TBD   | [ ]    |
| 14| Event Collector Python service (asyncio socket + fanout)      | TBD   | [ ]    |
| 15| Event schemas (msgspec classes for all 8 types)               | TBD   | [ ]    |
| 16| Redis Streams integration (XADD per event type)               | TBD   | [ ]    |
| 17| TimescaleDB schema (hypertable + indexes + aggregates)        | TBD   | [ ]    |
| 18| Docker Compose for local dev (ckpool + collector + Redis + DB)| TBD   | [ ]    |
| 19| Updated ckpool.conf documentation                             | TBD   | [ ]    |
| 20| Event schema documentation (frozen contract)                  | TBD   | [ ]    |

---

## 1.12 Testing — Phase 1

> Full test infrastructure is Phase 2. These are the minimum acceptance tests for Phase 1.

| # | Test                                                         | Method                              | Pass Criteria                                              |
|---|--------------------------------------------------------------|-------------------------------------|------------------------------------------------------------|
| 1 | ckpool compiles with all modifications                       | `make -j$(nproc)`                   | Zero errors, zero warnings with `-Wall -Werror`            |
| 2 | ckpool starts and initializes event emitter                  | Process log                         | `Event emitter initialized` message                        |
| 3 | cpuminer connects and submits shares on signet               | cpuminer stdout                     | `Accepted` shares                                          |
| 4 | Event Collector receives share_submitted events              | Collector log                       | JSON events parsed and logged                              |
| 5 | Events appear in Redis Streams                               | `redis-cli XRANGE events:share_submitted - +` | Events present with correct schema             |
| 6 | Events appear in TimescaleDB                                 | `psql` query                        | Rows in `mining_events` with correct payload               |
| 7 | Miner connect/disconnect events fire                         | Start/stop cpuminer                 | `miner_connected` and `miner_disconnected` in Redis        |
| 8 | Diff update events fire                                      | Wait for VarDiff retarget           | `diff_updated` event with old/new diff                     |
| 9 | Network block events fire                                    | Wait for signet block               | `new_block_network` event with height and hash             |
| 10| Best-diff tracking updates correctly                         | Submit shares with increasing diff  | `share_best_diff` events for session/week/alltime          |
| 11| Collector handles ckpool not running                         | Start collector first               | No crash, waits for datagrams                              |
| 12| ckpool handles collector not running                         | Start ckpool without collector      | No crash, events silently dropped, mining continues         |

---

## 1.13 Week-by-Week Schedule

### Week 1 — Event Emission Core

- Implement `init_event_emitter()` and `emit_event()` in stratifier.c
- Add config parsing for `event_socket_path` and `event_enabled`
- Hook `share_submitted` in `add_submit()`
- Hook `miner_connected` in `parse_subscribe()`
- Hook `miner_disconnected` in `__del_client()`
- Verify with `socat` listening on Unix socket

### Week 2 — Remaining Hooks & Diff Tracking

- Hook `block_found` in `test_block_solve()`
- Hook `diff_updated` in VarDiff code
- Hook `hashrate_update` in rolling stats
- Hook `new_block_network` in `update_base()`
- Add `user_instance_t` fields for enhanced diff tracking
- Implement `check_weekly_reset()`
- Hook `share_best_diff` with tier cascade

### Week 3 — Event Collector & Coinbase

- Build Event Collector Python service (asyncio skeleton)
- Implement Unix socket listener + JSON decoding
- Implement Redis Streams fan-out
- Implement TimescaleDB batch inserts
- Create TimescaleDB schema (hypertable + aggregates)
- Customize `build_coinbase()` in generator.c

### Week 4 — Integration & Polish

- Docker Compose for full local stack
- End-to-end testing: ckpool -> collector -> Redis -> DB
- Resilience testing (collector restart, ckpool restart)
- Event schema documentation freeze
- Code review and cleanup
- Phase 1 sign-off

---

## 1.14 Risk Register

| Risk                                                  | Impact | Likelihood | Mitigation                                                          |
|-------------------------------------------------------|--------|------------|---------------------------------------------------------------------|
| Unix socket buffer overflow under high share rate     | High   | Low        | SOCK_DGRAM is atomic; drop on EAGAIN; monitor with Prometheus       |
| Event emission adds latency to stratum loop           | High   | Low        | Non-blocking sendto(); measured overhead < 1us per call             |
| GPL contamination of Python code                      | High   | Low        | Unix socket = clean process boundary; no linking; legal review done |
| Coinbase signature exceeds 100-byte limit             | Medium | Medium     | Enforce `btcsig_max_len`; truncate with warning log                 |
| ckpool upstream changes conflict with our hooks       | Medium | Medium     | Minimize diff; add hooks as clean blocks with comments              |
| Redis Streams memory growth under sustained load      | Medium | Medium     | MAXLEN cap (100k entries per stream); consumer groups trim           |
| TimescaleDB insert latency affects collector          | Medium | Low        | Batch inserts with 1s flush interval; async writes                  |
