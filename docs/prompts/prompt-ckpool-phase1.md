# Prompt: CKPool Service — Phase 0 (Setup) + Phase 1 (Core Fork & Event System)

You are building the mining engine service for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is already complete (React 19 + TypeScript + Vite). Now we need to build the backend, starting with the core mining engine: a fork of **ckpool-solo** (GPLv3, by Con Kolivas).

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. You will create the mining engine service at `services/ckpool/` and the event collector at `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **macOS development machine** — ckpool is Linux-only (epoll, Unix-specific syscalls). ALL ckpool building and running MUST happen inside Docker containers. Do NOT attempt to build ckpool natively on macOS.
2. **No local Bitcoin node** — Use a Docker container running `bitcoind` in **signet mode**. Signet is a tiny test network (~500MB, syncs in 2 minutes). This is NOT a full mainnet node. The Docker Compose stack will include the signet node.
3. **GPLv3 compliance** — All C code modifications to ckpool MUST remain GPLv3. The event collector (Python) is a separate process communicating via Unix socket — it is NOT GPL.
4. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.

---

## Before You Start — Read These Files (in order)

1. `docs/ckpool-service/00-master-plan.md` — Architecture overview, communication flows, event system design, mermaid diagrams. This is your primary reference.
2. `docs/ckpool-service/roadmap/phase-00-foundation.md` — Dev environment setup, build dependencies, CI/CD.
3. `docs/ckpool-service/roadmap/phase-01-core-fork.md` — Core fork implementation details, C code modifications, event emission, event collector service.
4. `docs/ckpool-service/open-source/README.md` — What the fork is and what we're changing.
5. `docs/ckpool-service/open-source/architecture.md` — Technical architecture of the fork.
6. `docs/ckpool-service/open-source/events.md` — Full event system documentation with JSON schemas.
7. `docs/ckpool-service/open-source/configuration.md` — Configuration reference.
8. `docs/ckpool-service/open-source/building.md` — Build from source guide.
9. `docs/thebitcoingame-project-plan.md` — Sections 4 (Phase 0), 5 (Phase 1), and 6 (Phase 2) for context on the overall architecture.

Read ALL of these before writing any code. They contain the exact specifications for what to build.

---

## What You Are Building

### Part 1: Project Structure & Docker Environment

Create the following directory structure:

```
services/
├── ckpool/                          # The ckpool-solo fork (GPLv3)
│   ├── src/                         # C source code (forked from ckpool-solo)
│   │   ├── ckpool.c                 # Main process orchestration
│   │   ├── ckpool.h                 # Core struct definitions
│   │   ├── generator.c              # Bitcoin Core RPC, block templates
│   │   ├── stratifier.c             # Share validation, vardiff, events (MAIN MODIFICATIONS HERE)
│   │   ├── connector.c              # TCP connection management
│   │   ├── libckpool.c              # Utility functions
│   │   ├── libckpool.h              # Utility headers
│   │   ├── bitcoin.c                # Bitcoin-specific functions
│   │   ├── bitcoin.h                # Bitcoin headers
│   │   ├── sha2.c                   # SHA256 implementation
│   │   └── sha2.h                   # SHA256 headers
│   ├── config/
│   │   ├── ckpool-signet.conf       # Signet configuration
│   │   └── ckpool-testnet.conf      # Testnet configuration (optional)
│   ├── Dockerfile                   # Build ckpool in Linux container
│   ├── Makefile                     # Build targets
│   ├── README.md                    # Fork README (copy from docs/ckpool-service/open-source/README.md, adapt)
│   ├── LICENSE                      # GPLv3 full text
│   └── CHANGELOG.md                 # Version history
│
├── event-collector/                 # Python event collector service
│   ├── src/
│   │   ├── __init__.py
│   │   ├── collector.py             # Main event collector (Unix socket → Redis + DB)
│   │   ├── schemas.py               # Event type definitions (Pydantic/dataclass)
│   │   ├── redis_publisher.py       # Redis Streams publisher
│   │   ├── db_writer.py             # TimescaleDB writer
│   │   └── config.py                # Configuration
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_collector.py
│   │   ├── test_schemas.py
│   │   └── test_redis_publisher.py
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── README.md
│
├── bitcoin-node/                    # Bitcoin Core signet node config
│   ├── bitcoin.conf                 # Signet configuration with RPC + ZMQ
│   └── Dockerfile                   # Bitcoin Core signet node
│
└── docker-compose.yml               # Full development stack
```

### Part 2: Docker Compose Development Stack

Create `services/docker-compose.yml` with these services:

```yaml
services:
  # Bitcoin Core signet node (lightweight test network, ~500MB)
  bitcoin-signet:
    image: lncm/bitcoind:v27.0  # or build from Dockerfile
    container_name: tbg-bitcoin-signet
    command:
      - -signet
      - -server=1
      - -rpcuser=tbg
      - -rpcpassword=tbgdev2026
      - -rpcallowip=0.0.0.0/0
      - -rpcbind=0.0.0.0
      - -zmqpubhashblock=tcp://0.0.0.0:28332
      - -zmqpubrawtx=tcp://0.0.0.0:28333
      - -txindex=1
      - -fallbackfee=0.00001
    ports:
      - "38332:38332"   # Signet RPC
      - "28332:28332"   # ZMQ hashblock
    volumes:
      - bitcoin-signet-data:/home/bitcoin/.bitcoin
    healthcheck:
      test: ["CMD", "bitcoin-cli", "-signet", "-rpcuser=tbg", "-rpcpassword=tbgdev2026", "getblockchaininfo"]
      interval: 10s
      timeout: 5s
      retries: 30

  # CKPool mining engine
  ckpool:
    build:
      context: ./ckpool
      dockerfile: Dockerfile
    container_name: tbg-ckpool
    depends_on:
      bitcoin-signet:
        condition: service_healthy
    ports:
      - "3333:3333"     # Stratum port
    volumes:
      - ckpool-logs:/var/log/ckpool
      - ckpool-events:/tmp/ckpool    # Unix socket for events
      - ./ckpool/config:/etc/ckpool
    command: ["/opt/ckpool/bin/ckpool", "-c", "/etc/ckpool/ckpool-signet.conf", "-l", "7"]

  # Redis (event streams + pub/sub)
  redis:
    image: redis:7-alpine
    container_name: tbg-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  # TimescaleDB (PostgreSQL + time-series)
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    container_name: tbg-timescaledb
    environment:
      POSTGRES_USER: tbg
      POSTGRES_PASSWORD: tbgdev2026
      POSTGRES_DB: thebitcoingame
    ports:
      - "5432:5432"
    volumes:
      - timescaledb-data:/var/lib/postgresql/data
      - ./event-collector/sql/init.sql:/docker-entrypoint-initdb.d/init.sql

  # Event Collector (Python — reads from ckpool Unix socket, publishes to Redis + DB)
  event-collector:
    build:
      context: ./event-collector
      dockerfile: Dockerfile
    container_name: tbg-event-collector
    depends_on:
      - redis
      - timescaledb
      - ckpool
    volumes:
      - ckpool-events:/tmp/ckpool    # Shared Unix socket with ckpool
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgresql://tbg:tbgdev2026@timescaledb:5432/thebitcoingame
      SOCKET_PATH: /tmp/ckpool/events.sock

volumes:
  bitcoin-signet-data:
  ckpool-logs:
  ckpool-events:
  redis-data:
  timescaledb-data:
```

### Part 3: CKPool Fork — Getting the Source

The ckpool-solo source must be obtained from the upstream repository. Since we are in a development environment:

1. Create the ckpool Dockerfile that:
   - Uses `ubuntu:22.04` as base
   - Installs build dependencies: `build-essential`, `autoconf`, `automake`, `libtool`, `yasm`, `libzmq3-dev`, `pkg-config`, `git`, `libjansson-dev`
   - Clones ckpool-solo from `https://bitbucket.org/ckolivas/ckpool-solo.git` (branch: `master` or `solobtc`)
   - If the bitbucket clone fails (it can be flaky), use the GitHub mirror: `https://github.com/ckolivas/ckpool-solo.git`
   - Applies our modifications (patches or direct source replacement)
   - Builds with: `./autogen.sh && ./configure --without-ckdb && make`
   - Installs to `/opt/ckpool`

2. For the source modifications, there are TWO approaches — choose the one that works:

   **Approach A (Preferred): Patch files**
   - Clone upstream in Dockerfile
   - Apply `.patch` files for our modifications
   - Create `patches/` directory with diff files

   **Approach B: Full source copy**
   - Clone upstream, copy source to `services/ckpool/src/`
   - Make modifications directly to the copied source
   - Dockerfile copies from local `src/` instead of cloning

   Use **Approach B** for now since it's simpler for development. We can switch to patches for production.

### Part 4: C Code Modifications (The Core of Phase 1)

These are the specific modifications to the ckpool-solo C source code. Read `docs/ckpool-service/roadmap/phase-01-core-fork.md` for the detailed implementation.

#### 4.1 Event Emission System (stratifier.c)

Add to `stratifier.c`:

```c
/* === THE BITCOIN GAME: Event emission via Unix domain socket === */
#include <sys/un.h>

static int event_socket_fd = -1;

/* Initialize event emission socket (called once at startup) */
static void init_event_emitter(ckpool_t *ckp) {
    struct sockaddr_un addr;
    char sockpath[PATH_MAX];

    event_socket_fd = socket(AF_UNIX, SOCK_DGRAM | SOCK_NONBLOCK, 0);
    if (event_socket_fd < 0) {
        LOGWARNING("TBG: Failed to create event socket: %s", strerror(errno));
        return;
    }

    /* Socket path from config, or default */
    snprintf(sockpath, sizeof(sockpath), "%s/events.sock",
             ckp->socket_dir ? ckp->socket_dir : "/tmp/ckpool");

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, sockpath, sizeof(addr.sun_path) - 1);

    if (connect(event_socket_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        LOGWARNING("TBG: Event socket not ready (will retry): %s", strerror(errno));
        close(event_socket_fd);
        event_socket_fd = -1;
    } else {
        LOGNOTICE("TBG: Event emitter connected to %s", sockpath);
    }
}

/* Emit a JSON event to the event pipeline (non-blocking, fire-and-forget) */
static void emit_event(const char *event_type, json_t *data) {
    char buf[4096];

    if (event_socket_fd < 0) return;

    json_t *envelope = json_object();
    json_object_set_new(envelope, "event", json_string(event_type));
    json_object_set_new(envelope, "timestamp", json_integer(time_micros()));
    json_object_set_new(envelope, "source", json_string("hosted"));
    json_object_set(envelope, "data", data);  /* borrows reference */

    char *msg = json_dumps(envelope, JSON_COMPACT);
    if (msg) {
        size_t len = strlen(msg);
        if (len < sizeof(buf)) {
            send(event_socket_fd, msg, len, MSG_DONTWAIT);
        }
        free(msg);
    }
    json_decref(envelope);
}
```

#### 4.2 Hook Points

Add `emit_event()` calls at these locations in `stratifier.c`:

| Hook Location | Event Type | When |
|---|---|---|
| `add_submit()` (after share validation) | `share_submitted` | Every share (valid or invalid) |
| `add_submit()` (when share_diff > user best) | `share_best_diff` | New personal best difficulty |
| `test_block_solve()` (when block found) | `block_found` | Block solve detected |
| `parse_subscribe()` (after auth) | `miner_connected` | New miner connects |
| `__del_client()` | `miner_disconnected` | Miner disconnects |
| VarDiff adjustment code | `diff_updated` | Difficulty changed for a miner |
| Hashrate rolling update | `hashrate_update` | Periodic hashrate recalculation |
| `update_base()` / `block_update()` | `new_block_network` | New block seen on network |

For each hook, construct a `json_t *data` object with the appropriate fields (see event schemas in `docs/ckpool-service/open-source/events.md`) and call `emit_event("event_type", data)`.

**IMPORTANT:** The exact function names and code structure in ckpool-solo may differ slightly from what's described in the docs. You MUST read the actual ckpool-solo source code after cloning it and adapt the hook locations to match the real code. The docs provide the intent and approximate locations — the actual implementation requires reading the real `stratifier.c`.

#### 4.3 Enhanced Difficulty Tracking

In `stratifier.c`, add new fields to the `user_instance_t` struct:

```c
/* === THE BITCOIN GAME: Enhanced difficulty tracking === */
double best_diff_session;     /* Best diff this connection session */
double best_diff_week;        /* Best diff this calendar week */
double best_diff_alltime;     /* Best diff ever (loaded from persistent state) */
time_t best_diff_week_time;   /* Timestamp when weekly best was found */
int64_t total_shares_week;    /* Total shares submitted this week */
int current_week;             /* ISO week number for reset detection */
```

In `add_submit()`, after a valid share is accepted, compare `share_diff` against these fields and update accordingly. When `best_diff_week` is beaten, emit a `share_best_diff` event.

#### 4.4 Coinbase Signature

In `generator.c`, modify the coinbase construction to include our pool tag:

```c
/* Coinbase signature: /TheBitcoinGame/ or /TheBitcoinGame:username/ */
```

The default `btcsig` config parameter already exists in ckpool. We just need to make sure it's set to `/TheBitcoinGame/` in our config.

### Part 5: CKPool Signet Configuration

Create `services/ckpool/config/ckpool-signet.conf`:

```json
{
    "btcd": [{
        "url": "bitcoin-signet:38332",
        "auth": "tbg",
        "pass": "tbgdev2026",
        "notify": true
    }],
    "btcsig": "/TheBitcoinGame-dev/",
    "blockpoll": 100,
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
    "zmqblock": "tcp://bitcoin-signet:28332",
    "maxclients": 1000
}
```

Note: `mindiff: 1` and `startdiff: 1` for signet development (low difficulty so we can test with cpuminer).

### Part 6: Event Collector Service (Python)

Create the Python event collector at `services/event-collector/`. This service:

1. Binds a Unix datagram socket at `/tmp/ckpool/events.sock`
2. Receives JSON events from ckpool
3. Parses and validates event schemas
4. Publishes to Redis Streams (`XADD mining:{event_type}`)
5. Persists to TimescaleDB (shares table, blocks table, worker status)

**Tech stack:**
- Python 3.12+
- `asyncio` for async I/O
- `redis[hiredis]` for Redis Streams
- `asyncpg` for PostgreSQL/TimescaleDB
- `pydantic` for event schema validation
- No web framework needed (this is a socket listener, not an HTTP server)

**Key implementation details:**
- The socket must be created BEFORE ckpool starts (ckpool connects to it)
- Use `asyncio` event loop with `sock_recv()` for non-blocking reads
- Batch database writes for performance (collect shares for 1 second, then batch INSERT)
- Redis XADD with maxlen=100000 to cap stream size
- Log all events at DEBUG level for development

### Part 7: Database Schema

Create `services/event-collector/sql/init.sql` with the database schema. Use the schema from `docs/thebitcoingame-project-plan.md` Section 4.4 (Data Model Design) as the base. Include:

- `users` table (btc_address, display_name, country_code)
- `workers` table (user_id, worker_name, hashrate fields, is_online)
- `shares` hypertable (TimescaleDB — time, user_id, worker_id, difficulty, share_diff, is_valid, source)
- `blocks` table (block_height, block_hash, user_id, reward, confirmations)
- `weekly_best_diff` table (user_id, week_start, best_difficulty)
- TimescaleDB continuous aggregates for hourly stats
- Compression policy (30 days)
- Retention policy (90 days for raw shares)

Add the `source` column (`VARCHAR(16) DEFAULT 'hosted'`) to shares and workers tables from the start (future-proofing for decentralized mining).

### Part 8: Testing with cpuminer

After the Docker stack is running:

1. Wait for Bitcoin signet to sync (1-2 minutes)
2. Wait for ckpool to connect to bitcoind and start accepting connections
3. Test with cpuminer:

```bash
# Install cpuminer on your Mac (or run in Docker)
# Connect to ckpool's stratum port
docker run --rm --network=services_default \
  ghcr.io/cpuminer-multi/cpuminer-multi:latest \
  -a sha256d -t 1 \
  --url=stratum+tcp://ckpool:3333 \
  --userpass=tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx:x

# In another terminal, watch events flowing:
docker exec tbg-event-collector python -c "
import asyncio, redis.asyncio as r
async def main():
    c = r.from_url('redis://redis:6379')
    while True:
        events = await c.xread({'mining:share_submitted': '$'}, block=5000)
        for stream, messages in events:
            for msg_id, data in messages:
                print(f'{stream}: {data}')
asyncio.run(main())
"

# Check TimescaleDB for persisted shares:
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "SELECT COUNT(*) FROM shares;"
```

---

## Rules

1. **Read all the docs first.** The `docs/ckpool-service/` directory has comprehensive specifications. Don't reinvent — implement what's documented.
2. **Docker everything.** ckpool does not build on macOS. The entire dev stack runs in Docker Compose.
3. **Don't modify `dashboard/`.** The frontend is done.
4. **GPLv3 compliance.** All C modifications carry the GPL header. The Python event collector is a separate process (not GPL).
5. **Include `source: "hosted"` in ALL events** from day one. This is critical for future-proofing.
6. **Test end-to-end.** The definition of done is: cpuminer → ckpool → events → event collector → Redis Streams + TimescaleDB. The full pipeline must work.
7. **Start simple.** Get ckpool building and running first, then add modifications incrementally. Don't try to implement everything at once.
8. **Handle ckpool clone failures gracefully.** The bitbucket repo can be flaky. Try the GitHub mirror (`https://github.com/ckolivas/ckpool-solo.git`) if bitbucket fails. If both fail, try `https://github.com/ctubio/ckpool.git` (community mirror).
9. **Signet, not mainnet.** All Bitcoin operations are on signet. Never configure for mainnet in development.
10. **Log extensively.** During development, log every event at DEBUG level. We need to see the data flowing.

---

## Files to Create

| Action | File |
|---|---|
| CREATE | `services/docker-compose.yml` |
| CREATE | `services/ckpool/Dockerfile` |
| CREATE | `services/ckpool/config/ckpool-signet.conf` |
| CREATE | `services/ckpool/LICENSE` (GPLv3 full text) |
| CREATE | `services/ckpool/README.md` |
| CREATE | `services/ckpool/patches/` (if using patch approach) |
| CREATE | `services/bitcoin-node/bitcoin.conf` |
| CREATE | `services/event-collector/Dockerfile` |
| CREATE | `services/event-collector/requirements.txt` |
| CREATE | `services/event-collector/pyproject.toml` |
| CREATE | `services/event-collector/src/__init__.py` |
| CREATE | `services/event-collector/src/collector.py` |
| CREATE | `services/event-collector/src/schemas.py` |
| CREATE | `services/event-collector/src/redis_publisher.py` |
| CREATE | `services/event-collector/src/db_writer.py` |
| CREATE | `services/event-collector/src/config.py` |
| CREATE | `services/event-collector/sql/init.sql` |
| CREATE | `services/event-collector/tests/__init__.py` |
| CREATE | `services/event-collector/tests/test_collector.py` |
| CREATE | `services/event-collector/tests/test_schemas.py` |
| CREATE | `services/event-collector/README.md` |

---

## Definition of Done

1. `docker compose up` starts the full stack (bitcoin-signet, ckpool, redis, timescaledb, event-collector)
2. Bitcoin signet syncs and ckpool connects to it successfully
3. ckpool accepts Stratum connections on port 3333
4. Connecting cpuminer to ckpool results in shares being submitted
5. ckpool emits JSON events to the Unix domain socket for each share
6. Event collector receives events and publishes to Redis Streams
7. Event collector persists shares to TimescaleDB
8. `share_submitted`, `miner_connected`, and `miner_disconnected` events flow end-to-end
9. The `source: "hosted"` field is present in all events
10. Database schema includes all tables from the data model (users, workers, shares, blocks, weekly_best_diff)
11. Redis Streams contain events that can be read by consumers
12. All Python code passes type checking and basic tests

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Docker Compose + Bitcoin signet** — Get the signet node running and syncing
2. **CKPool Dockerfile** — Clone upstream, build vanilla ckpool-solo (no modifications yet), verify it starts
3. **CKPool config** — Create signet config, verify ckpool connects to bitcoind
4. **Test vanilla ckpool** — Connect cpuminer, verify shares are accepted (check ckpool logs)
5. **Event emission C code** — Add `init_event_emitter()`, `emit_event()`, and hook points
6. **Rebuild ckpool** — Rebuild with modifications, verify it still starts
7. **Event collector** — Build the Python service, bind the Unix socket
8. **Database schema** — Create TimescaleDB tables
9. **Wire it up** — Event collector reads from socket, writes to Redis + DB
10. **End-to-end test** — cpuminer → ckpool → events → Redis + TimescaleDB

**Critical: Get step 4 working before attempting step 5.** A working vanilla ckpool is the foundation. Only add modifications once the base is proven.
