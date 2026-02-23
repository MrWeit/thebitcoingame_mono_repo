# Changelog

All notable changes to TheBitcoinGame Mining Engine are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version numbers reflect changes to this fork, not upstream ckpool. The upstream version this fork is based on is noted in each release.

---

## [Unreleased]

### Added
- Nothing yet.

### Changed
- Nothing yet.

### Fixed
- Nothing yet.

---

## [1.0.0] - 2025-01-15

**Based on upstream ckpool-solo commit `xxxxxx` (v0.9.9)**

Initial release of TheBitcoinGame Mining Engine. All changes below are relative to the upstream ckpool-solo codebase.

### Added

#### Event Emission System
- Implemented structured JSON event emission over Unix domain sockets.
- Added `event_emit()` core function in the stratifier process for non-blocking event dispatch.
- Added Unix domain socket server (SOCK_DGRAM) for event delivery to external consumers.
- Implemented 8 event types:
  - `share.submitted` -- Emitted when a miner submits a share (before validation).
  - `share.accepted` -- Emitted when a submitted share passes validation.
  - `block.found` -- Emitted when a submitted share meets the network difficulty target.
  - `miner.connected` -- Emitted when a new stratum client completes subscription and authorization.
  - `miner.disconnected` -- Emitted when a stratum client disconnects (clean or timeout).
  - `difficulty.update` -- Emitted when the variable difficulty algorithm adjusts a miner's target.
  - `hashrate.update` -- Emitted when the rolling hashrate estimate is recalculated for a miner.
  - `bestdiff.update` -- Emitted when a miner achieves a new personal best difficulty.
- All events include a common envelope: `type`, `timestamp` (ISO 8601 with milliseconds), `event_id` (UUIDv4), and `pool_instance`.
- Added configurable event filtering by type in `ckpool.conf`.
- Added event socket path configuration (`events.socket_path`).
- Added event buffering with configurable high-water mark to prevent memory exhaustion when no consumer is connected.

#### Enhanced Difficulty Tracking
- Added per-user session best difficulty tracking (resets on disconnect).
- Added per-user weekly best difficulty tracking (rolling 7-day window, resets Monday 00:00 UTC).
- Added per-user all-time best difficulty tracking (persisted to disk).
- Best difficulty records are stored in a dedicated file (`bestdiff.db`) alongside the existing user stats.
- The `bestdiff.update` event includes `scope` field indicating which record was broken (`session`, `weekly`, or `alltime`).

#### Custom Coinbase Signatures
- Added per-user coinbase text support via the `btcsig` field in user configuration.
- When a block is found, the coinbase transaction includes the solving user's custom signature text.
- Signature length is validated and truncated to fit within the coinbase scriptSig size limit (100 bytes total including mandatory fields).
- Default signature falls back to the pool-level `btcsig` configuration.

#### Taproot Address Support
- Added validation for Bech32m-encoded Taproot addresses (bc1p prefix on mainnet, tb1p on testnet/signet).
- Taproot addresses are accepted as the mining username (payout address) in stratum authorization.
- Added BIP350 Bech32m checksum verification.

#### Health Monitoring
- Added HTTP health endpoint (`/health`) for Prometheus-compatible monitoring.
- Health response includes: pool uptime, connected miners count, total hashrate, shares per second, last block found timestamp, and event system status.
- Endpoint is configurable via `health.enabled`, `health.port`, and `health.path` in `ckpool.conf`.
- Added Prometheus-format metrics output at `/metrics` (optional).

#### Build and Test Infrastructure
- Added integration test suite using Python (`tests/integration/`).
- Added event system unit tests (`tests/unit/test_events.c`).
- Added simulated mining test harness for signet (`tests/tools/sim_miner.py`).
- Added GitHub Actions CI workflow (`.github/workflows/ci.yml`).
- Added Docker build support (`Dockerfile`, `docker-compose.yml`).
- Added example configuration files for signet, testnet, and mainnet.

### Changed
- Modified `stratifier.c` to call event emission hooks after share validation, difficulty adjustment, and hashrate recalculation.
- Modified `generator.c` to support per-user coinbase signatures during block template construction.
- Modified `ckpool.c` to initialize the event system during startup and tear it down during shutdown.
- Modified `connector.c` to emit miner connection and disconnection events.
- Modified `configure.ac` to add `--enable-events` flag (events are enabled by default; `--disable-events` compiles without event support).
- Modified `Makefile.am` to include new source files and test targets.
- Updated address validation in `stratifier.c` to accept Bech32m (Taproot) addresses alongside legacy, P2SH, and Bech32 (SegWit) addresses.

### Fixed
- Nothing (initial release).

### Security
- Event socket permissions default to `0660` (owner and group only) to prevent unauthorized event consumers.
- Health endpoint binds to `127.0.0.1` by default to prevent external access without explicit configuration.

---

## Upstream Sync Notes

This fork tracks the upstream ckpool-solo repository. When syncing:

1. All upstream commits are merged into the `upstream-sync` branch first.
2. Conflicts are resolved with preference for upstream behavior in core mining logic.
3. Event hooks are re-verified after any merge that touches `stratifier.c`, `generator.c`, or `connector.c`.
4. The full test suite is run before merging into `main`.

The last upstream sync is noted in each release entry above.

---

[Unreleased]: https://github.com/thebitcoingame/mining-engine/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/thebitcoingame/mining-engine/releases/tag/v1.0.0
