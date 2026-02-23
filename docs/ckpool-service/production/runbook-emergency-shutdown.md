# Runbook: Emergency Shutdown

**Service:** TheBitcoinGame CKPool Mining Service (Full Stack)
**Trigger:** Security incident, data breach, critical exploitable bug, legal order
**Severity:** CRITICAL
**Estimated Time:** 5-10 minutes to shutdown, variable for investigation

---

## When to Use This Runbook

- Active security breach detected (unauthorized access, data exfiltration)
- Critical vulnerability discovered that is being actively exploited
- Coinbase transaction tampering detected
- Unauthorized block submissions
- Legal or regulatory order to cease operations
- Data integrity compromise that cannot be isolated

**DO NOT USE** for routine maintenance, performance issues, or minor bugs. Use the [CKPool Restart](runbook-ckpool-restart.md) runbook instead.

---

## Immediate Actions (First 5 Minutes)

### Step 1: Stop Accepting New Connections

Block new miner connections at the network level before stopping services. This prevents additional exposure while preserving internal state for forensics.

```bash
# Option A: Block stratum port via iptables (if on Linux host)
sudo iptables -I INPUT -p tcp --dport 3333 -j DROP

# Option B: Stop just the CKPool service (miners disconnect)
docker compose -f services/docker-compose.yml stop ckpool
```

### Step 2: Preserve Evidence

Before any destructive action, capture the current state.

```bash
# Create forensics snapshot directory
INCIDENT_DIR="/tmp/tbg_incident_$(date +%Y%m%d_%H%M%S)"
mkdir -p "${INCIDENT_DIR}"

# Capture container states
docker ps -a > "${INCIDENT_DIR}/docker_ps.txt" 2>&1
docker inspect tbg-ckpool > "${INCIDENT_DIR}/ckpool_inspect.json" 2>&1
docker inspect tbg-event-collector > "${INCIDENT_DIR}/collector_inspect.json" 2>&1
docker inspect tbg-redis > "${INCIDENT_DIR}/redis_inspect.json" 2>&1
docker inspect tbg-timescaledb > "${INCIDENT_DIR}/db_inspect.json" 2>&1

# Capture all container logs
docker logs tbg-ckpool > "${INCIDENT_DIR}/ckpool.log" 2>&1
docker logs tbg-event-collector > "${INCIDENT_DIR}/collector.log" 2>&1
docker logs tbg-redis > "${INCIDENT_DIR}/redis.log" 2>&1
docker logs tbg-timescaledb > "${INCIDENT_DIR}/db.log" 2>&1
docker logs tbg-bitcoin-signet > "${INCIDENT_DIR}/bitcoin.log" 2>&1

# Capture network state
docker network inspect $(docker network ls -q) > "${INCIDENT_DIR}/networks.json" 2>&1

# Capture CKPool internal state
docker exec tbg-ckpool cat /var/log/ckpool/*.log > "${INCIDENT_DIR}/ckpool_internal.log" 2>&1 || true
docker exec tbg-ckpool ls -la /var/run/ckpool/ > "${INCIDENT_DIR}/ckpool_run.txt" 2>&1 || true

# Capture Redis state
docker exec tbg-redis redis-cli INFO > "${INCIDENT_DIR}/redis_info.txt" 2>&1 || true
docker exec tbg-redis redis-cli XLEN mining:share_submitted > "${INCIDENT_DIR}/redis_shares_len.txt" 2>&1 || true
docker exec tbg-redis redis-cli XLEN mining:miner_connected > "${INCIDENT_DIR}/redis_connects_len.txt" 2>&1 || true

# Database snapshot
docker exec tbg-timescaledb psql -U tbg -d thebitcoingame -c "
  SELECT event_type, count(*), max(received_at)
  FROM mining_events
  GROUP BY event_type
  ORDER BY max(received_at) DESC;
" > "${INCIDENT_DIR}/db_event_summary.txt" 2>&1 || true

# Capture Prometheus metrics
curl -s http://localhost:9100/metrics > "${INCIDENT_DIR}/ckpool_metrics.txt" 2>&1 || true
curl -s http://localhost:9090/api/v1/targets > "${INCIDENT_DIR}/prometheus_targets.json" 2>&1 || true

echo "Evidence preserved in ${INCIDENT_DIR}"
```

### Step 3: Stop All Services

```bash
# Stop services in dependency order (reverse startup)
docker compose -f services/docker-compose.yml stop event-collector
docker compose -f services/docker-compose.yml stop ckpool
docker compose -f services/docker-compose.yml stop prometheus grafana
docker compose -f services/docker-compose.yml stop redis
docker compose -f services/docker-compose.yml stop timescaledb
docker compose -f services/docker-compose.yml stop bitcoin-signet

# Verify all stopped
docker compose -f services/docker-compose.yml ps
# Expected: all services in "Exited" state
```

### Step 4: Network Isolation (Optional — for active breach)

If an active attacker is suspected, isolate the Docker network:

```bash
# Disconnect all containers from external network
docker network disconnect bridge tbg-ckpool 2>/dev/null || true
docker network disconnect bridge tbg-bitcoin-signet 2>/dev/null || true

# If using multi-region, also stop NATS to prevent cross-region propagation
docker compose -f services/docker-compose.multi-region.yml stop nats 2>/dev/null || true
```

---

## Communication

### Immediate Notification (within 15 minutes)

Notify the following:

| Role | Contact Method | Information |
|------|---------------|-------------|
| Team Lead | Slack DM + phone | Severity, brief description, ETA |
| On-Call Engineer | PagerDuty / Slack | Join incident channel |
| Security Team | Email + Slack | Full incident details |

### User Communication (within 30 minutes)

If users are affected, post a status update:

```
STATUS UPDATE

Service: TheBitcoinGame Mining Pool
Status: OFFLINE — Investigating

We are aware of an issue affecting our mining service.
All mining operations have been temporarily suspended
while we investigate. Your mined shares and balances
are safe.

We will provide updates every 30 minutes.

Time: [UTC timestamp]
```

### Stakeholder Communication (within 1 hour)

For security incidents with potential data exposure:

```
SECURITY INCIDENT NOTIFICATION

Date: [Date]
Severity: [CRITICAL/HIGH]
Summary: [Brief description without technical details]
Impact: [What data/systems were affected]
Status: [Current status of investigation]
Actions Taken: [Steps taken so far]
Next Steps: [What happens next]
```

---

## Investigation Phase

After the immediate shutdown, begin investigation. DO NOT restart services until the root cause is understood.

### Forensics Checklist

- [ ] Review CKPool logs for anomalous patterns
- [ ] Review event collector logs for unexpected event types
- [ ] Check Redis for unexpected keys or data
- [ ] Review database for anomalous entries (especially around incident time)
- [ ] Check Docker daemon logs for container escape attempts
- [ ] Review host system logs (`/var/log/syslog`, `/var/log/auth.log`)
- [ ] Check for unauthorized SSH access
- [ ] Verify no unauthorized changes to Docker images or configs
- [ ] Check git log for unauthorized commits to the repository
- [ ] Review network traffic logs (if captured)

### Key Questions to Answer

1. **What happened?** — Precise description of the incident
2. **When did it start?** — Earliest evidence of the issue
3. **How was it detected?** — Alert, user report, manual discovery
4. **What was the attack vector?** — How did the attacker get in
5. **What was accessed/modified?** — Scope of impact
6. **Is it contained?** — Can it happen again with current controls
7. **What needs to change?** — Immediate fixes before restart

---

## Recovery Phase

### Pre-Restart Checklist

Do not restart services until ALL of these are confirmed:

- [ ] Root cause identified and documented
- [ ] Fix deployed or mitigating controls in place
- [ ] All credentials rotated (RPC passwords, database passwords, API keys)
- [ ] Docker images rebuilt from clean source (if compromise involved images)
- [ ] Database integrity verified (if data tampering suspected)
- [ ] Team lead approves restart
- [ ] Security team approves restart (for security incidents)

### Restart Procedure

```bash
# If credentials were rotated, update docker-compose.yml and configs first

# Start services in dependency order
docker compose -f services/docker-compose.yml up -d bitcoin-signet
# Wait for Bitcoin Core to sync
docker compose -f services/docker-compose.yml up -d timescaledb redis
# Wait for DB and Redis health checks
docker compose -f services/docker-compose.yml up -d event-collector
docker compose -f services/docker-compose.yml up -d ckpool
docker compose -f services/docker-compose.yml up -d prometheus grafana

# Verify all healthy
docker compose -f services/docker-compose.yml ps
```

### Post-Restart Verification

```bash
# CKPool accepting connections
timeout 5 bash -c 'echo > /dev/tcp/localhost/3333'

# Metrics flowing
curl -s http://localhost:9100/metrics | grep ckpool_block_height

# Events being collected
docker logs --tail 10 tbg-event-collector

# No error loops
docker logs --tail 50 tbg-ckpool 2>&1 | grep -ci error
```

### Post-Restart Communication

```
STATUS UPDATE

Service: TheBitcoinGame Mining Pool
Status: ONLINE — Monitoring

Mining operations have been restored. We are monitoring
closely for any issues.

If you experience any problems, please contact us at
[support channel].

Time: [UTC timestamp]
```

---

## Post-Incident

Within 48 hours, complete the Post-Incident Review template from the [Disaster Recovery](disaster-recovery.md) document.

Additional actions for security incidents:
- [ ] File incident report per company security policy
- [ ] Update pentest checklist with new test cases
- [ ] Add monitoring/alerting for the attack vector
- [ ] Update chaos tests if applicable
- [ ] Schedule follow-up review in 30 days

---

## Related Runbooks

- [CKPool Restart](runbook-ckpool-restart.md) — for non-emergency restarts
- [Disaster Recovery](disaster-recovery.md) — for infrastructure failures
- [Database Maintenance](runbook-database-maintenance.md) — for DB-specific issues
