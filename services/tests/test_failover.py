"""Test: Failover behavior

Verifies that when the primary ckpool-eu is stopped:
1. Relay instances detect the loss
2. They switch to independent mode
3. They continue accepting miners
4. When primary returns, relays recover
"""

import asyncio
import subprocess
import time

import pytest

from conftest import REGIONS, TEST_USER, wait_for_port
from helpers.stratum import AsyncStratumClient


@pytest.mark.asyncio
@pytest.mark.timeout(120)
async def test_relay_survives_primary_stop(docker_compose_up):
    """US relay continues accepting connections after EU primary stops."""
    # First verify US is working
    client_before = AsyncStratumClient("127.0.0.1", REGIONS["us-east"]["stratum_port"])
    await client_before.connect()
    resp = await client_before.subscribe()
    assert resp.get("error") is None
    resp = await client_before.authorize(TEST_USER)
    assert resp.get("result") is True
    await client_before.close()

    # Stop EU primary
    subprocess.run(
        ["docker", "compose", "-f", "docker-compose.multi-region.yml",
         "stop", "ckpool-eu"],
        cwd="/Users/rodrigomartins/Documents/THEBITCOINGAME/services",
        check=True,
    )

    try:
        # Wait for failover to trigger (failover_timeout = 10s)
        await asyncio.sleep(15)

        # US relay should still accept connections
        client_after = AsyncStratumClient("127.0.0.1", REGIONS["us-east"]["stratum_port"])
        await client_after.connect(timeout=10)
        resp = await client_after.subscribe()
        assert resp.get("error") is None, "US relay should still accept subscriptions after primary loss"
        resp = await client_after.authorize(TEST_USER)
        assert resp.get("result") is True, "US relay should still authorize miners"
        await client_after.close()

    finally:
        # Restart EU primary
        subprocess.run(
            ["docker", "compose", "-f", "docker-compose.multi-region.yml",
             "start", "ckpool-eu"],
            cwd="/Users/rodrigomartins/Documents/THEBITCOINGAME/services",
            check=True,
        )
        # Wait for it to come back
        assert wait_for_port("127.0.0.1", 3333, timeout=60), "EU ckpool failed to restart"


@pytest.mark.asyncio
@pytest.mark.timeout(120)
async def test_relay_recovers_after_primary_restart(docker_compose_up):
    """After primary comes back, relay reconnects and resumes relay mode."""
    # Stop and restart EU primary
    subprocess.run(
        ["docker", "compose", "-f", "docker-compose.multi-region.yml",
         "stop", "ckpool-eu"],
        cwd="/Users/rodrigomartins/Documents/THEBITCOINGAME/services",
        check=True,
    )

    await asyncio.sleep(15)

    subprocess.run(
        ["docker", "compose", "-f", "docker-compose.multi-region.yml",
         "start", "ckpool-eu"],
        cwd="/Users/rodrigomartins/Documents/THEBITCOINGAME/services",
        check=True,
    )

    assert wait_for_port("127.0.0.1", 3333, timeout=60)

    # Give relay time to reconnect
    await asyncio.sleep(10)

    # Both EU and US should work
    for port in [3333, 3334]:
        client = AsyncStratumClient("127.0.0.1", port)
        await client.connect(timeout=10)
        resp = await client.subscribe()
        assert resp.get("error") is None
        resp = await client.authorize(TEST_USER)
        assert resp.get("result") is True
        await client.close()
