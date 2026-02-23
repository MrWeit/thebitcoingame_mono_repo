# Changelog

All notable changes to TheBitcoinGame Mining Engine are documented here.

## [0.1.0] - 2026-02-22

### Added
- Event emission system via Unix domain socket (SOCK_DGRAM, non-blocking)
  - `share_submitted` — every valid/invalid share
  - `block_found` — block solve detected
  - `miner_connected` — new stratum connection
  - `miner_disconnected` — connection closed
  - `diff_updated` — VarDiff adjustment
  - `hashrate_update` — periodic hashrate recalculation
  - `new_block_network` — new block on chain
  - `share_best_diff` — new personal best difficulty
- Enhanced difficulty tracking (session, weekly, all-time)
- Custom coinbase signature (`/TheBitcoinGame-dev/`)
- Docker-based build and development environment
- Signet configuration for development
- `source: "hosted"` field in all events (future-proofing for decentralized mining)

### Unchanged
- Core Stratum V1 protocol handling
- Share validation logic
- VarDiff algorithm
- Multi-process architecture (main, generator, stratifier, connector)
- Block submission via Bitcoin Core RPC
