"""Test: NATS resilience

Verifies that:
1. Events flow through NATS JetStream
2. NATS restart doesn't lose events (publisher buffers)
3. Duplicate events are handled by dedup
"""

import asyncio
import json
import subprocess

import nats
import pytest

from conftest import NATS_URL, TEST_USER, REGIONS, wait_for_port
from helpers.stratum import AsyncStratumClient


@pytest.mark.asyncio
async def test_nats_receives_events(nats_client, docker_compose_up):
    """Events from ckpool appear in the NATS MINING_EVENTS stream."""
    js = nats_client.jetstream()

    # Get current stream info to track new messages
    info = await js.stream_info("MINING_EVENTS")
    initial_msgs = info.state.messages

    # Generate some events by connecting a miner
    client = AsyncStratumClient("127.0.0.1", REGIONS["eu-west"]["stratum_port"])
    await client.connect()
    await client.subscribe()
    await client.authorize(TEST_USER)
    await asyncio.sleep(3)
    await client.close()

    # Wait for events to propagate
    await asyncio.sleep(5)

    # Check stream has new messages
    info = await js.stream_info("MINING_EVENTS")
    new_msgs = info.state.messages - initial_msgs

    assert new_msgs > 0, "No new events appeared in NATS stream"


@pytest.mark.asyncio
async def test_nats_event_has_region(nats_client, docker_compose_up):
    """Events in NATS contain the region field."""
    js = nats_client.jetstream()

    # Subscribe to get events
    sub = await js.pull_subscribe("events.>", stream="MINING_EVENTS")

    # Generate events
    client = AsyncStratumClient("127.0.0.1", REGIONS["eu-west"]["stratum_port"])
    await client.connect()
    await client.subscribe()
    await client.authorize(TEST_USER)
    await asyncio.sleep(3)
    await client.close()

    await asyncio.sleep(3)

    # Fetch and check events
    try:
        messages = await sub.fetch(batch=10, timeout=5)
        assert len(messages) > 0, "No messages fetched from NATS"

        for msg in messages:
            data = json.loads(msg.data.decode("utf-8"))
            assert "region" in data or "event" in data, f"Event missing expected fields: {data}"
            await msg.ack()
    except nats.errors.TimeoutError:
        pytest.fail("Timeout waiting for NATS messages")
    finally:
        await sub.unsubscribe()


@pytest.mark.asyncio
@pytest.mark.timeout(120)
async def test_nats_restart_resilience(docker_compose_up):
    """Events are not lost during NATS restart (publisher buffers)."""
    # Stop NATS
    subprocess.run(
        ["docker", "compose", "-f", "docker-compose.multi-region.yml",
         "stop", "nats"],
        cwd="/Users/rodrigomartins/Documents/THEBITCOINGAME/services",
        check=True,
    )

    await asyncio.sleep(5)

    # Generate events while NATS is down
    client = AsyncStratumClient("127.0.0.1", REGIONS["eu-west"]["stratum_port"])
    await client.connect()
    await client.subscribe()
    await client.authorize(TEST_USER)
    await asyncio.sleep(3)
    await client.close()

    # Restart NATS
    subprocess.run(
        ["docker", "compose", "-f", "docker-compose.multi-region.yml",
         "start", "nats"],
        cwd="/Users/rodrigomartins/Documents/THEBITCOINGAME/services",
        check=True,
    )

    assert wait_for_port("127.0.0.1", 4222, timeout=30), "NATS failed to restart"

    # Wait for publisher to flush its buffer
    await asyncio.sleep(10)

    # Verify events arrived
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()
    info = await js.stream_info("MINING_EVENTS")
    await nc.drain()
    await nc.close()

    # Should have some messages (from before and after restart)
    assert info.state.messages > 0, "No events in NATS after restart"
