"""WebSocket connection manager.

Tracks all active WebSocket connections and their channel subscriptions.
Handles fan-out of messages to subscribed clients.
"""

import asyncio
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import WebSocket
import structlog

logger = structlog.get_logger()

VALID_CHANNELS = {"mining", "dashboard", "gamification", "competition"}


@dataclass
class ClientConnection:
    """Represents a single WebSocket client."""

    websocket: WebSocket
    user_id: int
    btc_address: str
    subscriptions: set[str] = field(default_factory=set)
    connected_at: float = field(default_factory=time.time)
    messages_sent: int = 0


class ConnectionManager:
    """Manages all active WebSocket connections.

    Thread-safe for asyncio via single-threaded event loop.
    """

    def __init__(self) -> None:
        self._connections: dict[str, ClientConnection] = {}  # conn_id -> client
        self._channels: dict[str, set[str]] = defaultdict(set)  # channel -> {conn_ids}
        self._user_connections: dict[int, set[str]] = defaultdict(set)  # user_id -> {conn_ids}

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def connect(
        self,
        websocket: WebSocket,
        conn_id: str,
        user_id: int,
        btc_address: str,
    ) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        client = ClientConnection(
            websocket=websocket,
            user_id=user_id,
            btc_address=btc_address,
        )
        self._connections[conn_id] = client
        self._user_connections[user_id].add(conn_id)
        logger.info("ws_connected", conn_id=conn_id, user_id=user_id)

    async def disconnect(self, conn_id: str) -> None:
        """Remove a WebSocket connection and its subscriptions."""
        client = self._connections.pop(conn_id, None)
        if client is None:
            return

        # Remove from all channels
        for channel in client.subscriptions:
            self._channels[channel].discard(conn_id)

        # Remove from user tracking
        self._user_connections[client.user_id].discard(conn_id)
        if not self._user_connections[client.user_id]:
            del self._user_connections[client.user_id]

        logger.info("ws_disconnected", conn_id=conn_id, user_id=client.user_id)

    async def subscribe(self, conn_id: str, channel: str) -> bool:
        """Subscribe a connection to a channel. Returns False if invalid."""
        client = self._connections.get(conn_id)
        if client is None:
            return False

        if channel not in VALID_CHANNELS:
            return False

        client.subscriptions.add(channel)
        self._channels[channel].add(conn_id)
        logger.debug("ws_subscribed", conn_id=conn_id, channel=channel)
        return True

    async def unsubscribe(self, conn_id: str, channel: str) -> bool:
        """Unsubscribe a connection from a channel."""
        client = self._connections.get(conn_id)
        if client is None:
            return False

        client.subscriptions.discard(channel)
        self._channels[channel].discard(conn_id)
        return True

    async def broadcast_to_channel(self, channel: str, message: dict) -> int:
        """Send a message to all clients subscribed to a channel.

        Returns the number of clients that received the message.
        """
        conn_ids = list(self._channels.get(channel, set()))
        if not conn_ids:
            return 0

        payload = json.dumps({"channel": channel, "data": message})
        sent = 0
        failed: list[str] = []

        for conn_id in conn_ids:
            client = self._connections.get(conn_id)
            if client is None:
                failed.append(conn_id)
                continue
            try:
                await client.websocket.send_text(payload)
                client.messages_sent += 1
                sent += 1
            except Exception:
                failed.append(conn_id)

        # Clean up failed connections
        for conn_id in failed:
            await self.disconnect(conn_id)

        return sent

    async def send_to_user(self, user_id: int, channel: str, message: dict) -> int:
        """Send a message to all connections of a specific user on a channel."""
        conn_ids = list(self._user_connections.get(user_id, set()))
        sent = 0
        payload = json.dumps({"channel": channel, "data": message})

        for conn_id in conn_ids:
            client = self._connections.get(conn_id)
            if client and channel in client.subscriptions:
                try:
                    await client.websocket.send_text(payload)
                    client.messages_sent += 1
                    sent += 1
                except Exception:
                    await self.disconnect(conn_id)

        return sent

    def get_stats(self) -> dict:
        """Get connection statistics."""
        return {
            "total_connections": len(self._connections),
            "unique_users": len(self._user_connections),
            "channels": {
                ch: len(conns) for ch, conns in self._channels.items() if conns
            },
        }


# Global singleton
manager = ConnectionManager()
