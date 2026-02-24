"""FastAPI application factory."""

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from tbg.auth.router import router as auth_router
from tbg.config import get_settings
from tbg.dashboard.router import router as dashboard_router
from tbg.database import close_db, get_session, init_db
from tbg.gamification.router import router as gamification_router
from tbg.games.router import router as games_router
from tbg.gamification.seed import seed_badges
from tbg.health.router import router as health_router
from tbg.middleware import setup_middleware
from tbg.mining.router import router as mining_router
from tbg.redis_client import close_redis, get_redis, init_redis
from tbg.users.router import router as users_router
from tbg.ws.bridge import PubSubBridge
from tbg.ws.router import router as ws_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    settings = get_settings()
    await init_db(settings.database_url)
    await init_redis(settings.redis_url)

    # Seed badge definitions (idempotent)
    try:
        async for db in get_session():
            await seed_badges(db)
            break
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Badge seeding failed (tables may not exist yet)", exc_info=True)

    # Start the Redis pub/sub -> WebSocket bridge
    redis = get_redis()
    bridge = PubSubBridge(redis)
    bridge_task = asyncio.create_task(bridge.start())

    yield

    # Shutdown bridge
    await bridge.stop()
    bridge_task.cancel()
    try:
        await bridge_task
    except asyncio.CancelledError:
        pass

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
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(mining_router)
    app.include_router(dashboard_router)
    app.include_router(gamification_router)
    app.include_router(games_router)
    app.include_router(ws_router)

    return app


app = create_app()
