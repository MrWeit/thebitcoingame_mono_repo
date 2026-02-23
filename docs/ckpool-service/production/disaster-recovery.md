# Disaster Recovery Plan

**Service:** TheBitcoinGame CKPool Mining Service
**Last Updated:** 2026-02-23
**Owner:** Infrastructure Team
**Review Cadence:** Quarterly

---

## Recovery Objectives

| Metric | Target | Justification |
|--------|--------|---------------|
| **RTO** (Recovery Time Objective) | < 15 minutes | Mining downtime means lost shares for users |
| **RPO** (Recovery Point Objective) | < 1 hour | Event data can be reconstructed from CKPool logs if needed |
| **MTTR** (Mean Time To Repair) | < 30 minutes | Including diagnosis and verification |

## Architecture Overview

```
Miners --> [CKPool Stratum :3333]
               |
               v
         [Bitcoin Core :38332]  (block templates)
               |
               v
         [Event Socket] --> [Event Collector] --> [TimescaleDB]
                                    |
                                    v
                                [Redis Streams]
                                    |
                                    v
                            [Prometheus / Grafana]
```

Key dependencies:
- **Bitcoin Core**: Required for block templates. CKPool survives temporary outages.
- **Redis**: Used for coinbase signature cache and event streams. CKPool falls back to defaults if unavailable.
- **TimescaleDB**: Stores historical events. Not in the critical stratum path.
- **Event Collector**: Bridges CKPool events to Redis and TimescaleDB. Can be restarted independently.

---

## Failure Scenarios

### 1. CKPool Process Crash

**Severity:** HIGH
**Impact:** All miners disconnect, no shares accepted.
**Detection:** Prometheus `up{job="ckpool"}` goes to 0, stratum port unreachable.

**Recovery Steps:**
1. Docker restart policy (`restart: unless-stopped`) auto-recovers in most cases.
2. Verify recovery:
   ```bash
   docker inspect --format='{{.State.Status}}' tbg-ckpool
   docker exec tbg-ckpool pgrep -f ckpool
   curl -s http://localhost:9100/metrics | head -5
   ```
3. If auto-restart fails:
   ```bash
   docker compose -f services/docker-compose.yml restart ckpool
   ```
4. If restart loops:
   ```bash
   docker logs --tail 100 tbg-ckpool
   # Check for: PID file stale, bitcoin RPC unreachable, config error
   docker exec tbg-ckpool rm -f /var/run/ckpool/main.pid
   docker compose -f services/docker-compose.yml restart ckpool
   ```

**Recovery Time:** 10-60 seconds (auto-restart), 2-5 minutes (manual).
**Miners:** Auto-reconnect via stratum failover. Share loss during downtime.

---

### 2. Bitcoin Core Desync or Crash

**Severity:** MEDIUM
**Impact:** CKPool cannot generate new block templates. Existing work continues temporarily.
**Detection:** `ckpool_block_height` metric stops updating. Bitcoin healthcheck fails.

**Recovery Steps:**
1. Check Bitcoin Core status:
   ```bash
   docker inspect --format='{{.State.Health.Status}}' tbg-bitcoin-signet
   docker logs --tail 50 tbg-bitcoin-signet
   ```
2. If the node is syncing, wait. Check progress:
   ```bash
   docker exec tbg-bitcoin-signet bitcoin-cli -signet \
     -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 \
     getblockchaininfo | jq '.verificationprogress'
   ```
3. If the node is crashed, restart:
   ```bash
   docker compose -f services/docker-compose.yml restart bitcoin-signet
   ```
4. If data is corrupted, nuke and resync:
   ```bash
   docker compose -f services/docker-compose.yml stop bitcoin-signet
   docker volume rm services_bitcoin-signet-data
   docker compose -f services/docker-compose.yml up -d bitcoin-signet
   # Signet resync takes ~30 minutes
   ```

**Recovery Time:** 1-5 minutes (restart), 30-60 minutes (resync).
**CKPool Behavior:** Stays running, serves stale work. Resumes automatically when Bitcoin Core is back.

---

### 3. Database Corruption or Loss

**Severity:** MEDIUM
**Impact:** Historical event data unavailable. No impact on active mining.
**Detection:** Event collector logs connection errors. Grafana dashboards show gaps.

**Recovery Steps:**
1. Check database health:
   ```bash
   docker exec tbg-timescaledb pg_isready -U tbg -d thebitcoingame
   docker logs --tail 50 tbg-timescaledb
   ```
2. If database is up but corrupted:
   ```bash
   # Stop writes
   docker compose -f services/docker-compose.yml stop event-collector

   # Attempt repair
   docker exec tbg-timescaledb psql -U tbg -d thebitcoingame \
     -c "REINDEX DATABASE thebitcoingame;"
   ```
3. If repair fails, restore from backup:
   ```bash
   # Find latest backup
   ls -la /backups/timescaledb/daily/

   # Restore
   docker compose -f services/docker-compose.yml stop event-collector
   gunzip -c /backups/timescaledb/daily/LATEST.dump.gz | \
     docker exec -i tbg-timescaledb pg_restore \
       -U tbg -d thebitcoingame \
       --clean --if-exists --no-owner --single-transaction

   # Restart event collector
   docker compose -f services/docker-compose.yml start event-collector
   ```
4. If no backup available, recreate schema:
   ```bash
   docker exec tbg-timescaledb psql -U tbg -d thebitcoingame \
     -f /docker-entrypoint-initdb.d/01-init.sql
   ```

**Recovery Time:** 5-15 minutes.
**Data Loss:** Up to RPO window (1 hour). CKPool logs can backfill some events.

---

### 4. Complete Host Failure

**Severity:** CRITICAL
**Impact:** All services down. Total mining outage for this region.
**Detection:** All monitoring goes dark. External healthcheck fails.

**Recovery Steps (Single Region):**
1. Provision new host (or restore from snapshot).
2. Install Docker and Docker Compose.
3. Clone the repository:
   ```bash
   git clone <repo-url> && cd THEBITCOINGAME
   ```
4. Restore TimescaleDB backup to a volume.
5. Start the stack:
   ```bash
   cd services && docker compose up -d
   ```
6. Verify all services are healthy.
7. Update DNS to point to new host IP.

**Recovery Steps (Multi-Region with Failover):**
1. Relay regions auto-detect primary failure (10s timeout).
2. Relays switch to local Bitcoin Core for block templates.
3. NATS continues to replicate events from surviving regions.
4. Health monitor (`/health` on port 8090) shows primary as DOWN.
5. Update GeoDNS to remove failed region (or auto-failover if configured).
6. Rebuild and restore the failed region at leisure.

**Recovery Time:** 15-60 minutes (single region), 10-30 seconds (multi-region auto-failover).

---

### 5. Network Partition

**Severity:** MEDIUM
**Impact:** CKPool cannot reach Bitcoin Core or vice versa.
**Detection:** Block height stale in metrics. GBT RPC errors in CKPool logs.

**Recovery Steps:**
1. Identify the partition:
   ```bash
   # From CKPool container
   docker exec tbg-ckpool ping -c 3 bitcoin-signet
   docker exec tbg-ckpool wget -q -O- --timeout=3 http://bitcoin-signet:38332/
   ```
2. Check Docker networks:
   ```bash
   docker network inspect services_default
   docker inspect --format='{{json .NetworkSettings.Networks}}' tbg-ckpool
   ```
3. Reconnect if needed:
   ```bash
   docker network connect services_default tbg-ckpool
   ```
4. If external network issue, escalate to network team.

**Multi-Region:** Relay regions have independent Bitcoin Core nodes and auto-failover.

**Recovery Time:** 1-5 minutes (Docker network), variable (external network).

---

## Backup Procedures

### Automated Backups
- **Script:** `services/scripts/backup/backup_timescaledb.sh`
- **Schedule:** Daily at 02:00 UTC (cron)
- **Retention:** 7 daily + 4 weekly
- **Storage:** `/backups/timescaledb/` (should be on separate volume/mount)

### Backup Verification
Run monthly or after any backup script changes:
```bash
cd services/tests/chaos
./test_backup_restore.sh
```

### Manual Backup
```bash
./services/scripts/backup/backup_timescaledb.sh --full --backup-dir /backups/timescaledb
```

---

## Communication Plan

### Escalation Matrix

| Severity | Response Time | Notify |
|----------|---------------|--------|
| CRITICAL (total outage) | Immediate | On-call engineer, team lead, status page |
| HIGH (degraded mining) | 15 minutes | On-call engineer |
| MEDIUM (data/monitoring gap) | 1 hour | On-call engineer |
| LOW (cosmetic/non-impact) | Next business day | Engineering backlog |

### Communication Channels
- **Internal:** Team Slack channel (#tbg-incidents)
- **External:** Status page update (if applicable)
- **Mining Users:** In-app notification banner once resolved

### Notification Template
```
INCIDENT: [Brief description]
SEVERITY: [CRITICAL/HIGH/MEDIUM/LOW]
IMPACT: [What users experience]
STATUS: [Investigating/Identified/Monitoring/Resolved]
STARTED: [Time UTC]
ETA: [Expected resolution time]
UPDATES: [Link to incident channel]
```

---

## Post-Incident Review Template

Complete within 48 hours of incident resolution.

### Incident Report

**Date:** ____
**Duration:** ____
**Severity:** ____
**On-call Engineer:** ____

### Timeline
| Time (UTC) | Event |
|------------|-------|
| | Incident detected |
| | First responder paged |
| | Root cause identified |
| | Fix deployed |
| | Service restored |
| | All-clear declared |

### Root Cause
_What was the underlying cause?_

### Impact
- Miners affected: ____
- Share loss estimate: ____
- Data loss: ____
- Duration of impact: ____

### What Went Well
-
-

### What Went Wrong
-
-

### Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| | | | |
| | | | |

### Lessons Learned
_What should we change to prevent recurrence?_

---

## Appendix: Service Dependencies

```
ckpool
  ├── bitcoin-signet (REQUIRED for block templates)
  ├── redis (OPTIONAL — graceful degradation)
  └── event-collector
        ├── redis (REQUIRED for stream publishing)
        └── timescaledb (REQUIRED for event storage)

prometheus
  ├── ckpool:9100 (metrics scrape)
  └── node-exporter (if deployed)

grafana
  └── prometheus (data source)
```

## Appendix: Useful Commands Quick Reference

```bash
# Stack health
docker compose -f services/docker-compose.yml ps

# CKPool status
curl -s http://localhost:9100/metrics | grep ckpool_

# Bitcoin Core height
docker exec tbg-bitcoin-signet bitcoin-cli -signet \
  -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 \
  getblockcount

# Redis streams
docker exec tbg-redis redis-cli XLEN mining:share_submitted
docker exec tbg-redis redis-cli XLEN mining:miner_connected

# Database event count
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame \
  -c "SELECT event_type, COUNT(*) FROM mining_events GROUP BY event_type;"

# View recent CKPool logs
docker logs --tail 100 -f tbg-ckpool

# Run chaos tests
cd services/tests/chaos && ./run_all_chaos.sh
```
