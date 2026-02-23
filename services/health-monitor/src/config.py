"""Configuration for the health monitor."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class MonitorConfig:
    # Comma-separated ckpool metrics endpoints (host:port)
    ckpool_endpoints: str = os.environ.get("CKPOOL_ENDPOINTS", "ckpool-eu:9100")
    # Comma-separated region names (same order as endpoints)
    ckpool_regions: str = os.environ.get("CKPOOL_REGIONS", "eu-west")
    # NATS monitoring URL
    nats_monitoring_url: str = os.environ.get("NATS_MONITORING_URL", "http://nats:8222")
    # Poll interval in seconds
    poll_interval: int = int(os.environ.get("POLL_INTERVAL", "15"))
    # HTTP server port
    bind_port: int = int(os.environ.get("BIND_PORT", "8090"))
    # HTTP server bind address
    bind_host: str = os.environ.get("BIND_HOST", "0.0.0.0")
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
