"""Configuration for the TBG Event Collector."""

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Config:
    """Event collector configuration, loaded from environment variables."""

    # Unix socket path where ckpool sends events
    socket_path: str = field(
        default_factory=lambda: os.environ.get(
            "SOCKET_PATH", "/tmp/ckpool/events.sock"
        )
    )

    # Redis connection
    redis_url: str = field(
        default_factory=lambda: os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    )

    # PostgreSQL/TimescaleDB connection
    database_url: str = field(
        default_factory=lambda: os.environ.get(
            "DATABASE_URL",
            "postgresql://tbg:tbgdev2026@localhost:5432/thebitcoingame",
        )
    )

    # Logging
    log_level: str = field(
        default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO")
    )

    # Batch writing config
    batch_flush_interval: float = field(
        default_factory=lambda: float(
            os.environ.get("BATCH_FLUSH_INTERVAL", "1.0")
        )
    )
    batch_max_size: int = field(
        default_factory=lambda: int(os.environ.get("BATCH_MAX_SIZE", "500"))
    )

    # Redis stream max length per stream
    redis_stream_maxlen: int = field(
        default_factory=lambda: int(
            os.environ.get("REDIS_STREAM_MAXLEN", "100000")
        )
    )

    # Socket receive buffer size
    socket_buffer_size: int = 65536

    # NATS connection (Phase 4: multi-region event replication)
    nats_url: str = field(
        default_factory=lambda: os.environ.get("NATS_URL", "")
    )
    nats_stream: str = field(
        default_factory=lambda: os.environ.get("NATS_STREAM", "MINING_EVENTS")
    )
    nats_consumer: str = field(
        default_factory=lambda: os.environ.get("NATS_CONSUMER", "event-collector")
    )


def load_config() -> Config:
    """Load configuration from environment."""
    return Config()
