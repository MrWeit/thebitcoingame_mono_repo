"""Shared fixtures for TBG integration tests."""

import pytest
import redis
import time


@pytest.fixture(scope="session")
def redis_client():
    """Connect to the TBG Redis instance."""
    client = redis.Redis.from_url("redis://localhost:6379/0", decode_responses=True)
    # Wait for Redis to be ready
    for _ in range(30):
        try:
            client.ping()
            return client
        except redis.ConnectionError:
            time.sleep(1)
    pytest.skip("Redis not available")


@pytest.fixture(scope="session")
def ckpool_host():
    """Return the ckpool stratum host:port."""
    return ("localhost", 3333)


@pytest.fixture(scope="session")
def metrics_url():
    """Return the ckpool metrics URL."""
    return "http://localhost:9100/metrics"
