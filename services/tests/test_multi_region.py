"""Test: Multi-region connectivity

Verifies that miners can connect to all 3 ckpool instances,
subscribe, authorize, and that events flow through the system.
"""

import asyncio

import pytest
import pytest_asyncio

from conftest import REGIONS, TEST_USER
from helpers.stratum import AsyncStratumClient


@pytest.mark.asyncio
async def test_eu_subscribe_authorize(stratum_eu):
    """EU primary accepts subscribe and authorize."""
    resp = await stratum_eu.subscribe()
    assert resp.get("error") is None
    assert stratum_eu.subscribed

    resp = await stratum_eu.authorize(TEST_USER)
    assert resp.get("result") is True
    assert stratum_eu.authorized


@pytest.mark.asyncio
async def test_us_subscribe_authorize(stratum_us):
    """US relay accepts subscribe and authorize."""
    resp = await stratum_us.subscribe()
    assert resp.get("error") is None
    assert stratum_us.subscribed

    resp = await stratum_us.authorize(TEST_USER)
    assert resp.get("result") is True


@pytest.mark.asyncio
async def test_asia_subscribe_authorize(stratum_asia):
    """Asia relay accepts subscribe and authorize."""
    resp = await stratum_asia.subscribe()
    assert resp.get("error") is None
    assert stratum_asia.subscribed

    resp = await stratum_asia.authorize(TEST_USER)
    assert resp.get("result") is True


@pytest.mark.asyncio
async def test_all_regions_concurrent(docker_compose_up):
    """3 miners connect to 3 regions simultaneously."""
    clients = []
    for region, info in REGIONS.items():
        client = AsyncStratumClient("127.0.0.1", info["stratum_port"])
        await client.connect()
        clients.append((region, client))

    try:
        # Subscribe all
        results = await asyncio.gather(*[
            c.subscribe() for _, c in clients
        ])
        for resp in results:
            assert resp.get("error") is None

        # Authorize all
        results = await asyncio.gather(*[
            c.authorize(TEST_USER) for _, c in clients
        ])
        for resp in results:
            assert resp.get("result") is True

    finally:
        for _, client in clients:
            await client.close()


@pytest.mark.asyncio
async def test_eu_receives_work(stratum_eu):
    """After subscribe+authorize, the server sends mining.notify."""
    await stratum_eu.subscribe()
    await stratum_eu.authorize(TEST_USER)

    # Should receive a mining.notify notification
    notif = await stratum_eu.read_notification(timeout=15)
    assert notif is not None
    # Could be set_difficulty or notify
    assert notif.get("method") in ("mining.set_difficulty", "mining.notify")
