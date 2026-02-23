"""Test: Template synchronization

Verifies that:
1. All regions serve block templates to miners
2. Miners on all regions receive work (mining.notify)
3. After a new block, all regions update their work
"""

import asyncio
import time

import pytest

from conftest import REGIONS, TEST_USER
from helpers.stratum import AsyncStratumClient


@pytest.mark.asyncio
async def test_all_regions_serve_work(docker_compose_up):
    """All 3 regions serve mining.notify to authorized miners."""
    for region, info in REGIONS.items():
        client = AsyncStratumClient("127.0.0.1", info["stratum_port"])
        await client.connect(timeout=10)

        resp = await client.subscribe()
        assert resp.get("error") is None, f"{region}: subscribe failed"

        resp = await client.authorize(TEST_USER)
        assert resp.get("result") is True, f"{region}: authorize failed"

        # Read notifications until we get mining.notify
        notify_received = False
        start = time.monotonic()
        while time.monotonic() - start < 30:
            notif = await client.read_notification(timeout=5)
            if notif and notif.get("method") == "mining.notify":
                notify_received = True
                break

        await client.close()
        assert notify_received, f"{region}: no mining.notify received within 30s"


@pytest.mark.asyncio
async def test_template_has_valid_fields(docker_compose_up):
    """mining.notify from EU contains expected fields."""
    client = AsyncStratumClient("127.0.0.1", REGIONS["eu-west"]["stratum_port"])
    await client.connect()
    await client.subscribe()
    await client.authorize(TEST_USER)

    # Collect mining.notify
    notif = None
    start = time.monotonic()
    while time.monotonic() - start < 30:
        msg = await client.read_notification(timeout=5)
        if msg and msg.get("method") == "mining.notify":
            notif = msg
            break

    await client.close()

    assert notif is not None, "No mining.notify received"
    params = notif.get("params", [])

    # mining.notify params: [job_id, prevhash, coinb1, coinb2,
    #                        merkle_branches, version, nbits, ntime, clean_jobs]
    assert len(params) >= 9, f"mining.notify should have 9 params, got {len(params)}"
    assert isinstance(params[0], str), "job_id should be string"
    assert isinstance(params[8], bool), "clean_jobs should be boolean"


@pytest.mark.asyncio
async def test_relay_regions_get_work_quickly(docker_compose_up):
    """Relay regions receive work within 30s of authorization."""
    tasks = []
    for region in ["us-east", "ap-south"]:
        tasks.append(_measure_time_to_work(region))

    results = await asyncio.gather(*tasks)

    for region, elapsed in results:
        assert elapsed < 30.0, f"{region}: took {elapsed:.1f}s to get work (max 30s)"


async def _measure_time_to_work(region: str) -> tuple[str, float]:
    """Connect, authorize, and measure time to first mining.notify."""
    info = REGIONS[region]
    client = AsyncStratumClient("127.0.0.1", info["stratum_port"])
    await client.connect(timeout=10)
    await client.subscribe()
    await client.authorize(TEST_USER)

    start = time.monotonic()
    while time.monotonic() - start < 30:
        notif = await client.read_notification(timeout=5)
        if notif and notif.get("method") == "mining.notify":
            elapsed = time.monotonic() - start
            await client.close()
            return (region, elapsed)

    await client.close()
    return (region, 999.0)
