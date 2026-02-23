# Prompt: Backend Service — Phase 8 (Education System)

You are building the education system for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend API has been built through Phases 0-7: testing infrastructure, authentication, mining data, real-time WebSocket, gamification engine, games & lottery, competition & leaderboards, and social & cooperatives.

Phase 8 adds a **complete education experience**: 4 tracks with 24 lessons about Bitcoin mining, seeded from the frontend mock data, with dynamic content interpolation using the user's real mining stats, completion tracking with XP awards, badge triggers, and personalized recommendations.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. The backend lives at `backend/`. You will create the education service, API routes, database migration, seed data, and comprehensive tests.

---

## IMPORTANT CONSTRAINTS

1. **Python 3.12 + FastAPI** — Use async/await everywhere. All database operations use SQLAlchemy 2.0 async sessions with asyncpg. No synchronous database calls.
2. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory. You will READ `dashboard/src/mocks/education.ts` to extract lesson content, but you will NOT edit it.
3. **Integrate with existing engines** — Phase 8 depends on the XP engine, badge engine, notification service, and activity feed from Phases 4 and 7. Import and call these services — do NOT re-implement them. If an import fails because a service doesn't exist yet, create a minimal stub interface that matches the expected contract.
4. **Idempotent completions** — A user completing the same lesson twice MUST NOT receive duplicate XP. The `complete_lesson` endpoint must be idempotent: return success with `already_completed: true` and `xp_awarded: 0` on re-completion.
5. **Public content, private tracking** — Track listings and lesson content are served without authentication (for SEO). Completion tracking, progress, and recommendations require a valid JWT.
6. **All lesson content from education.ts** — Every single lesson from `dashboard/src/mocks/education.ts` must be seeded into the database. Do not skip any track or lesson. The seed migration must contain all 24 lessons with their full Markdown content.
7. **Testing is NON-NEGOTIABLE** — 85%+ coverage on all Phase 8 modules. Every test case listed in the Testing Requirements section must be implemented and passing before this phase is considered complete.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Full backend architecture, database schema, API design, service components. This is your primary reference for how the backend is structured.
2. `docs/backend-service/roadmap/phase-08-education.md` — The authoritative specification for Phase 8. Contains the complete architecture diagram, content structure, completion flow sequence diagram, EducationService class, content interpolator, database schema, all 6 API endpoints, and every test case.
3. `docs/backend-service/roadmap/phase-04-gamification.md` — Phase 4 context. The XP engine (`award_xp`), badge engine (`award_badge`), and level system that Phase 8 integrates with. Understand the function signatures before calling them.
4. `docs/backend-service/roadmap/phase-07-social-cooperatives.md` — Phase 7 context. The notification service (`notify_user`) and activity feed (`record_activity`) that Phase 8 calls when lessons and tracks are completed.
5. `dashboard/src/mocks/education.ts` — The frontend mock data file containing all 4 tracks and 24 lessons. This is your source of truth for lesson content. Parse this file and extract every lesson's Markdown content for the database seed migration.
6. `docs/backend-service/roadmap/phase-00-testing.md` — Testing infrastructure conventions: pytest fixtures, database factories, coverage requirements, CI configuration.
7. `docs/thebitcoingame-project-plan.md` — Overall project context, phase dependencies, and architecture overview.

Read ALL of these before writing any code. The Phase 8 roadmap file contains the exact implementation to follow.

---

## What You Are Building

### Part 1: Database Schema & Migration

Create an Alembic migration (`migrations/versions/008_education_system.py`) with 4 tables:

```sql
-- Education tracks
CREATE TABLE education_tracks (
    id                  VARCHAR(10) PRIMARY KEY,
    title               VARCHAR(200) NOT NULL,
    description         TEXT NOT NULL,
    lesson_count        INTEGER NOT NULL DEFAULT 0,
    estimated_minutes   INTEGER NOT NULL DEFAULT 0,
    "order"             INTEGER NOT NULL DEFAULT 0,
    is_published        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Education lessons (content stored as Markdown)
CREATE TABLE education_lessons (
    id                  VARCHAR(10) PRIMARY KEY,
    track_id            VARCHAR(10) NOT NULL REFERENCES education_tracks(id) ON DELETE CASCADE,
    "order"             INTEGER NOT NULL,
    title               VARCHAR(200) NOT NULL,
    estimated_minutes   INTEGER NOT NULL DEFAULT 5,
    content             TEXT NOT NULL,
    is_published        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_lesson_track_order UNIQUE (track_id, "order")
);

CREATE INDEX idx_lesson_track ON education_lessons (track_id, "order");

-- User lesson completions
CREATE TABLE user_lesson_completions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(128) NOT NULL,
    track_id        VARCHAR(10) NOT NULL REFERENCES education_tracks(id),
    lesson_id       VARCHAR(10) NOT NULL REFERENCES education_lessons(id),
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_lesson UNIQUE (user_id, lesson_id)
);

CREATE INDEX idx_user_lesson_user ON user_lesson_completions (user_id, track_id);
CREATE INDEX idx_user_lesson_completed ON user_lesson_completions (completed_at DESC);

-- User track completions
CREATE TABLE user_track_completions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(128) NOT NULL,
    track_id        VARCHAR(10) NOT NULL REFERENCES education_tracks(id),
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_track UNIQUE (user_id, track_id)
);

CREATE INDEX idx_user_track_user ON user_track_completions (user_id);
```

### Part 2: SQLAlchemy Models

Create `backend/app/models/education.py` with 4 models matching the schema above. Use `Mapped` type annotations with `mapped_column()` (SQLAlchemy 2.0 style):

```python
from sqlalchemy import String, Integer, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from uuid import uuid4

from app.models.base import Base, TimestampMixin


class EducationTrack(Base, TimestampMixin):
    __tablename__ = "education_tracks"

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    lesson_count: Mapped[int] = mapped_column(Integer, default=0)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=0)
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)

    lessons: Mapped[list["EducationLesson"]] = relationship(
        back_populates="track", order_by="EducationLesson.order"
    )


class EducationLesson(Base, TimestampMixin):
    __tablename__ = "education_lessons"

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    track_id: Mapped[str] = mapped_column(
        String(10), ForeignKey("education_tracks.id", ondelete="CASCADE")
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=5)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)

    track: Mapped["EducationTrack"] = relationship(back_populates="lessons")

    __table_args__ = (
        UniqueConstraint("track_id", "order", name="uq_lesson_track_order"),
    )
```

### Part 3: Content Interpolator

Create `backend/app/services/content_interpolator.py`:

The interpolator replaces `{placeholder}` tokens in lesson Markdown content with user-specific mining data fetched from Redis. It handles 4 placeholders:

| Placeholder       | Source                              | Example Value           | Default Fallback         |
|-------------------|-------------------------------------|-------------------------|--------------------------|
| `{hashrate}`      | `user:hashrate:{user_id}` in Redis  | "500.0G H/s"            | "500.0G H/s"             |
| `{shareDiff}`     | `user:share_diff:{user_id}` in Redis| "65,536"                | "65,536"                 |
| `{networkDiff}`   | `network:difficulty` in Redis        | "86.4T"                 | "86.4T"                  |
| `{ratio}`         | networkDiff / shareDiff              | "1.3G"                  | "1.3G"                   |

Requirements:
- Use a regex pattern `r'\{(\w+)\}'` to match placeholders
- Unknown placeholders are left as-is (no error, no removal)
- Provide a `format_number()` helper that formats large numbers with T/G/M/K suffixes
- The `get_user_interpolation_data()` function is async and gracefully handles missing Redis keys by using sensible defaults

### Part 4: Education Service

Create `backend/app/services/education_service.py` following the class design in the Phase 8 roadmap:

The `EducationService` class provides:

1. **`list_tracks()`** — Returns all published tracks ordered by `order` field
2. **`get_track(track_id)`** — Returns a single track with its lessons
3. **`get_lesson_content(track_id, lesson_id, user_id=None)`** — Returns lesson content, interpolated with user data if `user_id` is provided
4. **`complete_lesson(user_id, track_id, lesson_id)`** — Marks a lesson complete with these side effects:
   - Awards 25 XP via `award_xp()`
   - Records an activity via `record_activity()`
   - Sends a notification via `notify_user()`
   - Checks if all lessons in the track are now complete:
     - If yes: awards 50 bonus XP, records track completion, sends notification
     - Checks if this is the user's first track completion:
       - If yes: awards "rabbit-hole-complete" badge via `award_badge()`
5. **`get_progress(user_id)`** — Returns per-track progress with completion counts and percentages
6. **`get_recommendations(user_id)`** — Returns next-lesson recommendations sorted by: in-progress tracks first (by highest completion %), then not-started tracks

XP values: **25 XP per lesson, 50 XP bonus per track completion**.

### Part 5: Seed Data Migration

Create `backend/migrations/versions/008_seed_education.py` (or include in the same migration as the schema).

Parse the content from `dashboard/src/mocks/education.ts` and create INSERT statements for:

- **4 tracks:**
  - Track 1: "What's Happening on My Bitaxe?" (5 lessons, 20 min)
  - Track 2: "Understanding Bitcoin" (8 lessons, 45 min)
  - Track 3: "Securing Your Bitcoin" (5 lessons, 30 min)
  - Track 4: "Running a Node" (6 lessons, 35 min)

- **24 lessons** with their full Markdown content, including the dynamic interpolation placeholders (`{hashrate}`, `{shareDiff}`, `{networkDiff}`, `{ratio}`)

**CRITICAL:** The Markdown content contains single quotes that must be properly escaped in SQL. Use parameterized inserts or Alembic's `op.bulk_insert()` to avoid SQL injection issues with the content.

### Part 6: API Endpoints

Create `backend/app/api/v1/education.py` with 6 endpoints:

| # | Method | Path                                                   | Auth     | Description                                 |
|---|--------|--------------------------------------------------------|----------|---------------------------------------------|
| 1 | GET    | `/api/v1/education/tracks`                             | Optional | List all tracks (with progress if auth'd)   |
| 2 | GET    | `/api/v1/education/tracks/{track_id}`                  | Optional | Track detail with lesson list               |
| 3 | GET    | `/api/v1/education/tracks/{track_id}/lessons/{lesson_id}` | Optional | Lesson content (interpolated if auth'd)  |
| 4 | POST   | `/api/v1/education/lessons/{lesson_id}/complete`       | Required | Complete a lesson, award XP                 |
| 5 | GET    | `/api/v1/education/progress`                           | Required | User's progress across all tracks           |
| 6 | GET    | `/api/v1/education/recommendations`                    | Required | Recommended next lessons                    |

Key behaviors:
- Endpoints 1-3 use `get_current_user_optional` — they work without auth but provide enriched responses when authenticated
- Endpoints 4-6 use `get_current_user` — they require a valid JWT
- Endpoint 4 returns: `{ completed: true, already_completed: bool, xp_awarded: int, track_completed: bool, badge_earned: string|null }`
- All error responses use proper HTTP status codes: 404 for not found, 401 for unauthorized, 422 for validation errors

### Part 7: Register the Router

Add the education router to the FastAPI app in the existing `backend/app/main.py` (or wherever routers are registered). The prefix should be `/api/v1/education` with tag `["education"]`.

---

## Testing Requirements

**Testing is NON-NEGOTIABLE.** Every test below must pass before Phase 8 is complete.

### Unit Tests — `tests/phase8/test_interpolator.py`

| # | Test Case                                    | Assertions                                   |
|---|----------------------------------------------|----------------------------------------------|
| 1 | Interpolate content — all 4 placeholders     | All `{hashrate}`, `{shareDiff}`, `{networkDiff}`, `{ratio}` replaced |
| 2 | Interpolate content — unknown placeholder    | `{unknownThing}` left as-is in output        |
| 3 | Interpolate content — no placeholders        | Content returned unchanged                   |
| 4 | `format_number` — trillions (86.4T)          | Returns `"86.4T"`                            |
| 5 | `format_number` — billions (500G)            | Returns `"500.0G"`                           |
| 6 | `format_number` — thousands (65,536)         | Returns `"65,536"`                           |

### Unit Tests — `tests/phase8/test_education.py`

| # | Test Case                                         | Assertions                                      |
|---|---------------------------------------------------|-------------------------------------------------|
| 7 | Complete lesson — first time                      | 25 XP awarded, `completed: true`                |
| 8 | Complete lesson — already completed (idempotent)  | 0 XP, `already_completed: true`                 |
| 9 | Complete lesson — invalid lesson_id               | Raises `ValueError` or returns 404              |
| 10| Track completion — all 5 lessons in track 1       | 50 bonus XP, `track_completed: true`            |
| 11| Track completion — partial (4 of 5 lessons)       | `track_completed: false`                        |
| 12| Rabbit Hole badge — first track completion        | Badge awarded via `award_badge()`               |
| 13| Rabbit Hole badge — second track (no duplicate)   | No duplicate badge                              |
| 14| Recommendations — no progress                     | 4 recommendations (first lesson of each track)  |
| 15| Recommendations — partial progress                | In-progress tracks prioritized                  |
| 16| Recommendations — all tracks complete              | Empty recommendations list                     |
| 17| Progress calculation — accuracy                   | Percent matches `completed / total * 100`       |

### Integration Tests — `tests/phase8/test_education_integration.py`

| # | Test Case                                          | Assertions                                       |
|---|---------------------------------------------------|--------------------------------------------------|
| 1 | Seed verification — 4 tracks exist                 | `SELECT COUNT(*) FROM education_tracks` = 4      |
| 2 | Seed verification — 24 lessons exist               | `SELECT COUNT(*) FROM education_lessons` = 24    |
| 3 | Seed verification — lesson counts match            | Track 1: 5, Track 2: 8, Track 3: 5, Track 4: 6 |
| 4 | `GET /api/v1/education/tracks` — no auth           | Returns 4 tracks, HTTP 200                       |
| 5 | `GET /api/v1/education/tracks/1/lessons/1-1` — no auth | Returns lesson content, HTTP 200            |
| 6 | `GET /api/v1/education/tracks/1/lessons/1-1` — with auth | Returns interpolated content               |
| 7 | `POST /api/v1/education/lessons/1-1/complete`      | 25 XP awarded, HTTP 200                          |
| 8 | Full track completion cycle                        | Complete 5 track-1 lessons → 125 XP + 50 bonus + badge |
| 9 | `GET /api/v1/education/progress`                   | Returns accurate per-track progress              |
| 10| `GET /api/v1/education/recommendations`            | Returns ordered recommendations                  |
| 11| Auth validation on protected endpoints             | 401 without JWT on endpoints 4-6                 |

### Coverage Target

```bash
pytest tests/phase8/ -v \
    --cov=app/services/education_service \
    --cov=app/services/content_interpolator \
    --cov=app/api/v1/education \
    --cov-report=term-missing \
    --cov-fail-under=85
```

**Minimum: 85% coverage across all Phase 8 modules. Target: 90%+.**

---

## Rules

1. **Read the Phase 8 roadmap first.** `docs/backend-service/roadmap/phase-08-education.md` is the authoritative spec. Implement what is documented there.
2. **Parse all 24 lessons from `education.ts`.** Every lesson from the frontend mock must appear in the seed migration. Do not abbreviate, skip, or summarize lesson content.
3. **Idempotent completions.** Re-completing a lesson MUST return `already_completed: true` with 0 XP. Never award duplicate XP.
4. **XP values are sacred.** 25 XP per lesson, 50 XP per track completion bonus. These numbers come from the product design and must not be changed.
5. **Public endpoints serve content without auth.** Tracks 1-3 (listing, detail, lesson content) must work without a JWT. This is required for SEO crawlability.
6. **Interpolation is user-specific.** When an authenticated user views a lesson, their real mining stats replace `{hashrate}`, `{shareDiff}`, `{networkDiff}`, `{ratio}`. When unauthenticated, serve raw Markdown with placeholders unchanged (or use default values).
7. **Use existing patterns.** Follow the same file structure, naming conventions, and coding style established in Phases 0-7. Check how other services are implemented before creating new patterns.
8. **Alembic for all schema changes.** All tables must be created via Alembic migration, not raw SQL scripts. Use `op.create_table()` or `op.execute()` with proper upgrade/downgrade functions.
9. **No hardcoded database connections.** Use the dependency injection pattern (`Depends(get_db)`) established in earlier phases.
10. **Handle missing dependencies gracefully.** If the XP engine, badge engine, or notification service from earlier phases are not yet fully implemented, create stub interfaces that match the expected function signatures. Log a warning but do not crash.
11. **SQL escaping in seed data.** Lesson content contains Markdown with single quotes, backticks, and special characters. Use parameterized queries or `op.bulk_insert()` — never string concatenation for INSERT statements.
12. **Tests use factories and fixtures.** Follow the testing patterns from Phase 0. Use database factories for creating test data, not raw SQL in tests.

---

## Files to Create/Edit

| Action | File                                                       |
|--------|------------------------------------------------------------|
| CREATE | `backend/app/models/education.py`                          |
| CREATE | `backend/app/services/education_service.py`                |
| CREATE | `backend/app/services/content_interpolator.py`             |
| CREATE | `backend/app/api/v1/education.py`                          |
| CREATE | `backend/migrations/versions/008_education_system.py`      |
| CREATE | `backend/migrations/versions/008_seed_education.py`        |
| CREATE | `tests/phase8/__init__.py`                                 |
| CREATE | `tests/phase8/test_interpolator.py`                        |
| CREATE | `tests/phase8/test_education.py`                           |
| CREATE | `tests/phase8/test_education_integration.py`               |
| CREATE | `tests/phase8/conftest.py`                                 |
| EDIT   | `backend/app/models/__init__.py` — Add education model imports |
| EDIT   | `backend/app/main.py` — Register education router          |

---

## Definition of Done

1. Alembic migration creates all 4 tables (`education_tracks`, `education_lessons`, `user_lesson_completions`, `user_track_completions`) with proper constraints and indexes.
2. Seed migration inserts exactly 4 tracks and 24 lessons with full Markdown content from `education.ts`.
3. `SELECT COUNT(*) FROM education_tracks` returns 4 after migration.
4. `SELECT COUNT(*) FROM education_lessons` returns 24 after migration.
5. Content interpolator replaces all 4 placeholder types (`{hashrate}`, `{shareDiff}`, `{networkDiff}`, `{ratio}`) with formatted values from Redis.
6. `GET /api/v1/education/tracks` returns 4 tracks without authentication.
7. `GET /api/v1/education/tracks/1/lessons/1-1` returns the full lesson Markdown without authentication.
8. `POST /api/v1/education/lessons/1-1/complete` awards 25 XP and records the completion (requires auth).
9. Completing the same lesson again returns `already_completed: true` with `xp_awarded: 0`.
10. Completing all 5 lessons in Track 1 awards 50 bonus XP and sets `track_completed: true`.
11. Completing a first track awards the "rabbit-hole-complete" badge.
12. `GET /api/v1/education/progress` returns accurate completion counts and percentages per track.
13. `GET /api/v1/education/recommendations` returns in-progress tracks first, sorted by completion percentage.
14. All 17 unit tests pass.
15. All 11 integration tests pass.
16. Coverage report shows 85%+ across `education_service.py`, `content_interpolator.py`, and `education.py` (routes).
17. `alembic upgrade head` runs without errors on a fresh database.
18. No TypeScript errors in the frontend (`tsc --noEmit` in `dashboard/` still passes — you didn't break anything).

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Read all reference files** — Read the Phase 8 roadmap, master plan, Phase 4 (XP/badges), Phase 7 (notifications), and `education.ts` mock data. Understand the full picture before writing code.
2. **Create SQLAlchemy models** — Define the 4 model classes in `backend/app/models/education.py`. Register them in the models `__init__.py`.
3. **Create Alembic migration (schema)** — Generate or write the migration to create the 4 tables with all constraints and indexes.
4. **Create seed data migration** — Parse `dashboard/src/mocks/education.ts` and create INSERT statements for all 4 tracks and 24 lessons. Ensure proper SQL escaping of Markdown content.
5. **Run migration** — Verify `alembic upgrade head` works and the correct number of rows exist in each table.
6. **Build content interpolator** — Implement `interpolate_content()`, `format_number()`, and `get_user_interpolation_data()`. Write interpolator unit tests (tests 1-6).
7. **Build education service** — Implement `EducationService` with all 6 methods. Wire up calls to `award_xp()`, `award_badge()`, `notify_user()`, and `record_activity()`. Write education unit tests (tests 7-17).
8. **Build API routes** — Implement all 6 endpoints with proper auth handling (optional vs required). Register the router in the app.
9. **Write integration tests** — Test all endpoints end-to-end against a real test database with seeded data. Verify the full track completion cycle (5 lessons → XP → badge).
10. **Coverage report** — Run `pytest --cov` and verify 85%+ coverage. Fill any gaps. Clean up code and run a final check.

**Critical: Get step 5 working before step 7.** The education service needs seeded data in the database to function. Verify the seed migration is correct before building the service layer.
