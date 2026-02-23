# GeoDNS Monitoring

This document covers how to verify DNS resolution per region, set up alerting
on health check failures, and build Grafana dashboards for regional traffic
distribution.

---

## DNS Resolution Verification

### Basic Verification with dig

```bash
# Resolve from your current location
dig +short stratum.thebitcoingame.com

# Query a specific nameserver (Route53 example)
dig +short stratum.thebitcoingame.com @ns-1234.awsdns-56.org

# Verbose output with TTL
dig stratum.thebitcoingame.com +noall +answer
# stratum.thebitcoingame.com. 60 IN A 203.0.113.10
```

### Simulating Queries from Different Regions

#### Route53: EDNS Client Subnet (ECS)

Route53 supports ECS, so you can simulate a query from a specific IP range:

```bash
# Simulate EU query (use a known EU IP range)
dig stratum.thebitcoingame.com @ns-xxx.awsdns-xx.com +subnet=5.0.0.0/8
# Expected: EU-West IP

# Simulate US query (use a known US IP range)
dig stratum.thebitcoingame.com @ns-xxx.awsdns-xx.com +subnet=8.0.0.0/8
# Expected: US-East IP

# Simulate Asia query (use a known APNIC range)
dig stratum.thebitcoingame.com @ns-xxx.awsdns-xx.com +subnet=103.0.0.0/8
# Expected: AP-South IP
```

#### Online Tools

If you do not have machines in multiple regions:

| Tool                          | URL                                        |
|-------------------------------|--------------------------------------------|
| DNS Checker                   | `https://dnschecker.org`                   |
| What's My DNS                 | `https://whatsmydns.net`                   |
| DNS Propagation Check         | `https://www.dnswatch.info`               |

Enter `stratum.thebitcoingame.com` and verify that resolvers in different
countries return the expected regional IP.

### Scripted Multi-Region Check

A script that verifies DNS from multiple vantage points using public resolvers
known to be in specific regions:

```bash
#!/usr/bin/env bash
# verify-geodns.sh -- Check GeoDNS resolution from multiple regions

DOMAIN="stratum.thebitcoingame.com"

# Public resolvers in approximate regions
declare -A RESOLVERS=(
  ["EU-Google"]="8.8.8.8"
  ["US-Cloudflare"]="1.1.1.1"
  ["US-Quad9"]="9.9.9.9"
  ["Asia-DNSWatch"]="84.200.69.80"
)

declare -A EXPECTED=(
  ["eu-west"]="<eu-west-public-ip>"
  ["us-east"]="<us-east-public-ip>"
  ["ap-south"]="<ap-south-public-ip>"
)

echo "GeoDNS verification for ${DOMAIN}"
echo "================================="

for label in "${!RESOLVERS[@]}"; do
  resolver="${RESOLVERS[$label]}"
  result=$(dig +short "${DOMAIN}" @"${resolver}" 2>/dev/null | head -1)
  echo "${label} (${resolver}): ${result:-FAILED}"
done

echo ""
echo "Expected IPs:"
for region in "${!EXPECTED[@]}"; do
  echo "  ${region}: ${EXPECTED[$region]}"
done
```

**Note:** Public resolvers like 8.8.8.8 use anycast and may not always return
results from the geographic location you expect. For accurate testing, use EC2
instances in each region or the ECS subnet trick above.

---

## Health Check Alerting

### Route53 Health Check Alarms (CloudWatch)

Route53 publishes health check status to CloudWatch in the `us-east-1` region.
Create alarms for each region:

```bash
# Create CloudWatch alarm for EU health check
aws cloudwatch put-metric-alarm \
  --alarm-name "ckpool-eu-unhealthy" \
  --namespace "AWS/Route53" \
  --metric-name "HealthCheckStatus" \
  --dimensions Name=HealthCheckId,Value=<eu-health-check-id> \
  --statistic Minimum \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --alarm-actions "arn:aws:sns:us-east-1:<account-id>:ckpool-alerts" \
  --ok-actions "arn:aws:sns:us-east-1:<account-id>:ckpool-alerts" \
  --treat-missing-data breaching
```

The SNS topic `ckpool-alerts` should be configured to deliver to your
notification channels (email, Slack, PagerDuty).

### Cloudflare Notifications

Cloudflare Load Balancing sends email notifications when pool health changes.
Configure the notification email in the pool settings to
`ops@thebitcoingame.com`. For webhook integration:

1. Navigate to **Notifications** in the Cloudflare dashboard
2. Create a notification for **Load Balancing Health Alert**
3. Select all three pools
4. Set destination to your webhook URL (Slack, PagerDuty, Opsgenie)

### Internal Health Monitor Alerting

The `health-monitor` service (port 8090) can be polled by external monitoring
tools:

```bash
# Prometheus scrape config for the health monitor
# Add to prometheus-multi-region.yml:
- job_name: 'health-monitor'
  static_configs:
    - targets: ['health-monitor:8090']
  metrics_path: '/health'
  scrape_interval: 15s
```

Alternatively, set up a cron-based alert:

```bash
#!/usr/bin/env bash
# alert-on-degraded.sh -- Run via cron every minute

HEALTH_URL="http://localhost:8090/health"
WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"

status=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}")

if [ "${status}" != "200" ]; then
  body=$(curl -s "${HEALTH_URL}")
  curl -s -X POST "${WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"ALERT: CKPool health degraded (HTTP ${status})\n\`\`\`${body}\`\`\`\"
    }"
fi
```

---

## Grafana Dashboard: Regional Traffic Distribution

### Data Sources Required

| Source       | Purpose                             | Port |
|--------------|-------------------------------------|:----:|
| Prometheus   | ckpool metrics per region           | 9090 |
| TimescaleDB  | Historical share/event data         | 5432 |

### Key Panels

#### 1. Active Connections per Region

```promql
# Gauge panel -- current miner count per region
ckpool_connected_miners{job=~"ckpool-.*"}
```

| Panel Type  | Visualization       | Group By         |
|-------------|---------------------|------------------|
| Stat / Gauge | Single value per region | `region` label |

#### 2. Shares per Second by Region

```promql
# Time series -- share submission rate
rate(ckpool_shares_accepted_total{job=~"ckpool-.*"}[1m])
```

| Panel Type   | Visualization | Legend                   |
|--------------|---------------|--------------------------|
| Time Series  | Stacked area  | `{{region}}` label       |

#### 3. Stale Share Rate by Region

This is the most important metric for validating GeoDNS effectiveness. A
high stale rate in one region indicates latency issues.

```promql
# Percentage of stale shares per region
rate(ckpool_shares_stale_total[5m])
/ (rate(ckpool_shares_accepted_total[5m]) + rate(ckpool_shares_stale_total[5m]))
* 100
```

| Panel Type   | Visualization | Thresholds                    |
|--------------|---------------|-------------------------------|
| Time Series  | Line chart    | Green < 0.5%, Yellow < 1.5%, Red > 1.5% |

#### 4. Region Health Status

```promql
# Status map -- 1 = healthy, 0 = unhealthy
up{job=~"ckpool-.*"}
```

| Panel Type   | Visualization | Mapping                       |
|--------------|---------------|-------------------------------|
| Stat         | Color-coded   | 1 = green "UP", 0 = red "DOWN" |

#### 5. Failover Events Timeline

Track when DNS changes cause miners to migrate between regions. A sudden
increase in connections on one region paired with a decrease on another
indicates a failover event.

```promql
# Delta of connections -- spikes indicate migration
delta(ckpool_connected_miners[5m])
```

| Panel Type   | Visualization | Alert                         |
|--------------|---------------|-------------------------------|
| Time Series  | Bar chart     | Alert on |delta| > 50        |

#### 6. Best Share per Region

```promql
# Track highest difficulty share found per region
ckpool_best_share{job=~"ckpool-.*"}
```

### Dashboard JSON Export

A pre-built Grafana dashboard JSON file should be placed at:

```
services/monitoring/grafana/dashboards/geodns-regional.json
```

The existing Grafana provisioning in `docker-compose.multi-region.yml` auto-
loads dashboards from this directory.

---

## Key Metrics Reference

| Metric                           | Source     | Description                        | Alert Threshold            |
|----------------------------------|:----------:|------------------------------------|----------------------------|
| `ckpool_connected_miners`        | Prometheus | Current connected miners           | < 1 for any region         |
| `ckpool_shares_accepted_total`   | Prometheus | Cumulative accepted shares         | rate() dropping to 0       |
| `ckpool_shares_stale_total`      | Prometheus | Cumulative stale shares            | rate() / accepted > 1.5%   |
| `ckpool_best_share`              | Prometheus | Highest share difficulty           | Informational              |
| `ckpool_block_height`            | Prometheus | Current block height being mined   | Divergence between regions |
| `up{job="ckpool-*"}`             | Prometheus | Scrape target reachable            | 0 for any target           |
| Health Monitor `/health`         | HTTP 8090  | Aggregated status JSON             | HTTP 503 (degraded)        |
| NATS `in_msgs` / `out_msgs`     | NATS 8222  | Message flow through event bus     | in_msgs stalled            |

---

## Alert Rules (Prometheus Alertmanager)

Add these rules to the Prometheus configuration:

```yaml
# File: services/monitoring/alerts/geodns-alerts.yml

groups:
  - name: geodns
    interval: 15s
    rules:
      - alert: RegionDown
        expr: up{job=~"ckpool-.*"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "CKPool region {{ $labels.region }} is down"
          description: "Prometheus cannot scrape {{ $labels.job }} ({{ $labels.instance }}). DNS failover should have activated."

      - alert: HighStaleRate
        expr: >
          rate(ckpool_shares_stale_total[5m])
          / (rate(ckpool_shares_accepted_total[5m]) + rate(ckpool_shares_stale_total[5m]))
          > 0.015
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High stale rate in {{ $labels.region }} ({{ $value | humanizePercentage }})"
          description: "Stale share rate exceeds 1.5% for 5 minutes. Check network latency and block propagation."

      - alert: RegionMinerDrop
        expr: >
          delta(ckpool_connected_miners[5m]) < -50
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Miner count dropped sharply in {{ $labels.region }}"
          description: "{{ $labels.region }} lost {{ $value }} miners in 5 minutes. Possible failover event or network issue."

      - alert: BlockHeightDivergence
        expr: >
          max(ckpool_block_height) - min(ckpool_block_height) > 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Block height divergence across regions"
          description: "Regions are mining at different block heights. Check Bitcoin node sync and NATS replication."

      - alert: HealthMonitorDegraded
        expr: probe_success{job="health-monitor"} == 0
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Health monitor reports degraded status"
          description: "The aggregated health endpoint returned non-200. At least one region may be unhealthy."
```

---

## Verification Runbook

Use this checklist after deploying or modifying GeoDNS configuration:

| Step | Command / Action                                          | Expected Result              |
|:----:|-----------------------------------------------------------|------------------------------|
| 1    | `dig +short stratum.thebitcoingame.com`                  | Returns IP for your region   |
| 2    | `curl -s http://localhost:8090/health \| jq .status`     | `"healthy"`                  |
| 3    | `curl -s http://localhost:9090/api/v1/targets \| jq '.data.activeTargets[] \| {job: .labels.job, health: .health}'` | All targets `"up"` |
| 4    | Stop ckpool in one region, wait 45s                       | DNS stops returning that IP  |
| 5    | `dig +short stratum.thebitcoingame.com` (from affected zone) | Returns failover region IP |
| 6    | Restart ckpool, wait 30s                                  | DNS returns recovered IP     |
| 7    | Check Grafana stale rate panel                            | No sustained spike > 1.5%   |
| 8    | Check Grafana connections panel                           | Miners distributed correctly |
