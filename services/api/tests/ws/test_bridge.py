"""Tests for the Redis pub/sub to WebSocket bridge."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tbg.ws.bridge import CHANNEL_MAP, PubSubBridge


class TestChannelMapping:
    def test_all_redis_channels_mapped(self) -> None:
        """Every Redis channel maps to a known WebSocket channel."""
        valid_ws_channels = {"mining", "dashboard", "gamification", "competition"}
        for redis_ch, ws_ch in CHANNEL_MAP.items():
            assert ws_ch in valid_ws_channels, f"{redis_ch} maps to unknown {ws_ch}"

    def test_mining_channels(self) -> None:
        assert CHANNEL_MAP["pubsub:share_submitted"] == "mining"
        assert CHANNEL_MAP["pubsub:worker_status"] == "mining"
        assert CHANNEL_MAP["pubsub:hashrate_update"] == "mining"
        assert CHANNEL_MAP["pubsub:best_diff"] == "mining"

    def test_dashboard_channels(self) -> None:
        assert CHANNEL_MAP["pubsub:block_found"] == "dashboard"
        assert CHANNEL_MAP["pubsub:feed_item"] == "dashboard"

    def test_gamification_channels(self) -> None:
        assert CHANNEL_MAP["pubsub:badge_earned"] == "gamification"
        assert CHANNEL_MAP["pubsub:xp_gained"] == "gamification"
        assert CHANNEL_MAP["pubsub:level_up"] == "gamification"
        assert CHANNEL_MAP["pubsub:streak_update"] == "gamification"

    def test_competition_channels(self) -> None:
        assert CHANNEL_MAP["pubsub:leaderboard_update"] == "competition"
        assert CHANNEL_MAP["pubsub:match_update"] == "competition"


class TestBridgeLifecycle:
    @pytest.mark.asyncio
    async def test_bridge_forwards_message(self) -> None:
        """Publish to pubsub:share_submitted, verify broadcast on mining channel."""
        mock_redis = AsyncMock()
        mock_pubsub = AsyncMock()

        # Simulate receiving one message then stopping
        messages = [
            {
                "type": "message",
                "channel": "pubsub:share_submitted",
                "data": json.dumps({"user": "bc1q...", "diff": 1000}),
            },
            None,  # Triggers continue/loop
        ]
        call_count = 0

        async def fake_get_message(**kwargs):
            nonlocal call_count
            if call_count < len(messages):
                msg = messages[call_count]
                call_count += 1
                return msg
            return None

        mock_pubsub.get_message = fake_get_message
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_pubsub.close = AsyncMock()
        mock_redis.pubsub = MagicMock(return_value=mock_pubsub)

        bridge = PubSubBridge(mock_redis)

        with patch("tbg.ws.bridge.manager") as mock_manager:
            mock_manager.broadcast_to_channel = AsyncMock(return_value=1)

            # Run bridge for a short time
            import asyncio

            async def stop_after_delay():
                await asyncio.sleep(0.1)
                await bridge.stop()

            await asyncio.gather(bridge.start(), stop_after_delay())

            # Verify the message was forwarded to mining channel
            mock_manager.broadcast_to_channel.assert_awaited()
            call_args = mock_manager.broadcast_to_channel.call_args
            assert call_args[0][0] == "mining"
            assert call_args[0][1]["type"] == "share_submitted"

    @pytest.mark.asyncio
    async def test_invalid_message_skipped(self) -> None:
        """Non-JSON pub/sub message is logged and skipped, not crash."""
        mock_redis = AsyncMock()
        mock_pubsub = AsyncMock()

        messages = [
            {
                "type": "message",
                "channel": "pubsub:share_submitted",
                "data": "not valid json {{{",
            },
        ]
        call_count = 0

        async def fake_get_message(**kwargs):
            nonlocal call_count
            if call_count < len(messages):
                msg = messages[call_count]
                call_count += 1
                return msg
            return None

        mock_pubsub.get_message = fake_get_message
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_pubsub.close = AsyncMock()
        mock_redis.pubsub = MagicMock(return_value=mock_pubsub)

        bridge = PubSubBridge(mock_redis)

        with patch("tbg.ws.bridge.manager") as mock_manager:
            mock_manager.broadcast_to_channel = AsyncMock(return_value=0)

            import asyncio

            async def stop_after_delay():
                await asyncio.sleep(0.1)
                await bridge.stop()

            # Should not raise
            await asyncio.gather(bridge.start(), stop_after_delay())

            # broadcast should NOT have been called (invalid message skipped)
            mock_manager.broadcast_to_channel.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_channel_skipped(self) -> None:
        """Message on unmapped channel is silently skipped."""
        mock_redis = AsyncMock()
        mock_pubsub = AsyncMock()

        messages = [
            {
                "type": "message",
                "channel": "pubsub:unknown_event",
                "data": json.dumps({"foo": "bar"}),
            },
        ]
        call_count = 0

        async def fake_get_message(**kwargs):
            nonlocal call_count
            if call_count < len(messages):
                msg = messages[call_count]
                call_count += 1
                return msg
            return None

        mock_pubsub.get_message = fake_get_message
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_pubsub.close = AsyncMock()
        mock_redis.pubsub = MagicMock(return_value=mock_pubsub)

        bridge = PubSubBridge(mock_redis)

        with patch("tbg.ws.bridge.manager") as mock_manager:
            mock_manager.broadcast_to_channel = AsyncMock(return_value=0)

            import asyncio

            async def stop_after_delay():
                await asyncio.sleep(0.1)
                await bridge.stop()

            await asyncio.gather(bridge.start(), stop_after_delay())
            mock_manager.broadcast_to_channel.assert_not_awaited()
