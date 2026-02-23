"""Aggregated health monitor for multi-region ckpool deployment.

Polls each ckpool instance's /metrics endpoint and NATS monitoring,
exposes an aggregated health endpoint at GET /health.
"""

import asyncio
import json
import logging
import signal
import sys
import time

import aiohttp
from aiohttp import web

from .config import MonitorConfig

logger = logging.getLogger("health-monitor")


class HealthMonitor:
    def __init__(self, config: MonitorConfig):
        self.config = config
        self._endpoints = list(zip(
            config.ckpool_endpoints.split(","),
            config.ckpool_regions.split(","),
        ))
        self._region_status: dict[str, dict] = {}
        self._nats_status: dict = {}
        self._running = False
        self._app = None
        self._runner = None

    async def start(self):
        self._running = True

        # Start polling loop and HTTP server concurrently
        await asyncio.gather(
            self._poll_loop(),
            self._serve_http(),
        )

    async def stop(self):
        self._running = False
        if self._runner:
            await self._runner.cleanup()

    async def _poll_loop(self):
        """Periodically poll all ckpool instances and NATS."""
        # Wait for HTTP server to start
        await asyncio.sleep(1)

        while self._running:
            try:
                async with aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as session:
                    tasks = []
                    for endpoint, region in self._endpoints:
                        tasks.append(self._poll_ckpool(session, endpoint, region))
                    tasks.append(self._poll_nats(session))

                    await asyncio.gather(*tasks, return_exceptions=True)

            except Exception as e:
                logger.error("Poll error: %s", e)

            await asyncio.sleep(self.config.poll_interval)

    async def _poll_ckpool(self, session: aiohttp.ClientSession, endpoint: str, region: str):
        """Poll a single ckpool metrics endpoint."""
        url = f"http://{endpoint}/metrics"
        try:
            async with session.get(url) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    metrics = self._parse_prometheus(text)
                    self._region_status[region] = {
                        "status": "healthy",
                        "endpoint": endpoint,
                        "last_check": time.time(),
                        "metrics": metrics,
                    }
                else:
                    self._region_status[region] = {
                        "status": "unhealthy",
                        "endpoint": endpoint,
                        "last_check": time.time(),
                        "error": f"HTTP {resp.status}",
                    }
        except Exception as e:
            self._region_status[region] = {
                "status": "unreachable",
                "endpoint": endpoint,
                "last_check": time.time(),
                "error": str(e),
            }

    async def _poll_nats(self, session: aiohttp.ClientSession):
        """Poll NATS monitoring endpoint."""
        url = f"{self.config.nats_monitoring_url}/varz"
        try:
            async with session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self._nats_status = {
                        "status": "healthy",
                        "connections": data.get("connections", 0),
                        "in_msgs": data.get("in_msgs", 0),
                        "out_msgs": data.get("out_msgs", 0),
                        "mem": data.get("mem", 0),
                        "last_check": time.time(),
                    }
                else:
                    self._nats_status = {
                        "status": "unhealthy",
                        "error": f"HTTP {resp.status}",
                        "last_check": time.time(),
                    }
        except Exception as e:
            self._nats_status = {
                "status": "unreachable",
                "error": str(e),
                "last_check": time.time(),
            }

    def _parse_prometheus(self, text: str) -> dict:
        """Extract key metrics from Prometheus exposition format."""
        metrics = {}
        for line in text.strip().split("\n"):
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 2:
                metrics[parts[0]] = parts[1]
        return metrics

    async def _serve_http(self):
        """Start the HTTP server for health endpoint."""
        self._app = web.Application()
        self._app.router.add_get("/health", self._health_handler)
        self._app.router.add_get("/", self._health_handler)

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()

        site = web.TCPSite(
            self._runner,
            self.config.bind_host,
            self.config.bind_port,
        )
        await site.start()

        logger.info("Health monitor listening on %s:%d", self.config.bind_host, self.config.bind_port)

        # Keep running
        while self._running:
            await asyncio.sleep(1)

    async def _health_handler(self, request: web.Request) -> web.Response:
        """Handle GET /health requests."""
        all_healthy = all(
            r.get("status") == "healthy" for r in self._region_status.values()
        )
        nats_healthy = self._nats_status.get("status") == "healthy"

        overall = "healthy" if (all_healthy and nats_healthy) else "degraded"
        if not self._region_status:
            overall = "initializing"

        body = {
            "status": overall,
            "timestamp": time.time(),
            "regions": self._region_status,
            "nats": self._nats_status,
        }

        return web.json_response(body, status=200 if overall == "healthy" else 503)


async def main():
    config = MonitorConfig()

    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )

    monitor = HealthMonitor(config)

    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def signal_handler():
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    task = asyncio.create_task(monitor.start())

    await stop_event.wait()
    await monitor.stop()
    task.cancel()

    try:
        await task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
