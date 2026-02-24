#!/usr/bin/env python3
"""Minimal Python CPU miner for TheBitcoinGame CKPool testing.

Actually performs SHA256d hashing and submits valid shares at diff 1.
Usage: python3 cpuminer.py [host] [port] [user]
"""

import hashlib
import json
import socket
import struct
import sys
import threading
import time

HOST = sys.argv[1] if len(sys.argv) > 1 else "localhost"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3333
USER = sys.argv[3] if len(sys.argv) > 3 else "mfnNyPsinywVCqCr35215gviGo8cWGiDnb.worker1"
THREADS = int(sys.argv[4]) if len(sys.argv) > 4 else 1

# Global state
current_job = None
job_lock = threading.Lock()
extranonce1 = None
extranonce2_size = 8
target_diff = 1
sock = None
sock_lock = threading.Lock()
shares_submitted = 0
shares_accepted = 0
shares_rejected = 0
hashes_done = 0
start_time = None


def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def nbits_to_target(nbits_hex: str) -> int:
    nbits = int(nbits_hex, 16)
    exp = nbits >> 24
    mant = nbits & 0x7fffff
    return mant * (2 ** (8 * (exp - 3)))


def diff1_target():
    """Bitcoin diff 1 target."""
    return 0x00000000ffff0000000000000000000000000000000000000000000000000000


def send_json(obj):
    with sock_lock:
        line = json.dumps(obj) + "\n"
        sock.sendall(line.encode())


def recv_loop():
    """Background thread: reads from pool and updates job state."""
    global current_job, target_diff, extranonce1, extranonce2_size
    buf = b""
    while True:
        try:
            data = sock.recv(4096)
            if not data:
                print("[RECV] Connection closed")
                break
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if msg.get("method") == "mining.notify":
                    p = msg["params"]
                    with job_lock:
                        current_job = {
                            "job_id": p[0],
                            "prevhash": p[1],
                            "coinb1": p[2],
                            "coinb2": p[3],
                            "merkle_branches": p[4],
                            "version": p[5],
                            "nbits": p[6],
                            "ntime": p[7],
                            "clean": p[8],
                        }
                    print(f"[JOB] New job {p[0][:16]}... clean={p[8]} ntime={p[7]}")

                elif msg.get("method") == "mining.set_difficulty":
                    target_diff = msg["params"][0]
                    print(f"[DIFF] Pool set difficulty to {target_diff}")

                elif msg.get("id") == 1 and msg.get("result"):
                    # Subscribe response
                    extranonce1 = msg["result"][1]
                    extranonce2_size = msg["result"][2]
                    print(f"[SUB] extranonce1={extranonce1} extranonce2_size={extranonce2_size}")

                elif msg.get("id") == 2:
                    print(f"[AUTH] Authorized: {msg.get('result')}")

                elif msg.get("id") and msg["id"] >= 100:
                    global shares_accepted, shares_rejected
                    if msg.get("result"):
                        shares_accepted += 1
                        print(f"[SHARE] Accepted! ({shares_accepted}/{shares_submitted})")
                    else:
                        shares_rejected += 1
                        print(f"[SHARE] Rejected: {msg.get('error')} ({shares_rejected} rejected)")

        except (ConnectionError, OSError) as e:
            print(f"[RECV] Error: {e}")
            break


def build_block_header(job, extranonce2_hex: str) -> tuple:
    """Build the 80-byte block header from job data."""
    # Build coinbase
    coinbase = bytes.fromhex(job["coinb1"]) + bytes.fromhex(extranonce1) + \
               bytes.fromhex(extranonce2_hex) + bytes.fromhex(job["coinb2"])
    coinbase_hash = sha256d(coinbase)

    # Build merkle root
    merkle_root = coinbase_hash
    for branch in job["merkle_branches"]:
        merkle_root = sha256d(merkle_root + bytes.fromhex(branch))

    # Build header (80 bytes)
    version = struct.pack("<I", int(job["version"], 16))
    prev_hash = bytes.fromhex(job["prevhash"])
    merkle = merkle_root
    ntime = struct.pack("<I", int(job["ntime"], 16))
    nbits = struct.pack("<I", int(job["nbits"], 16))

    header_prefix = version + prev_hash + merkle + ntime + nbits
    return header_prefix  # 76 bytes, nonce appended during mining


def mine_thread(thread_id: int):
    """Mining thread: hashes block headers and submits shares."""
    global shares_submitted, hashes_done

    share_target = int(diff1_target() / target_diff)
    share_id = 100 + thread_id * 1000000

    print(f"[MINE] Thread {thread_id} started")

    while True:
        with job_lock:
            job = current_job.copy() if current_job else None

        if not job:
            time.sleep(0.1)
            continue

        # Pick a random extranonce2
        en2 = struct.pack(">Q", int(time.time() * 1000 + thread_id) & 0xFFFFFFFFFFFFFFFF)
        extranonce2_hex = en2[:extranonce2_size].hex()

        header_prefix = build_block_header(job, extranonce2_hex)

        # Scan nonces
        for nonce in range(0, 0xFFFFFFFF, 1):
            # Check if job changed
            if nonce % 100000 == 0 and nonce > 0:
                hashes_done += 100000
                with job_lock:
                    if current_job and current_job["job_id"] != job["job_id"] and current_job["clean"]:
                        break

            header = header_prefix + struct.pack("<I", nonce)
            h = sha256d(header)
            val = int.from_bytes(h, "little")

            if val < share_target:
                nonce_hex = struct.pack("<I", nonce).hex()
                share_id += 1
                shares_submitted += 1
                hashes_done += (nonce % 100000) + 1

                print(f"[MINE] Thread {thread_id} found share! nonce={nonce_hex} diff≈{diff1_target()/val:.2f}")
                send_json({
                    "id": share_id,
                    "method": "mining.submit",
                    "params": [USER, job["job_id"], extranonce2_hex, job["ntime"], nonce_hex]
                })
                # Keep scanning for more shares with same job
                continue

        hashes_done += (nonce % 100000)


def stats_thread():
    """Print hashrate stats every 10 seconds."""
    global hashes_done
    while True:
        time.sleep(10)
        elapsed = time.time() - start_time
        rate = hashes_done / elapsed if elapsed > 0 else 0
        if rate > 1e6:
            rate_str = f"{rate/1e6:.2f} MH/s"
        elif rate > 1e3:
            rate_str = f"{rate/1e3:.2f} kH/s"
        else:
            rate_str = f"{rate:.0f} H/s"
        print(f"[STATS] {rate_str} | accepted={shares_accepted} rejected={shares_rejected} | elapsed={elapsed:.0f}s")


def main():
    global sock, start_time

    print(f"=== TBG CPU Miner ===")
    print(f"Pool: {HOST}:{PORT}")
    print(f"User: {USER}")
    print(f"Threads: {THREADS}")
    print()

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((HOST, PORT))
    print("[CONN] Connected to pool")

    # Start receiver thread
    t = threading.Thread(target=recv_loop, daemon=True)
    t.start()

    # Subscribe
    send_json({"id": 1, "method": "mining.subscribe", "params": ["TBG-PythonMiner/1.0"]})
    time.sleep(1)

    # Authorize
    send_json({"id": 2, "method": "mining.authorize", "params": [USER, "x"]})
    time.sleep(1)

    # Wait for first job
    print("[MINE] Waiting for first job...")
    while current_job is None:
        time.sleep(0.1)

    start_time = time.time()

    # Start stats thread
    st = threading.Thread(target=stats_thread, daemon=True)
    st.start()

    # Start mining threads
    threads = []
    for i in range(THREADS):
        mt = threading.Thread(target=mine_thread, args=(i,), daemon=True)
        mt.start()
        threads.append(mt)

    # Run until interrupted
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        elapsed = time.time() - start_time
        print(f"\n[DONE] Mined for {elapsed:.0f}s | {shares_accepted} accepted, {shares_rejected} rejected")


if __name__ == "__main__":
    main()
