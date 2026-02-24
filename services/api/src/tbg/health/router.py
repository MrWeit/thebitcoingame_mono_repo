"""Health, readiness, and version endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.config import get_settings
from tbg.database import get_session
from tbg.redis_client import get_redis

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe — returns 200 if the process is alive."""
    return {"status": "healthy"}


@router.get("/ready")
async def readiness(
    db: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    """Readiness probe — checks DB and Redis connectivity."""
    checks: dict[str, object] = {}

    # Database check
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    # Redis check
    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

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
