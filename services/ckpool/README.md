# TheBitcoinGame Mining Engine

**A ckpool-solo fork for gamified solo Bitcoin mining**

This is a fork of [ckpool-solo](https://bitbucket.org/ckolivas/ckpool/) by [Con Kolivas](https://github.com/ckolivas), extended with a real-time event emission system, enhanced difficulty tracking, and features designed for gamified solo Bitcoin mining.

This fork is fully open-source under the GPLv3 license, the same license as the original ckpool.

## What's Different from Upstream

| Feature | Upstream ckpool-solo | This Fork |
|---|---|---|
| Event emission (JSON over Unix socket) | No | Yes — 8 event types |
| Per-user best difficulty tracking | No | Yes — session, weekly, all-time |
| Custom coinbase signatures | Partial | Yes — configurable pool tag |
| Stratum V1 mining protocol | Yes | Yes (unchanged) |
| Multi-process architecture | Yes | Yes (unchanged) |
| Solo mining payout logic | Yes | Yes (unchanged) |

## Quick Start (Docker)

```bash
cd services/
docker compose up --build
```

This starts:
- Bitcoin Core on signet (test network)
- CKPool mining engine
- Redis for event streams
- TimescaleDB for persistence
- Event Collector (Python)

## Testing with cpuminer

```bash
docker run --rm --network=services_default \
  ghcr.io/cpuminer-multi/cpuminer-multi:latest \
  -a sha256d -t 1 \
  --url=stratum+tcp://ckpool:3333 \
  --userpass=tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx:x
```

## License

GPLv3 — see [LICENSE](LICENSE)

## Acknowledgments

- **Con Kolivas** — Author of ckpool, the foundation this fork is built on
- **Bitcoin Core developers** — For the node software that makes solo mining possible
