#!/usr/bin/env python3
"""
Stratum V1 Load Test for CKPool
================================

Simulates N concurrent mining clients using asyncio to stress-test a CKPool
stratum endpoint. Each simulated miner follows the standard Stratum V1 protocol:

    mining.subscribe -> mining.authorize -> mining.notify (wait) -> mining.submit

Usage:
    python3 stratum_load_test.py --miners 100 --duration 60 --share-rate 10
    python3 stratum_load_test.py --host pool.example.com --port 3333 --miners 1000

Part of The Bitcoin Game - Phase 5 Production Hardening.
"""

import argparse
import asyncio
import json
import logging
import os
import random
import signal
import string
import struct
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("stratum-loadtest")


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

@dataclass
class MinerStats:
    """Per-miner statistics."""
    worker_name: str
    connected: bool = False
    subscribed: bool = False
    authorized: bool = False
    shares_submitted: int = 0
    shares_accepted: int = 0
    shares_rejected: int = 0
    response_times: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    connect_time: float = 0.0
    disconnect_time: float = 0.0


@dataclass
class GlobalStats:
    """Aggregate statistics across all miners."""
    start_time: float = 0.0
    miners: dict = field(default_factory=dict)
    peak_concurrent: int = 0
    connection_errors: int = 0
    protocol_errors: int = 0
    timeout_errors: int = 0
    total_bytes_sent: int = 0
    total_bytes_received: int = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def register_miner(self, name: str) -> MinerStats:
        async with self._lock:
            stats = MinerStats(worker_name=name)
            self.miners[name] = stats
            return stats

    async def update_peak(self):
        async with self._lock:
            current = sum(1 for m in self.miners.values() if m.connected)
            if current > self.peak_concurrent:
                self.peak_concurrent = current

    def get_connected_count(self) -> int:
        return sum(1 for m in self.miners.values() if m.connected)

    def get_all_response_times(self) -> list:
        times = []
        for m in self.miners.values():
            times.extend(m.response_times)
        return sorted(times)

    def get_totals(self) -> dict:
        submitted = sum(m.shares_submitted for m in self.miners.values())
        accepted = sum(m.shares_accepted for m in self.miners.values())
        rejected = sum(m.shares_rejected for m in self.miners.values())
        return {
            "submitted": submitted,
            "accepted": accepted,
            "rejected": rejected,
        }

    def percentile(self, values: list, pct: float) -> float:
        if not values:
            return 0.0
        idx = int(len(values) * pct / 100.0)
        idx = min(idx, len(values) - 1)
        return values[idx]


# ---------------------------------------------------------------------------
# Stratum V1 Protocol Helpers
# ---------------------------------------------------------------------------

def make_subscribe(req_id: int = 1, user_agent: str = "TBG-LoadTest/1.0") -> bytes:
    """Build a mining.subscribe JSON-RPC request."""
    msg = {
        "id": req_id,
        "method": "mining.subscribe",
        "params": [user_agent],
    }
    return (json.dumps(msg) + "\n").encode("utf-8")


def make_authorize(req_id: int, btc_address: str, worker: str, password: str = "x") -> bytes:
    """Build a mining.authorize JSON-RPC request."""
    msg = {
        "id": req_id,
        "method": "mining.authorize",
        "params": [f"{btc_address}.{worker}", password],
    }
    return (json.dumps(msg) + "\n").encode("utf-8")


def make_submit(
    req_id: int,
    btc_address: str,
    worker: str,
    job_id: str,
    extranonce2: str,
    ntime: str,
    nonce: str,
) -> bytes:
    """Build a mining.submit JSON-RPC request."""
    msg = {
        "id": req_id,
        "method": "mining.submit",
        "params": [f"{btc_address}.{worker}", job_id, extranonce2, ntime, nonce],
    }
    return (json.dumps(msg) + "\n").encode("utf-8")


def random_hex(length: int) -> str:
    """Generate a random hex string of given byte-length (output is 2x chars)."""
    return "".join(random.choices("0123456789abcdef", k=length * 2))


def random_nonce() -> str:
    """Generate a random 4-byte nonce as hex."""
    return struct.pack("<I", random.randint(0, 0xFFFFFFFF)).hex()


# ---------------------------------------------------------------------------
# Simulated Miner
# ---------------------------------------------------------------------------

class SimulatedMiner:
    """
    A single simulated Stratum V1 miner.

    Lifecycle:
        1. Connect TCP
        2. Subscribe (extract extranonce1, extranonce2_size)
        3. Authorize
        4. Wait for mining.notify (job assignment)
        5. Submit shares at configured rate until duration expires
    """

    def __init__(
        self,
        miner_id: int,
        host: str,
        port: int,
        btc_address: str,
        share_rate: float,
        duration: float,
        global_stats: GlobalStats,
        stop_event: asyncio.Event,
    ):
        self.miner_id = miner_id
        self.worker_name = f"worker_{miner_id:04d}"
        self.host = host
        self.port = port
        self.btc_address = btc_address
        self.share_interval = 60.0 / max(share_rate, 0.1)  # seconds between shares
        self.duration = duration
        self.global_stats = global_stats
        self.stop_event = stop_event

        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.stats: Optional[MinerStats] = None
        self.req_id = 0

        # Protocol state
        self.extranonce1 = ""
        self.extranonce2_size = 4
        self.current_job_id = ""
        self.current_prevhash = ""
        self.current_ntime = ""
        self.current_nbits = ""
        self.has_job = asyncio.Event()

        # Pending RPC responses
        self._pending: dict[int, float] = {}  # req_id -> send_timestamp

    def _next_id(self) -> int:
        self.req_id += 1
        return self.req_id

    async def run(self):
        """Main miner coroutine."""
        self.stats = await self.global_stats.register_miner(self.worker_name)
        try:
            await self._connect()
            if not self.stats.connected:
                return

            # Run subscribe + authorize sequentially, then submit loop
            await self._subscribe()
            if not self.stats.subscribed:
                return

            await self._authorize()
            if not self.stats.authorized:
                return

            # Run notify listener and submit loop concurrently
            await asyncio.gather(
                self._notify_listener(),
                self._submit_loop(),
            )

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            self.stats.errors.append(f"fatal: {exc}")
            logger.debug("Miner %s fatal error: %s", self.worker_name, exc)
        finally:
            await self._disconnect()

    async def _connect(self):
        """Establish TCP connection."""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=10.0,
            )
            self.stats.connected = True
            self.stats.connect_time = time.monotonic()
            await self.global_stats.update_peak()
            logger.debug("Miner %s connected", self.worker_name)
        except asyncio.TimeoutError:
            self.stats.errors.append("connect_timeout")
            self.global_stats.timeout_errors += 1
            logger.debug("Miner %s connect timeout", self.worker_name)
        except OSError as exc:
            self.stats.errors.append(f"connect_error: {exc}")
            self.global_stats.connection_errors += 1
            logger.debug("Miner %s connect error: %s", self.worker_name, exc)

    async def _disconnect(self):
        """Close TCP connection."""
        self.stats.connected = False
        self.stats.disconnect_time = time.monotonic()
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass

    async def _send(self, data: bytes):
        """Send data to the pool."""
        if self.writer is None:
            return
        try:
            self.writer.write(data)
            await self.writer.drain()
            self.global_stats.total_bytes_sent += len(data)
        except Exception as exc:
            self.stats.errors.append(f"send_error: {exc}")
            raise

    async def _recv_line(self, timeout: float = 30.0) -> Optional[dict]:
        """Read one JSON line from the pool."""
        if self.reader is None:
            return None
        try:
            raw = await asyncio.wait_for(self.reader.readline(), timeout=timeout)
            if not raw:
                return None
            self.global_stats.total_bytes_received += len(raw)
            return json.loads(raw.decode("utf-8").strip())
        except asyncio.TimeoutError:
            self.stats.errors.append("recv_timeout")
            self.global_stats.timeout_errors += 1
            return None
        except json.JSONDecodeError as exc:
            self.stats.errors.append(f"json_error: {exc}")
            self.global_stats.protocol_errors += 1
            return None

    async def _subscribe(self):
        """Send mining.subscribe and process response."""
        req_id = self._next_id()
        self._pending[req_id] = time.monotonic()
        await self._send(make_subscribe(req_id))

        resp = await self._recv_line(timeout=10.0)
        if resp is None:
            self.stats.errors.append("subscribe_no_response")
            return

        self._record_response_time(resp)

        # Parse subscribe result
        # Expected: {"id": 1, "result": [[["mining.set_difficulty", "..."], ["mining.notify", "..."]], "extranonce1", extranonce2_size], "error": null}
        if resp.get("error"):
            self.stats.errors.append(f"subscribe_error: {resp['error']}")
            self.global_stats.protocol_errors += 1
            return

        result = resp.get("result")
        if isinstance(result, list) and len(result) >= 3:
            self.extranonce1 = str(result[1])
            self.extranonce2_size = int(result[2])
        elif isinstance(result, list) and len(result) >= 2:
            # Some pools return fewer fields
            self.extranonce1 = str(result[-2]) if len(result) >= 2 else "00000000"
            self.extranonce2_size = int(result[-1]) if isinstance(result[-1], int) else 4

        self.stats.subscribed = True
        logger.debug(
            "Miner %s subscribed: extranonce1=%s, en2_size=%d",
            self.worker_name, self.extranonce1, self.extranonce2_size,
        )

    async def _authorize(self):
        """Send mining.authorize and process response."""
        req_id = self._next_id()
        self._pending[req_id] = time.monotonic()
        await self._send(make_authorize(req_id, self.btc_address, self.worker_name))

        resp = await self._recv_line(timeout=10.0)
        if resp is None:
            self.stats.errors.append("authorize_no_response")
            return

        self._record_response_time(resp)

        # CKPool may send mining.set_difficulty or mining.notify before the auth response
        # Keep reading until we get our auth response
        attempts = 0
        while resp.get("id") != req_id and attempts < 5:
            self._handle_server_push(resp)
            resp = await self._recv_line(timeout=10.0)
            if resp is None:
                break
            attempts += 1

        if resp and resp.get("result") is True:
            self.stats.authorized = True
            logger.debug("Miner %s authorized", self.worker_name)
        elif resp and resp.get("error"):
            self.stats.errors.append(f"authorize_error: {resp['error']}")
            self.global_stats.protocol_errors += 1
        else:
            # Some pools send True in result even for error, treat connection as authorized
            # if we got any response
            if resp is not None:
                self.stats.authorized = True
                logger.debug("Miner %s authorize response (non-standard): %s", self.worker_name, resp)

    async def _notify_listener(self):
        """Listen for mining.notify and mining.set_difficulty pushes."""
        deadline = time.monotonic() + self.duration
        while not self.stop_event.is_set() and time.monotonic() < deadline:
            try:
                resp = await self._recv_line(timeout=5.0)
                if resp is None:
                    if self.reader and self.reader.at_eof():
                        logger.debug("Miner %s: server closed connection", self.worker_name)
                        break
                    continue

                self._record_response_time(resp)
                self._handle_server_push(resp)

            except Exception as exc:
                self.stats.errors.append(f"notify_error: {exc}")
                break

    def _handle_server_push(self, msg: dict):
        """Handle server-initiated messages (notifications)."""
        method = msg.get("method", "")

        if method == "mining.notify":
            params = msg.get("params", [])
            if len(params) >= 5:
                self.current_job_id = str(params[0])
                self.current_prevhash = str(params[1])
                self.current_ntime = str(params[7]) if len(params) > 7 else random_hex(4)
                self.current_nbits = str(params[6]) if len(params) > 6 else random_hex(4)
                self.has_job.set()
                logger.debug("Miner %s got job %s", self.worker_name, self.current_job_id)

        elif method == "mining.set_difficulty":
            params = msg.get("params", [])
            if params:
                logger.debug("Miner %s difficulty set to %s", self.worker_name, params[0])

        # Handle submit responses (id-based)
        elif "id" in msg and msg["id"] in self._pending:
            # This is a response to one of our submits
            pass

    async def _submit_loop(self):
        """Submit shares at the configured rate."""
        deadline = time.monotonic() + self.duration

        # Wait for first job before submitting (max 30s)
        try:
            await asyncio.wait_for(self.has_job.wait(), timeout=30.0)
        except asyncio.TimeoutError:
            # No job received; submit with synthetic job data anyway for load testing
            self.current_job_id = random_hex(4)
            self.current_ntime = random_hex(4)
            logger.debug("Miner %s: no job received, using synthetic job", self.worker_name)

        while not self.stop_event.is_set() and time.monotonic() < deadline:
            try:
                await self._submit_share()
                # Jitter: +/- 20% of interval
                jitter = self.share_interval * 0.2 * (random.random() * 2 - 1)
                sleep_time = max(0.1, self.share_interval + jitter)
                await asyncio.sleep(sleep_time)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self.stats.errors.append(f"submit_loop_error: {exc}")
                await asyncio.sleep(1.0)

    async def _submit_share(self):
        """Submit a single share."""
        req_id = self._next_id()
        extranonce2 = random_hex(self.extranonce2_size)
        nonce = random_nonce()

        self._pending[req_id] = time.monotonic()
        self.stats.shares_submitted += 1

        await self._send(make_submit(
            req_id=req_id,
            btc_address=self.btc_address,
            worker=self.worker_name,
            job_id=self.current_job_id,
            extranonce2=extranonce2,
            ntime=self.current_ntime,
            nonce=nonce,
        ))

        # Try to read the response (non-blocking; the notify listener may also catch it)
        resp = await self._recv_line(timeout=5.0)
        if resp:
            self._record_response_time(resp)
            if "id" in resp and resp.get("result") is True:
                self.stats.shares_accepted += 1
            elif "id" in resp and resp.get("result") is False:
                self.stats.shares_rejected += 1
            elif resp.get("error"):
                self.stats.shares_rejected += 1
            else:
                # Could be a push notification; handle it
                self._handle_server_push(resp)

    def _record_response_time(self, resp: dict):
        """Record response time for id-matched responses."""
        resp_id = resp.get("id")
        if resp_id and resp_id in self._pending:
            elapsed = time.monotonic() - self._pending.pop(resp_id)
            self.stats.response_times.append(elapsed * 1000.0)  # milliseconds


# ---------------------------------------------------------------------------
# Statistics Reporter
# ---------------------------------------------------------------------------

class StatsReporter:
    """Periodic and final statistics reporting."""

    def __init__(self, global_stats: GlobalStats, interval: float = 10.0):
        self.stats = global_stats
        self.interval = interval
        self._prev_submitted = 0
        self._prev_time = 0.0

    async def periodic_report(self, stop_event: asyncio.Event, duration: float):
        """Print stats every `interval` seconds."""
        self._prev_time = time.monotonic()
        deadline = time.monotonic() + duration + 5.0  # small grace period

        while not stop_event.is_set() and time.monotonic() < deadline:
            await asyncio.sleep(self.interval)
            self._print_interval_stats()

    def _print_interval_stats(self):
        totals = self.stats.get_totals()
        connected = self.stats.get_connected_count()
        rt = self.stats.get_all_response_times()
        now = time.monotonic()
        elapsed = now - self._prev_time
        new_shares = totals["submitted"] - self._prev_submitted
        rate = new_shares / elapsed if elapsed > 0 else 0

        avg_rt = sum(rt) / len(rt) if rt else 0.0

        logger.info(
            "INTERVAL | connected=%d | submitted=%d (+%d, %.1f/s) | "
            "accepted=%d | rejected=%d | avg_rt=%.2fms | errors=%d",
            connected,
            totals["submitted"], new_shares, rate,
            totals["accepted"],
            totals["rejected"],
            avg_rt,
            self.stats.connection_errors + self.stats.protocol_errors + self.stats.timeout_errors,
        )

        self._prev_submitted = totals["submitted"]
        self._prev_time = now

    def print_final_report(self, wall_time: float):
        totals = self.stats.get_totals()
        rt = self.stats.get_all_response_times()

        # Error breakdown
        error_counts = defaultdict(int)
        for m in self.stats.miners.values():
            for e in m.errors:
                key = e.split(":")[0] if ":" in e else e
                error_counts[key] += 1

        p50 = self.stats.percentile(rt, 50)
        p95 = self.stats.percentile(rt, 95)
        p99 = self.stats.percentile(rt, 99)
        avg_rt = sum(rt) / len(rt) if rt else 0.0
        min_rt = min(rt) if rt else 0.0
        max_rt = max(rt) if rt else 0.0

        accept_rate = (
            (totals["accepted"] / totals["submitted"] * 100.0)
            if totals["submitted"] > 0
            else 0.0
        )

        shares_per_sec = totals["submitted"] / wall_time if wall_time > 0 else 0

        separator = "=" * 72
        print(f"\n{separator}")
        print("  STRATUM LOAD TEST - FINAL REPORT")
        print(separator)
        print(f"  Wall time:              {wall_time:.1f}s")
        print(f"  Total miners:           {len(self.stats.miners)}")
        print(f"  Peak concurrent:        {self.stats.peak_concurrent}")
        print(f"  Miners still connected: {self.stats.get_connected_count()}")
        print(separator)
        print("  SHARES")
        print(f"    Submitted:            {totals['submitted']}")
        print(f"    Accepted:             {totals['accepted']}")
        print(f"    Rejected:             {totals['rejected']}")
        print(f"    Accept rate:          {accept_rate:.1f}%")
        print(f"    Throughput:           {shares_per_sec:.1f} shares/sec")
        print(separator)
        print("  RESPONSE TIMES (ms)")
        print(f"    Samples:              {len(rt)}")
        print(f"    Min:                  {min_rt:.2f}")
        print(f"    Avg:                  {avg_rt:.2f}")
        print(f"    P50:                  {p50:.2f}")
        print(f"    P95:                  {p95:.2f}")
        print(f"    P99:                  {p99:.2f}")
        print(f"    Max:                  {max_rt:.2f}")
        print(separator)
        print("  NETWORK")
        print(f"    Bytes sent:           {self.stats.total_bytes_sent:,}")
        print(f"    Bytes received:       {self.stats.total_bytes_received:,}")
        print(separator)
        print("  ERRORS")
        print(f"    Connection errors:    {self.stats.connection_errors}")
        print(f"    Protocol errors:      {self.stats.protocol_errors}")
        print(f"    Timeout errors:       {self.stats.timeout_errors}")
        if error_counts:
            print("    Breakdown:")
            for err_type, count in sorted(error_counts.items(), key=lambda x: -x[1]):
                print(f"      {err_type}: {count}")
        else:
            print("    (no errors)")
        print(separator)
        print()


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run_load_test(args: argparse.Namespace):
    """Main load test orchestrator."""
    logger.info(
        "Starting load test: host=%s:%d, miners=%d, duration=%ds, "
        "share_rate=%.1f/min, ramp_up=%ds",
        args.host, args.port, args.miners, args.duration,
        args.share_rate, args.ramp_up,
    )

    global_stats = GlobalStats(start_time=time.monotonic())
    stop_event = asyncio.Event()

    # Handle graceful shutdown
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    # Start stats reporter
    reporter = StatsReporter(global_stats, interval=10.0)
    reporter_task = asyncio.create_task(
        reporter.periodic_report(stop_event, args.duration)
    )

    # Ramp up miners
    ramp_delay = args.ramp_up / max(args.miners, 1)
    miner_tasks = []

    logger.info("Ramping up %d miners over %ds...", args.miners, args.ramp_up)

    for i in range(args.miners):
        if stop_event.is_set():
            break

        miner = SimulatedMiner(
            miner_id=i + 1,
            host=args.host,
            port=args.port,
            btc_address=args.btc_address,
            share_rate=args.share_rate,
            duration=args.duration,
            global_stats=global_stats,
            stop_event=stop_event,
        )
        task = asyncio.create_task(miner.run())
        miner_tasks.append(task)

        if ramp_delay > 0 and i < args.miners - 1:
            await asyncio.sleep(ramp_delay)

    logger.info("All %d miners launched. Running for %ds...", len(miner_tasks), args.duration)

    # Wait for all miners to complete or stop event
    done, pending = await asyncio.wait(
        miner_tasks,
        timeout=args.duration + args.ramp_up + 30,  # generous timeout
    )

    # Signal stop and cancel stragglers
    stop_event.set()
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)

    # Stop reporter
    reporter_task.cancel()
    try:
        await reporter_task
    except asyncio.CancelledError:
        pass

    # Final report
    wall_time = time.monotonic() - global_stats.start_time
    reporter.print_final_report(wall_time)

    # Return exit code based on error rate
    totals = global_stats.get_totals()
    if totals["submitted"] == 0:
        logger.error("No shares were submitted. Check connectivity.")
        return 2
    error_total = (
        global_stats.connection_errors
        + global_stats.protocol_errors
        + global_stats.timeout_errors
    )
    if error_total > args.miners * 0.5:
        logger.warning("High error rate: %d errors for %d miners", error_total, args.miners)
        return 1
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Stratum V1 Load Test for CKPool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Quick smoke test
  %(prog)s --miners 10 --duration 30

  # Standard load test
  %(prog)s --miners 100 --duration 60 --share-rate 10

  # Stress test
  %(prog)s --miners 1000 --duration 120 --share-rate 20

  # Remote pool
  %(prog)s --host pool.example.com --port 3333 --miners 500
        """,
    )
    parser.add_argument(
        "--host", default="localhost",
        help="Stratum host (default: localhost)",
    )
    parser.add_argument(
        "--port", type=int, default=3333,
        help="Stratum port (default: 3333)",
    )
    parser.add_argument(
        "--miners", type=int, default=100,
        help="Number of simulated miners (default: 100)",
    )
    parser.add_argument(
        "--duration", type=int, default=60,
        help="Test duration in seconds (default: 60)",
    )
    parser.add_argument(
        "--share-rate", type=float, default=10.0,
        help="Shares per minute per miner (default: 10)",
    )
    parser.add_argument(
        "--ramp-up", type=int, default=10,
        help="Seconds to ramp up all miners (default: 10)",
    )
    parser.add_argument(
        "--btc-address",
        default="bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls",
        help="BTC address for mining.authorize",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args(argv)


def main():
    args = parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    exit_code = asyncio.run(run_load_test(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
