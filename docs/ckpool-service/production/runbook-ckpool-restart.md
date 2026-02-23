# Runbook: CKPool Restart

**Service:** CKPool Stratum Mining Engine
**Trigger:** CKPool unresponsive, metrics stale, stratum port not accepting connections
**Severity:** HIGH
**Estimated Time:** 5-15 minutes

---

## When to Use This Runbook

- CKPool metrics endpoint (`:9100/metrics`) is not responding
- Stratum port (`:3333`) refuses connections
- `ckpool_block_height` metric has not updated for > 5 minutes
- Miners reporting disconnections and unable to reconnect
- Prometheus alert `CKPoolDown` or `CKPoolStale` fires

---

## Pre-Checks

Before restarting CKPool, verify the root cause is not an upstream dependency.

### 1. Check Bitcoin Core

```bash
# Is Bitcoin Core running?
docker inspect --format='{{.State.Health.Status}}' tbg-bitcoin-signet

# Is Bitcoin Core synced?
docker exec tbg-bitcoin-signet bitcoin-cli -signet \
  -rpcuser=tbg -rpcpassword=tbgdev2026 -rpcport=38332 \
  getblockchaininfo | grep -E '"blocks"|"headers"|"verificationprogress"'
```

If Bitcoin Core is down or desynced, restart it first (see below) and wait before restarting CKPool.

### 2. Check CKPool Logs

```bash
# Last 50 lines of CKPool logs
docker logs --tail 50 tbg-ckpool

# Look for specific error patterns
docker logs --tail 200 tbg-ckpool 2>&1 | grep -iE "error|fatal|fail|segfault|abort"
```

Common error patterns:
| Pattern | Meaning | Action |
|---------|---------|--------|
| `Failed to get block template` | Bitcoin RPC unreachable | Check Bitcoin Core first |
| `PID file exists` | Stale PID from unclean shutdown | Remove PID file |
| `Permission denied` | File permission issue | Check volume mounts |
| `Segmentation fault` | CKPool crash | Restart, report bug |
| `Too many open files` | FD exhaustion | Check ulimit, possible connection leak |

### 3. Check Disk Space

```bash
# Check host disk usage
df -h

# Check container-specific volume
docker exec tbg-ckpool df -h /var/log/ckpool
docker exec tbg-ckpool df -h /var/run/ckpool
```

If disk is full, clean up logs before restarting.

### 4. Check Container State

```bash
# Container state
docker inspect --format='{{.State.Status}} ({{.State.ExitCode}})' tbg-ckpool

# Restart count (high count may indicate a crash loop)
docker inspect --format='{{.RestartCount}}' tbg-ckpool

# When it last started
docker inspect --format='{{.State.StartedAt}}' tbg-ckpool
```

---

## Restart Procedure

### Standard Restart

```bash
# Step 1: Graceful restart via Docker Compose
docker compose -f services/docker-compose.yml restart ckpool

# Step 2: Wait for startup (10-30 seconds)
sleep 15

# Step 3: Verify CKPool is running
docker inspect --format='{{.State.Status}}' tbg-ckpool
# Expected: running

# Step 4: Verify CKPool process is alive
docker exec tbg-ckpool pgrep -f ckpool
# Expected: PID number(s)
```

### Restart with PID Cleanup

If you see "PID file exists" in logs:

```bash
# Step 1: Remove stale PID file
docker exec tbg-ckpool rm -f /var/run/ckpool/main.pid

# Step 2: Restart
docker compose -f services/docker-compose.yml restart ckpool

# Step 3: Verify
docker exec tbg-ckpool pgrep -f ckpool
```

### Full Stop and Start

If restart does not work:

```bash
# Step 1: Stop
docker compose -f services/docker-compose.yml stop ckpool

# Step 2: Wait for complete stop
sleep 5

# Step 3: Start
docker compose -f services/docker-compose.yml start ckpool

# Step 4: Watch logs
docker logs -f --tail 20 tbg-ckpool
# Wait until you see "CKPool stratifier ready" or similar
# Press Ctrl+C to stop following
```

### Nuclear Option: Recreate Container

If the container is in a broken state:

```bash
# Step 1: Force remove
docker compose -f services/docker-compose.yml rm -f ckpool

# Step 2: Recreate and start
docker compose -f services/docker-compose.yml up -d ckpool

# Step 3: Watch logs
docker logs -f --tail 20 tbg-ckpool
```

---

## Post-Restart Checks

Run all of these checks after a restart. Do not close the incident until all pass.

### 1. Process Health

```bash
# CKPool process running
docker exec tbg-ckpool pgrep -f ckpool
# Expected: 1 or more PIDs

# Container status
docker inspect --format='{{.State.Status}}' tbg-ckpool
# Expected: running
```

### 2. Stratum Port

```bash
# TCP connection test
timeout 5 bash -c 'echo > /dev/tcp/localhost/3333'
# Expected: no error

# Full stratum handshake (optional)
python3 services/test-stratum.py localhost 3333
```

### 3. Metrics

```bash
# Metrics endpoint responding
curl -s http://localhost:9100/metrics | head -5
# Expected: Prometheus metrics lines

# Block height present and non-zero
curl -s http://localhost:9100/metrics | grep ckpool_block_height
# Expected: ckpool_block_height <number>

# Connected miners (may be 0 after restart, miners take time to reconnect)
curl -s http://localhost:9100/metrics | grep ckpool_connected_miners
```

### 4. Event Pipeline

```bash
# Check event collector is receiving events
docker logs --tail 10 tbg-event-collector

# Check Redis streams
docker exec tbg-redis redis-cli XLEN mining:share_submitted
docker exec tbg-redis redis-cli XLEN mining:miner_connected
```

### 5. Miner Reconnection

After CKPool restarts, miners will automatically reconnect (most mining software retries every 30-60 seconds). Monitor the connected miners metric:

```bash
# Watch connected miners count
watch -n 10 'curl -s http://localhost:9100/metrics | grep ckpool_connected_miners'
```

If miners are not reconnecting after 5 minutes, check:
- Firewall rules
- DNS resolution
- Load balancer health checks (if applicable)

---

## Escalation

If the restart procedure does not resolve the issue:

1. **Check upstream dependencies** (Bitcoin Core, Redis, network)
2. **Review CKPool logs** for crash signatures or new error patterns
3. **Check host resources** (memory, CPU, disk, network)
4. **Open incident** with full log output and metrics screenshots
5. **Escalate to** infrastructure team lead
6. **If data at risk**, follow emergency shutdown runbook

---

## Related Runbooks

- [Emergency Shutdown](runbook-emergency-shutdown.md) — for security incidents
- [Database Maintenance](runbook-database-maintenance.md) — if DB is contributing to issues
- [Scaling](runbook-scaling.md) — if resource exhaustion is the root cause
- [Disaster Recovery](disaster-recovery.md) — for complete host failure
