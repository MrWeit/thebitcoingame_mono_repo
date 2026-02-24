"""Bridges Redis pub/sub to WebSocket clients.

Subscribes to mining event channels published by the Phase 2 Stream Consumer
and fans messages out to subscribed WebSocket clients.
"""

import asyncio
import json

import redis.asyncio as aioredis
import structlog

from tbg.ws.manager import manager

logger = structlog.get_logger()

# Map Redis pub/sub channels to WebSocket channels
CHANNEL_MAP: dict[str, str] = {
    "pubsub:share_submitted": "mining",
    "pubsub:worker_status": "mining",
    "pubsub:hashrate_update": "mining",
    "pubsub:best_diff": "mining",
    "pubsub:block_found": "dashboard",
    "pubsub:badge_earned": "gamification",
    "pubsub:xp_gained": "gamification",
    "pubsub:level_up": "gamification",
    "pubsub:streak_update": "gamification",
    "pubsub:leaderboard_update": "competition",
    "pubsub:match_update": "competition",
    "pubsub:feed_item": "dashboard",
}


class PubSubBridge:
    """Subscribes to Redis pub/sub and pushes messages to WebSocket clients."""

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self.redis = redis_client
        self._running = False

    async def start(self) -> None:
        """Start listening to Redis pub/sub channels."""
        self._running = True
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(*CHANNEL_MAP.keys())

        logger.info("pubsub_bridge_started", channels=list(CHANNEL_MAP.keys()))

        try:
            while self._running:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
                if message is None:
                    continue

                redis_channel = message.get("channel", "")
                if isinstance(redis_channel, bytes):
                    redis_channel = redis_channel.decode()

                ws_channel = CHANNEL_MAP.get(redis_channel)
                if ws_channel is None:
                    continue

                try:
                    data = message.get("data", b"")
                    if isinstance(data, bytes):
                        data = data.decode()
                    payload = json.loads(data)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    logger.warning("pubsub_invalid_message", channel=redis_channel)
                    continue

                sent = await manager.broadcast_to_channel(ws_channel, {
                    "type": redis_channel.split(":")[-1],
                    **payload,
                })

                if sent > 0:
                    logger.debug("pubsub_broadcast", channel=ws_channel, recipients=sent)

        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe()
            await pubsub.close()
            logger.info("pubsub_bridge_stopped")

    async def stop(self) -> None:
        """Signal the bridge to stop."""
        self._running = False
