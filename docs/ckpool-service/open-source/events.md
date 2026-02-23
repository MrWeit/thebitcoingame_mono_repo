# Event System

The event system is the primary enhancement in TheBitcoinGame Mining Engine. It emits structured JSON events over a Unix domain socket for every significant mining action, enabling external applications to observe and react to mining activity in real time.

## Table of Contents

- [Overview](#overview)
- [Event Envelope](#event-envelope)
- [Event Types](#event-types)
  - [share.submitted](#sharesubmitted)
  - [share.accepted](#shareaccepted)
  - [block.found](#blockfound)
  - [miner.connected](#minerconnected)
  - [miner.disconnected](#minerdisconnected)
  - [difficulty.update](#difficultyupdate)
  - [hashrate.update](#hashrateupdate)
  - [bestdiff.update](#bestdiffupdate)
- [Consuming Events](#consuming-events)
- [Event Reliability](#event-reliability)
- [Building a Custom Consumer](#building-a-custom-consumer)
- [Performance Characteristics](#performance-characteristics)

---

## Overview

The event system hooks into ckpool's stratifier and connector processes, emitting a JSON message for each mining event. Events are delivered via a Unix domain socket using datagram mode (`SOCK_DGRAM`), where each event is a single, self-contained datagram.

Key design properties:

- **Non-blocking**: Event emission never stalls the mining engine. If no consumer is listening or the socket buffer is full, events are silently dropped.
- **Structured**: Every event is valid JSON with a consistent envelope and type-specific payload.
- **Filterable**: Operators can configure which event types are emitted, reducing I/O for deployments that only need a subset.
- **Zero coupling**: The mining engine has no dependency on any specific consumer. It writes to the socket and moves on.

## Event Envelope

Every event shares a common envelope structure:

```json
{
    "event_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "share.submitted",
    "timestamp": "2025-01-15T10:30:00.123Z",
    "pool_instance": "ckpool-prod-01",
    "payload": {
        ...
    }
}
```

| Field | Type | Description |
|---|---|---|
| `event_id` | string (UUIDv4) | Unique identifier for this event. Generated per emission. |
| `type` | string | Event type identifier. One of the 8 defined types. |
| `timestamp` | string (ISO 8601) | When the event was emitted. Includes millisecond precision. UTC timezone. |
| `pool_instance` | string | Identifier for this pool instance. Configured via `pool_instance` in `ckpool.conf`. Useful when running multiple instances. |
| `payload` | object | Type-specific event data. Schema varies by event type. |

---

## Event Types

### share.submitted

Emitted when a miner submits a share, **before** validation. This event fires for every submission, regardless of whether the share is ultimately accepted or rejected.

**Payload:**

```json
{
    "type": "share.submitted",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "job_id": "6a4f",
        "nonce": "1a2b3c4d",
        "nonce2": "0000000000000001",
        "ntime": "65a5b3c1",
        "diff": 128.5,
        "sdiff": 65536.0,
        "ip_address": "192.168.1.100"
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier for this connection |
| `address` | string | Miner's Bitcoin address (stratum username) |
| `worker` | string | Full worker string (address.workername) |
| `job_id` | string | Hexadecimal job identifier from `mining.notify` |
| `nonce` | string | 32-bit nonce submitted by the miner (hex) |
| `nonce2` | string | Extra nonce 2 value (hex) |
| `ntime` | string | nTime value (hex) |
| `diff` | number | Share difficulty achieved |
| `sdiff` | number | Current stratum difficulty target for this miner |
| `ip_address` | string | Miner's IP address |

---

### share.accepted

Emitted when a submitted share passes validation against the current stratum difficulty target.

**Payload:**

```json
{
    "type": "share.accepted",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "diff": 128.5,
        "sdiff": 65536.0,
        "hash": "000000000000000000043a2f3e4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        "is_block": false,
        "shares_accepted": 1547,
        "shares_rejected": 3
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier |
| `address` | string | Miner's Bitcoin address |
| `worker` | string | Full worker string |
| `diff` | number | Share difficulty achieved |
| `sdiff` | number | Stratum difficulty target |
| `hash` | string | Full 256-bit hash of the share (hex, 64 chars) |
| `is_block` | boolean | Whether this share also meets the network difficulty (block found) |
| `shares_accepted` | integer | Cumulative accepted shares for this session |
| `shares_rejected` | integer | Cumulative rejected shares for this session |

---

### block.found

Emitted when a submitted share meets the network difficulty target. This is the most significant event -- it means the miner found a valid Bitcoin block.

**Payload:**

```json
{
    "type": "block.found",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "height": 831456,
        "hash": "0000000000000000000234abc567def890123456789abcdef0123456789abcdef",
        "diff": 7891234567890.123,
        "network_diff": 7234567890123.456,
        "reward_sat": 312500000,
        "reward_btc": 3.125,
        "coinbase_sig": "Mined by TheBitcoinGame/rodrigo",
        "submission_time_ms": 45,
        "confirmed": false
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier |
| `address` | string | Miner's Bitcoin address (will receive the block reward) |
| `worker` | string | Full worker string |
| `height` | integer | Block height |
| `hash` | string | Block hash (hex, 64 chars) |
| `diff` | number | Actual difficulty of the found block |
| `network_diff` | number | Current network difficulty at time of find |
| `reward_sat` | integer | Block reward in satoshis (subsidy + fees) |
| `reward_btc` | number | Block reward in BTC |
| `coinbase_sig` | string | The coinbase signature text included in the block |
| `submission_time_ms` | integer | Time in milliseconds to submit the block to Bitcoin Core |
| `confirmed` | boolean | Whether Bitcoin Core accepted the block (initially false; a follow-up event may update this) |

**Note**: This event fires immediately upon share validation. The `confirmed` field will be `false` at this point. If Bitcoin Core rejects the block (stale, duplicate), no follow-up event is currently emitted. Check the block hash against the chain to confirm.

---

### miner.connected

Emitted when a miner completes the stratum handshake (subscription + authorization).

**Payload:**

```json
{
    "type": "miner.connected",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "ip_address": "192.168.1.100",
        "user_agent": "cgminer/4.12.1",
        "address_type": "bech32",
        "has_custom_sig": true,
        "initial_diff": 65536.0
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier assigned to this connection |
| `address` | string | Miner's Bitcoin address |
| `worker` | string | Full worker string |
| `ip_address` | string | Miner's IP address |
| `user_agent` | string | Mining software user-agent string |
| `address_type` | string | Address type: `"legacy"`, `"p2sh"`, `"bech32"`, or `"bech32m"` (taproot) |
| `has_custom_sig` | boolean | Whether this user has a custom coinbase signature configured |
| `initial_diff` | number | Initial stratum difficulty assigned to this miner |

---

### miner.disconnected

Emitted when a miner disconnects, either cleanly or via timeout.

**Payload:**

```json
{
    "type": "miner.disconnected",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "reason": "timeout",
        "session_duration_sec": 3600,
        "shares_accepted": 1547,
        "shares_rejected": 3,
        "best_diff_session": 524288.0,
        "avg_hashrate_ths": 0.00012
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier |
| `address` | string | Miner's Bitcoin address |
| `worker` | string | Full worker string |
| `reason` | string | Disconnect reason: `"clean"`, `"timeout"`, `"error"`, or `"pool_restart"` |
| `session_duration_sec` | integer | Duration of the mining session in seconds |
| `shares_accepted` | integer | Total accepted shares during this session |
| `shares_rejected` | integer | Total rejected shares during this session |
| `best_diff_session` | number | Best share difficulty achieved during this session |
| `avg_hashrate_ths` | number | Average hashrate over the session in terahashes per second |

---

### difficulty.update

Emitted when the variable difficulty algorithm adjusts a miner's stratum difficulty target.

**Payload:**

```json
{
    "type": "difficulty.update",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "old_diff": 32768.0,
        "new_diff": 65536.0,
        "direction": "up",
        "reason": "shares_too_fast",
        "shares_per_min": 12.5
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier |
| `address` | string | Miner's Bitcoin address |
| `worker` | string | Full worker string |
| `old_diff` | number | Previous stratum difficulty |
| `new_diff` | number | New stratum difficulty |
| `direction` | string | `"up"` or `"down"` |
| `reason` | string | Why the adjustment was made: `"shares_too_fast"`, `"shares_too_slow"`, `"initial_adjust"` |
| `shares_per_min` | number | Current share submission rate that triggered the adjustment |

---

### hashrate.update

Emitted when the rolling hashrate estimate is recalculated for a miner. This typically happens every 60 seconds.

**Payload:**

```json
{
    "type": "hashrate.update",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "hashrate_1m": 125000000000.0,
        "hashrate_5m": 124500000000.0,
        "hashrate_1h": 124800000000.0,
        "hashrate_ths": 0.000125,
        "unit": "H/s"
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier |
| `address` | string | Miner's Bitcoin address |
| `worker` | string | Full worker string |
| `hashrate_1m` | number | 1-minute rolling average hashrate in H/s |
| `hashrate_5m` | number | 5-minute rolling average hashrate in H/s |
| `hashrate_1h` | number | 1-hour rolling average hashrate in H/s |
| `hashrate_ths` | number | 5-minute hashrate in terahashes/second (convenience field) |
| `unit` | string | Always `"H/s"` for the primary fields |

---

### bestdiff.update

Emitted when a miner achieves a new personal best share difficulty within any tracking scope.

**Payload:**

```json
{
    "type": "bestdiff.update",
    "payload": {
        "client_id": 42,
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "worker": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh.rig01",
        "scope": "alltime",
        "new_best": 1048576.0,
        "previous_best": 524288.0,
        "improvement_factor": 2.0,
        "share_hash": "00000000000000000abc123def456789...",
        "all_bests": {
            "session": 1048576.0,
            "weekly": 1048576.0,
            "alltime": 1048576.0
        }
    }
}
```

| Payload Field | Type | Description |
|---|---|---|
| `client_id` | integer | Internal session identifier |
| `address` | string | Miner's Bitcoin address |
| `worker` | string | Full worker string |
| `scope` | string | Which record was broken: `"session"`, `"weekly"`, or `"alltime"` |
| `new_best` | number | The new best difficulty value |
| `previous_best` | number | The previous best difficulty for this scope |
| `improvement_factor` | number | Ratio of new_best / previous_best |
| `share_hash` | string | Full hash of the share that set the new record |
| `all_bests` | object | Current best values across all three scopes |

**Note**: A single share can trigger multiple `bestdiff.update` events if it breaks records in multiple scopes (e.g., a new session best that is also a new weekly best). Events are emitted from narrowest to broadest scope: session, then weekly, then alltime.

---

## Consuming Events

### Socket Setup

The event system uses a Unix domain socket in datagram mode. To consume events, create a `SOCK_DGRAM` socket bound to the configured path.

The mining engine sends datagrams **to** the socket path configured in `events.socket_path`. Your consumer must bind to this path before the mining engine starts emitting events.

### Basic Consumer (Shell)

For quick debugging, you can use `socat` to read events:

```bash
# Remove stale socket if it exists
rm -f /tmp/ckpool-events.sock

# Listen for events
socat UNIX-RECVFROM:/tmp/ckpool-events.sock,fork STDOUT | jq .
```

### Python Consumer

```python
#!/usr/bin/env python3
"""Minimal event consumer for TheBitcoinGame Mining Engine."""

import json
import os
import socket
import sys

SOCKET_PATH = "/tmp/ckpool-events.sock"
BUFFER_SIZE = 65536  # Max datagram size


def main():
    # Clean up stale socket
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    sock.bind(SOCKET_PATH)

    # Set permissions so ckpool can write to it
    os.chmod(SOCKET_PATH, 0o666)

    print(f"Listening for events on {SOCKET_PATH}...")

    try:
        while True:
            data = sock.recv(BUFFER_SIZE)
            event = json.loads(data.decode("utf-8"))

            event_type = event.get("type", "unknown")
            timestamp = event.get("timestamp", "")
            payload = event.get("payload", {})

            print(f"[{timestamp}] {event_type}")

            # Handle specific event types
            if event_type == "block.found":
                address = payload.get("address", "unknown")
                height = payload.get("height", 0)
                reward = payload.get("reward_btc", 0)
                print(f"  *** BLOCK FOUND by {address} at height {height}! ***")
                print(f"  *** Reward: {reward} BTC ***")

            elif event_type == "bestdiff.update":
                address = payload.get("address", "unknown")
                scope = payload.get("scope", "unknown")
                new_best = payload.get("new_best", 0)
                print(f"  New {scope} best for {address}: {new_best:.2f}")

            elif event_type == "miner.connected":
                address = payload.get("address", "unknown")
                agent = payload.get("user_agent", "unknown")
                print(f"  Miner connected: {address} ({agent})")

            elif event_type == "miner.disconnected":
                address = payload.get("address", "unknown")
                duration = payload.get("session_duration_sec", 0)
                print(f"  Miner disconnected: {address} (session: {duration}s)")

    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        sock.close()
        os.unlink(SOCKET_PATH)


if __name__ == "__main__":
    main()
```

### Go Consumer

```go
package main

import (
    "encoding/json"
    "fmt"
    "net"
    "os"
)

const socketPath = "/tmp/ckpool-events.sock"

type Event struct {
    EventID      string          `json:"event_id"`
    Type         string          `json:"type"`
    Timestamp    string          `json:"timestamp"`
    PoolInstance string          `json:"pool_instance"`
    Payload      json.RawMessage `json:"payload"`
}

func main() {
    os.Remove(socketPath)

    addr := net.UnixAddr{Name: socketPath, Net: "unixgram"}
    conn, err := net.ListenUnixgram("unixgram", &addr)
    if err != nil {
        fmt.Fprintf(os.Stderr, "Failed to listen: %v\n", err)
        os.Exit(1)
    }
    defer conn.Close()
    defer os.Remove(socketPath)

    os.Chmod(socketPath, 0666)

    buf := make([]byte, 65536)
    fmt.Printf("Listening for events on %s...\n", socketPath)

    for {
        n, err := conn.Read(buf)
        if err != nil {
            fmt.Fprintf(os.Stderr, "Read error: %v\n", err)
            continue
        }

        var event Event
        if err := json.Unmarshal(buf[:n], &event); err != nil {
            fmt.Fprintf(os.Stderr, "Parse error: %v\n", err)
            continue
        }

        fmt.Printf("[%s] %s\n", event.Timestamp, event.Type)
    }
}
```

## Event Reliability

The event system is designed for **best-effort delivery**. It intentionally trades reliability for performance, ensuring that event emission never impacts the mining engine's core functionality.

### Delivery Guarantees

| Property | Guarantee |
|---|---|
| Ordering | Events are emitted in order within a single process. Cross-process ordering is not guaranteed. |
| Delivery | Best-effort. Events are dropped if the socket buffer is full or no consumer is listening. |
| Duplicates | No duplicates under normal operation. Process restarts may cause duplicate `miner.connected` events. |
| Completeness | All events of enabled types are emitted. None are filtered or sampled. |
| Latency | Sub-millisecond from the triggering action to socket write. Consumer processing time is external. |

### What Happens When No Consumer Is Listening

If no consumer is bound to the event socket:

1. The mining engine attempts `sendto()` on the socket.
2. The call fails immediately with `ECONNREFUSED` or `ENOENT`.
3. The `events_dropped` counter is incremented.
4. The mining engine continues normally.

There is no retry, no queuing, and no backlog. If you need guaranteed delivery, your consumer must be running before the mining engine starts, and you should implement your own persistence layer in the consumer.

### What Happens When the Consumer Is Slow

If the consumer is connected but reading slowly:

1. Events accumulate in the kernel's socket buffer.
2. When the buffer is full, `sendto()` would block.
3. Because we use `MSG_DONTWAIT`, the call returns `EAGAIN` instead of blocking.
4. The event is dropped and the `events_dropped` counter is incremented.
5. The mining engine continues normally.

To handle this, size your consumer's receive buffer appropriately and process events asynchronously.

### Monitoring Drops

The health endpoint (`/health`) reports `events.emitted` and `events.dropped` counters. A non-zero `events_dropped` value indicates your consumer cannot keep up or was not running.

## Building a Custom Consumer

When building a production event consumer, consider:

### Architecture Recommendations

1. **Receive fast, process later**: Read datagrams into a local queue as quickly as possible. Process them asynchronously in a separate thread or process.
2. **Use a ring buffer**: If your processing can tolerate occasional event loss, a fixed-size ring buffer prevents memory growth during traffic spikes.
3. **Persist important events**: `block.found` and `bestdiff.update` events are high-value and low-frequency. Consider writing them to durable storage immediately.
4. **Filter early**: If you only care about specific event types, check the `type` field before doing expensive processing.

### Consumer Startup Sequence

1. Remove any stale socket file at the configured path.
2. Create a `SOCK_DGRAM` Unix domain socket.
3. Bind to the configured socket path.
4. Set socket permissions to allow the ckpool process to write (typically `0666` or match ckpool's group).
5. Start the receive loop.
6. Signal readiness (e.g., write a PID file, log a message).
7. Start the mining engine (or it may already be running -- it will begin delivering events once the socket becomes available).

### Error Handling

- **Malformed JSON**: Log and skip. This should not happen, but defensive parsing is good practice.
- **Unknown event types**: Log and skip. Future versions may add new event types.
- **Missing payload fields**: Treat as optional. Some fields may be absent in edge cases (e.g., `user_agent` for miners that skip the subscription phase).

## Performance Characteristics

Benchmarks on a typical server (4-core, 16GB RAM, NVMe storage):

| Metric | Value |
|---|---|
| Event serialization time | ~5 microseconds per event |
| Socket write time | ~2 microseconds per event (non-blocking) |
| Memory overhead per event | ~1-4 KB (JSON string, freed immediately) |
| Maximum sustained throughput | ~50,000 events/second |
| CPU overhead at 1,000 events/sec | < 0.1% of one core |
| CPU overhead at 10,000 events/sec | < 0.5% of one core |

For a typical solo mining deployment (1-50 miners), the event system produces 10-500 events per minute, which is well within the system's capacity.

### Reducing Overhead

If you need to minimize event system overhead:

1. **Disable unused event types**: Configure `event_types` to only include the types you need.
2. **Disable events entirely**: Set `events.enabled` to `false` in `ckpool.conf`. When compiled with `--disable-events`, the event hooks are compiled out entirely (zero overhead).
3. **Reduce hashrate update frequency**: The `hashrate.update` event is the highest-frequency event. Its interval can be configured via `events.hashrate_interval_sec`.
