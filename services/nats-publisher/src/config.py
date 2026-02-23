"""Configuration for the NATS sidecar publisher."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class PublisherConfig:
    nats_url: str = os.environ.get("NATS_URL", "nats://localhost:4222")
    socket_path: str = os.environ.get("SOCKET_PATH", "/tmp/ckpool/events.sock")
    region: str = os.environ.get("REGION", "default")
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    buffer_size: int = int(os.environ.get("BUFFER_SIZE", "10000"))
    reconnect_delay: float = float(os.environ.get("RECONNECT_DELAY", "1.0"))
    max_reconnect_delay: float = float(os.environ.get("MAX_RECONNECT_DELAY", "30.0"))
