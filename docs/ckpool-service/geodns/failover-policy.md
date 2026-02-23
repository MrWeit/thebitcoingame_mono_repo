# Failover Policy

This document defines how TheBitcoinGame handles regional ckpool failures,
including health check configuration, failover order, DNS TTL strategy, miner
reconnection behavior, and recovery procedures.

---

## Regions and Roles

| Region   | Role    | Priority | Failover Targets (in order) |
|----------|---------|:--------:|:---------------------------:|
| eu-west  | Primary | 1        | us-east, ap-south           |
| us-east  | Relay   | 2        | eu-west, ap-south           |
| ap-south | Relay   | 3        | us-east, eu-west            |

**EU-West** is the primary region. It runs the authoritative ckpool instance,
and the shared infrastructure (Redis, TimescaleDB, NATS, Prometheus, Grafana)
is co-located there. The US and Asia instances are relay nodes that connect
back to EU for event replication via NATS.

---

## Health Check Configuration

### Primary Health Check: Stratum TCP (Port 3333)

This is the health check that DNS providers (Route53 or Cloudflare) use to
determine whether a region should receive traffic.

| Parameter          | Value    | Rationale                                      |
|--------------------|:--------:|------------------------------------------------|
| Protocol           | TCP      | Validates that ckpool is listening              |
| Port               | 3333     | Stratum listener -- the service miners connect to |
| Check Interval     | 10 s     | Fast detection (Route53 "Fast" tier)            |
| Timeout            | 5 s      | TCP handshake should complete in < 1s normally  |
| Failure Threshold  | 3        | 3 consecutive failures = unhealthy (30s)        |
| Recovery Threshold | 1-2      | 1-2 consecutive passes = healthy again          |

**Time to detect failure:** 3 failures x 10s interval = **30 seconds**.

**Time to detect recovery:** 1-2 passes x 10s interval = **10-20 seconds**.

### Secondary Health Check: Metrics HTTP (Port 9100)

An optional deeper health check that validates ckpool is not just listening
but actively processing and exporting metrics.

| Parameter          | Value       |
|--------------------|:-----------:|
| Protocol           | HTTP GET    |
| Port               | 9100        |
| Path               | `/metrics`  |
| Expected Response  | HTTP 200    |
| Check Interval     | 30 s        |
| Failure Threshold  | 2           |

This check catches scenarios where ckpool's Stratum listener is open but the
process is stuck or not processing shares. Use this as a **calculated health
check** (Route53) or **secondary monitor** (Cloudflare) that combines with
the TCP check.

### Internal Health Monitor (Port 8090)

The `health-monitor` service (running in Docker) polls all three regions every
15 seconds and aggregates their status into a single `GET /health` endpoint.
This is used for:

- Grafana alerting dashboards
- PagerDuty/Opsgenie webhook triggers
- Manual operator checks

It is **not** used by DNS providers directly (they probe origin IPs).

```bash
# Check aggregated health
curl -s http://localhost:8090/health | jq .

# Response when all healthy:
{
  "status": "healthy",
  "timestamp": 1740300000.0,
  "regions": {
    "eu-west": { "status": "healthy", "endpoint": "ckpool-eu:9100", ... },
    "us-east": { "status": "healthy", "endpoint": "ckpool-us:9100", ... },
    "ap-south": { "status": "healthy", "endpoint": "ckpool-asia:9100", ... }
  },
  "nats": { "status": "healthy", ... }
}

# Response when a region is down:
{
  "status": "degraded",
  ...
  "regions": {
    "eu-west": { "status": "unreachable", "error": "...", ... },
    ...
  }
}
```

---

## DNS TTL Strategy

| TTL Value | Failover Speed | Cache Staleness Risk | Recommendation      |
|:---------:|:--------------:|:--------------------:|---------------------|
| 30 s      | Very fast      | Minimal              | Aggressive, higher DNS query volume |
| **60 s**  | **Fast**       | **Low**              | **Recommended**     |
| 300 s     | Moderate       | Moderate             | Not suitable for mining |
| 3600 s    | Slow           | High                 | Never use for mining pools |

**TheBitcoinGame uses a 60-second TTL.** This means:

- After a region fails and DNS stops advertising it, miners' resolvers will
  cache the old (failed) IP for at most 60 seconds before re-querying.
- Combined with the 30-second failure detection, the **maximum time a miner
  is affected** is approximately 90 seconds (30s detection + 60s TTL expiry).
- In practice, many resolvers re-query before TTL expiry, so real-world
  failover is often faster.

### TTL and Miner Behavior

Miners do not re-resolve DNS on every share submission. They resolve the
hostname once at connection time, then hold a persistent TCP connection. DNS
TTL only matters when:

1. A miner's connection drops (because the region went down)
2. The miner's Stratum client triggers a **reconnect**
3. The reconnect performs a fresh DNS lookup
4. The new lookup returns a healthy region's IP

This means DNS failover is **not instant** -- it depends on the miner software
performing a reconnect after detecting the connection loss.

---

## Failover Scenarios

### Scenario 1: Single Region Failure (e.g., EU-West Goes Down)

```
Timeline:
  T+0s     EU-West ckpool crashes or network drops
  T+10s    First health check failure detected
  T+30s    Third consecutive failure — region marked unhealthy
  T+30s    DNS provider stops returning EU-West IP
  T+30s    EU miners' active connections drop (TCP timeout or RST)
  T+30-90s Miner Stratum clients reconnect, DNS resolves to US-East
  T+90s    All EU miners now connected to US-East (higher latency)
```

**Impact:** EU miners experience ~80ms additional latency (EU to US) until
EU-West recovers. Stale share rate increases from ~0.1% to ~0.3-0.5%.

### Scenario 2: Two Regions Down (EU-West + US-East)

```
Timeline:
  T+0s     Both EU and US go down simultaneously
  T+30s    Both marked unhealthy
  T+30s    All DNS queries resolve to AP-South (only healthy region)
  T+30-90s All miners worldwide reconnect to AP-South
```

**Impact:** EU and US miners experience 150ms+ latency. AP-South ckpool must
handle the full miner load. Stale share rate increases significantly for
non-Asian miners. This is an emergency scenario.

### Scenario 3: Primary Region (EU-West) Degraded but Not Down

Sometimes ckpool is reachable (TCP handshake succeeds) but degraded -- high
latency, dropping shares, or not issuing new jobs. The TCP health check will
not catch this. The secondary HTTP check on port 9100 or the internal health
monitor can detect degradation via metrics:

- `ckpool_shares_stale_total` spiking
- `ckpool_connected_miners` dropping
- No new values for `ckpool_best_share` over extended period

In this case, manual intervention may be needed to pull the region from DNS
while debugging.

---

## Failover Order by Miner Location

When a miner's home region fails, where do they go?

| Miner Location | Home Region | Failover 1 | Failover 2 |
|----------------|:-----------:|:----------:|:----------:|
| Europe         | eu-west     | us-east    | ap-south   |
| North America  | us-east     | eu-west    | ap-south   |
| South America  | us-east     | eu-west    | ap-south   |
| East Asia      | ap-south    | us-east    | eu-west    |
| Southeast Asia | ap-south    | us-east    | eu-west    |
| Oceania        | ap-south    | us-east    | eu-west    |
| Africa         | eu-west     | us-east    | ap-south   |
| Middle East    | eu-west     | ap-south   | us-east    |

This order minimizes additional latency at each failover step. Configure
these fallback chains in the DNS provider's geolocation/geo-steering rules.

---

## Miner Reconnection Behavior

Stratum V1 miner firmware handles disconnections differently. Understanding
these behaviors is important for predicting failover timing.

| Miner Type        | Reconnect Behavior                                        |
|-------------------|-----------------------------------------------------------|
| Bitaxe            | Auto-reconnect with backoff (5s, 10s, 20s, 60s max)      |
| Antminer (S19+)   | Retries primary, then falls back to pool2/pool3 config   |
| Whatsminer (M30+) | Retries current pool, then cycles configured pool list    |
| CGMiner/BFGMiner  | Configurable retry interval, default 30s                  |
| NiceHash firmware | Aggressive retry with failover pool list                  |

### Pool Configuration Recommendation for Miners

Miners should configure multiple pool entries that all point to the same
GeoDNS hostname. This ensures that even if the Stratum client does not
re-resolve DNS between retries, eventually one of its reconnection attempts
will trigger a fresh lookup:

```
Pool 1: stratum+tcp://stratum.thebitcoingame.com:3333
Pool 2: stratum+tcp://stratum.thebitcoingame.com:3333
Pool 3: stratum+tcp://stratum.thebitcoingame.com:3333
```

Some miners may also benefit from direct regional entries as backup:

```
Pool 1: stratum+tcp://stratum.thebitcoingame.com:3333      (GeoDNS)
Pool 2: stratum+tcp://eu.stratum.thebitcoingame.com:3333   (Direct EU)
Pool 3: stratum+tcp://us.stratum.thebitcoingame.com:3333   (Direct US)
```

---

## Recovery and Drain-Back

When a failed region recovers:

1. The health check passes 1-2 consecutive times (10-20 seconds).
2. The DNS provider starts returning the recovered region's IP again.
3. **Existing connections on the failover region are NOT disrupted.** Miners
   stay connected to wherever they currently are.
4. Only **new connections** (new miners joining, or miners that happen to
   reconnect for other reasons) will be routed back to the recovered region.
5. Over time, as miners naturally disconnect and reconnect (firmware restarts,
   network blips, difficulty adjustments), traffic gradually drains back.

### Forced Drain-Back

If you want to actively move miners back to the recovered region, you can
trigger a reconnection by restarting the ckpool process on the failover
region. This is a **disruptive action** -- all miners on that instance will
disconnect and re-resolve DNS. Use only if:

- The recovered region is verified stable
- The failover region is under excessive load
- Stale rates on the failover region are unacceptably high

```bash
# On the failover region's server (e.g., US-East)
# This disconnects all miners, forcing re-resolution
docker restart tbg-ckpool-us
```

### Gradual Drain-Back (Preferred)

A safer approach is to temporarily increase the weight of the recovered region
in the DNS load balancer (Cloudflare) or to briefly lower the TTL to 30s to
accelerate natural re-resolution. Restore normal settings after traffic
rebalances (typically 15-30 minutes).

---

## Operational Checklist

### Before Planned Maintenance on a Region

1. Verify other regions are healthy: `curl -s http://localhost:8090/health`
2. Confirm DNS failover is working: stop ckpool, wait 45s, verify DNS stops
   returning the region's IP
3. Proceed with maintenance
4. Restart ckpool
5. Verify health check recovery (check DNS returns the IP again)
6. Monitor stale rate for 15 minutes after recovery

### After Unplanned Outage

1. Confirm failover occurred via DNS and health monitor
2. Investigate root cause on the failed region
3. Fix the issue and restart ckpool
4. Verify recovery via health checks
5. Monitor drain-back over the next 30 minutes
6. Review stale share rates across all regions for the incident period
7. Update incident log
