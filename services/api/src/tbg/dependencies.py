"""Shared FastAPI dependencies."""

from collections.abc import AsyncGenerator

from tbg.database import get_session as _get_session
from tbg.redis_client import get_redis as _get_redis

get_db = _get_session


async def get_redis_dep() -> AsyncGenerator[object, None]:
    """Yield the Redis client as a FastAPI dependency."""
    yield _get_redis()
