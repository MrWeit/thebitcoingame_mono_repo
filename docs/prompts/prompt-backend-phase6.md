# Prompt: Backend Service — Phase 6 (Competition System)

You are building the competition system for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend API (FastAPI + PostgreSQL + Redis) was built in Phases 0-5: authentication, mining data API, WebSocket events, gamification engine, and games/lottery are all operational. Phase 6 builds the competitive layer: leaderboards, World Cup tournament, and league system.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/` (do not touch). The backend API lives in `backend/`. The mining engine lives in `services/ckpool/` and the event collector in `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
2. **Do not touch `services/`** — The mining engine and event collector are complete from earlier phases.
3. **Redis sorted sets for leaderboards.** Use `ZADD`, `ZREVRANGE`, `ZREVRANK`, and `ZSCORE` for all leaderboard operations. Do NOT query PostgreSQL for leaderboard reads — Redis is the read path. PostgreSQL is only for persistence and snapshots.
4. **World Cup state machine must be explicit.** The tournament progresses through defined states: `upcoming -> registration -> group_stage -> knockout -> completed`. Transitions must be validated — you cannot skip states or go backwards.
5. **Frontend data shapes are the contract.** The frontend has detailed type definitions in `dashboard/src/mocks/competition.ts` for leaderboards, World Cup, cooperatives, and leagues. Your API responses must match these shapes.
6. **arq for background work.** Leaderboard refresh, match scoring, and AI recaps use arq workers. No Celery.
7. **Claude API for recaps.** AI-generated match recaps use the Anthropic Claude API. Stub the interface so it works with a mock in development and the real API in production.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Architecture overview, service boundaries, data flow diagrams.
2. `docs/backend-service/roadmap/phase-06-competition.md` — Full Phase 6 specification with leaderboard architecture, World Cup state machine, league system, and API endpoints.
3. `docs/backend-service/roadmap/phase-04-gamification.md` — Gamification engine. Badges like `world_cup_participant` and `world_cup_winner` are triggered by competition events.
4. `dashboard/src/mocks/competition.ts` — The full competition type definitions: `LeaderboardEntry`, `CountryRanking`, `Competition`, `Group`, `GroupTeam`, `Match`, `League`, `LeagueClub`. Your API responses MUST match these interfaces.
5. `dashboard/src/pages/leaderboard/` — The LeaderboardPage with 4 tab views (weekly, monthly, alltime, country).
6. `dashboard/src/pages/worldcup/` — The WorldCupPage, MatchDetailPage, RegisterPage, MyTeamPage.
7. `dashboard/src/pages/leagues/` — The LeaguesPage with standings and promotion/relegation zones.

Read ALL of these before writing any code.

---

## What You Are Building

### Part 1: Leaderboard System (Redis Sorted Sets)

#### 1.1 Redis Key Structure

```
leaderboard:weekly:{week_iso}          -- ZADD score=best_diff member=user_id
leaderboard:monthly:{year}-{month}     -- ZADD score=best_diff member=user_id
leaderboard:alltime                     -- ZADD score=best_diff member=user_id
leaderboard:country:{week_iso}         -- ZADD score=combined_hashrate member=country_code
```

#### 1.2 Leaderboard Refresh Worker

Create an arq periodic task that refreshes leaderboards at different intervals:

```python
# backend/app/workers/leaderboard_worker.py

async def refresh_weekly_leaderboard(ctx):
    """Refresh weekly leaderboard from weekly_best_diff table. Runs every 5 minutes."""
    redis: Redis = ctx["redis"]
    db: AsyncSession = ctx["db"]
    week_iso = get_current_week_iso()
    key = f"leaderboard:weekly:{week_iso}"

    # Get all users' best diffs this week
    results = await db.execute(
        select(WeeklyBestDiff.user_id, WeeklyBestDiff.best_difficulty)
        .where(WeeklyBestDiff.week_iso == week_iso)
    )

    # Rebuild the sorted set atomically
    pipe = redis.pipeline()
    pipe.delete(key)
    for row in results.all():
        pipe.zadd(key, {str(row.user_id): row.best_difficulty})
    pipe.expire(key, 86400 * 7)  # 1 week TTL
    await pipe.execute()


async def refresh_monthly_leaderboard(ctx):
    """Refresh monthly leaderboard. Runs every hour."""
    redis: Redis = ctx["redis"]
    db: AsyncSession = ctx["db"]
    year_month = datetime.utcnow().strftime("%Y-%m")
    key = f"leaderboard:monthly:{year_month}"
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)

    results = await db.execute(
        select(
            WeeklyBestDiff.user_id,
            func.max(WeeklyBestDiff.best_difficulty).label("best_diff"),
        )
        .where(WeeklyBestDiff.week_start >= month_start)
        .group_by(WeeklyBestDiff.user_id)
    )

    pipe = redis.pipeline()
    pipe.delete(key)
    for row in results.all():
        pipe.zadd(key, {str(row.user_id): row.best_diff})
    pipe.expire(key, 86400 * 31)
    await pipe.execute()


async def refresh_alltime_leaderboard(ctx):
    """Refresh alltime leaderboard. Runs every hour."""
    redis: Redis = ctx["redis"]
    db: AsyncSession = ctx["db"]
    key = "leaderboard:alltime"

    results = await db.execute(
        select(UserGamification.user_id, UserGamification.best_difficulty)
        .where(UserGamification.best_difficulty > 0)
    )

    pipe = redis.pipeline()
    pipe.delete(key)
    for row in results.all():
        pipe.zadd(key, {str(row.user_id): row.best_difficulty})
    await pipe.execute()


async def refresh_country_leaderboard(ctx):
    """Refresh country leaderboard. Runs every hour."""
    redis: Redis = ctx["redis"]
    db: AsyncSession = ctx["db"]
    week_iso = get_current_week_iso()
    key = f"leaderboard:country:{week_iso}"

    results = await db.execute(
        select(
            User.country_code,
            func.count(distinct(User.id)).label("miner_count"),
            func.sum(Worker.hashrate_1h).label("total_hashrate"),
        )
        .join(Worker, Worker.user_id == User.id)
        .where(User.country_code.isnot(None))
        .group_by(User.country_code)
    )

    pipe = redis.pipeline()
    pipe.delete(key)
    for row in results.all():
        pipe.zadd(key, {row.country_code: float(row.total_hashrate or 0)})
    pipe.expire(key, 86400 * 7)
    await pipe.execute()


class WorkerSettings:
    cron_jobs = [
        cron(refresh_weekly_leaderboard, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}),
        cron(refresh_monthly_leaderboard, minute=0),
        cron(refresh_alltime_leaderboard, minute=0),
        cron(refresh_country_leaderboard, minute=0),
    ]
```

#### 1.3 Leaderboard Query Functions

```python
# backend/app/competition/leaderboard_service.py

async def get_leaderboard(
    redis: Redis,
    db: AsyncSession,
    period: str,        # "weekly", "monthly", "alltime", "country"
    page: int = 1,
    per_page: int = 50,
    week_iso: str = None,
) -> LeaderboardResponse:
    """
    Get leaderboard from Redis sorted set.
    Enriches user IDs with profile data from PostgreSQL.
    """
    key = build_leaderboard_key(period, week_iso)

    start = (page - 1) * per_page
    end = start + per_page - 1

    # Get ranked entries from Redis
    entries = await redis.zrevrange(key, start, end, withscores=True)
    total = await redis.zcard(key)

    # Enrich with user profile data
    user_ids = [int(uid) for uid, _ in entries]
    profiles = await get_user_profiles_batch(db, user_ids)

    results = []
    for rank_offset, (uid_bytes, score) in enumerate(entries):
        user_id = int(uid_bytes)
        profile = profiles.get(user_id, {})
        results.append({
            "rank": start + rank_offset + 1,
            "user_id": str(user_id),
            "display_name": profile.get("display_name", f"Miner-{user_id}"),
            "country_code": profile.get("country_code", ""),
            "best_difficulty": score,
            "total_shares": profile.get("total_shares", 0),
            "rank_change": 0,  # Computed by comparing with previous snapshot
            "is_current_user": False,  # Set by the endpoint
        })

    return LeaderboardResponse(entries=results, total=total, page=page, per_page=per_page)


async def get_user_rank(redis: Redis, period: str, user_id: int, week_iso: str = None) -> dict:
    """Get a specific user's rank and score from the leaderboard."""
    key = build_leaderboard_key(period, week_iso)
    rank = await redis.zrevrank(key, str(user_id))
    score = await redis.zscore(key, str(user_id))
    total = await redis.zcard(key)

    if rank is None:
        return {"rank": 0, "score": 0, "total": total}

    return {
        "rank": rank + 1,  # 0-indexed to 1-indexed
        "score": float(score),
        "total": total,
        "percentile": round(100 - ((rank + 1) / total * 100), 2) if total > 0 else 0,
    }
```

### Part 2: Database Schema

Create an Alembic migration for the competition tables.

```sql
-- Leaderboard snapshots (for historical rank changes)
CREATE TABLE leaderboard_snapshots (
    id              SERIAL PRIMARY KEY,
    period          VARCHAR(16) NOT NULL,       -- weekly, monthly, alltime
    period_key      VARCHAR(16) NOT NULL,       -- "2026-W08", "2026-02", "alltime"
    user_id         INTEGER NOT NULL REFERENCES users(id),
    rank            INTEGER NOT NULL,
    score           DOUBLE PRECISION NOT NULL,
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(period, period_key, user_id)
);

CREATE INDEX idx_lb_snapshots_period ON leaderboard_snapshots(period, period_key);

-- Country rankings
CREATE TABLE country_rankings (
    id              SERIAL PRIMARY KEY,
    country_code    VARCHAR(2) NOT NULL,
    country_name    VARCHAR(64) NOT NULL,
    period_key      VARCHAR(16) NOT NULL,       -- "2026-W08"
    rank            INTEGER NOT NULL,
    miner_count     INTEGER NOT NULL DEFAULT 0,
    total_hashrate  DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(country_code, period_key)
);

-- Competitions (World Cup)
CREATE TABLE competitions (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32) NOT NULL,       -- "world_cup"
    status          VARCHAR(32) NOT NULL DEFAULT 'upcoming',
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',    -- min_miners_per_country, scoring rules, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competitions_status ON competitions(status);

-- Competition teams (country teams for World Cup)
CREATE TABLE competition_teams (
    id              SERIAL PRIMARY KEY,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    country_code    VARCHAR(2) NOT NULL,
    country_name    VARCHAR(64) NOT NULL,
    group_name      VARCHAR(16),                -- "Group A", "Group B", etc.
    points          INTEGER NOT NULL DEFAULT 0,
    played          INTEGER NOT NULL DEFAULT 0,
    won             INTEGER NOT NULL DEFAULT 0,
    drawn           INTEGER NOT NULL DEFAULT 0,
    lost            INTEGER NOT NULL DEFAULT 0,
    hashrate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    status          VARCHAR(16) NOT NULL DEFAULT 'active',  -- active, eliminated

    UNIQUE(competition_id, country_code)
);

-- Competition registrations (individual miners)
CREATE TABLE competition_registrations (
    id              SERIAL PRIMARY KEY,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id         INTEGER NOT NULL REFERENCES competition_teams(id) ON DELETE CASCADE,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(competition_id, user_id)
);

-- Matches
CREATE TABLE matches (
    id              SERIAL PRIMARY KEY,
    competition_id  INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    round           VARCHAR(16) NOT NULL,       -- "group", "quarter", "semi", "final"
    team_a_id       INTEGER NOT NULL REFERENCES competition_teams(id),
    team_b_id       INTEGER NOT NULL REFERENCES competition_teams(id),
    score_a         INTEGER NOT NULL DEFAULT 0,
    score_b         INTEGER NOT NULL DEFAULT 0,
    hashrate_a      DOUBLE PRECISION NOT NULL DEFAULT 0,
    hashrate_b      DOUBLE PRECISION NOT NULL DEFAULT 0,
    miners_a        INTEGER NOT NULL DEFAULT 0,
    miners_b        INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(16) NOT NULL DEFAULT 'scheduled', -- scheduled, live, completed
    match_date      TIMESTAMPTZ NOT NULL,
    man_of_match_user_id INTEGER REFERENCES users(id),
    man_of_match_diff    DOUBLE PRECISION,
    ai_recap        TEXT,                       -- Claude API generated recap
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'          -- top miners per team, etc.
);

CREATE INDEX idx_matches_competition ON matches(competition_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_date ON matches(match_date);

-- Leagues
CREATE TABLE leagues (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    division        INTEGER NOT NULL DEFAULT 0,    -- 0 = Champions, 1 = Premier, 2 = Standard
    season          VARCHAR(16) NOT NULL,          -- "2026-Q1"
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- League clubs (cooperatives competing in leagues)
CREATE TABLE league_clubs (
    id              SERIAL PRIMARY KEY,
    league_id       INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    cooperative_id  INTEGER NOT NULL,              -- FK to cooperatives table (Phase 7)
    name            VARCHAR(128) NOT NULL,
    played          INTEGER NOT NULL DEFAULT 0,
    won             INTEGER NOT NULL DEFAULT 0,
    drawn           INTEGER NOT NULL DEFAULT 0,
    lost            INTEGER NOT NULL DEFAULT 0,
    points          INTEGER NOT NULL DEFAULT 0,
    hashrate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_promoted     BOOLEAN NOT NULL DEFAULT false,
    is_relegated    BOOLEAN NOT NULL DEFAULT false,

    UNIQUE(league_id, cooperative_id)
);

CREATE INDEX idx_league_clubs_league ON league_clubs(league_id);
```

### Part 3: World Cup Tournament Engine

#### 3.1 State Machine

The World Cup progresses through exactly these states:

```
upcoming -> registration -> group_stage -> knockout -> completed
```

State transitions:

| From | To | Trigger | Validation |
|---|---|---|---|
| `upcoming` | `registration` | Manual (admin) or scheduled date | Competition start date reached |
| `registration` | `group_stage` | Manual or registration deadline | Min 4 countries with min 5 miners each |
| `group_stage` | `knockout` | All group matches completed | Group standings finalized, top 2 per group advance |
| `knockout` | `completed` | Final match completed | Winner determined |

```python
# backend/app/competition/worldcup_engine.py

VALID_TRANSITIONS = {
    "upcoming": ["registration"],
    "registration": ["group_stage"],
    "group_stage": ["knockout"],
    "knockout": ["completed"],
    "completed": [],
}

async def transition_state(
    db: AsyncSession,
    competition_id: int,
    target_state: str,
) -> Competition:
    """Transition World Cup to a new state with validation."""
    competition = await get_competition(db, competition_id)

    if target_state not in VALID_TRANSITIONS.get(competition.status, []):
        raise ValueError(
            f"Invalid transition: {competition.status} -> {target_state}. "
            f"Valid: {VALID_TRANSITIONS[competition.status]}"
        )

    # State-specific validation
    if target_state == "group_stage":
        await validate_registration_complete(db, competition)
    elif target_state == "knockout":
        await validate_group_stage_complete(db, competition)
    elif target_state == "completed":
        await validate_knockout_complete(db, competition)

    competition.status = target_state
    competition.updated_at = datetime.utcnow()
    await db.commit()

    # Trigger state entry actions
    if target_state == "group_stage":
        await generate_group_matches(db, competition)
    elif target_state == "knockout":
        await generate_knockout_bracket(db, competition)

    return competition
```

#### 3.2 Registration

```python
async def register_for_worldcup(
    db: AsyncSession,
    competition_id: int,
    user_id: int,
    country_code: str,
) -> CompetitionRegistration:
    """Register a miner for the World Cup with their country."""
    competition = await get_competition(db, competition_id)

    if competition.status != "registration":
        raise ValueError("Registration is not open")

    # Get or create the country team
    team = await get_or_create_team(db, competition_id, country_code)

    # Check for existing registration
    existing = await db.execute(
        select(CompetitionRegistration).where(
            CompetitionRegistration.competition_id == competition_id,
            CompetitionRegistration.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Already registered for this competition")

    registration = CompetitionRegistration(
        competition_id=competition_id,
        user_id=user_id,
        team_id=team.id,
    )
    db.add(registration)
    await db.commit()

    # Trigger world_cup_participant badge via Phase 4 gamification engine
    from app.gamification.trigger_engine import trigger_event_badge
    await trigger_event_badge(db, user_id, "world_cup_participate")

    return registration
```

#### 3.3 Match Scoring

Goals are calculated deterministically from mining performance:

```python
async def score_match(db: AsyncSession, match_id: int) -> Match:
    """
    Score a match based on mining performance during the match period.

    Scoring formula:
    goals = floor(team_hashrate / baseline_hashrate) + (blocks_found * 3)

    - team_hashrate: sum of all team members' hashrate during the match
    - baseline_hashrate: configurable baseline (e.g. 1 PH/s = 1 goal)
    - blocks_found: number of blocks found by team members during the match (each = 3 bonus goals)
    """
    match = await get_match(db, match_id)

    # Get team members and their mining stats during match period
    team_a_stats = await get_team_match_stats(db, match.team_a_id, match.started_at, match.completed_at)
    team_b_stats = await get_team_match_stats(db, match.team_b_id, match.started_at, match.completed_at)

    baseline = match.competition.config.get("baseline_hashrate", 1e15)  # 1 PH/s default

    match.hashrate_a = team_a_stats["total_hashrate"]
    match.hashrate_b = team_b_stats["total_hashrate"]
    match.miners_a = team_a_stats["miner_count"]
    match.miners_b = team_b_stats["miner_count"]

    match.score_a = int(team_a_stats["total_hashrate"] / baseline) + (team_a_stats["blocks_found"] * 3)
    match.score_b = int(team_b_stats["total_hashrate"] / baseline) + (team_b_stats["blocks_found"] * 3)

    # Determine man of the match (highest individual difficulty)
    mom = await get_man_of_match(db, match)
    if mom:
        match.man_of_match_user_id = mom["user_id"]
        match.man_of_match_diff = mom["best_diff"]

    match.status = "completed"
    match.completed_at = datetime.utcnow()

    # Update group standings
    await update_group_standings(db, match)

    await db.commit()

    # Generate AI recap (async)
    await schedule_ai_recap(match.id)

    return match
```

#### 3.4 Group Stage Mechanics

- 4 teams per group, round-robin format
- Each group plays for 2 weeks
- Points: Win = 3, Draw = 1, Loss = 0
- Top 2 teams per group advance to knockout

```python
async def generate_group_matches(db: AsyncSession, competition: Competition):
    """Generate all group stage matches (round-robin within each group)."""
    teams_by_group = await get_teams_by_group(db, competition.id)

    for group_name, teams in teams_by_group.items():
        # Round-robin: each team plays every other team once
        for i, team_a in enumerate(teams):
            for team_b in teams[i + 1:]:
                match = Match(
                    competition_id=competition.id,
                    round="group",
                    team_a_id=team_a.id,
                    team_b_id=team_b.id,
                    status="scheduled",
                    match_date=calculate_match_date(competition, group_name, team_a, team_b),
                )
                db.add(match)

    await db.commit()
```

#### 3.5 Knockout Stage

- Quarter-finals, semi-finals, final
- Each round = 1 day of mining
- Winner advances, loser is eliminated
- If tied: team with higher total hashrate advances

```python
async def generate_knockout_bracket(db: AsyncSession, competition: Competition):
    """Generate knockout bracket from group stage results. Top 2 per group."""
    groups = await get_group_standings(db, competition.id)

    # Top 2 from each group
    qualifiers = []
    for group_name, standings in groups.items():
        qualifiers.extend(standings[:2])

    # Seed bracket: 1st Group A vs 2nd Group B, etc.
    quarter_matchups = [
        (qualifiers[0], qualifiers[3]),  # 1A vs 2B
        (qualifiers[2], qualifiers[1]),  # 1B vs 2A
        (qualifiers[4], qualifiers[7]),  # 1C vs 2D
        (qualifiers[6], qualifiers[5]),  # 1D vs 2C
    ]

    for team_a, team_b in quarter_matchups:
        match = Match(
            competition_id=competition.id,
            round="quarter",
            team_a_id=team_a.id,
            team_b_id=team_b.id,
            status="scheduled",
            match_date=calculate_knockout_date(competition, "quarter"),
        )
        db.add(match)

    await db.commit()
```

#### 3.6 AI Match Recaps

```python
# backend/app/competition/recap_service.py

class RecapService:
    """Generate AI-powered match recaps using Claude API."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self.client = None
        if api_key:
            import anthropic
            self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def generate_recap(self, match: Match, stats: dict) -> str:
        """Generate a match recap. Falls back to template if API unavailable."""
        if not self.client:
            return self._template_recap(match, stats)

        prompt = f"""Write an exciting 2-3 sentence recap of a Bitcoin mining World Cup match.

Match: {stats['team_a_country']} vs {stats['team_b_country']}
Round: {match.round}
Score: {match.score_a} - {match.score_b}
Team A hashrate: {stats['hashrate_a']:.1e} H/s ({stats['miners_a']} miners)
Team B hashrate: {stats['hashrate_b']:.1e} H/s ({stats['miners_b']} miners)
Man of the Match: {stats.get('mom_name', 'N/A')} with {stats.get('mom_diff', 0):.1e} difficulty

Write in the style of a sports commentator. Focus on drama, key moments, and standout performances.
Keep it under 300 characters."""

        response = await self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    def _template_recap(self, match: Match, stats: dict) -> str:
        """Fallback template-based recap when API is unavailable."""
        winner = stats['team_a_country'] if match.score_a > match.score_b else stats['team_b_country']
        return (
            f"{winner} claimed victory in a {match.round} clash, "
            f"with a final score of {match.score_a}-{match.score_b}."
        )
```

### Part 4: League System

#### 4.1 League Structure

- Leagues are for cooperatives (Phase 7), not individual miners
- Quarterly seasons (Q1, Q2, Q3, Q4)
- Promotion: top 2 clubs move up a division
- Relegation: bottom 2 clubs move down

```python
async def update_league_standings(db: AsyncSession, league_id: int):
    """Recalculate league standings from cooperative mining data."""
    clubs = await get_league_clubs(db, league_id)

    for club in clubs:
        # Get cooperative's weekly performance
        stats = await get_cooperative_weekly_stats(db, club.cooperative_id)
        club.hashrate = stats["combined_hashrate"]

        # Compare with other clubs this week to determine W/D/L
        # (Simplified: top third = win, middle third = draw, bottom third = loss)
        # Real implementation compares cooperative hashrate rankings

    # Sort by points, then hashrate for tiebreaker
    clubs.sort(key=lambda c: (c.points, c.hashrate), reverse=True)

    # Mark promotion/relegation zones
    total = len(clubs)
    for i, club in enumerate(clubs):
        club.is_promoted = i < 2
        club.is_relegated = i >= total - 2

    await db.commit()
```

### Part 5: API Endpoints

Create a new router at `backend/app/api/v1/competition.py` with 15 endpoints:

#### 5.1 Leaderboard Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/leaderboard/weekly` | Weekly leaderboard (paginated) | No |
| GET | `/leaderboard/monthly` | Monthly leaderboard (paginated) | No |
| GET | `/leaderboard/alltime` | All-time leaderboard (paginated) | No |
| GET | `/leaderboard/country` | Country rankings | No |
| GET | `/leaderboard/me` | Current user's rank across all periods | Yes |

#### 5.2 Competition/World Cup Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/competitions` | List competitions | No |
| GET | `/competitions/{id}` | Competition detail with groups | No |
| GET | `/competitions/{id}/groups` | Group standings | No |
| GET | `/competitions/{id}/matches` | All matches | No |
| GET | `/competitions/{id}/matches/{match_id}` | Match detail with recap | No |
| POST | `/competitions/{id}/register` | Register for World Cup | Yes |
| GET | `/competitions/{id}/my-team` | User's team in competition | Yes |

#### 5.3 League Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/leagues` | List active leagues | No |
| GET | `/leagues/{id}` | League detail with standings | No |
| GET | `/leagues/{id}/results` | Recent match results | No |

#### Response Shape Examples

```python
# Leaderboard entry (must match frontend LeaderboardEntry)
class LeaderboardEntryResponse(BaseModel):
    rank: int
    user_id: str
    display_name: str
    country_code: str
    best_difficulty: float
    total_shares: int
    rank_change: int
    is_current_user: bool
    hashrate: float | None = None
    worker_count: int | None = None
    badges: list[str] | None = None

# Match detail (must match frontend Match)
class MatchResponse(BaseModel):
    id: str
    round: str              # "group", "quarter", "semi", "final"
    team_a: MatchTeamResponse
    team_b: MatchTeamResponse
    status: str             # "scheduled", "live", "completed"
    match_date: datetime
    man_of_the_match: str | None = None
    man_of_the_match_diff: float | None = None
    ai_recap: str | None = None
    top_miners_a: list[dict] | None = None
    top_miners_b: list[dict] | None = None

class MatchTeamResponse(BaseModel):
    country_code: str
    score: int
    hashrate: float
    miners: int
```

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**.

### Unit Tests

```python
# tests/unit/test_leaderboard.py

class TestLeaderboardRanking:
    """Test Redis sorted set operations."""

    async def test_zadd_and_zrevrange(self, redis):
        await redis.zadd("test:lb", {"user:1": 1000, "user:2": 5000, "user:3": 3000})
        top = await redis.zrevrange("test:lb", 0, -1, withscores=True)
        assert top[0] == (b"user:2", 5000.0)  # Highest first
        assert top[1] == (b"user:3", 3000.0)
        assert top[2] == (b"user:1", 1000.0)

    async def test_zrevrank_returns_position(self, redis):
        await redis.zadd("test:lb", {"user:1": 1000, "user:2": 5000})
        rank = await redis.zrevrank("test:lb", "user:2")
        assert rank == 0  # Top position (0-indexed)

    async def test_user_not_on_leaderboard(self, redis):
        await redis.zadd("test:lb", {"user:1": 1000})
        rank = await redis.zrevrank("test:lb", "user:999")
        assert rank is None


# tests/unit/test_worldcup_state_machine.py

class TestWorldCupStateMachine:
    """Test tournament state transitions."""

    def test_valid_transitions(self):
        assert "registration" in VALID_TRANSITIONS["upcoming"]
        assert "group_stage" in VALID_TRANSITIONS["registration"]
        assert "knockout" in VALID_TRANSITIONS["group_stage"]
        assert "completed" in VALID_TRANSITIONS["knockout"]

    def test_invalid_transition_rejected(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("upcoming", "knockout")

    def test_cannot_go_backwards(self):
        with pytest.raises(ValueError):
            validate_transition("knockout", "group_stage")

    def test_completed_is_terminal(self):
        assert VALID_TRANSITIONS["completed"] == []


# tests/unit/test_scoring.py

class TestMatchScoring:
    """Test the scoring formula."""

    def test_basic_scoring(self):
        baseline = 1e15  # 1 PH/s
        goals = calculate_goals(hashrate=3.5e15, blocks_found=0, baseline=baseline)
        assert goals == 3  # floor(3.5)

    def test_block_bonus(self):
        baseline = 1e15
        goals = calculate_goals(hashrate=1e15, blocks_found=2, baseline=baseline)
        assert goals == 7  # floor(1) + 2*3

    def test_zero_hashrate(self):
        goals = calculate_goals(hashrate=0, blocks_found=0, baseline=1e15)
        assert goals == 0

    def test_promotion_relegation(self):
        standings = [
            {"id": 1, "points": 20},
            {"id": 2, "points": 18},
            {"id": 3, "points": 15},
            {"id": 4, "points": 12},
            {"id": 5, "points": 8},
            {"id": 6, "points": 5},
        ]
        marked = apply_promotion_relegation(standings)
        assert marked[0]["is_promoted"] == True
        assert marked[1]["is_promoted"] == True
        assert marked[4]["is_relegated"] == True
        assert marked[5]["is_relegated"] == True
```

### Integration Tests

```python
# tests/integration/test_leaderboard_10k.py

class TestLeaderboard10K:
    """Test leaderboard performance with 10K+ users."""

    async def test_10k_user_leaderboard(self, redis):
        """Insert 10K users and verify ranking operations are fast."""
        # Seed 10K users
        pipe = redis.pipeline()
        for i in range(10_000):
            pipe.zadd("test:lb:10k", {f"user:{i}": float(i * 1000)})
        await pipe.execute()

        # Top 50 should be instant
        import time
        start = time.monotonic()
        top = await redis.zrevrange("test:lb:10k", 0, 49, withscores=True)
        elapsed = time.monotonic() - start

        assert len(top) == 50
        assert elapsed < 0.01  # Under 10ms
        assert top[0][1] == 9_999_000.0  # Highest user

        # User rank lookup should be fast
        start = time.monotonic()
        rank = await redis.zrevrank("test:lb:10k", "user:5000")
        elapsed = time.monotonic() - start
        assert elapsed < 0.005  # Under 5ms


# tests/integration/test_worldcup_lifecycle.py

class TestWorldCupLifecycle:
    """Test full World Cup from creation to completion."""

    async def test_full_worldcup_cycle(self, db, redis):
        """Create -> Register -> Groups -> Knockout -> Winner."""
        # 1. Create competition
        comp = await create_competition(db, "Test World Cup", "world_cup")
        assert comp.status == "upcoming"

        # 2. Open registration
        comp = await transition_state(db, comp.id, "registration")
        assert comp.status == "registration"

        # 3. Register users (4 countries, 5 miners each)
        countries = ["US", "JP", "DE", "BR"]
        for country in countries:
            for i in range(5):
                user = await create_test_user(db, country_code=country)
                await register_for_worldcup(db, comp.id, user.id, country)

        # 4. Start group stage
        comp = await transition_state(db, comp.id, "group_stage")
        assert comp.status == "group_stage"

        # 5. Complete all group matches
        matches = await get_matches(db, comp.id, round="group")
        for match in matches:
            await complete_match(db, match.id)

        # 6. Start knockout
        comp = await transition_state(db, comp.id, "knockout")
        assert comp.status == "knockout"

        # 7. Complete knockout (QF -> SF -> Final)
        for round_name in ["quarter", "semi", "final"]:
            matches = await get_matches(db, comp.id, round=round_name)
            for match in matches:
                await complete_match(db, match.id)

        # 8. Complete competition
        comp = await transition_state(db, comp.id, "completed")
        assert comp.status == "completed"
```

### Test Coverage Target: 85%+

---

## Rules

1. **Redis for leaderboard reads.** All leaderboard queries go through Redis sorted sets. PostgreSQL is only for snapshots and persistence. Never query PostgreSQL on a leaderboard page load.
2. **State machine is law.** World Cup transitions MUST be validated. No skipping states. No going backwards. No manual database edits to change state.
3. **Frontend shapes are the contract.** Match `LeaderboardEntry`, `Competition`, `Match`, `GroupTeam`, `LeagueClub` from `dashboard/src/mocks/competition.ts`.
4. **Scoring is deterministic.** `goals = floor(hashrate / baseline) + (blocks * 3)`. No randomness.
5. **AI recaps are optional.** The system must work without the Claude API key. Use template-based fallback when the API is unavailable.
6. **Do not touch `dashboard/`.** The frontend is done.
7. **Pagination on all list endpoints.** Leaderboards, matches, results — all support `page` and `per_page` parameters.
8. **Badge integration.** Registration triggers `world_cup_participant` badge. Winning team gets `world_cup_winner` badge. Use Phase 4's `trigger_event_badge()`.
9. **Promotion/relegation is visual.** Top 2 clubs are marked `is_promoted`, bottom 2 are `is_relegated`. The actual division change happens at season end.
10. **Leaderboard refresh intervals.** Weekly: every 5 min. Monthly: every hour. All-time: every hour. Country: every hour. These are arq cron jobs.
11. **Rank change calculation.** Compare current snapshot with previous snapshot to compute `rank_change`. Store snapshots for historical comparison.
12. **Country minimum for World Cup.** A country needs at least 5 registered miners to form a team. Countries with fewer are not eligible.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `backend/app/competition/__init__.py` |
| CREATE | `backend/app/competition/models.py` |
| CREATE | `backend/app/competition/schemas.py` |
| CREATE | `backend/app/competition/leaderboard_service.py` |
| CREATE | `backend/app/competition/worldcup_engine.py` |
| CREATE | `backend/app/competition/match_service.py` |
| CREATE | `backend/app/competition/league_service.py` |
| CREATE | `backend/app/competition/recap_service.py` |
| CREATE | `backend/app/api/v1/competition.py` |
| CREATE | `backend/app/workers/leaderboard_worker.py` |
| CREATE | `backend/app/workers/match_worker.py` |
| CREATE | `backend/alembic/versions/006_competition_tables.py` |
| CREATE | `tests/unit/test_leaderboard.py` |
| CREATE | `tests/unit/test_worldcup_state_machine.py` |
| CREATE | `tests/unit/test_scoring.py` |
| CREATE | `tests/integration/test_leaderboard_10k.py` |
| CREATE | `tests/integration/test_worldcup_lifecycle.py` |
| CREATE | `tests/integration/test_competition_api.py` |
| EDIT | `backend/app/api/v1/__init__.py` — register competition router |
| EDIT | `backend/app/main.py` — add competition router |
| EDIT | `backend/app/workers/__init__.py` — register leaderboard and match workers |

---

## Definition of Done

1. **Weekly leaderboard updates every 5 minutes.** Redis sorted set `leaderboard:weekly:{week}` is rebuilt from `weekly_best_diff` table every 5 minutes.
2. **Leaderboard queries are sub-10ms.** `ZREVRANGE` for top 50 and `ZREVRANK` for user position complete in under 10ms on a 10K+ user dataset.
3. **All 4 leaderboard views work.** Weekly, monthly, all-time, and country leaderboards return correct rankings with correct data shapes.
4. **User's own rank is available.** `GET /leaderboard/me` returns the user's rank, score, and percentile across all leaderboard periods.
5. **World Cup state machine enforced.** Only valid transitions are allowed. Attempting `upcoming -> knockout` raises an error.
6. **Registration works.** Users can register for a World Cup with their country. Duplicate registration is prevented. `world_cup_participant` badge is triggered.
7. **Group stage generates correct matches.** 4 teams per group, round-robin format. Each team plays every other team once.
8. **Match scoring uses deterministic formula.** `goals = floor(hashrate / baseline) + (blocks * 3)`. Results are reproducible.
9. **Knockout bracket generates correctly.** Top 2 per group advance. Seeding follows the documented pattern (1A vs 2B, etc.).
10. **AI recaps generated for completed matches.** Claude API produces recap text. Template fallback works when API is unavailable.
11. **League standings with promotion/relegation.** Top 2 marked as promoted, bottom 2 as relegated.
12. **All 15 API endpoints return correct responses.** Each endpoint matches the documented response shape.
13. **10K+ user leaderboard test passes.** Performance test with 10K users completes with sub-10ms queries.
14. **Full World Cup lifecycle test passes.** Creation -> registration -> groups -> knockout -> completion with all state transitions.
15. **Test coverage is 85%+** for all competition modules.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Database migration** — Create the Alembic migration with all competition tables. Run the migration.

2. **Leaderboard Redis operations** — Implement `ZADD`, `ZREVRANGE`, `ZREVRANK` wrapper functions. Write unit tests with a real Redis instance.

3. **Leaderboard refresh workers** — Create the arq periodic tasks for weekly/monthly/alltime/country. Test that sorted sets are populated correctly.

4. **Leaderboard API endpoints** — Create the 5 leaderboard endpoints. Test with mock data.

5. **10K user performance test** — Seed 10K users, verify sub-10ms queries. This validates the Redis approach.

6. **World Cup state machine** — Implement the state transition logic with validation. Write state machine unit tests.

7. **Registration system** — Implement user registration for World Cup. Wire to badge system for `world_cup_participant`.

8. **Group stage** — Implement group match generation (round-robin). Implement match scoring formula.

9. **Knockout stage** — Implement bracket generation from group results. Implement knockout match flow.

10. **AI recap service** — Create the Claude API integration with template fallback. Test with mock and real API.

11. **League system** — Implement league standings, promotion/relegation zones. Test with mock cooperative data.

12. **Full lifecycle test** — Write and run the complete World Cup lifecycle integration test.

**Critical: Get step 2 (Redis sorted set operations) working before building anything else. The leaderboard is the foundation of the entire competition system, and if Redis operations are wrong, everything downstream breaks.**
