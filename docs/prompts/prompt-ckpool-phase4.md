# Prompt: CKPool Service — Phase 4 (Multi-Instance & Geo-Distribution)

You are continuing to build the mining engine service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phases 1-3 are complete: the ckpool fork with event emission is working, the testing infrastructure is in place, and enhanced features (per-user coinbase signatures, taproot support, enhanced VarDiff, health monitoring, AsicBoost verification) are all operational.

Phase 4 introduces multi-region deployment: a primary ckpool instance in EU with relay instances in US-East and Asia, connected via NATS JetStream for cross-region event replication. The entire multi-region topology is simulated on a single machine using Docker Compose with artificial network latency.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/` (do not touch). The mining engine lives in `services/ckpool/` and the event collector in `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **macOS development machine** — ckpool is Linux-only (epoll, Unix-specific syscalls). ALL ckpool building and running MUST happen inside Docker containers. Do NOT attempt to build ckpool natively on macOS.
2. **No production infrastructure** — Everything runs locally in Docker Compose. Multi-region is simulated using separate Docker networks with artificial latency via `tc netem`. No cloud servers are provisioned in this phase.
3. **Signet only** — All Bitcoin Core nodes run on signet. The primary runs a full archival signet node; the relays run pruned signet nodes. Never configure for mainnet.
4. **GPLv3 compliance** — All C code modifications to ckpool MUST remain GPLv3. The event collector (Python) and NATS configuration are separate — not GPL.
5. **Do not touch `dashboard/`** — The frontend is complete. Do not modify anything in the dashboard directory.
6. **Single machine simulation** — The "3 regions" are 3 Docker Compose networks on one machine. The latency bridge container uses `tc netem` to add artificial delay between networks. This is a development simulation, not a real multi-datacenter deployment.

---

## Before You Start — Read These Files (in order)

1. `docs/ckpool-service/00-master-plan.md` — Architecture overview, communication flows, event system design. Primary reference for the overall system.
2. `docs/ckpool-service/roadmap/phase-04-multi-instance.md` — Full Phase 4 specification. This is your detailed implementation blueprint. Read every section carefully — it contains architecture diagrams, C code snippets, NATS configuration, Docker Compose templates, failover logic, and test scenarios.
3. `docs/ckpool-service/roadmap/phase-03-enhanced-features.md` — Phase 3 deliverables, especially Section 5 (Health Monitoring) which Phase 4 depends on for health checks.
4. `docs/ckpool-service/roadmap/phase-01-core-fork.md` — Original event emission system. The relay event system extends this.
5. `docs/ckpool-service/open-source/events.md` — Event schemas. Relay events add a `region` field to the existing schemas.
6. `docs/ckpool-service/open-source/architecture.md` — CKPool process architecture (generator, stratifier, connector). Understanding these is essential for passthrough mode.
7. `docs/ckpool-service/open-source/configuration.md` — Configuration reference. Relay mode adds new config parameters.

Read ALL of these before writing any code. The Phase 4 roadmap document (`phase-04-multi-instance.md`) is especially critical — it contains the exact specifications, code snippets, and architecture for everything you need to build.

---

## What You Are Building

### Part 1: CKPool Passthrough/Relay Mode (C Code)

Implement passthrough mode in ckpool. In passthrough mode, a relay instance handles miner connections locally (fast TCP, Stratum parsing, share validation, VarDiff) but delegates block template generation to the primary instance.

#### 1.1 Relay Configuration Support

Extend ckpool's configuration parser to support a `mode` field and a `primary` connection block:

```json
{
    "mode": "passthrough",
    "primary": {
        "host": "ckpool-primary",
        "port": 8880,
        "auth_token": "relay-shared-secret",
        "template_push_port": 8881,
        "reconnect_interval": 5
    },
    "region": "us-east",
    "btcd": [{
        "url": "bitcoind-relay-us:38332",
        "auth": "tbg",
        "pass": "tbgdev2026",
        "notify": true
    }],
    "serverurl": ["0.0.0.0:3333"],
    "events": {
        "enabled": true,
        "socket_path": "/tmp/ckpool/events.sock",
        "nats_url": "nats://nats-hub:4222",
        "nats_subject": "mining.events.us-east"
    }
}
```

Add the following to `ckpool.h` or equivalent:

- `relay_connection_t` struct with fields for the TCP connection to primary, reconnect state, and independent mode flag
- Parse the `mode`, `primary`, and `region` fields from the JSON config
- When `mode` is absent or `"primary"`, operate as normal (existing behavior)
- When `mode` is `"passthrough"`, activate relay logic

#### 1.2 Template Synchronization

In passthrough mode, the generator process does NOT call `getblocktemplate` from the local Bitcoin Core node. Instead:

1. The primary ckpool instance pushes new block templates to all connected relays over a persistent TCP connection (port 8881).
2. A background thread in the relay (`relay_template_receiver`) listens for incoming templates.
3. When a template arrives, it is parsed and applied as if it came from the local Bitcoin Core node (`apply_workbase_from_template()`).
4. Miners connected to the relay immediately receive a `mining.notify` with the new work.

See Section 3.2 and 3.3 of `phase-04-multi-instance.md` for the exact C implementation details, including the `relay_connection_t` struct and the `relay_template_receiver` thread function.

#### 1.3 Dual Block Submission

When a relay detects a block solve (in `test_block_solve()`), it must submit as fast as possible via two paths simultaneously:

1. **Local submission**: `submitblock` to the relay's local pruned Bitcoin Core node (fast, same machine)
2. **Remote submission**: Send the raw block hex to the primary over the TCP relay connection, which submits to the primary's full archival node

Both paths run in parallel. The first successful submission wins. See Section 3.4 of the roadmap for the sequence diagram.

#### 1.4 Independent Mode Failover

When the relay loses contact with the primary for longer than `FAILOVER_THRESHOLD_SECONDS` (default: 10 seconds):

1. Set `relay->independent_mode = true`
2. Start local `getblocktemplate` polling from the relay's pruned Bitcoin Core node (pruned nodes CAN generate templates — they have the UTXO set in memory)
3. Continue accepting and validating shares normally
4. Buffer events locally (NATS leaf node handles this automatically)

When the primary reconnects:

1. Set `relay->independent_mode = false`
2. Stop local template generation
3. Resume receiving templates from primary
4. NATS replays buffered events automatically

See Section 7.2 of the roadmap for the C implementation of `check_primary_connection()`.

#### 1.5 Region Tag in Events

Modify the `emit_event()` function to include a `region` field in every event envelope:

```c
json_object_set_new(envelope, "region", json_string(ckp->region ? ckp->region : "eu"));
```

The `region` field is read from the config (`"region": "us-east"`). Primary defaults to `"eu"`. This field is critical for the event pipeline to know which region generated each event.

#### 1.6 Primary-Side Template Distribution

On the primary instance, add a template push server that:

1. Listens on port 8881 for incoming relay connections
2. Authenticates relays using the `auth_token`
3. Whenever a new block template is generated (in `generator.c` after `getblocktemplate`), serializes and pushes it to all connected relays
4. Maintains a list of connected relays with health status

This is new code in `generator.c` (or a new file `relay_server.c`).

---

### Part 2: Docker Compose Multi-Region Simulation

Extend the existing `services/docker-compose.yml` (or create a new `services/docker-compose.multi-region.yml`) to simulate 3 geographic regions on a single machine.

#### 2.1 Network Topology

Create 3 isolated Docker networks:

| Network | Subnet | Region | Latency to EU |
|---|---|---|---|
| `eu_net` | `172.20.1.0/24` | EU-Central (Primary) | 0ms (baseline) |
| `us_net` | `172.20.2.0/24` | US-East (Relay) | ~50ms round-trip |
| `asia_net` | `172.20.3.0/24` | Asia (Relay) | ~150ms round-trip |

#### 2.2 Services

| Service | Network | IP | Description |
|---|---|---|---|
| `ckpool-primary` | `eu_net` | `172.20.1.10` | Primary ckpool instance (full mode) |
| `bitcoind-primary` | `eu_net` | `172.20.1.11` | Full archival signet node |
| `nats-hub` | `eu_net` | `172.20.1.20` | NATS JetStream hub server |
| `redis` | `eu_net` | `172.20.1.30` | Redis (event streams + pub/sub) |
| `timescaledb` | `eu_net` | `172.20.1.31` | TimescaleDB (event persistence) |
| `event-collector` | `eu_net` | `172.20.1.40` | Central event collector (Python) |
| `ckpool-relay-us` | `us_net` | `172.20.2.10` | US relay ckpool instance (passthrough) |
| `bitcoind-relay-us` | `us_net` | `172.20.2.11` | Pruned signet node |
| `ckpool-relay-asia` | `asia_net` | `172.20.3.10` | Asia relay ckpool instance (passthrough) |
| `bitcoind-relay-asia` | `asia_net` | `172.20.3.11` | Pruned signet node |
| `latency-bridge` | All 3 networks | — | Alpine container applying `tc netem` delays |

#### 2.3 Latency Simulation

The `latency-bridge` container is connected to all 3 networks and uses `tc netem` to add artificial latency:

```bash
# Add 25ms delay on the US network interface (50ms round-trip)
tc qdisc add dev eth1 root netem delay 25ms 5ms distribution normal

# Add 75ms delay on the Asia network interface (150ms round-trip)
tc qdisc add dev eth2 root netem delay 75ms 10ms distribution normal
```

The container requires `cap_add: ["NET_ADMIN"]` for `tc` commands.

**Important**: The latency bridge routes traffic between networks. The relay ckpool instances and relay Bitcoin Core nodes need to communicate with the EU network (for template push, NATS, event collector). The bridge enables this cross-network communication with simulated delay.

#### 2.4 Pruned Bitcoin Core Configuration

Relay Bitcoin Core nodes use pruned mode:

```ini
# bitcoin.conf (relay — pruned signet)
server=1
signet=1
prune=1000
txindex=0

rpcuser=tbg
rpcpassword=tbgdev2026
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0

zmqpubhashblock=tcp://0.0.0.0:28332

dbcache=512
maxconnections=20
```

The primary Bitcoin Core node uses the existing full archival configuration from Phase 1, with `prune=0` and `txindex=1`.

#### 2.5 CKPool Configuration Files

Create 3 configuration files:

| File | Mode | Region | Bitcoin Core |
|---|---|---|---|
| `config/ckpool-primary.conf` | Primary (full) | `eu` | `bitcoind-primary:38332` |
| `config/ckpool-relay-us.conf` | Passthrough | `us-east` | `bitcoind-relay-us:38332` |
| `config/ckpool-relay-asia.conf` | Passthrough | `asia` | `bitcoind-relay-asia:38332` |

The primary config is the existing `ckpool-signet.conf` with the addition of `"region": "eu"` and the template push server port.

The relay configs follow the format shown in Section 3.3 of the roadmap, with `"mode": "passthrough"` and the `primary` connection block pointing to `ckpool-primary`.

---

### Part 3: NATS JetStream for Cross-Region Events

#### 3.1 NATS Server Deployment

Add a NATS server (version 2.10+) to the Docker Compose stack. In the multi-region simulation, a single NATS instance in the EU network acts as the hub. In production, relay regions would run NATS leaf nodes — but for the simulation, all ckpool instances publish directly to the central NATS hub.

NATS Hub configuration (`config/nats-hub.conf`):

```conf
server_name: tbg-nats-eu
listen: 0.0.0.0:4222

jetstream {
    store_dir: /data/nats/jetstream
    max_mem: 256MB
    max_file: 1GB
}

# Leaf node listener (for future production relay connections)
leafnodes {
    listen: 0.0.0.0:7422
}
```

#### 3.2 JetStream Stream Configuration

Create a JetStream stream `MINING_EVENTS` that captures all mining events from all regions:

```bash
nats stream add MINING_EVENTS \
    --subjects "mining.events.>" \
    --storage file \
    --retention work \
    --max-age 24h \
    --max-bytes 1GB \
    --discard old \
    --dupe-window 2m \
    --replicas 1
```

Subject hierarchy:

```
mining.events.{region}.{event_type}

# Examples:
mining.events.eu.share_submitted
mining.events.us-east.block_found
mining.events.asia.miner_connected
mining.events.*.share_submitted      # All regions, share events
mining.events.>                      # All events, all regions
```

#### 3.3 Event Collector NATS Integration

Update the Python event collector to consume events from NATS JetStream instead of (or in addition to) the Unix domain socket:

1. Install `nats-py` (the async Python NATS client)
2. Subscribe to `mining.events.>` with a durable consumer named `event-pipeline`
3. For each received message:
   - Parse the JSON event
   - Check for duplicates (NATS dedup window + optional Redis SET check)
   - Persist to TimescaleDB
   - Publish to Redis Streams (for real-time WebSocket consumers)
   - Acknowledge the message

The event collector should support both input modes:
- **Unix socket mode** (existing): For the primary ckpool instance running on the same machine
- **NATS mode** (new): For cross-region events from relay instances

In the multi-region simulation, the primary ckpool still uses the Unix socket, and relays publish to NATS via the event emission system. The event collector consumes from both sources.

#### 3.4 CKPool NATS Publisher

There are two approaches for getting relay events into NATS:

**Approach A (Recommended): Sidecar publisher**
- Each relay runs a small Python sidecar process (`nats-publisher`) that:
  1. Reads from the local Unix domain socket (`/tmp/ckpool/events.sock`)
  2. Publishes each event to NATS with subject `mining.events.{region}.{event_type}`
  3. Includes the `Nats-Msg-Id` header set to the event's `event_id` for deduplication
- This keeps C code simple and avoids linking NATS C client into ckpool

**Approach B: Direct C integration**
- Link the NATS C client library into ckpool and publish directly from C
- More complex build, but lower latency

Use **Approach A** (sidecar publisher) for this phase. It's simpler and maintains clean separation between ckpool (GPL C code) and NATS integration (non-GPL Python).

Create `services/nats-publisher/` with:
- `publisher.py` — Reads from Unix socket, publishes to NATS
- `Dockerfile` — Python 3.12 + nats-py
- `requirements.txt` — nats-py

---

### Part 4: GeoDNS Documentation (Documentation Only)

Create `docs/ckpool-service/geodns/` with documentation for production GeoDNS setup. This is documentation only — no actual DNS setup is performed.

#### 4.1 Document Contents

1. **Architecture Overview** — How `mine.thebitcoingame.com` resolves to the nearest region via Route53 or Cloudflare geolocation routing
2. **DNS Records** — Direct endpoints: `eu.mine.thebitcoingame.com`, `us.mine.thebitcoingame.com`, `asia.mine.thebitcoingame.com`
3. **Route53 Configuration** — Terraform/IaC examples for geolocation routing policies (see Section 5.2 of the roadmap)
4. **Health Check Configuration** — TCP health checks on Stratum port (:3333) and HTTP health checks on metrics endpoint (:9100/metrics). Interval: 10s, failure threshold: 3 (see Section 5.3)
5. **Failover Rules** — When a region is unhealthy, DNS routes to the next-nearest region. EU fails over to US, US fails over to EU, Asia fails over to US
6. **TTL Strategy** — 30-second TTL for fast failover
7. **Cloudflare Alternative** — Equivalent setup using Cloudflare load balancing with geo-steering

Include the Mermaid diagrams from Section 5.1 of the roadmap document.

---

### Part 5: Failover Strategy Implementation

#### 5.1 Relay Independence

When the primary goes down, relays must continue operating:

1. Miners stay connected and continue submitting shares
2. The relay switches to independent mode (local template generation)
3. Events are buffered in the NATS sidecar publisher (or in NATS leaf node queue)
4. When the primary recovers, buffered events are replayed and templates resume from primary

#### 5.2 Health Checks

Implement health check logic in the event collector:

1. Periodically query each region's ckpool health endpoint (from Phase 3)
2. Track region status: `healthy`, `degraded`, `down`
3. Log region status changes
4. Expose region health via a simple HTTP endpoint (for GeoDNS health checks in production)

```python
# health_monitor.py
REGIONS = {
    "eu": "http://ckpool-primary:9100/metrics",
    "us-east": "http://ckpool-relay-us:9100/metrics",
    "asia": "http://ckpool-relay-asia:9100/metrics",
}

async def check_region_health(region: str, url: str) -> RegionStatus:
    """Check if a region's ckpool instance is healthy."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=5) as resp:
                if resp.status == 200:
                    return RegionStatus.HEALTHY
                return RegionStatus.DEGRADED
    except Exception:
        return RegionStatus.DOWN
```

#### 5.3 Event Queue Replay

When the primary recovers from a crash:

1. NATS JetStream automatically replays unacknowledged messages from the durable consumer
2. The event collector processes the backlog
3. Deduplication ensures no duplicate events are persisted (using `event_id` as the dedup key)
4. The system converges to a consistent state

---

### Part 6: Tests

Create comprehensive tests for the multi-region setup.

#### 6.1 Multi-Region Integration Test

`services/tests/test_multi_region.py`:

1. Start the full multi-region Docker Compose stack
2. Connect a test Stratum client to each region (EU, US, Asia)
3. Submit shares from each client
4. Verify all share events arrive in central Redis
5. Verify all share events are persisted in TimescaleDB
6. Verify the `region` field is correct for each event

#### 6.2 Failover Test

`services/tests/test_failover.py`:

1. Start the full stack
2. Connect miners to all 3 regions
3. Kill the primary ckpool container (`docker stop ckpool-primary`)
4. Verify relay ckpool instances are still accepting connections
5. Submit shares to relays after primary is down
6. Verify events are buffered (not lost)
7. Restart primary (`docker start ckpool-primary`)
8. Wait for event replay
9. Verify all events (including those submitted during downtime) are in Redis + TimescaleDB

#### 6.3 Latency Test

`services/tests/test_latency.py`:

1. Start the full stack
2. Measure share submission round-trip time from a client connected to each region
3. Verify US latency is measurably higher than EU (by ~50ms)
4. Verify Asia latency is measurably higher than US (by ~100ms)
5. Measure template propagation time from primary to each relay
6. Log all latency measurements

#### 6.4 NATS Resilience Test

`services/tests/test_nats_resilience.py`:

1. Start the full stack
2. Submit shares from a relay
3. Kill the NATS hub container
4. Continue submitting shares (they should buffer locally)
5. Restart NATS hub
6. Verify buffered events are replayed and arrive at the event collector

#### 6.5 Template Synchronization Test

`services/tests/test_template_sync.py`:

1. Start the full stack
2. Wait for a new block on signet (or trigger template update)
3. Measure time from primary template generation to relay receipt
4. Verify all relays are serving the same block template to miners
5. Verify miners on relays receive `mining.notify` after template propagation

---

## Rules

1. **Read all the docs first.** The `docs/ckpool-service/roadmap/phase-04-multi-instance.md` document is your primary blueprint. It contains architecture diagrams, C code snippets, configuration examples, and test scenarios. Do not deviate from its specifications without good reason.
2. **Docker everything.** ckpool does not build on macOS. The entire multi-region stack runs in Docker Compose on a single machine. The 3 "regions" are 3 Docker networks.
3. **Don't modify `dashboard/`.** The frontend is done.
4. **GPLv3 compliance.** All C modifications carry the GPL header. The Python event collector, NATS publisher sidecar, and configuration files are separate processes (not GPL).
5. **Include `region` in ALL events** from day one. Every event envelope must contain the `region` field. This is critical for the event pipeline to distinguish which region generated each event.
6. **Include `source: "hosted"` in ALL events** — same as previous phases. Both `source` and `region` are required in every event.
7. **Start with Docker Compose.** Get the multi-region Docker Compose stack running first (3 ckpool instances, 3 Bitcoin Core nodes, NATS, Redis, TimescaleDB). Then verify basic connectivity. Then add passthrough mode. Then add NATS publishing. Then test failover.
8. **Signet, not mainnet.** All Bitcoin Core nodes run on signet.
9. **Handle pruned nodes correctly.** Relay Bitcoin Core nodes are pruned (`prune=1000` in signet). They can validate addresses and submit blocks, but they get their block templates from the primary (via ckpool passthrough). In independent mode (primary down), pruned nodes CAN generate templates since they maintain the UTXO set.
10. **Artificial latency must be measurable.** The `tc netem` delay should be visible in test results. A share submitted to the US relay should have measurably higher latency than one submitted directly to the EU primary.
11. **Log extensively.** Log all cross-region communication: template pushes, relay connections, NATS publishes, failover transitions. Use structured logging with the `region` field.

---

## Files to Create/Edit

### New Files

| Action | File | Description |
|---|---|---|
| CREATE | `services/docker-compose.multi-region.yml` | Multi-region Docker Compose with 3 networks |
| CREATE | `services/ckpool/config/ckpool-primary.conf` | Primary ckpool config (EU, full mode + template push) |
| CREATE | `services/ckpool/config/ckpool-relay-us.conf` | US relay config (passthrough mode) |
| CREATE | `services/ckpool/config/ckpool-relay-asia.conf` | Asia relay config (passthrough mode) |
| CREATE | `services/ckpool/config/bitcoin-relay.conf` | Bitcoin Core pruned config for relay nodes |
| CREATE | `services/nats-publisher/publisher.py` | NATS sidecar publisher (Unix socket to NATS) |
| CREATE | `services/nats-publisher/Dockerfile` | NATS publisher Docker image |
| CREATE | `services/nats-publisher/requirements.txt` | Python dependencies (nats-py) |
| CREATE | `services/nats/nats-hub.conf` | NATS JetStream hub configuration |
| CREATE | `services/nats/nats-leaf.conf` | NATS leaf node configuration (for production reference) |
| CREATE | `services/nats/create-stream.sh` | Script to create JetStream stream on startup |
| CREATE | `services/latency-bridge/Dockerfile` | Alpine + iproute2 for tc netem |
| CREATE | `services/latency-bridge/entrypoint.sh` | Script to apply latency rules |
| CREATE | `services/event-collector/src/nats_consumer.py` | NATS JetStream consumer for event collector |
| CREATE | `services/event-collector/src/health_monitor.py` | Multi-region health check monitor |
| CREATE | `services/tests/test_multi_region.py` | Multi-region integration test |
| CREATE | `services/tests/test_failover.py` | Failover scenario test |
| CREATE | `services/tests/test_latency.py` | Latency measurement test |
| CREATE | `services/tests/test_nats_resilience.py` | NATS resilience test |
| CREATE | `services/tests/test_template_sync.py` | Template synchronization test |
| CREATE | `services/tests/conftest.py` | Shared test fixtures (Docker Compose management) |
| CREATE | `services/tests/stratum_client.py` | Reusable test Stratum client for connecting to any region |
| CREATE | `docs/ckpool-service/geodns/README.md` | GeoDNS architecture overview |
| CREATE | `docs/ckpool-service/geodns/route53-setup.md` | AWS Route53 configuration guide |
| CREATE | `docs/ckpool-service/geodns/cloudflare-alternative.md` | Cloudflare geo-steering alternative |
| CREATE | `docs/ckpool-service/geodns/health-checks.md` | Health check configuration reference |
| CREATE | `docs/ckpool-service/geodns/failover-runbook.md` | Failover procedures and runbook |

### Files to Edit

| Action | File | Description |
|---|---|---|
| EDIT | `services/ckpool/src/ckpool.h` | Add `relay_connection_t` struct, `region` field to `ckpool_t` |
| EDIT | `services/ckpool/src/ckpool.c` | Parse `mode`, `primary`, `region` from JSON config |
| EDIT | `services/ckpool/src/generator.c` | Add template push server for relays; passthrough template receiver |
| EDIT | `services/ckpool/src/stratifier.c` | Add `region` to event emission; dual block submission for relays |
| EDIT | `services/ckpool/Dockerfile` | Install NATS C client library (if needed); ensure relay mode builds |
| EDIT | `services/event-collector/src/collector.py` | Add NATS consumer mode alongside Unix socket mode |
| EDIT | `services/event-collector/src/config.py` | Add NATS connection settings |
| EDIT | `services/event-collector/requirements.txt` | Add `nats-py`, `aiohttp` |
| EDIT | `services/event-collector/Dockerfile` | Install new dependencies |

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Docker Compose multi-region skeleton** — Create the Docker Compose file with 3 networks, 3 Bitcoin Core nodes (1 full + 2 pruned), and the existing single ckpool instance. Verify all 3 Bitcoin Core nodes sync on signet.

2. **Latency bridge** — Add the latency bridge container. Verify `tc netem` is working by pinging between networks and measuring the added delay.

3. **CKPool config for 3 instances** — Create the 3 ckpool config files (primary, relay-us, relay-asia). Start 3 ckpool instances, each pointed at its own Bitcoin Core node. At this stage, all 3 run in full mode (not passthrough yet). Verify miners can connect to all 3.

4. **Region tag in events** — Add the `region` field to `emit_event()`. Verify events from each instance carry the correct region tag.

5. **Passthrough mode in ckpool** — Implement the template synchronization: primary pushes templates to relays over TCP. Relays receive and apply templates. This is the core C work. Test that relays serve the same template as primary.

6. **NATS deployment** — Add NATS to the Docker Compose stack. Create the JetStream stream. Verify NATS is running and the stream exists.

7. **NATS sidecar publisher** — Create the Python sidecar that reads from the relay's Unix socket and publishes to NATS. Deploy one sidecar per relay.

8. **Event collector NATS consumer** — Update the event collector to consume from NATS JetStream in addition to the Unix socket. Verify events from all 3 regions arrive in Redis + TimescaleDB.

9. **Independent mode failover** — Implement the failover logic: when primary goes down, relays switch to local template generation. Test by killing the primary container.

10. **Health monitor** — Implement the health check monitor. Verify it detects region status changes.

11. **Tests** — Write and run all test suites. Verify latency, failover, NATS resilience, and template synchronization.

12. **GeoDNS documentation** — Write the production GeoDNS documentation (Route53 + Cloudflare).

**Critical: Get step 3 working before attempting step 5.** Three independent ckpool instances (all in full mode) is the foundation. Only implement passthrough mode once you have verified that all 3 instances can independently accept miners and emit events.

---

## Definition of Done

1. **Docker Compose starts 3 ckpool instances** (primary + 2 relays) with separate Bitcoin Core nodes — `docker compose -f docker-compose.multi-region.yml up` brings up the full stack
2. **Miners can connect to any instance** and submit shares — cpuminer works against all 3 Stratum endpoints
3. **All events from all regions flow to central Redis + TimescaleDB** — events from EU, US-East, and Asia all appear in the same Redis streams and TimescaleDB tables with correct `region` tags
4. **NATS JetStream replicates events across regions** — relay events are published to NATS by the sidecar publisher and consumed by the central event collector
5. **Killing the primary doesn't crash the relays** — `docker stop ckpool-primary` leaves relay instances running and accepting miners. Events are buffered. Restarting primary causes buffered events to replay.
6. **Latency simulation works** — share submission to US relay shows measurably higher latency (~50ms) than direct primary submission. Asia shows ~150ms higher latency. These differences are visible in test output.
7. **Template synchronization works** — relays receive and apply block templates from the primary. Miners on relays work on the same block as miners on the primary. Template propagation latency is measurable.
8. **Multi-region integration tests pass** — all test suites (`test_multi_region.py`, `test_failover.py`, `test_latency.py`, `test_nats_resilience.py`, `test_template_sync.py`) pass
9. **GeoDNS documentation is complete** — `docs/ckpool-service/geodns/` contains architecture, Route53 config, Cloudflare alternative, health checks, and failover runbook
10. **Event deduplication works** — no duplicate events in TimescaleDB even after failover/replay scenarios
11. **All Python code passes type checking and tests** — `mypy` and `pytest` pass
12. **All C code compiles without warnings** — `make` produces no warnings with `-Wall`
