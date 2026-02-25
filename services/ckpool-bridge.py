#!/usr/bin/env python3
"""CKPool → Redis bridge for vanilla ckpool (no TBG patches).

Reads ckpool's pool.status file and publishes worker state to Redis
using the exact key patterns the API expects:
  - workers:{btc_address}  (SET of worker names)
  - worker:{btc_address}:{name}  (HASH with live state)

Usage: python3 ckpool-bridge.py
"""

import json
import os
import subprocess
import time
from datetime import datetime, timezone

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
POLL_INTERVAL = 3  # seconds
BTC_ADDRESS = "mfnNyPsinywVCqCr35215gviGo8cWGiDnb"
WORKER_NAME = "worker1"

POOL_STATUS_CMD = [
    "docker", "exec", "tbg-ckpool",
    "cat", "/var/log/ckpool/pool/pool.status"
]


def get_pool_status() -> dict | None:
    """Read ckpool's pool.status file (3 JSON lines merged)."""
    try:
        result = subprocess.run(POOL_STATUS_CMD, capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return None
        status = {}
        for line in result.stdout.strip().split("\n"):
            if line.strip():
                status.update(json.loads(line))
        return status
    except Exception as e:
        print(f"[ERR] {e}")
        return None


def publish_to_redis(r: redis.Redis, status: dict):
    """Write worker state to Redis using the API's expected key patterns."""
    workers_online = status.get("Workers", 0)
    now_iso = datetime.now(timezone.utc).isoformat()

    worker_set_key = f"workers:{BTC_ADDRESS}"
    worker_hash_key = f"worker:{BTC_ADDRESS}:{WORKER_NAME}"

    if workers_online > 0:
        # Add worker to the user's worker set
        r.sadd(worker_set_key, WORKER_NAME)

        # Write the worker hash with fields matching WorkerItem schema
        r.hset(worker_hash_key, mapping={
            "is_online": "1",
            "hashrate_1m": status.get("hashrate1m", "0"),
            "hashrate_5m": status.get("hashrate5m", "0"),
            "hashrate_1h": status.get("hashrate1hr", "0"),
            "hashrate_24h": status.get("hashrate1d", "0"),
            "current_diff": "1",
            "last_share": now_iso if int(status.get("accepted", 0)) > 0 else "",
            "connected_at": now_iso,
            "ip": "127.0.0.1",
            "useragent": "cpuminer/2.5.1",
            "shares_session": str(status.get("accepted", 0)),
        })

        # Also publish a miner_connected event to the stream (for the event consumer)
        r.xadd("mining:miner_connected", {
            "user": BTC_ADDRESS,
            "worker": WORKER_NAME,
            "ip": "127.0.0.1",
            "useragent": "cpuminer/2.5.1",
            "diff": "1",
            "timestamp": str(int(time.time())),
        }, maxlen=1000)

        # Publish hashrate update event
        r.xadd("mining:hashrate_update", {
            "user": BTC_ADDRESS,
            "worker": WORKER_NAME,
            "hashrate_1m": status.get("hashrate1m", "0"),
            "hashrate_5m": status.get("hashrate5m", "0"),
            "hashrate_1h": status.get("hashrate1hr", "0"),
            "hashrate_1d": status.get("hashrate1d", "0"),
            "timestamp": str(int(time.time())),
        }, maxlen=10000)

    else:
        # Mark worker offline
        if r.exists(worker_hash_key):
            r.hset(worker_hash_key, "is_online", "0")

    # Store aggregate user hashrate
    r.hset(f"user_hashrate:{BTC_ADDRESS}", mapping={
        "hashrate_1m": status.get("hashrate1m", "0"),
        "hashrate_5m": status.get("hashrate5m", "0"),
        "hashrate_1h": status.get("hashrate1hr", "0"),
        "hashrate_24h": status.get("hashrate1d", "0"),
    })

    # Store dashboard-level stats
    r.hset("tbg:pool:stats", mapping={
        "workers_online": str(workers_online),
        "users": str(status.get("Users", 0)),
        "accepted": str(status.get("accepted", 0)),
        "rejected": str(status.get("rejected", 0)),
        "bestshare": str(status.get("bestshare", 0)),
    })


def main():
    print("=== CKPool → Redis Bridge ===")
    print(f"Redis: {REDIS_URL}")
    print(f"Address: {BTC_ADDRESS}")
    print(f"Worker: {WORKER_NAME}")
    print(f"Poll: {POLL_INTERVAL}s\n", flush=True)

    r = redis.from_url(REDIS_URL, decode_responses=True)
    r.ping()
    print("[OK] Connected to Redis\n", flush=True)

    prev_accepted = -1
    while True:
        try:
            status = get_pool_status()
            if status:
                publish_to_redis(r, status)

                workers = status.get("Workers", 0)
                accepted = status.get("accepted", 0)
                rejected = status.get("rejected", 0)
                hr1m = status.get("hashrate1m", "0")
                best = status.get("bestshare", 0)

                if accepted != prev_accepted:
                    print(f"[SHARE] accepted={accepted} rejected={rejected} best={best}", flush=True)
                    prev_accepted = accepted

                print(f"[POLL] workers={workers} hr1m={hr1m} accepted={accepted}", flush=True)

        except Exception as e:
            print(f"[ERR] {e}", flush=True)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
