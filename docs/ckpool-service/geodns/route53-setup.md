# AWS Route53 GeoDNS Setup

This document covers configuring AWS Route53 geolocation routing for
`stratum.thebitcoingame.com` to route miners to their nearest ckpool region.

---

## Prerequisites

- A Route53 hosted zone for `thebitcoingame.com`
- Public static IPs (or Elastic IPs) for each regional ckpool instance
- IAM permissions for Route53 record and health check management
- The ckpool Stratum port (3333) open in each region's security group

---

## Step 1: Create Health Checks

Create one health check per region. Route53 health checks probe the Stratum TCP
port to confirm the ckpool instance is accepting miner connections.

### EU-West Health Check

| Setting               | Value                          |
|-----------------------|--------------------------------|
| Name                  | `ckpool-eu-stratum`            |
| Protocol              | TCP                            |
| IP Address            | `<eu-west-public-ip>`          |
| Port                  | 3333                           |
| Request Interval      | 10 seconds (Fast)              |
| Failure Threshold     | 3 consecutive failures         |
| Regions               | US-East, EU-West, AP-Southeast |

Repeat for **US-East** (`ckpool-us-stratum`) and **AP-South**
(`ckpool-asia-stratum`) with their respective IPs.

### Health Check Notes

- Use **Fast (10s)** interval. Standard (30s) is too slow for mining failover.
- Set failure threshold to **3** -- this means failover triggers after 30
  seconds of consecutive failures, which balances speed against false positives.
- Select at least **3 checker regions** so that a single checker's network
  issue does not trigger a false failover.
- Route53 health checkers come from AWS IP ranges. Ensure security groups allow
  inbound TCP 3333 from these ranges (published at
  `https://ip-ranges.amazonaws.com/ip-ranges.json`, service `ROUTE53_HEALTHCHECKS`).

---

## Step 2: Create Geolocation Records

Create three A records for `stratum.thebitcoingame.com`, each associated with a
geographic region and linked to its health check.

### Record: EU-West (Europe)

| Field             | Value                           |
|-------------------|---------------------------------|
| Record Name       | `stratum.thebitcoingame.com`    |
| Record Type       | A                               |
| Routing Policy    | Geolocation                     |
| Location          | Europe                          |
| Value             | `<eu-west-public-ip>`           |
| TTL               | 60                              |
| Health Check      | `ckpool-eu-stratum`             |
| Set Identifier    | `stratum-eu`                    |

### Record: US-East (North America + South America)

| Field             | Value                           |
|-------------------|---------------------------------|
| Record Name       | `stratum.thebitcoingame.com`    |
| Record Type       | A                               |
| Routing Policy    | Geolocation                     |
| Location          | North America                   |
| Value             | `<us-east-public-ip>`           |
| TTL               | 60                              |
| Health Check      | `ckpool-us-stratum`             |
| Set Identifier    | `stratum-us`                    |

Create a second record with Location = **South America** pointing to the same
US-East IP and health check (set identifier `stratum-us-south`).

### Record: AP-South (Asia + Oceania)

| Field             | Value                           |
|-------------------|---------------------------------|
| Record Name       | `stratum.thebitcoingame.com`    |
| Record Type       | A                               |
| Routing Policy    | Geolocation                     |
| Location          | Asia                            |
| Value             | `<ap-south-public-ip>`          |
| TTL               | 60                              |
| Health Check      | `ckpool-asia-stratum`           |
| Set Identifier    | `stratum-asia`                  |

Create a second record with Location = **Oceania** pointing to the same
AP-South IP (set identifier `stratum-asia-oceania`).

### Record: Default (Fallback)

| Field             | Value                           |
|-------------------|---------------------------------|
| Record Name       | `stratum.thebitcoingame.com`    |
| Record Type       | A                               |
| Routing Policy    | Geolocation                     |
| Location          | Default                         |
| Value             | `<eu-west-public-ip>`           |
| TTL               | 60                              |
| Health Check      | `ckpool-eu-stratum`             |
| Set Identifier    | `stratum-default`               |

The **Default** record catches queries from any location not covered by a
specific geolocation rule (e.g., Africa, Middle East). It points to EU-West
as the primary region.

---

## Step 3: Verify

```bash
# From a US-based machine
dig +short stratum.thebitcoingame.com
# Expected: <us-east-public-ip>

# From an EU-based machine
dig +short stratum.thebitcoingame.com
# Expected: <eu-west-public-ip>

# Test with EDNS Client Subnet to simulate location
dig +short stratum.thebitcoingame.com @ns-xxx.awsdns-xx.com +subnet=103.0.0.0/8
# Expected: <ap-south-public-ip> (103.x.x.x is APNIC range)
```

---

## Failover Behavior

When a region's health check fails:

1. Route53 stops returning that region's IP for its geolocation zone.
2. Queries from that zone fall through to the **Default** record (EU-West).
3. If the Default record is also unhealthy, Route53 returns all remaining
   healthy records.

For more granular failover control (EU fails -> US, not Asia), see the
[Failover Policy](./failover-policy.md) doc.

---

## Terraform Example

```hcl
# --- Health Checks ---

resource "aws_route53_health_check" "ckpool_eu" {
  ip_address        = var.eu_west_ip
  port              = 3333
  type              = "TCP"
  request_interval  = 10
  failure_threshold = 3

  tags = {
    Name   = "ckpool-eu-stratum"
    Region = "eu-west"
  }
}

resource "aws_route53_health_check" "ckpool_us" {
  ip_address        = var.us_east_ip
  port              = 3333
  type              = "TCP"
  request_interval  = 10
  failure_threshold = 3

  tags = {
    Name   = "ckpool-us-stratum"
    Region = "us-east"
  }
}

resource "aws_route53_health_check" "ckpool_asia" {
  ip_address        = var.ap_south_ip
  port              = 3333
  type              = "TCP"
  request_interval  = 10
  failure_threshold = 3

  tags = {
    Name   = "ckpool-asia-stratum"
    Region = "ap-south"
  }
}

# --- Geolocation Records ---

resource "aws_route53_record" "stratum_eu" {
  zone_id = var.hosted_zone_id
  name    = "stratum.thebitcoingame.com"
  type    = "A"
  ttl     = 60

  set_identifier = "stratum-eu"

  geolocation_routing_policy {
    continent = "EU"
  }

  health_check_id = aws_route53_health_check.ckpool_eu.id
  records         = [var.eu_west_ip]
}

resource "aws_route53_record" "stratum_us" {
  zone_id = var.hosted_zone_id
  name    = "stratum.thebitcoingame.com"
  type    = "A"
  ttl     = 60

  set_identifier = "stratum-us"

  geolocation_routing_policy {
    continent = "NA"
  }

  health_check_id = aws_route53_health_check.ckpool_us.id
  records         = [var.us_east_ip]
}

resource "aws_route53_record" "stratum_us_south" {
  zone_id = var.hosted_zone_id
  name    = "stratum.thebitcoingame.com"
  type    = "A"
  ttl     = 60

  set_identifier = "stratum-us-south"

  geolocation_routing_policy {
    continent = "SA"
  }

  health_check_id = aws_route53_health_check.ckpool_us.id
  records         = [var.us_east_ip]
}

resource "aws_route53_record" "stratum_asia" {
  zone_id = var.hosted_zone_id
  name    = "stratum.thebitcoingame.com"
  type    = "A"
  ttl     = 60

  set_identifier = "stratum-asia"

  geolocation_routing_policy {
    continent = "AS"
  }

  health_check_id = aws_route53_health_check.ckpool_asia.id
  records         = [var.ap_south_ip]
}

resource "aws_route53_record" "stratum_oceania" {
  zone_id = var.hosted_zone_id
  name    = "stratum.thebitcoingame.com"
  type    = "A"
  ttl     = 60

  set_identifier = "stratum-asia-oceania"

  geolocation_routing_policy {
    continent = "OC"
  }

  health_check_id = aws_route53_health_check.ckpool_asia.id
  records         = [var.ap_south_ip]
}

resource "aws_route53_record" "stratum_default" {
  zone_id = var.hosted_zone_id
  name    = "stratum.thebitcoingame.com"
  type    = "A"
  ttl     = 60

  set_identifier = "stratum-default"

  geolocation_routing_policy {
    # Default: no continent/country specified
  }

  health_check_id = aws_route53_health_check.ckpool_eu.id
  records         = [var.eu_west_ip]
}

# --- Variables ---

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for thebitcoingame.com"
  type        = string
}

variable "eu_west_ip" {
  description = "Public IP of the EU ckpool instance"
  type        = string
}

variable "us_east_ip" {
  description = "Public IP of the US ckpool instance"
  type        = string
}

variable "ap_south_ip" {
  description = "Public IP of the Asia ckpool instance"
  type        = string
}
```

---

## Cost Considerations

| Component                | Approximate Monthly Cost |
|--------------------------|:------------------------:|
| Hosted zone              | $0.50                    |
| 6 geolocation records    | $0.70 each = $4.20       |
| 3 health checks (Fast)   | $1.00 each = $3.00       |
| DNS queries (~1M/month)  | $0.40                    |
| **Total**                | **~$8.10/month**         |

Route53 geolocation routing is cost-effective for mining pool DNS. The Fast
health check interval ($1.00/check vs $0.50 for Standard) is worth the extra
$1.50/month for faster failover detection.
