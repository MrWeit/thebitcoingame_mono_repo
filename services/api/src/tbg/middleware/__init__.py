"""Middleware registration."""

from fastapi import FastAPI

from tbg.config import Settings
from tbg.middleware.cors import setup_cors
from tbg.middleware.error_handler import setup_error_handlers
from tbg.middleware.logging import setup_logging
from tbg.middleware.rate_limit import RateLimitMiddleware
from tbg.middleware.request_id import RequestIdMiddleware


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
