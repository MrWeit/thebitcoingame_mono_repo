"""CORS middleware configuration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tbg.config import Settings


def setup_cors(app: FastAPI, settings: Settings) -> None:
    """Configure CORS to allow dashboard origins."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "X-RateLimit-Remaining", "X-RateLimit-Limit"],
    )
