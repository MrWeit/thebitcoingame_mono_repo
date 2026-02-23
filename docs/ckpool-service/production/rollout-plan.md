# Production Rollout Plan

**Service:** TheBitcoinGame CKPool Mining Service
**Last Updated:** 2026-02-23
**Owner:** Infrastructure Team

---

## Overview

This document defines the 4-stage gradual rollout from development to full production. Each stage has explicit entry criteria, monitoring requirements, and go/no-go decision points. Do not advance to the next stage until all criteria are met.

---

## Stage 1: Signet Testing

**Duration:** 48 hours minimum
**Network:** Bitcoin Signet
**Goal:** Validate the full stack end-to-end in a controlled environment.

### Entry Criteria
- [ ] All Phase 0-4 code merged and building cleanly
- [ ] Docker Compose stack starts without errors
- [ ] All unit tests passing
- [ ] Chaos test suite passes (`run_all_chaos.sh`)

### Setup
```bash
cd services
docker compose up -d
# Wait for all services to be healthy
docker compose ps

# Start CPU miner to generate shares
cd ../cpuminer
./minerd -a sha256d \
  -o stratum+tcp://localhost:3333 \
  -u bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls \
  -p x \
  --threads=1
```

### Monitoring Checklist (48 hours)
- [ ] CKPool process has not restarted unexpectedly
- [ ] Block height metric is advancing with signet blocks
- [ ] Shares are being accepted and recorded in TimescaleDB
- [ ] Redis streams contain miner_connected and share_submitted events
- [ ] Prometheus is scraping metrics successfully
- [ ] Grafana dashboard shows data for all panels
- [ ] No memory leaks: `docker stats tbg-ckpool` shows stable RSS
- [ ] No disk growth issues: log volume not growing unbounded
- [ ] Event collector has no error loops in logs

### Go/No-Go Decision
| Criterion | Required | Status |
|-----------|----------|--------|
| Zero CKPool crashes in 48h | YES | |
| Shares accepted continuously | YES | |
| Events flowing to DB | YES | |
| Memory stable (< 256MB) | YES | |
| Disk usage stable | YES | |
| Chaos tests pass | YES | |
| All monitoring operational | YES | |

### Rollback
```bash
docker compose down
# Fix issues, rebuild, restart
```

---

## Stage 2: Testnet Validation

**Duration:** 1 week minimum
**Network:** Bitcoin Testnet3 or Testnet4
**Goal:** Validate under real mining difficulty with actual network behavior.

### Entry Criteria
- [ ] Stage 1 completed with all criteria met
- [ ] CKPool configuration updated for testnet
- [ ] Bitcoin Core synced to testnet chain tip
- [ ] Testnet faucet coins available for testing

### Configuration Changes
```json
// ckpool-testnet.conf
{
  "btcd": [{
    "url": "bitcoin-testnet:18332",
    "auth": "tbg",
    "pass": "tbgdev2026"
  }],
  "btcaddress": "<testnet-address>",
  "btcsig": "/TBG-Testnet/",
  "blockpoll": 500,
  "update_interval": 30,
  "serverurl": ["0.0.0.0:3333"],
  "mindiff": 1,
  "startdiff": 1,
  "maxdiff": 0,
  "logdir": "/var/log/ckpool"
}
```

### Setup
```bash
# Update docker-compose for testnet
# (modify bitcoin-signet service to use testnet flags)
docker compose up -d
```

### Monitoring Checklist (1 week)
- [ ] CKPool connects to testnet Bitcoin Core
- [ ] Block templates update on new testnet blocks
- [ ] VarDiff adjusts correctly for real difficulty
- [ ] Shares validate against real testnet targets
- [ ] No memory leaks over 7 days
- [ ] Event pipeline handles testnet block rate (~10 min average)
- [ ] Multi-region relay (if deployed) stays synchronized
- [ ] Backup/restore cycle tested on testnet data
- [ ] Failover tested: stop Bitcoin Core, verify relay takes over

### Performance Baselines
Record these metrics to establish baselines for production:

| Metric | Value | Notes |
|--------|-------|-------|
| Avg share processing latency | | |
| Max concurrent connections | | |
| Memory usage (steady state) | | |
| CPU usage (steady state) | | |
| Event pipeline latency (event to DB) | | |
| Disk growth rate (per day) | | |

### Go/No-Go Decision
| Criterion | Required | Status |
|-----------|----------|--------|
| Zero crashes in 7 days | YES | |
| VarDiff working correctly | YES | |
| Shares validate against real difficulty | YES | |
| Memory/disk stable over 7 days | YES | |
| Failover tested and working | YES | |
| Performance baselines established | YES | |
| Security review of exposed ports | YES | |

### Rollback
```bash
docker compose down
# Revert to signet configuration
docker compose up -d
```

---

## Stage 3: Mainnet Shadow

**Duration:** 2 weeks minimum
**Network:** Bitcoin Mainnet
**Goal:** Validate against real mainnet conditions with our own miner only.

### Entry Criteria
- [ ] Stage 2 completed with all criteria met
- [ ] Security audit completed (see pentest-checklist.md)
- [ ] TLS termination configured (if exposing publicly)
- [ ] Production Bitcoin Core node synced to mainnet
- [ ] Monitoring and alerting configured
- [ ] Runbooks reviewed and tested
- [ ] Backup automation running on schedule

### Configuration Changes
```json
// ckpool-mainnet.conf
{
  "btcd": [{
    "url": "bitcoin-mainnet:8332",
    "auth": "<production-rpc-user>",
    "pass": "<production-rpc-password>"
  }],
  "btcaddress": "bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls",
  "btcsig": "/TheBitcoinGame/",
  "blockpoll": 100,
  "update_interval": 30,
  "serverurl": ["0.0.0.0:3333"],
  "mindiff": 65536,
  "startdiff": 65536,
  "maxdiff": 0,
  "logdir": "/var/log/ckpool"
}
```

### Security Hardening
- [ ] RPC credentials rotated to production values (not tbgdev2026)
- [ ] Stratum port behind a load balancer or reverse proxy
- [ ] Rate limiting enabled at network level
- [ ] Docker containers running as non-root
- [ ] Secrets managed via Docker secrets or vault (not env vars)
- [ ] Log aggregation configured (no sensitive data in logs)
- [ ] SSH access restricted and key-only

### Monitoring Checklist (2 weeks)
- [ ] Mainnet block templates received at correct difficulty
- [ ] Our own miner submitting shares successfully
- [ ] No false block solutions submitted to the network
- [ ] Coinbase transaction structure is valid
- [ ] Memory and CPU stable under mainnet conditions
- [ ] Event pipeline handles mainnet block rate (~10 min average)
- [ ] No unexpected network connections from containers
- [ ] Alerting fires correctly for simulated failures
- [ ] Daily backup verified (restore test)

### Acceptance Criteria for Shadow Phase
| Criterion | Required | Status |
|-----------|----------|--------|
| Zero crashes in 14 days | YES | |
| Valid mainnet share submission | YES | |
| Coinbase transactions valid | YES | |
| All alerts tested and working | YES | |
| All runbooks exercised | YES | |
| Security hardening complete | YES | |
| Backup/restore verified weekly | YES | |
| Performance within 10% of testnet baselines | YES | |

### Rollback
```bash
# Stop mainnet services
docker compose -f services/docker-compose.production.yml down

# If needed, revert to testnet
docker compose up -d
```

---

## Stage 4: Mainnet Production

**Duration:** Ongoing (first 30 days closely monitored)
**Network:** Bitcoin Mainnet
**Goal:** Serve real users with a reliable mining pool.

### Entry Criteria
- [ ] Stage 3 completed with all criteria met
- [ ] Legal review completed (terms of service, privacy policy)
- [ ] User-facing documentation ready
- [ ] Support channel established
- [ ] Incident response process documented
- [ ] On-call rotation established
- [ ] Load testing completed (simulated peak load)

### Rollout Phases

#### Week 1: Invite-Only Alpha
- 5-10 invited users
- Direct communication channel with each user
- Manual monitoring by engineering team
- Daily check-ins on pool performance

#### Week 2: Expanded Alpha
- 20-50 users
- Automated alerting must be proven reliable
- Fix any issues found in Week 1
- Begin collecting user feedback

#### Week 3-4: Open Beta
- Open registration (with captcha/rate limiting)
- Marketing can begin soft promotion
- 24/7 monitoring via automated alerts
- On-call engineer responds to pages

#### Month 2+: General Availability
- Full public launch
- Auto-scaling if needed
- Regular chaos testing (monthly)
- Quarterly disaster recovery drills

### Monitoring (First 30 Days)

**Daily Reviews:**
- [ ] Share acceptance rate (target: > 99%)
- [ ] Miner connection stability
- [ ] Event pipeline health
- [ ] Resource utilization trends
- [ ] Error rates in all service logs

**Weekly Reviews:**
- [ ] Performance trends vs. baselines
- [ ] Disk growth projections
- [ ] User growth vs. capacity plan
- [ ] Security log review
- [ ] Backup verification

### Capacity Planning

| Metric | Current Capacity | Warning Threshold | Action |
|--------|-----------------|-------------------|--------|
| Concurrent miners | TBD | 80% of max | Add relay region |
| Shares/second | TBD | 80% of max | Scale event pipeline |
| Database size | TBD | 70% of disk | Adjust retention |
| Memory usage | TBD | 80% of limit | Increase container limit |

### Rollback
```bash
# Emergency: stop accepting new connections
docker exec tbg-ckpool kill -USR1 $(docker exec tbg-ckpool pgrep ckpool | head -1)

# Full shutdown
docker compose -f services/docker-compose.production.yml down

# Communicate to users
# [Use emergency shutdown runbook]
```

---

## Decision Log

Record all go/no-go decisions here for audit trail.

| Date | Stage | Decision | Decider | Notes |
|------|-------|----------|---------|-------|
| | Stage 1 -> 2 | | | |
| | Stage 2 -> 3 | | | |
| | Stage 3 -> 4 | | | |
| | Week 1 -> Week 2 | | | |
| | Beta -> GA | | | |

---

## Appendix: Pre-Launch Checklist

Final checklist before any production traffic:

- [ ] All chaos tests pass
- [ ] Disaster recovery drill completed
- [ ] Backup and restore verified
- [ ] All runbooks reviewed
- [ ] Security hardening verified
- [ ] Monitoring and alerting operational
- [ ] On-call rotation scheduled
- [ ] Status page configured
- [ ] User documentation published
- [ ] Legal documents in place
- [ ] RPC credentials are production values (NOT development defaults)
- [ ] Docker containers have resource limits set
- [ ] Log rotation configured
- [ ] DNS and SSL certificates provisioned
