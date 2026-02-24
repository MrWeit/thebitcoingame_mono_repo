# Backend Service — Master Plan

## The Bitcoin Game API, Game Engine & Background Workers

**Version:** 1.0
**Date:** February 2026
**Classification:** Internal — Proprietary
**Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 + asyncpg, Redis 7, TimescaleDB, arq, Alembic

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Service Components](#3-service-components)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Database Schema](#5-database-schema)
6. [API Design](#6-api-design)
7. [WebSocket Design](#7-websocket-design)
8. [Background Workers](#8-background-workers)
9. [Testing Strategy](#9-testing-strategy)
10. [Security](#10-security)
11. [Configuration](#11-configuration)
12. [Roadmap Summary](#12-roadmap-summary)

---

## 1. Overview

The Backend Service is the proprietary Python layer that sits between the CKPool mining engine and the React frontend. It consumes mining events from the event pipeline (Redis Streams + TimescaleDB), serves data to the dashboard via REST API and WebSocket, and runs the entire gamification engine — badges, XP, streaks, leaderboards, competitions, lottery, education tracking, and notifications. Authenticates users via Bitcoin message signing OR email + password (dual auth).

### What This Service Does

- Authenticates users via dual auth methods: Bitcoin wallet message signing AND email + password registration
- Sends transactional emails (verification, password reset, welcome) via configurable email provider
- Serves all dashboard data through a versioned REST API (`/api/v1/`)
- Pushes real-time updates to connected clients via WebSocket
- Runs the gamification engine (badge triggers, XP grants, streak tracking, level progression)
- Computes and caches leaderboards (weekly, monthly, all-time, per-country)
- Manages the weekly lottery draw (shares = tickets)
- Handles competition logic (World Cup, leagues, cooperatives)
- Tracks education progress (lessons, tracks, completions)
- Delivers notifications (in-app, WebSocket push, optional email)
- Provides API key authentication for third-party integrations

### What This Service Does NOT Do

- It does NOT accept Stratum connections from miners (that is CKPool)
- It does NOT validate shares or submit blocks (that is CKPool)
- It does NOT collect raw events from the Unix socket (that is the Event Collector)
- It does NOT serve the frontend static assets (that is the CDN/Vite build)
- It does NOT handle Stratum V2, Lightning payments, or a merchandise shop (future scope)

### Why This Stack?

| Consideration | Decision | Rationale |
|---|---|---|
| Language | Python 3.12 | Fastest iteration speed; rich async ecosystem; team expertise |
| API Framework | FastAPI | Native async, automatic OpenAPI docs, Pydantic validation, WebSocket support |
| ORM | SQLAlchemy 2.0 (async) | Mature, type-safe, supports TimescaleDB via asyncpg |
| Database | TimescaleDB (PostgreSQL 16) | Already deployed for mining data; hypertables for time-series, standard tables for everything else |
| Cache / Pub-Sub | Redis 7 | Already deployed for event pipeline; perfect for leaderboard caching, WebSocket pub/sub, rate limiting, session data |
| Background Workers | arq (Redis-backed) | Lightweight, async-native, Redis-based job queue; same Redis instance |
| Migrations | Alembic | Standard SQLAlchemy migration tool; supports autogenerate |
| Auth | JWT RS256 + Bitcoin message signing + Email/Password | No third-party auth provider needed; Bitcoin-native identity + traditional auth |
| Containerization | Docker Compose | Consistent dev/prod parity; all services in one compose file |

### Why NOT These Alternatives?

| Alternative | Why Not |
|---|---|
| Django | Heavier than needed; FastAPI's async-first design is better for real-time WebSocket workloads |
| Celery | Over-engineered for our queue sizes; arq is simpler, async-native, and uses the same Redis |
| MongoDB | We already have TimescaleDB; no benefit to a second database engine |
| GraphQL | REST + WebSocket covers all our use cases; GraphQL adds client complexity without clear benefit |
| Firebase / Supabase | We need full control over the gamification engine; no vendor lock-in |
| gRPC | Internal services are co-located; REST is simpler to debug and monitor |

---

## 2. Architecture

### Full System Architecture

```mermaid
graph TB
    subgraph Miners["Internet / Miners"]
        M1["Bitaxe / NerdAxe"]
        M2["Antminer / Whatsminer"]
    end

    subgraph Mining["CKPool Service (C, GPLv3)"]
        CKP["ckpool-solo fork<br/>Stratum :3333"]
    end

    subgraph Pipeline["Event Pipeline"]
        EC["Event Collector<br/>(Python asyncio)"]
        REDIS["Redis 7<br/>Streams + Pub/Sub + Cache"]
        TSDB["TimescaleDB<br/>PostgreSQL 16"]
    end

    subgraph Backend["Backend Service (Python, Proprietary)"]
        subgraph API["API Server"]
            FAST["FastAPI<br/>REST + WebSocket<br/>:8000"]
            AUTH["Auth Module<br/>JWT RS256 + BTC signing + Email/Password"]
            WS["WebSocket Hub<br/>Channel multiplexing"]
        end

        subgraph Workers["arq Background Workers"]
            EVT["event-consumer<br/>Redis Stream → gamification"]
            GAME["gamification-worker<br/>Badges, XP, streaks"]
            STATS["stats-worker<br/>Leaderboards, aggregations"]
            NOTIF["notification-worker<br/>Delivery (WS, email)"]
            SCHED["scheduler<br/>Lottery, streak checks, cron"]
        end
    end

    subgraph Frontend["React Dashboard"]
        DASH["React 19 + Vite 7<br/>TanStack Query + WebSocket"]
    end

    M1 & M2 -->|"Stratum TCP"| CKP
    CKP -->|"Unix socket"| EC
    EC --> REDIS
    EC --> TSDB

    REDIS -->|"XREADGROUP"| EVT
    EVT -->|"Badge triggers"| GAME
    EVT -->|"Leaderboard data"| STATS
    GAME -->|"Notifications"| NOTIF
    STATS -->|"Notifications"| NOTIF
    SCHED -->|"Cron jobs"| GAME & STATS

    GAME --> TSDB
    STATS --> TSDB
    NOTIF -->|"PUBLISH"| REDIS

    REDIS -->|"Subscribe"| WS
    TSDB --> FAST
    REDIS -->|"Cache reads"| FAST

    AUTH --> FAST
    WS --> FAST

    FAST -->|"REST + WS"| DASH

    style Mining fill:#1a4731,stroke:#3fb950
    style Backend fill:#1a1a4a,stroke:#58a6ff
    style Pipeline fill:#4a3a1a,stroke:#d4a843
    style Frontend fill:#4a1a1a,stroke:#f85149
```

### Backend Internal Architecture

```mermaid
graph LR
    subgraph FastAPI["API Server (:8000)"]
        direction TB
        MW["Middleware Stack<br/>CORS, Rate Limit, Auth"]
        R_AUTH["Router: /auth<br/>Challenge, Verify, Register,<br/>Login, Refresh, Password Reset"]
        R_MINING["Router: /mining<br/>Dashboard, Workers, Shares"]
        R_GAME["Router: /gamification<br/>Badges, XP, Streaks, Level"]
        R_LB["Router: /leaderboard<br/>Weekly, Monthly, All-time"]
        R_COMP["Router: /competitions<br/>World Cup, Leagues"]
        R_SOCIAL["Router: /social<br/>Coops, Feed, Notifications"]
        R_EDU["Router: /education<br/>Tracks, Lessons, Progress"]
        R_USER["Router: /users<br/>Profile, Settings, API Keys"]
        R_GAMES["Router: /games<br/>Lottery, Game Sessions"]
        R_PUB["Router: /public<br/>Leaderboard, Stats, Miner"]
        WS_HUB["WebSocket Hub<br/>Channel multiplexing"]
    end

    subgraph Services["Service Layer"]
        S_AUTH["AuthService"]
        S_MINING["MiningService"]
        S_BADGE["BadgeService"]
        S_XP["XPService"]
        S_STREAK["StreakService"]
        S_LB["LeaderboardService"]
        S_LOTTERY["LotteryService"]
        S_NOTIF["NotificationService"]
        S_COMP["CompetitionService"]
        S_EDU["EducationService"]
    end

    subgraph Repos["Repository Layer"]
        REPO["SQLAlchemy Repositories<br/>Async sessions + Unit of Work"]
    end

    MW --> R_AUTH & R_MINING & R_GAME & R_LB & R_COMP & R_SOCIAL & R_EDU & R_USER & R_GAMES & R_PUB
    R_AUTH --> S_AUTH
    R_MINING --> S_MINING
    R_GAME --> S_BADGE & S_XP & S_STREAK
    R_LB --> S_LB
    R_COMP --> S_COMP
    R_SOCIAL --> S_NOTIF
    R_EDU --> S_EDU
    R_GAMES --> S_LOTTERY

    S_AUTH & S_MINING & S_BADGE & S_XP & S_STREAK & S_LB & S_LOTTERY & S_NOTIF & S_COMP & S_EDU --> REPO
```

---

## 3. Service Components

### All Services

| Service | Technology | Role | Port | Dependencies |
|---|---|---|---|---|
| **ckpool** | C (GPLv3) | Stratum server, share validation, block submission | 3333 | Bitcoin Core |
| **event-collector** | Python asyncio | Unix socket listener, writes to Redis + TimescaleDB | — | ckpool, Redis, TimescaleDB |
| **redis** | Redis 7 | Streams, pub/sub, caching, rate limiting, session store | 6379 | — |
| **timescaledb** | PostgreSQL 16 + TimescaleDB | All persistent data (mining + gamification + app) | 5432 | — |
| **api** | FastAPI (uvicorn) | REST API + WebSocket server | 8000 | Redis, TimescaleDB |
| **event-consumer** | arq worker | Reads mining events from Redis Streams, dispatches to gamification | — | Redis, TimescaleDB |
| **gamification-worker** | arq worker | Badge evaluation, XP grants, streak updates | — | Redis, TimescaleDB |
| **stats-worker** | arq worker | Leaderboard refresh, country aggregation, badge stats | — | Redis, TimescaleDB |
| **notification-worker** | arq worker | Notification delivery (WebSocket push, optional email) | — | Redis, TimescaleDB |
| **scheduler** | arq cron | Lottery draws, streak deadline checks, daily stats | — | Redis, TimescaleDB |

### Project Directory Structure

```
backend/
├── alembic/                    # Database migrations
│   ├── versions/
│   └── env.py
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth.py
│   │   │   ├── mining.py
│   │   │   ├── gamification.py
│   │   │   ├── leaderboard.py
│   │   │   ├── competitions.py
│   │   │   ├── social.py
│   │   │   ├── education.py
│   │   │   ├── users.py
│   │   │   ├── games.py
│   │   │   └── public.py
│   │   ├── websocket.py
│   │   └── deps.py            # Dependency injection
│   ├── core/
│   │   ├── config.py          # Pydantic Settings
│   │   ├── security.py        # JWT, BTC signing, password hashing, API keys
│   │   ├── database.py        # Async engine + session
│   │   └── redis.py           # Redis client
│   ├── models/                # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── mining.py
│   │   ├── gamification.py
│   │   ├── competition.py
│   │   ├── social.py
│   │   └── education.py
│   ├── schemas/               # Pydantic request/response models
│   ├── services/              # Business logic layer
│   │   ├── auth.py
│   │   ├── mining.py
│   │   ├── badge.py
│   │   ├── xp.py
│   │   ├── streak.py
│   │   ├── leaderboard.py
│   │   ├── lottery.py
│   │   ├── notification.py
│   │   ├── competition.py
│   │   └── education.py
│   ├── workers/               # arq background workers
│   │   ├── event_consumer.py
│   │   ├── gamification.py
│   │   ├── stats.py
│   │   ├── notifications.py
│   │   └── scheduler.py
│   └── main.py                # FastAPI app factory
├── tests/
│   ├── conftest.py
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
└── alembic.ini
```

---

## 4. Data Flow Diagrams

### 4.1 Authentication Flow (Bitcoin Message Signing)

```mermaid
sequenceDiagram
    participant Browser as React Dashboard
    participant API as FastAPI
    participant Redis
    participant DB as TimescaleDB

    Note over Browser: User clicks "Connect Wallet"
    Browser->>API: POST /api/v1/auth/challenge<br/>{ btc_address: "bc1q..." }
    API->>API: Generate random nonce (32 bytes hex)
    API->>Redis: SET challenge:{nonce} = btc_address (TTL 5min)
    API-->>Browser: { challenge: "Sign this message...", nonce: "a1b2c3..." }

    Note over Browser: User signs message with wallet<br/>(Sparrow, BlueWallet, etc.)
    Browser->>API: POST /api/v1/auth/verify<br/>{ btc_address, nonce, signature }
    API->>Redis: GET challenge:{nonce}
    Redis-->>API: btc_address (validates match)
    API->>API: Verify BTC message signature<br/>(python-bitcoinlib)
    API->>Redis: DEL challenge:{nonce}

    alt Signature valid
        API->>DB: UPSERT users (btc_address)
        API->>DB: INSERT refresh_tokens
        API->>API: Generate JWT (RS256, 15min exp)
        API-->>Browser: { access_token, refresh_token, user }
    else Signature invalid
        API-->>Browser: 401 Unauthorized
    end

    Note over Browser: Subsequent requests
    Browser->>API: GET /api/v1/mining/dashboard<br/>Authorization: Bearer {jwt}
    API->>API: Verify JWT signature (RS256 public key)
    API->>DB: Query dashboard data
    API-->>Browser: { hashrate, shares, workers, ... }

    Note over Browser: Token refresh (before 15min expiry)
    Browser->>API: POST /api/v1/auth/refresh<br/>{ refresh_token }
    API->>DB: Validate refresh_token (not revoked, not expired)
    API->>API: Generate new JWT
    API-->>Browser: { access_token }
```

### 4.1b Authentication Flow (Email + Password)

```mermaid
sequenceDiagram
    participant Browser as React Dashboard
    participant API as FastAPI
    participant Email as Email Service
    participant Redis
    participant DB as TimescaleDB

    Note over Browser: User clicks "Create Account"
    Browser->>API: POST /api/v1/auth/register<br/>{ email, password, btc_address, display_name? }
    API->>API: Validate email, password strength,<br/>BTC address format
    API->>DB: INSERT users (email, password_hash, btc_address,<br/>auth_method='email', email_verified=false)
    API->>API: Generate verification token (32 bytes)
    API->>DB: INSERT email_verification_tokens
    API->>Email: Send verification email
    API->>API: Generate JWT (RS256)
    API-->>Browser: { access_token, refresh_token, user }

    Note over Browser: User checks email
    Browser->>API: POST /api/v1/auth/verify-email<br/>{ token }
    API->>DB: Validate token (not expired, not used)
    API->>DB: UPDATE users SET email_verified = true
    API-->>Browser: { status: "verified" }

    Note over Browser: Subsequent logins
    Browser->>API: POST /api/v1/auth/login<br/>{ email, password }
    API->>DB: SELECT user WHERE email = ?
    API->>API: Verify password (argon2)
    API->>DB: INSERT refresh_tokens
    API->>API: Generate JWT
    API-->>Browser: { access_token, refresh_token, user }
```

### 4.1c Forgot Password Flow

```mermaid
sequenceDiagram
    participant Browser as React Dashboard
    participant API as FastAPI
    participant Email as Email Service
    participant DB as TimescaleDB

    Browser->>API: POST /api/v1/auth/forgot-password<br/>{ email }
    API->>DB: SELECT user WHERE email = ?
    alt User exists
        API->>API: Generate reset token (32 bytes, 1h TTL)
        API->>DB: INSERT password_reset_tokens
        API->>Email: Send password reset email
    end
    API-->>Browser: { status: "ok" }
    Note over API: Always returns 200 (no email enumeration)

    Browser->>API: POST /api/v1/auth/reset-password<br/>{ token, new_password }
    API->>DB: Validate token (not expired, not used)
    API->>API: Hash new password (argon2)
    API->>DB: UPDATE users SET password_hash = ?
    API->>DB: Revoke ALL refresh tokens for user
    API->>Email: Send password changed notification
    API-->>Browser: { status: "password_reset" }
```

### 4.2 Share Submission to Dashboard Update

```mermaid
sequenceDiagram
    participant Miner
    participant CKPool as CKPool (C)
    participant EC as Event Collector
    participant Redis
    participant TSDB as TimescaleDB
    participant EVT as event-consumer
    participant GAME as gamification-worker
    participant WS as WebSocket Hub
    participant Browser as React Dashboard

    Miner->>CKPool: mining.submit(nonce)
    CKPool->>CKPool: Validate share
    CKPool->>EC: share_submitted event (Unix socket)

    par Event Collector writes
        EC->>Redis: XADD mining:shares {event}
        EC->>TSDB: INSERT INTO shares
    end

    EVT->>Redis: XREADGROUP mining:shares
    Redis-->>EVT: New share event

    par Real-time update
        EVT->>Redis: PUBLISH ws:user:{btc_address} {share_data}
        Redis-->>WS: Subscribe notification
        WS->>Browser: WebSocket frame<br/>{type: "share", data: {...}}
        Note over Browser: LiveShareFeed updates,<br/>StatCards animate
    end

    par Gamification check
        EVT->>GAME: enqueue(check_share_badges, {user, share})
        GAME->>TSDB: SELECT total_shares FROM user_daily_stats
        GAME->>GAME: Evaluate badge triggers
        alt Badge earned
            GAME->>TSDB: INSERT INTO user_badges
            GAME->>TSDB: INSERT INTO xp_ledger
            GAME->>Redis: PUBLISH ws:user:{btc_address} {badge_earned}
            Redis-->>WS: Badge notification
            WS->>Browser: WebSocket frame<br/>{type: "badge_earned", data: {...}}
            Note over Browser: BadgeEarnOverlay + toast
        end
    end
```

### 4.3 Badge Trigger Flow

```mermaid
flowchart TD
    A["Mining Event Received<br/>(share_submitted, block_found,<br/>share_best_diff, etc.)"] --> B["event-consumer"]
    B --> C{"Event type?"}

    C -->|share_submitted| D["Increment user share count"]
    C -->|share_best_diff| E["Update personal best"]
    C -->|block_found| F["Flag block finder"]
    C -->|miner_connected| G["Check first connection"]

    D --> H["gamification-worker"]
    E --> H
    F --> H
    G --> H

    H --> I["Load user's earned badges"]
    I --> J["Evaluate ALL unearned badge triggers"]

    J --> K{"shares >= 1?"}
    J --> L{"shares >= 1,000?"}
    J --> M{"shares >= 1,000,000?"}
    J --> N{"best_diff >= 1e6?"}
    J --> O{"best_diff >= 1e9?"}
    J --> P{"streak >= 4 weeks?"}
    J --> Q{"block_found == true?"}

    K -->|"New badge!"| R["Award Badge"]
    L -->|"New badge!"| R
    M -->|"New badge!"| R
    N -->|"New badge!"| R
    O -->|"New badge!"| R
    P -->|"New badge!"| R
    Q -->|"New badge!"| R

    R --> S["INSERT user_badges"]
    R --> T["INSERT xp_ledger<br/>(badge XP reward)"]
    R --> U["Update user_gamification<br/>(total XP, level)"]
    R --> V["Enqueue notification"]

    V --> W["notification-worker"]
    W --> X["PUBLISH to Redis"]
    X --> Y["WebSocket push to user"]
    Y --> Z["Dashboard shows<br/>BadgeEarnOverlay +<br/>XPFloatUp + toast"]
```

### 4.4 Leaderboard Refresh Cycle

```mermaid
sequenceDiagram
    participant SCHED as scheduler
    participant STATS as stats-worker
    participant TSDB as TimescaleDB
    participant Redis
    participant API as FastAPI
    participant WS as WebSocket Hub

    Note over SCHED: Every 5 minutes
    SCHED->>STATS: enqueue(refresh_leaderboard, {period: "weekly"})

    STATS->>TSDB: SELECT btc_address, MAX(best_difficulty)<br/>FROM weekly_best_diff<br/>WHERE week_start = current_week<br/>GROUP BY btc_address<br/>ORDER BY best_difficulty DESC<br/>LIMIT 100
    TSDB-->>STATS: Top 100 rows

    STATS->>TSDB: INSERT INTO leaderboard_snapshots<br/>(period, rank, user_id, score, ...)
    STATS->>Redis: SET leaderboard:weekly = JSON (TTL 5min)
    STATS->>Redis: SET leaderboard:weekly:updated_at = NOW()

    Note over STATS: Country aggregation
    STATS->>TSDB: SELECT country_code, SUM(total_shares), COUNT(users)<br/>FROM users JOIN weekly_best_diff<br/>GROUP BY country_code<br/>ORDER BY SUM(total_shares) DESC
    TSDB-->>STATS: Country rankings
    STATS->>Redis: SET leaderboard:countries = JSON (TTL 5min)

    STATS->>Redis: PUBLISH ws:global {leaderboard_updated}
    Redis-->>WS: Broadcast
    WS->>WS: Push to all connected clients

    Note over API: Client requests leaderboard
    API->>Redis: GET leaderboard:weekly
    Redis-->>API: Cached JSON (cache hit)
    API-->>API: Return cached result (< 1ms)
```

### 4.5 Weekly Lottery Draw

```mermaid
sequenceDiagram
    participant SCHED as scheduler
    participant LOTTERY as gamification-worker
    participant TSDB as TimescaleDB
    participant Redis
    participant NOTIF as notification-worker
    participant WS as WebSocket Hub

    Note over SCHED: Monday 00:01 UTC
    SCHED->>LOTTERY: enqueue(run_lottery_draw)

    LOTTERY->>TSDB: SELECT btc_address, total_shares<br/>FROM weekly_best_diff<br/>WHERE week_start = last_week
    TSDB-->>LOTTERY: All participants + share counts

    Note over LOTTERY: Each share = 1 lottery ticket<br/>Weighted random selection

    LOTTERY->>LOTTERY: Compute total tickets
    LOTTERY->>LOTTERY: Generate winning ticket number<br/>(cryptographically random)
    LOTTERY->>LOTTERY: Map ticket to winner

    LOTTERY->>TSDB: INSERT INTO lottery_draws<br/>(week, total_tickets, total_participants)
    LOTTERY->>TSDB: INSERT INTO lottery_results<br/>(draw_id, user_id, position, prize)

    LOTTERY->>TSDB: INSERT INTO xp_ledger<br/>(winner XP bonus)

    par Notifications
        LOTTERY->>NOTIF: enqueue(notify_lottery_winner, {user_id, prize})
        LOTTERY->>NOTIF: enqueue(notify_lottery_results, {draw_id})
    end

    NOTIF->>Redis: PUBLISH ws:user:{winner} {lottery_won}
    NOTIF->>Redis: PUBLISH ws:global {lottery_results}
    Redis-->>WS: Push to winner + broadcast

    Note over WS: Winner sees celebration overlay<br/>Everyone sees results in feed
```

---

## 5. Database Schema

### Schema Overview (~47 Tables)

```mermaid
erDiagram
    users ||--o{ workers : "owns"
    users ||--o{ shares : "submits"
    users ||--o{ blocks : "finds"
    users ||--o{ weekly_best_diff : "tracks"
    users ||--o{ refresh_tokens : "authenticates"
    users ||--o{ email_verification_tokens : "verifies"
    users ||--o{ password_reset_tokens : "resets"
    users ||--o{ api_keys : "manages"
    users ||--|| user_settings : "configures"
    users ||--|| user_gamification : "progresses"
    users ||--o{ user_badges : "earns"
    users ||--o{ xp_ledger : "accumulates"
    users ||--o{ streak_calendar : "maintains"
    users ||--o{ personal_bests : "achieves"
    users ||--o{ notifications : "receives"
    users ||--o{ game_sessions : "plays"
    users ||--o{ user_lesson_completions : "completes"
    users ||--o{ cooperative_members : "joins"
    users ||--o{ competition_registrations : "registers"

    badge_definitions ||--o{ user_badges : "defines"
    education_tracks ||--o{ education_lessons : "contains"
    cooperatives ||--o{ cooperative_members : "has"
    competitions ||--o{ matches : "schedules"
    lottery_draws ||--o{ lottery_results : "produces"
```

### Table Inventory by Domain

| Domain | Tables | Count |
|---|---|---|
| **Core (existing)** | users, workers, shares, blocks, weekly_best_diff, mining_events, rate_limit_events, schema_migrations | 8 |
| **Auth** | refresh_tokens, api_keys, user_settings, email_verification_tokens, password_reset_tokens | 5 |
| **Mining** | personal_bests, user_daily_stats, hashrate_snapshots, network_difficulty | 4 |
| **Dashboard** | activity_feed, upcoming_events | 2 |
| **Gamification** | badge_definitions, user_badges, xp_ledger, user_gamification, streak_calendar, badge_stats | 6 |
| **Games** | lottery_draws, lottery_results, game_sessions | 3 |
| **Competition** | leaderboard_snapshots, country_rankings, competitions, competition_teams, competition_registrations, matches, leagues, league_clubs | 8 |
| **Social** | cooperatives, cooperative_members, notifications, user_activity | 4 |
| **Education** | education_tracks, education_lessons, user_lesson_completions, user_track_completions | 4 |
| **Admin** | audit_log | 1 |
| **Continuous Aggregates** | hourly_shares, daily_shares | 2 |
| | | **47** |

### SQL Definitions — Auth Tables

```sql
-- Refresh tokens for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(128) NOT NULL UNIQUE,  -- SHA-256 of the token
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ,
    ip_address      INET,
    user_agent      TEXT
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;

-- API keys for third-party integrations
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(64) NOT NULL,
    key_hash        VARCHAR(128) NOT NULL UNIQUE,  -- Argon2 hash
    prefix          VARCHAR(12) NOT NULL,           -- "tbg_" + first 8 chars (for display)
    permissions     TEXT[] DEFAULT '{"read"}',       -- read, write, admin
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(128) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,  -- 24 hours from creation
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at) WHERE used_at IS NULL;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(128) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,  -- 1 hour from creation
    used_at         TIMESTAMPTZ,
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_password_reset_expires ON password_reset_tokens(expires_at) WHERE used_at IS NULL;

-- User preferences and settings
CREATE TABLE IF NOT EXISTS user_settings (
    user_id                 BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name            VARCHAR(64),
    avatar_url              TEXT,
    notification_shares     BOOLEAN DEFAULT FALSE,
    notification_blocks     BOOLEAN DEFAULT TRUE,
    notification_badges     BOOLEAN DEFAULT TRUE,
    notification_streaks    BOOLEAN DEFAULT TRUE,
    notification_lottery    BOOLEAN DEFAULT TRUE,
    notification_email      BOOLEAN DEFAULT FALSE,
    email_address           VARCHAR(255),
    sound_mode              VARCHAR(8) DEFAULT 'subtle',  -- off, subtle, full
    privacy_show_profile    BOOLEAN DEFAULT TRUE,
    privacy_show_hashrate   BOOLEAN DEFAULT FALSE,
    privacy_show_country    BOOLEAN DEFAULT TRUE,
    ui_mode                 VARCHAR(8) DEFAULT 'full',    -- full, simple
    timezone                VARCHAR(64) DEFAULT 'UTC',
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

**Users table extensions for dual auth:**

```sql
-- Additional columns on the existing users table for email/password auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS email           VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified   BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash    VARCHAR(256);  -- nullable for wallet-only users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method      VARCHAR(16) DEFAULT 'wallet';  -- wallet, email

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
```

### SQL Definitions — Gamification Tables

```sql
-- Badge catalog (seeded, rarely changes)
CREATE TABLE IF NOT EXISTS badge_definitions (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(64) NOT NULL,
    description     TEXT NOT NULL,
    category        VARCHAR(16) NOT NULL,  -- mining, streak, competition, social, node
    rarity          VARCHAR(12) NOT NULL,  -- common, rare, epic, legendary
    xp_reward       INTEGER NOT NULL DEFAULT 0,
    trigger_type    VARCHAR(32) NOT NULL,  -- shares_count, best_diff, streak_weeks, block_found, manual
    trigger_value   BIGINT,                -- threshold value (e.g., 1000 for shares_1k)
    icon_url        TEXT,
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- User-earned badges
CREATE TABLE IF NOT EXISTS user_badges (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id        INTEGER NOT NULL REFERENCES badge_definitions(id),
    earned_at       TIMESTAMPTZ DEFAULT NOW(),
    metadata        JSONB,  -- context: { difficulty: "2847193472", share_id: "..." }
    UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);
CREATE INDEX idx_user_badges_earned ON user_badges(earned_at DESC);

-- XP transaction ledger (immutable append-only)
CREATE TABLE IF NOT EXISTS xp_ledger (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          INTEGER NOT NULL,       -- can be negative for corrections
    reason          VARCHAR(32) NOT NULL,   -- badge, share, streak, lottery, education, manual
    reference_type  VARCHAR(32),            -- badge_slug, lesson_id, etc.
    reference_id    VARCHAR(64),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_xp_ledger_user ON xp_ledger(user_id, created_at DESC);

-- Materialized gamification state (derived from xp_ledger)
CREATE TABLE IF NOT EXISTS user_gamification (
    user_id         BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp        BIGINT DEFAULT 0,
    current_level   INTEGER DEFAULT 1,
    current_title   VARCHAR(64) DEFAULT 'Nocoiner',
    badges_earned   INTEGER DEFAULT 0,
    streak_weeks    INTEGER DEFAULT 0,
    longest_streak  INTEGER DEFAULT 0,
    streak_start    DATE,
    total_shares    BIGINT DEFAULT 0,
    best_diff_alltime DOUBLE PRECISION DEFAULT 0,
    blocks_found    INTEGER DEFAULT 0,
    lottery_wins    INTEGER DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly streak calendar (one row per user per week)
CREATE TABLE IF NOT EXISTS streak_calendar (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start      DATE NOT NULL,
    shares_count    BIGINT DEFAULT 0,
    is_active       BOOLEAN DEFAULT FALSE,  -- had at least 1 share this week
    best_diff       DOUBLE PRECISION DEFAULT 0,
    UNIQUE(user_id, week_start)
);

CREATE INDEX idx_streak_calendar_user ON streak_calendar(user_id, week_start DESC);

-- Aggregated badge statistics (updated daily by scheduler)
CREATE TABLE IF NOT EXISTS badge_stats (
    badge_id        INTEGER PRIMARY KEY REFERENCES badge_definitions(id),
    total_earned    INTEGER DEFAULT 0,
    percentage      NUMERIC(5,2) DEFAULT 0,  -- % of all users who have it
    last_earned_at  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### SQL Definitions — Competition Tables

```sql
-- Leaderboard snapshots (refreshed every 5 minutes)
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    period          VARCHAR(12) NOT NULL,   -- weekly, monthly, alltime
    rank            INTEGER NOT NULL,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    btc_address     VARCHAR(62) NOT NULL,
    display_name    VARCHAR(64),
    country_code    CHAR(2),
    score           DOUBLE PRECISION NOT NULL,  -- best_diff for weekly, total_shares for alltime
    total_shares    BIGINT DEFAULT 0,
    snapshot_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lb_snapshot_period ON leaderboard_snapshots(period, snapshot_at DESC);

-- Country-level rankings
CREATE TABLE IF NOT EXISTS country_rankings (
    id              BIGSERIAL PRIMARY KEY,
    period          VARCHAR(12) NOT NULL,
    country_code    CHAR(2) NOT NULL,
    rank            INTEGER NOT NULL,
    total_miners    INTEGER DEFAULT 0,
    total_shares    BIGINT DEFAULT 0,
    best_diff       DOUBLE PRECISION DEFAULT 0,
    snapshot_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Competition events (World Cup editions)
CREATE TABLE IF NOT EXISTS competitions (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(128) NOT NULL,
    competition_type VARCHAR(16) NOT NULL,  -- world_cup, league
    status          VARCHAR(16) DEFAULT 'upcoming',  -- upcoming, registration, active, completed
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    registration_deadline TIMESTAMPTZ,
    config          JSONB,  -- bracket size, scoring rules, etc.
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Teams in a competition (countries for World Cup)
CREATE TABLE IF NOT EXISTS competition_teams (
    id              SERIAL PRIMARY KEY,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id),
    name            VARCHAR(128) NOT NULL,
    country_code    CHAR(2),
    seed            INTEGER,
    total_shares    BIGINT DEFAULT 0,
    total_miners    INTEGER DEFAULT 0,
    is_eliminated   BOOLEAN DEFAULT FALSE,
    UNIQUE(competition_id, country_code)
);

-- User registration for a competition
CREATE TABLE IF NOT EXISTS competition_registrations (
    id              BIGSERIAL PRIMARY KEY,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    team_id         INTEGER REFERENCES competition_teams(id),
    registered_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(competition_id, user_id)
);

-- Matches in a competition bracket
CREATE TABLE IF NOT EXISTS matches (
    id              SERIAL PRIMARY KEY,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id),
    round           VARCHAR(32) NOT NULL,   -- group_a, round_of_16, quarter, semi, final
    match_number    INTEGER NOT NULL,
    team_a_id       INTEGER REFERENCES competition_teams(id),
    team_b_id       INTEGER REFERENCES competition_teams(id),
    score_a         BIGINT DEFAULT 0,       -- total shares by team A
    score_b         BIGINT DEFAULT 0,
    winner_id       INTEGER REFERENCES competition_teams(id),
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    status          VARCHAR(16) DEFAULT 'scheduled'  -- scheduled, live, completed
);

-- Leagues (seasonal, promotion/relegation)
CREATE TABLE IF NOT EXISTS leagues (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    tier            INTEGER NOT NULL,  -- 1 = top, 2, 3...
    season          INTEGER NOT NULL,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    promotion_zone  INTEGER DEFAULT 3,  -- top N get promoted
    relegation_zone INTEGER DEFAULT 3,  -- bottom N get relegated
    UNIQUE(tier, season)
);

-- Clubs in a league
CREATE TABLE IF NOT EXISTS league_clubs (
    id              BIGSERIAL PRIMARY KEY,
    league_id       INTEGER NOT NULL REFERENCES leagues(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    position        INTEGER,
    points          INTEGER DEFAULT 0,
    total_shares    BIGINT DEFAULT 0,
    best_diff       DOUBLE PRECISION DEFAULT 0,
    matches_played  INTEGER DEFAULT 0,
    UNIQUE(league_id, user_id)
);
```

### SQL Definitions — Social & Education Tables

```sql
-- Cooperatives (mining teams)
CREATE TABLE IF NOT EXISTS cooperatives (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(64) NOT NULL UNIQUE,
    description     TEXT,
    founder_id      BIGINT NOT NULL REFERENCES users(id),
    country_code    CHAR(2),
    member_count    INTEGER DEFAULT 1,
    total_shares    BIGINT DEFAULT 0,
    total_hashrate  DOUBLE PRECISION DEFAULT 0,
    blocks_found    INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

-- Cooperative membership
CREATE TABLE IF NOT EXISTS cooperative_members (
    id              BIGSERIAL PRIMARY KEY,
    cooperative_id  INTEGER NOT NULL REFERENCES cooperatives(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    role            VARCHAR(16) DEFAULT 'member',  -- founder, admin, member
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cooperative_id, user_id)
);

-- Notifications (persisted for in-app history)
CREATE TABLE IF NOT EXISTS notifications (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(32) NOT NULL,  -- badge, block, streak, lottery, system, competition
    title           VARCHAR(128) NOT NULL,
    body            TEXT,
    metadata        JSONB,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id)
    WHERE is_read = FALSE;

-- Global activity feed
CREATE TABLE IF NOT EXISTS user_activity (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id),
    activity_type   VARCHAR(32) NOT NULL,  -- block_found, badge_earned, miner_joined, competition
    title           TEXT NOT NULL,
    metadata        JSONB,
    is_global       BOOLEAN DEFAULT FALSE,  -- show in global feed
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_activity_global ON user_activity(created_at DESC)
    WHERE is_global = TRUE;

-- Education tracks
CREATE TABLE IF NOT EXISTS education_tracks (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(64) NOT NULL UNIQUE,
    title           VARCHAR(128) NOT NULL,
    description     TEXT,
    difficulty      VARCHAR(12) DEFAULT 'beginner',  -- beginner, intermediate, advanced
    lesson_count    INTEGER DEFAULT 0,
    xp_reward       INTEGER DEFAULT 0,
    badge_slug      VARCHAR(64),  -- badge earned on completion
    sort_order      INTEGER DEFAULT 0,
    is_published    BOOLEAN DEFAULT TRUE
);

-- Individual lessons within a track
CREATE TABLE IF NOT EXISTS education_lessons (
    id              SERIAL PRIMARY KEY,
    track_id        INTEGER NOT NULL REFERENCES education_tracks(id),
    slug            VARCHAR(64) NOT NULL,
    title           VARCHAR(128) NOT NULL,
    content         TEXT NOT NULL,  -- Markdown
    lesson_order    INTEGER NOT NULL,
    xp_reward       INTEGER DEFAULT 25,
    estimated_minutes INTEGER DEFAULT 5,
    UNIQUE(track_id, slug)
);

-- User lesson completions
CREATE TABLE IF NOT EXISTS user_lesson_completions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id       INTEGER NOT NULL REFERENCES education_lessons(id),
    completed_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

-- User track completions
CREATE TABLE IF NOT EXISTS user_track_completions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id        INTEGER NOT NULL REFERENCES education_tracks(id),
    completed_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, track_id)
);
```

### SQL Definitions — Remaining Tables

```sql
-- Mining personal bests (all-time, per period)
CREATE TABLE IF NOT EXISTS personal_bests (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period          VARCHAR(12) NOT NULL,  -- week, month, alltime
    best_difficulty DOUBLE PRECISION NOT NULL,
    achieved_at     TIMESTAMPTZ NOT NULL,
    worker_name     VARCHAR(128),
    UNIQUE(user_id, period)
);

-- Daily aggregated stats per user (for dashboards + trends)
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

-- Hashrate snapshots (for charts — 5-minute granularity)
CREATE TABLE IF NOT EXISTS hashrate_snapshots (
    time            TIMESTAMPTZ NOT NULL,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    hashrate_1m     DOUBLE PRECISION,
    hashrate_5m     DOUBLE PRECISION,
    hashrate_1h     DOUBLE PRECISION,
    workers_online  INTEGER DEFAULT 0
);

SELECT create_hypertable('hashrate_snapshots', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Network difficulty history
CREATE TABLE IF NOT EXISTS network_difficulty (
    block_height    INTEGER PRIMARY KEY,
    difficulty      DOUBLE PRECISION NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL
);

-- Lottery draws
CREATE TABLE IF NOT EXISTS lottery_draws (
    id              SERIAL PRIMARY KEY,
    week_start      DATE NOT NULL UNIQUE,
    total_tickets   BIGINT NOT NULL,
    total_participants INTEGER NOT NULL,
    winning_ticket  BIGINT NOT NULL,
    drawn_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Lottery results (winners per draw)
CREATE TABLE IF NOT EXISTS lottery_results (
    id              SERIAL PRIMARY KEY,
    draw_id         INTEGER NOT NULL REFERENCES lottery_draws(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    position        INTEGER NOT NULL,  -- 1st, 2nd, 3rd
    ticket_number   BIGINT NOT NULL,
    xp_prize        INTEGER NOT NULL,
    UNIQUE(draw_id, position)
);

-- Game sessions (mini-games play tracking)
CREATE TABLE IF NOT EXISTS game_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    game_type       VARCHAR(32) NOT NULL,  -- hammer, horse_race, slots, scratch
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    score           INTEGER,
    metadata        JSONB
);

-- Dashboard activity feed items
CREATE TABLE IF NOT EXISTS activity_feed (
    id              BIGSERIAL PRIMARY KEY,
    feed_type       VARCHAR(16) NOT NULL,  -- block, badge, miner, worldcup, system
    title           TEXT NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_feed_created ON activity_feed(created_at DESC);

-- Upcoming events
CREATE TABLE IF NOT EXISTS upcoming_events (
    id              SERIAL PRIMARY KEY,
    event_type      VARCHAR(16) NOT NULL,  -- world_cup, lottery, streak, maintenance
    title           VARCHAR(128) NOT NULL,
    description     TEXT,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    action_label    VARCHAR(32),
    action_href     VARCHAR(128),
    is_active       BOOLEAN DEFAULT TRUE
);

-- Audit log (admin actions, security events)
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id),
    action          VARCHAR(64) NOT NULL,  -- login, api_key_created, settings_changed, admin_action
    ip_address      INET,
    user_agent      TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
```

### Level Thresholds (Must Match Frontend Exactly)

```sql
-- Level progression table (reference — enforced in application code)
-- These values MUST match dashboard/src/stores/userStore.ts LEVEL_THRESHOLDS

-- Level  Title                   XP Required   Cumulative XP
-- -----  ----------------------  -----------   -------------
--  1     Nocoiner                0             0
--  2     Curious Cat             100           100
--  3     Hash Pupil              500           600
--  4     Solo Miner              1,000         1,600
--  5     Difficulty Hunter       2,500         4,100
--  6     Share Collector         3,000         7,100
--  7     Hash Veteran            3,500         10,600
--  8     Block Chaser            4,000         14,600
--  9     Nonce Grinder           5,000         19,600
--  10    Hashrate Warrior        10,000        29,600
--  15    Diff Hunter             25,000        79,600
--  20    Mining Veteran          50,000        179,600
--  25    Satoshi's Apprentice    100,000       429,600
--  30    Cypherpunk              250,000       929,600
--  50    Timechain Guardian      1,000,000     4,929,600
```

---

## 6. API Design

### Base URL

```
https://api.thebitcoingame.com/api/v1/
```

### Authentication Headers

```
Authorization: Bearer <jwt_token>        # JWT (15-minute expiry)
X-API-Key: tbg_a1b2c3d4e5f6g7h8         # API key (alternative)
```

### Endpoint Overview (~106 Endpoints)

| Domain | Prefix | Auth | Endpoints | Description |
|---|---|---|---|---|
| **Auth** | `/auth` | None/JWT | 12 | Challenge, verify, refresh, revoke, me, register, login, forgot/reset password, email verification |
| **Mining** | `/mining` | JWT | 12 | Dashboard stats, workers, shares, blocks, difficulty, setup |
| **Gamification** | `/gamification` | JWT | 10 | Badges, XP, streaks, level, personal bests |
| **Leaderboard** | `/leaderboard` | JWT | 6 | Weekly, monthly, all-time, country, user rank |
| **Competitions** | `/competitions` | JWT | 14 | World Cup, leagues, matches, teams, brackets |
| **Social** | `/social` | JWT | 10 | Coops, activity feed, global feed |
| **Education** | `/education` | JWT | 8 | Tracks, lessons, progress, completions |
| **Users** | `/users` | JWT | 11 | Profile, settings, notifications, API keys, wallet management |
| **Games** | `/games` | JWT | 6 | Lottery, game sessions |
| **Public** | `/public` | None | 8 | Public leaderboard, stats, miner profiles, how-it-works |
| **Admin** | `/admin` | JWT+Admin | 10 | User management, badge management, system stats |
| | | | **~106** | |

### Key Endpoint Details

#### Authentication

```
POST   /api/v1/auth/challenge           # Request signing challenge
POST   /api/v1/auth/verify              # Verify signature, get tokens
POST   /api/v1/auth/refresh             # Refresh access token
POST   /api/v1/auth/revoke              # Revoke refresh token
GET    /api/v1/auth/me                  # Get current user from token
POST   /api/v1/auth/register            # Register with email+password+wallet
POST   /api/v1/auth/login               # Login with email+password
POST   /api/v1/auth/forgot-password     # Request password reset
POST   /api/v1/auth/reset-password      # Reset password with token
POST   /api/v1/auth/verify-email        # Verify email address
POST   /api/v1/auth/resend-verification # Resend verification email
POST   /api/v1/auth/change-password     # Change password (authenticated)
```

**POST /api/v1/auth/challenge**

```json
// Request
{
    "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
}

// Response 200
{
    "challenge": "The Bitcoin Game authentication\nAddress: bc1qxy2k...0wlh\nNonce: a1b2c3d4e5f6\nTimestamp: 2026-02-23T12:00:00Z",
    "nonce": "a1b2c3d4e5f6",
    "expires_in": 300
}
```

**POST /api/v1/auth/verify**

```json
// Request
{
    "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "nonce": "a1b2c3d4e5f6",
    "signature": "H+gV..."
}

// Response 200
{
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "refresh_token": "dGJnX3JlZnJlc2hf...",
    "token_type": "bearer",
    "expires_in": 900,
    "user": {
        "id": 1,
        "btc_address": "bc1qxy2k...0wlh",
        "display_name": "SatoshiHunter",
        "country_code": "PT",
        "level": 7,
        "title": "Hash Veteran",
        "is_verified": true,
        "created_at": "2025-11-15T00:00:00Z"
    }
}
```

**POST /api/v1/auth/register**

```json
// Request
{
    "email": "miner@example.com",
    "password": "S3cure!Pass123",
    "btc_address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    "display_name": "SatoshiHunter"
}
// Response 201
{
    "access_token": "eyJ...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
        "id": 1,
        "email": "miner@example.com",
        "btc_address": "bc1qxy2k...0wlh",
        "display_name": "SatoshiHunter",
        "email_verified": false,
        "auth_method": "email"
    }
}
```

**POST /api/v1/auth/login**

```json
// Request
{
    "email": "miner@example.com",
    "password": "S3cure!Pass123"
}
// Response 200
{
    "access_token": "eyJ...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": { ... }
}
```

#### Mining Dashboard

```
GET    /api/v1/mining/dashboard        # Main dashboard stats
GET    /api/v1/mining/workers          # List all workers
GET    /api/v1/mining/workers/:id      # Single worker details
GET    /api/v1/mining/shares           # Paginated share history
GET    /api/v1/mining/shares/live      # Latest 20 shares (for feed)
GET    /api/v1/mining/hashrate         # Hashrate history (1h/24h/7d/30d)
GET    /api/v1/mining/difficulty        # Difficulty scatter + distribution
GET    /api/v1/mining/blocks           # Blocks found by pool
GET    /api/v1/mining/best-diff        # Weekly best difficulty
GET    /api/v1/mining/personal-bests   # All personal bests
GET    /api/v1/mining/daily-stats      # Daily aggregated stats
GET    /api/v1/mining/setup            # Pool connection instructions
```

**GET /api/v1/mining/dashboard**

```json
// Response 200
{
    "hashrate": {
        "current": 1210000000000,
        "change_24h": 3.2,
        "sparkline_24h": [1180e9, 1195e9, 1210e9, ...]
    },
    "shares": {
        "today": 47832,
        "change_24h": 12,
        "accepted_rate": 99.7
    },
    "workers": {
        "online": 2,
        "total": 3
    },
    "streak": {
        "weeks": 12,
        "is_active": true,
        "deadline": "2026-03-02T00:00:00Z"
    },
    "best_diff": {
        "weekly": 4231847293,
        "alltime": 7104293847,
        "weekly_rank": 12,
        "weekly_percentile": 94
    },
    "network": {
        "difficulty": 100847293444000,
        "block_height": 879500,
        "next_retarget_blocks": 1247
    },
    "level": {
        "current": 7,
        "title": "Hash Veteran",
        "xp_total": 10800,
        "xp_into_level": 200,
        "xp_for_level": 3500
    }
}
```

#### Gamification

```
GET    /api/v1/gamification/badges               # All badge definitions + user earned status
GET    /api/v1/gamification/badges/:slug         # Single badge detail
GET    /api/v1/gamification/xp                   # XP ledger (paginated)
GET    /api/v1/gamification/xp/summary           # XP totals by reason
GET    /api/v1/gamification/level                # Current level + roadmap
GET    /api/v1/gamification/streaks              # Streak calendar + current streak
GET    /api/v1/gamification/streaks/calendar     # Full streak calendar (52 weeks)
GET    /api/v1/gamification/personal-bests       # All personal bests
GET    /api/v1/gamification/progress             # Overall gamification summary
GET    /api/v1/gamification/recent               # Recent XP activity (last 20)
```

**GET /api/v1/gamification/badges**

```json
// Response 200
{
    "earned_count": 9,
    "total_count": 20,
    "badges": [
        {
            "slug": "first_share",
            "name": "First Hash",
            "description": "Submit your very first share to the pool",
            "category": "mining",
            "rarity": "common",
            "xp_reward": 50,
            "earned": {
                "date": "2025-11-15T00:00:00Z",
                "metadata": { "share_id": "share-001" }
            },
            "stats": {
                "total_earned": 4821,
                "percentage": 98.2
            }
        },
        {
            "slug": "block_finder",
            "name": "Block Finder",
            "description": "Find a Bitcoin block solo. The ultimate achievement.",
            "category": "mining",
            "rarity": "legendary",
            "xp_reward": 500,
            "earned": null,
            "stats": {
                "total_earned": 15,
                "percentage": 0.3
            }
        }
    ]
}
```

#### Leaderboard

```
GET    /api/v1/leaderboard/weekly      # Weekly best-diff leaderboard (top 100)
GET    /api/v1/leaderboard/monthly     # Monthly leaderboard
GET    /api/v1/leaderboard/alltime     # All-time leaderboard
GET    /api/v1/leaderboard/country     # Country rankings
GET    /api/v1/leaderboard/me          # Current user's rank across all periods
GET    /api/v1/leaderboard/neighbors   # Users around current user's rank
```

**GET /api/v1/leaderboard/weekly**

```json
// Response 200
{
    "period": "weekly",
    "week_start": "2026-02-16",
    "updated_at": "2026-02-23T12:05:00Z",
    "total_participants": 4912,
    "entries": [
        {
            "rank": 1,
            "user": {
                "display_name": "SatoshiHunter42",
                "country_code": "JP",
                "level": 15,
                "title": "Diff Hunter"
            },
            "best_diff": 12847293444102,
            "total_shares": 892104
        },
        ...
    ],
    "my_rank": {
        "rank": 12,
        "best_diff": 4231847293,
        "total_shares": 47832,
        "percentile": 94
    }
}
```

#### Users (wallet management)

```
PATCH  /api/v1/users/me/wallet         # Update BTC wallet address
```

### Error Response Format

All errors follow a consistent format:

```json
{
    "error": {
        "code": "AUTH_INVALID_SIGNATURE",
        "message": "The provided Bitcoin message signature is invalid.",
        "details": null
    }
}
```

### Standard HTTP Status Codes

| Code | Usage |
|---|---|
| 200 | Success |
| 201 | Created (new resource) |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (duplicate resource) |
| 422 | Unprocessable entity (Pydantic validation) |
| 429 | Too many requests (rate limited) |
| 500 | Internal server error |

### Pagination

All list endpoints support cursor-based pagination:

```
GET /api/v1/mining/shares?limit=20&cursor=eyJpZCI6MTIzfQ==
```

```json
{
    "data": [...],
    "pagination": {
        "limit": 20,
        "has_more": true,
        "next_cursor": "eyJpZCI6MTQzfQ=="
    }
}
```

---

## 7. WebSocket Design

### Connection

Single WebSocket endpoint with JWT authentication:

```
ws://api.thebitcoingame.com/api/ws?token={jwt}
```

### Channel Architecture

```mermaid
graph TD
    subgraph Client["React Dashboard"]
        TQ["TanStack Query<br/>(REST polling)"]
        WSC["WebSocket Client<br/>(real-time)"]
    end

    subgraph WSHub["WebSocket Hub (FastAPI)"]
        CONN["Connection Manager"]
        AUTH_WS["JWT Validation"]
        ROUTER["Channel Router"]
    end

    subgraph Channels["Channels"]
        CH_SHARES["shares<br/>Live share feed"]
        CH_WORKERS["workers<br/>Online/offline status"]
        CH_BLOCKS["blocks<br/>Block found alerts"]
        CH_FEED["feed<br/>Global activity feed"]
        CH_NOTIF["notifications<br/>Personal notifications"]
        CH_LB["leaderboard<br/>Rank changes"]
        CH_COMP["competition<br/>Match updates"]
    end

    subgraph RedisPubSub["Redis Pub/Sub"]
        R_USER["ws:user:{btc_address}"]
        R_GLOBAL["ws:global"]
    end

    WSC -->|"connect"| AUTH_WS
    AUTH_WS -->|"authenticated"| CONN
    CONN --> ROUTER
    ROUTER --> CH_SHARES & CH_WORKERS & CH_BLOCKS & CH_FEED & CH_NOTIF & CH_LB & CH_COMP

    R_USER -->|"subscribe"| ROUTER
    R_GLOBAL -->|"subscribe"| ROUTER
```

### Protocol

**Subscribe to channels:**

```json
// Client → Server
{
    "action": "subscribe",
    "channels": ["shares", "workers", "notifications"]
}

// Server → Client
{
    "type": "subscribed",
    "channels": ["shares", "workers", "notifications"]
}
```

**Unsubscribe:**

```json
// Client → Server
{
    "action": "unsubscribe",
    "channels": ["shares"]
}
```

**Server push messages:**

```json
// New share
{
    "channel": "shares",
    "type": "share_submitted",
    "data": {
        "worker": "bitaxe-living-room",
        "difficulty": 28471934,
        "is_personal_best": false,
        "timestamp": "2026-02-23T12:00:01Z"
    }
}

// Worker status change
{
    "channel": "workers",
    "type": "worker_offline",
    "data": {
        "worker": "nerdaxe-office",
        "last_share": "2026-02-23T10:00:00Z"
    }
}

// Badge earned
{
    "channel": "notifications",
    "type": "badge_earned",
    "data": {
        "badge_slug": "shares_1m",
        "badge_name": "Megahash",
        "rarity": "rare",
        "xp_reward": 200,
        "new_total_xp": 11000,
        "new_level": 7
    }
}

// Block found (broadcast to all)
{
    "channel": "blocks",
    "type": "block_found",
    "data": {
        "block_height": 879413,
        "finder": "LuckyMiner777",
        "finder_country": "US",
        "reward": 3.125,
        "is_mine": false
    }
}

// Leaderboard update
{
    "channel": "leaderboard",
    "type": "rank_changed",
    "data": {
        "period": "weekly",
        "old_rank": 14,
        "new_rank": 12,
        "best_diff": 4231847293
    }
}
```

### Redis Pub/Sub Bridge

The WebSocket Hub subscribes to Redis pub/sub channels and forwards messages to connected WebSocket clients:

```python
# Simplified bridge pattern
async def redis_bridge(ws_manager: WebSocketManager, redis: Redis):
    pubsub = redis.pubsub()
    await pubsub.psubscribe("ws:user:*", "ws:global")

    async for message in pubsub.listen():
        if message["type"] == "pmessage":
            channel = message["channel"].decode()
            data = json.loads(message["data"])

            if channel.startswith("ws:user:"):
                btc_address = channel.split(":")[-1]
                await ws_manager.send_to_user(btc_address, data)
            elif channel == "ws:global":
                await ws_manager.broadcast(data)
```

### Heartbeat / Keepalive

```json
// Server → Client (every 30s)
{ "type": "ping" }

// Client → Server
{ "type": "pong" }
```

Connection is closed if no pong received within 60 seconds.

---

## 8. Background Workers

### Worker Architecture

```mermaid
graph TB
    subgraph Redis["Redis"]
        STREAM["Streams<br/>mining:shares<br/>mining:blocks<br/>mining:connections<br/>mining:difficulty"]
        QUEUE["arq Queues<br/>gamification<br/>stats<br/>notifications"]
        PUBSUB["Pub/Sub<br/>ws:user:*<br/>ws:global"]
    end

    subgraph Workers["arq Workers"]
        EC["event-consumer<br/>─────────────<br/>XREADGROUP on all<br/>mining streams<br/>─────────────<br/>Dispatches to other<br/>workers via arq queue"]

        GW["gamification-worker<br/>─────────────<br/>Badge trigger evaluation<br/>XP grants<br/>Level progression<br/>Personal best updates"]

        SW["stats-worker<br/>─────────────<br/>Leaderboard refresh<br/>Country aggregation<br/>Daily stats rollup<br/>Badge stats update"]

        NW["notification-worker<br/>─────────────<br/>WebSocket push (Redis pub)<br/>In-app notification persist<br/>Optional email delivery"]

        SCHED["scheduler (cron)<br/>─────────────<br/>Mon 00:00: Streak deadline<br/>Mon 00:01: Lottery draw<br/>Every 5m: Leaderboard refresh<br/>Daily: Badge stats<br/>Daily: User daily stats"]
    end

    subgraph DB["TimescaleDB"]
        TABLES["All tables"]
    end

    STREAM -->|"XREADGROUP"| EC
    EC -->|"enqueue"| QUEUE
    QUEUE --> GW & SW & NW
    SCHED -->|"enqueue"| QUEUE

    GW --> TABLES
    SW --> TABLES
    NW --> TABLES
    GW -->|"enqueue notification"| QUEUE
    SW -->|"enqueue notification"| QUEUE
    NW --> PUBSUB
```

### event-consumer

The primary consumer of the CKPool event pipeline. Reads from Redis Streams using consumer groups (exactly-once processing guarantee).

```python
# Consumer group processing
STREAMS = {
    "mining:share_submitted": "handle_share",
    "mining:block_found": "handle_block",
    "mining:miner_connected": "handle_connect",
    "mining:miner_disconnected": "handle_disconnect",
    "mining:diff_updated": "handle_diff_update",
    "mining:hashrate_update": "handle_hashrate",
    "mining:new_block_network": "handle_network_block",
    "mining:share_best_diff": "handle_best_diff",
}

async def handle_share(event: dict):
    """Process a share_submitted event."""
    user = event["data"]["user"]
    worker = event["data"]["worker"]
    difficulty = event["data"]["share_diff"]

    # 1. Update worker last_share timestamp
    await worker_repo.update_last_share(user, worker)

    # 2. Increment daily stats
    await stats_repo.increment_daily_shares(user)

    # 3. Push to WebSocket (real-time feed)
    await redis.publish(f"ws:user:{user}", json.dumps({
        "channel": "shares",
        "type": "share_submitted",
        "data": {"worker": worker, "difficulty": difficulty, ...}
    }))

    # 4. Enqueue gamification check
    await arq_pool.enqueue_job("check_badges", user=user, event_type="share")
```

### gamification-worker

Evaluates badge triggers and grants XP. All badge logic is centralized here.

**Badge Trigger Types:**

| Trigger Type | Condition | Badges |
|---|---|---|
| `shares_count` | `total_shares >= threshold` | first_share (1), shares_1k (1000), shares_1m (1000000) |
| `best_diff` | `best_diff_alltime >= threshold` | diff_1e6, diff_1e9, diff_1e12 |
| `streak_weeks` | `streak_weeks >= threshold` | streak_4 (4), streak_12 (12), streak_52 (52) |
| `block_found` | `blocks_found >= 1` | block_finder |
| `education_track` | `completed_tracks includes slug` | rabbit_hole_complete |
| `competition` | `participated_in(type)` | world_cup_participant, world_cup_winner |
| `social` | `cooperatives_founded >= 1` | coop_founder |
| `manual` | Admin-granted | node_runner, orange_piller |

**XP Sources:**

| Source | XP Amount | Frequency |
|---|---|---|
| Badge earned | Varies (50-500) | Per badge |
| Daily share (first of day) | 50 | Daily |
| Weekly streak bonus | 25 * streak_weeks | Weekly |
| Best diff personal record | 50 | Per record |
| Education lesson completed | 25 | Per lesson |
| Education track completed | 150 | Per track |
| Lottery win (1st place) | 500 | Weekly |
| Lottery win (2nd/3rd) | 200/100 | Weekly |
| World Cup participation | 200 | Per event |
| Block found | 500 | Per block |

### stats-worker

Computes leaderboards, country rankings, and aggregated statistics.

**Scheduled tasks:**

| Task | Schedule | Description |
|---|---|---|
| `refresh_leaderboard` | Every 5 minutes | Recompute top 100 for weekly/monthly/alltime |
| `refresh_country_rankings` | Every 5 minutes | Country-level aggregation |
| `compute_daily_stats` | Daily 00:30 UTC | Roll up user daily stats from shares |
| `update_badge_stats` | Daily 01:00 UTC | Recompute badge rarity percentages |
| `cleanup_old_snapshots` | Daily 02:00 UTC | Remove leaderboard snapshots older than 30 days |

### notification-worker

Delivers notifications through multiple channels.

**Delivery channels:**

| Channel | Technology | Use Case |
|---|---|---|
| WebSocket push | Redis PUBLISH | Real-time in-app (primary) |
| In-app persist | TimescaleDB INSERT | Notification history |
| Email (optional) | SMTP / Resend API | Block found, weekly digest |
| Email (transactional) | SMTP / Resend / SES | Verification, password reset, welcome |

### scheduler (cron)

Runs periodic tasks on fixed schedules using arq's cron functionality.

```python
class WorkerSettings:
    cron_jobs = [
        cron(streak_deadline_check, weekday=0, hour=0, minute=0),   # Monday 00:00
        cron(run_lottery_draw, weekday=0, hour=0, minute=1),        # Monday 00:01
        cron(refresh_leaderboard, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}),
        cron(compute_daily_stats, hour=0, minute=30),               # Daily 00:30
        cron(update_badge_stats, hour=1, minute=0),                 # Daily 01:00
        cron(cleanup_old_snapshots, hour=2, minute=0),              # Daily 02:00
    ]
```

---

## 9. Testing Strategy

### Non-Negotiable Testing Requirements

| Requirement | Target | Enforced By |
|---|---|---|
| Unit test coverage per module | >= 80% | `pytest-cov` + CI gate |
| Critical path coverage | >= 90% | Manual review |
| Every API endpoint | Integration test | CI gate |
| Every background worker | Unit + integration test | CI gate |
| Every badge trigger | Unit test | CI gate |
| Auth flows | Integration + E2E | CI gate |
| WebSocket flows | Integration test | CI gate |
| Database migrations | Test migration up + down | CI gate |

### Testing Stack

```mermaid
graph TB
    subgraph Unit["Unit Tests"]
        UT_SVC["Service layer tests<br/>(mocked repos)"]
        UT_BADGE["Badge trigger tests<br/>(all 20 badges)"]
        UT_XP["XP calculation tests<br/>(level thresholds)"]
        UT_AUTH["Auth logic tests<br/>(signature verify, JWT)"]
    end

    subgraph Integration["Integration Tests"]
        IT_API["API endpoint tests<br/>(httpx.AsyncClient)"]
        IT_WS["WebSocket tests<br/>(websockets library)"]
        IT_WORKER["Worker tests<br/>(arq test mode)"]
        IT_DB["Repository tests<br/>(real TimescaleDB)"]
    end

    subgraph E2E["E2E Tests"]
        E2E_AUTH["Auth flow<br/>(connect → sign → dashboard)"]
        E2E_MINING["Mining flow<br/>(share → badge → notification)"]
        E2E_COMP["Competition flow<br/>(register → mine → leaderboard)"]
    end

    subgraph Infra["Test Infrastructure"]
        TC_PG["testcontainers<br/>PostgreSQL + TimescaleDB"]
        TC_REDIS["testcontainers<br/>Redis"]
        FACTORY["Test factories<br/>(factory_boy)"]
        FIXTURES["Shared fixtures<br/>(conftest.py)"]
    end

    Unit --> FACTORY & FIXTURES
    Integration --> TC_PG & TC_REDIS & FACTORY & FIXTURES
    E2E --> TC_PG & TC_REDIS
```

### Test Tools

| Tool | Purpose |
|---|---|
| `pytest` | Test runner |
| `pytest-asyncio` | Async test support |
| `pytest-cov` | Coverage measurement |
| `httpx` | Async HTTP client for API tests |
| `testcontainers` | Disposable PostgreSQL + Redis for integration tests |
| `factory_boy` | Test data factories |
| `freezegun` | Time mocking (streaks, lottery draws) |
| `respx` | HTTP mocking for external services |
| `Playwright` | Browser E2E tests (frontend integration) |

### Example Test Structure

```python
# tests/unit/services/test_badge_service.py
@pytest.mark.asyncio
async def test_first_share_badge_triggered():
    """First share should trigger the first_share badge."""
    user = UserFactory(total_shares=0)
    badge_service = BadgeService(mock_repo)

    result = await badge_service.check_badges(
        user_id=user.id,
        event_type="share",
        context={"total_shares": 1}
    )

    assert len(result.new_badges) == 1
    assert result.new_badges[0].slug == "first_share"
    assert result.xp_granted == 50

# tests/integration/api/test_auth.py
@pytest.mark.asyncio
async def test_auth_challenge_and_verify(client: AsyncClient, db: AsyncSession):
    """Full authentication flow with Bitcoin message signing."""
    # Request challenge
    resp = await client.post("/api/v1/auth/challenge", json={
        "btc_address": TEST_BTC_ADDRESS
    })
    assert resp.status_code == 200
    nonce = resp.json()["nonce"]

    # Sign and verify
    signature = sign_message(TEST_PRIVATE_KEY, resp.json()["challenge"])
    resp = await client.post("/api/v1/auth/verify", json={
        "btc_address": TEST_BTC_ADDRESS,
        "nonce": nonce,
        "signature": signature
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()
```

---

## 10. Security

### Authentication Architecture

```mermaid
graph LR
    subgraph Auth["Authentication Methods"]
        BTC["Bitcoin Message Signing<br/>Primary: wallet users"]
        EMAIL["Email + Password<br/>Registration + Login"]
        JWT["JWT RS256<br/>Access tokens (15min)"]
        APIKEY["API Keys<br/>Third-party integrations"]
    end

    subgraph Validation["Validation Layer"]
        PYDANTIC["Pydantic Strict Mode<br/>All inputs validated"]
        RATE["Rate Limiter<br/>Redis-backed"]
        CORS["CORS<br/>Frontend origin only"]
    end

    subgraph Storage["Secure Storage"]
        RS256["RS256 Key Pair<br/>Asymmetric JWT signing"]
        ARGON["Argon2<br/>API key hashing"]
        ARGON_PW["Argon2id<br/>Password hashing"]
        SHA["SHA-256<br/>Refresh token hashing"]
    end

    BTC --> JWT
    EMAIL --> JWT
    JWT --> RATE
    APIKEY --> RATE
    RATE --> PYDANTIC
    PYDANTIC --> CORS
```

### Security Measures

| Threat | Mitigation |
|---|---|
| **Password theft** | Passwords hashed with argon2id (time_cost=3, memory_cost=65536). Bitcoin signing also available. |
| **Token theft** | Short-lived JWT (15min). Refresh tokens rotated on use. |
| **Replay attacks** | Challenge nonces are single-use, expire in 5 minutes. |
| **JWT forgery** | RS256 asymmetric signing. Public key verifies, private key signs. |
| **API key leakage** | Keys hashed with Argon2. Only prefix stored for display. |
| **SQL injection** | Parameterized queries only (SQLAlchemy ORM). No raw SQL. |
| **XSS** | REST API returns JSON only. No HTML rendering. |
| **CSRF** | Token-based auth (no cookies). CORS restricted. |
| **Rate limit abuse** | Redis-backed per-IP and per-user rate limiting. |
| **DDoS** | Rate limiting + Cloudflare in front of API. |
| **Data leakage** | Privacy settings control profile visibility. No email required. |
| **Brute force** | Exponential backoff on failed auth attempts. |
| **Email enumeration** | Forgot-password always returns 200 regardless of email existence. |
| **Password brute force** | Account lockout after 10 failed attempts (15-min cooldown). Rate limit 5/min on login. |
| **Email verification bypass** | Users can mine before verification but cannot change email or access sensitive settings. |
| **Privilege escalation** | Role-based permissions. Admin routes require admin flag. |

### Rate Limits

| Endpoint Group | Limit (per user) | Limit (per IP) |
|---|---|---|
| Auth challenge/verify | 5/min | 20/min |
| Auth refresh | 10/min | 30/min |
| Mining reads | 60/min | 120/min |
| Gamification reads | 30/min | 60/min |
| Leaderboard reads | 20/min | 60/min |
| WebSocket connect | 5/min | 10/min |
| API key operations | 10/min | 20/min |
| Auth register | 3/min | 10/min |
| Auth login | 5/min | 20/min |
| Auth forgot-password | 3/min | 5/min |
| Email sending | 5/hour per address | — |
| Admin operations | 30/min | — |

### JWT Token Structure

```json
{
    "sub": "1",                              // user_id
    "btc": "bc1qxy2k...0wlh",               // btc_address
    "iat": 1708689600,                       // issued at
    "exp": 1708690500,                       // expires (15min)
    "iss": "thebitcoingame.com",             // issuer
    "aud": "api.thebitcoingame.com",         // audience
    "jti": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  // unique token ID
    "role": "user"                           // user | admin
}
```

---

## 11. Configuration

### Environment Variables (Pydantic Settings)

All configuration is environment-driven. No config files in the repository.

```python
class Settings(BaseSettings):
    """Application configuration via environment variables."""

    model_config = SettingsConfigDict(env_prefix="TBG_")

    # ── Application ──
    APP_NAME: str = "The Bitcoin Game API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"       # development, staging, production
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── Server ──
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4                       # uvicorn workers (production)
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # ── Database (TimescaleDB) ──
    DATABASE_URL: str = "postgresql+asyncpg://tbg:tbg@localhost:5432/thebitcoingame"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_ECHO: bool = False

    # ── Redis ──
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_STREAM_CONSUMER_GROUP: str = "backend-api"
    REDIS_STREAM_CONSUMER_NAME: str = "api-1"

    # ── JWT Authentication ──
    JWT_PRIVATE_KEY_PATH: str = "/run/secrets/jwt_private.pem"
    JWT_PUBLIC_KEY_PATH: str = "/run/secrets/jwt_public.pem"
    JWT_ALGORITHM: str = "RS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    JWT_ISSUER: str = "thebitcoingame.com"
    JWT_AUDIENCE: str = "api.thebitcoingame.com"

    # ── Bitcoin ──
    BTC_NETWORK: str = "mainnet"           # mainnet, testnet, signet
    BTC_CHALLENGE_EXPIRE_SECONDS: int = 300
    BTC_CHALLENGE_MESSAGE_PREFIX: str = "The Bitcoin Game authentication"

    # ── Rate Limiting ──
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_API: str = "60/minute"
    RATE_LIMIT_WS: str = "5/minute"

    # ── Workers (arq) ──
    ARQ_REDIS_URL: str = "redis://localhost:6379/1"
    ARQ_MAX_JOBS: int = 100
    ARQ_JOB_TIMEOUT: int = 300             # 5 minutes

    # ── Gamification ──
    XP_DAILY_SHARE: int = 50
    XP_STREAK_MULTIPLIER: int = 25
    XP_BEST_DIFF_RECORD: int = 50
    XP_LESSON_COMPLETE: int = 25
    XP_TRACK_COMPLETE: int = 150
    XP_BLOCK_FOUND: int = 500
    XP_LOTTERY_1ST: int = 500
    XP_LOTTERY_2ND: int = 200
    XP_LOTTERY_3RD: int = 100

    # ── Leaderboard ──
    LEADERBOARD_REFRESH_INTERVAL: int = 300  # 5 minutes
    LEADERBOARD_TOP_N: int = 100
    LEADERBOARD_CACHE_TTL: int = 300

    # ── Lottery ──
    LOTTERY_DRAW_DAY: int = 0              # Monday (0 = Monday in Python)
    LOTTERY_DRAW_HOUR: int = 0
    LOTTERY_DRAW_MINUTE: int = 1
    LOTTERY_PRIZE_POSITIONS: int = 3

    # ── Streak ──
    STREAK_DEADLINE_DAY: int = 0           # Monday
    STREAK_DEADLINE_HOUR: int = 0
    STREAK_MIN_SHARES: int = 1             # Minimum shares per week to keep streak

    # ── Email Service ──
    EMAIL_PROVIDER: str = "smtp"                    # smtp, resend, ses
    EMAIL_SMTP_HOST: str = ""
    EMAIL_SMTP_PORT: int = 587
    EMAIL_SMTP_USER: str = ""
    EMAIL_SMTP_PASSWORD: str = ""
    EMAIL_FROM_ADDRESS: str = "noreply@thebitcoingame.com"
    EMAIL_FROM_NAME: str = "The Bitcoin Game"
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS: int = 24
    EMAIL_PASSWORD_RESET_TOKEN_TTL_MINUTES: int = 60
    RESEND_API_KEY: str = ""                        # If using Resend provider

    # ── Password Policy ──
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_MAX_LOGIN_ATTEMPTS: int = 10
    PASSWORD_LOCKOUT_MINUTES: int = 15

    # ── Notifications ──
    NOTIFICATION_MAX_PER_USER: int = 100   # Max stored notifications
    EMAIL_ENABLED: bool = False

    # ── WebSocket ──
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_HEARTBEAT_TIMEOUT: int = 60
    WS_MAX_CONNECTIONS_PER_USER: int = 3
```

### Docker Compose Services

```yaml
# docker-compose.yml (simplified)
services:
  api:
    build: .
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    ports: ["8000:8000"]
    depends_on: [timescaledb, redis]
    env_file: .env

  event-consumer:
    build: .
    command: arq app.workers.event_consumer.WorkerSettings
    depends_on: [timescaledb, redis]
    env_file: .env

  gamification-worker:
    build: .
    command: arq app.workers.gamification.WorkerSettings
    depends_on: [timescaledb, redis]
    env_file: .env

  stats-worker:
    build: .
    command: arq app.workers.stats.WorkerSettings
    depends_on: [timescaledb, redis]
    env_file: .env

  notification-worker:
    build: .
    command: arq app.workers.notifications.WorkerSettings
    depends_on: [timescaledb, redis]
    env_file: .env

  scheduler:
    build: .
    command: arq app.workers.scheduler.WorkerSettings
    depends_on: [timescaledb, redis]
    env_file: .env

  timescaledb:
    image: timescale/timescaledb:latest-pg16
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```

---

## 12. Roadmap Summary

### Development Phases

```mermaid
gantt
    title Backend Service Development Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %Y

    section Phase 0: Foundation
    Project scaffolding           :p0a, 2026-03-01, 5d
    Database migrations (Alembic) :p0b, 2026-03-01, 5d
    Docker Compose setup          :p0c, 2026-03-03, 3d
    CI/CD pipeline                :p0d, 2026-03-06, 4d

    section Phase 1: Auth & Users
    Bitcoin message signing       :p1a, 2026-03-10, 7d
    Email + password auth         :p1a2, 2026-03-10, 7d
    JWT RS256 token flow          :p1b, 2026-03-10, 5d
    Email service integration     :p1b2, 2026-03-17, 5d
    User CRUD + settings          :p1c, 2026-03-17, 5d
    API key management            :p1d, 2026-03-22, 5d
    Wallet management             :p1d2, 2026-03-22, 3d
    Rate limiting middleware      :p1e, 2026-03-27, 3d

    section Phase 2: Mining API
    Dashboard stats endpoint      :p2a, 2026-03-25, 5d
    Workers CRUD                  :p2b, 2026-03-25, 5d
    Shares history + pagination   :p2c, 2026-03-30, 5d
    Hashrate history endpoints    :p2d, 2026-03-30, 5d
    Blocks + difficulty endpoints :p2e, 2026-04-04, 5d

    section Phase 3: WebSocket
    Connection manager            :p3a, 2026-04-09, 5d
    Channel multiplexing          :p3b, 2026-04-09, 5d
    Redis pub/sub bridge          :p3c, 2026-04-14, 5d
    Live share feed               :p3d, 2026-04-14, 5d

    section Phase 4: Event Consumer
    Redis Stream consumer         :p4a, 2026-04-19, 7d
    Event dispatching             :p4b, 2026-04-19, 5d
    Worker status tracking        :p4c, 2026-04-26, 5d

    section Phase 5: Gamification
    Badge definitions + triggers  :p5a, 2026-05-01, 7d
    XP engine + level progression :p5b, 2026-05-01, 7d
    Streak tracking               :p5c, 2026-05-08, 5d
    Personal bests                :p5d, 2026-05-08, 5d
    Gamification API endpoints    :p5e, 2026-05-13, 5d

    section Phase 6: Leaderboard & Lottery
    Leaderboard computation       :p6a, 2026-05-18, 5d
    Country rankings              :p6b, 2026-05-18, 5d
    Leaderboard caching           :p6c, 2026-05-23, 3d
    Weekly lottery engine         :p6d, 2026-05-23, 5d
    Lottery API endpoints         :p6e, 2026-05-28, 3d

    section Phase 7: Competitions
    World Cup state machine       :p7a, 2026-06-01, 7d
    Match + bracket logic         :p7b, 2026-06-01, 7d
    League system                 :p7c, 2026-06-08, 7d
    Competition API endpoints     :p7d, 2026-06-15, 5d

    section Phase 8: Social & Education
    Cooperatives                  :p8a, 2026-06-20, 5d
    Notifications system          :p8b, 2026-06-20, 5d
    Education tracks + lessons    :p8c, 2026-06-25, 5d
    Activity feed                 :p8d, 2026-06-25, 5d

    section Phase 9: Frontend Integration
    TanStack Query hooks          :p9a, 2026-07-01, 7d
    WebSocket client integration  :p9b, 2026-07-01, 7d
    Replace mock data             :p9c, 2026-07-08, 10d
    E2E testing                   :p9d, 2026-07-18, 5d

    section Phase 10: Production
    Security audit                :p10a, 2026-07-23, 7d
    Performance optimization      :p10b, 2026-07-23, 7d
    Monitoring + alerting         :p10c, 2026-07-30, 5d
    Staging deployment            :p10d, 2026-08-04, 5d
    Production deployment         :p10e, 2026-08-09, 5d
```

### Phase Overview

| Phase | Name | Duration | Key Deliverables |
|---|---|---|---|
| 0 | Foundation | 1.5 weeks | Project scaffold, Alembic migrations, Docker Compose, CI/CD |
| 1 | Auth & Users | 3 weeks | Dual auth (Bitcoin signing + email/password), JWT RS256, email service, user CRUD, API keys, wallet management |
| 2 | Mining API | 2 weeks | All mining endpoints (dashboard, workers, shares, hashrate, blocks) |
| 3 | WebSocket | 1.5 weeks | Connection manager, channel multiplexing, Redis bridge, live feed |
| 4 | Event Consumer | 1.5 weeks | Redis Stream consumer, event dispatching, worker status tracking |
| 5 | Gamification | 2.5 weeks | Badge engine (20 badges), XP system, streaks, personal bests, API |
| 6 | Leaderboard & Lottery | 2 weeks | Leaderboard computation + caching, country rankings, lottery engine |
| 7 | Competitions | 3 weeks | World Cup state machine, bracket logic, league system, competition API |
| 8 | Social & Education | 2 weeks | Cooperatives, notifications, education tracks, activity feed |
| 9 | Frontend Integration | 3 weeks | TanStack Query hooks, WebSocket client, mock data replacement, E2E tests |
| 10 | Production | 3 weeks | Security audit, performance, monitoring, staging, production deploy |

**Total estimated duration: ~25 weeks (6 months)**

### Phase Dependencies

```mermaid
graph LR
    P0["Phase 0<br/>Foundation"] --> P1["Phase 1<br/>Auth"]
    P0 --> P2["Phase 2<br/>Mining API"]
    P1 --> P3["Phase 3<br/>WebSocket"]
    P1 --> P4["Phase 4<br/>Event Consumer"]
    P2 --> P4
    P4 --> P5["Phase 5<br/>Gamification"]
    P5 --> P6["Phase 6<br/>Leaderboard<br/>& Lottery"]
    P5 --> P7["Phase 7<br/>Competitions"]
    P5 --> P8["Phase 8<br/>Social &<br/>Education"]
    P3 & P6 & P7 & P8 --> P9["Phase 9<br/>Frontend<br/>Integration"]
    P9 --> P10["Phase 10<br/>Production"]
```

### Excluded From Scope

| Feature | Reason | When |
|---|---|---|
| Stratum V2 | CKPool service handles this separately | CKPool Phase 6 |
| Merchandise Shop | Not core to gamification | Post-launch |
| Lightning Betting | Regulatory complexity | Post-launch evaluation |
| Decentralized Mining (TBG Proxy) | Requires CKPool service completion first | Future |
| Mobile App | React dashboard is responsive; native app is future | Post-launch |

---

### 8 Event Types (Source of Truth)

All events consumed by the backend originate from CKPool via the Event Collector. Every event includes `source: "hosted"` for future compatibility with decentralized mining.

| # | Event | Producer | Consumer Action |
|---|---|---|---|
| 1 | `share_submitted` | CKPool (every share) | Update stats, check badges, push to WebSocket |
| 2 | `block_found` | CKPool (block solve) | Award badge + XP, broadcast to all, update leaderboard |
| 3 | `miner_connected` | CKPool (new connection) | Update worker status, check first-connection badge |
| 4 | `miner_disconnected` | CKPool (disconnect) | Update worker status, persist session stats |
| 5 | `diff_updated` | CKPool (vardiff change) | Update worker difficulty, push to WebSocket |
| 6 | `hashrate_update` | CKPool (periodic) | Update hashrate snapshots, push to WebSocket |
| 7 | `new_block_network` | CKPool (new chain block) | Update network difficulty display |
| 8 | `share_best_diff` | CKPool (new weekly best) | Update personal bests, check diff badges, push notification |

---

*This document is a living plan. Update as architecture decisions are validated and scope evolves. Detailed phase implementation plans are in `docs/backend-service/roadmap/`.*
