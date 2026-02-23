# Prompt: Backend Service — Phase 0 (Foundation & Project Setup)

You are building the backend API service for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite 7, in `dashboard/`). The mining engine (CKPool fork) and event collector are already running at `services/ckpool/` and `services/event-collector/`. The existing Docker Compose at `services/docker-compose.yml` has bitcoin-signet, ckpool, redis, timescaledb, event-collector, prometheus, and grafana. The database `init.sql` at `services/event-collector/sql/init.sql` defines the existing schema (users, workers, shares, blocks, weekly_best_diff, mining_events, rate_limit_events, hourly_shares, daily_shares continuous aggregates).

This phase scaffolds the FastAPI project at `services/api/`, integrates it into the existing Docker Compose stack, configures Alembic for database migrations, builds the middleware stack, sets up testing infrastructure, and creates the CI pipeline. No business logic — just the rock-solid foundation that every subsequent phase depends on.

---

## IMPORTANT CONSTRAINTS

1. **macOS development machine** — everything runs in Docker. The API service is Dockerized alongside the existing stack. You may run Python tests natively (pytest) but the deployed service always runs in Docker.
2. **Do not touch `dashboard/`** — the frontend is complete. Do not modify anything in the dashboard directory.
3. **Do not touch `services/ckpool/` or `services/event-collector/`** — these services are working. You are ADDING a new `services/api/` service to the stack, not modifying existing services.
4. **Do not recreate the database schema** — the `init.sql` already creates all core tables (users, workers, shares, blocks, etc.). Your Alembic baseline migration must MATCH the existing schema, not replace it. Use `alembic stamp head` semantics.
5. **Python 3.12+ only** — use modern Python features: `type` keyword imports, `|` union syntax, `match` statements where appropriate.
6. **Strict typing everywhere** — mypy strict mode with zero errors. Every function has type annotations. No `Any` unless absolutely unavoidable.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Full architecture overview, data flow diagrams, database schema (~45 tables), API design (~100 endpoints), WebSocket design, background workers, security model. This is your primary reference for the entire backend.
2. `docs/backend-service/roadmap/phase-00-foundation.md` — Detailed Phase 0 specification with code snippets for every module, middleware, health endpoint, Alembic config, Dockerfile, CI pipeline, and test cases. This is your implementation blueprint.
3. `docs/backend-service/roadmap/00-overview.md` — Roadmap overview showing all 11 phases and their dependencies. Phase 0 blocks everything.
4. `services/docker-compose.yml` — The existing Docker Compose stack you are extending. Study the service names, networks, volumes, and health checks.
5. `services/event-collector/sql/init.sql` — The existing database schema. Your Alembic baseline must match this exactly.
6. `services/event-collector/src/schemas.py` — Event types and schemas from the event collector. The API will consume these same event types.
7. `services/event-collector/src/redis_publisher.py` — How events are published to Redis Streams (stream key format: `mining:{event_type}`).
8. `services/event-collector/src/db_writer.py` — How events are written to TimescaleDB (batch writes, table mapping).

Read ALL of these before writing any code. The Phase 0 roadmap document contains the exact code for every module.

---

## What You Are Building

### Part 1: Project Directory Structure

Create the following structure at `services/api/`:

```
services/api/
  Dockerfile
  pyproject.toml
  alembic.ini
  alembic/
    env.py
    script.py.mako
    versions/
      001_baseline.py
  src/
    tbg/
      __init__.py
      main.py                    # FastAPI app factory
      config.py                  # pydantic-settings configuration
      database.py                # Async SQLAlchemy engine + session
      redis_client.py            # Redis connection pool
      dependencies.py            # Shared FastAPI dependencies
      middleware/
        __init__.py              # Middleware registration
        cors.py                  # CORS configuration
        rate_limit.py            # Redis-backed rate limiting
        request_id.py            # X-Request-ID propagation
        error_handler.py         # Global error handler (consistent JSON)
        logging.py               # structlog JSON configuration
      health/
        __init__.py
        router.py                # /health, /ready, /version endpoints
      db/
        __init__.py
        base.py                  # SQLAlchemy DeclarativeBase
        models.py                # Existing table models (users, workers, shares, blocks)
  tests/
    __init__.py
    conftest.py                  # Async fixtures, test DB, test client
    test_health.py               # Health endpoint tests
    test_middleware.py            # Middleware tests (CORS, rate limit, request ID, errors)
    test_alembic.py              # Migration up/down tests
```

### Part 2: pyproject.toml

```toml
[project]
name = "tbg-api"
version = "0.1.0"
description = "The Bitcoin Game — Backend API"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "sqlalchemy[asyncio]>=2.0.35",
    "asyncpg>=0.30.0",
    "alembic>=1.14.0",
    "redis[hiredis]>=5.2.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.6.0",
    "structlog>=24.4.0",
    "python-json-logger>=2.0.0",
    "httpx>=0.28.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[argon2]>=1.7.4",
    "coincurve>=20.0.0",
    "arq>=0.26.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "httpx>=0.28.0",
    "testcontainers[postgres,redis]>=4.8.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
    "sqlalchemy[mypy]>=2.0.35",
    "freezegun>=1.4.0",
    "factory-boy>=3.3.0",
]

[tool.ruff]
target-version = "py312"
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "ANN", "ASYNC", "B", "A", "C4", "DTZ", "T20", "ICN", "PIE", "PT", "RSE", "RET", "SLF", "SIM", "TID", "TCH", "ARG", "PTH", "ERA", "PL", "TRY", "FLY", "PERF", "FURB", "RUF"]

[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["sqlalchemy.ext.mypy.plugin", "pydantic.mypy"]
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "-v --cov=src/tbg --cov-report=term-missing --cov-fail-under=80"

[build-system]
requires = ["setuptools>=75.0"]
build-backend = "setuptools.build_meta"
```

### Part 3: Application Factory (main.py)

The app factory pattern creates the FastAPI application with lifespan management:

```python
"""services/api/src/tbg/main.py — FastAPI application factory."""
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI

from tbg.config import get_settings
from tbg.database import init_db, close_db
from tbg.redis_client import init_redis, close_redis
from tbg.middleware import setup_middleware
from tbg.health.router import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    settings = get_settings()
    await init_db(settings.database_url)
    await init_redis(settings.redis_url)
    yield
    await close_db()
    await close_redis()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    app = FastAPI(
        title="The Bitcoin Game API",
        description="Backend API for The Bitcoin Game — Bitcoin mining gamification platform",
        version=settings.app_version,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=lifespan,
    )
    setup_middleware(app, settings)
    app.include_router(health_router, tags=["Health"])
    return app

app = create_app()
```

### Part 4: Configuration (config.py)

Use pydantic-settings with `TBG_` prefix for all environment variables:

```python
"""services/api/src/tbg/config.py — Application settings via pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TBG_",
        env_file=".env",
        case_sensitive=False,
    )

    # Application
    app_version: str = "0.1.0"
    debug: bool = False
    environment: str = "development"

    # Database (TimescaleDB)
    database_url: str = "postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window_seconds: int = 60

    # Logging
    log_level: str = "INFO"
    log_format: str = "json"  # "json" or "console"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### Part 5: Database Module (database.py)

Async SQLAlchemy 2.0 with session dependency injection:

```python
"""services/api/src/tbg/database.py — Async SQLAlchemy engine and session management."""
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


async def init_db(url: str) -> None:
    global _engine, _session_factory
    _engine = create_async_engine(url, pool_size=20, max_overflow=10, pool_pre_ping=True, echo=False)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


async def close_db() -> None:
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


async def get_session() -> AsyncSession:
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    async with _session_factory() as session:
        yield session  # type: ignore[misc]
```

### Part 6: Redis Client (redis_client.py)

```python
"""services/api/src/tbg/redis_client.py — Redis connection pool."""
import redis.asyncio as redis

_pool: redis.Redis | None = None


async def init_redis(url: str) -> None:
    global _pool
    _pool = redis.from_url(url, encoding="utf-8", decode_responses=True, max_connections=50)


async def close_redis() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_redis() -> redis.Redis:
    if _pool is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _pool
```

### Part 7: Middleware Stack

Implement 5 middleware components in `src/tbg/middleware/`:

1. **CORS** (`cors.py`) — Allow dashboard origins, expose `X-Request-Id` and `X-RateLimit-Remaining`
2. **Request ID** (`request_id.py`) — Generate UUID if no `X-Request-Id` header, bind to structlog context, echo in response
3. **Rate Limiting** (`rate_limit.py`) — Redis-backed sliding window, per-IP, skip `/health` and `/ready`, return 429 with `Retry-After` header, set `X-RateLimit-Remaining` and `X-RateLimit-Limit` headers
4. **Error Handler** (`error_handler.py`) — Global exception handler returning `{"detail": "..."}` JSON for 500 and 404 errors, log with structlog
5. **Logging** (`logging.py`) — Configure structlog with JSON renderer (production) or console renderer (development), timestamps, log levels, context vars

The middleware `__init__.py` registers all middleware in correct order via `setup_middleware(app, settings)`.

See `docs/backend-service/roadmap/phase-00-foundation.md` Section 0.5 for the complete code for all 5 middleware modules.

### Part 8: Health Endpoints

Three health endpoints in `src/tbg/health/router.py`:

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/health` | Liveness probe — returns 200 if process alive | No |
| GET | `/ready` | Readiness — checks DB (SELECT 1) + Redis (PING) | No |
| GET | `/version` | Returns `app_version` and `environment` | No |

```python
@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}

@router.get("/ready")
async def readiness(db: AsyncSession = Depends(get_session)) -> dict[str, object]:
    checks: dict[str, object] = {}
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"
    all_ok = all(v == "ok" for v in checks.values())
    return {"status": "ready" if all_ok else "degraded", "checks": checks}

@router.get("/version")
async def version() -> dict[str, str]:
    settings = get_settings()
    return {"version": settings.app_version, "environment": settings.environment}
```

### Part 9: Dockerfile (Multi-Stage)

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY src/ ./src/

CMD ["sh", "-c", "alembic upgrade head && uvicorn tbg.main:app --host 0.0.0.0 --port 8000 --reload"]
```

### Part 10: Docker Compose Integration

Add the `api` service to the existing `services/docker-compose.yml`:

```yaml
  # Backend API (FastAPI)
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: tbg-api
    depends_on:
      timescaledb:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "8000:8000"
    environment:
      TBG_DATABASE_URL: postgresql+asyncpg://tbg:tbgdev2026@timescaledb:5432/thebitcoingame
      TBG_REDIS_URL: redis://redis:6379/0
      TBG_DEBUG: "true"
      TBG_ENVIRONMENT: development
      TBG_LOG_LEVEL: DEBUG
      TBG_CORS_ORIGINS: '["http://localhost:5173","http://localhost:3000"]'
    volumes:
      - ./api/src:/app/src:ro
    healthcheck:
      test: ["CMD", "python", "-c", "import httpx; r = httpx.get('http://localhost:8000/health'); r.raise_for_status()"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped
```

### Part 11: Alembic Configuration

Configure Alembic with async SQLAlchemy engine. The baseline migration (001) does NOT create tables — they already exist from `init.sql`. It just stamps the baseline.

**alembic.ini** — standard config with `script_location = alembic`.

**alembic/env.py** — uses `create_async_engine` with `asyncio.run(run_migrations_online())`, imports `Base.metadata` from `tbg.db.base`, reads URL from `get_settings().database_url`.

**alembic/versions/001_baseline.py** — `upgrade()` and `downgrade()` are both `pass`. This migration exists solely to establish Alembic's version tracking against the existing schema.

See `docs/backend-service/roadmap/phase-00-foundation.md` Section 0.7 for the complete Alembic code.

### Part 12: SQLAlchemy Models for Existing Tables

Create `src/tbg/db/base.py` with `DeclarativeBase` and `src/tbg/db/models.py` with ORM models for the tables that already exist in `init.sql`:

- `User` (maps to `users`)
- `Worker` (maps to `workers`)
- `Share` (maps to `shares`)
- `Block` (maps to `blocks`)
- `WeeklyBestDiff` (maps to `weekly_best_diff`)
- `MiningEvent` (maps to `mining_events`)
- `RateLimitEvent` (maps to `rate_limit_events`)
- `SchemaMigration` (maps to `schema_migrations`)

These models use `__table_args__ = {"extend_existing": True}` since the tables are created by init.sql, not by Alembic.

### Part 13: Test Infrastructure (conftest.py)

```python
"""services/api/tests/conftest.py — Shared test fixtures."""
import asyncio
from collections.abc import AsyncGenerator
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from tbg.main import create_app
from tbg.config import get_settings, Settings
from tbg.database import get_session, init_db, close_db
from tbg.redis_client import init_redis, close_redis, get_redis


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app = create_app()
    settings = get_settings()
    await init_db(settings.database_url)
    await init_redis(settings.redis_url)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_db()
    await close_redis()


@pytest_asyncio.fixture
async def redis_client() -> AsyncGenerator:
    settings = get_settings()
    await init_redis(settings.redis_url)
    client = get_redis()
    yield client
    await client.flushdb()
    await close_redis()
```

### Part 14: CI Pipeline

Create `.github/workflows/api-ci.yml` with 3 parallel jobs:

1. **lint** — `ruff check src/ tests/` and `ruff format --check src/ tests/`
2. **type-check** — `mypy src/tbg/ --strict`
3. **test** — Start TimescaleDB + Redis as service containers, run `alembic upgrade head`, then `pytest --cov-fail-under=80`

Trigger on push/PR to `services/api/**` paths.

See `docs/backend-service/roadmap/phase-00-foundation.md` Section 0.8 for the complete workflow YAML.

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**. Every test must pass before Phase 0 is complete.

### Health Endpoint Tests (`test_health.py`)

```python
@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

@pytest.mark.asyncio
async def test_readiness(client: AsyncClient) -> None:
    response = await client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["checks"]["database"] == "ok"
    assert data["checks"]["redis"] == "ok"

@pytest.mark.asyncio
async def test_version(client: AsyncClient) -> None:
    response = await client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "environment" in data
```

### Middleware Tests (`test_middleware.py`)

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Request ID generated when absent | `X-Request-Id` header present, 36-char UUID |
| 2 | Custom request ID preserved | Send `X-Request-Id: test-123`, response echoes it |
| 3 | Rate limit headers present | `X-RateLimit-Remaining` and `X-RateLimit-Limit` on every response |
| 4 | Rate limit blocks excess requests | 101st request returns 429 with `Retry-After` header |
| 5 | Health exempt from rate limit | 200 requests to `/health` all return 200 |
| 6 | CORS headers on preflight | `OPTIONS /health` with `Origin: http://localhost:5173` returns `access-control-allow-origin` |
| 7 | 404 returns JSON | `GET /nonexistent` returns `{"detail": "Not found"}` |
| 8 | Global error handler catches 500s | Internal error returns JSON `{"detail": "Internal server error"}` |

### Alembic Tests (`test_alembic.py`)

| # | Test | Pass Criteria |
|---|---|---|
| 1 | `alembic upgrade head` succeeds | No errors, baseline stamps |
| 2 | `alembic downgrade base` succeeds | No errors |
| 3 | Existing tables remain intact after upgrade | `users`, `workers`, `shares` tables still exist with data |

### Coverage Target: **80%+** overall

---

## Rules

1. **Read the Phase 0 roadmap first.** `docs/backend-service/roadmap/phase-00-foundation.md` contains the exact code for every module. Use it as your starting point.
2. **Do not touch `dashboard/`.** The frontend is complete and working.
3. **Do not touch `services/ckpool/` or `services/event-collector/`.** They are working. You are ADDING to the stack, not modifying it.
4. **EDIT `services/docker-compose.yml`**, do not create a separate compose file. Add the `api` service to the existing file.
5. **Alembic baseline must match `init.sql`.** Do not create tables that already exist. The 001 migration is a no-op stamp.
6. **Use `async` everywhere.** Async SQLAlchemy, async Redis, async test fixtures. No sync database calls.
7. **structlog for all logging.** No `print()`, no `logging.getLogger()`. Use `structlog.get_logger()`.
8. **Consistent error format.** Every error response is `{"detail": "..."}`. Never return HTML or plaintext errors.
9. **Type annotations on everything.** mypy strict mode. No `Any` types. No `# type: ignore` without justification.
10. **Install all production dependencies even if unused in Phase 0.** The `pyproject.toml` includes coincurve, python-jose, passlib, arq — they are needed in Phase 1+ but should be in the base image now to avoid rebuilds later.
11. **Test with the real Docker Compose stack.** After writing the code, run `docker compose up --build` and verify the API responds on port 8000.
12. **Keep it modular.** Each middleware is a separate file. Health is a separate module. Database and Redis are separate modules. This structure scales to 10+ modules.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `services/api/pyproject.toml` |
| CREATE | `services/api/Dockerfile` |
| CREATE | `services/api/alembic.ini` |
| CREATE | `services/api/alembic/env.py` |
| CREATE | `services/api/alembic/script.py.mako` |
| CREATE | `services/api/alembic/versions/001_baseline.py` |
| CREATE | `services/api/src/tbg/__init__.py` |
| CREATE | `services/api/src/tbg/main.py` |
| CREATE | `services/api/src/tbg/config.py` |
| CREATE | `services/api/src/tbg/database.py` |
| CREATE | `services/api/src/tbg/redis_client.py` |
| CREATE | `services/api/src/tbg/dependencies.py` |
| CREATE | `services/api/src/tbg/middleware/__init__.py` |
| CREATE | `services/api/src/tbg/middleware/cors.py` |
| CREATE | `services/api/src/tbg/middleware/rate_limit.py` |
| CREATE | `services/api/src/tbg/middleware/request_id.py` |
| CREATE | `services/api/src/tbg/middleware/error_handler.py` |
| CREATE | `services/api/src/tbg/middleware/logging.py` |
| CREATE | `services/api/src/tbg/health/__init__.py` |
| CREATE | `services/api/src/tbg/health/router.py` |
| CREATE | `services/api/src/tbg/db/__init__.py` |
| CREATE | `services/api/src/tbg/db/base.py` |
| CREATE | `services/api/src/tbg/db/models.py` |
| CREATE | `services/api/tests/__init__.py` |
| CREATE | `services/api/tests/conftest.py` |
| CREATE | `services/api/tests/test_health.py` |
| CREATE | `services/api/tests/test_middleware.py` |
| CREATE | `services/api/tests/test_alembic.py` |
| CREATE | `.github/workflows/api-ci.yml` |
| EDIT | `services/docker-compose.yml` |

---

## Definition of Done

1. `services/api/` directory exists with the complete structure (pyproject.toml, Dockerfile, alembic config, src/tbg/, tests/).
2. `docker compose up --build` from `services/` starts the full stack including the new `api` service.
3. The `api` service is healthy — `docker compose ps` shows it running, healthcheck passes.
4. `GET http://localhost:8000/health` returns `{"status": "healthy"}` with status 200.
5. `GET http://localhost:8000/ready` returns `{"status": "ready", "checks": {"database": "ok", "redis": "ok"}}`.
6. `GET http://localhost:8000/version` returns the correct version and environment.
7. `X-Request-Id` header is present on every response. Custom IDs are preserved.
8. Rate limiting blocks requests after exceeding the configured threshold with a 429 response.
9. `/health` and `/ready` are exempt from rate limiting.
10. CORS headers are set for configured origins on preflight requests.
11. All errors return consistent JSON format `{"detail": "..."}` — never HTML or plain text.
12. Alembic `upgrade head` succeeds against the existing database (tables already created by init.sql).
13. All pytest tests pass with 80%+ coverage.
14. `ruff check` and `ruff format --check` pass with zero warnings on `src/` and `tests/`.
15. `mypy --strict src/tbg/` passes with zero errors.

---

## Order of Implementation

1. **Create project directory and pyproject.toml** — Set up `services/api/` with all dependencies. Verify `pip install -e ".[dev]"` succeeds.
2. **Configuration module** — Create `config.py` with pydantic-settings. Test that env vars with `TBG_` prefix are loaded correctly.
3. **Database module** — Create `database.py` with async engine and session factory. Test connection to the existing TimescaleDB.
4. **Redis client module** — Create `redis_client.py`. Test PING against existing Redis container.
5. **Health endpoints** — Create `health/router.py` with `/health`, `/ready`, `/version`. Test each endpoint locally.
6. **Application factory** — Create `main.py` with lifespan management. Verify `uvicorn tbg.main:app` starts.
7. **Middleware stack** — Implement all 5 middleware (CORS, request ID, rate limit, error handler, logging) in order. Test each in isolation, then together.
8. **Dockerfile** — Create multi-stage Dockerfile. Build and test with `docker build`.
9. **Docker Compose integration** — Add `api` service to `services/docker-compose.yml`. Verify `docker compose up` boots full stack.
10. **SQLAlchemy models** — Create ORM models for existing tables. Verify they map correctly.
11. **Alembic configuration** — Configure async engine, create baseline migration. Test `alembic upgrade head` against existing DB.
12. **Test infrastructure** — Create `conftest.py` with async fixtures. Write all health, middleware, and Alembic tests.
13. **CI pipeline** — Create GitHub Actions workflow. Push and verify it runs.
14. **Coverage and linting** — Achieve 80%+ coverage. Fix all ruff and mypy issues.
15. **Full stack verification** — `docker compose down -v && docker compose up --build`. Verify everything starts from scratch.

**Critical: Get step 9 working before writing tests.** A running API in Docker Compose proves the foundation works. Tests verify the details.
