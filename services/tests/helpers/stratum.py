"""Async Stratum V1 client for integration testing.

Implements the minimal subset of the Stratum mining protocol
needed to verify ckpool connectivity:
  - mining.subscribe
  - mining.authorize
  - mining.submit (share submission)
"""

from __future__ import annotations

import asyncio
import json
import logging

logger = logging.getLogger("test.stratum")


class AsyncStratumClient:
    """Lightweight async Stratum V1 client."""

    def __init__(self, host: str = "127.0.0.1", port: int = 3333):
        self.host = host
        self.port = port
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._msg_id = 0
        self.extranonce1: str | None = None
        self.extranonce2_size: int = 0
        self.subscribed = False
        self.authorized = False
        self.difficulty: float = 1.0
        self._notifications: list[dict] = []

    async def connect(self, timeout: float = 10.0):
        """Connect to the Stratum server."""
        self._reader, self._writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port),
            timeout=timeout,
        )
        logger.info("Connected to %s:%d", self.host, self.port)

    async def close(self):
        """Close the connection."""
        if self._writer:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception:
                pass

    async def subscribe(self, user_agent: str = "tbg-test/1.0") -> dict:
        """Send mining.subscribe and return the response."""
        resp = await self._call("mining.subscribe", [user_agent])

        if resp.get("result"):
            result = resp["result"]
            if isinstance(result, list) and len(result) >= 2:
                self.extranonce1 = result[1] if len(result) > 1 else None
                self.extranonce2_size = result[2] if len(result) > 2 else 8
            self.subscribed = True

        return resp

    async def authorize(self, username: str, password: str = "x") -> dict:
        """Send mining.authorize and return the response."""
        resp = await self._call("mining.authorize", [username, password])

        if resp.get("result"):
            self.authorized = True

        return resp

    async def submit(
        self,
        username: str,
        job_id: str,
        extranonce2: str,
        ntime: str,
        nonce: str,
    ) -> dict:
        """Submit a share via mining.submit."""
        return await self._call(
            "mining.submit",
            [username, job_id, extranonce2, ntime, nonce],
        )

    async def read_notification(self, timeout: float = 5.0) -> dict | None:
        """Read a single notification from the server."""
        try:
            line = await asyncio.wait_for(
                self._reader.readline(),
                timeout=timeout,
            )
            if line:
                msg = json.loads(line.decode("utf-8"))
                self._notifications.append(msg)
                return msg
        except asyncio.TimeoutError:
            return None
        except Exception as e:
            logger.debug("Read error: %s", e)
            return None

    async def _call(self, method: str, params: list) -> dict:
        """Send an RPC call and read the response."""
        self._msg_id += 1
        msg = {
            "id": self._msg_id,
            "method": method,
            "params": params,
        }

        data = json.dumps(msg) + "\n"
        self._writer.write(data.encode("utf-8"))
        await self._writer.drain()

        # Read response (may be preceded by notifications)
        while True:
            line = await asyncio.wait_for(
                self._reader.readline(),
                timeout=10.0,
            )
            if not line:
                raise ConnectionError("Server closed connection")

            resp = json.loads(line.decode("utf-8"))

            # Notification (no id)
            if resp.get("id") is None:
                self._notifications.append(resp)
                # Handle difficulty notification
                if resp.get("method") == "mining.set_difficulty":
                    self.difficulty = resp["params"][0]
                continue

            # Response to our call
            if resp.get("id") == self._msg_id:
                return resp

    @property
    def is_connected(self) -> bool:
        return self._writer is not None and not self._writer.is_closing()
