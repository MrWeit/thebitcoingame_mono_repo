# TheBitcoinGame Mining Engine

**A ckpool-solo fork for gamified solo Bitcoin mining**

[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)]()

TheBitcoinGame Mining Engine is a fork of [ckpool-solo](https://bitbucket.org/ckolivas/ckpool/) by [Con Kolivas](https://github.com/ckolivas), extended with a real-time event emission system, enhanced difficulty tracking, and other features designed for gamified solo Bitcoin mining experiences.

This fork is fully open-source under the GPLv3 license, the same license as the original ckpool. It contains **no proprietary code** -- every modification is publicly available in this repository.

---

## What Is This?

ckpool is the most widely deployed high-performance Stratum mining pool server for Bitcoin. The `-solo` variant is purpose-built for solo mining, where individual miners attempt to find blocks on their own and receive the full block reward.

TheBitcoinGame Mining Engine extends ckpool-solo with:

- A structured event emission system that streams real-time mining data over Unix domain sockets
- Enhanced difficulty tracking for gamification (session bests, weekly bests, all-time records)
- Custom coinbase signature support per user
- Taproot (bc1p) address support
- A health monitoring endpoint compatible with Prometheus

These additions make it possible for external applications to observe, react to, and gamify the solo mining experience without modifying the core mining logic.

## What's Different from Upstream

| Feature | Upstream ckpool-solo | This Fork |
|---|---|---|
| Event emission (JSON over Unix socket) | No | Yes -- 8 event types |
| Per-user best difficulty tracking | No | Yes -- session, weekly, all-time |
| Custom coinbase signatures | No | Yes -- per-user text in coinbase |
| Taproot (bc1p) address validation | No | Yes |
| Prometheus health endpoint | No | Yes -- `/health` HTTP endpoint |
| Stratum V1 mining protocol | Yes | Yes (unchanged) |
| Multi-process architecture | Yes | Yes (unchanged) |
| Solo mining payout logic | Yes | Yes (unchanged) |

All upstream functionality is preserved. Our modifications are additive and do not alter the core mining, block submission, or payout behavior.

## Quick Start

### Prerequisites

- Linux (Ubuntu 22.04+ or Debian 12+ recommended)
- GCC 9+ or Clang 12+
- autoconf, automake, libtool
- libjansson-dev (JSON parsing)
- Bitcoin Core 25.0+ (fully synced, with RPC enabled)

### Build from Source

```bash
git clone https://github.com/thebitcoingame/mining-engine.git
cd mining-engine
autoreconf -fi
./configure
make -j$(nproc)
```

### Run on Signet (Recommended for Development)

1. Start Bitcoin Core on signet:

```bash
bitcoind -signet -daemon -rpcuser=btcuser -rpcpassword=btcpass
```

2. Create a minimal configuration file (`ckpool.conf`):

```json
{
    "btcd": [
        {
            "url": "localhost:38332",
            "auth": "btcuser",
            "pass": "btcpass"
        }
    ],
    "btcaddress": "tb1qYOUR_SIGNET_ADDRESS",
    "btcsig": "TheBitcoinGame/signet",
    "serverurl": [
        "0.0.0.0:3333"
    ],
    "events": {
        "enabled": true,
        "socket_path": "/tmp/ckpool-events.sock",
        "event_types": ["all"]
    }
}
```

3. Run the mining engine:

```bash
./src/ckpool -c ckpool.conf -s /tmp/ckpool -l debug
```

4. Point a miner at `stratum+tcp://localhost:3333` with your signet address as the username.

For full build and configuration details, see [building.md](building.md) and [configuration.md](configuration.md).

## Configuration

The mining engine is configured via a JSON file (`ckpool.conf`). All original ckpool-solo parameters are supported, plus a new `events` block for the event emission system.

Key configuration sections:

- **`btcd`** -- Bitcoin Core RPC connection(s)
- **`btcaddress`** -- Default payout address
- **`serverurl`** -- Stratum listener bind address(es)
- **`events`** -- Event emission system settings (socket path, event types, buffering)
- **`health`** -- Prometheus health endpoint settings

See [configuration.md](configuration.md) for the complete reference.

## Event System

The event system emits structured JSON messages over a Unix domain socket for every significant mining action:

| Event Type | Description |
|---|---|
| `share.submitted` | A miner submitted a share |
| `share.accepted` | A share was accepted |
| `block.found` | A block was found (the big one) |
| `miner.connected` | A miner connected to the pool |
| `miner.disconnected` | A miner disconnected |
| `difficulty.update` | Difficulty was adjusted for a miner |
| `hashrate.update` | Hashrate estimate updated for a miner |
| `bestdiff.update` | A new personal best difficulty was achieved |

Events are non-blocking and fire-and-forget by default, ensuring the mining engine's performance is never degraded by event consumers.

See [events.md](events.md) for full JSON schemas, consumption examples, and performance characteristics.

## Architecture

The mining engine preserves ckpool's multi-process architecture:

```
ckpool (main)
  +-- generator    (block template generation, bitcoind RPC)
  +-- stratifier   (stratum protocol, share validation, event emission)
  +-- connector    (network I/O, miner connections)
```

Our event system hooks into the stratifier process, which already handles share validation and difficulty tracking. Events are emitted after the core logic completes, with zero impact on the critical path.

See [architecture.md](architecture.md) for detailed technical documentation with diagrams.

## Contributing

We welcome contributions. Whether you're fixing a bug, adding a feature, or improving documentation, please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Key points:

- Fork the repo, create a feature branch, submit a PR
- Follow ckpool's existing C coding style (K&R, tabs)
- All PRs must pass CI and include tests for new functionality
- Significant changes should be discussed in an issue first

## License

This project is licensed under the **GNU General Public License v3.0**, the same license as the original ckpool by Con Kolivas.

See [LICENSE](LICENSE) for the full text.

All modified files carry a license header crediting both the original author and TheBitcoinGame contributors. See [LICENSE-HEADER.md](LICENSE-HEADER.md) for the header template.

## Acknowledgments

This project would not exist without:

- **[Con Kolivas](https://github.com/ckolivas)** -- Author of ckpool, the foundation this fork is built on. His work on high-performance mining infrastructure is exceptional.
- **Bitcoin Core developers** -- For maintaining the Bitcoin node software that makes solo mining possible.
- **Stratum V1 protocol designers** -- For the mining communication protocol that ckpool implements.
- **The solo mining community** -- For keeping decentralized mining alive.

## Links

- **The Bitcoin Game**: [https://thebitcoingame.xyz](https://thebitcoingame.xyz)
- **Upstream ckpool**: [https://bitbucket.org/ckolivas/ckpool/](https://bitbucket.org/ckolivas/ckpool/)
- **Bitcoin Core**: [https://bitcoincore.org](https://bitcoincore.org)
- **Issue Tracker**: [https://github.com/thebitcoingame/mining-engine/issues](https://github.com/thebitcoingame/mining-engine/issues)

---

*Built with respect for the cypherpunk tradition. Not your keys, not your coins. Not your hash, not your block.*
