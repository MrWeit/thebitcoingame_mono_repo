# Cloudflare GeoDNS Setup

This document covers configuring Cloudflare Load Balancing with geo-steering
to route miners to their nearest ckpool region. Because Stratum is a raw TCP
protocol (not HTTP), this setup uses Cloudflare Spectrum for TCP passthrough.

---

## Prerequisites

- Cloudflare account with the domain `thebitcoingame.com` on an **Enterprise**
  plan (Spectrum requires Enterprise, or a Spectrum-specific add-on)
- Alternatively, a **Pro** or **Business** plan if only using DNS-based load
  balancing without Spectrum (DNS-only mode)
- Public static IPs for each regional ckpool instance
- Stratum port (3333) open on each origin server

---

## Architecture Options

| Mode             | Plan Required | Proxy | Use Case                              |
|------------------|:------------:|:-----:|---------------------------------------|
| DNS-only (grey)  | Free+        | No    | Simple GeoDNS, no TCP proxy           |
| Spectrum TCP     | Enterprise   | Yes   | TCP proxy + DDoS protection on :3333  |

For most mining pools, **DNS-only mode** is sufficient and avoids the
Enterprise cost. Spectrum is valuable if you need Cloudflare's DDoS mitigation
on the Stratum port directly.

---

## Option A: DNS-Only Load Balancing (Recommended)

### Step 1: Create a Load Balancer Pool for Each Region

Navigate to **Traffic > Load Balancing > Pools**.

#### Pool: EU-West

| Setting        | Value               |
|----------------|---------------------|
| Pool Name      | `ckpool-eu-west`    |
| Origins        | 1 origin            |
| Origin Name    | `ckpool-eu`         |
| Origin Address | `<eu-west-public-ip>` |
| Weight         | 1                   |
| Health Check   | `stratum-tcp-check` |

#### Pool: US-East

| Setting        | Value               |
|----------------|---------------------|
| Pool Name      | `ckpool-us-east`    |
| Origin Name    | `ckpool-us`         |
| Origin Address | `<us-east-public-ip>` |
| Weight         | 1                   |
| Health Check   | `stratum-tcp-check` |

#### Pool: AP-South

| Setting        | Value               |
|----------------|---------------------|
| Pool Name      | `ckpool-ap-south`   |
| Origin Name    | `ckpool-asia`       |
| Origin Address | `<ap-south-public-ip>` |
| Weight         | 1                   |
| Health Check   | `stratum-tcp-check` |

### Step 2: Create the Health Check

Navigate to **Traffic > Load Balancing > Monitors**.

| Setting          | Value       |
|------------------|-------------|
| Monitor Name     | `stratum-tcp-check` |
| Type             | TCP         |
| Port             | 3333        |
| Interval         | 15 seconds  |
| Timeout          | 5 seconds   |
| Retries          | 2           |
| Probe Regions    | All regions |

Cloudflare will probe TCP port 3333 from multiple global locations. A
successful TCP handshake marks the origin as healthy.

**Note:** You can also create a secondary HTTP monitor against the Prometheus
metrics endpoint on port 9100 for deeper health validation:

| Setting          | Value         |
|------------------|---------------|
| Monitor Name     | `ckpool-metrics-check` |
| Type             | HTTP          |
| Port             | 9100          |
| Path             | `/metrics`    |
| Expected Codes   | 200           |
| Interval         | 30 seconds    |

### Step 3: Create the Load Balancer

Navigate to **Traffic > Load Balancing > Load Balancers**.

| Setting              | Value                                  |
|----------------------|----------------------------------------|
| Hostname             | `stratum.thebitcoingame.com`           |
| Proxy Status         | DNS only (grey cloud)                  |
| TTL                  | 60 seconds                             |
| Traffic Steering     | Geo Steering                           |
| Fallback Pool        | `ckpool-eu-west`                       |
| Session Affinity     | None                                   |

### Step 4: Configure Geo Steering

Under the load balancer's **Traffic Steering** tab, select **Geo Steering** and
map regions to pools:

| Region                     | Pool (Priority Order)                              |
|----------------------------|----------------------------------------------------|
| Western Europe (WEUR)      | 1. `ckpool-eu-west`                                |
| Eastern Europe (EEUR)      | 1. `ckpool-eu-west`                                |
| Northern Africa (NAFR)     | 1. `ckpool-eu-west` 2. `ckpool-us-east`            |
| Sub-Saharan Africa (SSAFR) | 1. `ckpool-eu-west`                                |
| Middle East (ME)           | 1. `ckpool-eu-west` 2. `ckpool-ap-south`           |
| Eastern North America (ENAM) | 1. `ckpool-us-east`                              |
| Western North America (WNAM) | 1. `ckpool-us-east`                              |
| South America (SAM)        | 1. `ckpool-us-east`                                |
| Eastern Asia (EAS)         | 1. `ckpool-ap-south`                               |
| Southeast Asia (SEAS)      | 1. `ckpool-ap-south`                               |
| South Asia (SAS)           | 1. `ckpool-ap-south`                               |
| Oceania (OC)               | 1. `ckpool-ap-south`                               |

Each region entry can have a secondary pool for failover. If the primary pool
is unhealthy, Cloudflare automatically routes to the next pool in the list.
If all pools for a region are down, the **fallback pool** (`ckpool-eu-west`)
is used.

---

## Option B: Spectrum TCP Passthrough (Enterprise)

Spectrum allows Cloudflare to proxy raw TCP connections on arbitrary ports,
providing DDoS protection for the Stratum protocol.

### Step 1: Create Spectrum Application

Navigate to **Spectrum** under your domain.

| Setting           | Value                                |
|-------------------|--------------------------------------|
| Application Name  | `stratum-mining`                     |
| Edge Port         | 3333                                 |
| Protocol          | TCP                                  |
| Origin DNS Name   | `stratum-origin.thebitcoingame.com`  |
| Origin Port       | 3333                                 |
| IP Firewall       | Enabled                              |
| DDoS Protection   | Enabled                              |
| Proxy Protocol    | Off (ckpool does not support it)     |

### Step 2: Set Up Origin DNS

Create an internal DNS record that the Spectrum application resolves to reach
the actual origin servers. This record uses the load balancer from Option A:

| Record                                | Type | Value                    |
|---------------------------------------|:----:|--------------------------|
| `stratum-origin.thebitcoingame.com`   | A    | Load Balancer (see above)|

Spectrum connects to the origin via this load-balanced hostname, inheriting
the geo-steering and health check configuration.

### Step 3: Miner Configuration

With Spectrum, miners connect to:

```
stratum+tcp://stratum.thebitcoingame.com:3333
```

Cloudflare terminates the TCP connection at its edge, then proxies it to
the nearest healthy ckpool origin. Miners see Cloudflare edge IPs, not the
origin server IPs.

### Spectrum Caveats

| Concern                   | Detail                                          |
|---------------------------|-------------------------------------------------|
| Proxy Protocol            | Keep **off** -- ckpool does not parse PP headers |
| Client IP visibility      | ckpool sees Cloudflare edge IPs, not miner IPs  |
| Added latency             | 1-3 ms per hop through Cloudflare edge           |
| Cost                      | Enterprise pricing, plus per-GB egress           |
| Connection limits         | Check Spectrum plan limits for concurrent TCP    |

For most deployments, DNS-only mode (Option A) is preferred because it avoids
the IP visibility issue and Enterprise cost. Spectrum makes sense only if the
pool faces active DDoS attacks on the Stratum port.

---

## API Configuration Example

Using the Cloudflare API to create the load balancer programmatically:

```bash
# Create health monitor
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/load_balancers/monitors" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "tcp",
    "port": 3333,
    "interval": 15,
    "timeout": 5,
    "retries": 2,
    "description": "Stratum TCP health check"
  }'

# Create pool (repeat for each region)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/load_balancers/pools" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "ckpool-eu-west",
    "origins": [{
      "name": "ckpool-eu",
      "address": "<eu-west-public-ip>",
      "enabled": true,
      "weight": 1
    }],
    "monitor": "<monitor-id>",
    "notification_email": "ops@thebitcoingame.com",
    "enabled": true
  }'

# Create load balancer with geo steering
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/load_balancers" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "stratum.thebitcoingame.com",
    "fallback_pool": "<eu-pool-id>",
    "default_pools": ["<eu-pool-id>", "<us-pool-id>", "<asia-pool-id>"],
    "region_pools": {
      "WEUR": ["<eu-pool-id>"],
      "EEUR": ["<eu-pool-id>"],
      "ENAM": ["<us-pool-id>"],
      "WNAM": ["<us-pool-id>"],
      "EAS": ["<asia-pool-id>"],
      "SEAS": ["<asia-pool-id>"],
      "SAS": ["<asia-pool-id>"],
      "OC": ["<asia-pool-id>"]
    },
    "steering_policy": "geo",
    "proxied": false,
    "ttl": 60
  }'
```

---

## Cost Comparison

| Feature                          | Cloudflare LB (DNS-only) | Cloudflare Spectrum |
|----------------------------------|:------------------------:|:-------------------:|
| Plan requirement                 | Pro+ ($20/mo)            | Enterprise          |
| Load Balancing add-on            | $5/mo + $5/origin        | Included            |
| Health checks                    | Included                 | Included            |
| TCP DDoS protection              | No                       | Yes                 |
| Miner sees origin IP             | Yes                      | No                  |
| Monthly estimate (3 origins)     | ~$35/mo                  | Custom pricing      |

For TheBitcoinGame, the **DNS-only load balancing** option is the recommended
starting point. It provides GeoDNS routing and health-check-based failover
at a predictable cost without the complexity of TCP proxying.
