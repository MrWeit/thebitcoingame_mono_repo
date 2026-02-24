"""Structured logging configuration with structlog."""

import logging

import structlog

from tbg.config import Settings


def setup_logging(settings: Settings) -> None:
    """Configure structlog for JSON or console output."""
    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer() if settings.log_format == "json" else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            renderer,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Set root log level
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
