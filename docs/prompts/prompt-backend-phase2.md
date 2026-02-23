# Prompt: Backend Service — Phase 2 (Mining Data API)

You are continuing to build the backend API service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phase 0 (foundation) and Phase 1 (authentication) are complete. The FastAPI project at `services/api/` has the full middleware stack, health endpoints, Bitcoin message signing auth (P2PKH, P2WPKH, P2TR), RS256 JWT tokens, user profile CRUD, settings, and API key management. The `get_current_user` dependency works on all protected endpoints.

The event collector at `services/event-collector/` is already writing 8 event types — `share_submitted`, `block_found`, `miner_connected`, `miner_disconnected`, `diff_updated`, `hashrate_update`, `new_block_network`, `share_best_diff` — to Redis Streams (`mining:{event_type}`) and TimescaleDB (shares hypertable, mining_events table). You will now build the API layer that reads this data and serves it to the frontend dashboard.

This phase builds the Redis Stream consumer, worker status tracking, share pagination, hashrate computation, personal bests, difficulty analysis, and all 17 mining data endpoints.

---

## IMPORTANT CONSTRAINTS

1. **Phase 0 and Phase 1 are complete.** Auth works. JWT tokens work. `get_current_user` dependency works. Do NOT recreate any of this.
2. **Do not touch `dashboard/`** — the frontend is complete. Do not modify anything in the dashboard directory.
3. **Do not touch `services/ckpool/` or `services/event-collector/`** — they are working. The event collector already writes to Redis Streams and TimescaleDB. You are READING this data, not modifying how it is produced.
4. **Cursor-based pagination ONLY.** No OFFSET pagination anywhere. Shares tables can grow to billions of rows — OFFSET becomes O(n). Use keyset pagination with `WHERE time < :cursor ORDER BY time DESC LIMIT :limit`.
5. **Hashrate formula is sacred:** `hashrate = (sum_of_share_difficulties * 2^32) / time_window_seconds`. This is the standard Bitcoin hashrate estimation. Do not invent alternatives.
6. **Redis is the source of truth for live state.** Worker online/offline status, current hashrate, last share timestamp — all live in Redis hashes for O(1) reads. TimescaleDB is for historical data.
7. **arq for background workers.** The stream consumer and hashrate snapshotter run as arq workers, not as FastAPI background tasks.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Sections 4.2 (Share Submission to Dashboard Update flow), 6 (Mining Dashboard endpoint spec), 8 (Background Workers — event-consumer). These define what you are building.
2. `docs/backend-service/roadmap/phase-02-mining-data.md` — **The detailed specification for Phase 2.** Contains complete code for the stream consumer, worker service, share service, hashrate service, personal bests, all 17 endpoints, cursor pagination, and tests.
3. `services/event-collector/src/schemas.py` — The 8 event types and their field definitions. Your consumer must handle all of them.
4. `services/event-collector/src/redis_publisher.py` — How events are published (stream key format: `mining:{event_type}`, fields: `event`, `ts`, `source`, `data`).
5. `services/event-collector/sql/init.sql` — Existing schema (shares hypertable, blocks, workers, weekly_best_diff, mining_events).
6. `services/api/src/tbg/auth/dependencies.py` — The `get_current_user` dependency you will use on all protected endpoints.
7. `services/api/src/tbg/config.py` — Current config. You will add stream consumer and mining settings.
8. `docs/backend-service/00-master-plan.md` Section 5 — Database schema for `personal_bests`, `user_daily_stats`, `hashrate_snapshots`, `network_difficulty` tables.

Read ALL of these before writing any code.

---

## What You Are Building

### Part 1: Redis Stream Consumer (arq Worker)

Create `src/tbg/workers/event_consumer.py` — an arq worker that reads mining events from Redis Streams using XREADGROUP with consumer group `tbg-api-consumers`.

**Stream-to-handler mapping:**

```python
STREAM_HANDLERS = {
    "mining:share_submitted": handle_share,
    "mining:block_found": handle_block,
    "mining:miner_connected": handle_connect,
    "mining:miner_disconnected": handle_disconnect,
    "mining:diff_updated": handle_diff_update,
    "mining:hashrate_update": handle_hashrate,
    "mining:new_block_network": handle_network_block,
    "mining:share_best_diff": handle_best_diff,
}
```

**Consumer loop:**

```python
async def consume_events(ctx: dict) -> None:
    """Main consumer loop — runs continuously, reads from all 8 streams."""
    redis = ctx["redis"]
    group = "tbg-api-consumers"
    consumer = settings.redis_stream_consumer_name

    # Create consumer group (idempotent)
    for stream in STREAM_HANDLERS:
        try:
            await redis.xgroup_create(stream, group, id="0", mkstream=True)
        except redis.ResponseError:
            pass  # Group already exists

    while True:
        events = await redis.xreadgroup(
            groupname=group,
            consumername=consumer,
            streams=STREAM_HANDLERS.keys(),
            count=100,
            block=5000,  # Block 5 seconds if no events
        )
        for stream_name, messages in events:
            handler = STREAM_HANDLERS[stream_name]
            for msg_id, data in messages:
                await handler(ctx, data)
                await redis.xack(stream_name, group, msg_id)
```

**Event handlers:**

| Handler | What It Does |
|---|---|
| `handle_share` | Update worker last_share in Redis hash, increment daily stats counter, publish to `ws:user:{address}` for real-time feed |
| `handle_block` | Record in activity feed, publish global block notification |
| `handle_connect` | Set worker status to online in Redis hash, record IP/user-agent |
| `handle_disconnect` | Set worker status to offline, record session duration |
| `handle_diff_update` | Update worker current_diff in Redis hash |
| `handle_hashrate` | Update worker hashrate fields (1m/5m/1h) in Redis hash |
| `handle_network_block` | Update cached network difficulty |
| `handle_best_diff` | Update personal best if greater, check for badge triggers (Phase 4) |

### Part 2: Worker Status Tracking (Redis Hashes)

Live worker state stored in Redis for O(1) reads:

**Key pattern:** `worker:{btc_address}:{worker_name}`

```python
# Redis hash fields per worker:
{
    "status": "online",           # online/offline
    "hashrate_1m": "1200000000",  # H/s as string
    "hashrate_5m": "1180000000",
    "hashrate_1h": "1195000000",
    "current_diff": "65536",
    "last_share": "2026-02-23T12:00:01Z",  # ISO timestamp
    "ip_address": "203.0.113.42",
    "user_agent": "Bitaxe/2.0",
    "connected_at": "2026-02-23T08:00:00Z",
}
```

**Offline detection:** If no share received for 10 minutes (configurable), mark worker offline. Implemented via a background scan or TTL on a separate "heartbeat" key.

**User worker index:** Maintain a Redis SET `workers:{btc_address}` containing all worker names for a user, for O(1) enumeration.

### Part 3: Cursor-Based Share Pagination

All share queries use keyset pagination. Never use OFFSET.

```python
async def get_shares(
    db: AsyncSession,
    btc_address: str,
    limit: int = 50,
    cursor: str | None = None,
    valid_only: bool | None = None,
) -> tuple[list[Share], str | None]:
    """
    Cursor-based share pagination.
    Cursor is base64-encoded JSON: {"time": "2026-02-23T12:00:00Z", "id": 12345}
    """
    query = select(Share).where(Share.btc_address == btc_address)

    if cursor:
        decoded = json.loads(base64.b64decode(cursor))
        query = query.where(
            or_(
                Share.time < decoded["time"],
                and_(Share.time == decoded["time"], Share.id < decoded["id"]),
            )
        )

    if valid_only is not None:
        query = query.where(Share.is_valid == valid_only)

    query = query.order_by(Share.time.desc()).limit(limit + 1)
    result = await db.execute(query)
    rows = result.scalars().all()

    has_more = len(rows) > limit
    items = rows[:limit]

    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = base64.b64encode(
            json.dumps({"time": last.time.isoformat(), "id": last.id}).encode()
        ).decode()

    return items, next_cursor
```

### Part 4: Hashrate Computation

**Formula:** `hashrate_hps = (sum_diff * 2^32) / time_window_seconds`

Where `sum_diff` is the sum of accepted share difficulties in the time window.

```python
async def compute_hashrate(db: AsyncSession, btc_address: str, window_seconds: int) -> float:
    """Compute estimated hashrate over a time window."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
    result = await db.execute(
        select(func.sum(Share.share_diff))
        .where(Share.btc_address == btc_address)
        .where(Share.time >= cutoff)
        .where(Share.is_valid == True)
    )
    sum_diff = result.scalar() or 0.0
    return (sum_diff * (2 ** 32)) / window_seconds
```

**Hashrate snapshots:** Every 5 minutes, a background worker computes hashrate for all active users and writes to the `hashrate_snapshots` hypertable. This powers the hashrate chart endpoint.

### Part 5: Personal Bests

Track per-user best difficulty for week, month, and all-time periods:

```python
async def update_personal_best(
    db: AsyncSession,
    user_id: int,
    difficulty: float,
    period: str,  # "week", "month", "alltime"
    worker_name: str,
) -> bool:
    """Update personal best if new difficulty exceeds current. Returns True if new record."""
```

Percentile rank computation (updated hourly by stats worker):

```sql
SELECT
    user_id,
    PERCENT_RANK() OVER (ORDER BY best_difficulty) * 100 AS percentile
FROM personal_bests
WHERE period = 'week'
```

### Part 6: Database Schema (Alembic Migration 003)

Create `alembic/versions/003_mining_data.py`:

```sql
-- Personal bests (week, month, alltime)
CREATE TABLE IF NOT EXISTS personal_bests (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period          VARCHAR(12) NOT NULL,  -- week, month, alltime
    best_difficulty DOUBLE PRECISION NOT NULL,
    achieved_at     TIMESTAMPTZ NOT NULL,
    worker_name     VARCHAR(128),
    UNIQUE(user_id, period)
);

-- Daily aggregated stats per user
CREATE TABLE IF NOT EXISTS user_daily_stats (
    user_id         BIGINT NOT NULL REFERENCES users(id),
    date            DATE NOT NULL,
    total_shares    BIGINT DEFAULT 0,
    accepted_shares BIGINT DEFAULT 0,
    rejected_shares BIGINT DEFAULT 0,
    best_diff       DOUBLE PRECISION DEFAULT 0,
    avg_hashrate    DOUBLE PRECISION DEFAULT 0,
    workers_active  INTEGER DEFAULT 0,
    PRIMARY KEY(user_id, date)
);

-- Hashrate snapshots (5-minute granularity hypertable)
CREATE TABLE IF NOT EXISTS hashrate_snapshots (
    time            TIMESTAMPTZ NOT NULL,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    hashrate_1m     DOUBLE PRECISION,
    hashrate_5m     DOUBLE PRECISION,
    hashrate_1h     DOUBLE PRECISION,
    workers_online  INTEGER DEFAULT 0
);
SELECT create_hypertable('hashrate_snapshots', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- Network difficulty history
CREATE TABLE IF NOT EXISTS network_difficulty (
    block_height    INTEGER PRIMARY KEY,
    difficulty      DOUBLE PRECISION NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL
);
```

### Part 7: API Endpoints (17 Total)

Create `src/tbg/mining/router.py`:

| # | Method | Path | Description | Auth |
|---|---|---|---|---|
| 1 | GET | `/api/v1/mining/workers` | List all workers (from Redis hashes) | Yes |
| 2 | GET | `/api/v1/mining/workers/{name}` | Single worker detail + recent shares | Yes |
| 3 | GET | `/api/v1/mining/workers/{name}/hashrate` | Worker-specific hashrate chart | Yes |
| 4 | GET | `/api/v1/mining/shares` | Paginated share history (cursor-based) | Yes |
| 5 | GET | `/api/v1/mining/shares/stats` | Share stats (today, accepted rate, total) | Yes |
| 6 | GET | `/api/v1/mining/difficulty/bests` | Personal bests (week/month/alltime) | Yes |
| 7 | GET | `/api/v1/mining/difficulty/scatter` | Last 200 shares as (time, difficulty) pairs | Yes |
| 8 | GET | `/api/v1/mining/difficulty/distribution` | Difficulty histogram (8 ranges) | Yes |
| 9 | GET | `/api/v1/mining/difficulty/percentile` | User's percentile rank vs all miners | Yes |
| 10 | GET | `/api/v1/mining/blocks` | Blocks found by pool (paginated) | Yes |
| 11 | GET | `/api/v1/mining/blocks/{height}` | Single block detail | Yes |
| 12 | GET | `/api/v1/mining/hashrate` | Hashrate summary + sparkline | Yes |
| 13 | GET | `/api/v1/mining/hashrate/chart` | Hashrate time series (1h/24h/7d/30d window) | Yes |
| 14 | GET | `/api/v1/mining/summary` | Dashboard-style mining summary | Yes |
| 15 | GET | `/api/v1/mining/uptime` | Worker uptime calendar (30-day grid) | Yes |
| 16 | GET | `/api/v1/mining/network/difficulty` | Current network difficulty + history | Yes |
| 17 | GET | `/api/v1/mining/network/blocks` | Recent network blocks | Yes |

**Response format for paginated endpoints:**

```json
{
    "data": [...],
    "pagination": {
        "limit": 50,
        "has_more": true,
        "next_cursor": "eyJ0aW1lIjoiMjAyNi0wMi0yM1QxMjowMDowMFoiLCJpZCI6MTIzNDV9"
    }
}
```

**Worker list response (from Redis):**

```json
{
    "workers": [
        {
            "name": "bitaxe-living-room",
            "status": "online",
            "hashrate_1m": 1200000000,
            "hashrate_5m": 1180000000,
            "hashrate_1h": 1195000000,
            "current_diff": 65536,
            "last_share": "2026-02-23T12:00:01Z",
            "user_agent": "Bitaxe/2.0"
        }
    ],
    "online_count": 2,
    "total_count": 3
}
```

**Hashrate chart response:**

```json
{
    "window": "24h",
    "points": [
        {"time": "2026-02-22T12:00:00Z", "hashrate": 1180000000},
        {"time": "2026-02-22T12:05:00Z", "hashrate": 1195000000},
        ...
    ],
    "current": 1210000000,
    "average": 1195000000,
    "peak": 1350000000
}
```

### Part 8: arq Worker Configuration

Create `src/tbg/workers/settings.py`:

```python
class EventConsumerSettings:
    """arq worker settings for the event consumer."""
    functions = [consume_events]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.arq_redis_url)
    max_jobs = 1  # Single consumer per instance
    job_timeout = 0  # Run forever
```

Add to Docker Compose:

```yaml
  event-consumer:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: tbg-event-consumer
    command: ["arq", "tbg.workers.event_consumer.WorkerSettings"]
    depends_on:
      timescaledb:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      TBG_DATABASE_URL: postgresql+asyncpg://tbg:tbgdev2026@timescaledb:5432/thebitcoingame
      TBG_REDIS_URL: redis://redis:6379/0
    restart: unless-stopped
```

---

## Testing Requirements

### Hashrate Formula Tests (`tests/mining/test_hashrate.py`)

```python
def test_hashrate_basic():
    """Known inputs: 100 shares at diff 1 over 100 seconds = (100 * 2^32) / 100 = 4.295 GH/s"""
    assert compute_hashrate_from_shares(sum_diff=100, window_seconds=100) == pytest.approx(4_294_967_296.0)

def test_hashrate_zero_shares():
    """No shares = 0 hashrate."""
    assert compute_hashrate_from_shares(sum_diff=0, window_seconds=100) == 0.0

def test_hashrate_high_diff():
    """High difficulty shares produce high hashrate."""
    result = compute_hashrate_from_shares(sum_diff=1_000_000, window_seconds=3600)
    assert result > 1e12  # > 1 TH/s
```

### Cursor Pagination Tests (`tests/mining/test_pagination.py`)

```python
async def test_first_page_no_cursor(authed_client):
    """First request without cursor returns newest shares."""
async def test_second_page_with_cursor(authed_client):
    """Using next_cursor returns the next page of results."""
async def test_cursor_consistency(authed_client):
    """Inserting new rows does not affect cursor position (no skipped/duplicate rows)."""
async def test_empty_result_no_cursor(authed_client):
    """Empty result returns has_more=false and no next_cursor."""
async def test_valid_only_filter(authed_client):
    """valid_only=true filters out invalid shares."""
```

### Stream Consumer Tests (`tests/workers/test_event_consumer.py`)

```python
async def test_handle_share_updates_worker_state(redis_client):
    """share_submitted event updates last_share in Redis hash."""
async def test_handle_connect_sets_online(redis_client):
    """miner_connected event sets worker status to online."""
async def test_handle_disconnect_sets_offline(redis_client):
    """miner_disconnected event sets worker status to offline."""
async def test_consumer_acks_messages(redis_client):
    """Consumer acknowledges messages after processing."""
async def test_handle_best_diff_updates_personal_best(redis_client, db_session):
    """share_best_diff event updates personal_bests table."""
```

### Endpoint Integration Tests (`tests/mining/test_endpoints.py`)

Test all 17 endpoints with authenticated requests. Seed test data (shares, workers, blocks) in fixtures.

```python
async def test_workers_list(authed_client, seeded_workers): ...
async def test_worker_detail(authed_client, seeded_workers): ...
async def test_shares_paginated(authed_client, seeded_shares): ...
async def test_shares_stats(authed_client, seeded_shares): ...
async def test_difficulty_bests(authed_client, seeded_personal_bests): ...
async def test_difficulty_scatter(authed_client, seeded_shares): ...
async def test_difficulty_distribution(authed_client, seeded_shares): ...
async def test_difficulty_percentile(authed_client, seeded_personal_bests): ...
async def test_blocks_list(authed_client, seeded_blocks): ...
async def test_hashrate_summary(authed_client, seeded_hashrate): ...
async def test_hashrate_chart_24h(authed_client, seeded_hashrate): ...
async def test_mining_summary(authed_client): ...
async def test_network_difficulty(authed_client): ...
```

### Performance Test

```python
async def test_share_pagination_100k_rows(db_session):
    """Insert 100K shares, verify cursor pagination completes in < 1 second per page."""
```

### Coverage Target: **85%+** overall for mining module.

---

## Rules

1. **Read the Phase 2 roadmap first.** `docs/backend-service/roadmap/phase-02-mining-data.md` contains complete code for every module.
2. **Cursor pagination only.** No OFFSET. Ever. Keyset pagination with `WHERE time < :cursor` ordering.
3. **Redis for live state, TimescaleDB for history.** Worker online/offline is in Redis hashes. Share history is in the hypertable.
4. **The event collector writes the data, you read it.** Do not modify the event collector. Your consumer reads from its Redis Streams.
5. **XREADGROUP with consumer groups.** This gives exactly-once processing semantics. ACK every message after handling.
6. **Hashrate formula: `(sum_diff * 2^32) / time_window_seconds`.** Use this exact formula. No approximations.
7. **All mining endpoints require auth.** Every endpoint uses `Depends(get_current_user)` and scopes data to the authenticated user's `btc_address`.
8. **Network endpoints are public data.** `/mining/network/difficulty` and `/mining/network/blocks` still require auth (user context) but show global data.
9. **Hashrate snapshots every 5 minutes.** A background task (arq cron) computes and stores hashrate for all active users.
10. **Personal bests are per-user, per-period.** Week resets every Monday. Month resets on the 1st. All-time never resets.
11. **Offline detection: 10-minute timeout.** If no share received for 10 minutes, mark worker offline.
12. **Seed test data in fixtures.** Create fixtures that insert realistic shares, workers, and blocks for integration tests.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `services/api/src/tbg/mining/__init__.py` |
| CREATE | `services/api/src/tbg/mining/router.py` |
| CREATE | `services/api/src/tbg/mining/service.py` |
| CREATE | `services/api/src/tbg/mining/schemas.py` |
| CREATE | `services/api/src/tbg/mining/consumer.py` |
| CREATE | `services/api/src/tbg/mining/hashrate.py` |
| CREATE | `services/api/src/tbg/mining/pagination.py` |
| CREATE | `services/api/src/tbg/workers/__init__.py` |
| CREATE | `services/api/src/tbg/workers/event_consumer.py` |
| CREATE | `services/api/src/tbg/workers/settings.py` |
| CREATE | `services/api/alembic/versions/003_mining_data.py` |
| CREATE | `services/api/tests/mining/__init__.py` |
| CREATE | `services/api/tests/mining/test_hashrate.py` |
| CREATE | `services/api/tests/mining/test_pagination.py` |
| CREATE | `services/api/tests/mining/test_endpoints.py` |
| CREATE | `services/api/tests/workers/__init__.py` |
| CREATE | `services/api/tests/workers/test_event_consumer.py` |
| EDIT | `services/api/src/tbg/main.py` |
| EDIT | `services/api/src/tbg/config.py` |
| EDIT | `services/api/src/tbg/db/models.py` |
| EDIT | `services/api/tests/conftest.py` |
| EDIT | `services/docker-compose.yml` |

---

## Definition of Done

1. **Redis Stream consumer processes all 8 event types** without errors. Events from the event collector flow through to the API consumer.
2. **Worker status (online/offline) is tracked in Redis hashes.** Workers go offline after 10 minutes of inactivity.
3. **GET /api/v1/mining/workers** returns all workers with live status from Redis.
4. **GET /api/v1/mining/shares** returns cursor-paginated shares. Pagination works correctly with 100K+ rows.
5. **GET /api/v1/mining/hashrate/chart?window=24h** returns time-series hashrate data from snapshots.
6. **Hashrate computation uses the correct formula** and produces accurate results for known test inputs.
7. **Personal bests are tracked** for week, month, and all-time periods. New records update correctly.
8. **Percentile rank is computed** against all active miners (at least hourly).
9. **GET /api/v1/mining/difficulty/scatter** returns the last 200 shares as (time, difficulty) pairs for the scatter plot.
10. **GET /api/v1/mining/difficulty/distribution** returns a histogram with 8 difficulty ranges.
11. **All 17 endpoints return correct data** when authenticated.
12. **All endpoints return 401** when called without auth.
13. **Alembic migration 003** creates `personal_bests`, `user_daily_stats`, `hashrate_snapshots`, `network_difficulty` tables.
14. **Event consumer runs as a separate Docker Compose service** (`event-consumer`).
15. All pytest tests pass with 85%+ coverage on the mining module.

---

## Order of Implementation

1. **Alembic migration 003** — Create tables for personal_bests, user_daily_stats, hashrate_snapshots, network_difficulty. Run `alembic upgrade head`.
2. **SQLAlchemy models** — Add models for new tables. Update existing models if needed.
3. **Cursor pagination utility** — Implement generic cursor-based pagination. Write unit tests with mock data.
4. **Hashrate computation** — Implement the formula. Write unit tests with known inputs.
5. **Worker status module** — Implement Redis hash read/write for worker state. Write unit tests with mock Redis.
6. **Mining service** — Implement the service layer with share queries, worker queries, hashrate queries, personal bests.
7. **Mining router** — Implement all 17 endpoints. Register under `/api/v1/mining`.
8. **Stream consumer** — Implement the XREADGROUP consumer with all 8 event handlers. Test with mock Redis Streams.
9. **arq worker configuration** — Create WorkerSettings. Add `event-consumer` to Docker Compose.
10. **Hashrate snapshot worker** — Implement 5-minute cron job to snapshot hashrate for all active users.
11. **Test fixtures** — Create fixtures that seed shares (1000+), workers (3-5), blocks (2-3), and personal bests.
12. **Integration tests** — Test all 17 endpoints. Test pagination edge cases. Test consumer event handling.
13. **Performance test** — Insert 100K shares, verify pagination stays fast.
14. **Full stack verification** — `docker compose up --build`. Verify consumer picks up events from event collector. Test endpoints via Swagger.
15. **Coverage and cleanup** — Achieve 85%+ coverage. Fix all mypy and ruff issues.

**Critical: Get step 8 (stream consumer) working before testing endpoints that depend on live data. Steps 3-7 can be done with static test data, but the full pipeline test requires the consumer.**
