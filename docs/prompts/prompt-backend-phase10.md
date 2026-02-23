# Prompt: Backend Service — Phase 10 (Production Hardening)

You are hardening the backend service for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite) and fully integrated with the backend (Phase 9). The backend API has been built through Phases 0-8: testing infrastructure, authentication (JWT RS256 + Bitcoin message signing), mining data, real-time WebSocket, gamification engine, games & lottery, competition & leaderboards, social & cooperatives, and education — totaling approximately 63 API endpoints.

Phase 10 introduces **zero new features**. Every change is about making existing features **safe, fast, observable, and recoverable** for production deployment. This is the final gate before public launch.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. The backend lives at `backend/`. You will modify files in `backend/` and create production infrastructure configuration. You will NOT modify `dashboard/` except for verifying it still builds.

---

## IMPORTANT CONSTRAINTS

1. **No new features** — Phase 10 is exclusively about security, performance, monitoring, backup, and operations. Do not add any new API endpoints beyond the 4 admin/infrastructure endpoints specified in this prompt.
2. **Do not touch `dashboard/`** — The frontend is complete and integrated. Do not modify anything in the dashboard directory.
3. **No corners cut on security** — This phase protects real users and real mining data. Every OWASP audit item, every rate limit, every input validation rule is mandatory. Do not skip items.
4. **Python 3.12 + FastAPI** — All code uses async/await. All database operations use SQLAlchemy 2.0 async sessions with asyncpg. No synchronous blocking calls in the request path.
5. **Docker-first production** — Production deployment uses Docker Compose with health checks, secrets management, and rolling updates. All production configs must be provided.
6. **Testing is NON-NEGOTIABLE** — The OWASP audit must be documented and all items verified. Load testing with Locust must demonstrate the system handles 1000 concurrent users. All chaos testing scenarios must be executed and results documented.
7. **Backward compatibility** — All existing API endpoints must continue working unchanged. Rate limiting and security headers are additive — they must not break any existing client behavior.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Full backend architecture, all API endpoints, WebSocket protocol, security section. This tells you what you are hardening.
2. `docs/backend-service/roadmap/phase-10-production.md` — The authoritative Phase 10 specification. Contains the complete security audit checklist, rate limiter implementation, Prometheus metrics, Grafana dashboard specs, alert rules, backup strategy, Docker Compose production config, audit log, load test script, and all testing scenarios.
3. `docs/backend-service/roadmap/phase-01-authentication.md` — Authentication implementation: JWT RS256, Bitcoin message signing, token refresh. Understand this before auditing auth security.
4. `docs/backend-service/roadmap/phase-03-realtime.md` — WebSocket implementation. Understand the connection model before implementing WebSocket rate limiting.
5. `docs/backend-service/roadmap/phase-09-frontend-integration.md` — Frontend integration context. Understand how the frontend uses the API so you don't break it with security changes.
6. `docs/ckpool-service/roadmap/phase-05-production.md` — The CKPool production hardening phase. Reference this for infrastructure patterns (Prometheus, Grafana, alerting, backup strategies) that should be consistent across the stack.
7. `docs/thebitcoingame-project-plan.md` — Overall project context and production deployment strategy.

Read ALL of these before writing any code. Phase 10 touches every layer of the backend stack.

---

## What You Are Building

### Part 1: Security Audit — OWASP Top 10

Audit all ~63 API endpoints against the OWASP Top 10:

| # | OWASP Category                    | Risk Area in TBG                           | Mitigation                                                |
|---|-----------------------------------|--------------------------------------------|-----------------------------------------------------------|
| 1 | A01: Broken Access Control        | Auth bypass on protected endpoints         | JWT verification on all protected routes; verify every route has correct `Depends(get_current_user)` or `Depends(get_current_user_optional)` |
| 2 | A02: Cryptographic Failures       | JWT secret exposure, weak hashing          | RS256 JWT with proper key rotation support; secrets loaded from files (`/run/secrets/`), never environment variables in production |
| 3 | A03: Injection                    | SQL injection via raw queries              | Parameterized queries everywhere; create and run the SQL injection scanner (see Part 1.2) |
| 4 | A04: Insecure Design              | Missing rate limits, no audit trail        | Tiered rate limiting (Part 2); audit_log table (Part 5)   |
| 5 | A05: Security Misconfiguration    | Debug mode, default credentials, CORS      | Strict CORS in production (Part 1.4); no debug mode; rotate all default passwords |
| 6 | A06: Vulnerable Components        | Outdated dependencies with CVEs            | Run `pip-audit` and `npm audit`; fix all critical/high findings |
| 7 | A07: Auth Failures                | Brute force on auth endpoints              | Rate limit `/api/v1/auth/*` to 5/min per IP (Part 2)     |
| 8 | A08: Software/Data Integrity      | Unsigned JWT, unverified dependencies      | RS256 (already using); Docker image pinning with digests   |
| 9 | A09: Logging/Monitoring Failures  | Missing security event logging             | Audit log for all auth/admin actions (Part 5)              |
| 10| A10: SSRF                         | User-controlled URLs in requests           | No outbound requests from user input; validate all inputs  |

#### 1.2 SQL Injection Scanner

Create `backend/app/security/sql_audit.py` — a script that scans all Python files for potential SQL injection patterns:

```python
RISKY_PATTERNS = [
    "f\"SELECT", "f'SELECT", ".format(",
    "f\"INSERT", "f'INSERT",
    "f\"UPDATE", "f'UPDATE",
    "f\"DELETE", "f'DELETE",
]
```

Run as: `python -m app.security.sql_audit` — must exit with code 0 (no risks found).

#### 1.3 Pydantic Strict Mode

Create `backend/app/schemas/strict.py` with a `StrictBaseModel`:

```python
from pydantic import BaseModel, ConfigDict

class StrictBaseModel(BaseModel):
    model_config = ConfigDict(strict=True)
```

Migrate ALL request body schemas across all phases to inherit from `StrictBaseModel` instead of plain `BaseModel`. Add field constraints (min/max length, regex patterns) to all user-provided string fields. Key schemas to tighten:

| Schema                         | Constraints                                                      |
|--------------------------------|------------------------------------------------------------------|
| `CreateCooperativeRequest`     | `name`: 3-100 chars, `^[\w\s\-]+$`; `description`: max 500      |
| `JoinCooperativeRequest`       | `invite_code`: exactly 8 chars, `^[A-Z0-9]+$`                   |
| `UpdateSettingsRequest`        | `display_name`: 2-50 chars; `sound_mode`: `^(off\|subtle\|full)$` |
| `CompleteLessonRequest`        | `lesson_id`: `^\d+-\d+$`                                        |
| All string query parameters    | Max length 200, no control characters                            |

#### 1.4 CORS Configuration

Create `backend/app/security/cors.py`:

```python
PRODUCTION_ORIGINS = [
    "https://thebitcoingame.com",
    "https://www.thebitcoingame.com",
    "https://app.thebitcoingame.com",
]

DEVELOPMENT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
```

Configure CORS middleware based on the `ENVIRONMENT` setting. In production, ONLY the production origins are allowed. In development, both are allowed. Set `max_age=3600` (cache preflight for 1 hour).

#### 1.5 HTTP Security Headers

Add a middleware that sets on every response:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
```

### Part 2: Tiered Rate Limiting

Create `backend/app/security/rate_limiter.py` implementing a Redis-backed sliding window rate limiter:

| Tier              | Limit       | Window  | Scope    | Key Pattern                   |
|-------------------|-------------|---------|----------|-------------------------------|
| Unauthenticated   | 30 req/min  | 60s     | Per IP   | `ratelimit:unauth:{ip}`      |
| Authenticated     | 120 req/min | 60s     | Per user | `ratelimit:auth:{user_id}`   |
| WebSocket         | 60 msg/min  | 60s     | Per conn | In-memory counter             |
| API Keys          | 600 req/min | 60s     | Per key  | `ratelimit:api_key:{key}`    |
| Auth endpoints    | 5 req/min   | 60s     | Per IP   | `ratelimit:auth_endpoint:{ip}` |

Implementation requirements:
- Use Redis sorted sets (`ZADD`) with timestamp scores for precise sliding windows
- Pipeline the `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD` + `EXPIRE` operations for atomicity
- Return rate limit headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Return `429 Too Many Requests` with `Retry-After` header when limit is exceeded
- Classify requests by tier: check auth endpoint path first, then API key header, then JWT, then IP

The full `RateLimiter` and `RateLimitMiddleware` implementations are in the Phase 10 roadmap Section 10.4.2.

### Part 3: Performance Optimization

#### 3.1 Query Analysis

Run `EXPLAIN ANALYZE` on all hot queries and document the execution plans:

1. **Weekly game data query** (Phase 5 — called on every game page load)
2. **Leaderboard rebuild query** (Phase 6 — runs every 5 minutes via background worker)
3. **Notification list query** (Phase 7 — called on every page load by unread count)
4. **User progress query** (Phase 8 — called on education pages)

Target: < 5ms for user-specific queries, < 5s for aggregate queries on 1M+ rows.

#### 3.2 Missing Indexes

Create a migration (`backend/migrations/versions/010_performance_indexes.py`) to add:

```sql
-- Per-user share lookup with time ordering
CREATE INDEX CONCURRENTLY idx_events_user_ts
ON mining_events ((payload->>'user'), ts DESC)
WHERE event_type = 'share_submitted';

-- Accepted shares partial index
CREATE INDEX CONCURRENTLY idx_events_accepted_shares
ON mining_events (ts DESC, (payload->>'user'))
WHERE event_type = 'share_submitted'
  AND (payload->>'accepted')::boolean = true;

-- Lottery results user lookup
CREATE INDEX CONCURRENTLY idx_lottery_results_user_time
ON lottery_results (user_id, created_at DESC);

-- Game session analytics
CREATE INDEX CONCURRENTLY idx_game_sessions_analytics
ON game_sessions (game_type, week_start, played_at DESC);
```

Use `CONCURRENTLY` for all index creation to avoid locking production tables.

#### 3.3 Connection Pool Tuning

Update `backend/app/db.py` (or equivalent) with production pool settings:

```python
# asyncpg pool
min_size=5       # Always keep 5 connections warm
max_size=20      # Cap at 20 to prevent DB overload
command_timeout=30
server_settings={
    "statement_timeout": "30000",
    "idle_in_transaction_session_timeout": "60000",
    "jit": "off",  # Disable JIT for consistent latency
}

# Redis pool
max_connections=20
socket_timeout=5
socket_connect_timeout=5
retry_on_timeout=True
health_check_interval=30
```

### Part 4: Monitoring — Prometheus + Grafana

#### 4.1 Prometheus Integration

Create `backend/app/monitoring.py`:

1. Install `prometheus-fastapi-instrumentator` for automatic HTTP metrics (request rate, latency histograms, error rates)
2. Add custom application metrics:

| Metric                              | Type      | Labels                    | Description                      |
|-------------------------------------|-----------|---------------------------|----------------------------------|
| `tbg_mining_shares_total`           | Counter   | `status` (accepted/rejected) | Total shares processed        |
| `tbg_mining_blocks_found_total`     | Counter   | —                         | Total blocks found               |
| `tbg_mining_active_workers`         | Gauge     | —                         | Currently connected workers      |
| `tbg_mining_pool_hashrate_ths`      | Gauge     | —                         | Pool hashrate in TH/s            |
| `tbg_gamification_xp_awarded_total` | Counter   | `source`                  | XP awarded by source             |
| `tbg_gamification_badges_awarded_total` | Counter | `badge_id`             | Badges awarded by type           |
| `tbg_gamification_lottery_draws_total` | Counter | —                       | Total lottery draws              |
| `tbg_ws_active_connections`         | Gauge     | —                         | Active WebSocket connections     |
| `tbg_ws_messages_sent_total`        | Counter   | `event_type`              | WS messages sent by type         |
| `tbg_db_pool_size`                  | Gauge     | —                         | DB connection pool size          |
| `tbg_db_pool_free`                  | Gauge     | —                         | Free DB connections              |
| `tbg_redis_pool_size`               | Gauge     | —                         | Redis pool size                  |
| `tbg_redis_pool_active`             | Gauge     | —                         | Active Redis connections         |
| `tbg_rate_limit_hits_total`         | Counter   | `tier`                    | Rate limit rejections            |

3. Expose metrics at `/metrics` endpoint (excluded from API docs)

#### 4.2 Grafana Dashboards

Create 4 JSON dashboard files in `backend/monitoring/grafana/dashboards/`:

**Dashboard 1 — API Overview:** Request rate, error rate %, latency p50/p95/p99, active WS connections, rate limit rejections, top 10 slowest endpoints.

**Dashboard 2 — Mining:** Pool hashrate, active workers, share rate by status, blocks found, rejected share %.

**Dashboard 3 — Gamification:** XP awarded rate by source, badges awarded today, lottery draws, active game sessions.

**Dashboard 4 — Infrastructure:** DB pool utilization, Redis pool utilization, DB query latency heatmap, system CPU/memory, disk usage.

#### 4.3 Alert Rules

Create `backend/monitoring/prometheus/alerts/tbg-backend.yml` with:

**Critical alerts (page on-call):**
- `HighErrorRate` — API error rate > 1% for 5 minutes
- `HighLatency` — p99 latency > 500ms for 5 minutes
- `WorkerOffline` — All mining workers offline for 30+ minutes
- `DatabaseDown` — PostgreSQL unreachable for 30 seconds
- `RedisDown` — Redis unreachable for 30 seconds

**Warning alerts (notify channel):**
- `HighDBPoolUtilization` — DB pool > 80% for 5 minutes
- `RateLimitSpike` — Rate limit rejections > 100/s for 5 minutes
- `DiskSpaceLow` — Disk below 15% for 10 minutes

### Part 5: Audit Log

#### 5.1 Database Table

Create migration `backend/migrations/versions/010_audit_log.py`:

```sql
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id         VARCHAR(128),
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     VARCHAR(200),
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),
    details         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          VARCHAR(20) NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success', 'failure', 'denied'))
);

CREATE INDEX idx_audit_timestamp ON audit_log (timestamp DESC);
CREATE INDEX idx_audit_user ON audit_log (user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log (action, timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_log (resource_type, resource_id);
```

The audit log is **append-only**. No UPDATE or DELETE operations. Retention: 1 year via pg_cron or background worker.

#### 5.2 Audit Service

Create `backend/app/services/audit_service.py`:

Audited actions (minimum set — add more as needed):
- `auth.login`, `auth.logout`, `auth.token_refresh`, `auth.failed_login`
- `user.settings_updated`, `user.profile_updated`
- `coop.created`, `coop.member_removed`, `coop.dissolved`
- `admin.cache_cleared`, `admin.audit_viewed`, `admin.stats_viewed`

Each audit entry records: timestamp, user_id, action, resource_type, resource_id, IP address, User-Agent, details (JSONB), and status (success/failure/denied).

#### 5.3 Wire Audit Calls

Add `audit_log()` calls to:
- All auth endpoints (login, logout, refresh, failed attempts)
- Settings and profile update endpoints
- Cooperative management endpoints (create, join, leave, dissolve)
- All admin endpoints

### Part 6: Backup & Operations

#### 6.1 PostgreSQL Backup

Configure daily automated backups:
- **pg_dump daily** at 02:00 UTC — full logical backup, 7-day local retention
- **WAL archiving** — continuous, for point-in-time recovery
- Use `prodrigestivill/postgres-backup-local:16` Docker image or equivalent

#### 6.2 Redis Backup

Configure persistence:
```conf
save 300 1          # RDB: snapshot if >=1 key changed in 5 min
save 60 1000        # RDB: snapshot if >=1000 keys changed in 1 min
appendonly yes
appendfsync everysec
```

#### 6.3 Docker Compose Production

Create `backend/docker-compose.prod.yml` with:

- **API service:** 2 replicas, rolling updates (start-first, 30s delay), health check, secrets for JWT and DB password, memory limits
- **Database:** TimescaleDB with health check, WAL archiving volume, password from Docker secrets
- **Redis:** Custom redis.conf with persistence, health check
- **Prometheus:** Mounted config + alert rules
- **Grafana:** Mounted dashboards + provisioning, admin password from secrets
- **Backup service:** Scheduled pg_dump with retention policy

All sensitive values (passwords, JWT keys) loaded via Docker secrets from files, NEVER from environment variables in production.

#### 6.4 Health Check Endpoint

Create `GET /health` that checks:
- Database connectivity (`SELECT 1`)
- Redis connectivity (`PING`)
- Returns `200 {"status": "healthy"}` or `503 {"status": "degraded", "checks": {...}}`

### Part 7: Admin Endpoints

| # | Method | Path                       | Auth  | Description                              |
|---|--------|----------------------------|-------|------------------------------------------|
| 1 | GET    | `/metrics`                 | None  | Prometheus metrics (instrumentator)      |
| 2 | GET    | `/health`                  | None  | Health check for Docker/load balancer    |
| 3 | GET    | `/api/v1/admin/stats`      | Admin | System statistics (users, miners, shares)|
| 4 | GET    | `/api/v1/admin/audit`      | Admin | Query audit log (paginated, filterable)  |
| 5 | POST   | `/api/v1/admin/cache/clear`| Admin | Emergency Redis cache clear              |

Admin authentication: either a special `is_admin` flag on user records, or a separate admin API key. Document the approach chosen.

---

## Testing Requirements

**Testing is NON-NEGOTIABLE.** All items below must be completed and documented.

### Security Testing — OWASP Penetration Checklist

| # | Test                                        | Tool/Method          | Pass Criteria                             |
|---|---------------------------------------------|----------------------|-------------------------------------------|
| 1 | SQL injection on all text inputs            | `sql_audit.py` + manual | 0 risks found                          |
| 2 | XSS via user-submitted content              | Manual review        | No unescaped user content in responses    |
| 3 | CSRF on state-changing endpoints            | Manual curl          | CORS blocks cross-origin POST/PUT/PATCH   |
| 4 | Authentication bypass                       | Manual + curl        | 401 without valid JWT on all protected endpoints |
| 5 | JWT manipulation (alg=none, expired, tampered) | Manual            | All rejected correctly                    |
| 6 | Rate limit validation (all 5 tiers)         | Bash script          | 429 returned at correct threshold         |
| 7 | CORS validation                             | curl with Origin header | Only allowed origins receive CORS headers |
| 8 | Directory traversal                         | Manual               | No path traversal possible                |
| 9 | Sensitive data in responses                 | Manual review        | No passwords, secrets, PII leaked         |
| 10| HTTP security headers                       | curl + securityheaders.com | All headers present and correct     |

### Load Testing — Locust

Create `backend/tests/loadtest/locustfile.py`:

```python
from locust import HttpUser, task, between
import random

class TBGUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        response = self.client.post("/api/v1/auth/connect", json={
            "btc_address": f"bc1qtest{random.randint(1000, 9999)}",
            "signature": "test_sig",
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.client.headers["Authorization"] = f"Bearer {self.token}"

    @task(10)
    def get_mining_stats(self):
        self.client.get("/api/v1/mining/stats")

    @task(5)
    def get_weekly_game_data(self):
        self.client.get("/api/v1/games/weekly-data")

    @task(3)
    def get_leaderboard(self):
        period = random.choice(["weekly", "monthly", "alltime"])
        self.client.get(f"/api/v1/leaderboard/{period}")

    @task(2)
    def get_notifications(self):
        self.client.get("/api/v1/notifications?limit=20")

    @task(2)
    def get_education_tracks(self):
        self.client.get("/api/v1/education/tracks")

    @task(1)
    def complete_lesson(self):
        lesson_id = random.choice(["1-1", "1-2", "1-3", "2-1", "2-2"])
        self.client.post(f"/api/v1/education/lessons/{lesson_id}/complete")

    @task(1)
    def get_badges(self):
        self.client.get("/api/v1/gamification/badges")
```

**Targets:**
- 1000 concurrent users
- 5000 requests/second sustained
- 95th percentile latency < 200ms
- 0% error rate under normal load

Run command:
```bash
locust -f backend/tests/loadtest/locustfile.py \
    --users 1000 --spawn-rate 50 --run-time 30m \
    --host http://localhost:8000 \
    --csv results/loadtest --html results/loadtest.html
```

### WebSocket Stress Test

Create `backend/tests/loadtest/ws_stress_test.py`:

- 100 concurrent WebSocket connections
- Each maintains connection for 5 minutes
- Verifies heartbeat ping/pong
- **Target:** 95%+ connections maintained, all messages delivered

### Chaos Testing

| # | Scenario                      | Method                    | Expected Behavior                                     |
|---|-------------------------------|---------------------------|-------------------------------------------------------|
| 1 | Kill API container            | `docker stop api`         | Health check fails → auto-restart in <10s             |
| 2 | Kill database                 | `docker stop db`          | API returns 503, recovers when DB returns             |
| 3 | Kill Redis                    | `docker stop redis`       | Rate limiting disabled; leaderboards stale; recovers  |
| 4 | Network partition (API to DB) | iptables rule             | API returns 503, auto-recovers when network heals     |
| 5 | Disk full                     | fallocate fill            | Logging stops, API continues serving from memory      |
| 6 | Clock skew (+1 hour)          | Change system clock       | JWT validation handles gracefully, no crash           |
| 7 | Redis memory full             | Set maxmemory to 1MB      | Eviction policy; API degrades gracefully              |
| 8 | Backup restore test           | Restore latest pg_dump    | All data recovered, application starts normally       |

### Rate Limiting Validation

```bash
# Unauthenticated: 30/min
for i in $(seq 1 35); do
    status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/education/tracks)
    echo "Request $i: HTTP $status"
done
# Expected: 1-30 → 200, 31-35 → 429

# Authenticated: 120/min
TOKEN="..."
for i in $(seq 1 125); do
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        http://localhost:8000/api/v1/mining/stats)
    echo "Request $i: HTTP $status"
done
# Expected: 1-120 → 200, 121-125 → 429

# Auth endpoint: 5/min
for i in $(seq 1 8); do
    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST http://localhost:8000/api/v1/auth/connect \
        -H "Content-Type: application/json" \
        -d '{"btc_address":"bc1qtest","signature":"test"}')
    echo "Request $i: HTTP $status"
done
# Expected: 1-5 → 200/401, 6-8 → 429
```

---

## Rules

1. **Read the Phase 10 roadmap first.** `docs/backend-service/roadmap/phase-10-production.md` is the authoritative spec. It contains the complete implementations for rate limiter, monitoring, backup, audit log, and all test scripts.
2. **OWASP audit is systematic.** Go through every endpoint, verify auth decorators, check for raw SQL, verify input validation. Document findings.
3. **Rate limiting uses Redis.** The sliding window implementation uses sorted sets for precision. In-memory fallback only if Redis is down.
4. **Monitoring is comprehensive.** 4 Grafana dashboards, custom application metrics, alert rules for all critical scenarios. Do not ship without monitoring.
5. **Backup is tested.** Creating backups is not enough — you must verify restore works. Run `pg_dump` then `pg_restore` into a fresh database and verify data integrity.
6. **Secrets from files, not env vars.** In production Docker Compose, all passwords and keys use Docker secrets mounted as files. Environment variables may be used in development only.
7. **Health checks are real.** The `/health` endpoint actually connects to the database and Redis. It does not just return 200. A degraded system returns 503 with details about which component is unhealthy.
8. **Audit log is append-only.** No UPDATE or DELETE on the audit_log table. Ever. The service only INSERTs.
9. **No debug in production.** Verify that `DEBUG=false`, no stack traces in error responses, no internal paths leaked, no SQL queries in logs at INFO level.
10. **Use `CONCURRENTLY` for indexes.** All production index creation must use `CREATE INDEX CONCURRENTLY` to avoid locking tables during creation.
11. **Document everything.** Create a `SECURITY_AUDIT.md` report documenting the OWASP findings, load test results, chaos test results, and rate limiting validation.
12. **Backward compatible.** Rate limiting headers are additive. CORS restrictions must allow the frontend origins. Security headers must not break existing functionality.

---

## Files to Create/Edit

| Action | File                                                              |
|--------|-------------------------------------------------------------------|
| CREATE | `backend/app/security/__init__.py`                                |
| CREATE | `backend/app/security/sql_audit.py`                               |
| CREATE | `backend/app/security/rate_limiter.py`                            |
| CREATE | `backend/app/security/cors.py`                                    |
| CREATE | `backend/app/security/headers.py`                                 |
| CREATE | `backend/app/schemas/strict.py`                                   |
| CREATE | `backend/app/monitoring.py`                                       |
| CREATE | `backend/app/services/audit_service.py`                           |
| CREATE | `backend/app/api/v1/admin.py`                                     |
| CREATE | `backend/migrations/versions/010_audit_log.py`                    |
| CREATE | `backend/migrations/versions/010_performance_indexes.py`          |
| CREATE | `backend/monitoring/prometheus/prometheus.yml`                     |
| CREATE | `backend/monitoring/prometheus/alerts/tbg-backend.yml`            |
| CREATE | `backend/monitoring/grafana/dashboards/api-overview.json`         |
| CREATE | `backend/monitoring/grafana/dashboards/mining.json`               |
| CREATE | `backend/monitoring/grafana/dashboards/gamification.json`         |
| CREATE | `backend/monitoring/grafana/dashboards/infrastructure.json`       |
| CREATE | `backend/monitoring/grafana/provisioning/datasources.yml`         |
| CREATE | `backend/monitoring/grafana/provisioning/dashboards.yml`          |
| CREATE | `backend/docker-compose.prod.yml`                                 |
| CREATE | `backend/redis.conf`                                              |
| CREATE | `backend/Dockerfile.prod`                                         |
| CREATE | `backend/tests/loadtest/locustfile.py`                            |
| CREATE | `backend/tests/loadtest/ws_stress_test.py`                        |
| CREATE | `backend/tests/phase10/__init__.py`                               |
| CREATE | `backend/tests/phase10/test_rate_limiter.py`                      |
| CREATE | `backend/tests/phase10/test_audit_log.py`                         |
| CREATE | `backend/tests/phase10/test_security_headers.py`                  |
| CREATE | `backend/tests/phase10/test_health_check.py`                      |
| CREATE | `backend/tests/phase10/conftest.py`                               |
| CREATE | `backend/SECURITY_AUDIT.md`                                       |
| EDIT   | `backend/app/main.py` — Add rate limiter middleware, CORS, security headers, monitoring, admin router, health endpoint |
| EDIT   | `backend/app/db.py` — Update connection pool settings             |
| EDIT   | `backend/app/schemas/*.py` — Migrate to StrictBaseModel           |
| EDIT   | `backend/app/api/v1/auth.py` — Add audit logging                 |
| EDIT   | `backend/app/api/v1/user.py` — Add audit logging                 |
| EDIT   | `backend/app/api/v1/coop.py` — Add audit logging                 |
| EDIT   | `backend/requirements.txt` — Add prometheus-fastapi-instrumentator, locust |

---

## Definition of Done

1. OWASP Top 10 audit completed — all 10 categories checked, findings documented in `SECURITY_AUDIT.md`.
2. SQL injection scanner (`sql_audit.py`) runs and reports 0 risks across all Python files.
3. All request body schemas use `StrictBaseModel` with field constraints (min/max length, patterns).
4. CORS configured: only production origins in production, dev origins in development.
5. HTTP security headers (HSTS, X-Frame-Options, CSP, etc.) present on every response.
6. Rate limiting active: unauthenticated 30/min, authenticated 120/min, WebSocket 60/min, API keys 600/min, auth endpoints 5/min.
7. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on all responses.
8. `429 Too Many Requests` returned correctly at all tier thresholds.
9. Query analysis completed — EXPLAIN ANALYZE documented for all hot queries.
10. Performance indexes created with `CONCURRENTLY` — no table locks.
11. Connection pools configured: asyncpg min=5 max=20, Redis max=20.
12. `audit_log` table created with migration and 4 indexes.
13. Audit service records all security-sensitive actions (auth, settings, coop management, admin).
14. Prometheus metrics exposed at `/metrics` — automatic HTTP metrics + 15 custom application metrics.
15. 4 Grafana dashboards created (API Overview, Mining, Gamification, Infrastructure).
16. Alert rules configured: 5 critical + 3 warning alerts.
17. PostgreSQL backup: daily pg_dump + WAL archiving configured.
18. Redis backup: RDB snapshots + AOF persistence configured.
19. `docker-compose.prod.yml` with 2 API replicas, rolling updates, health checks, and Docker secrets.
20. `GET /health` checks database AND Redis connectivity, returns 503 on degradation.
21. Load test: Locust sustains 1000 concurrent users at 5000 req/sec with p95 < 200ms.
22. WebSocket stress test: 100 concurrent connections maintained for 5 minutes, 95%+ success.
23. Chaos testing: all 8 scenarios executed and results documented.
24. Rate limiting validation: all 5 tiers tested with correct thresholds.
25. Backup restore test: pg_dump → pg_restore → application starts → data verified.
26. `SECURITY_AUDIT.md` created with full audit results, load test reports, and chaos test documentation.
27. `npm run build` in `dashboard/` still passes — frontend not broken.
28. `alembic upgrade head` runs without errors on a fresh database.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Read all reference files** — Read the Phase 10 roadmap, master plan, Phase 1 (auth), Phase 3 (WebSocket), and CKPool Phase 5 (production hardening patterns). Understand the full scope before coding.
2. **Security audit (OWASP)** — Walk through all ~63 endpoints systematically. Check auth decorators, input validation, raw SQL usage. Document findings.
3. **SQL injection scanner** — Create and run `sql_audit.py`. Fix any findings.
4. **Pydantic strict mode** — Create `StrictBaseModel`, migrate all request schemas. Add field constraints.
5. **CORS + security headers** — Implement CORS middleware and security headers middleware. Test with curl.
6. **Rate limiting** — Implement the Redis-backed sliding window rate limiter. Test all 5 tiers with the validation script.
7. **Audit log** — Create the migration, model, and service. Wire audit calls to auth, settings, coop, and admin endpoints.
8. **Performance optimization** — Run EXPLAIN ANALYZE on hot queries. Create the performance indexes migration. Tune connection pools.
9. **Monitoring setup** — Install prometheus-fastapi-instrumentator, add custom metrics, create Grafana dashboards and alert rules.
10. **Health check + admin endpoints** — Implement `/health`, `/api/v1/admin/stats`, `/api/v1/admin/audit`, `/api/v1/admin/cache/clear`.
11. **Production Docker Compose** — Create `docker-compose.prod.yml` with all services, health checks, secrets, backup service.
12. **Load testing** — Run Locust with 1000 users for 30 minutes. Run WebSocket stress test. Document results.
13. **Chaos testing** — Execute all 8 scenarios. Document recovery times and behavior.
14. **Backup test** — pg_dump, pg_restore into fresh database, verify application starts and data is intact.
15. **Write `SECURITY_AUDIT.md`** — Compile all audit results, load test reports, chaos test results, and rate limiting validation into a single report. This is the go/no-go document for launch.

**Critical: Complete steps 2-6 before step 9.** Security comes before monitoring. Fix the vulnerabilities before measuring the metrics.
