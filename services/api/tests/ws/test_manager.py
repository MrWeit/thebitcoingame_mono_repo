"""Unit tests for WebSocket ConnectionManager."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from tbg.ws.manager import ConnectionManager, VALID_CHANNELS


@pytest.fixture
def mgr() -> ConnectionManager:
    """Fresh ConnectionManager for each test."""
    return ConnectionManager()


def _make_ws(*, fail_send: bool = False) -> MagicMock:
    """Create a mock WebSocket."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    if fail_send:
        ws.send_text = AsyncMock(side_effect=RuntimeError("connection closed"))
    else:
        ws.send_text = AsyncMock()
    return ws


class TestConnect:
    @pytest.mark.asyncio
    async def test_connect_registers_client(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q...")
        ws.accept.assert_awaited_once()
        assert mgr.connection_count == 1
        stats = mgr.get_stats()
        assert stats["total_connections"] == 1
        assert stats["unique_users"] == 1

    @pytest.mark.asyncio
    async def test_connect_multiple_same_user(self, mgr: ConnectionManager) -> None:
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect(ws1, "conn-1", user_id=42, btc_address="bc1q...")
        await mgr.connect(ws2, "conn-2", user_id=42, btc_address="bc1q...")
        assert mgr.connection_count == 2
        assert mgr.get_stats()["unique_users"] == 1


class TestDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_cleans_up(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q...")
        await mgr.subscribe("conn-1", "mining")
        await mgr.disconnect("conn-1")
        assert mgr.connection_count == 0
        assert mgr.get_stats()["unique_users"] == 0
        assert "mining" not in mgr.get_stats()["channels"]

    @pytest.mark.asyncio
    async def test_disconnect_nonexistent(self, mgr: ConnectionManager) -> None:
        """Disconnecting a nonexistent conn_id is a no-op."""
        await mgr.disconnect("nonexistent")
        assert mgr.connection_count == 0


class TestSubscribe:
    @pytest.mark.asyncio
    async def test_subscribe_valid_channel(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q...")
        ok = await mgr.subscribe("conn-1", "mining")
        assert ok is True
        assert mgr.get_stats()["channels"]["mining"] == 1

    @pytest.mark.asyncio
    async def test_subscribe_invalid_channel(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q...")
        ok = await mgr.subscribe("conn-1", "nonexistent")
        assert ok is False

    @pytest.mark.asyncio
    async def test_subscribe_all_valid_channels(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q...")
        for ch in VALID_CHANNELS:
            ok = await mgr.subscribe("conn-1", ch)
            assert ok is True
        assert len(mgr.get_stats()["channels"]) == len(VALID_CHANNELS)

    @pytest.mark.asyncio
    async def test_subscribe_nonexistent_connection(self, mgr: ConnectionManager) -> None:
        ok = await mgr.subscribe("nonexistent", "mining")
        assert ok is False


class TestUnsubscribe:
    @pytest.mark.asyncio
    async def test_unsubscribe_removes_from_channel(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q...")
        await mgr.subscribe("conn-1", "mining")
        ok = await mgr.unsubscribe("conn-1", "mining")
        assert ok is True
        assert "mining" not in mgr.get_stats()["channels"]


class TestBroadcast:
    @pytest.mark.asyncio
    async def test_broadcast_reaches_subscribers_only(self, mgr: ConnectionManager) -> None:
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect(ws1, "conn-1", user_id=1, btc_address="bc1q1")
        await mgr.connect(ws2, "conn-2", user_id=2, btc_address="bc1q2")
        await mgr.subscribe("conn-1", "mining")
        # conn-2 is NOT subscribed to mining

        sent = await mgr.broadcast_to_channel("mining", {"type": "test"})
        assert sent == 1
        ws1.send_text.assert_awaited_once()
        ws2.send_text.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_broadcast_empty_channel(self, mgr: ConnectionManager) -> None:
        sent = await mgr.broadcast_to_channel("mining", {"type": "test"})
        assert sent == 0

    @pytest.mark.asyncio
    async def test_dead_connection_cleaned_up(self, mgr: ConnectionManager) -> None:
        ws_fail = _make_ws(fail_send=True)
        await mgr.connect(ws_fail, "conn-dead", user_id=1, btc_address="bc1q1")
        await mgr.subscribe("conn-dead", "mining")

        sent = await mgr.broadcast_to_channel("mining", {"type": "test"})
        assert sent == 0
        assert mgr.connection_count == 0  # cleaned up

    @pytest.mark.asyncio
    async def test_broadcast_message_format(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=1, btc_address="bc1q1")
        await mgr.subscribe("conn-1", "dashboard")

        await mgr.broadcast_to_channel("dashboard", {"type": "block_found", "height": 100})
        call_args = ws.send_text.call_args[0][0]
        parsed = json.loads(call_args)
        assert parsed["channel"] == "dashboard"
        assert parsed["data"]["type"] == "block_found"
        assert parsed["data"]["height"] == 100


class TestSendToUser:
    @pytest.mark.asyncio
    async def test_send_to_user_targets_correctly(self, mgr: ConnectionManager) -> None:
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect(ws1, "conn-1", user_id=42, btc_address="bc1q42")
        await mgr.connect(ws2, "conn-2", user_id=99, btc_address="bc1q99")
        await mgr.subscribe("conn-1", "mining")
        await mgr.subscribe("conn-2", "mining")

        sent = await mgr.send_to_user(42, "mining", {"type": "test"})
        assert sent == 1
        ws1.send_text.assert_awaited_once()
        ws2.send_text.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_send_to_user_wrong_channel(self, mgr: ConnectionManager) -> None:
        ws = _make_ws()
        await mgr.connect(ws, "conn-1", user_id=42, btc_address="bc1q42")
        await mgr.subscribe("conn-1", "mining")

        sent = await mgr.send_to_user(42, "dashboard", {"type": "test"})
        assert sent == 0


class TestStats:
    @pytest.mark.asyncio
    async def test_stats_accurate(self, mgr: ConnectionManager) -> None:
        ws1 = _make_ws()
        ws2 = _make_ws()
        await mgr.connect(ws1, "conn-1", user_id=1, btc_address="bc1q1")
        await mgr.connect(ws2, "conn-2", user_id=2, btc_address="bc1q2")
        await mgr.subscribe("conn-1", "mining")
        await mgr.subscribe("conn-1", "dashboard")
        await mgr.subscribe("conn-2", "mining")

        stats = mgr.get_stats()
        assert stats["total_connections"] == 2
        assert stats["unique_users"] == 2
        assert stats["channels"]["mining"] == 2
        assert stats["channels"]["dashboard"] == 1
