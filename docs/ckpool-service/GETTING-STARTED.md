# Getting Started — TheBitcoinGame Mining Engine

Step-by-step guide to running and testing the full mining stack locally.

---

## Prerequisites

- **Docker Desktop** (with Docker Compose v2)
- **Python 3.10+** (for the test client)
- **~2GB disk space** (Docker images + signet blockchain)
- **macOS or Linux** (Windows via WSL2 should work but untested)

Verify Docker is running:

```bash
docker compose version
# Docker Compose version v2.x.x
```

---

## Quick Start (5 minutes)

### 1. Start the Stack

```bash
cd services/
docker compose up -d --build
```

This builds and starts 5 containers:

| Container | Purpose | Port |
|-----------|---------|------|
| `tbg-bitcoin-signet` | Bitcoin Core (signet testnet) | 38332 (RPC) |
| `tbg-ckpool` | Mining pool engine (Stratum) | 3333 |
| `tbg-redis` | Event streams (Redis Streams) | 6379 |
| `tbg-timescaledb` | Time-series database | 5432 |
| `tbg-event-collector` | Event pipeline (Python) | - |

First start takes ~2-3 minutes (building ckpool from source).

### 2. Verify All Services Are Running

```bash
docker ps --filter "name=tbg" --format "table {{.Names}}\t{{.Status}}"
```

Expected output:
```
NAMES                 STATUS
tbg-ckpool            Up ... seconds
tbg-event-collector   Up ... seconds
tbg-timescaledb       Up ... seconds (healthy)
tbg-redis             Up ... seconds (healthy)
tbg-bitcoin-signet    Up ... seconds (healthy)
```

### 3. Check CKPool Connected to Bitcoin

```bash
docker logs tbg-ckpool 2>&1 | tail -5
```

Look for:
```
Connected to bitcoind: bitcoin-signet:38332
ckpool stratifier ready
Mining from any incoming username to address bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls
Network diff set to 1.0
```

### 4. Run the Stratum Test Client

```bash
python3 services/test-stratum.py
```

This connects to ckpool, subscribes, authorizes, and submits a test share.
You can specify a custom address:

```bash
python3 services/test-stratum.py localhost 3333 YOUR_BTC_ADDRESS
```

### 5. Verify Events Flowed Through

**Check Redis Streams:**

```bash
# Miner connections
docker exec tbg-redis redis-cli XRANGE mining:miner_connected - +

# Shares submitted
docker exec tbg-redis redis-cli XRANGE mining:share_submitted - +

# Best difficulty updates
docker exec tbg-redis redis-cli XRANGE mining:share_best_diff - +

# Disconnections
docker exec tbg-redis redis-cli XRANGE mining:miner_disconnected - +

# Network blocks
docker exec tbg-redis redis-cli XRANGE mining:new_block_network - +
```

**Check TimescaleDB:**

```bash
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c \
  "SELECT ts, event_type, source, payload->>'user' as miner FROM mining_events ORDER BY ts DESC LIMIT 10;"
```

**Check Event Collector Logs:**

```bash
docker logs --tail 20 tbg-event-collector
```

---

## Mining with cpuminer (Real Hash Submission)

For real mining (not just protocol testing), you need a CPU miner.
A copy of cpuminer has been cloned to the project root.

### Option A: Build cpuminer locally (macOS/Linux)

```bash
cd cpuminer/
# Install dependencies (macOS)
brew install autoconf automake

./autogen.sh
./configure CFLAGS="-O2"
make

# Mine on signet
./minerd -a sha256d -o stratum+tcp://localhost:3333 \
  -u bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls -p x
```

### Option B: Use Docker cpuminer

```bash
# Build a quick cpuminer Docker image
docker build -t tbg-cpuminer ./cpuminer/

# Run it against ckpool
docker run --rm --network host tbg-cpuminer \
  -a sha256d -o stratum+tcp://localhost:3333 \
  -u bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls -p x
```

### What to Expect

With `mindiff=1` and `startdiff=1` on signet, cpuminer will submit shares
rapidly. Each accepted share triggers:
- `share_submitted` event
- `share_best_diff` event (if new personal best)
- Updates to Redis Streams and TimescaleDB

---

## Useful Commands

### Service Management

```bash
# Start all services
docker compose up -d

# Stop all services (preserves data)
docker compose down

# Stop and delete all data (clean start)
docker compose down -v

# Rebuild a specific service
docker compose up -d --build ckpool

# View logs
docker compose logs -f            # All services
docker compose logs -f ckpool     # Just ckpool
docker compose logs -f event-collector  # Just collector
```

### Database Queries

```bash
# Connect to the database
docker exec -it tbg-timescaledb psql -U tbg -d thebitcoingame

# Count events by type
SELECT event_type, COUNT(*) FROM mining_events GROUP BY event_type ORDER BY count DESC;

# Recent shares
SELECT time, btc_address, worker_name, share_diff, is_valid
FROM shares ORDER BY time DESC LIMIT 20;

# Hourly aggregate (after enough data)
SELECT * FROM hourly_shares ORDER BY bucket DESC LIMIT 10;
```

### Redis Inspection

```bash
# List all stream keys
docker exec tbg-redis redis-cli KEYS "mining:*"

# Count entries in a stream
docker exec tbg-redis redis-cli XLEN mining:share_submitted

# Read last 5 entries
docker exec tbg-redis redis-cli XREVRANGE mining:share_submitted + - COUNT 5

# Subscribe to block found notifications (real-time)
docker exec tbg-redis redis-cli SUBSCRIBE blocks:found
```

### Bitcoin Core (Signet)

```bash
# Check sync progress
docker exec tbg-bitcoin-signet bitcoin-cli -signet \
  -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 getblockchaininfo

# Get block count
docker exec tbg-bitcoin-signet bitcoin-cli -signet \
  -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 getblockcount

# Test getblocktemplate (what ckpool calls)
docker exec tbg-bitcoin-signet bitcoin-cli -signet \
  -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 \
  getblocktemplate '{"rules":["segwit","signet"]}'
```

---

## Architecture at a Glance

```
                 Miner (cpuminer)
                      |
                      | Stratum V1 (TCP:3333)
                      v
              +-------+-------+
              |    ckpool     |  <-- GPLv3 C code
              |  (patched)    |     8 event hooks injected
              +-------+-------+
                      |
                      | Unix socket (SOCK_DGRAM)
                      | fire-and-forget, non-blocking
                      v
              +-------+-------+
              | Event Collector|  <-- Proprietary Python
              |   (async)     |     Pydantic validation
              +---+-------+---+
                  |       |
         XADD    |       |  INSERT
                  v       v
              +---+--+ +--+---+
              |Redis | |Timescale|
              |Streams| |  DB    |
              +------+ +--------+
```

**Key Insight:** The Unix socket is the GPL boundary. Everything to the
left of it is GPLv3 (C code). Everything to the right is proprietary
(Python, game engine, frontend). This is how MySQL (GPL) works with
applications via SQL socket.

---

## Event Types

| Event | Trigger | Key Data |
|-------|---------|----------|
| `miner_connected` | Miner authorizes via Stratum | user, worker, ip, initial_diff |
| `share_submitted` | Miner submits a share | user, worker, diff, sdiff, accepted |
| `share_best_diff` | New personal best difficulty | user, new_best, prev_best |
| `block_found` | Pool finds a block | user, height, diff |
| `new_block_network` | New block detected on network | hash, height, diff |
| `miner_disconnected` | Miner disconnects | user, worker, ip |

All events include `"source": "hosted"` (future-proofing for decentralized mining).

---

## Troubleshooting

### "CRITICAL: No bitcoinds active!"

Bitcoin Core hasn't finished initial sync. Check progress:
```bash
docker exec tbg-bitcoin-signet bitcoin-cli -signet \
  -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 \
  getblockchaininfo | grep -E "blocks|headers|verificationprogress"
```

Signet syncs fast (~5 minutes). Wait for `initialblockdownload: false`.

### "Process main pid 1 still exists"

Stale PID file. The docker-compose command handles this automatically.
If it persists:
```bash
docker compose down && docker volume rm services_ckpool-run && docker compose up -d
```

### Event Collector not receiving events

Check the socket exists:
```bash
docker exec tbg-event-collector ls -la /tmp/ckpool/events.sock
```

Check collector logs:
```bash
docker logs tbg-event-collector
```

### TimescaleDB init errors

The GIN index error on first start is harmless (fixed in code, won't affect new installs after `docker compose down -v`). If you see other errors:
```bash
docker compose down -v  # Clean slate
docker compose up -d    # Fresh start
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `services/docker-compose.yml` | Service orchestration |
| `services/ckpool/config/ckpool-signet.conf` | Pool config (address, diff, ports) |
| `services/ckpool/patches/UPSTREAM.lock` | Version pinning (SHA256 + commit) |
| `services/ckpool/patches/apply-patches.sh` | Event hook injection script |
| `services/event-collector/sql/init.sql` | Database schema |
| `services/bitcoin-node/bitcoin.conf` | Bitcoin Core reference config |

---

## Next Steps

After verifying the pipeline works:

1. **Connect the Frontend** — Wire dashboard to Redis Streams for real-time updates
2. **Build the Game Engine** — FastAPI service that processes events into game mechanics
3. **Add cpuminer Docker service** — Persistent miner in docker-compose for dev
4. **Production hardening** — TLS, auth, monitoring, multiple ckpool instances
