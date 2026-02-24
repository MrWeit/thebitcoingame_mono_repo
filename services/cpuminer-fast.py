#!/usr/bin/env python3
"""Fast Python CPU miner using struct packing optimization.

The key insight: Python's hashlib.sha256 calls OpenSSL C code (~10M SHA256/s),
but the overhead of building a new bytes object per nonce kills performance.
We optimize by pre-allocating a bytearray and mutating only the 4 nonce bytes.
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
THREADS = int(sys.argv[4]) if len(sys.argv) > 4 else 2

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


def sha256d(data):
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def diff1_target():
    return 0x00000000ffff0000000000000000000000000000000000000000000000000000


def send_json(obj):
    with sock_lock:
        line = json.dumps(obj) + "\n"
        sock.sendall(line.encode())


def recv_loop():
    global current_job, target_diff, extranonce1, extranonce2_size
    global shares_accepted, shares_rejected
    buf = b""
    while True:
        try:
            data = sock.recv(4096)
            if not data:
                break
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if not line.strip():
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if msg.get("method") == "mining.notify":
                    p = msg["params"]
                    with job_lock:
                        current_job = {
                            "job_id": p[0], "prevhash": p[1],
                            "coinb1": p[2], "coinb2": p[3],
                            "merkle_branches": p[4], "version": p[5],
                            "nbits": p[6], "ntime": p[7], "clean": p[8],
                        }
                    print(f"[JOB] {p[0][:16]}... ntime={p[7]} clean={p[8]}")
                elif msg.get("method") == "mining.set_difficulty":
                    target_diff = msg["params"][0]
                    print(f"[DIFF] {target_diff}")
                elif msg.get("id") == 1 and msg.get("result"):
                    extranonce1 = msg["result"][1]
                    extranonce2_size = msg["result"][2]
                    print(f"[SUB] en1={extranonce1} en2sz={extranonce2_size}")
                elif msg.get("id") == 2:
                    print(f"[AUTH] {msg.get('result')}")
                elif msg.get("id") and msg["id"] >= 100:
                    if msg.get("result"):
                        shares_accepted += 1
                        print(f"[OK] Share accepted ({shares_accepted} total)")
                    else:
                        shares_rejected += 1
                        print(f"[REJ] {msg.get('error')} ({shares_rejected} rej)")
        except Exception as e:
            print(f"[ERR] {e}")
            break


def mine_thread(thread_id):
    global shares_submitted, hashes_done

    share_id = 100 + thread_id * 10000000
    sha256 = hashlib.sha256

    while True:
        with job_lock:
            job = dict(current_job) if current_job else None
        if not job:
            time.sleep(0.1)
            continue

        share_target = int(diff1_target() / max(target_diff, 0.001))

        # Build coinbase and merkle root
        en2_val = (int(time.time()) + thread_id) & 0xFFFFFFFFFFFFFFFF
        en2_bytes = struct.pack(">Q", en2_val)[:extranonce2_size]
        en2_hex = en2_bytes.hex()

        coinbase = (bytes.fromhex(job["coinb1"]) +
                    bytes.fromhex(extranonce1) +
                    en2_bytes +
                    bytes.fromhex(job["coinb2"]))
        merkle_root = sha256(sha256(coinbase).digest()).digest()
        for br in job["merkle_branches"]:
            merkle_root = sha256(sha256(merkle_root + bytes.fromhex(br)).digest()).digest()

        # Build 80-byte header template (mutable)
        header = bytearray(80)
        struct.pack_into("<I", header, 0, int(job["version"], 16))
        header[4:36] = bytes.fromhex(job["prevhash"])
        header[36:68] = merkle_root
        struct.pack_into("<I", header, 68, int(job["ntime"], 16))
        struct.pack_into("<I", header, 72, int(job["nbits"], 16))

        # Scan nonces — mutate only bytes 76-79
        job_id = job["job_id"]
        ntime_hex = job["ntime"]
        nonce_start = thread_id * (0xFFFFFFFF // max(THREADS, 1))
        batch = 50000

        for nonce_base in range(nonce_start, 0xFFFFFFFF, batch):
            # Check job change every batch
            with job_lock:
                if current_job and current_job["job_id"] != job_id and current_job.get("clean"):
                    break

            for nonce in range(nonce_base, min(nonce_base + batch, 0xFFFFFFFF)):
                # Pack nonce into header bytes 76-79 (little-endian)
                header[76] = nonce & 0xFF
                header[77] = (nonce >> 8) & 0xFF
                header[78] = (nonce >> 16) & 0xFF
                header[79] = (nonce >> 24) & 0xFF

                # Double SHA256
                h = sha256(sha256(bytes(header)).digest()).digest()

                # Check against share target (compare first 4 bytes LE as quick filter)
                if h[31] == 0 and h[30] == 0 and h[29] == 0 and h[28] == 0:
                    val = int.from_bytes(h, "little")
                    if val < share_target:
                        nonce_hex = struct.pack("<I", nonce).hex()
                        share_id += 1
                        shares_submitted += 1
                        actual_diff = diff1_target() / max(val, 1)
                        print(f"[FOUND] T{thread_id} nonce={nonce_hex} diff≈{actual_diff:.1f}")
                        send_json({
                            "id": share_id,
                            "method": "mining.submit",
                            "params": [USER, job_id, en2_hex, ntime_hex, nonce_hex]
                        })

            hashes_done += min(batch, 0xFFFFFFFF - nonce_base)


def stats_thread():
    last_hashes = 0
    while True:
        time.sleep(10)
        h = hashes_done
        delta = h - last_hashes
        last_hashes = h
        rate = delta / 10
        elapsed = time.time() - start_time
        total_rate = h / max(elapsed, 1)

        if total_rate > 1e6:
            rs = f"{total_rate/1e6:.2f} MH/s"
        elif total_rate > 1e3:
            rs = f"{total_rate/1e3:.1f} kH/s"
        else:
            rs = f"{total_rate:.0f} H/s"

        print(f"[STATS] {rs} (instant {delta/10/1e3:.1f} kH/s) | ok={shares_accepted} rej={shares_rejected} | {elapsed:.0f}s", flush=True)


def main():
    global sock, start_time

    print(f"=== TBG CPU Miner (fast) ===")
    print(f"Pool: {HOST}:{PORT}  User: {USER}  Threads: {THREADS}")
    print(f"Diff 1 = ~4.3B hashes avg. Python ~300-500 kH/s → expect ~2-4 hours per share.")
    print(f"Press Ctrl+C to stop.\n", flush=True)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((HOST, PORT))
    print("[CONN] Connected", flush=True)

    threading.Thread(target=recv_loop, daemon=True).start()

    send_json({"id": 1, "method": "mining.subscribe", "params": ["TBG-FastMiner/1.0"]})
    time.sleep(1)
    send_json({"id": 2, "method": "mining.authorize", "params": [USER, "x"]})
    time.sleep(1)

    while current_job is None:
        time.sleep(0.1)

    start_time = time.time()
    threading.Thread(target=stats_thread, daemon=True).start()

    for i in range(THREADS):
        threading.Thread(target=mine_thread, args=(i,), daemon=True).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n[DONE] {shares_accepted} accepted, {shares_rejected} rejected, {hashes_done} hashes")


if __name__ == "__main__":
    main()
