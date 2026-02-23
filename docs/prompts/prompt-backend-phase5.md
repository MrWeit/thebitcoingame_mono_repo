# Prompt: Backend Service — Phase 5 (Games & Lottery)

You are building the games and lottery system for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend API (FastAPI + PostgreSQL + Redis) was built in Phases 0-4: authentication, mining data API, WebSocket events, and the gamification engine (badges, XP, levels, streaks) are all operational. Phase 5 builds the weekly lottery and game data endpoints that power the frontend's 4 game experiences.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/` (do not touch). The backend API lives in `backend/`. The mining engine lives in `services/ckpool/` and the event collector in `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
2. **Do not touch `services/`** — The mining engine and event collector are complete from earlier phases.
3. **Deterministic lottery — ZERO randomness.** The weekly lottery ranks participants by their best difficulty for the week. The miner with the highest best difficulty wins. There is no random number generation, no hash-based seeding, no chance element. This is a pure skill-based ranking derived from actual mining work.
4. **Game data shape MUST match the frontend interface.** The frontend expects a `WeeklyGameData` shape defined in `dashboard/src/hooks/useGameData.ts`. Your API response must match this interface exactly.
5. **Week = Monday 00:00 UTC to Sunday 23:59:59 UTC.** Same week boundaries as Phase 4 streaks. The lottery draw happens Monday 00:01 UTC for the preceding week.
6. **arq for scheduled tasks.** The weekly lottery draw and any periodic aggregations use arq scheduled tasks. No Celery or cron.
7. **XP tiers from Phase 4.** The gamification engine from Phase 4 is used to grant XP for lottery placement. Do not duplicate XP granting logic — call the existing `grant_xp()` function.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Architecture overview, service boundaries, data flow diagrams.
2. `docs/backend-service/roadmap/phase-05-games-lottery.md` — Full Phase 5 specification with lottery algorithm, game data shapes, XP tiers, and API endpoints.
3. `docs/backend-service/roadmap/phase-04-gamification.md` — Phase 4 gamification engine. Phase 5 calls `grant_xp()` for lottery XP awards.
4. `dashboard/src/hooks/useGameData.ts` — The `WeeklyGameData` and `PastWeekResult` interfaces. Your API response MUST match these shapes.
5. `dashboard/src/pages/games/` — The 4 game pages (HammerGame, HorseRace, SlotMachine, ScratchCard) for understanding how each game uses the data.
6. `dashboard/src/mocks/data.ts` — Mock daily diff data shape used by the games.
7. `dashboard/src/stores/userStore.ts` — User profile data shape, used in game responses.

Read ALL of these before writing any code. The `WeeklyGameData` interface is the contract between frontend and backend.

---

## What You Are Building

### Part 1: Database Schema

Create an Alembic migration for the games and lottery tables.

#### 1.1 Lottery Draws Table

```sql
CREATE TABLE lottery_draws (
    id              SERIAL PRIMARY KEY,
    week_iso        VARCHAR(10) UNIQUE NOT NULL,        -- "2026-W08"
    week_start      DATE NOT NULL,                       -- Monday
    week_end        DATE NOT NULL,                       -- Sunday
    total_participants INTEGER NOT NULL DEFAULT 0,
    total_shares    BIGINT NOT NULL DEFAULT 0,
    winning_difficulty DOUBLE PRECISION,                 -- best diff of the week
    winner_user_id  INTEGER REFERENCES users(id),
    status          VARCHAR(16) NOT NULL DEFAULT 'open', -- open, processing, completed
    drawn_at        TIMESTAMPTZ,                         -- when the draw was executed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lottery_draws_status ON lottery_draws(status);
CREATE INDEX idx_lottery_draws_week ON lottery_draws(week_start);
```

#### 1.2 Lottery Results Table

```sql
CREATE TABLE lottery_results (
    id              SERIAL PRIMARY KEY,
    draw_id         INTEGER NOT NULL REFERENCES lottery_draws(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank            INTEGER NOT NULL,                    -- 1 = winner
    best_difficulty DOUBLE PRECISION NOT NULL,
    best_hash       VARCHAR(64),                         -- the hash that achieved best diff
    total_shares    BIGINT NOT NULL DEFAULT 0,
    xp_awarded      INTEGER NOT NULL DEFAULT 0,
    percentile      DECIMAL(5,2) NOT NULL DEFAULT 0,     -- top X%

    UNIQUE(draw_id, user_id),
    UNIQUE(draw_id, rank)
);

CREATE INDEX idx_lottery_results_draw ON lottery_results(draw_id);
CREATE INDEX idx_lottery_results_user ON lottery_results(user_id);
CREATE INDEX idx_lottery_results_rank ON lottery_results(rank);
```

#### 1.3 Game Sessions Table

```sql
CREATE TABLE game_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_type       VARCHAR(32) NOT NULL,                -- hammer, horse_race, slot_machine, scratch_card
    week_iso        VARCHAR(10) NOT NULL,                -- which week's data was used
    played_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB DEFAULT '{}',                  -- game-specific data (score, result, etc.)
    shared          BOOLEAN NOT NULL DEFAULT false        -- did user share on social
);

CREATE INDEX idx_game_sessions_user ON game_sessions(user_id);
CREATE INDEX idx_game_sessions_game ON game_sessions(game_type);
CREATE INDEX idx_game_sessions_week ON game_sessions(week_iso);
```

### Part 2: Weekly Game Data API

The core data structure that powers all 4 games. This MUST match the frontend's `WeeklyGameData` interface from `dashboard/src/hooks/useGameData.ts`.

#### 2.1 Frontend Interface Reference

```typescript
// From dashboard/src/hooks/useGameData.ts
interface WeeklyGameData {
    weekStart: Date;
    weekEnd: Date;
    bestDifficulty: number;
    bestDifficultyTime: Date;
    bestHash: string;
    networkDifficulty: number;
    progressRatio: number;          // bestDifficulty / networkDifficulty
    dailyBestDiffs: Record<string, number>;  // {mon: N, tue: N, ..., sun: N}
    totalShares: number;
    weeklyRank: number;
    percentile: number;             // e.g. 94 = top 6%
    blockFound: boolean;
    blockData?: BlockFoundData;
    userName: string;
}
```

#### 2.2 Backend Response Model

```python
class WeeklyGameDataResponse(BaseModel):
    week_start: datetime
    week_end: datetime
    best_difficulty: float
    best_difficulty_time: datetime | None
    best_hash: str
    network_difficulty: float
    progress_ratio: float
    daily_best_diffs: dict[str, float]  # {"mon": N, "tue": N, ..., "sun": N}
    total_shares: int
    weekly_rank: int
    percentile: float
    block_found: bool
    block_data: BlockFoundDataResponse | None
    user_name: str


class BlockFoundDataResponse(BaseModel):
    height: int
    reward: float
    hash: str
```

#### 2.3 Data Aggregation

The weekly game data is assembled from multiple sources:

| Field | Source | Query |
|---|---|---|
| `best_difficulty` | `weekly_best_diff` table (from event collector) | `SELECT best_difficulty FROM weekly_best_diff WHERE user_id = ? AND week_start = ?` |
| `best_hash` | `shares` table | `SELECT share_hash FROM shares WHERE user_id = ? AND share_diff = best_difficulty LIMIT 1` |
| `network_difficulty` | Bitcoin Core RPC / cached | `getdifficulty()` or Redis cache |
| `daily_best_diffs` | `shares` table aggregation | `SELECT date_trunc('day', time), MAX(share_diff) FROM shares WHERE ... GROUP BY 1` mapped to day names |
| `total_shares` | `shares` table count | `SELECT COUNT(*) FROM shares WHERE user_id = ? AND time BETWEEN week_start AND week_end` |
| `weekly_rank` | `lottery_results` or live computation | Rank by best_difficulty among all users this week |
| `percentile` | Derived from rank | `100 - (rank / total_participants * 100)` |
| `block_found` | `blocks` table | `SELECT EXISTS(SELECT 1 FROM blocks WHERE user_id = ? AND time BETWEEN ...)` |

For the `daily_best_diffs`, map database day-of-week to the frontend's key format:

```python
DAY_KEYS = {
    0: "mon",  # Monday = 0 in Python's weekday()
    1: "tue",
    2: "wed",
    3: "thu",
    4: "fri",
    5: "sat",
    6: "sun",
}
```

### Part 3: Game-Specific Data Mapping

Each game uses the `WeeklyGameData` differently. The backend provides a single unified response — the frontend extracts what it needs.

| Game | Key Data Used | How It's Used |
|---|---|---|
| **Hammer** | `best_difficulty`, `network_difficulty` | `bestDifficulty` on log scale vs `networkDifficulty`. Tower height = `log10(bestDiff) / log10(networkDiff)` |
| **Horse Race** | `daily_best_diffs` | 7 horses, one per day (Mon-Sun). Each horse's position = that day's best difficulty relative to the week's max |
| **Slot Machine** | `best_hash` | Hex characters of `bestHash` are mapped to reel symbols. Leading zeros = jackpot symbols |
| **Scratch Card** | `best_difficulty` | The revealed number is the `bestDifficulty`, scratched away progressively |

The backend does not need separate endpoints per game. The single `WeeklyGameData` response powers all 4 games.

### Part 4: Weekly Lottery System

#### 4.1 Lottery Algorithm (Deterministic, No Randomness)

```python
# backend/app/games/lottery_service.py

async def execute_weekly_draw(db: AsyncSession, week_iso: str) -> LotteryDraw:
    """
    Execute the weekly lottery draw. Deterministic ranking by best difficulty.

    Called by arq scheduled task every Monday at 00:01 UTC.
    """
    week_start, week_end = iso_week_to_dates(week_iso)

    # 1. Get all users who submitted at least 1 share this week
    participants = await db.execute(
        select(
            WeeklyBestDiff.user_id,
            WeeklyBestDiff.best_difficulty,
            func.count(Share.id).label("total_shares"),
        )
        .join(Share, Share.user_id == WeeklyBestDiff.user_id)
        .where(
            WeeklyBestDiff.week_start == week_start,
            Share.time >= week_start,
            Share.time <= week_end,
        )
        .group_by(WeeklyBestDiff.user_id, WeeklyBestDiff.best_difficulty)
        .order_by(WeeklyBestDiff.best_difficulty.desc())
    )

    results = participants.all()
    total_participants = len(results)

    if total_participants == 0:
        # No participants this week
        draw = LotteryDraw(
            week_iso=week_iso,
            week_start=week_start,
            week_end=week_end,
            total_participants=0,
            status="completed",
            drawn_at=datetime.utcnow(),
        )
        db.add(draw)
        await db.commit()
        return draw

    # 2. Create the draw record
    draw = LotteryDraw(
        week_iso=week_iso,
        week_start=week_start,
        week_end=week_end,
        total_participants=total_participants,
        total_shares=sum(r.total_shares for r in results),
        winning_difficulty=results[0].best_difficulty,
        winner_user_id=results[0].user_id,
        status="completed",
        drawn_at=datetime.utcnow(),
    )
    db.add(draw)
    await db.flush()

    # 3. Create result entries with XP tiers
    for rank_idx, row in enumerate(results):
        rank = rank_idx + 1
        percentile = round(100 - (rank / total_participants * 100), 2)
        xp = determine_xp_tier(rank)

        result = LotteryResult(
            draw_id=draw.id,
            user_id=row.user_id,
            rank=rank,
            best_difficulty=row.best_difficulty,
            total_shares=row.total_shares,
            xp_awarded=xp,
            percentile=percentile,
        )
        db.add(result)

        # 4. Grant XP via Phase 4 gamification engine
        if xp > 0:
            await grant_xp(
                db=db,
                user_id=row.user_id,
                amount=xp,
                source="competition",
                source_id=f"lottery-{week_iso}",
                description=f"Weekly lottery #{rank} — {week_iso}",
                idempotency_key=f"lottery:{week_iso}:{row.user_id}",
            )

    await db.commit()

    # 5. Send notifications to top 10 and all participants
    await notify_lottery_results(draw, results[:10])

    return draw
```

#### 4.2 XP Tiers

```python
def determine_xp_tier(rank: int) -> int:
    """Determine XP reward based on lottery rank."""
    if rank <= 10:
        return 100    # Top 10
    elif rank <= 50:
        return 50     # Top 50
    elif rank <= 100:
        return 25     # Top 100
    else:
        return 10     # Participated
```

#### 4.3 Tie-Breaking

When two users have the same best difficulty:

1. **Primary:** Higher best difficulty wins (this is the normal case — ties are extremely rare)
2. **Tiebreaker 1:** The user who achieved their best difficulty FIRST (earlier timestamp) ranks higher
3. **Tiebreaker 2:** Higher total shares for the week

```sql
ORDER BY best_difficulty DESC, best_diff_time ASC, total_shares DESC
```

#### 4.4 Scheduled Draw Task

```python
# backend/app/workers/lottery_worker.py

async def weekly_lottery_draw(ctx):
    """
    Scheduled arq task: runs every Monday at 00:01 UTC.
    Draws the lottery for the week that just ended (Sunday 23:59:59 UTC).
    """
    last_week = get_last_week_iso()  # e.g. "2026-W08"

    # Check if draw already exists (idempotent)
    existing = await db.execute(
        select(LotteryDraw).where(LotteryDraw.week_iso == last_week)
    )
    if existing.scalar_one_or_none():
        logger.info(f"Lottery draw for {last_week} already exists, skipping")
        return

    draw = await execute_weekly_draw(ctx["db"], last_week)
    logger.info(
        f"Lottery draw complete: {last_week}, "
        f"{draw.total_participants} participants, "
        f"winner: {draw.winner_user_id}"
    )


class WorkerSettings:
    cron_jobs = [
        cron(weekly_lottery_draw, weekday=0, hour=0, minute=1),  # Monday 00:01 UTC
    ]
```

### Part 5: API Endpoints

Create a new router at `backend/app/api/v1/games.py` with these 7 endpoints:

| Method | Path | Description | Auth | Response |
|---|---|---|---|---|
| GET | `/games/weekly` | Current week's game data for the user | Yes | `WeeklyGameDataResponse` |
| GET | `/games/history` | Past weeks' game results (paginated) | Yes | `{weeks: [PastWeekResult], total, page}` |
| POST | `/games/play` | Record a game session | Yes | `{session_id, xp_awarded}` |
| GET | `/lottery/current` | Current week's lottery status | Yes | `{week_iso, status, participants, your_rank, your_diff}` |
| GET | `/lottery/results` | Latest completed lottery results | No | `{draw: LotteryDraw, top_10: [LotteryResult], your_result: LotteryResult?}` |
| GET | `/lottery/results/{week}` | Specific week's lottery results | No | `{draw: LotteryDraw, results: [LotteryResult]}` |
| GET | `/lottery/stats` | Lottery statistics | No | `{total_draws, total_participants, average_best_diff, ...}` |

#### 5.1 GET /games/weekly

This is the most important endpoint. It assembles the `WeeklyGameData` from multiple sources.

```python
@router.get("/games/weekly", response_model=WeeklyGameDataResponse)
async def get_weekly_game_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current week's game data for the authenticated user."""
    week_start, week_end = get_current_week_boundaries()
    week_iso = get_current_week_iso()

    # Aggregate from multiple tables
    best_diff_record = await get_weekly_best_diff(db, current_user.id, week_start)
    daily_diffs = await get_daily_best_diffs(db, current_user.id, week_start, week_end)
    total_shares = await get_weekly_share_count(db, current_user.id, week_start, week_end)
    network_diff = await get_network_difficulty()
    rank_info = await get_live_weekly_rank(db, current_user.id, week_start)
    block_data = await get_weekly_block(db, current_user.id, week_start, week_end)

    best_diff = best_diff_record.best_difficulty if best_diff_record else 0
    progress_ratio = best_diff / network_diff if network_diff > 0 else 0

    return WeeklyGameDataResponse(
        week_start=week_start,
        week_end=week_end,
        best_difficulty=best_diff,
        best_difficulty_time=best_diff_record.best_diff_time if best_diff_record else None,
        best_hash=best_diff_record.best_hash if best_diff_record else "",
        network_difficulty=network_diff,
        progress_ratio=progress_ratio,
        daily_best_diffs=daily_diffs,
        total_shares=total_shares,
        weekly_rank=rank_info["rank"],
        percentile=rank_info["percentile"],
        block_found=block_data is not None,
        block_data=block_data,
        user_name=current_user.display_name or current_user.btc_address[:12],
    )
```

#### 5.2 POST /games/play

Records a game session for analytics. Does NOT affect mining data or lottery results.

```python
@router.post("/games/play")
async def record_game_session(
    body: GamePlayRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record that a user played a game. For analytics only."""
    session = GameSession(
        user_id=current_user.id,
        game_type=body.game_type,      # hammer, horse_race, slot_machine, scratch_card
        week_iso=get_current_week_iso(),
        metadata=body.metadata or {},
    )
    db.add(session)
    await db.commit()

    return {"session_id": session.id}
```

#### 5.3 GET /lottery/current (Live Rank)

For the current (not yet drawn) week, compute the user's live rank:

```python
async def get_live_weekly_rank(db: AsyncSession, user_id: int, week_start: date) -> dict:
    """Compute user's live rank for the current week."""
    # Get all users' best diffs this week
    all_diffs = await db.execute(
        select(
            WeeklyBestDiff.user_id,
            WeeklyBestDiff.best_difficulty,
        )
        .where(WeeklyBestDiff.week_start == week_start)
        .order_by(WeeklyBestDiff.best_difficulty.desc())
    )

    results = all_diffs.all()
    total = len(results)

    if total == 0:
        return {"rank": 0, "percentile": 0, "total_participants": 0}

    # Find user's rank
    user_rank = 0
    for idx, row in enumerate(results):
        if row.user_id == user_id:
            user_rank = idx + 1
            break

    if user_rank == 0:
        return {"rank": 0, "percentile": 0, "total_participants": total}

    percentile = round(100 - (user_rank / total * 100), 2)
    return {"rank": user_rank, "percentile": percentile, "total_participants": total}
```

**Performance note:** For large user bases (10K+), cache this ranking in Redis and refresh every 5 minutes via an arq periodic task. Do not compute it on every API request.

### Part 6: Daily Best Diffs Aggregation

The `daily_best_diffs` field maps each day of the week to the user's best difficulty for that day:

```python
async def get_daily_best_diffs(
    db: AsyncSession, user_id: int, week_start: date, week_end: date
) -> dict[str, float]:
    """
    Get the user's best difficulty per day for the week.
    Returns {"mon": N, "tue": N, ..., "sun": N}.
    Missing days return 0.
    """
    results = await db.execute(
        select(
            func.extract("dow", Share.time).label("dow"),  # 0=Sun, 1=Mon, ..., 6=Sat
            func.max(Share.share_diff).label("best_diff"),
        )
        .where(
            Share.user_id == user_id,
            Share.time >= week_start,
            Share.time <= week_end,
            Share.is_valid == True,
        )
        .group_by(func.extract("dow", Share.time))
    )

    # PostgreSQL dow: 0=Sunday, 1=Monday, ..., 6=Saturday
    # Frontend expects: mon, tue, wed, thu, fri, sat, sun
    PG_DOW_TO_KEY = {1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun"}

    daily = {"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0}
    for row in results.all():
        key = PG_DOW_TO_KEY.get(int(row.dow))
        if key:
            daily[key] = float(row.best_diff)

    return daily
```

### Part 7: Caching Strategy

For performance, cache frequently accessed data in Redis:

| Key | TTL | Data |
|---|---|---|
| `game:weekly:{user_id}:{week_iso}` | 60s | Full WeeklyGameData response |
| `lottery:rank:{week_iso}` | 300s (5 min) | Sorted list of all user ranks |
| `network:difficulty` | 600s (10 min) | Current Bitcoin network difficulty |
| `lottery:current:participants` | 300s | Participant count for current week |

Cache invalidation:
- `game:weekly:*` is invalidated when a new `share_best_diff` event arrives for that user
- `lottery:rank:*` is rebuilt every 5 minutes by an arq periodic task
- `network:difficulty` is refreshed from Bitcoin Core RPC (or event collector data)

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**. Every test must exist and pass.

### Unit Tests

```python
# tests/unit/test_lottery_ranking.py

class TestLotteryRanking:
    """Test the deterministic ranking algorithm."""

    def test_higher_diff_ranks_first(self):
        participants = [
            {"user_id": 1, "best_difficulty": 5_000_000},
            {"user_id": 2, "best_difficulty": 10_000_000},
            {"user_id": 3, "best_difficulty": 1_000_000},
        ]
        ranked = rank_participants(participants)
        assert ranked[0]["user_id"] == 2  # 10M
        assert ranked[1]["user_id"] == 1  # 5M
        assert ranked[2]["user_id"] == 3  # 1M

    def test_tie_broken_by_earlier_timestamp(self):
        participants = [
            {"user_id": 1, "best_difficulty": 5_000_000, "best_diff_time": datetime(2026, 2, 23, 12, 0)},
            {"user_id": 2, "best_difficulty": 5_000_000, "best_diff_time": datetime(2026, 2, 23, 10, 0)},
        ]
        ranked = rank_participants(participants)
        assert ranked[0]["user_id"] == 2  # Earlier time wins

    def test_single_participant(self):
        participants = [{"user_id": 1, "best_difficulty": 100}]
        ranked = rank_participants(participants)
        assert len(ranked) == 1
        assert ranked[0]["rank"] == 1
        assert ranked[0]["percentile"] == 100.0

    def test_zero_participants(self):
        ranked = rank_participants([])
        assert len(ranked) == 0

    def test_xp_tier_top_10(self):
        assert determine_xp_tier(1) == 100
        assert determine_xp_tier(10) == 100

    def test_xp_tier_top_50(self):
        assert determine_xp_tier(11) == 50
        assert determine_xp_tier(50) == 50

    def test_xp_tier_top_100(self):
        assert determine_xp_tier(51) == 25
        assert determine_xp_tier(100) == 25

    def test_xp_tier_participated(self):
        assert determine_xp_tier(101) == 10
        assert determine_xp_tier(1000) == 10

    def test_percentile_calculation(self):
        # Rank 1 out of 100 = 99th percentile
        assert calculate_percentile(1, 100) == 99.0
        # Rank 50 out of 100 = 50th percentile
        assert calculate_percentile(50, 100) == 50.0
        # Rank 100 out of 100 = 0th percentile
        assert calculate_percentile(100, 100) == 0.0


# tests/unit/test_weekly_boundaries.py

class TestWeeklyBoundaries:
    """Test week boundary computation for games."""

    def test_monday_is_start_of_week(self):
        dt = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        start, end = get_week_boundaries(dt)
        assert start.weekday() == 0  # Monday
        assert start.hour == 0

    def test_sunday_is_end_of_week(self):
        dt = datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc)
        start, end = get_week_boundaries(dt)
        assert end.weekday() == 6  # Sunday
        assert end.hour == 23

    def test_friday_belongs_to_current_week(self):
        """A share on Friday should be in the same week as Monday."""
        mon = datetime(2026, 2, 23, 10, 0, 0, tzinfo=timezone.utc)
        fri = datetime(2026, 2, 27, 10, 0, 0, tzinfo=timezone.utc)
        assert get_week_iso(mon) == get_week_iso(fri)


# tests/unit/test_game_data_shape.py

class TestGameDataShape:
    """Ensure game data response matches frontend interface."""

    def test_daily_diffs_has_all_7_days(self):
        data = build_weekly_game_data(mock_user, mock_shares)
        assert set(data.daily_best_diffs.keys()) == {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

    def test_progress_ratio_calculation(self):
        data = build_weekly_game_data(
            mock_user_with_diff(5_000_000_000),
            network_diff=100_000_000_000_000,
        )
        assert abs(data.progress_ratio - 5e9 / 1e14) < 1e-10

    def test_zero_shares_returns_zero_data(self):
        data = build_weekly_game_data(mock_user, shares=[])
        assert data.best_difficulty == 0
        assert data.total_shares == 0
        assert data.weekly_rank == 0
        assert all(v == 0 for v in data.daily_best_diffs.values())
```

### Integration Tests

```python
# tests/integration/test_lottery_cycle.py

class TestFullLotteryCycle:
    """Integration: week of mining -> draw -> results -> XP."""

    async def test_complete_lottery_cycle(self, client, db, redis):
        """Full lifecycle: shares -> draw -> rank -> XP."""
        # 1. Create 3 users with different best diffs
        users = await create_test_users(db, 3)

        # 2. Simulate weekly best diffs
        await create_weekly_best_diff(db, users[0].id, week_start, 10_000_000_000)  # 10B
        await create_weekly_best_diff(db, users[1].id, week_start, 5_000_000_000)   # 5B
        await create_weekly_best_diff(db, users[2].id, week_start, 1_000_000_000)   # 1B

        # 3. Execute the draw
        draw = await execute_weekly_draw(db, week_iso)
        assert draw.status == "completed"
        assert draw.total_participants == 3
        assert draw.winner_user_id == users[0].id

        # 4. Verify ranks
        results = await get_lottery_results(db, draw.id)
        assert results[0].rank == 1  # 10B user
        assert results[1].rank == 2  # 5B user
        assert results[2].rank == 3  # 1B user

        # 5. Verify XP was granted
        xp_entries = await get_xp_ledger(db, users[0].id)
        lottery_xp = [e for e in xp_entries if e.source == "competition"]
        assert len(lottery_xp) == 1
        assert lottery_xp[0].amount == 100  # Top 10

    async def test_lottery_idempotent(self, db):
        """Drawing the same week twice should not create duplicates."""
        await create_weekly_best_diff(db, user_id, week_start, 1_000_000)
        draw1 = await execute_weekly_draw(db, week_iso)
        draw2 = await execute_weekly_draw(db, week_iso)  # Should be no-op
        assert draw1.id == draw2.id  # Same draw returned

    async def test_game_data_endpoint_shape(self, auth_client):
        """GET /games/weekly returns correct shape."""
        response = await auth_client.get("/api/v1/games/weekly")
        assert response.status_code == 200
        data = response.json()
        assert "best_difficulty" in data
        assert "daily_best_diffs" in data
        assert set(data["daily_best_diffs"].keys()) == {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
        assert "weekly_rank" in data
        assert "percentile" in data
        assert "progress_ratio" in data
```

### Test Coverage Target: 85%+

Run `pytest --cov=app.games --cov-report=term-missing` and verify coverage is at least 85%.

---

## Rules

1. **Deterministic ranking.** The lottery has ZERO randomness. Rank by best_difficulty DESC, then by timestamp ASC, then by total_shares DESC. No hash-based seeding, no random number generation.
2. **Game data matches frontend.** The `WeeklyGameData` response must include all fields from the frontend interface. Missing fields will break the UI.
3. **XP grants use Phase 4 infrastructure.** Call `grant_xp()` from `app.gamification.xp_service`. Do not duplicate XP granting logic.
4. **Idempotent draws.** Running `execute_weekly_draw()` twice for the same week must not create duplicate results or grant double XP.
5. **Cache aggressively.** Game data and rankings are read-heavy. Use Redis caching with appropriate TTLs. Invalidate on relevant events.
6. **Week boundaries match Phase 4.** Monday 00:00 UTC to Sunday 23:59:59 UTC. The `get_week_iso()` and `get_week_boundaries()` functions from Phase 4 should be reused, not reimplemented.
7. **Do not touch `dashboard/`.** The frontend is done.
8. **Paginate history endpoints.** `/games/history` and `/lottery/results/{week}` must support pagination.
9. **Game sessions are analytics-only.** Recording a game play does not affect mining data, lottery results, or XP. It is purely for usage analytics.
10. **Network difficulty from cache.** Do not call Bitcoin Core RPC on every game data request. Cache the network difficulty in Redis with a 10-minute TTL.
11. **Live rank computation.** For the current (not yet drawn) week, compute rank on-the-fly or from a frequently refreshed cache. Do not wait for the Monday draw.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `backend/app/games/__init__.py` |
| CREATE | `backend/app/games/models.py` |
| CREATE | `backend/app/games/schemas.py` |
| CREATE | `backend/app/games/lottery_service.py` |
| CREATE | `backend/app/games/game_data_service.py` |
| CREATE | `backend/app/games/ranking_service.py` |
| CREATE | `backend/app/api/v1/games.py` |
| CREATE | `backend/app/workers/lottery_worker.py` |
| CREATE | `backend/alembic/versions/005_games_lottery_tables.py` |
| CREATE | `tests/unit/test_lottery_ranking.py` |
| CREATE | `tests/unit/test_weekly_boundaries.py` |
| CREATE | `tests/unit/test_game_data_shape.py` |
| CREATE | `tests/integration/test_lottery_cycle.py` |
| CREATE | `tests/integration/test_games_api.py` |
| EDIT | `backend/app/api/v1/__init__.py` — register games router |
| EDIT | `backend/app/main.py` — add games router |
| EDIT | `backend/app/workers/__init__.py` — register lottery worker |

---

## Definition of Done

1. **Weekly game data endpoint returns correct shape.** `GET /games/weekly` returns all fields from the `WeeklyGameData` interface: `best_difficulty`, `daily_best_diffs` (7 day keys), `weekly_rank`, `percentile`, `progress_ratio`, `total_shares`, `block_found`, `user_name`.
2. **Daily best diffs map to correct day keys.** Monday data maps to `"mon"`, Tuesday to `"tue"`, etc. All 7 days are present, defaulting to 0 for days with no shares.
3. **Lottery ranking is deterministic.** Given the same input data, the ranking is always identical. No randomness involved.
4. **XP tiers are correct.** Top 10 get 100 XP, Top 50 get 50, Top 100 get 25, all others get 10.
5. **Tie-breaking works.** Two users with identical best difficulty are ranked by earlier timestamp first, then by higher total shares.
6. **Lottery draw is idempotent.** Running the draw for the same week twice does not create duplicates.
7. **XP is granted via Phase 4 engine.** Lottery XP uses `grant_xp()` with proper idempotency keys.
8. **Edge cases handled.** Zero shares, single participant, all participants tied — all produce correct results without errors.
9. **All 7 API endpoints return correct responses.** Each endpoint returns the documented shape with correct data types.
10. **Game sessions are recorded.** `POST /games/play` persists game sessions for analytics.
11. **Caching works.** Game data and rankings use Redis cache. Network difficulty is cached.
12. **Weekly draw scheduled.** The arq task runs Monday 00:01 UTC for the preceding week.
13. **Past weeks accessible.** `/games/history` and `/lottery/results/{week}` return historical data with pagination.
14. **Test coverage is 85%+** for all games modules.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Database migration** — Create the Alembic migration with the 3 tables (lottery_draws, lottery_results, game_sessions). Run the migration.

2. **Week boundary utilities** — Reuse or extend the week boundary functions from Phase 4. Write boundary unit tests first.

3. **Daily best diffs aggregation** — Implement the SQL query that aggregates per-day best difficulties. Map PostgreSQL day-of-week to frontend keys. Test with mock data.

4. **Weekly game data service** — Assemble the full `WeeklyGameData` response from multiple sources. Test the data shape.

5. **Game data endpoint** — Create `GET /games/weekly`. Test with a real database and verify the response matches the frontend interface.

6. **Lottery ranking algorithm** — Implement `rank_participants()` with tie-breaking. Write unit tests for ranking, ties, edge cases.

7. **Lottery draw execution** — Implement `execute_weekly_draw()` with XP granting. Write integration test for the full cycle.

8. **Lottery endpoints** — Create the remaining 6 endpoints. Test each endpoint.

9. **Caching layer** — Add Redis caching for game data, rankings, and network difficulty. Implement cache invalidation.

10. **arq scheduled tasks** — Create the Monday 00:01 UTC draw task and the 5-minute ranking refresh task.

11. **Integration tests** — Write the full lottery cycle test and game data shape test. Run the complete suite.

12. **Coverage check** — Run `pytest --cov` and verify 85%+ coverage.

**Critical: Get step 3 (daily best diffs aggregation) working correctly before building the game data endpoint. If the per-day mapping is wrong, all 4 games will display incorrect data.**
