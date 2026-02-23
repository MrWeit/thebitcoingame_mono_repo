# Configuration Reference

TheBitcoinGame Mining Engine is configured via a single JSON file, conventionally named `ckpool.conf`. This document covers all configuration parameters, including the original ckpool-solo options and our additions.

## Table of Contents

- [Configuration File Location](#configuration-file-location)
- [Core Parameters (Upstream)](#core-parameters-upstream)
- [Event System Configuration](#event-system-configuration)
- [Health Monitoring Configuration](#health-monitoring-configuration)
- [Best Difficulty Configuration](#best-difficulty-configuration)
- [Example Configurations](#example-configurations)
  - [Development (Signet)](#development-signet)
  - [Staging (Testnet)](#staging-testnet)
  - [Production (Mainnet)](#production-mainnet)
- [Environment-Specific Tips](#environment-specific-tips)
- [Command-Line Flags](#command-line-flags)

---

## Configuration File Location

The configuration file is specified via the `-c` flag:

```bash
./src/ckpool -c /path/to/ckpool.conf
```

If no `-c` flag is provided, ckpool looks for `ckpool.conf` in the current working directory.

The file must be valid JSON. Comments are not supported in the JSON specification, but ckpool's parser tolerates C-style comments (`//` and `/* */`) as an extension.

---

## Core Parameters (Upstream)

These parameters are inherited from upstream ckpool-solo. Refer to the [ckpool documentation](https://bitbucket.org/ckolivas/ckpool/) for detailed upstream documentation.

### `btcd` (array of objects) -- **Required**

Bitcoin Core RPC connection(s). Multiple entries provide failover.

```json
"btcd": [
    {
        "url": "localhost:8332",
        "auth": "rpcuser",
        "pass": "rpcpassword",
        "notify": true
    }
]
```

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | string | -- | Bitcoin Core RPC URL (host:port) |
| `auth` | string | -- | RPC username |
| `pass` | string | -- | RPC password |
| `notify` | boolean | `true` | Whether to use `blocknotify` for new block detection |

### `btcaddress` (string) -- **Required**

Default Bitcoin address for coinbase payout. Used when a miner's address is invalid or not provided.

```json
"btcaddress": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
```

Supported address formats:
- Legacy (1...)
- P2SH (3...)
- Bech32/SegWit (bc1q...)
- **Bech32m/Taproot (bc1p...)** -- our addition

### `btcsig` (string) -- Optional

Default coinbase signature text. Included in the coinbase transaction's scriptSig.

```json
"btcsig": "TheBitcoinGame"
```

Maximum effective length is approximately 80 bytes (after BIP34 block height encoding). Longer strings are truncated.

### `serverurl` (array of strings) -- **Required**

Stratum server bind addresses. Each entry is an `address:port` pair.

```json
"serverurl": [
    "0.0.0.0:3333"
]
```

Multiple entries bind to multiple addresses/ports. Use `0.0.0.0` to listen on all interfaces.

### `mindiff` (number) -- Optional

Minimum stratum difficulty. The variable difficulty algorithm will not set difficulty below this value.

```json
"mindiff": 1
```

**Default**: 1

### `maxdiff` (number) -- Optional

Maximum stratum difficulty. The variable difficulty algorithm will not set difficulty above this value.

```json
"maxdiff": 0
```

**Default**: 0 (no maximum)

### `startdiff` (number) -- Optional

Initial stratum difficulty assigned to new connections. The variable difficulty algorithm will adjust from this starting point.

```json
"startdiff": 42
```

**Default**: 42

### `logdir` (string) -- Optional

Directory for log files. If not set, logs go to the runtime directory specified by `-s`.

```json
"logdir": "/var/log/ckpool"
```

### `nonce1length` (number) -- Optional

Length of the extranonce1 value in bytes (1-8).

```json
"nonce1length": 4
```

**Default**: 4

### `nonce2length` (number) -- Optional

Length of the extranonce2 value in bytes (2-8).

```json
"nonce2length": 8
```

**Default**: 8

### `update_interval` (number) -- Optional

Interval in seconds between work updates sent to miners.

```json
"update_interval": 30
```

**Default**: 30

### `zmqblock` (string) -- Optional

ZeroMQ endpoint for block notifications from Bitcoin Core. More responsive than polling.

```json
"zmqblock": "tcp://127.0.0.1:28332"
```

---

## Event System Configuration

These parameters are **new to this fork** and control the event emission system.

### `events` (object) -- Optional

Top-level configuration block for the event system.

```json
"events": {
    "enabled": true,
    "socket_path": "/tmp/ckpool-events.sock",
    "event_types": ["all"],
    "socket_permissions": "0660",
    "buffer_hwm": 10000,
    "hashrate_interval_sec": 60
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Master switch for the event system. When `false`, no events are emitted and no socket is created. |
| `socket_path` | string | `"/tmp/ckpool-events.sock"` | Path to the Unix domain socket for event delivery. The consumer must bind to this path. |
| `event_types` | array of strings | `["all"]` | Which event types to emit. Use `["all"]` for all types, or specify individual types. |
| `socket_permissions` | string | `"0660"` | Unix file permissions for the event socket (octal string). |
| `buffer_hwm` | integer | `10000` | High-water mark for the internal event buffer. Events beyond this count are dropped if the consumer is not reading. |
| `hashrate_interval_sec` | integer | `60` | How often to emit `hashrate.update` events, in seconds. Set higher to reduce event volume. |

### Supported `event_types` Values

- `"all"` -- Emit all event types (default)
- `"share.submitted"`
- `"share.accepted"`
- `"block.found"`
- `"miner.connected"`
- `"miner.disconnected"`
- `"difficulty.update"`
- `"hashrate.update"`
- `"bestdiff.update"`

Example -- only emit block and best-difficulty events:

```json
"event_types": ["block.found", "bestdiff.update"]
```

### `pool_instance` (string) -- Optional

Identifier included in every event's envelope. Useful for distinguishing events when running multiple pool instances.

```json
"pool_instance": "ckpool-prod-01"
```

**Default**: Hostname of the machine.

---

## Health Monitoring Configuration

### `health` (object) -- Optional

Configuration for the HTTP health monitoring endpoint.

```json
"health": {
    "enabled": true,
    "bind": "127.0.0.1",
    "port": 8080,
    "path": "/health",
    "metrics_path": "/metrics",
    "metrics_enabled": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Whether to start the health HTTP server. |
| `bind` | string | `"127.0.0.1"` | IP address to bind the health server to. Use `"0.0.0.0"` to expose externally (not recommended without a reverse proxy). |
| `port` | integer | `8080` | TCP port for the health server. |
| `path` | string | `"/health"` | HTTP path for the JSON health response. |
| `metrics_path` | string | `"/metrics"` | HTTP path for Prometheus-format metrics. |
| `metrics_enabled` | boolean | `false` | Whether to serve Prometheus metrics at `metrics_path`. |

---

## Best Difficulty Configuration

### `bestdiff` (object) -- Optional

Configuration for the enhanced difficulty tracking system.

```json
"bestdiff": {
    "enabled": true,
    "persist_path": "",
    "weekly_reset_day": "monday",
    "weekly_reset_hour": 0
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Whether to track per-user best difficulties. Disable to save a small amount of memory and CPU. |
| `persist_path` | string | `""` | Path to the bestdiff database file. Empty string uses the default location in the runtime directory (`<runtime>/bestdiff.db`). |
| `weekly_reset_day` | string | `"monday"` | Day of the week when the weekly best resets. Lowercase. |
| `weekly_reset_hour` | integer | `0` | Hour (0-23, UTC) when the weekly best resets on `weekly_reset_day`. |

---

## Example Configurations

### Development (Signet)

Signet is a controlled test network ideal for development. Blocks are produced regularly by a trusted signer, and difficulty is low enough for CPU mining.

```json
{
    "btcd": [
        {
            "url": "localhost:38332",
            "auth": "btcuser",
            "pass": "btcpass"
        }
    ],
    "btcaddress": "tb1qSIGNET_ADDRESS_HERE",
    "btcsig": "TheBitcoinGame/dev",
    "serverurl": [
        "0.0.0.0:3333"
    ],
    "mindiff": 1,
    "startdiff": 1,
    "logdir": "/tmp/ckpool-logs",
    "pool_instance": "dev-signet",
    "events": {
        "enabled": true,
        "socket_path": "/tmp/ckpool-events.sock",
        "event_types": ["all"],
        "socket_permissions": "0666",
        "buffer_hwm": 1000,
        "hashrate_interval_sec": 10
    },
    "health": {
        "enabled": true,
        "bind": "127.0.0.1",
        "port": 8080,
        "metrics_enabled": true
    },
    "bestdiff": {
        "enabled": true,
        "weekly_reset_day": "monday",
        "weekly_reset_hour": 0
    }
}
```

**Notes for signet development:**
- `mindiff` and `startdiff` set to 1 so CPU miners can submit shares quickly.
- `hashrate_interval_sec` set to 10 seconds for faster feedback.
- `socket_permissions` set to `0666` for easier development (don't do this in production).
- Events emit all types for testing.

### Staging (Testnet)

Testnet has real-ish difficulty and is useful for integration testing closer to production conditions.

```json
{
    "btcd": [
        {
            "url": "localhost:18332",
            "auth": "testnet_user",
            "pass": "testnet_pass"
        }
    ],
    "btcaddress": "tb1qTESTNET_ADDRESS_HERE",
    "btcsig": "TheBitcoinGame/staging",
    "serverurl": [
        "0.0.0.0:3333"
    ],
    "mindiff": 64,
    "startdiff": 1024,
    "logdir": "/var/log/ckpool-staging",
    "pool_instance": "staging-testnet",
    "events": {
        "enabled": true,
        "socket_path": "/var/run/ckpool/events.sock",
        "event_types": ["all"],
        "socket_permissions": "0660",
        "buffer_hwm": 5000,
        "hashrate_interval_sec": 30
    },
    "health": {
        "enabled": true,
        "bind": "127.0.0.1",
        "port": 8080,
        "metrics_enabled": true
    },
    "bestdiff": {
        "enabled": true,
        "persist_path": "/var/lib/ckpool-staging/bestdiff.db"
    }
}
```

### Production (Mainnet)

Production configuration for real Bitcoin mining.

```json
{
    "btcd": [
        {
            "url": "localhost:8332",
            "auth": "SECURE_RPC_USER",
            "pass": "SECURE_RPC_PASSWORD",
            "notify": true
        },
        {
            "url": "backup-bitcoind:8332",
            "auth": "SECURE_RPC_USER",
            "pass": "SECURE_RPC_PASSWORD",
            "notify": false
        }
    ],
    "btcaddress": "bc1qPRODUCTION_ADDRESS_HERE",
    "btcsig": "TheBitcoinGame",
    "serverurl": [
        "0.0.0.0:3333"
    ],
    "mindiff": 65536,
    "startdiff": 500000,
    "maxdiff": 0,
    "logdir": "/var/log/ckpool",
    "pool_instance": "prod-mainnet-01",
    "zmqblock": "tcp://127.0.0.1:28332",
    "events": {
        "enabled": true,
        "socket_path": "/var/run/ckpool/events.sock",
        "event_types": [
            "share.accepted",
            "block.found",
            "miner.connected",
            "miner.disconnected",
            "difficulty.update",
            "hashrate.update",
            "bestdiff.update"
        ],
        "socket_permissions": "0660",
        "buffer_hwm": 50000,
        "hashrate_interval_sec": 60
    },
    "health": {
        "enabled": true,
        "bind": "127.0.0.1",
        "port": 8080,
        "metrics_enabled": true
    },
    "bestdiff": {
        "enabled": true,
        "persist_path": "/var/lib/ckpool/bestdiff.db"
    }
}
```

**Notes for production:**
- Two `btcd` entries for failover. Only the primary has `notify: true`.
- `share.submitted` is excluded from `event_types` (it's high-volume and `share.accepted` is sufficient for most use cases).
- `zmqblock` is enabled for faster block notifications.
- Higher `mindiff` and `startdiff` for real ASIC miners.
- `buffer_hwm` is larger to handle bursts during high-traffic periods.
- File permissions are restrictive (`0660`).

---

## Environment-Specific Tips

### Signet

- Bitcoin Core RPC port: **38332**
- Use `-signet` flag when starting `bitcoind`
- Get signet coins from a faucet (search "bitcoin signet faucet")
- Blocks are produced roughly every 10 minutes, controlled by a signer
- Great for development: predictable behavior, low difficulty
- CPU mining works with `startdiff: 1`

### Testnet

- Bitcoin Core RPC port: **18332**
- Use `-testnet` flag when starting `bitcoind`
- Difficulty fluctuates wildly; blocks may come in bursts or stall for hours
- Use for integration testing, not development (too unpredictable)
- Free testnet coins available from faucets

### Mainnet

- Bitcoin Core RPC port: **8332**
- No special flag needed for `bitcoind`
- **Real money at stake** -- triple-check your `btcaddress`
- Use strong RPC credentials (not `btcuser`/`btcpass`)
- Ensure Bitcoin Core is fully synced before starting the mining engine
- Consider running behind a reverse proxy (nginx, HAProxy) for TLS termination
- Monitor the `events.dropped` counter -- if it's growing, your consumer is falling behind
- Back up `bestdiff.db` regularly

### Docker

When running in Docker:

- Mount the configuration file as a volume: `-v /host/ckpool.conf:/etc/ckpool/ckpool.conf`
- Mount the runtime directory: `-v /host/ckpool-run:/var/run/ckpool`
- Mount the event socket directory: `-v /host/ckpool-sockets:/var/run/ckpool`
- Expose the stratum port: `-p 3333:3333`
- Expose the health port: `-p 8080:8080`
- Bitcoin Core should be accessible from the container (use `host.docker.internal` or Docker networking)

---

## Command-Line Flags

These flags are passed directly to the `ckpool` binary and override configuration file values where applicable.

| Flag | Description |
|---|---|
| `-c <file>` | Path to configuration file |
| `-s <dir>` | Runtime directory for PID files, sockets, and lock files |
| `-l <level>` | Log level: `debug`, `info`, `notice`, `warning`, `error` |
| `-n <name>` | Process name prefix (for running multiple instances) |
| `-g <group>` | Drop privileges to this group after startup |
| `-k` | Kill a running ckpool instance (sends SIGTERM) |
| `-r` | Restart a running ckpool instance (sends SIGUSR1) |
| `-H` | Handover: start a new instance and transfer connections from the old one |
| `-S` | Run in solo mode (this is the default for ckpool-solo) |
| `-P` | Run in proxy mode (not used in this fork) |
| `-B` | Run in passthrough proxy mode (not used in this fork) |

Example with common flags:

```bash
./src/ckpool \
    -c /etc/ckpool/ckpool.conf \
    -s /var/run/ckpool \
    -l notice \
    -n tbg
```
