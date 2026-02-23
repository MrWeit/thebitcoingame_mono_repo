# Prompt: Backend Service — Phase 4 (Gamification Engine)

You are building the gamification engine for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend API (FastAPI + PostgreSQL + Redis) was built in Phases 0-3: authentication, mining data API, and WebSocket real-time events are all operational. Phase 4 builds the core gamification system: badges, XP, levels, and streaks — the heart of what makes mining fun.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/` (do not touch). The backend API lives in `backend/`. The mining engine lives in `services/ckpool/` and the event collector in `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
2. **Do not touch `services/ckpool/` or `services/event-collector/`** — The mining engine and event collector are complete from earlier phases. You are building on top of their Redis Streams output.
3. **Level thresholds MUST match the frontend EXACTLY.** The frontend has hardcoded level thresholds in `dashboard/src/stores/userStore.ts` (lines 31-47). If the backend computes levels differently, the UI will show wrong data. Copy them verbatim.
4. **Badge definitions MUST match the frontend catalog.** The frontend has 20 badge definitions in `dashboard/src/mocks/badges.ts`. The backend badge_definitions table must seed these exact 20 badges with matching slugs, rarities, and XP rewards.
5. **All background work uses arq workers** consuming from Redis Streams. Do not use Celery, Dramatiq, or any other task queue. arq is already installed from Phase 3.
6. **Idempotent processing is mandatory.** Mining events may be delivered more than once (Redis Streams at-least-once). Every trigger evaluation and XP grant MUST be idempotent — processing the same event twice must not award duplicate badges or XP.
7. **UTC everywhere.** All timestamps, streak boundaries, and weekly resets use UTC. No timezone conversions in the backend.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Architecture overview, service boundaries, data flow diagrams. Your primary reference for the overall system.
2. `docs/backend-service/roadmap/phase-04-gamification.md` — Full Phase 4 specification with database schemas, trigger logic, XP formulas, and API endpoints. This is your detailed blueprint.
3. `docs/backend-service/roadmap/phase-03-websocket.md` — Phase 3 deliverables, especially WebSocket event delivery which Phase 4 uses for real-time badge notifications.
4. `dashboard/src/mocks/badges.ts` — The 20 badge definitions with exact slugs, categories, rarities, and XP rewards. Your badge_definitions seed data comes from here.
5. `dashboard/src/stores/userStore.ts` — The LEVEL_THRESHOLDS array (lines 31-47) with exact cumulative XP values. Your level computation MUST match these numbers.
6. `dashboard/src/hooks/useGameData.ts` — The WeeklyGameData interface. Useful context for how the frontend expects gamification data shaped.
7. `dashboard/src/stores/settingsStore.ts` — Notification preferences that affect which gamification notifications are delivered.
8. `dashboard/src/mocks/notifications.ts` — The NotificationItem interface with type/subtype structure. Your notification payloads must match this shape.

Read ALL of these before writing any code. The badge definitions and level thresholds are non-negotiable — they must match the frontend exactly.

---

## What You Are Building

### Part 1: Database Schema

Create an Alembic migration for the gamification tables. All tables live in the `public` schema alongside the existing Phase 0-3 tables.

#### 1.1 Badge Definitions Table

```sql
CREATE TABLE badge_definitions (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(64) UNIQUE NOT NULL,       -- e.g. "first_share", "block_finder"
    name        VARCHAR(128) NOT NULL,              -- e.g. "First Hash", "Block Finder"
    description TEXT NOT NULL,
    category    VARCHAR(32) NOT NULL,               -- mining, streak, competition, social, node
    rarity      VARCHAR(16) NOT NULL,               -- common, rare, epic, legendary
    xp_reward   INTEGER NOT NULL,                   -- XP granted when earned
    trigger_type VARCHAR(32) NOT NULL,              -- share_count, best_diff, streak, block_found, event
    trigger_config JSONB NOT NULL DEFAULT '{}',     -- e.g. {"threshold": 1000} or {"event": "world_cup_participate"}
    icon_url    VARCHAR(256),                       -- optional icon path
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_badge_defs_category ON badge_definitions(category);
CREATE INDEX idx_badge_defs_trigger ON badge_definitions(trigger_type);
```

#### 1.2 User Badges Table

```sql
CREATE TABLE user_badges (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id    INTEGER NOT NULL REFERENCES badge_definitions(id),
    earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata    JSONB DEFAULT '{}',                 -- context: share_id, difficulty, event_name, etc.
    notified    BOOLEAN NOT NULL DEFAULT false,      -- whether user has been notified

    UNIQUE(user_id, badge_id)                       -- prevent duplicate awards
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);
CREATE INDEX idx_user_badges_earned ON user_badges(earned_at);
```

#### 1.3 XP Ledger Table

```sql
CREATE TABLE xp_ledger (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,                   -- XP granted (always positive)
    source      VARCHAR(32) NOT NULL,               -- badge, share, personal_best, lesson, track, streak, competition
    source_id   VARCHAR(128),                       -- reference: badge slug, lesson id, etc.
    description VARCHAR(256),                       -- human-readable: "Earned badge: First Hash"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Idempotency key: prevent duplicate grants for the same event
    idempotency_key VARCHAR(256) UNIQUE
);

CREATE INDEX idx_xp_ledger_user ON xp_ledger(user_id);
CREATE INDEX idx_xp_ledger_source ON xp_ledger(source);
CREATE INDEX idx_xp_ledger_created ON xp_ledger(created_at);
```

#### 1.4 User Gamification (Denormalized) Table

```sql
CREATE TABLE user_gamification (
    user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp            BIGINT NOT NULL DEFAULT 0,
    level               INTEGER NOT NULL DEFAULT 1,
    level_title         VARCHAR(64) NOT NULL DEFAULT 'Nocoiner',
    badges_earned       INTEGER NOT NULL DEFAULT 0,
    current_streak      INTEGER NOT NULL DEFAULT 0,     -- consecutive weeks
    longest_streak      INTEGER NOT NULL DEFAULT 0,
    streak_start_date   DATE,
    last_active_week    VARCHAR(10),                      -- ISO week: "2026-W08"
    total_shares        BIGINT NOT NULL DEFAULT 0,
    best_difficulty     DOUBLE PRECISION NOT NULL DEFAULT 0,
    blocks_found        INTEGER NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 1.5 Streak Calendar Table

```sql
CREATE TABLE streak_calendar (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_iso    VARCHAR(10) NOT NULL,               -- "2026-W08"
    week_start  DATE NOT NULL,                      -- Monday of that week
    share_count INTEGER NOT NULL DEFAULT 0,
    best_diff   DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT false,     -- had at least 1 share this week

    UNIQUE(user_id, week_iso)
);

CREATE INDEX idx_streak_cal_user ON streak_calendar(user_id);
CREATE INDEX idx_streak_cal_week ON streak_calendar(week_start);
```

#### 1.6 Badge Stats Table

```sql
CREATE TABLE badge_stats (
    badge_id        INTEGER PRIMARY KEY REFERENCES badge_definitions(id),
    total_earned    INTEGER NOT NULL DEFAULT 0,
    percentage      DECIMAL(5,2) NOT NULL DEFAULT 0,    -- % of all users who have it
    last_earned_at  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Part 2: Badge Seed Data

Create a seed script that inserts exactly these 20 badge definitions. The slugs, names, categories, rarities, and XP rewards MUST match `dashboard/src/mocks/badges.ts` exactly.

```python
BADGE_SEED_DATA = [
    # Mining Milestones
    {"slug": "first_share",     "name": "First Hash",       "category": "mining",      "rarity": "common",    "xp_reward": 50,  "trigger_type": "share_count",  "trigger_config": {"threshold": 1}},
    {"slug": "shares_1k",       "name": "Hash Thousand",    "category": "mining",      "rarity": "common",    "xp_reward": 100, "trigger_type": "share_count",  "trigger_config": {"threshold": 1000}},
    {"slug": "shares_1m",       "name": "Megahash",         "category": "mining",      "rarity": "rare",      "xp_reward": 200, "trigger_type": "share_count",  "trigger_config": {"threshold": 1000000}},
    {"slug": "block_finder",    "name": "Block Finder",     "category": "mining",      "rarity": "legendary", "xp_reward": 500, "trigger_type": "block_found",  "trigger_config": {"required": True}},

    # Difficulty Records
    {"slug": "diff_1e6",        "name": "Million Club",     "category": "mining",      "rarity": "common",    "xp_reward": 50,  "trigger_type": "best_diff",    "trigger_config": {"threshold": 1_000_000}},
    {"slug": "diff_1e9",        "name": "Billion Club",     "category": "mining",      "rarity": "rare",      "xp_reward": 100, "trigger_type": "best_diff",    "trigger_config": {"threshold": 1_000_000_000}},
    {"slug": "diff_1e12",       "name": "Trillion Club",    "category": "mining",      "rarity": "epic",      "xp_reward": 200, "trigger_type": "best_diff",    "trigger_config": {"threshold": 1_000_000_000_000}},
    {"slug": "weekly_diff_champion", "name": "Diff Champion", "category": "mining",    "rarity": "epic",      "xp_reward": 300, "trigger_type": "event",        "trigger_config": {"event": "weekly_diff_champion"}},

    # Streaks
    {"slug": "streak_4",        "name": "Month Strong",     "category": "streak",      "rarity": "common",    "xp_reward": 100, "trigger_type": "streak",       "trigger_config": {"threshold": 4}},
    {"slug": "streak_12",       "name": "Quarter Master",   "category": "streak",      "rarity": "rare",      "xp_reward": 200, "trigger_type": "streak",       "trigger_config": {"threshold": 12}},
    {"slug": "streak_52",       "name": "Year of Mining",   "category": "streak",      "rarity": "legendary", "xp_reward": 500, "trigger_type": "streak",       "trigger_config": {"threshold": 52}},

    # Node Operator
    {"slug": "node_runner",     "name": "Node Runner",      "category": "node",        "rarity": "rare",      "xp_reward": 150, "trigger_type": "event",        "trigger_config": {"event": "node_verified_full"}},
    {"slug": "node_pruned",     "name": "Pruned but Proud", "category": "node",        "rarity": "common",    "xp_reward": 100, "trigger_type": "event",        "trigger_config": {"event": "node_verified_pruned"}},
    {"slug": "node_archival",   "name": "Archival Node",    "category": "node",        "rarity": "epic",      "xp_reward": 250, "trigger_type": "event",        "trigger_config": {"event": "node_verified_archival"}},

    # Competition
    {"slug": "world_cup_participant", "name": "World Cup Miner",  "category": "competition", "rarity": "rare",    "xp_reward": 200, "trigger_type": "event", "trigger_config": {"event": "world_cup_participate"}},
    {"slug": "world_cup_winner",      "name": "World Champion",   "category": "competition", "rarity": "legendary","xp_reward": 500, "trigger_type": "event", "trigger_config": {"event": "world_cup_win"}},

    # Social / Education
    {"slug": "orange_piller",   "name": "Orange Piller",    "category": "social",      "rarity": "rare",      "xp_reward": 200, "trigger_type": "event",        "trigger_config": {"event": "gift_bitaxe"}},
    {"slug": "rabbit_hole_complete", "name": "Down the Rabbit Hole", "category": "social", "rarity": "common", "xp_reward": 150, "trigger_type": "event",       "trigger_config": {"event": "track_complete"}},
    {"slug": "coop_founder",    "name": "Cooperative Founder", "category": "social",   "rarity": "rare",      "xp_reward": 150, "trigger_type": "event",        "trigger_config": {"event": "coop_created"}},
    {"slug": "coop_block",      "name": "Team Block",       "category": "social",      "rarity": "legendary", "xp_reward": 500, "trigger_type": "event",        "trigger_config": {"event": "coop_block_found"}},
]
```

### Part 3: Level Computation

The level computation function MUST produce identical results to the frontend's `getLevelInfo()` in `dashboard/src/stores/userStore.ts`. Here are the exact thresholds:

```python
LEVEL_THRESHOLDS = [
    {"level": 1,  "title": "Nocoiner",             "xp_required": 0,       "cumulative": 0},
    {"level": 2,  "title": "Curious Cat",           "xp_required": 100,     "cumulative": 100},
    {"level": 3,  "title": "Hash Pupil",            "xp_required": 500,     "cumulative": 600},
    {"level": 4,  "title": "Solo Miner",            "xp_required": 1000,    "cumulative": 1600},
    {"level": 5,  "title": "Difficulty Hunter",     "xp_required": 2500,    "cumulative": 4100},
    {"level": 6,  "title": "Share Collector",       "xp_required": 3000,    "cumulative": 7100},
    {"level": 7,  "title": "Hash Veteran",          "xp_required": 3500,    "cumulative": 10600},
    {"level": 8,  "title": "Block Chaser",          "xp_required": 4000,    "cumulative": 14600},
    {"level": 9,  "title": "Nonce Grinder",         "xp_required": 5000,    "cumulative": 19600},
    {"level": 10, "title": "Hashrate Warrior",      "xp_required": 10000,   "cumulative": 29600},
    {"level": 15, "title": "Diff Hunter",           "xp_required": 25000,   "cumulative": 79600},
    {"level": 20, "title": "Mining Veteran",        "xp_required": 50000,   "cumulative": 179600},
    {"level": 25, "title": "Satoshi's Apprentice",  "xp_required": 100000,  "cumulative": 429600},
    {"level": 30, "title": "Cypherpunk",            "xp_required": 250000,  "cumulative": 929600},
    {"level": 50, "title": "Timechain Guardian",    "xp_required": 1000000, "cumulative": 4929600},
]


def compute_level(total_xp: int) -> dict:
    """Compute level info from total XP. Must match frontend getLevelInfo() exactly."""
    current = LEVEL_THRESHOLDS[0]
    next_level = LEVEL_THRESHOLDS[1]

    for i in range(len(LEVEL_THRESHOLDS) - 1):
        if total_xp >= LEVEL_THRESHOLDS[i]["cumulative"]:
            current = LEVEL_THRESHOLDS[i]
            next_level = LEVEL_THRESHOLDS[i + 1]

    xp_into_level = total_xp - current["cumulative"]
    xp_for_level = next_level["cumulative"] - current["cumulative"]

    return {
        "level": current["level"],
        "title": current["title"],
        "xp_into_level": xp_into_level,
        "xp_for_level": xp_for_level,
        "next_level": next_level["level"],
        "next_title": next_level["title"],
    }
```

### Part 4: Badge Trigger Engine (arq Worker)

Create an arq worker that consumes mining events from Redis Streams and evaluates badge triggers.

#### 4.1 Stream Consumer

```python
# backend/app/workers/gamification_worker.py

import redis.asyncio as aioredis
from arq import create_pool
from app.gamification.trigger_engine import TriggerEngine

STREAMS = {
    "mining:share_submitted": "gamification-group",
    "mining:share_best_diff": "gamification-group",
    "mining:block_found": "gamification-group",
    "mining:miner_connected": "gamification-group",
}

async def process_mining_event(ctx, stream: str, event_id: str, data: dict):
    """Process a single mining event through the badge trigger engine."""
    engine: TriggerEngine = ctx["trigger_engine"]
    await engine.evaluate(stream, event_id, data)


async def stream_consumer(ctx):
    """
    Long-running task: read from Redis Streams in a consumer group.
    Uses XREADGROUP with BLOCK for efficient waiting.
    """
    redis: aioredis.Redis = ctx["redis"]

    # Ensure consumer groups exist
    for stream, group in STREAMS.items():
        try:
            await redis.xgroup_create(stream, group, id="0", mkstream=True)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    consumer_name = f"gamification-{ctx['worker_id']}"

    while True:
        results = await redis.xreadgroup(
            groupname="gamification-group",
            consumername=consumer_name,
            streams=STREAMS,
            count=100,
            block=5000,
        )

        for stream_name, messages in results:
            for msg_id, data in messages:
                try:
                    await process_mining_event(ctx, stream_name, msg_id, data)
                    await redis.xack(stream_name, "gamification-group", msg_id)
                except Exception as e:
                    logger.error(f"Failed to process {msg_id} from {stream_name}: {e}")
                    # Will be retried on next XREADGROUP with pending entries
```

#### 4.2 Trigger Engine

```python
# backend/app/gamification/trigger_engine.py

class TriggerEngine:
    """Evaluates badge triggers for mining events."""

    async def evaluate(self, stream: str, event_id: str, data: dict) -> list[str]:
        """
        Evaluate all applicable triggers for an event.
        Returns list of badge slugs awarded (may be empty).
        """
        user = await self._resolve_user(data)
        if not user:
            return []

        awarded = []

        # Update denormalized counters first
        await self._update_counters(user, stream, data)

        # Evaluate triggers based on event type
        if stream == "mining:share_submitted":
            awarded += await self._check_share_count_triggers(user)
        elif stream == "mining:share_best_diff":
            awarded += await self._check_best_diff_triggers(user, data)
        elif stream == "mining:block_found":
            awarded += await self._check_block_found_triggers(user, data)

        # For each awarded badge, grant XP
        for badge_slug in awarded:
            await self._grant_badge_xp(user, badge_slug, event_id)

        return awarded
```

#### 4.3 Five Trigger Types

Implement these 5 trigger evaluation functions:

| Trigger Type | Function | Logic |
|---|---|---|
| `share_count` | `_check_share_count_triggers(user)` | Compare `user_gamification.total_shares` against thresholds [1, 1000, 1000000]. Award if threshold crossed AND badge not already earned. |
| `best_diff` | `_check_best_diff_triggers(user, data)` | Compare `data["share_diff"]` against thresholds [1e6, 1e9, 1e12]. Award if threshold crossed AND badge not already earned. |
| `streak` | `_check_streak_triggers(user)` | Compare `user_gamification.current_streak` against thresholds [4, 12, 52]. Called by the weekly streak checker, not by share events. |
| `block_found` | `_check_block_found_triggers(user, data)` | If `block_found` event, award `block_finder` badge if not already earned. |
| `event` | `_check_event_triggers(user, event_type)` | Generic event-based triggers (world_cup_participate, coop_created, track_complete, etc.). Called by the respective feature APIs when the event occurs. |

Every trigger check MUST:
1. Query `user_badges` to check if badge already earned (prevent duplicates)
2. Use a database transaction for the badge insert + XP ledger insert
3. Use the `idempotency_key` on `xp_ledger` (format: `badge:{badge_slug}:{user_id}`) to prevent duplicate XP grants
4. Update `user_gamification` denormalized counters atomically
5. Emit a WebSocket notification to the user (via Redis pub/sub to the WS handler from Phase 3)

### Part 5: XP Grant System

```python
# backend/app/gamification/xp_service.py

async def grant_xp(
    db: AsyncSession,
    user_id: int,
    amount: int,
    source: str,            # "badge", "share", "personal_best", "lesson", "track", "streak", "competition"
    source_id: str,         # badge slug, lesson id, etc.
    description: str,
    idempotency_key: str,
) -> bool:
    """
    Grant XP to a user. Returns True if granted, False if duplicate (idempotent).

    After granting:
    1. Insert into xp_ledger
    2. Update user_gamification.total_xp
    3. Recompute level from total_xp
    4. If level changed, emit level_up notification
    """
    # Check idempotency
    existing = await db.execute(
        select(XPLedger).where(XPLedger.idempotency_key == idempotency_key)
    )
    if existing.scalar_one_or_none():
        return False  # Already granted

    # Insert ledger entry
    entry = XPLedger(
        user_id=user_id,
        amount=amount,
        source=source,
        source_id=source_id,
        description=description,
        idempotency_key=idempotency_key,
    )
    db.add(entry)

    # Update denormalized total
    gamification = await get_or_create_gamification(db, user_id)
    old_level = gamification.level
    gamification.total_xp += amount

    # Recompute level
    level_info = compute_level(gamification.total_xp)
    gamification.level = level_info["level"]
    gamification.level_title = level_info["title"]

    await db.flush()

    # Check for level up
    if gamification.level > old_level:
        await emit_level_up_notification(user_id, old_level, gamification.level, level_info["title"])

    return True
```

### Part 6: Streak System

#### 6.1 Week Boundaries

A "mining week" is defined as:
- **Start:** Monday 00:00:00 UTC
- **End:** Sunday 23:59:59.999999 UTC

A user is "active" for a week if they have submitted at least 1 valid share during that week.

#### 6.2 Streak Calendar Update

On every `share_submitted` event, update the user's streak calendar:

```python
async def update_streak_calendar(db: AsyncSession, user_id: int, share_time: datetime):
    """Update the streak calendar when a share is submitted."""
    week_iso = share_time.strftime("%G-W%V")  # ISO week format
    week_start = get_monday(share_time)        # Monday of this week

    # Upsert streak_calendar entry
    stmt = insert(StreakCalendar).values(
        user_id=user_id,
        week_iso=week_iso,
        week_start=week_start,
        share_count=1,
        is_active=True,
    ).on_conflict_do_update(
        constraint="streak_calendar_user_id_week_iso_key",
        set_={
            "share_count": StreakCalendar.share_count + 1,
            "is_active": True,
        }
    )
    await db.execute(stmt)
```

#### 6.3 Weekly Streak Checker (Monday 00:00 UTC)

Create a scheduled arq task that runs every Monday at 00:00 UTC:

```python
async def check_streaks(ctx):
    """
    Weekly streak evaluation. Runs Monday 00:00 UTC.

    For each user with an active streak:
    1. Check if they were active last week (week that just ended: Sun 23:59:59)
    2. If yes: increment current_streak, check streak badges
    3. If no: reset current_streak to 0, preserve longest_streak
    """
    db: AsyncSession = ctx["db"]
    last_week_iso = get_last_week_iso()  # The week that just ended

    # Get all users with gamification records
    users = await db.execute(
        select(UserGamification).where(UserGamification.current_streak > 0)
    )

    for gam in users.scalars():
        was_active = await db.execute(
            select(StreakCalendar).where(
                StreakCalendar.user_id == gam.user_id,
                StreakCalendar.week_iso == last_week_iso,
                StreakCalendar.is_active == True,
            )
        )

        if was_active.scalar_one_or_none():
            # Streak continues
            gam.current_streak += 1
            gam.longest_streak = max(gam.longest_streak, gam.current_streak)
            gam.last_active_week = last_week_iso

            # Check streak badges
            await check_streak_triggers(db, gam.user_id, gam.current_streak)

            # Grant streak XP (10 XP per week maintained)
            await grant_xp(
                db, gam.user_id, 10, "streak",
                f"streak-{last_week_iso}",
                f"Mining streak week {gam.current_streak}",
                f"streak:{gam.user_id}:{last_week_iso}",
            )
        else:
            # Streak broken
            if gam.current_streak > 0:
                await emit_streak_broken_notification(gam.user_id, gam.current_streak)
            gam.current_streak = 0

    # Also check for NEW streaks: users who were active last week but had streak=0
    new_active = await db.execute(
        select(StreakCalendar).where(
            StreakCalendar.week_iso == last_week_iso,
            StreakCalendar.is_active == True,
        )
    )
    for cal in new_active.scalars():
        gam = await get_or_create_gamification(db, cal.user_id)
        if gam.current_streak == 0:
            gam.current_streak = 1
            gam.streak_start_date = cal.week_start
            gam.last_active_week = last_week_iso

    await db.commit()
```

### Part 7: Notification Integration

When a badge is earned, a level up occurs, or a streak milestone is reached, emit a notification via the existing WebSocket infrastructure from Phase 3:

```python
async def emit_badge_earned_notification(user_id: int, badge: BadgeDefinition, metadata: dict):
    """Emit a real-time notification when a badge is earned."""
    notification = {
        "type": "gamification",
        "subtype": "badge_earned",
        "title": f'Badge Earned: "{badge.name}"',
        "description": f"+{badge.xp_reward} XP — {badge.description}",
        "timestamp": datetime.utcnow().isoformat(),
        "actionUrl": "/profile/badges",
        "actionLabel": "View Badge",
    }

    # Persist to notifications table
    await create_notification(user_id, notification)

    # Push via WebSocket (Redis pub/sub channel from Phase 3)
    await redis.publish(f"ws:user:{user_id}", json.dumps({
        "event": "badge_earned",
        "data": {
            "badge_slug": badge.slug,
            "badge_name": badge.name,
            "rarity": badge.rarity,
            "xp_reward": badge.xp_reward,
            "notification": notification,
        }
    }))
```

### Part 8: API Endpoints

Create a new router at `backend/app/api/v1/gamification.py` with these 9 endpoints:

| Method | Path | Description | Response Shape |
|---|---|---|---|
| GET | `/badges` | All badge definitions | `{badges: [{slug, name, description, category, rarity, xp_reward, total_earned, percentage}]}` |
| GET | `/badges/{slug}` | Single badge detail | `{badge: {slug, name, description, category, rarity, xp_reward, total_earned, percentage, recent_earners: [{user, earned_at}]}}` |
| GET | `/users/me/badges` | Current user's earned badges | `{earned: [{slug, earned_at, metadata}], total_available: 20, total_earned: N}` |
| GET | `/users/me/xp` | Current user's XP and level | `{total_xp, level, level_title, xp_into_level, xp_for_level, next_level, next_title}` |
| GET | `/users/me/xp/history` | XP ledger history (paginated) | `{entries: [{amount, source, source_id, description, created_at}], total, page, per_page}` |
| GET | `/users/me/streak` | Current streak info | `{current_streak, longest_streak, streak_start_date, last_active_week, is_active_this_week}` |
| GET | `/users/me/streak/calendar` | Weekly streak calendar | `{weeks: [{week_iso, week_start, share_count, best_diff, is_active}]}` |
| GET | `/users/me/gamification` | Full gamification summary (O(1)) | `{xp: {...}, streak: {...}, badges: {earned: N, total: 20}, stats: {total_shares, best_diff, blocks_found}}` |
| GET | `/levels` | All level definitions | `{levels: [{level, title, xp_required, cumulative}]}` |

All endpoints except `/badges`, `/badges/{slug}`, and `/levels` require authentication (JWT from Phase 1).

The `/users/me/gamification` endpoint reads ONLY from the `user_gamification` denormalized table for O(1) performance. It does NOT join against `xp_ledger` or `user_badges`.

#### Pydantic Response Models

```python
class BadgeDefinitionResponse(BaseModel):
    slug: str
    name: str
    description: str
    category: str  # mining, streak, competition, social, node
    rarity: str    # common, rare, epic, legendary
    xp_reward: int
    total_earned: int
    percentage: float

class EarnedBadgeResponse(BaseModel):
    slug: str
    earned_at: datetime
    metadata: dict = {}

class XPResponse(BaseModel):
    total_xp: int
    level: int
    level_title: str
    xp_into_level: int
    xp_for_level: int
    next_level: int
    next_title: str

class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    streak_start_date: date | None
    last_active_week: str | None
    is_active_this_week: bool

class GamificationSummaryResponse(BaseModel):
    xp: XPResponse
    streak: StreakResponse
    badges: dict  # {earned: int, total: int}
    stats: dict   # {total_shares: int, best_difficulty: float, blocks_found: int}
```

### Part 9: Denormalization Update Pipeline

The `user_gamification` table is updated incrementally on every relevant event:

| Event | Fields Updated |
|---|---|
| `share_submitted` | `total_shares += 1`, `updated_at` |
| `share_best_diff` | `best_difficulty = max(current, new)`, `updated_at` |
| `block_found` | `blocks_found += 1`, `updated_at` |
| Badge earned | `badges_earned += 1`, `total_xp += reward`, `level`, `level_title`, `updated_at` |
| XP grant (any source) | `total_xp += amount`, `level`, `level_title`, `updated_at` |
| Streak check (weekly) | `current_streak`, `longest_streak`, `streak_start_date`, `last_active_week`, `updated_at` |

Use `UPDATE ... SET` with the appropriate increments. Use database transactions to ensure consistency between the ledger insert and the denormalized update.

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**. Every test listed below must exist and pass before Phase 4 is considered complete.

### Unit Tests

```python
# tests/unit/test_level_computation.py

class TestLevelComputation:
    """Level computation MUST match frontend exactly."""

    def test_level_1_at_zero_xp(self):
        result = compute_level(0)
        assert result["level"] == 1
        assert result["title"] == "Nocoiner"

    def test_level_2_at_100_xp(self):
        result = compute_level(100)
        assert result["level"] == 2
        assert result["title"] == "Curious Cat"

    def test_level_boundary_99_xp(self):
        """99 XP is still level 1."""
        result = compute_level(99)
        assert result["level"] == 1

    def test_level_10_at_29600_xp(self):
        result = compute_level(29600)
        assert result["level"] == 10
        assert result["title"] == "Hashrate Warrior"

    def test_level_50_at_4929600_xp(self):
        result = compute_level(4929600)
        assert result["level"] == 50
        assert result["title"] == "Timechain Guardian"

    def test_xp_into_level_calculation(self):
        result = compute_level(150)  # 50 XP into level 2
        assert result["xp_into_level"] == 50
        assert result["xp_for_level"] == 500  # 600 - 100

    def test_max_level_exceeded(self):
        """XP beyond max level stays at max level."""
        result = compute_level(10_000_000)
        assert result["level"] == 50

    @pytest.mark.parametrize("xp,expected_level", [
        (0, 1), (100, 2), (600, 3), (1600, 4), (4100, 5),
        (7100, 6), (10600, 7), (14600, 8), (19600, 9), (29600, 10),
        (79600, 15), (179600, 20), (429600, 25), (929600, 30), (4929600, 50),
    ])
    def test_all_level_boundaries(self, xp, expected_level):
        """Verify every level boundary matches the frontend thresholds."""
        result = compute_level(xp)
        assert result["level"] == expected_level


# tests/unit/test_trigger_engine.py

class TestShareCountTrigger:
    """Test share_count trigger type."""

    async def test_first_share_awards_badge(self, trigger_engine, mock_user):
        result = await trigger_engine._check_share_count_triggers(mock_user)
        assert "first_share" in result

    async def test_duplicate_badge_not_awarded(self, trigger_engine, user_with_first_share):
        result = await trigger_engine._check_share_count_triggers(user_with_first_share)
        assert "first_share" not in result

    async def test_1k_shares_triggers(self, trigger_engine, user_with_1000_shares):
        result = await trigger_engine._check_share_count_triggers(user_with_1000_shares)
        assert "shares_1k" in result


class TestBestDiffTrigger:
    """Test best_diff trigger type."""

    async def test_diff_1e6_awarded(self, trigger_engine, mock_user):
        data = {"share_diff": 1_500_000}
        result = await trigger_engine._check_best_diff_triggers(mock_user, data)
        assert "diff_1e6" in result

    async def test_diff_below_threshold_not_awarded(self, trigger_engine, mock_user):
        data = {"share_diff": 500_000}
        result = await trigger_engine._check_best_diff_triggers(mock_user, data)
        assert "diff_1e6" not in result


class TestBlockFoundTrigger:
    """Test block_found trigger type."""

    async def test_block_found_awards_badge(self, trigger_engine, mock_user):
        data = {"height": 879412, "reward": 3.125}
        result = await trigger_engine._check_block_found_triggers(mock_user, data)
        assert "block_finder" in result


class TestStreakTrigger:
    """Test streak trigger type."""

    async def test_4_week_streak_awards_badge(self, trigger_engine, user_with_4_week_streak):
        result = await trigger_engine._check_streak_triggers(
            user_with_4_week_streak.user_id, 4
        )
        assert "streak_4" in result

    async def test_3_week_streak_no_badge(self, trigger_engine, user_with_3_week_streak):
        result = await trigger_engine._check_streak_triggers(
            user_with_3_week_streak.user_id, 3
        )
        assert "streak_4" not in result


# tests/unit/test_streak_boundaries.py

class TestStreakBoundaries:
    """Test week boundary calculations."""

    def test_monday_00_00_is_new_week(self):
        """Monday 00:00:00 UTC belongs to the new week."""
        dt = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)  # Monday
        assert get_week_iso(dt) == "2026-W09"

    def test_sunday_23_59_is_same_week(self):
        """Sunday 23:59:59 UTC belongs to the same week as Monday."""
        dt = datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc)  # Sunday
        assert get_week_iso(dt) == "2026-W09"

    def test_sunday_to_monday_boundary(self):
        """Sun 23:59:59 and Mon 00:00:00 are different weeks."""
        sun = datetime(2026, 2, 22, 23, 59, 59, tzinfo=timezone.utc)
        mon = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        assert get_week_iso(sun) != get_week_iso(mon)

    def test_year_boundary_week(self):
        """Verify ISO week at year boundary (Dec 31 can be W01 of next year)."""
        dt = datetime(2025, 12, 29, 12, 0, 0, tzinfo=timezone.utc)  # Monday
        assert get_week_iso(dt) == "2026-W01"
```

### Integration Tests

```python
# tests/integration/test_gamification_pipeline.py

class TestFullPipeline:
    """Integration: event -> trigger -> badge -> XP -> notification."""

    async def test_share_event_triggers_first_share_badge(self, client, redis, db):
        """Submit a share event, verify badge + XP + notification."""
        # 1. Publish a share_submitted event to Redis Stream
        await redis.xadd("mining:share_submitted", {
            "user": "bc1q...",
            "worker": "bitaxe-1",
            "diff": "1000",
            "sdiff": "512",
            "accepted": "true",
            "source": "hosted",
        })

        # 2. Wait for worker to process (max 10s)
        await asyncio.sleep(2)

        # 3. Verify badge was awarded
        response = await client.get("/api/v1/users/me/badges")
        badges = response.json()["earned"]
        assert any(b["slug"] == "first_share" for b in badges)

        # 4. Verify XP was granted
        response = await client.get("/api/v1/users/me/xp")
        assert response.json()["total_xp"] >= 50

        # 5. Verify idempotency: process same event again
        await redis.xadd("mining:share_submitted", {
            "user": "bc1q...",
            "worker": "bitaxe-1",
            "diff": "1000",
            "sdiff": "512",
            "accepted": "true",
            "source": "hosted",
        })
        await asyncio.sleep(2)

        # XP should NOT have doubled
        response = await client.get("/api/v1/users/me/xp")
        assert response.json()["total_xp"] == 50  # Still 50, not 100

    async def test_best_diff_event_triggers_difficulty_badges(self, client, redis, db):
        """Best diff event should trigger appropriate difficulty badges."""
        await redis.xadd("mining:share_best_diff", {
            "user": "bc1q...",
            "worker": "bitaxe-1",
            "diff": "1500000000",  # 1.5 billion
            "period": "alltime",
            "source": "hosted",
        })
        await asyncio.sleep(2)

        response = await client.get("/api/v1/users/me/badges")
        slugs = [b["slug"] for b in response.json()["earned"]]
        assert "diff_1e6" in slugs   # 1M badge
        assert "diff_1e9" in slugs   # 1B badge
        assert "diff_1e12" not in slugs  # 1T badge NOT earned (only 1.5B)

    async def test_block_found_triggers_legendary_badge(self, client, redis, db):
        """Block found should award the legendary block_finder badge."""
        await redis.xadd("mining:block_found", {
            "user": "bc1q...",
            "worker": "bitaxe-1",
            "height": "879412",
            "hash": "0000...",
            "diff": "100847293444000",
            "reward": "312500000",
            "source": "hosted",
        })
        await asyncio.sleep(2)

        response = await client.get("/api/v1/users/me/badges")
        slugs = [b["slug"] for b in response.json()["earned"]]
        assert "block_finder" in slugs

        # Verify 500 XP was granted
        response = await client.get("/api/v1/users/me/xp")
        assert response.json()["total_xp"] >= 500
```

### Test Coverage Target: 90%+

Run `pytest --cov=app.gamification --cov=app.workers.gamification_worker --cov-report=term-missing` and verify coverage is at least 90%.

---

## Rules

1. **Level thresholds are sacred.** Copy the exact values from `dashboard/src/stores/userStore.ts`. If a user has 29,599 XP, they are level 9. At 29,600 XP, they are level 10. No rounding, no approximation.
2. **Badge slugs are sacred.** The 20 slugs in `dashboard/src/mocks/badges.ts` are the contract between frontend and backend. Do not rename, add, or remove any.
3. **Idempotency everywhere.** Use `idempotency_key` on `xp_ledger` for all XP grants. Use `UNIQUE(user_id, badge_id)` constraint to prevent duplicate badges. Test that processing the same event twice produces the same result.
4. **Denormalize aggressively.** The `user_gamification` table exists so that the `/users/me/gamification` endpoint is O(1). Do not make it join against other tables at query time.
5. **UTC everywhere.** All `TIMESTAMPTZ` columns, all streak week boundaries, all cron schedules use UTC. No timezone conversions.
6. **arq for background work.** Use arq workers consuming from Redis Streams. Do not introduce Celery, Dramatiq, or any other task queue.
7. **WebSocket notifications.** When a badge is earned or level up occurs, push a notification through the existing WebSocket infrastructure from Phase 3. The notification payload must match the `NotificationItem` interface from `dashboard/src/mocks/notifications.ts`.
8. **Transaction safety.** Badge award + XP grant + denormalized update must happen in a single database transaction. If any step fails, the entire operation rolls back.
9. **Do not touch `dashboard/`.** The frontend is complete. Your job is to make the backend return data that matches what the frontend expects.
10. **Seed data on startup.** Badge definitions should be seeded automatically on application startup (or via a CLI command). Use upsert logic so the seed is idempotent.
11. **Paginate XP history.** The `/users/me/xp/history` endpoint must support pagination (page, per_page) with sensible defaults (page=1, per_page=50).
12. **Streak warning notification.** On Sunday at 18:00 UTC, if a user has an active streak but has NOT been active this week, emit a "streak expiring" notification.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `backend/app/gamification/__init__.py` |
| CREATE | `backend/app/gamification/models.py` |
| CREATE | `backend/app/gamification/schemas.py` |
| CREATE | `backend/app/gamification/trigger_engine.py` |
| CREATE | `backend/app/gamification/xp_service.py` |
| CREATE | `backend/app/gamification/streak_service.py` |
| CREATE | `backend/app/gamification/badge_service.py` |
| CREATE | `backend/app/gamification/level_thresholds.py` |
| CREATE | `backend/app/gamification/seed.py` |
| CREATE | `backend/app/api/v1/gamification.py` |
| CREATE | `backend/app/workers/gamification_worker.py` |
| CREATE | `backend/alembic/versions/004_gamification_tables.py` |
| CREATE | `tests/unit/test_level_computation.py` |
| CREATE | `tests/unit/test_trigger_engine.py` |
| CREATE | `tests/unit/test_streak_boundaries.py` |
| CREATE | `tests/unit/test_xp_service.py` |
| CREATE | `tests/unit/test_badge_service.py` |
| CREATE | `tests/integration/test_gamification_pipeline.py` |
| CREATE | `tests/integration/test_gamification_api.py` |
| EDIT | `backend/app/api/v1/__init__.py` — register gamification router |
| EDIT | `backend/app/main.py` — add gamification router, seed badges on startup |
| EDIT | `backend/app/workers/__init__.py` — register gamification worker |

---

## Definition of Done

1. **All 20 badge definitions are seeded** in the `badge_definitions` table with correct slugs, rarities, categories, and XP rewards matching `dashboard/src/mocks/badges.ts`.
2. **Level computation matches frontend exactly.** `compute_level(29600)` returns level 10 / "Hashrate Warrior". `compute_level(4929600)` returns level 50 / "Timechain Guardian". All 15 boundary values tested.
3. **share_count triggers work.** Submitting 1 share awards `first_share` badge (50 XP). Submitting 1000 shares awards `shares_1k` (100 XP). Submitting 1,000,000 shares awards `shares_1m` (200 XP).
4. **best_diff triggers work.** A share with difficulty >= 1e6 awards `diff_1e6`. A share >= 1e9 awards `diff_1e9`. A share >= 1e12 awards `diff_1e12`.
5. **block_found trigger works.** A `block_found` event awards the `block_finder` legendary badge (500 XP).
6. **Streak system works.** Mining every week for 4 weeks awards `streak_4` (100 XP). 12 weeks awards `streak_12` (200 XP). 52 weeks awards `streak_52` (500 XP).
7. **XP grants are idempotent.** Processing the same event twice does not double the XP. The `idempotency_key` constraint prevents duplicates.
8. **Badge awards are idempotent.** The `UNIQUE(user_id, badge_id)` constraint prevents duplicate badges.
9. **Denormalized gamification table is correct.** `GET /users/me/gamification` returns accurate totals without any joins.
10. **WebSocket notifications fire.** When a badge is earned, a notification is pushed to the user via WebSocket. When a level up occurs, a level_up notification is pushed.
11. **All 9 API endpoints return correct responses.** Each endpoint returns the documented response shape with correct data types.
12. **Streak week boundaries are correct.** Monday 00:00 UTC is the start of a new week. Sunday 23:59:59 UTC is the end of the current week.
13. **Weekly streak checker runs on Monday.** The arq scheduled task evaluates all streaks at Monday 00:00 UTC.
14. **Test coverage is 90%+** for all gamification modules.
15. **All tests pass.** `pytest tests/unit/test_level_computation.py tests/unit/test_trigger_engine.py tests/unit/test_streak_boundaries.py tests/integration/test_gamification_pipeline.py` all pass.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Database migration** — Create the Alembic migration with all 6 tables. Run the migration. Verify tables exist with correct columns and constraints.

2. **Level thresholds module** — Create `level_thresholds.py` with the `LEVEL_THRESHOLDS` array and `compute_level()` function. Write and pass all level computation unit tests FIRST. This is the foundation.

3. **Badge seed data** — Create the seed script with all 20 badges. Run it. Verify all 20 badges are in the `badge_definitions` table with correct values.

4. **XP service** — Implement `grant_xp()` with idempotency. Write unit tests for XP granting, duplicate prevention, and level-up detection.

5. **Badge service** — Implement badge award function with duplicate prevention. Wire it to the XP service so awarding a badge also grants XP.

6. **Trigger engine** — Implement the 5 trigger types (`share_count`, `best_diff`, `streak`, `block_found`, `event`). Write unit tests for each trigger type.

7. **Streak service** — Implement streak calendar updates and the weekly streak checker. Write boundary tests (Sun->Mon UTC transition, year boundary).

8. **arq worker** — Create the Redis Stream consumer that feeds events to the trigger engine. Test with manually published events.

9. **API endpoints** — Create all 9 endpoints with Pydantic response models. Write integration tests for each endpoint.

10. **Notification integration** — Wire badge/level/streak events to the WebSocket notification system from Phase 3. Test end-to-end.

11. **Integration tests** — Write the full pipeline test (event -> trigger -> badge -> XP -> notification). Run the complete test suite.

12. **Coverage check** — Run `pytest --cov` and verify 90%+ coverage. Fill in any gaps.

**Critical: Get step 2 (level computation) passing all tests before writing anything else. If levels are wrong, everything downstream is wrong.**
