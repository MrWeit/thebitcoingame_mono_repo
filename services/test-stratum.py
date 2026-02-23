#!/usr/bin/env python3
"""Simple Stratum test client for TheBitcoinGame ckpool testing.

Connects to ckpool, subscribes, authorizes, and submits work.
This is NOT a real miner — it exercises the Stratum protocol to
verify events flow through the pipeline.

Usage:
    python3 test-stratum.py [host] [port] [user]
"""

import json
import socket
import sys
import time

HOST = sys.argv[1] if len(sys.argv) > 1 else "localhost"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3333
USER = sys.argv[3] if len(sys.argv) > 3 else "bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls"

def send_json(sock, obj):
    """Send a JSON-RPC message to the pool."""
    line = json.dumps(obj) + "\n"
    sock.sendall(line.encode())
    print(f"  -> {json.dumps(obj)}")

def recv_lines(sock, timeout=3):
    """Receive all available JSON lines from the pool."""
    sock.settimeout(timeout)
    buf = b""
    try:
        while True:
            data = sock.recv(4096)
            if not data:
                break
            buf += data
    except socket.timeout:
        pass
    lines = buf.decode().strip().split("\n")
    results = []
    for line in lines:
        if line:
            try:
                obj = json.loads(line)
                print(f"  <- {json.dumps(obj, indent=None)[:200]}")
                results.append(obj)
            except json.JSONDecodeError:
                print(f"  <- (raw) {line[:200]}")
    return results

def main():
    print(f"=== TheBitcoinGame Stratum Test Client ===")
    print(f"  Pool: {HOST}:{PORT}")
    print(f"  User: {USER}")
    print()

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((HOST, PORT))
    print("[1/4] Connected to pool")

    # Step 1: Subscribe
    print("\n[2/4] Subscribing...")
    send_json(sock, {
        "id": 1,
        "method": "mining.subscribe",
        "params": ["TBG-TestClient/1.0"]
    })
    responses = recv_lines(sock, timeout=5)

    # Extract subscription data
    subscribe_result = None
    extranonce1 = None
    extranonce2_size = None
    job_id = None
    for r in responses:
        if r.get("id") == 1 and r.get("result"):
            subscribe_result = r["result"]
            extranonce1 = subscribe_result[1]
            extranonce2_size = subscribe_result[2]
            print(f"  Subscribed! extranonce1={extranonce1}, extranonce2_size={extranonce2_size}")
        if r.get("method") == "mining.notify":
            job_id = r["params"][0]
            print(f"  Got job: {job_id}")

    if not subscribe_result:
        print("FATAL: Subscribe failed")
        sock.close()
        return

    # Step 2: Authorize
    print(f"\n[3/4] Authorizing as {USER}...")
    send_json(sock, {
        "id": 2,
        "method": "mining.authorize",
        "params": [USER, "x"]
    })
    time.sleep(1)
    responses = recv_lines(sock, timeout=3)

    authorized = False
    for r in responses:
        if r.get("id") == 2:
            authorized = r.get("result", False)
            print(f"  Authorized: {authorized}")
        if r.get("method") == "mining.notify":
            job_id = r["params"][0]

    if not authorized:
        print("WARNING: Authorization may have failed (continuing anyway)")

    # Step 3: Submit a dummy share
    # This will likely be rejected as invalid, but it will trigger the share event
    print(f"\n[4/4] Submitting test share (job={job_id})...")
    extranonce2 = "00" * extranonce2_size
    ntime = "699b5c98"
    nonce = "00000000"

    send_json(sock, {
        "id": 3,
        "method": "mining.submit",
        "params": [USER, job_id, extranonce2, ntime, nonce]
    })
    time.sleep(1)
    responses = recv_lines(sock, timeout=3)

    for r in responses:
        if r.get("id") == 3:
            if r.get("result"):
                print("  Share ACCEPTED!")
            else:
                print(f"  Share rejected: {r.get('error', 'unknown')}")

    # Done
    print("\n=== Test Complete ===")
    print("Check events with:")
    print("  docker exec tbg-redis redis-cli XRANGE mining:miner_connected - +")
    print("  docker exec tbg-redis redis-cli XRANGE mining:share_submitted - +")
    print("  docker logs tbg-event-collector")

    sock.close()

if __name__ == "__main__":
    main()
