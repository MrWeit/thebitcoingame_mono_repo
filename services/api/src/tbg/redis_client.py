"""Redis connection pool."""

import redis.asyncio as redis

_pool: redis.Redis | None = None


async def init_redis(url: str) -> None:
    """Initialize the Redis connection pool."""
    global _pool  # noqa: PLW0603
    _pool = redis.from_url(  # type: ignore[no-untyped-call]
        url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
    )


async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _pool  # noqa: PLW0603
    if _pool:
        await _pool.aclose()
        _pool = None


def get_redis() -> redis.Redis:
    """Get the Redis client (FastAPI dependency)."""
    if _pool is None:
        msg = "Redis not initialized. Call init_redis() first."
        raise RuntimeError(msg)
    return _pool
