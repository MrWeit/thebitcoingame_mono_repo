# Phase 0 -- Foundation & Scaffolding

| Field        | Value                                    |
| ------------ | ---------------------------------------- |
| **Duration** | 2 weeks                                  |
| **Status**   | Not Started                              |
| **Owner**    | TBD                                      |
| **Depends**  | None (first phase)                       |
| **Blocks**   | Phase 1 -- Authentication & Users        |

---

## 0.1 Objectives

1. **Scaffold the FastAPI project** with a modular, domain-driven layout under `services/api/src/tbg/` that scales to 10+ modules without spaghetti imports.
2. **Integrate Docker Compose** by adding an `api` service to the existing `services/docker-compose.yml` stack alongside ckpool, Redis, TimescaleDB, and Prometheus.
3. **Create the Alembic baseline migration** that matches the existing `init.sql` schema so all future schema changes go through version-controlled migrations.
4. **Implement core middleware**: CORS, Redis-backed rate limiting, request ID propagation, structured JSON logging, and a global error handler.
5. **Establish the test infrastructure**: pytest + pytest-asyncio + httpx.AsyncClient with testcontainers for isolated DB testing and a CI pipeline running ruff + mypy strict + pytest.

---

## 0.2 Architecture

```mermaid
graph TB
    subgraph "services/api/"
        APP["FastAPI App<br/><small>main.py — app factory</small>"]
        MW["Middleware Stack"]
        R["Router Registry<br/><small>/health, /ready, /version</small>"]
        DB["Database<br/><small>async SQLAlchemy 2.0</small>"]
        RD["Redis Client<br/><small>redis.asyncio pool</small>"]
        CFG["Config<br/><small>pydantic-settings</small>"]
    end

    subgraph "Infrastructure (Docker Compose)"
        PG["TimescaleDB<br/><small>:5432</small>"]
        RS["Redis<br/><small>:6379</small>"]
    end

    APP --> MW
    MW --> R
    R --> DB
    R --> RD
    APP --> CFG
    DB --> PG
    RD --> RS

    style APP fill:#0d1117,stroke:#58a6ff,color:#fff
    style PG fill:#0d1117,stroke:#a371f7,color:#fff
    style RS fill:#0d1117,stroke:#ff6b6b,color:#fff
```

---

## 0.3 Project Scaffolding

### 0.3.1 Directory Structure

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
      main.py
      config.py
      database.py
      redis_client.py
      middleware/
        __init__.py
        cors.py
        rate_limit.py
        request_id.py
        error_handler.py
        logging.py
      health/
        __init__.py
        router.py
      db/
        __init__.py
        base.py
        models.py
  tests/
    __init__.py
    conftest.py
    test_health.py
    test_middleware.py
    test_alembic.py
```

### 0.3.2 pyproject.toml

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

### 0.3.3 Application Factory

```python
"""
services/api/src/tbg/main.py — FastAPI application factory.
"""
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

    # Register routers
    app.include_router(health_router, tags=["Health"])

    return app


app = create_app()
```

### 0.3.4 Configuration

```python
"""
services/api/src/tbg/config.py — Application settings via pydantic-settings.
"""
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

    # Database
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
    log_format: str = "json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### 0.3.5 Database Module

```python
"""
services/api/src/tbg/database.py — Async SQLAlchemy engine and session management.
"""
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


async def init_db(url: str) -> None:
    """Initialize the database engine and session factory."""
    global _engine, _session_factory
    _engine = create_async_engine(
        url,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        echo=False,
    )
    _session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def close_db() -> None:
    """Dispose of the database engine."""
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


async def get_session() -> AsyncSession:
    """Get an async database session (dependency injection)."""
    if _session_factory is None:
        msg = "Database not initialized. Call init_db() first."
        raise RuntimeError(msg)
    async with _session_factory() as session:
        yield session  # type: ignore[misc]
```

### 0.3.6 Redis Client

```python
"""
services/api/src/tbg/redis_client.py — Redis connection pool.
"""
import redis.asyncio as redis

_pool: redis.Redis | None = None


async def init_redis(url: str) -> None:
    """Initialize the Redis connection pool."""
    global _pool
    _pool = redis.from_url(
        url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
    )


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_redis() -> redis.Redis:
    """Get the Redis client (dependency injection)."""
    if _pool is None:
        msg = "Redis not initialized. Call init_redis() first."
        raise RuntimeError(msg)
    return _pool
```

---

## 0.4 Docker Compose Integration

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
      - "8000:8000"       # REST API
      - "8001:8001"       # WebSocket (Phase 3)
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

### 0.4.1 Dockerfile

```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

# Copy application code
COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY src/ ./src/

# Run migrations and start server
CMD ["sh", "-c", "alembic upgrade head && uvicorn tbg.main:app --host 0.0.0.0 --port 8000 --reload"]
```

---

## 0.5 Middleware Stack

### 0.5.1 Middleware Registry

```python
"""
services/api/src/tbg/middleware/__init__.py — Middleware registration.
"""
from fastapi import FastAPI
from tbg.config import Settings
from tbg.middleware.cors import setup_cors
from tbg.middleware.request_id import RequestIdMiddleware
from tbg.middleware.rate_limit import RateLimitMiddleware
from tbg.middleware.error_handler import setup_error_handlers
from tbg.middleware.logging import setup_logging


def setup_middleware(app: FastAPI, settings: Settings) -> None:
    """Register all middleware in the correct order (outermost first)."""
    setup_logging(settings)
    setup_cors(app, settings)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_window=settings.rate_limit_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )
    setup_error_handlers(app)
```

### 0.5.2 CORS Middleware

```python
"""
services/api/src/tbg/middleware/cors.py
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from tbg.config import Settings


def setup_cors(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "X-RateLimit-Remaining"],
    )
```

### 0.5.3 Request ID Middleware

```python
"""
services/api/src/tbg/middleware/request_id.py
"""
import uuid
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
import structlog


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response
```

### 0.5.4 Rate Limiting Middleware (Redis-backed)

```python
"""
services/api/src/tbg/middleware/rate_limit.py
"""
import time
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from tbg.redis_client import get_redis


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_window: int = 100, window_seconds: int = 60) -> None:  # noqa: ANN001
        super().__init__(app)
        self.requests_per_window = requests_per_window
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for health endpoints
        if request.url.path in ("/health", "/ready"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        redis = get_redis()
        key = f"ratelimit:{client_ip}"
        window = int(time.time()) // self.window_seconds

        pipe = redis.pipeline()
        rate_key = f"{key}:{window}"
        pipe.incr(rate_key)
        pipe.expire(rate_key, self.window_seconds + 1)
        results = await pipe.execute()

        current_count = results[0]
        remaining = max(0, self.requests_per_window - current_count)

        if current_count > self.requests_per_window:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={
                    "Retry-After": str(self.window_seconds),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_window)
        return response
```

### 0.5.5 Error Handler

```python
"""
services/api/src/tbg/middleware/error_handler.py
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger()


def setup_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            error=str(exc),
            exc_info=exc,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"detail": "Not found"},
        )
```

### 0.5.6 Structured Logging

```python
"""
services/api/src/tbg/middleware/logging.py
"""
import structlog
from tbg.config import Settings


def setup_logging(settings: Settings) -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
            if settings.log_format == "json"
            else structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
```

---

## 0.6 Health Endpoints

```python
"""
services/api/src/tbg/health/router.py
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from tbg.database import get_session
from tbg.redis_client import get_redis
from tbg.config import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Basic health check — always returns 200 if the process is alive."""
    return {"status": "healthy"}


@router.get("/ready")
async def readiness(
    db: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Readiness check — verifies DB and Redis connectivity."""
    checks: dict[str, object] = {}

    # Database check
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Redis check
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
    """Return API version and environment."""
    settings = get_settings()
    return {
        "version": settings.app_version,
        "environment": settings.environment,
    }
```

### 0.6.1 Endpoints Table

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/health` | Liveness probe | No |
| GET | `/ready` | Readiness probe (DB + Redis) | No |
| GET | `/version` | API version + environment | No |
| GET | `/docs` | Swagger UI (dev only) | No |
| GET | `/redoc` | ReDoc (dev only) | No |

---

## 0.7 Alembic Baseline Migration

### 0.7.1 alembic.ini

```ini
[alembic]
script_location = alembic
sqlalchemy.url = driver://user:pass@localhost/dbname
# Overridden by env.py to use async engine

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

### 0.7.2 Alembic env.py

```python
"""
Alembic environment configuration for async SQLAlchemy.
"""
import asyncio
from logging.config import fileConfig
from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from tbg.config import get_settings
from tbg.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = get_settings().database_url
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    settings = get_settings()
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

### 0.7.3 Baseline Migration (001)

```python
"""
001_baseline — Matches existing init.sql schema.

This migration does NOT create tables (they already exist from init.sql).
It stamps the baseline so Alembic can manage future changes.
"""

revision = "001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tables already exist via init.sql.
    # This migration exists to establish Alembic's baseline version tracking.
    # All tables referenced:
    #   - users
    #   - workers
    #   - shares (hypertable)
    #   - blocks
    #   - weekly_best_diff
    #   - mining_events (hypertable)
    #   - rate_limit_events (hypertable)
    #   - schema_migrations
    #   - hourly_shares (continuous aggregate)
    #   - daily_shares (continuous aggregate)
    pass


def downgrade() -> None:
    # Cannot downgrade from baseline
    pass
```

---

## 0.8 CI Pipeline

### 0.8.1 GitHub Actions Workflow

```yaml
# .github/workflows/api-ci.yml
name: API CI — Lint, Type-Check, Test

on:
  push:
    paths:
      - 'services/api/**'
  pull_request:
    paths:
      - 'services/api/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        working-directory: services/api
        run: pip install -e ".[dev]"
      - name: Ruff lint
        working-directory: services/api
        run: ruff check src/ tests/
      - name: Ruff format check
        working-directory: services/api
        run: ruff format --check src/ tests/

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        working-directory: services/api
        run: pip install -e ".[dev]"
      - name: mypy strict
        working-directory: services/api
        run: mypy src/tbg/ --strict

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb:latest-pg16
        env:
          POSTGRES_USER: tbg
          POSTGRES_PASSWORD: tbgdev2026
          POSTGRES_DB: thebitcoingame_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        working-directory: services/api
        run: pip install -e ".[dev]"
      - name: Run Alembic migrations
        working-directory: services/api
        env:
          TBG_DATABASE_URL: postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame_test
          TBG_REDIS_URL: redis://localhost:6379/0
        run: alembic upgrade head
      - name: Run tests
        working-directory: services/api
        env:
          TBG_DATABASE_URL: postgresql+asyncpg://tbg:tbgdev2026@localhost:5432/thebitcoingame_test
          TBG_REDIS_URL: redis://localhost:6379/0
          TBG_ENVIRONMENT: test
        run: pytest --cov-fail-under=80
```

### 0.8.2 Pipeline Diagram

```mermaid
graph TD
    A["Push / PR<br/>(services/api/*)"] --> B["Ruff Lint"]
    A --> C["mypy Strict"]
    A --> D["pytest + Coverage"]
    B --> E["All Green?"]
    C --> E
    D --> E
    E -->|Yes| F["PR Mergeable"]
    E -->|No| G["Block Merge"]

    style G fill:#4a1a1a,stroke:#f85149
    style F fill:#1a4a1a,stroke:#3fb950
```

---

## 0.9 Testing Requirements

### 0.9.1 Test Infrastructure

```python
"""
services/api/tests/conftest.py — Shared test fixtures.
"""
import asyncio
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from tbg.main import create_app
from tbg.config import get_settings, Settings
from tbg.database import get_session, init_db, close_db
from tbg.redis_client import init_redis, close_redis, get_redis


@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_settings() -> Settings:
    """Test settings with test database."""
    return get_settings()


@pytest_asyncio.fixture(scope="session")
async def test_engine(test_settings: Settings):
    """Create test database engine."""
    engine = create_async_engine(test_settings.database_url, echo=False)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh database session for each test with rollback."""
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP test client."""
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
    """Get a Redis client for testing."""
    settings = get_settings()
    await init_redis(settings.redis_url)
    client = get_redis()
    yield client
    await client.flushdb()
    await close_redis()
```

### 0.9.2 Test Cases

| # | Test | File | Method | Pass Criteria |
|---|---|---|---|---|
| 1 | Health endpoint returns 200 | test_health.py | GET /health | `{"status": "healthy"}` |
| 2 | Readiness returns DB + Redis status | test_health.py | GET /ready | `{"status": "ready"}` |
| 3 | Version endpoint returns correct info | test_health.py | GET /version | version matches settings |
| 4 | Request ID propagated in response | test_middleware.py | Any request | X-Request-Id header present |
| 5 | Custom request ID preserved | test_middleware.py | X-Request-Id: test-123 | Same ID in response |
| 6 | Rate limiter allows under limit | test_middleware.py | 99 requests | All return 200 |
| 7 | Rate limiter blocks over limit | test_middleware.py | 101 requests | 101st returns 429 |
| 8 | Rate limiter resets after window | test_middleware.py | Wait + retry | Returns 200 again |
| 9 | Health exempt from rate limit | test_middleware.py | 200 /health requests | All return 200 |
| 10 | Global error handler catches exceptions | test_middleware.py | Trigger 500 | Returns JSON error |
| 11 | 404 returns JSON | test_middleware.py | GET /nonexistent | `{"detail": "Not found"}` |
| 12 | CORS headers present | test_middleware.py | OPTIONS request | Access-Control headers |
| 13 | Alembic upgrade head succeeds | test_alembic.py | alembic upgrade | No errors |
| 14 | Alembic downgrade base succeeds | test_alembic.py | alembic downgrade | No errors |
| 15 | Database session yields and rolls back | conftest.py | Use db_session fixture | No persistent changes |

### 0.9.3 Health Endpoint Tests

```python
"""
services/api/tests/test_health.py
"""
import pytest
from httpx import AsyncClient


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

### 0.9.4 Middleware Tests

```python
"""
services/api/tests/test_middleware.py
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_request_id_generated(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert "X-Request-Id" in response.headers
    assert len(response.headers["X-Request-Id"]) == 36  # UUID format


@pytest.mark.asyncio
async def test_request_id_preserved(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-Id": "test-abc-123"})
    assert response.headers["X-Request-Id"] == "test-abc-123"


@pytest.mark.asyncio
async def test_rate_limit_headers(client: AsyncClient) -> None:
    response = await client.get("/version")
    assert "X-RateLimit-Remaining" in response.headers
    assert "X-RateLimit-Limit" in response.headers


@pytest.mark.asyncio
async def test_rate_limit_blocks_excess(client: AsyncClient) -> None:
    for _ in range(100):
        await client.get("/version")
    response = await client.get("/version")
    assert response.status_code == 429
    assert "Retry-After" in response.headers


@pytest.mark.asyncio
async def test_health_exempt_from_rate_limit(client: AsyncClient) -> None:
    for _ in range(200):
        response = await client.get("/health")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_cors_headers(client: AsyncClient) -> None:
    response = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" in response.headers


@pytest.mark.asyncio
async def test_404_returns_json(client: AsyncClient) -> None:
    response = await client.get("/nonexistent-path")
    assert response.status_code == 404
```

### 0.9.5 Coverage Targets

| Module | Target | Phase 0 Actual |
|---|---|---|
| `tbg.main` | 80% | TBD |
| `tbg.config` | 100% | TBD |
| `tbg.database` | 80% | TBD |
| `tbg.redis_client` | 80% | TBD |
| `tbg.middleware.*` | 85% | TBD |
| `tbg.health.*` | 100% | TBD |
| **Overall** | **80%+** | TBD |

---

## 0.10 Deliverables Checklist

| # | Deliverable | Owner | Status |
|---|---|---|---|
| 1 | `services/api/` directory structure created | TBD | [ ] |
| 2 | `pyproject.toml` with all dependencies | TBD | [ ] |
| 3 | FastAPI app factory (`main.py`) | TBD | [ ] |
| 4 | Settings module (`config.py`) with pydantic-settings | TBD | [ ] |
| 5 | Async database module (`database.py`) | TBD | [ ] |
| 6 | Redis client module (`redis_client.py`) | TBD | [ ] |
| 7 | CORS middleware configured | TBD | [ ] |
| 8 | Redis-backed rate limiting middleware | TBD | [ ] |
| 9 | Request ID middleware | TBD | [ ] |
| 10 | Global error handler middleware | TBD | [ ] |
| 11 | Structured JSON logging (structlog) | TBD | [ ] |
| 12 | Health endpoints (health, ready, version) | TBD | [ ] |
| 13 | Alembic configured with async engine | TBD | [ ] |
| 14 | Baseline migration (001) matching init.sql | TBD | [ ] |
| 15 | Docker Compose `api` service added | TBD | [ ] |
| 16 | Dockerfile for API service | TBD | [ ] |
| 17 | `conftest.py` with async fixtures | TBD | [ ] |
| 18 | Health endpoint tests (3 tests) | TBD | [ ] |
| 19 | Middleware tests (7+ tests) | TBD | [ ] |
| 20 | Alembic up/down test | TBD | [ ] |
| 21 | GitHub Actions CI workflow | TBD | [ ] |
| 22 | ruff lint passing (zero warnings) | TBD | [ ] |
| 23 | mypy strict passing (zero errors) | TBD | [ ] |
| 24 | Test coverage >= 80% | TBD | [ ] |
| 25 | Docker Compose full stack boots (`docker compose up`) | TBD | [ ] |

---

## 0.11 Week-by-Week Schedule

### Week 1 -- Scaffolding & Core

- Create `services/api/` directory structure
- Write `pyproject.toml` with all dependencies
- Implement app factory (`main.py`)
- Implement configuration module (`config.py`)
- Implement database module (`database.py`)
- Implement Redis client module (`redis_client.py`)
- Implement all middleware (CORS, rate limit, request ID, error handler, logging)
- Implement health endpoints (health, ready, version)
- Write Dockerfile and add to Docker Compose
- Verify `docker compose up` boots full stack

### Week 2 -- Alembic, Tests & CI

- Configure Alembic with async engine
- Write baseline migration matching init.sql
- Test Alembic upgrade/downgrade
- Write `conftest.py` with all shared fixtures
- Write health endpoint tests
- Write middleware tests (request ID, rate limiting, CORS, error handler)
- Set up GitHub Actions workflow (ruff, mypy, pytest)
- Achieve 80%+ test coverage
- Code review and sign-off
- Phase 0 complete

---

## 0.12 Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| SQLAlchemy async not compatible with TimescaleDB extensions | High | Low | Test hypertable operations in week 1; fallback to raw asyncpg |
| Alembic baseline conflicts with init.sql | Medium | Medium | Use `stamp head` approach; test clean DB + existing DB paths |
| Rate limiting flaky in CI (timing sensitive) | Low | Medium | Use fixed time windows in tests; mock Redis time |
| Docker Compose port conflicts with existing services | Low | Medium | Use non-standard ports; document required ports |
| pydantic-settings env parsing edge cases | Low | Low | Comprehensive Settings tests; document all env vars |
| testcontainers slow in CI | Medium | Medium | Use GitHub Actions service containers instead of testcontainers |
| structlog + uvicorn logging conflict | Low | Medium | Configure structlog to intercept standard logging |

---

*Phase 0 produces no business logic. Its sole purpose is to build the scaffolding, middleware, test infrastructure, and CI pipeline that all subsequent phases depend on.*
