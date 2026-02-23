# Runbook: Scaling

**Service:** TheBitcoinGame CKPool Mining Service
**Trigger:** Capacity limits approaching, performance degradation under load, growth planning
**Severity:** MEDIUM
**Estimated Time:** Variable (30 minutes to several hours depending on scaling type)

---

## When to Use This Runbook

- Connected miners approaching container resource limits
- Share processing latency increasing
- Database disk usage above 70% of capacity
- CPU or memory consistently above 80% utilization
- Planning for anticipated user growth
- Prometheus alert `HighResourceUsage` fires

---

## Current Architecture Capacity

### Single-Region Stack (docker-compose.yml)

| Component | Current Limit | Bottleneck |
|-----------|--------------|------------|
| CKPool | ~10,000 concurrent miners | File descriptors, memory |
| Redis | 256MB memory | Memory (allkeys-lru eviction) |
| TimescaleDB | Disk-bound | Storage volume size |
| Event Collector | ~5,000 events/sec | Python GIL, batch size |
| Prometheus | 30 days retention | Disk |

### Multi-Region Stack (docker-compose.multi-region.yml)

| Component | Current Config | Bottleneck |
|-----------|---------------|------------|
| CKPool EU (primary) | Same as single | File descriptors |
| CKPool US (relay) | Same as single | Relay latency (80ms simulated) |
| CKPool Asia (relay) | Same as single | Relay latency (150ms simulated) |
| NATS | Default config | Network bandwidth |

---

## Horizontal Scaling: Add Relay Regions

Adding a new relay region distributes miner load geographically and provides failover.

### Step 1: Provision Infrastructure

- New host in target region (4+ CPU cores, 8GB+ RAM, 100GB SSD)
- Docker and Docker Compose installed
- Network connectivity to primary region and NATS cluster
- Bitcoin Core node synced (or use the primary's Bitcoin Core via relay)

### Step 2: Create Region Configuration

Create a CKPool config for the new region:

```json
// ckpool-<region>.conf
{
  "btcd": [{
    "url": "bitcoin-<region>:38332",
    "auth": "tbg",
    "pass": "<production-password>"
  }],
  "btcaddress": "bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls",
  "btcsig": "/TBG-<REGION>/",
  "blockpoll": 500,
  "update_interval": 30,
  "serverurl": ["0.0.0.0:3333"],
  "mindiff": 1,
  "startdiff": 1,
  "maxdiff": 0,
  "logdir": "/var/log/ckpool"
}
```

### Step 3: Add to Docker Compose

Add the new region services to `docker-compose.multi-region.yml`:

```yaml
  # New region: South America
  bitcoin-signet-sa:
    image: lncm/bitcoind:v27.0
    container_name: tbg-bitcoin-signet-sa
    # ... (same config pattern as other regions)
    networks:
      - sa_net
    restart: unless-stopped

  ckpool-sa:
    build:
      context: ./ckpool
      dockerfile: Dockerfile
    container_name: tbg-ckpool-sa
    depends_on:
      bitcoin-signet-sa:
        condition: service_healthy
    ports:
      - "3336:3333"    # Unique host port
      - "9103:9100"    # Unique metrics port
    volumes:
      - ckpool-sa-logs:/var/log/ckpool
      - ckpool-sa-run:/var/run/ckpool
      - ckpool-sa-events:/tmp/ckpool
      - ./ckpool/config/ckpool-sa.conf:/etc/ckpool/ckpool.conf:ro
    networks:
      - sa_net
    restart: unless-stopped

  nats-publisher-sa:
    build:
      context: ./nats-publisher
      dockerfile: Dockerfile
    container_name: tbg-nats-publisher-sa
    environment:
      NATS_URL: nats://nats:4222
      REGION: SA
      SOCKET_PATH: /tmp/ckpool/events.sock
    volumes:
      - ckpool-sa-events:/tmp/ckpool
    networks:
      - sa_net
      - infra_net
    restart: unless-stopped
```

### Step 4: Add Latency Simulation (Testing Only)

For testing environments, add network latency to simulate real-world conditions:

```yaml
  ckpool-sa:
    # ... existing config ...
    cap_add:
      - NET_ADMIN
    entrypoint: ["/bin/sh", "-c"]
    command: >
      tc qdisc add dev eth0 root netem delay 120ms 10ms &&
      rm -f /var/run/ckpool/main.pid &&
      exec /opt/ckpool/bin/ckpool -c /etc/ckpool/ckpool.conf -l 7
```

### Step 5: Update Monitoring

```yaml
# Add to monitoring/prometheus.yml
scrape_configs:
  - job_name: 'ckpool-sa'
    static_configs:
      - targets: ['ckpool-sa:9100']
        labels:
          region: 'sa'
```

### Step 6: Update GeoDNS

Add the new region to your DNS configuration:

| Region | Endpoint | Priority |
|--------|----------|----------|
| EU | stratum-eu.thebitcoingame.com:3333 | Primary |
| US | stratum-us.thebitcoingame.com:3334 | Secondary |
| Asia | stratum-asia.thebitcoingame.com:3335 | Secondary |
| **SA** | **stratum-sa.thebitcoingame.com:3336** | **Secondary** |

### Step 7: Deploy and Verify

```bash
# Build and start new region
docker compose -f services/docker-compose.multi-region.yml build ckpool-sa
docker compose -f services/docker-compose.multi-region.yml up -d ckpool-sa bitcoin-signet-sa nats-publisher-sa

# Verify
docker compose -f services/docker-compose.multi-region.yml ps
curl -s http://localhost:9103/metrics | grep ckpool_block_height

# Test stratum connection
python3 services/test-stratum.py localhost 3336
```

---

## Vertical Scaling: Increase Resource Limits

### CKPool Container

```yaml
# In docker-compose.yml, add resource limits
services:
  ckpool:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '4.0'        # Increase from default
          memory: 2G          # Increase from default
        reservations:
          cpus: '1.0'
          memory: 512M
    ulimits:
      nofile:
        soft: 65536           # Increase file descriptor limit
        hard: 65536
```

Apply changes:
```bash
docker compose -f services/docker-compose.yml up -d ckpool
```

### Redis

```yaml
services:
  redis:
    # ... existing config ...
    command: >
      redis-server
        --appendonly yes
        --maxmemory 1gb          # Increased from 256mb
        --maxmemory-policy allkeys-lru
        --tcp-backlog 511
        --timeout 300
    deploy:
      resources:
        limits:
          memory: 1.5G
```

### TimescaleDB

```yaml
services:
  timescaledb:
    # ... existing config ...
    command: >
      -c shared_buffers=2GB
      -c effective_cache_size=6GB
      -c maintenance_work_mem=512MB
      -c work_mem=64MB
      -c max_connections=200
      -c max_parallel_workers=4
      -c max_parallel_workers_per_gather=2
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
```

### Event Collector

Scale by running multiple instances:

```yaml
services:
  event-collector:
    # ... existing config ...
    deploy:
      replicas: 2              # Run 2 instances
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
```

Note: Multiple event collector instances require deduplication logic or partitioned socket reading.

---

## Database Scaling

### Add Read Replicas

For read-heavy workloads (dashboards, analytics), add PostgreSQL streaming replicas.

```yaml
  timescaledb-replica:
    image: timescale/timescaledb:latest-pg16
    container_name: tbg-timescaledb-replica
    environment:
      POSTGRES_USER: tbg
      POSTGRES_PASSWORD: <password>
      POSTGRES_DB: thebitcoingame
    command: >
      -c hot_standby=on
      -c primary_conninfo='host=timescaledb port=5432 user=replication password=<repl-password>'
    volumes:
      - timescaledb-replica-data:/var/lib/postgresql/data
    depends_on:
      - timescaledb
    restart: unless-stopped
```

Configure the primary for replication:
```sql
-- On primary (tbg-timescaledb)
CREATE ROLE replication WITH REPLICATION LOGIN PASSWORD '<repl-password>';
```

Update `pg_hba.conf` on primary:
```
host replication replication 0.0.0.0/0 md5
```

### Increase Chunk Interval

If chunks are too small (creating many files), increase the interval:

```sql
-- Check current chunk interval
SELECT * FROM timescaledb_information.dimensions
WHERE hypertable_name = 'mining_events';

-- Change chunk interval to 1 day (from default, often 7 days for time-series)
SELECT set_chunk_time_interval('mining_events', INTERVAL '1 day');

-- For very high-volume tables, smaller chunks (e.g., 6 hours) improve compression
SELECT set_chunk_time_interval('mining_events', INTERVAL '6 hours');
```

### Partition by Event Type

If a single hypertable becomes too large, consider separate tables per event type:

```sql
-- Create specialized tables for high-volume event types
CREATE TABLE share_events (
  LIKE mining_events INCLUDING ALL
);
SELECT create_hypertable('share_events', 'received_at', chunk_time_interval => INTERVAL '1 day');

-- Migrate existing data
INSERT INTO share_events
SELECT * FROM mining_events WHERE event_type = 'share_submitted';

-- Delete from original (after verifying migration)
DELETE FROM mining_events WHERE event_type = 'share_submitted';
```

---

## Scaling Decision Matrix

| Symptom | Metric | Threshold | Action |
|---------|--------|-----------|--------|
| Miner connection failures | `ckpool_connected_miners` | > 8,000 | Add relay region or increase FD limit |
| High share latency | Event pipeline lag | > 5 seconds | Scale event collector |
| CKPool memory growth | Container memory | > 1.5GB | Increase memory limit, check for leaks |
| Database slow queries | Query latency | > 2 seconds | Add read replica, optimize indexes |
| Disk filling up | Volume usage | > 70% | Adjust retention, enable compression |
| Redis evictions | `evicted_keys` | > 0 | Increase maxmemory |
| CPU saturation | Container CPU | > 80% sustained | Increase CPU limit or add region |

---

## Capacity Planning Template

Fill this out quarterly or when planning for growth:

| Metric | Current Value | 30-Day Trend | 90-Day Projection | Action Needed |
|--------|--------------|-------------|-------------------|---------------|
| Peak concurrent miners | | | | |
| Peak shares/second | | | | |
| Database size | | | | |
| Daily event volume | | | | |
| Redis memory usage | | | | |
| CKPool memory usage | | | | |

---

## Related Runbooks

- [CKPool Restart](runbook-ckpool-restart.md) — restart after config changes
- [Database Maintenance](runbook-database-maintenance.md) — optimize before scaling
- [Disaster Recovery](disaster-recovery.md) — multi-region failover
