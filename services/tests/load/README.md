# Stratum V1 Load Tester

Asyncio-based Stratum V1 load testing tool for CKPool. Simulates N concurrent
mining clients that follow the full Stratum V1 handshake (subscribe, authorize,
receive jobs, submit shares) to measure pool performance under realistic
conditions.

Part of **The Bitcoin Game -- Phase 5 Production Hardening**.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Test Profiles](#test-profiles)
4. [Custom Configuration](#custom-configuration)
5. [Interpreting Results](#interpreting-results)
6. [Docker Usage](#docker-usage)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Python 3.9+** (3.12 recommended). The load tester uses only the Python
  standard library -- no `pip install` required.
- **Docker** and **Docker Compose** for running the CKPool stack.
- A running CKPool instance accepting Stratum V1 connections (default:
  `localhost:3333`).

### Starting the CKPool Stack

```bash
cd services
docker compose up -d
```

Verify CKPool is accepting connections:

```bash
python3 -c "import socket; s=socket.create_connection(('localhost', 3333), 5); s.close(); print('OK')"
```

---

## Quick Start

### Using the Shell Wrapper (recommended)

```bash
cd services/tests/load

# Quick sanity check -- 10 miners for 30 seconds
./run_load_test.sh --profile smoke

# Standard load test -- 100 miners for 60 seconds
./run_load_test.sh --profile standard

# View results
cat results/loadtest_smoke_*.txt
```

### Using the Python Script Directly

```bash
# Minimal invocation
python3 stratum_load_test.py --miners 10 --duration 30

# Full options
python3 stratum_load_test.py \
  --host localhost \
  --port 3333 \
  --miners 100 \
  --duration 60 \
  --share-rate 10 \
  --ramp-up 10 \
  --btc-address bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls \
  --verbose
```

---

## Test Profiles

The `run_load_test.sh` wrapper provides four predefined profiles:

### smoke -- Quick Sanity Check

```
Miners:     10
Duration:   30 seconds
Share rate: 5 per minute per miner
Ramp-up:    2 seconds
```

Use this to verify CKPool is running and accepting connections. Completes in
under a minute. Good for CI pipelines.

```bash
./run_load_test.sh --profile smoke
```

### standard -- Normal Operational Load

```
Miners:     100
Duration:   60 seconds
Share rate: 10 per minute per miner
Ramp-up:    10 seconds
```

Simulates typical production load. This is the default profile and the primary
benchmark for comparing builds.

```bash
./run_load_test.sh --profile standard
```

### stress -- High Concurrency

```
Miners:     1000
Duration:   120 seconds
Share rate: 20 per minute per miner
Ramp-up:    30 seconds
```

Pushes CKPool to high concurrency to find breaking points. Generates
approximately 333 shares/sec at peak. Requires adequate system resources
(file descriptors, memory).

```bash
./run_load_test.sh --profile stress
```

Before running, increase the file descriptor limit:

```bash
ulimit -n 65536
```

### soak -- Long-Running Stability

```
Miners:     100
Duration:   3600 seconds (1 hour)
Share rate: 10 per minute per miner
Ramp-up:    10 seconds
```

Runs at standard load for one hour to detect memory leaks, file descriptor
leaks, and performance degradation over time.

```bash
./run_load_test.sh --profile soak
```

---

## Custom Configuration

### Shell Wrapper Options

```
--profile PROFILE   Test profile: smoke, standard, stress, soak (default: standard)
--host HOST         Stratum host (default: localhost)
--port PORT         Stratum port (default: 3333)
--btc-address ADDR  BTC address for mining.authorize
--verbose, -v       Enable debug-level logging
```

### Python Script Options

```
--host HOST           Stratum host (default: localhost)
--port PORT           Stratum port (default: 3333)
--miners N            Number of simulated miners (default: 100)
--duration SECONDS    Test duration (default: 60)
--share-rate RATE     Shares per minute per miner (default: 10)
--ramp-up SECONDS     Time to launch all miners (default: 10)
--btc-address ADDR    BTC address for authorization
--verbose, -v         Debug logging
```

### Examples

```bash
# Test a remote pool
./run_load_test.sh --profile standard --host pool.example.com --port 3334

# Custom miner count with verbose output
python3 stratum_load_test.py --miners 500 --duration 90 --share-rate 15 -v

# Low-rate soak test
python3 stratum_load_test.py --miners 50 --duration 7200 --share-rate 2
```

---

## Interpreting Results

The load tester prints interval reports every 10 seconds and a final summary
at the end. Here is what the key metrics mean:

### Connection Metrics

| Metric              | Description                                         | Healthy Range     |
|---------------------|-----------------------------------------------------|-------------------|
| Total miners        | Miners launched during the test                     | Equals `--miners` |
| Peak concurrent     | Maximum simultaneously connected miners             | Close to total    |
| Connection errors   | TCP connection failures                             | 0                 |

### Share Metrics

| Metric          | Description                                             | Healthy Range       |
|-----------------|---------------------------------------------------------|---------------------|
| Submitted       | Total share submissions sent to the pool                | > 0                 |
| Accepted        | Shares the pool accepted as valid work                  | > 0                 |
| Rejected        | Shares rejected (bad nonce, stale job, etc.)            | Expected to be high*|
| Accept rate     | `accepted / submitted * 100`                            | See note below      |
| Throughput      | Shares per second across all miners                     | Matches config      |

*Note on rejection rate:* The load tester submits shares with **random nonces**
that do not meet the actual difficulty target. CKPool will reject most of them.
A high rejection rate is normal and expected. What matters is that shares are
being processed (not timing out) and response times are acceptable. An accept
rate of 0% with reasonable response times is a valid result -- it means CKPool
is validating and responding correctly.

### Response Time

| Metric | Description                                        | Acceptable          |
|--------|----------------------------------------------------|---------------------|
| P50    | Median response time (half of responses are faster) | < 10 ms             |
| P95    | 95th percentile (only 5% are slower)               | < 100 ms            |
| P99    | 99th percentile (only 1% are slower)               | < 250 ms            |
| Max    | Worst-case response time                           | < 1000 ms           |

Response times include network round-trip. For `localhost` tests, values
should be well under 10 ms at P50.

### Error Types

| Error Type        | Description                                          |
|-------------------|------------------------------------------------------|
| Connection errors | TCP connect failed (pool down, port wrong, fd limit) |
| Protocol errors   | Invalid JSON, unexpected response format             |
| Timeout errors    | No response within the timeout window                |

### Exit Codes

| Code | Meaning                                                       |
|------|---------------------------------------------------------------|
| 0    | Test completed successfully                                   |
| 1    | Test completed with warnings (error count > 50% of miners)    |
| 2    | No shares were submitted (total connectivity failure)         |

---

## Docker Usage

### Build the Load Test Image

```bash
docker build -t tbg-load-test -f services/tests/load/Dockerfile services/tests/load/
```

### Run Against Host Network

```bash
# Use --net=host to connect to CKPool on localhost:3333
docker run --rm --net=host tbg-load-test \
  --miners 100 --duration 60 --share-rate 10
```

### Run Against a Remote Pool

```bash
docker run --rm tbg-load-test \
  --host pool.example.com --port 3333 --miners 500 --duration 120
```

### Run with Docker Compose

If `docker-compose.yml` includes a `load-test` service:

```bash
cd services
docker compose run --rm load-test --miners 100 --duration 60
```

### Use the Shell Wrapper in Docker

```bash
docker run --rm --net=host \
  --entrypoint /load-test/run_load_test.sh \
  tbg-load-test --profile stress
```

---

## Troubleshooting

### "Connection refused" or "Cannot reach localhost:3333"

CKPool is not running or not listening on the expected port.

```bash
# Check if CKPool container is running
docker ps | grep ckpool

# Check if the port is open
ss -tlnp | grep 3333

# Start the stack
cd services && docker compose up -d
```

### "Too many open files" during stress test

The system file descriptor limit is too low for 1000+ concurrent connections.

```bash
# Check current limit
ulimit -n

# Increase for the current session
ulimit -n 65536

# Permanent (add to /etc/security/limits.conf):
# * soft nofile 65536
# * hard nofile 65536
```

### All shares rejected (0% accept rate)

This is **expected behavior**. The load tester submits random nonces that will
not meet the difficulty target. CKPool correctly rejects them. The purpose of
the test is to measure connection handling and response times, not to produce
valid proof-of-work.

### High response times (P95 > 500ms)

Possible causes:

1. **System overloaded:** Check CPU and memory usage of the CKPool container.
2. **Network latency:** Test against `localhost` to isolate network effects.
3. **File descriptor exhaustion:** Check `ulimit -n` and
   `/proc/sys/fs/file-max`.
4. **CKPool internal contention:** Profile CKPool CPU with `profile_cpu.sh`
   (see `services/ckpool/docs/performance.md`).

### Test hangs or never completes

The load tester has a generous timeout (duration + ramp-up + 30 seconds). If
it still hangs:

1. Press `Ctrl+C` for graceful shutdown (sends SIGINT to stop all miners).
2. Check if CKPool crashed:
   ```bash
   docker logs ckpool-container --tail 50
   ```
3. Run with `--verbose` to see per-miner debug output.

### No output from interval reports

The test may still be in the ramp-up phase (interval reports start after the
first 10-second tick). Use `--verbose` to see individual miner activity during
ramp-up.

---

## File Structure

```
services/tests/load/
  stratum_load_test.py   # Core load tester (asyncio, stdlib only)
  run_load_test.sh       # Shell wrapper with predefined profiles
  Dockerfile             # Containerized load tester
  requirements.txt       # Dependencies (stdlib only, optional analysis tools)
  results/               # Test output directory (gitignored except .gitkeep)
    .gitkeep
```
