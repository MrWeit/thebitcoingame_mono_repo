"""Async SQLAlchemy engine and session management."""

from collections.abc import AsyncGenerator

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
    global _engine, _session_factory  # noqa: PLW0603
    _engine = create_async_engine(
        url,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        echo=False,
        connect_args={"statement_cache_size": 0},
    )
    _session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def close_db() -> None:
    """Dispose of the database engine."""
    global _engine  # noqa: PLW0603
    if _engine:
        await _engine.dispose()
        _engine = None


def get_engine() -> AsyncEngine:
    """Get the async engine instance."""
    if _engine is None:
        msg = "Database not initialized. Call init_db() first."
        raise RuntimeError(msg)
    return _engine


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session (FastAPI dependency)."""
    if _session_factory is None:
        msg = "Database not initialized. Call init_db() first."
        raise RuntimeError(msg)
    async with _session_factory() as session:
        yield session
