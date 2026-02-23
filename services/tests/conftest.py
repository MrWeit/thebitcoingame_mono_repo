"""Shared fixtures for Phase 4 multi-region integration tests.

These tests require the full multi-region Docker Compose stack to be running:
  docker compose -f docker-compose.multi-region.yml up -d

Wait for all services to be healthy before running tests.
"""

from __future__ import annotations

import asyncio
import subprocess
import time

import nats
import pytest
import pytest_asyncio

from helpers.stratum import AsyncStratumClient

# Regions and their Stratum ports
REGIONS = {
    "eu-west": {"stratum_port": 3333, "metrics_port": 9100},
    "us-east": {"stratum_port": 3334, "metrics_port": 9101},
    "ap-south": {"stratum_port": 3335, "metrics_port": 9102},
}

COMPOSE_FILE = "docker-compose.multi-region.yml"
NATS_URL = "nats://localhost:4222"
HEALTH_URL = "http://localhost:8090/health"
TEST_USER = "bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls"


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for all session-scoped async fixtures."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def docker_compose_up():
    """Ensure the multi-region Docker Compose stack is running.

    This fixture assumes the stack is already running.
    It verifies basic connectivity rather than managing lifecycle.
    """
    # Quick health check — try connecting to EU ckpool Stratum port
    import socket

    for attempt in range(30):
        try:
            s = socket.create_connection(("127.0.0.1", 3333), timeout=2)
            s.close()
            return True
        except (ConnectionRefusedError, OSError):
            time.sleep(2)

    pytest.fail("Docker Compose stack not running or ckpool-eu not reachable on port 3333")


@pytest_asyncio.fixture
async def stratum_eu(docker_compose_up) -> AsyncStratumClient:
    """Stratum client connected to EU (primary)."""
    client = AsyncStratumClient("127.0.0.1", REGIONS["eu-west"]["stratum_port"])
    await client.connect()
    yield client
    await client.close()


@pytest_asyncio.fixture
async def stratum_us(docker_compose_up) -> AsyncStratumClient:
    """Stratum client connected to US (relay)."""
    client = AsyncStratumClient("127.0.0.1", REGIONS["us-east"]["stratum_port"])
    await client.connect()
    yield client
    await client.close()


@pytest_asyncio.fixture
async def stratum_asia(docker_compose_up) -> AsyncStratumClient:
    """Stratum client connected to Asia (relay)."""
    client = AsyncStratumClient("127.0.0.1", REGIONS["ap-south"]["stratum_port"])
    await client.connect()
    yield client
    await client.close()


@pytest_asyncio.fixture
async def nats_client(docker_compose_up):
    """NATS client connected to the JetStream server."""
    nc = await nats.connect(NATS_URL)
    yield nc
    await nc.drain()
    await nc.close()


def wait_for_port(host: str, port: int, timeout: float = 30.0) -> bool:
    """Wait for a TCP port to become available."""
    import socket

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            s = socket.create_connection((host, port), timeout=2)
            s.close()
            return True
        except (ConnectionRefusedError, OSError):
            time.sleep(1)
    return False
