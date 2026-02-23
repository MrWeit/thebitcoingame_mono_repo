# Building from Source

This document covers how to compile TheBitcoinGame Mining Engine from source, run it on various Bitcoin networks, and build Docker images.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Steps](#build-steps)
- [Build Options](#build-options)
- [Running](#running)
  - [Signet (Development)](#signet-development)
  - [Testnet (Staging)](#testnet-staging)
  - [Mainnet (Production)](#mainnet-production)
- [Docker Build](#docker-build)
- [Cross-Compilation](#cross-compilation)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Operating System

TheBitcoinGame Mining Engine is developed and tested on Linux. It should work on any POSIX-compliant system with the required dependencies.

| OS | Status |
|---|---|
| Ubuntu 22.04 LTS | Fully tested, recommended |
| Ubuntu 24.04 LTS | Fully tested |
| Debian 12 (Bookworm) | Fully tested |
| Debian 11 (Bullseye) | Works, but GCC version may need upgrade |
| CentOS Stream 9 | Tested |
| Rocky Linux 9 | Tested |
| Arch Linux | Works (rolling release, YMMV) |
| macOS | Not supported (epoll dependency) |
| FreeBSD | Not tested, may work with modifications |

### Required Packages

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install -y \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    libjansson-dev \
    git
```

**CentOS/Rocky/RHEL:**

```bash
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y \
    autoconf \
    automake \
    libtool \
    pkgconfig \
    jansson-devel \
    git
```

**Arch Linux:**

```bash
sudo pacman -S base-devel autoconf automake libtool pkgconf jansson git
```

### Dependency Details

| Dependency | Minimum Version | Purpose |
|---|---|---|
| GCC | 9.0 | C compiler (C11 support required) |
| Clang | 12.0 | Alternative C compiler |
| autoconf | 2.69 | Build system generation |
| automake | 1.16 | Makefile generation |
| libtool | 2.4 | Shared library support |
| libjansson | 2.13 | JSON parsing and generation |
| pkg-config | 0.29 | Build dependency resolution |

### Bitcoin Core

You need a running Bitcoin Core node for the mining engine to communicate with. The node must be fully synced on whichever network you intend to use.

- **Version**: 25.0 or later (26.0+ recommended)
- **Download**: [https://bitcoincore.org/en/download/](https://bitcoincore.org/en/download/)

Bitcoin Core must be configured with RPC enabled. Add to your `bitcoin.conf`:

```ini
# For mainnet (default port 8332)
server=1
rpcuser=your_rpc_user
rpcpassword=your_rpc_password
rpcallowip=127.0.0.1

# For signet (port 38332)
[signet]
server=1
rpcuser=your_rpc_user
rpcpassword=your_rpc_password

# Optional: ZMQ for faster block notifications
zmqpubhashblock=tcp://127.0.0.1:28332
```

---

## Build Steps

### 1. Clone the Repository

```bash
git clone https://github.com/thebitcoingame/mining-engine.git
cd mining-engine
```

### 2. Generate the Build System

```bash
autoreconf -fi
```

This generates the `configure` script and `Makefile.in` templates from `configure.ac` and `Makefile.am`.

### 3. Configure

```bash
./configure
```

Configure checks for required dependencies and generates the final Makefiles.

### 4. Compile

```bash
make -j$(nproc)
```

The `-j$(nproc)` flag enables parallel compilation using all available CPU cores.

### 5. Verify

```bash
./src/ckpool --help
```

This should print the usage information. If it does, the build succeeded.

### 6. Install (Optional)

```bash
sudo make install
```

This installs the `ckpool` binary to `/usr/local/bin/`. You can change the prefix with `./configure --prefix=/your/path`.

---

## Build Options

The `./configure` script accepts the following options relevant to this fork:

### `--enable-debug`

Enables debug symbols (`-g`), disables optimization (`-O0`), and enables additional runtime assertions.

```bash
./configure --enable-debug
```

Use this for development and debugging. Do not use in production (significant performance impact).

### `--disable-events`

Compiles the mining engine without the event emission system. All event hooks are replaced with no-ops at compile time, resulting in zero runtime overhead.

```bash
./configure --disable-events
```

Use this if you want a pure ckpool-solo without any event functionality.

### `--disable-health`

Compiles without the health monitoring HTTP endpoint.

```bash
./configure --disable-health
```

### `--prefix=<path>`

Installation prefix for `make install`.

```bash
./configure --prefix=/opt/ckpool
```

### `--with-jansson=<path>`

Specify a custom path for the jansson library (if not installed system-wide).

```bash
./configure --with-jansson=/opt/jansson
```

### Combining Options

```bash
./configure --enable-debug --prefix=/opt/ckpool-dev
```

---

## Running

### Signet (Development)

Signet is the recommended network for development. It has predictable block times and low difficulty, making it easy to test share submission and event emission with CPU mining.

#### 1. Start Bitcoin Core on Signet

```bash
bitcoind -signet -daemon \
    -rpcuser=btcuser \
    -rpcpassword=btcpass \
    -rpcport=38332
```

Wait for sync (signet syncs quickly, usually under 30 minutes for a fresh node):

```bash
bitcoin-cli -signet -rpcuser=btcuser -rpcpassword=btcpass getblockchaininfo
```

#### 2. Get a Signet Address

```bash
bitcoin-cli -signet -rpcuser=btcuser -rpcpassword=btcpass getnewaddress "" bech32
```

#### 3. Create Configuration

Save as `ckpool-signet.conf`:

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
    "btcsig": "dev/signet",
    "serverurl": ["0.0.0.0:3333"],
    "mindiff": 1,
    "startdiff": 1,
    "events": {
        "enabled": true,
        "socket_path": "/tmp/ckpool-events.sock",
        "event_types": ["all"]
    },
    "health": {
        "enabled": true,
        "port": 8080
    }
}
```

#### 4. Create Runtime Directory

```bash
mkdir -p /tmp/ckpool-signet
```

#### 5. Start the Mining Engine

```bash
./src/ckpool -c ckpool-signet.conf -s /tmp/ckpool-signet -l debug
```

#### 6. Test with a CPU Miner

Using `cpuminer` (minerd):

```bash
minerd -o stratum+tcp://localhost:3333 -u tb1qYOUR_SIGNET_ADDRESS -p x
```

Or using `cgminer`:

```bash
cgminer -o stratum+tcp://localhost:3333 -u tb1qYOUR_SIGNET_ADDRESS -p x
```

You should see shares being submitted in the ckpool debug log and events appearing on the Unix socket.

### Testnet (Staging)

#### 1. Start Bitcoin Core on Testnet

```bash
bitcoind -testnet -daemon \
    -rpcuser=testuser \
    -rpcpassword=testpass \
    -rpcport=18332
```

#### 2. Configuration

Use `configuration.md` staging example. Key differences from signet:

- RPC port: `18332`
- Higher `mindiff` and `startdiff` (testnet has higher difficulty)
- May need an ASIC or GPU miner to find shares at reasonable difficulty

### Mainnet (Production)

#### 1. Prerequisites

- Fully synced Bitcoin Core node on mainnet
- Strong RPC credentials (generate with `openssl rand -hex 32`)
- Verified Bitcoin address for block rewards
- Adequate server resources (see below)

#### 2. Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 8 GB |
| Storage | 1 GB (ckpool only) | 10 GB (with logs) |
| Network | 100 Mbps | 1 Gbps |

Bitcoin Core has its own resource requirements (500+ GB storage for a full node).

#### 3. Production Deployment

```bash
# Create a dedicated user
sudo useradd -r -s /bin/false ckpool
sudo mkdir -p /var/run/ckpool /var/log/ckpool /var/lib/ckpool
sudo chown ckpool:ckpool /var/run/ckpool /var/log/ckpool /var/lib/ckpool

# Install the binary
sudo make install

# Place configuration
sudo cp ckpool-mainnet.conf /etc/ckpool/ckpool.conf
sudo chown ckpool:ckpool /etc/ckpool/ckpool.conf
sudo chmod 640 /etc/ckpool/ckpool.conf

# Start with systemd (see below)
sudo systemctl enable ckpool
sudo systemctl start ckpool
```

#### 4. Systemd Service File

Save as `/etc/systemd/system/ckpool.service`:

```ini
[Unit]
Description=TheBitcoinGame Mining Engine
After=bitcoind.service network.target
Wants=bitcoind.service

[Service]
Type=forking
User=ckpool
Group=ckpool
ExecStart=/usr/local/bin/ckpool -c /etc/ckpool/ckpool.conf -s /var/run/ckpool -l notice
ExecStop=/usr/local/bin/ckpool -c /etc/ckpool/ckpool.conf -s /var/run/ckpool -k
PIDFile=/var/run/ckpool/main.pid
Restart=on-failure
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ckpool
sudo systemctl start ckpool
```

---

## Docker Build

### Dockerfile

The repository includes a `Dockerfile` for containerized builds:

```dockerfile
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y \
    build-essential autoconf automake libtool \
    pkg-config libjansson-dev git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY . .

RUN autoreconf -fi \
    && ./configure \
    && make -j$(nproc)

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    libjansson4 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/src/ckpool /usr/local/bin/ckpool

RUN useradd -r -s /bin/false ckpool \
    && mkdir -p /var/run/ckpool /var/log/ckpool /etc/ckpool \
    && chown ckpool:ckpool /var/run/ckpool /var/log/ckpool

USER ckpool

EXPOSE 3333 8080

ENTRYPOINT ["ckpool"]
CMD ["-c", "/etc/ckpool/ckpool.conf", "-s", "/var/run/ckpool"]
```

### Build the Image

```bash
docker build -t thebitcoingame/mining-engine:latest .
```

### Run with Docker

```bash
docker run -d \
    --name ckpool \
    -v /path/to/ckpool.conf:/etc/ckpool/ckpool.conf:ro \
    -v /path/to/run:/var/run/ckpool \
    -p 3333:3333 \
    -p 8080:8080 \
    thebitcoingame/mining-engine:latest
```

### Docker Compose

```yaml
version: "3.8"

services:
  mining-engine:
    build: .
    image: thebitcoingame/mining-engine:latest
    container_name: ckpool
    ports:
      - "3333:3333"
      - "8080:8080"
    volumes:
      - ./ckpool.conf:/etc/ckpool/ckpool.conf:ro
      - ckpool-run:/var/run/ckpool
      - ckpool-logs:/var/log/ckpool
    restart: unless-stopped
    depends_on:
      - bitcoind

  bitcoind:
    image: lncm/bitcoind:v27.0
    container_name: bitcoind
    ports:
      - "8332:8332"
    volumes:
      - bitcoin-data:/root/.bitcoin
      - ./bitcoin.conf:/root/.bitcoin/bitcoin.conf:ro
    restart: unless-stopped

volumes:
  ckpool-run:
  ckpool-logs:
  bitcoin-data:
```

```bash
docker compose up -d
```

---

## Cross-Compilation

### ARM64 (e.g., Raspberry Pi 4, AWS Graviton)

On an x86_64 build host:

```bash
sudo apt install gcc-aarch64-linux-gnu

autoreconf -fi
./configure --host=aarch64-linux-gnu CC=aarch64-linux-gnu-gcc
make -j$(nproc)
```

The resulting binary in `src/ckpool` is an ARM64 ELF binary. Copy it to your target system along with the ARM64 version of `libjansson`.

### Static Build

For a portable binary with no shared library dependencies:

```bash
autoreconf -fi
./configure LDFLAGS="-static"
make -j$(nproc)
```

Note: Static builds may produce larger binaries and cannot use dynamically loaded libraries.

---

## Troubleshooting

### `autoreconf: command not found`

Install autoconf:

```bash
sudo apt install autoconf automake libtool
```

### `configure: error: jansson library not found`

Install libjansson:

```bash
# Ubuntu/Debian
sudo apt install libjansson-dev

# CentOS/RHEL
sudo dnf install jansson-devel
```

### `fatal error: jansson.h: No such file or directory`

The jansson development headers are not installed. Install `libjansson-dev` (Debian) or `jansson-devel` (RHEL).

### `ckpool: error while loading shared libraries: libjansson.so.4`

The runtime library is not in the linker path. Either:

```bash
# Install the runtime library
sudo apt install libjansson4

# Or update the linker cache
sudo ldconfig
```

### `make: *** [Makefile:XXX: ckpool.o] Error 1` with GCC Errors

Your GCC version may be too old. Check with:

```bash
gcc --version
```

If below 9.0, install a newer version:

```bash
sudo apt install gcc-12
./configure CC=gcc-12
```

### `bind() failed: Address already in use` on Startup

A previous ckpool instance may still be running, or a stale socket file exists:

```bash
# Check for running instances
pgrep -a ckpool

# Kill if running
./src/ckpool -c ckpool.conf -s /tmp/ckpool -k

# Or remove stale socket files
rm -f /tmp/ckpool/main.sock
```

### `Failed to connect to bitcoind`

Verify Bitcoin Core is running and RPC is accessible:

```bash
bitcoin-cli -rpcuser=btcuser -rpcpassword=btcpass getblockchaininfo
```

Common issues:
- Bitcoin Core is still syncing (check `"verificationprogress"` in output)
- Wrong RPC port (8332 for mainnet, 18332 for testnet, 38332 for signet)
- Firewall blocking localhost connections
- RPC credentials mismatch
