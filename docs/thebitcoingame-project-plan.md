# THE BITCOIN GAME — Full Project Plan

## Technical Architecture, Infrastructure, Development Phases & Gamification Design

**Version:** 1.0  
**Date:** February 2026  
**Classification:** Internal — Confidential

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Open-Source vs Proprietary Boundary](#3-open-source-vs-proprietary-boundary)
4. [Phase 0 — Foundation & Research](#4-phase-0--foundation--research)
5. [Phase 1 — Core Mining Engine (ckpool fork)](#5-phase-1--core-mining-engine-ckpool-fork)
6. [Phase 2 — Event Pipeline & Data Layer](#6-phase-2--event-pipeline--data-layer)
7. [Phase 3 — Backend API (Python/FastAPI)](#7-phase-3--backend-api-pythonfastapi)
8. [Phase 4 — Frontend Dashboard (React)](#8-phase-4--frontend-dashboard-react)
9. [Phase 5 — Gamification Engine](#9-phase-5--gamification-engine)
10. [Phase 6 — Solo Mining World Cup & Leagues](#10-phase-6--solo-mining-world-cup--leagues)
11. [Phase 7 — Personalized Lotteries (Pool Mode)](#11-phase-7--personalized-lotteries-pool-mode)
12. [Phase 8 — Cooperatives & Social](#12-phase-8--cooperatives--social)
13. [Phase 9 — NoCoiners Onboarding & Education](#13-phase-9--nocoiners-onboarding--education)
14. [Phase 10 — Lightning Network Integration & Betting](#14-phase-10--lightning-network-integration--betting)
15. [Phase 11 — Monetization Systems](#15-phase-11--monetization-systems)
16. [Infrastructure & DevOps](#16-infrastructure--devops)
17. [Security Architecture](#17-security-architecture)
18. [Stratum V2 Roadmap](#18-stratum-v2-roadmap)
19. [Phase 12 — Decentralized Mining (User-Run Pools & Nodes)](#19-phase-12--decentralized-mining)
20. [Team & Roles](#20-team--roles)
21. [Timeline Summary](#21-timeline-summary)
22. [Risk Register](#22-risk-register)
23. [Detailed Documentation Index](#23-detailed-documentation-index)

---

## 1. Executive Summary

The Bitcoin Game (thebitcoingame.com) is a platform that gamifies solo Bitcoin mining to incentivize hashrate decentralization, promote node operation, and orange-pill nocoiners. The technical foundation is a forked and extended version of **ckpool-solo** (GPLv3, by Con Kolivas), with a proprietary gamification dashboard, API layer, and competitive league system built on top.

The mining engine is written in C and remains open-source. The dashboard, API, gamification logic, league/world-cup systems, and betting integrations are proprietary.

**Core thesis:** Transform the boring solo mining experience into an engaging, competitive, social game — using the inherent lottery nature of mining as the foundation.

**Long-term vision:** Beyond hosting a mining pool, The Bitcoin Game will evolve into a **platform** that supports both hosted mining (miners connect to our ckpool) and **self-hosted mining** (users run their own Bitcoin nodes, pools, and miners at home and report their verified mining proofs to our platform via a lightweight proxy). This maximizes decentralization and aligns with Bitcoin's ethos of self-sovereignty. See [Phase 12 — Decentralized Mining](#19-phase-12--decentralized-mining) and `docs/ckpool-service/decentralized-mining.md` for full details.

> **Detailed ckpool documentation:** The mining engine has its own comprehensive documentation at `docs/ckpool-service/`. This includes the master plan, development roadmap (7 phases), open-source documentation templates, and the decentralized mining feature design.

> **Backend service documentation:** The Python API layer (FastAPI), gamification engine, background workers, and dashboard integration are documented at `docs/backend-service/`. This includes the master plan (~44 database tables, ~100 REST endpoints, 4 WebSocket channels), an 11-phase development roadmap, and implementation prompts for each phase at `docs/prompts/prompt-backend-phase{0-10}.md`.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        THE BITCOIN GAME — SYSTEM MAP                        │
└─────────────────────────────────────────────────────────────────────────────┘

      MODE A: HOSTED MINING                    MODE B: SELF-HOSTED (FUTURE)
      (Miners → our ckpool)                    (Miners → user's own pool → proxy → us)

                                                ┌──────────────────────┐
                                                │  USER'S HOME SETUP   │
                                                │  ┌────────────────┐ │
                                                │  │ Bitcoin Core    │ │
                                                │  │ ckpool-solo     │ │
                                                │  │ TBG Proxy       │─┼──── HTTPS ────┐
                                                │  │ Miner (Bitaxe)  │ │               │
                                                │  └────────────────┘ │               │
                                                └──────────────────────┘               │
                                                                                       │
                    ┌──────────────────────┐                                           │
                    │   Bitcoin Core Node   │  (multiple, geo-distributed)              │
                    │   RPC + ZMQ notif.    │                                           │
                    └──────────┬───────────┘                                           │
                               │                                                       │
                    ┌──────────▼───────────┐                                           │
                    │   CKPOOL-SOLO FORK    │  ◄── OPEN SOURCE (C, GPLv3)              │
                    │  ┌─────────────────┐ │                                           │
                    │  │   Generator      │ │  Block template construction              │
                    │  │   Stratifier     │ │  Share validation & diff tracking         │
                    │  │   Connector      │ │  Stratum TCP connections                  │
                    │  └─────────────────┘ │                                           │
                    │  Port 3333 (Stratum)  │                                           │
                    └──────────┬───────────┘                                           │
                               │                                                       │
              ┌────────────────▼────────────────┐                                     │
              │       EVENT PIPELINE             │  ◄── OPEN SOURCE                   │
              │  (Redis Streams / NATS / ZMQ)    │                                     │
              │  share_submitted, block_found,   │                                     │
              │  miner_connected, diff_update    │                                     │
              │                                  │                                     │
              │  source: "hosted" | "proxy"      │◄────────────────────────────────────┘
              │  (all events carry source field) │   Share Verification Service
              └────────────────┬────────────────┘   validates proxy-submitted proofs
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  TimescaleDB /  │  │  GAME ENGINE    │  │  STATS WORKER   │
│  PostgreSQL     │  │  (Python)       │  │  (Python)       │
│                 │  │                 │  │                 │
│  shares, users  │  │  badges, xp,   │  │  rolling stats, │
│  blocks, stats  │  │  streaks, cups  │  │  leaderboards   │
│  cooperatives   │  │  lottery draws  │  │  country aggr.  │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   FASTAPI BACKEND    │  ◄── PROPRIETARY
                    │   REST + WebSocket   │
                    │   Auth (BTC sig)     │
                    │   Proxy API endpoint │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   REACT DASHBOARD    │  ◄── PROPRIETARY
                    │   + Game Animations  │
                    │   + Three.js / Pixi  │
                    │   + Mobile (RN)      │
                    └──────────────────────┘
```

---

## 3. Open-Source vs Proprietary Boundary

| Component | License | Repository |
|-----------|---------|------------|
| ckpool-solo fork (mining engine) | GPLv3 (inherited) | `thebitcoingame/mining-engine` |
| Event emitter sidecar (C/Python) | GPLv3 | `thebitcoingame/mining-engine` |
| Stratum V2 translation proxy | MIT | `thebitcoingame/sv2-proxy` |
| Bitcoin Core node configs | MIT | `thebitcoingame/node-configs` |
| FastAPI backend | Proprietary | `thebitcoingame/api` (private) |
| React dashboard | Proprietary | `thebitcoingame/dashboard` (private) |
| Game engine / gamification | Proprietary | `thebitcoingame/game-engine` (private) |
| World Cup / League system | Proprietary | `thebitcoingame/leagues` (private) |
| LN betting module | Proprietary | `thebitcoingame/betting` (private) |
| Mobile app (React Native) | Proprietary | `thebitcoingame/mobile` (private) |

**GPLv3 compliance note:** The ckpool fork and any modifications to its C code must remain GPLv3. The event pipeline that reads ckpool's log files / Unix sockets is a separate process and can be any license. The API/dashboard consume data via the event pipeline and are cleanly separated — no GPL contamination.

---

## 4. Phase 0 — Foundation & Research (Weeks 1–4)

### 4.1 Objectives
- Deep-dive into ckpool-solo source code
- Set up development environments
- Establish CI/CD pipelines
- Define all data models
- Finalize gamification design documents

### 4.2 ckpool Code Study

ckpool-solo is a multi-process, multi-threaded C application with three core processes:

**Generator** (`src/generator.c`)
- Communicates with bitcoind via RPC
- Fetches block templates (getblocktemplate)
- Constructs coinbase transactions
- Pushes new work to the Stratifier
- Handles ZMQ block notifications for instant new-block detection

**Stratifier** (`src/stratifier.c`)
- The brain of the pool — handles all stratum protocol logic
- Vardiff (variable difficulty) adjustment per miner
- Share validation (checks submitted hashes against difficulty)
- Tracks per-user and per-worker statistics
- Constructs work assignments for miners
- Block solve detection and submission to bitcoind
- Key data structures: `stratum_instance_t`, `user_instance_t`, `worker_instance_t`, `workbase_t`

**Connector** (`src/connector.c`)
- Manages all TCP connections from miners
- Handles Stratum protocol I/O (JSON-RPC over TCP)
- Connection lifecycle (subscribe, authorize, submit)
- Epoll-based event loop for massive concurrency

**Supporting files:**
- `src/ckpool.c` — Main entry, process orchestration, signal handling, watchdog
- `src/ckpool.h` — Core struct definitions (`ckpool_t` with all config and state)
- `src/libckpool.c/h` — Utility functions (networking, threading, JSON, logging)
- `src/bitcoin.c/h` — Bitcoin-specific functions (address validation, script construction)
- `src/sha2.c/h` — SHA256 implementation (using yasm for SIMD optimization)
- `ckpool.conf` — JSON configuration file

**Key configuration parameters we will customize:**
- `btcaddress` — In solo mode, each miner's BTC address (passed as stratum username)
- `btcsig` — Coinbase signature (e.g., "/TheBitcoinGame/")
- `mindiff` / `startdiff` / `maxdiff` — Difficulty settings
- `update_interval` — Stratum update frequency (30s default)
- `version_mask` — AsicBoost version rolling support
- `nonce1length` / `nonce2length` — Extranonce sizes
- `zmqblock` — ZMQ interface for instant block notifications

### 4.3 Dev Environment Setup

```bash
# Build dependencies
sudo apt-get install build-essential yasm libzmq3-dev

# Clone and build ckpool-solo
git clone <our-fork>
cd ckpool-solo
./autogen.sh
./configure --without-ckdb   # standalone mode, no database dependency
make

# Bitcoin Core (testnet/signet for dev)
bitcoind -signet -server -rpcuser=tbg -rpcpassword=<secret> \
  -zmqpubhashblock=tcp://127.0.0.1:28332

# ckpool config for dev
{
  "btcd": [{ "url": "127.0.0.1:38332", "auth": "tbg", "pass": "<secret>",
             "notify": true }],
  "btcsig": "/TheBitcoinGame-dev/",
  "blockpoll": 100,
  "serverurl": ["0.0.0.0:3333"],
  "zmqblock": "tcp://127.0.0.1:28332",
  "mindiff": 1,
  "startdiff": 512,
  "update_interval": 30,
  "version_mask": "1fffe000",
  "nonce1length": 4,
  "nonce2length": 8,
  "logdir": "logs"
}
```

### 4.4 Data Model Design

**Core entities (PostgreSQL / TimescaleDB):**

```sql
-- Users register by signing a message with their BTC address
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    btc_address     VARCHAR(62) NOT NULL UNIQUE,
    display_name    VARCHAR(64),
    country_code    CHAR(2),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_seen       TIMESTAMPTZ,
    is_verified     BOOLEAN DEFAULT FALSE
);

-- Each physical mining device
CREATE TABLE workers (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id),
    worker_name     VARCHAR(128) NOT NULL,
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_share      TIMESTAMPTZ,
    current_diff    DOUBLE PRECISION,
    hashrate_1m     DOUBLE PRECISION,
    hashrate_5m     DOUBLE PRECISION,
    hashrate_1h     DOUBLE PRECISION,
    hashrate_24h    DOUBLE PRECISION,
    is_online       BOOLEAN DEFAULT FALSE
);

-- Hypertable for shares (TimescaleDB)
CREATE TABLE shares (
    time            TIMESTAMPTZ NOT NULL,
    user_id         BIGINT NOT NULL,
    worker_id       BIGINT NOT NULL,
    difficulty      DOUBLE PRECISION NOT NULL,
    share_diff      DOUBLE PRECISION NOT NULL,
    is_valid        BOOLEAN NOT NULL,
    is_block        BOOLEAN DEFAULT FALSE,
    ip_address      INET,
    nonce           VARCHAR(16),
    nonce2          VARCHAR(32),
    block_hash      VARCHAR(64)
);
SELECT create_hypertable('shares', 'time');

-- Blocks found by our miners
CREATE TABLE blocks (
    id              BIGSERIAL PRIMARY KEY,
    block_height    INTEGER NOT NULL,
    block_hash      VARCHAR(64) NOT NULL UNIQUE,
    prev_hash       VARCHAR(64),
    user_id         BIGINT REFERENCES users(id),
    worker_id       BIGINT REFERENCES workers(id),
    reward_btc      NUMERIC(16,8),
    fees_btc        NUMERIC(16,8),
    difficulty      DOUBLE PRECISION,
    confirmations   INTEGER DEFAULT 0,
    found_at        TIMESTAMPTZ NOT NULL,
    confirmed       BOOLEAN DEFAULT FALSE
);

-- Best difficulty per user per week (for lottery games)
CREATE TABLE weekly_best_diff (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id),
    week_start      DATE NOT NULL,
    best_difficulty DOUBLE PRECISION NOT NULL,
    best_share_time TIMESTAMPTZ,
    total_shares    BIGINT DEFAULT 0,
    UNIQUE(user_id, week_start)
);

-- Gamification
CREATE TABLE badges (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) UNIQUE NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    icon_url        VARCHAR(256),
    category        VARCHAR(32), -- 'mining', 'streak', 'competition', 'social'
    rarity          VARCHAR(16)  -- 'common', 'rare', 'epic', 'legendary'
);

CREATE TABLE user_badges (
    user_id         BIGINT REFERENCES users(id),
    badge_id        INTEGER REFERENCES badges(id),
    earned_at       TIMESTAMPTZ DEFAULT NOW(),
    metadata        JSONB,
    PRIMARY KEY(user_id, badge_id)
);

CREATE TABLE user_streaks (
    user_id         BIGINT REFERENCES users(id) PRIMARY KEY,
    current_streak  INTEGER DEFAULT 0,
    longest_streak  INTEGER DEFAULT 0,
    last_active_week DATE,
    streak_type     VARCHAR(32) -- 'weekly_mining', 'daily_mining'
);

-- Cooperatives (groups of friends mining together)
CREATE TABLE cooperatives (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    created_by      BIGINT REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    btc_address     VARCHAR(62), -- cooperative's payout address (managed by them)
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE cooperative_members (
    cooperative_id  BIGINT REFERENCES cooperatives(id),
    user_id         BIGINT REFERENCES users(id),
    role            VARCHAR(16) DEFAULT 'member', -- 'admin', 'member'
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY(cooperative_id, user_id)
);

-- World Cup / Leagues
CREATE TABLE competitions (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(256) NOT NULL,
    type            VARCHAR(32) NOT NULL,  -- 'world_cup', 'league', 'champions'
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(16) DEFAULT 'upcoming', -- 'upcoming', 'active', 'completed'
    config          JSONB  -- rules, scoring, etc.
);

CREATE TABLE competition_matches (
    id              BIGSERIAL PRIMARY KEY,
    competition_id  BIGINT REFERENCES competitions(id),
    round           VARCHAR(32),
    team_a          VARCHAR(64) NOT NULL,  -- country code or club name
    team_b          VARCHAR(64) NOT NULL,
    match_date      DATE NOT NULL,
    team_a_hashrate DOUBLE PRECISION DEFAULT 0,
    team_b_hashrate DOUBLE PRECISION DEFAULT 0,
    team_a_score    INTEGER,
    team_b_score    INTEGER,
    status          VARCHAR(16) DEFAULT 'scheduled',
    ai_recap_url    VARCHAR(256),  -- AI-generated match video/recap
    metadata        JSONB
);

-- Leaderboards (materialized, refreshed periodically)
CREATE MATERIALIZED VIEW leaderboard_weekly AS
SELECT
    u.id, u.display_name, u.country_code,
    MAX(w.best_difficulty) as best_diff,
    SUM(w.total_shares) as total_shares
FROM users u
JOIN weekly_best_diff w ON u.id = w.user_id
WHERE w.week_start = date_trunc('week', CURRENT_DATE)
GROUP BY u.id, u.display_name, u.country_code
ORDER BY best_diff DESC;
```

---

## 5. Phase 1 — Core Mining Engine / ckpool Fork (Weeks 3–10)

### 5.1 Fork Strategy

We fork from `ckpool-solo` (solobtc branch at `bitbucket.org/ckolivas/ckpool-solo/src/solobtc/`). This is the version that powers solo.ckpool.org — purpose-built for solo mining where each miner mines to their own BTC address.

### 5.2 Modifications to ckpool-solo

**5.2.1 Event Emission System (stratifier.c modifications)**

The most critical modification — we need ckpool to emit structured events for every significant action so our proprietary pipeline can consume them.

```c
/* === NEW: Event emission via Unix domain socket === */
/* Added to stratifier.c */

#include <sys/un.h>

static int event_socket_fd = -1;

/* Initialize event emission socket */
static void init_event_emitter(ckpool_t *ckp) {
    struct sockaddr_un addr;
    char sockpath[PATH_MAX];

    event_socket_fd = socket(AF_UNIX, SOCK_DGRAM | SOCK_NONBLOCK, 0);
    if (event_socket_fd < 0) {
        LOGWARNING("Failed to create event socket: %s", strerror(errno));
        return;
    }

    snprintf(sockpath, sizeof(sockpath), "%s/events.sock", ckp->socket_dir);
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, sockpath, sizeof(addr.sun_path) - 1);

    if (connect(event_socket_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        LOGWARNING("Failed to connect event socket: %s", strerror(errno));
        close(event_socket_fd);
        event_socket_fd = -1;
    }
}

/* Emit an event as JSON to the event pipeline */
static void emit_event(const char *event_type, json_t *data) {
    if (event_socket_fd < 0) return;

    json_t *envelope = json_object();
    json_object_set_new(envelope, "event", json_string(event_type));
    json_object_set_new(envelope, "timestamp", json_real(time_micros()));
    json_object_set(envelope, "data", data);

    char *msg = json_dumps(envelope, JSON_COMPACT);
    if (msg) {
        send(event_socket_fd, msg, strlen(msg), MSG_DONTWAIT);
        free(msg);
    }
    json_decref(envelope);
}
```

**Events we emit (hook points in stratifier.c):**

| Event | Hook Location | Data |
|-------|--------------|------|
| `share_submitted` | `add_submit()` | user, worker, diff, valid, share_diff, nonce, **source** |
| `share_best_diff` | `add_submit()` (when diff > user's session best) | user, new_best_diff, **source** |
| `block_found` | Inside block solve detection in `test_block_solve()` | user, worker, height, hash, reward, **source** |
| `miner_connected` | `parse_subscribe()` | user, worker, ip, user_agent, **source** |
| `miner_disconnected` | `__del_client()` | user, worker, session_duration, shares_submitted, **source** |
| `diff_updated` | Vardiff adjustment code | user, worker, old_diff, new_diff, **source** |
| `hashrate_update` | Rolling stats update loop | user, worker, 1m/5m/1h/24h rates, **source** |
| `new_block_network` | `block_update()` | height, prev_hash, difficulty |

> **Future-proofing note:** All events include a `source` field from day one (`"hosted"` for our ckpool, `"proxy"` for future self-hosted miners). This ensures the event pipeline, database schema, and downstream consumers can handle both hosted and self-hosted mining without schema changes. See [Phase 12 — Decentralized Mining](#19-phase-12--decentralized-mining) and `docs/ckpool-service/decentralized-mining.md`.

**5.2.2 Enhanced Logging & Difficulty Tracking**

Modify the stratifier to track and persist each user's best difficulty share per configurable time window (week by default):

```c
/* In user_instance_t struct, add: */
typedef struct user_instance user_instance_t;
struct user_instance {
    /* ... existing fields ... */

    /* === NEW: Best difficulty tracking === */
    double best_diff_session;     /* Best diff this connection */
    double best_diff_week;        /* Best diff this calendar week */
    double best_diff_alltime;     /* Best diff ever */
    time_t best_diff_week_time;   /* When the weekly best was found */
    int64_t total_shares_week;    /* Total shares this week */
    int current_week;             /* ISO week number for reset detection */
};
```

**5.2.3 Coinbase Signature Customization**

Allow per-user coinbase signatures so when a solo miner finds a block, their chosen tag appears in the coinbase (e.g., "/TheBitcoinGame:username/"):

```c
/* In stratifier.c, modify coinbase construction */
/* Allow user-specific btcsig appended to pool sig */
static void build_coinbase(ckpool_t *ckp, workbase_t *wb,
                           user_instance_t *user) {
    char combined_sig[128];
    snprintf(combined_sig, sizeof(combined_sig),
             "%s:%s", ckp->btcsig,
             user->custom_sig ? user->custom_sig : user->username);
    /* ... use combined_sig in coinbase scriptSig ... */
}
```

**5.2.4 Multi-Instance Support**

For geographic distribution, ckpool already supports running multiple named instances. We configure:

- **Primary instance** (EU — e.g., Hetzner Frankfurt): Full ckpool-solo + bitcoind
- **Relay instances** (US-East, US-West, Asia): ckpool in passthrough mode pointing to primary
- Miners auto-directed to lowest-latency endpoint via GeoDNS

### 5.3 Build & Test

```bash
# Build our fork
cd thebitcoingame-mining-engine
./autogen.sh
./configure --without-ckdb --prefix=/opt/tbg-mining
make -j$(nproc)
sudo make install

# Run on signet for testing
/opt/tbg-mining/bin/ckpool -c /etc/tbg/ckpool-signet.conf -l 7

# Test with cpuminer
minerd -a sha256d -t 1 \
  --url=stratum+tcp://127.0.0.1:3333 \
  --userpass=tb1qYOUR_TESTNET_ADDRESS:x

# Verify events flowing
socat UNIX-RECV:/tmp/ckpool/events.sock -
```

---

## 6. Phase 2 — Event Pipeline & Data Layer (Weeks 7–12)

### 6.1 Architecture

The event pipeline bridges the open-source mining engine to the proprietary backend. It runs as a separate process, reading events from ckpool's Unix domain socket and publishing them to Redis Streams (primary) with optional NATS for cross-datacenter fanout.

```
ckpool (C)  ──Unix socket──►  Event Collector (Python)
                                    │
                     ┌──────────────┼──────────────┐
                     ▼              ▼              ▼
              Redis Streams    TimescaleDB     NATS (cross-DC)
              (real-time)      (persistence)   (replication)
                     │              │
                     ▼              ▼
              WebSocket push   Batch analytics
              to dashboard     & leaderboards
```

### 6.2 Event Collector Service

```python
# event_collector.py — Reads from ckpool Unix socket, publishes to Redis + DB
import asyncio
import socket
import json
import redis.asyncio as redis
from datetime import datetime, timezone
import asyncpg

SOCKET_PATH = "/tmp/ckpool/events.sock"
REDIS_URL = "redis://localhost:6379"
DB_DSN = "postgresql://tbg:password@localhost:5432/thebitcoingame"

class EventCollector:
    def __init__(self):
        self.redis = None
        self.db_pool = None

    async def start(self):
        self.redis = redis.from_url(REDIS_URL)
        self.db_pool = await asyncpg.create_pool(DB_DSN, min_size=5, max_size=20)

        # Create Unix datagram socket to receive events
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        try:
            import os
            os.unlink(SOCKET_PATH)
        except FileNotFoundError:
            pass
        sock.bind(SOCKET_PATH)
        sock.setblocking(False)

        loop = asyncio.get_event_loop()
        while True:
            data = await loop.sock_recv(sock, 65536)
            if data:
                await self.process_event(json.loads(data))

    async def process_event(self, event: dict):
        event_type = event["event"]
        ts = event["timestamp"]
        data = event["data"]

        # Publish to Redis Stream (for real-time consumers)
        await self.redis.xadd(
            f"mining:{event_type}",
            {"payload": json.dumps(data), "ts": str(ts)},
            maxlen=100000  # keep last 100k events per stream
        )

        # Persist to database based on event type
        if event_type == "share_submitted":
            await self.persist_share(data, ts)
        elif event_type == "block_found":
            await self.persist_block(data, ts)
        elif event_type == "share_best_diff":
            await self.update_best_diff(data, ts)
        elif event_type in ("miner_connected", "miner_disconnected"):
            await self.update_worker_status(data, event_type)

    async def persist_share(self, data, ts):
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO shares (time, user_id, worker_id, difficulty,
                    share_diff, is_valid, nonce, nonce2)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """, datetime.fromtimestamp(ts/1e6, tz=timezone.utc),
                data["user_id"], data["worker_id"],
                data["difficulty"], data["share_diff"],
                data["valid"], data.get("nonce"), data.get("nonce2"))

    async def persist_block(self, data, ts):
        # High-priority: notify all systems immediately
        await self.redis.publish("blocks:found", json.dumps(data))
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO blocks (block_height, block_hash, user_id,
                    worker_id, reward_btc, difficulty, found_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            """, data["height"], data["hash"], data["user_id"],
                data["worker_id"], data["reward"],
                data["difficulty"],
                datetime.fromtimestamp(ts/1e6, tz=timezone.utc))
```

### 6.3 Stats Aggregation Worker

Runs every 60 seconds to compute rolling statistics, leaderboards, and country-level aggregations:

```python
# stats_worker.py — Periodic aggregation
class StatsWorker:
    async def run_aggregations(self):
        """Called every 60s by scheduler"""
        await self.compute_leaderboards()
        await self.compute_country_hashrates()
        await self.check_streaks()
        await self.refresh_materialized_views()

    async def compute_country_hashrates(self):
        """Aggregate hashrate by country for World Cup"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT u.country_code,
                       SUM(w.hashrate_1h) as total_hashrate,
                       COUNT(DISTINCT u.id) as miner_count
                FROM users u
                JOIN workers w ON u.id = w.user_id
                WHERE w.is_online = TRUE
                GROUP BY u.country_code
            """)
            # Publish to Redis for real-time dashboard
            for row in rows:
                await self.redis.hset("country_hashrates",
                    row["country_code"],
                    json.dumps({
                        "hashrate": row["total_hashrate"],
                        "miners": row["miner_count"]
                    }))
```

### 6.4 Database Infrastructure

**TimescaleDB** (PostgreSQL extension) for time-series share data:
- Automatic partitioning by time (1-week chunks)
- Built-in continuous aggregates for hourly/daily rollups
- Compression after 30 days (10x storage reduction)
- Retention policy: raw shares for 90 days, aggregates forever

```sql
-- Continuous aggregate for hourly stats
CREATE MATERIALIZED VIEW shares_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    user_id,
    COUNT(*) as share_count,
    MAX(share_diff) as best_diff,
    SUM(difficulty) as total_work
FROM shares
GROUP BY hour, user_id
WITH NO DATA;

-- Refresh policy
SELECT add_continuous_aggregate_policy('shares_hourly',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Compression after 30 days
SELECT add_compression_policy('shares', INTERVAL '30 days');

-- Retention: drop raw data after 90 days
SELECT add_retention_policy('shares', INTERVAL '90 days');
```

---

## 7. Phase 3 — Backend API (Python/FastAPI) (Weeks 10–16)

### 7.1 Tech Stack

- **Framework:** FastAPI (async, WebSocket native, auto OpenAPI docs)
- **Auth:** Bitcoin message signing (no passwords, no emails)
- **Cache:** Redis (hot data, sessions, leaderboards)
- **Task queue:** Celery + Redis (badge computation, AI generation, notifications)
- **WebSocket:** For real-time dashboard updates (share events, block notifications)

### 7.2 API Structure

```
/api/v1/
├── /auth
│   ├── POST   /challenge          # Get nonce to sign
│   └── POST   /verify             # Verify BTC signature → JWT
│
├── /users
│   ├── GET    /me                  # Profile + stats
│   ├── PATCH  /me                  # Update display name, country
│   └── GET    /{address}/stats     # Public profile
│
├── /mining
│   ├── GET    /dashboard           # Real-time overview (WebSocket upgrade)
│   ├── GET    /workers             # List my workers
│   ├── GET    /shares/history      # Share history (paginated)
│   ├── GET    /shares/best         # Best difficulty per period
│   ├── GET    /blocks              # Blocks found (global or filtered)
│   └── GET    /difficulty/current  # Current network difficulty
│
├── /games
│   ├── GET    /lottery/current     # This week's lottery state
│   ├── POST   /lottery/play        # Trigger lottery animation
│   ├── GET    /lottery/history     # Past lottery results
│   └── GET    /lottery/config      # Available games + rules
│
├── /gamification
│   ├── GET    /badges              # All available badges
│   ├── GET    /badges/mine         # My earned badges
│   ├── GET    /streaks             # My streak info
│   ├── GET    /leaderboard/weekly  # Weekly leaderboard
│   ├── GET    /leaderboard/alltime # All-time leaderboard
│   └── GET    /leaderboard/country # Country rankings
│
├── /cooperatives
│   ├── POST   /                    # Create cooperative
│   ├── GET    /{id}                # Cooperative details
│   ├── POST   /{id}/join           # Join (invite code)
│   ├── DELETE /{id}/leave          # Leave
│   └── GET    /{id}/stats          # Cooperative hashrate & stats
│
├── /competitions
│   ├── GET    /                    # List active/upcoming competitions
│   ├── GET    /{id}                # Competition details
│   ├── GET    /{id}/matches        # Match schedule & results
│   ├── GET    /{id}/standings      # Country/team standings
│   └── GET    /{id}/matches/{mid}/recap  # AI-generated recap
│
├── /betting  (Phase 10)
│   ├── GET    /markets             # Available betting markets
│   ├── POST   /place               # Place LN bet
│   └── GET    /my-bets             # My betting history
│
└── /education
    ├── GET    /tracks              # Learning tracks
    ├── GET    /tracks/{id}         # Track content
    └── POST   /tracks/{id}/complete # Mark lesson complete
```

### 7.3 Authentication — Bitcoin Message Signing

No emails, no passwords. Pure Bitcoin-native auth:

```python
# auth.py
from fastapi import APIRouter
from bitcoin.wallet import CBitcoinAddress
from bitcoin.signmessage import BitcoinMessage, VerifyMessage
import secrets, jwt

router = APIRouter()
challenges = {}  # In production: Redis with TTL

@router.post("/challenge")
async def get_challenge(address: str):
    nonce = secrets.token_hex(32)
    message = f"Sign in to TheBitcoinGame\nNonce: {nonce}\nTimestamp: {int(time.time())}"
    challenges[address] = {"nonce": nonce, "message": message, "expires": time.time() + 300}
    return {"message": message}

@router.post("/verify")
async def verify_signature(address: str, signature: str):
    challenge = challenges.pop(address, None)
    if not challenge or time.time() > challenge["expires"]:
        raise HTTPException(401, "Challenge expired")

    msg = BitcoinMessage(challenge["message"])
    if not VerifyMessage(CBitcoinAddress(address), msg, signature):
        raise HTTPException(401, "Invalid signature")

    # Create or get user
    user = await get_or_create_user(address)
    token = jwt.encode({"sub": str(user.id), "addr": address}, SECRET, algorithm="HS256")
    return {"token": token, "user": user}
```

### 7.4 WebSocket Real-Time Feed

```python
# ws.py — Real-time mining dashboard
from fastapi import WebSocket
import redis.asyncio as redis

@router.websocket("/mining/dashboard")
async def mining_dashboard(ws: WebSocket, user_id: int):
    await ws.accept()
    r = redis.from_url(REDIS_URL)

    # Subscribe to user-specific and global streams
    pubsub = r.pubsub()
    await pubsub.subscribe(
        f"user:{user_id}:events",
        "blocks:found",
        "competitions:live"
    )

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await ws.send_json(json.loads(message["data"]))
    except Exception:
        await pubsub.unsubscribe()
```

---

## 8. Phase 4 — Frontend Dashboard (React) (Weeks 12–20)

### 8.1 Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **State:** Zustand (lightweight, no Redux boilerplate)
- **Styling:** Tailwind CSS + custom Bitcoin-orange theme
- **Charts:** Recharts (hashrate, difficulty, shares over time)
- **Animations:** Framer Motion + Three.js/React Three Fiber (3D lottery games)
- **Real-time:** Native WebSocket hooks
- **Mobile:** React Native (shared business logic via shared TypeScript packages)

### 8.2 Page Structure

```
/                           → Landing page (animated mining visualization)
/connect                    → Connect wallet (sign message to login)
/dashboard                  → Main mining dashboard
  ├── Hashrate chart (1m, 5m, 1h, 24h)
  ├── Workers list (online/offline, hashrate each)
  ├── Best difficulty this week (with progress bar to block diff)
  ├── Recent shares feed (live)
  └── Quick stats (total shares, uptime, streak)
/lottery                    → Weekly lottery games
  ├── Hammer Game (strength = share difficulty ratio)
  ├── Horse Race (proximity animation)
  ├── Slot Machine (visual hash matching)
  └── History of past draws
/world-cup                  → Solo Mining World Cup
  ├── Live matches (hashrate battles)
  ├── Group standings
  ├── Country leaderboard
  ├── AI-generated match recaps
  └── Bracket / knockout stage
/leagues                    → Club leagues
/leaderboard                → Global rankings
  ├── Weekly best difficulty
  ├── Monthly best difficulty
  ├── All-time
  └── By country
/profile/{address}          → Public miner profile
  ├── Badge showcase
  ├── Stats history
  ├── Competition history
  └── Cooperative membership
/cooperatives               → Create / join / manage cooperatives
/education                  → Bitcoin & mining education tracks
/betting                    → LN betting on competition matches
/shop                       → Hardware store (Bitaxes, nodes, merch)
```

### 8.3 Design Language

- **Primary:** Bitcoin Orange (#F7931A) on dark backgrounds (#0D1117, #161B22)
- **Accents:** Electric green for "wins" (#00FF41), red for losses
- **Typography:** Inter (UI), JetBrains Mono (hashrates, technical data)
- **Aesthetic:** Cyberpunk-meets-retro-arcade. Mining should feel exciting, not boring
- **Animations:** Every share submission = small particle effect. Block found = full-screen celebration with confetti, sound effects, the works
- **Sound design:** Subtle mining sounds (optional), dramatic lottery sounds, crowd cheers for World Cup

### 8.4 Key UI Components

**The Difficulty Meter** — The signature visual element:
- A thermometer/bar that shows your best difficulty this week vs. the network difficulty
- Even at 0.0000001% it should feel like progress
- Animated particles rising as shares come in
- When a share beats your personal best, flash + sound + badge check

**Live Share Feed:**
- Scrolling feed of incoming shares with difficulty values
- Color-coded: green (above your average), white (normal), gold (personal best)
- Clickable to see full share details

---

## 9. Phase 5 — Gamification Engine (Weeks 14–22)

### 9.1 The Lottery Games

Each game takes the miner's weekly best difficulty and creates a visual representation of how close they came to finding a block.

**Ratio calculation:**
```python
progress_ratio = miner_best_difficulty / network_difficulty
# Example: best_diff = 200, network_diff = 100,000,000,000,000
# ratio = 0.000000000002 → but we normalize for visual effect
```

**Game 1: The Hammer Game (Strongman)**
- Player presses button → hammer strikes
- Bar rises proportional to `progress_ratio`
- If block was found → bell rings at top, fireworks
- Visual: retro carnival aesthetic, pixel art or 3D

**Game 2: Horse Race**
- Each "horse" is a day of the week
- Horse speed proportional to that day's best difficulty
- If block found on e.g. Wednesday → Wednesday's horse wins
- Can bet (LN) on which day will have highest diff next week

**Game 3: Slot Machine**
- Visual representation of hash matching
- Reels spin showing hex characters
- More matching prefix characters = bigger visual win
- Actual block = jackpot animation

**Game 4: Scratch Card**
- Weekly scratch card reveal
- Scratch to reveal your best difficulty
- Compare against threshold tiers for virtual prizes/badges

### 9.2 Badge System

```python
BADGE_DEFINITIONS = {
    # Mining milestones
    "first_share":          {"name": "First Hash", "desc": "Submit your first share", "rarity": "common"},
    "shares_1k":            {"name": "Hash Thousand", "desc": "Submit 1,000 shares", "rarity": "common"},
    "shares_1m":            {"name": "Megahash", "desc": "Submit 1,000,000 shares", "rarity": "rare"},
    "block_finder":         {"name": "Block Finder", "desc": "Find a Bitcoin block solo", "rarity": "legendary"},

    # Difficulty records
    "diff_1e6":             {"name": "Million Club", "desc": "Best diff > 1,000,000", "rarity": "common"},
    "diff_1e9":             {"name": "Billion Club", "desc": "Best diff > 1,000,000,000", "rarity": "rare"},
    "diff_1e12":            {"name": "Trillion Club", "desc": "Best diff > 1T", "rarity": "epic"},
    "weekly_diff_champion": {"name": "Diff Champion", "desc": "Highest difficulty of the week", "rarity": "epic"},

    # Streaks
    "streak_4":             {"name": "Month Strong", "desc": "4-week mining streak", "rarity": "common"},
    "streak_12":            {"name": "Quarter Master", "desc": "12-week streak", "rarity": "rare"},
    "streak_52":            {"name": "Year of Mining", "desc": "52-week streak", "rarity": "legendary"},

    # Node operator
    "node_runner":          {"name": "Node Runner", "desc": "Run a Bitcoin full node", "rarity": "rare"},
    "node_pruned":          {"name": "Pruned but Proud", "desc": "Run a pruned node", "rarity": "common"},
    "node_archival":        {"name": "Archival Node", "desc": "Run an archival node", "rarity": "epic"},

    # Competitions
    "world_cup_participant":{"name": "World Cup Miner", "desc": "Participate in a World Cup", "rarity": "rare"},
    "world_cup_winner":     {"name": "World Champion", "desc": "Win the World Cup", "rarity": "legendary"},

    # Social / Education
    "orange_piller":        {"name": "Orange Piller", "desc": "Gift a Bitaxe to a nocoiner", "rarity": "rare"},
    "rabbit_hole_complete": {"name": "Down the Rabbit Hole", "desc": "Complete education track", "rarity": "common"},

    # Cooperative
    "coop_founder":         {"name": "Cooperative Founder", "desc": "Create a cooperative", "rarity": "rare"},
    "coop_block":           {"name": "Team Block", "desc": "Cooperative finds a block", "rarity": "legendary"},
}
```

### 9.3 Streak System

- **Weekly streak:** Miner must submit at least 1 share during each calendar week
- **Daily streak:** At least 1 share per day (harder, for hardcore miners)
- Visual: flame icon that grows with streak length
- Losing a streak triggers a "streak frozen" notification — can be "revived" by mining double shares next week (gamification hook)

### 9.4 XP & Levels

```
Level 1:   Nocoiner          (0 XP)
Level 2:   Curious Cat        (100 XP)
Level 3:   Hash Pupil         (500 XP)
Level 4:   Solo Miner         (1,000 XP)
Level 5:   Difficulty Hunter   (2,500 XP)
Level 10:  Hashrate Warrior    (10,000 XP)
Level 15:  Block Chaser        (25,000 XP)
Level 20:  Mining Veteran       (50,000 XP)
Level 25:  Satoshi's Apprentice (100,000 XP)
Level 30:  Cypherpunk          (250,000 XP)
Level 50:  Timechain Guardian   (1,000,000 XP)

XP Sources:
- Each share submitted: 1 XP
- Weekly best diff personal record: 50 XP
- Completing education module: 100 XP
- Badge earned: varies (50-500 XP)
- World Cup participation: 200 XP
- Running a node: 10 XP/day
- Streak week maintained: 25 XP
```

---

## 10. Phase 6 — Solo Mining World Cup & Leagues (Weeks 18–28)

### 10.1 World Cup Format

**Annual event, 1 month duration (mimics FIFA World Cup)**

- **Registration:** 2 weeks before start. Solo miners register with their country
- **Qualification:** Countries need minimum 5 miners to qualify
- **Group Stage:** 4-team groups, round-robin over 2 weeks
- **Knockout Stage:** Quarter-finals → Semi-finals → Final, each match = 1 day

**Match Scoring:**
```python
def calculate_match_score(country_a_hashrate_ph, country_b_hashrate_ph,
                          country_a_blocks, country_b_blocks):
    """
    1 goal per 5 PH/s of hashrate during the match period.
    Block found by a country's miner = 5x hashrate bonus for that miner.
    """
    # Base goals from hashrate
    goals_a = int(country_a_hashrate_ph / 5)
    goals_b = int(country_b_hashrate_ph / 5)

    # Bonus for blocks found during match
    goals_a += country_a_blocks * 3  # Each block = 3 bonus goals
    goals_b += country_b_blocks * 3

    return goals_a, goals_b
```

### 10.2 AI Match Recaps

After each match, generate an AI commentary/recap:
- Text recap in sports journalism style
- Optional: AI-generated short video (using generative AI) showing highlights
- "Players" = miner display names with highest hashrate
- "Man of the Match" = miner with highest difficulty share during the match

### 10.3 Advertising & Sponsorship Integration

```
┌────────────────────────────────────────────┐
│   SWAN BITCOIN Solo Mining World Cup 2027   │
│                                              │
│   🇵🇹 Portugal  2 - 1  Spain 🇪🇸             │
│                                              │
│   ⚡ Presented by Bitaxe Open Source Mining  │
│   ⛏️  Powered by TheBitcoinGame.com          │
└────────────────────────────────────────────┘
```

- Naming rights for the World Cup (e.g., "SWAN Solo Mining World Cup")
- Ad slots during match recaps
- Sponsored badges (e.g., "Trezor Security Badge" for node runners)
- Banner ads from Bitcoin companies on match pages

### 10.4 Champions League (Club Mode)

After World Cup success, launch club-based leagues:
- Users create or join "clubs" (essentially cooperatives rebranded)
- Domestic leagues per country (if enough miners)
- International Champions League for top clubs
- Promotion/relegation system

---

## 11. Phase 7 — Personalized Lotteries / Pool Mode (Weeks 24–32)

### 11.1 Concept

For miners who want more frequent "wins" with smaller prizes, we offer a pool mining mode with dramatically elevated share difficulty. Instead of finding shares every 2-3 seconds (standard pool), we raise difficulty so shares are found much less frequently — turning each share into a "lottery ticket" with a real BTC payout.

### 11.2 Technical Implementation

This requires running ckpool in **pool mode** (not solo mode) with custom difficulty management:

```c
/* Modified vardiff logic for lottery mode */
/* Instead of targeting ~3 shares/second, we target based on desired prize tier */

typedef struct lottery_tier {
    const char *name;
    double target_interval_seconds;  /* How often miner should "win" on average */
    double prize_multiplier;         /* Fraction of block reward proportional to work */
} lottery_tier_t;

static lottery_tier_t lottery_tiers[] = {
    {"micro",   3600,       1.0},   /* ~1 hour: tiny prize */
    {"daily",   86400,      1.0},   /* ~1 day */
    {"weekly",  604800,     1.0},   /* ~1 week */
    {"monthly", 2592000,    1.0},   /* ~1 month: larger prize */
    {"yearly",  31536000,   1.0},   /* ~1 year: significant prize */
};

/* Calculate required share difficulty for a given hashrate and interval */
static double calc_lottery_diff(double hashrate_ths, double target_seconds) {
    /* shares_per_second = hashrate / difficulty */
    /* target_seconds = difficulty / hashrate */
    /* difficulty = hashrate * target_seconds */
    return hashrate_ths * 1e12 * target_seconds / 4294967296.0;
}
```

### 11.3 Prize Pool Economics

The lottery pool works like a traditional mining pool:
- All miners contribute hashrate
- Block rewards are distributed proportional to shares submitted
- Since shares are very rare (high difficulty), each share represents a significant portion of work
- Prize = (your_share_difficulty / pool_total_work_since_last_block) × block_reward
- **Non-custodial:** Payouts via Lightning or on-chain to miner's address

### 11.4 Lottery Visualization

When a miner finds a share (their "lottery ticket"), the game visualization plays:
- Slot machine reels spin and land on their prize amount
- Scratch card reveals their payout
- All animated with real-time BTC/fiat conversion display

---

## 12. Phase 8 — Cooperatives & Social (Weeks 20–26)

### 12.1 Cooperative Mining

Groups of friends combine their hashrate for better odds in lottery games and World Cup:

- **Creation:** Any user can create a cooperative (requires LN deposit for anti-spam)
- **Invite system:** Share an invite code/link
- **Combined hashrate:** Displayed as team total on leaderboards
- **Non-custodial:** The cooperative designates a multisig or single payout address — the platform never touches funds
- **Internal splits:** Cooperative members handle distribution among themselves

### 12.2 Social Features

- **Global chat** (Nostr-integrated or custom)
- **Cooperative chat rooms**
- **Share your lottery results** (generate shareable card images)
- **Follow other miners** to see their activity feed
- **Nostr integration** for identity and social graph

---

## 13. Phase 9 — NoCoiners Onboarding & Education (Weeks 22–28)

### 13.1 The Bitaxe Gift Flow

```
Bitcoiner buys Bitaxe → configures it pointing to thebitcoingame.com
→ gifts it to nocoiner friend/family
→ nocoiner plugs it in
→ sees lottery animations on dashboard
→ gets curious: "What is this Bitcoin thing?"
→ education track unlocks progressively
→ nocoiner falls down the rabbit hole
```

### 13.2 Education Tracks

**Track 1: "What's Happening on My Bitaxe?"**
- What is mining? (visual explanation with their actual hashrate)
- What is a hash? (interactive demo)
- What is difficulty? (shown relative to their miner)
- Why does this matter for Bitcoin?

**Track 2: "Understanding Bitcoin"**
- What is money? Why Bitcoin?
- How does Bitcoin work? (blocks, transactions, nodes)
- What is the halving?
- Bitcoin vs. traditional finance

**Track 3: "Securing Your Bitcoin"**
- Hardware wallets explained
- Seed phrases
- Self-custody best practices
- Setting up your first wallet

**Track 4: "Running a Node"**
- Why run a node?
- Step-by-step setup guide
- Connecting your miner to your own node
- Earn the "Node Runner" badge

Each lesson completion = XP + potential badge. Gamified progression keeps engagement.

### 13.3 Starter Kit Partnerships

When a nocoiner completes Track 1, offer discounted "Starter Kit":
- Bitaxe (if they don't have one)
- Hardware wallet (Trezor/Coldcard partnership)
- Metal seed backup
- Discount code for a local Bitcoin conference

---

## 14. Phase 10 — Lightning Network Integration & Betting (Weeks 28–36)

### 14.1 LN Infrastructure

- **LND or CLN node** for platform Lightning operations
- **LNbits** for account management and wallet abstraction
- Use cases: betting deposits/withdrawals, micro-prizes in lottery mode, tipping

### 14.2 Betting Markets

For World Cup and League matches:

```python
BETTING_MARKETS = {
    "match_winner": {
        "type": "moneyline",
        "options": ["Country A", "Country B", "Draw"],
        "description": "Who will win the match?"
    },
    "total_hashrate": {
        "type": "over_under",
        "line": "dynamic",  # Set based on historical data
        "description": "Total combined hashrate over/under X PH/s"
    },
    "first_block": {
        "type": "prop_bet",
        "options": ["Country A finds block first", "Country B", "Neither"],
        "description": "Which team finds a block first?"
    },
    "highest_diff": {
        "type": "futures",
        "description": "Which miner will post highest difficulty this week?"
    }
}
```

### 14.3 Legal Considerations

- Bitcoin-to-Bitcoin betting (no fiat on/off ramps)
- Peer-to-peer structure where possible
- Geographic restrictions where required
- Consult with legal counsel per jurisdiction
- Consider using a decentralized oracle model

---

## 15. Phase 11 — Monetization Systems (Ongoing from Phase 4)

| Revenue Stream | Phase | Description |
|---------------|-------|-------------|
| Hardware sales | 4+ | Sell Bitaxes, mining heaters, nodes. Partner with manufacturers or white-label |
| Advertising | 6+ | Banner ads from Bitcoin companies on dashboard, lottery, World Cup pages |
| World Cup naming rights | 6+ | Annual sponsorship deal for naming the World Cup |
| Pool fee (lottery mode) | 7+ | Standard 1-2% pool fee on lottery mode payouts |
| Betting commission | 10+ | Small % on LN bets (vigorish/juice) |
| Starter kits | 9+ | Affiliate/markup on curated hardware bundles for nocoiners |
| Gamification licensing | 10+ | License the gamification engine to other mining operations/casinos |
| Premium features | 5+ | Custom coinbase signatures, advanced analytics, API access |
| Merchandise | 4+ | World Cup jerseys, badges as physical pins, mining-themed gear |

---

## 16. Infrastructure & DevOps

### 16.1 Server Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION INFRASTRUCTURE                      │
└─────────────────────────────────────────────────────────────────┘

REGION: EU-CENTRAL (Primary — Hetzner Frankfurt)
├── Server 1: Bitcoin Core Node (Dedicated)
│   ├── CPU: 8 cores, RAM: 64GB, Storage: 2TB NVMe
│   ├── Bitcoin Core v27+ with ZMQ enabled
│   ├── Full archival node (no pruning)
│   └── ZMQ pub on tcp://10.0.0.1:28332
│
├── Server 2: CKPool Mining Engine (Dedicated)
│   ├── CPU: 16 cores, RAM: 32GB
│   ├── ckpool-solo fork (our customized version)
│   ├── Stratum port: 3333 (TCP, public)
│   ├── Event socket → Event Collector
│   └── Max clients: 100,000+ (epoll-based)
│
├── Server 3: Database (Dedicated)
│   ├── CPU: 16 cores, RAM: 128GB, Storage: 2TB NVMe
│   ├── TimescaleDB (PostgreSQL 16 + TimescaleDB extension)
│   ├── Primary with streaming replication to Server 3b
│   └── Connection pooling via PgBouncer
│
├── Server 3b: Database Replica (Dedicated)
│   ├── Read replica for API queries & analytics
│   └── Continuous backup to S3-compatible storage
│
├── Server 4: Application Cluster
│   ├── CPU: 8 cores, RAM: 32GB
│   ├── Docker Swarm or K3s
│   ├── FastAPI (4 workers behind Uvicorn)
│   ├── Event Collector service
│   ├── Stats Worker service
│   ├── Game Engine service
│   ├── Celery workers (badge computation, notifications)
│   └── Redis (cache + streams + pub/sub)
│
├── Server 5: Frontend / CDN Origin
│   ├── Nginx serving React build
│   ├── SSL termination
│   └── CDN: Cloudflare (caching, DDoS protection, GeoDNS)
│
└── Server 6: Lightning Node
    ├── LND or Core Lightning
    ├── Channel management
    └── LNbits for wallet abstraction

REGION: US-EAST (Relay)
├── Server: CKPool Passthrough + Bitcoin Core (pruned)
└── Reduces latency for US miners

REGION: ASIA (Relay)
├── Server: CKPool Passthrough + Bitcoin Core (pruned)
└── Reduces latency for Asian miners
```

### 16.2 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml (simplified)
name: Deploy

on:
  push:
    branches: [main]

jobs:
  # ── Mining Engine (C) ──
  build-mining-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build ckpool fork
        run: |
          sudo apt-get install build-essential yasm libzmq3-dev
          cd mining-engine
          ./autogen.sh && ./configure --without-ckdb && make
      - name: Run tests
        run: cd mining-engine && make check
      - name: Build Docker image
        run: docker build -t tbg-mining:${{ github.sha }} mining-engine/
      - name: Push to registry
        run: docker push registry.thebitcoingame.com/mining:${{ github.sha }}

  # ── API (Python) ──
  build-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          cd api
          pip install -r requirements.txt
          pytest tests/ -v --cov
      - name: Build & push
        run: |
          docker build -t tbg-api:${{ github.sha }} api/
          docker push registry.thebitcoingame.com/api:${{ github.sha }}

  # ── Dashboard (React) ──
  build-dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: |
          cd dashboard
          npm ci && npm run build
          npm run test
      - name: Deploy to CDN
        run: |
          aws s3 sync dashboard/dist/ s3://tbg-frontend/
          aws cloudfront create-invalidation --distribution-id $CF_DIST --paths "/*"

  # ── Deploy to servers ──
  deploy:
    needs: [build-mining-engine, build-api, build-dashboard]
    runs-on: ubuntu-latest
    steps:
      - name: Deploy mining engine
        run: |
          ssh deploy@mining.thebitcoingame.com \
            "docker pull registry.thebitcoingame.com/mining:${{ github.sha }} && \
             docker-compose up -d mining-engine"
      - name: Deploy API (rolling update)
        run: |
          ssh deploy@app.thebitcoingame.com \
            "docker pull registry.thebitcoingame.com/api:${{ github.sha }} && \
             docker-compose up -d --no-deps api"
```

### 16.3 Monitoring & Alerting

| Tool | Purpose |
|------|---------|
| Prometheus + Grafana | Metrics (hashrate, connections, share rate, API latency) |
| Loki | Log aggregation from all services |
| PagerDuty / Opsgenie | On-call alerting |
| UptimeRobot | External uptime monitoring (stratum port, API, dashboard) |
| Custom: Block monitor | Alert if Bitcoin Core falls behind, or if ckpool stops submitting shares |

**Critical alerts (page immediately):**
- ckpool process dies or stops accepting connections
- Bitcoin Core loses sync (>2 blocks behind)
- Database replication lag > 30 seconds
- Block found but not submitted successfully
- Share rate drops to 0 for > 5 minutes (indicates stratum issue)

### 16.4 Backup Strategy

- **Database:** Continuous WAL archiving to S3 + daily pg_dump snapshots
- **Bitcoin Core:** Blockchain data is recoverable (just re-sync), but backup wallet.dat
- **ckpool logs:** Rotated daily, archived to S3 for 1 year
- **Configuration:** All in git, secrets in HashiCorp Vault or SOPS
- **Disaster recovery:** Full infrastructure-as-code with Terraform/Ansible, can rebuild from scratch in < 2 hours

---

## 17. Security Architecture

### 17.1 Network Security

- **Stratum port (3333):** Public, rate-limited per IP (max 10 connections/IP)
- **API:** Behind Cloudflare, rate-limited, JWT auth required for most endpoints
- **Database:** Internal network only, no public exposure
- **SSH:** Key-only, jump box required, 2FA
- **Bitcoin Core RPC:** Internal network only, strong rpcauth credentials

### 17.2 Mining Security

- **No custody of funds:** Solo miners mine to their own addresses. Lottery mode pays directly
- **DDoS protection:** Cloudflare for web, iptables rate-limiting for stratum port
- **Hashrate hijacking prevention:** Plan for Stratum V2 encryption
- **Share validation:** All shares cryptographically verified in ckpool's stratifier

### 17.3 Application Security

- **JWT tokens:** Short-lived (1h), refresh via signed message
- **Input validation:** Pydantic models on all API endpoints
- **SQL injection:** Parameterized queries via asyncpg (no ORM raw SQL)
- **XSS:** React's built-in escaping + CSP headers
- **Rate limiting:** Per-endpoint, per-user, with Redis token bucket
- **Dependency scanning:** Dependabot + Snyk
- **Penetration testing:** Annual third-party pentest

---

## 18. Stratum V2 Roadmap

While launching with Stratum V1 (ckpool native), we plan Stratum V2 support for enhanced security and decentralization:

### 18.1 Phase A: SV1 → SV2 Translation Proxy (Month 6-9)

- Deploy SRI (Stratum Reference Implementation) Translation Proxy
- SV1 miners connect to proxy, which speaks SV2 to our pool backend
- Immediate benefits: encrypted connections, reduced bandwidth

### 18.2 Phase B: Native SV2 Pool Support (Month 9-12)

- Integrate SV2 roles library (Rust, with C FFI bindings)
- Native SV2 endpoint alongside SV1
- Support Job Negotiation protocol for miner-selected transactions

### 18.3 Phase C: Full Decentralization (Month 12+)

- Miners running their own Bitcoin Core + Template Provider
- Miners propose their own block templates
- Our pool validates and tracks work, but miners choose transactions
- Maximum censorship resistance — core to The Bitcoin Game's mission

---

## 19. Phase 12 — Decentralized Mining (User-Run Pools & Nodes) (Months 9-12)

> **Full documentation:** `docs/ckpool-service/decentralized-mining.md`

### 19.1 Vision

Beyond hosting a mining pool, The Bitcoin Game will evolve to support users running their own complete mining infrastructure at home — their own Bitcoin Core node, their own ckpool instance, and their own miners — while still participating in The Bitcoin Game platform (dashboard, badges, leaderboards, World Cup, etc.).

This is the ultimate decentralization play: miners aren't just mining solo, they're running the entire stack. The Bitcoin Game becomes a **gamification layer** that sits on top of any mining setup, not a centralized pool that holds all the hashrate.

### 19.2 Two Mining Modes

| Feature | Mode A: Hosted Mining | Mode B: Self-Hosted Mining |
|---|---|---|
| **Who runs ckpool?** | We do | The user does |
| **Who runs Bitcoin Core?** | We do | The user does |
| **Who picks transactions?** | We do (or miners via SV2) | The user does |
| **Share verification** | ckpool validates internally | TBG Proxy sends cryptographic proofs; our backend verifies independently |
| **Trust level** | Full (we control everything) | Verified External (cryptographic proof) |
| **Stratum connection** | Miner → our ckpool :3333 | Miner → user's ckpool → TBG Proxy → our API |
| **Dashboard access** | Full | Full (verified shares appear identically) |
| **Competitive features** | Full access | Configurable per competition (see below) |

### 19.3 The TBG Proxy

A lightweight open-source daemon (Go or Rust, <10MB binary) that users install alongside their ckpool:

- Reads share data from the user's ckpool log files or Unix socket
- Packages verifiable share proofs (block header + coinbase TX + merkle branch + nonces)
- Sends proofs to our REST API over HTTPS
- Our backend independently verifies each share using the proof data:
  1. Verify the user's BTC address is in the coinbase output
  2. Reconstruct merkle root from coinbase + merkle branch
  3. Double-SHA256 the block header → verify difficulty
  4. Verify `prev_hash` is a real recent block (anti-replay)
  5. Verify `bits` field matches network difficulty (anti-inflation)
  6. Check timestamp is within acceptable range

### 19.4 Anti-Fraud Measures

- **Replay attacks:** Reject shares with stale `prev_hash` (must reference a recent block)
- **Difficulty inflation:** Independent SHA256 verification — hash difficulty cannot be faked
- **Fake coinbase:** Merkle root verification ensures coinbase wasn't tampered with
- **Rate limiting:** Shares arriving faster than physically possible for claimed hashrate are flagged
- **Block verification:** Block-found claims are verified against the Bitcoin network

### 19.5 Impact on Current Architecture

To support this in the future with minimal rework, the following design decisions are made **now** during Phases 1-5:

1. **`source` field in all events** — Every event includes `source: "hosted"` from day one. The proxy will emit events with `source: "proxy"`. No schema changes needed later.
2. **Share validation as a separate module** — The share verification logic is extracted into a standalone function/service, not coupled to ckpool internals. This same logic validates proxy-submitted proofs.
3. **BTC address as universal identity** — Already the case. Works identically for hosted and self-hosted miners.
4. **Pluggable event pipeline** — Redis Streams can accept events from multiple sources. Adding a new input (proxy API → event collector) requires no pipeline changes.
5. **Raw proof storage** — The `shares` table includes a `proof_data` JSONB column (nullable). Hosted shares leave it null; proxy shares store the full proof for audit.

### 19.6 Competitive Feature Trust Levels

| Feature | Hosted (Level 1) | Verified External (Level 2) | Notes |
|---|---|---|---|
| Dashboard & stats | Full | Full | Identical UX |
| Badges & XP | Full | Full | Verified shares earn equally |
| Streaks | Full | Full | Any verified share counts |
| Leaderboards | Included | Separate + Combined views | Users can toggle |
| World Cup | Full | Full (if cryptographically verified) | Team hashrate counted |
| Betting | Full | Excluded | Highest trust required for money |
| Cooperatives | Full | Full | Mixed source co-ops supported |

### 19.7 Timeline

This feature is planned for **Months 9-12** (after the core platform is stable). Development includes:

- **Month 9-10:** TBG Proxy development (Go/Rust daemon + installer)
- **Month 10-11:** Share Verification Service (independent proof validation)
- **Month 11:** API endpoints for proxy communication
- **Month 11-12:** Dashboard integration (source indicators, combined leaderboards)
- **Month 12:** Beta with select self-hosted miners

---

## 20. Team & Roles

| Role | Count | Responsibility |
|------|-------|---------------|
| C Systems Engineer | 1-2 | ckpool fork, event emitter, performance tuning, Stratum V2 integration |
| Python Backend Engineer | 1-2 | FastAPI, event pipeline, game engine, stats workers |
| React Frontend Engineer | 1-2 | Dashboard, game animations, Three.js lottery visualizations |
| DevOps / SRE | 1 | Infrastructure, CI/CD, monitoring, security |
| Designer (UI/UX) | 1 | Visual design, game art, brand identity, animation design |
| Bitcoin Protocol Specialist | 0.5 | Mining protocol expertise, Lightning integration, consulting |
| Product Manager | 1 | Roadmap, user research, community management |
| Community / Marketing | 1 | Bitcoin community engagement, social media, conference presence |

**Minimum viable team to launch Phase 1-5:** 4-5 people (1 C dev, 1 Python+DevOps, 1 React, 1 designer, 1 product/community)

---

## 21. Timeline Summary

| Phase | Name | Duration | Dependencies |
|-------|------|----------|-------------|
| 0 | Foundation & Research | Weeks 1-4 | — |
| 1 | Mining Engine (ckpool fork) | Weeks 3-10 | Phase 0 |
| 2 | Event Pipeline & Data Layer | Weeks 7-12 | Phase 1 partially |
| 3 | Backend API | Weeks 10-16 | Phase 2 |
| 4 | Frontend Dashboard | Weeks 12-20 | Phase 3 partially |
| 5 | Gamification Engine | Weeks 14-22 | Phase 3, 4 |
| **MVP LAUNCH** | **Solo mining + dashboard + basic lottery + badges** | **Week 20** | **Phases 1-5** |
| 6 | World Cup & Leagues | Weeks 18-28 | Phase 5 |
| 7 | Personalized Lotteries (Pool Mode) | Weeks 24-32 | Phase 1, 5 |
| 8 | Cooperatives & Social | Weeks 20-26 | Phase 3, 4 |
| 9 | NoCoiners & Education | Weeks 22-28 | Phase 4, 5 |
| 10 | Lightning & Betting | Weeks 28-36 | Phase 6 |
| 11 | Monetization (full) | Ongoing | All phases |
| SV2 | Stratum V2 Integration | Months 6-12 | Phase 1 stable |
| **12** | **Decentralized Mining (User-Run Pools)** | **Months 9-12** | **Phases 1-5 stable, SV2 Phase C** |

**MVP target: ~5 months from project start**
**Full platform: ~9 months from project start**
**Decentralized mining: ~12 months from project start**

---

## 22. Risk Register

| Risk | Severity | Probability | Mitigation |
|------|----------|------------|------------|
| ckpool fork introduces bugs → miners lose blocks | Critical | Medium | Extensive testnet testing, signet CI, phased rollout, keep close to upstream |
| Low initial adoption → empty leaderboards | High | High | Pre-launch community building, partner with Bitaxe community, conference presence |
| Legal issues with betting in certain jurisdictions | High | Medium | Geo-blocking, legal review per jurisdiction, peer-to-peer model |
| Bitcoin Core consensus changes affect mining | Medium | Low | Stay updated with Bitcoin Core releases, participate in community |
| GPLv3 contamination of proprietary code | High | Low | Strict process separation (Unix sockets), legal review of architecture |
| Competitor launches similar product | Medium | Medium | First-mover advantage, community lock-in via badges/streaks, open-source mining engine builds trust |
| Scaling issues under high miner count | Medium | Medium | ckpool handles 100k+ miners natively, horizontal scaling via passthrough nodes |
| Security breach / hack | Critical | Low | Security audits, no custody of funds, minimal attack surface |
| AI-generated content (match recaps) quality issues | Low | Medium | Human review, community feedback loop, iterative improvement |
| Self-hosted miners submitting fraudulent shares | High | Medium | Cryptographic share proof verification, rate limiting, trust levels for competitive features |
| TBG Proxy adoption too low to justify development | Medium | Medium | Start with hosted-only, build proxy only after proving platform value; keep proxy simple |
| Regulatory risk from operating a mining pool | Medium | Low | Non-custodial design (miners mine to their own address), no custody of funds |

---

## Appendix A: Key External Resources

- **ckpool-solo source:** `bitbucket.org/ckolivas/ckpool-solo/src/solobtc/`
- **ckpool documentation:** `github.com/ctubio/ckpool` (unofficial mirror with good README)
- **Stratum V2 SRI:** `github.com/stratum-mining/stratum`
- **Stratum V2 spec:** `github.com/stratum-mining/sv2-spec`
- **DATUM protocol (OCEAN):** Reference for alternative decentralized mining
- **Bitaxe project:** `github.com/skot/bitaxe` (primary target hardware)
- **TimescaleDB docs:** `docs.timescale.com`
- **LNbits:** `github.com/lnbits/lnbits`

---

## Appendix B: ckpool-solo Configuration Reference

```json
{
    "btcd": [{
        "url": "127.0.0.1:8332",
        "auth": "rpcuser",
        "pass": "rpcpassword",
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
    "maxclients": 100000
}
```

---

## 23. Detailed Documentation Index

The project maintains comprehensive documentation beyond this plan. Below is the complete index:

### Frontend Dashboard (Completed)

| Document | Path | Description |
|---|---|---|
| Design Plan | `docs/thebitcoingame-design-plan.md` | Complete UI/UX design specification |
| Product Overview | `docs/product-overview.md` | Product overview and feature descriptions |
| Design Roadmap | `roadmap/design/00-overview.md` | Frontend implementation roadmap (11 phases, all completed) |

### CKPool Service (Mining Engine)

| Document | Path | Description |
|---|---|---|
| **Master Plan** | `docs/ckpool-service/00-master-plan.md` | Architecture, communication flows, event system, licensing |
| **Decentralized Mining** | `docs/ckpool-service/decentralized-mining.md` | Future user-run pools/nodes feature design |
| Roadmap Overview | `docs/ckpool-service/roadmap/00-overview.md` | Development roadmap index |
| Phase 0: Foundation | `docs/ckpool-service/roadmap/phase-00-foundation.md` | Source study, dev environment, CI/CD |
| Phase 1: Core Fork | `docs/ckpool-service/roadmap/phase-01-core-fork.md` | Event emission, diff tracking, event collector |
| Phase 2: Testing | `docs/ckpool-service/roadmap/phase-02-testing.md` | Unit tests, integration tests, signet validation, load testing |
| Phase 3: Enhanced Features | `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` | Coinbase sigs, taproot, vardiff, health monitoring |
| Phase 4: Multi-Instance | `docs/ckpool-service/roadmap/phase-04-multi-instance.md` | Geo-distribution, relay nodes, GeoDNS, failover |
| Phase 5: Production | `docs/ckpool-service/roadmap/phase-05-production.md` | Security audit, optimization, mainnet deployment |
| Phase 6: Stratum V2 | `docs/ckpool-service/roadmap/phase-06-stratum-v2.md` | SV2 proxy, native support, job negotiation |

### Open-Source Documentation (Public Repository)

| Document | Path | Description |
|---|---|---|
| README | `docs/ckpool-service/open-source/README.md` | Public repository README |
| License Header | `docs/ckpool-service/open-source/LICENSE-HEADER.md` | GPLv3 header templates for source files |
| Contributing Guide | `docs/ckpool-service/open-source/CONTRIBUTING.md` | How to contribute to the fork |
| Changelog | `docs/ckpool-service/open-source/CHANGELOG.md` | Version history |
| Architecture | `docs/ckpool-service/open-source/architecture.md` | Technical architecture for contributors |
| Events | `docs/ckpool-service/open-source/events.md` | Event system documentation |
| Configuration | `docs/ckpool-service/open-source/configuration.md` | Full configuration reference |
| Building | `docs/ckpool-service/open-source/building.md` | Build from source guide |
| Testing | `docs/ckpool-service/open-source/testing.md` | Test suite documentation |

### Backend Service (Python API + Dashboard Integration)

| Document | Path | Description |
|---|---|---|
| **Master Plan** | `docs/backend-service/00-master-plan.md` | Full architecture, ~44 tables, ~100 endpoints, service components, data flows |
| Roadmap Overview | `docs/backend-service/roadmap/00-overview.md` | 11-phase roadmap index with gantt chart and dependencies |
| Phase 0: Foundation | `docs/backend-service/roadmap/phase-00-foundation.md` | FastAPI scaffolding, Docker, Alembic, middleware, CI/CD |
| Phase 1: Authentication | `docs/backend-service/roadmap/phase-01-authentication.md` | Bitcoin message signing, JWT, user CRUD, settings, API keys |
| Phase 2: Mining Data | `docs/backend-service/roadmap/phase-02-mining-data.md` | Workers, shares, hashrate, blocks, event consumers |
| Phase 3: Dashboard RT | `docs/backend-service/roadmap/phase-03-dashboard-realtime.md` | WebSocket, live feeds, stats aggregation, frontend wiring |
| Phase 4: Gamification | `docs/backend-service/roadmap/phase-04-gamification.md` | Badge engine, XP/levels, streaks, trigger pipeline |
| Phase 5: Games & Lottery | `docs/backend-service/roadmap/phase-05-games-lottery.md` | Weekly lottery, game data, sessions |
| Phase 6: Competition | `docs/backend-service/roadmap/phase-06-competition.md` | Leaderboards, World Cup, leagues |
| Phase 7: Social | `docs/backend-service/roadmap/phase-07-social-cooperatives.md` | Cooperatives, notifications, activity feed, public profiles |
| Phase 8: Education | `docs/backend-service/roadmap/phase-08-education.md` | Tracks, lessons, completion, XP integration |
| Phase 9: Integration | `docs/backend-service/roadmap/phase-09-frontend-integration.md` | Replace all mocks, TanStack Query, E2E tests |
| Phase 10: Production | `docs/backend-service/roadmap/phase-10-production.md` | Security audit, performance, monitoring, deployment |

### Implementation Prompts (for AI Agents)

| Document | Path | Description |
|---|---|---|
| CKPool Phase 1 | `docs/prompts/prompt-ckpool-phase1.md` | CKPool core fork + event system |
| CKPool Phases 2-6 | `docs/prompts/prompt-ckpool-phase{2-6}.md` | CKPool testing, features, multi-instance, production, SV2 |
| Backend Phase 0 | `docs/prompts/prompt-backend-phase0.md` | Foundation & project setup |
| Backend Phase 1 | `docs/prompts/prompt-backend-phase1.md` | Authentication & user management |
| Backend Phase 2 | `docs/prompts/prompt-backend-phase2.md` | Mining data API |
| Backend Phase 3 | `docs/prompts/prompt-backend-phase3.md` | Dashboard & real-time |
| Backend Phase 4 | `docs/prompts/prompt-backend-phase4.md` | Gamification engine |
| Backend Phase 5 | `docs/prompts/prompt-backend-phase5.md` | Games & lottery |
| Backend Phase 6 | `docs/prompts/prompt-backend-phase6.md` | Competition system |
| Backend Phase 7 | `docs/prompts/prompt-backend-phase7.md` | Social & cooperatives |
| Backend Phase 8 | `docs/prompts/prompt-backend-phase8.md` | Education system |
| Backend Phase 9 | `docs/prompts/prompt-backend-phase9.md` | Frontend integration |
| Backend Phase 10 | `docs/prompts/prompt-backend-phase10.md` | Production hardening |

---

*This document is a living project plan. Update as architecture decisions are validated and scope evolves.*

**The Bitcoin Game — Decentralizing hashrate, one game at a time. ⛏️🎮**