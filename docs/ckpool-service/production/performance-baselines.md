# Performance Baselines - CKPool Production Hardening

Phase 5 of The Bitcoin Game CKPool service. This document defines target
performance metrics, profiling procedures, and guidance for interpreting results.

---

## Target Metrics

These baselines represent minimum production requirements. Actual deployments
should exceed these targets with margin.

| Metric                        | Target             | Measurement Method          |
|-------------------------------|--------------------|-----------------------------|
| Share processing latency P50  | < 1ms              | Stratum load test           |
| Share processing latency P95  | < 3ms              | Stratum load test           |
| Share processing latency P99  | < 5ms              | Stratum load test           |
| New connection handling       | < 100ms            | Stratum load test (ramp-up) |
| Memory at idle (10 miners)    | < 30MB RSS         | profile_memory.sh --attach  |
| Memory at load (1k miners)    | < 100MB RSS        | profile_memory.sh --attach  |
| Memory at scale (100k miners) | < 300MB RSS        | Projected from 1k baseline  |
| CPU at 1k shares/sec          | < 20% single core  | perf stat / profile_cpu.sh  |
| CPU at 10k shares/sec         | < 50% single core  | perf stat / profile_cpu.sh  |
| Event emission to ring buffer | < 1ms              | Instrumented timing         |
| NATS publish latency          | < 5ms per event    | NATS sidecar metrics        |
| Startup time (cold)           | < 5s               | Docker container start      |
| Graceful shutdown             | < 10s              | SIGTERM to exit              |

### Memory Budget Breakdown (per component at 1k miners)

| Component              | Budget  | Notes                                  |
|------------------------|---------|----------------------------------------|
| Connection tracking    | 40MB    | ~40KB per active connection            |
| Stratum parser         | 10MB    | JSON parse buffers, shared across pool |
| Work template cache    | 5MB     | Current + 2 previous templates         |
| Share log ring buffer  | 8MB     | Fixed-size, wraps on overflow          |
| TBG event queue        | 4MB     | Unix DGRAM socket buffer               |
| VarDiff state          | 8MB     | EMA history per miner                  |
| Coinbase sig cache     | 5MB     | Redis-backed, in-process LRU           |
| Metrics / Prometheus   | 2MB     | Counters and histograms                |
| Overhead (libc, stack) | 18MB    | Thread stacks, allocator metadata      |
| **Total**              | **100MB** |                                      |

---

## Running Load Tests

### Prerequisites

- Docker and Docker Compose (for containerized tests)
- Python 3.9+ (for local execution)
- A running CKPool instance on the target host

### Quick Start

```bash
# From repository root
cd services/tests/load

# Smoke test (10 miners, 30s)
./run_load_test.sh --profile smoke

# Standard load test (100 miners, 60s)
./run_load_test.sh --profile standard

# Stress test (1000 miners, 120s)
./run_load_test.sh --profile stress

# Soak test (100 miners, 1 hour)
./run_load_test.sh --profile soak
```

### Direct Python Execution

```bash
python3 stratum_load_test.py \
    --host localhost \
    --port 3333 \
    --miners 500 \
    --duration 300 \
    --share-rate 15 \
    --ramp-up 20
```

### Docker Execution

```bash
# Build the load test image
docker build -t tbg-load-test -f services/tests/load/Dockerfile services/tests/load/

# Run against host network (localhost pool)
docker run --rm --net=host tbg-load-test --miners 100 --duration 60

# Run against a remote pool
docker run --rm tbg-load-test --host pool.example.com --port 3333 --miners 500

# Run with the shell wrapper for profiles
docker run --rm --net=host \
    --entrypoint /load-test/run_load_test.sh \
    tbg-load-test --profile stress
```

### Test Profiles

| Profile  | Miners | Duration | Share Rate  | Ramp-up | Purpose                          |
|----------|--------|----------|-------------|---------|----------------------------------|
| smoke    | 10     | 30s      | 5/min       | 2s      | Connectivity and basic function  |
| standard | 100    | 60s      | 10/min      | 10s     | Normal operation baseline        |
| stress   | 1000   | 120s     | 20/min      | 30s     | High concurrency limits          |
| soak     | 100    | 3600s    | 10/min      | 10s     | Memory leaks, stability          |

### Interpreting Load Test Results

The final report includes:

- **Accept rate**: Should be > 0% (rejected shares are expected with random nonces,
  but 0 accepted may indicate protocol issues). Under real mining, target > 99%.
- **P99 response time**: The primary latency SLA metric. Values above 5ms under the
  stress profile indicate bottlenecks.
- **Peak concurrent connections**: Should match the miner count. If significantly
  lower, the pool is dropping connections.
- **Error breakdown**: Connection errors suggest TCP backlog exhaustion. Timeout
  errors suggest processing bottlenecks. Protocol errors suggest parser issues.

---

## CPU Profiling

### Running a CPU Profile

```bash
# Inside the Docker profile container
./scripts/profile_cpu.sh --duration 60

# With custom frequency
./scripts/profile_cpu.sh --duration 30 --frequency 999

# Profile a specific PID
./scripts/profile_cpu.sh --pid $(pgrep ckpool) --duration 120
```

### Using the Profile Docker Image

```bash
# Build the profile image
docker build -t ckpool-profile -f services/ckpool/Dockerfile.profile services/ckpool/

# Run with profiling capabilities
docker run --rm \
    --cap-add SYS_ADMIN \
    --cap-add SYS_PTRACE \
    --security-opt seccomp=unconfined \
    -v $(pwd)/profiles:/profiles \
    ckpool-profile
```

### Interpreting FlameGraphs

The generated `flamegraph.svg` is an interactive SVG. Open it in any browser.

**Key things to look for:**

1. **Wide bars at the top**: These are the hottest functions consuming the most CPU.
   In CKPool, expect to see:
   - `stratifier.c` functions (share validation, template generation)
   - `connector.c` functions (socket I/O)
   - JSON parsing (`jansson` library calls)

2. **Deep stacks**: Long call chains may indicate unnecessary abstraction layers.

3. **Unexpected hot paths**: If functions outside the critical path (logging,
   metrics emission) appear wide, they are candidates for optimization.

4. **Lock contention**: Look for `pthread_mutex_lock` or `futex` calls taking
   significant CPU time. These indicate contention.

**Expected CPU distribution (healthy pool at 1k miners):**

| Function area          | Expected % | Concern threshold |
|------------------------|------------|-------------------|
| Share validation       | 30-40%     | > 60%             |
| Network I/O            | 20-30%     | > 50%             |
| JSON parse/serialize   | 10-15%     | > 25%             |
| Template generation    | 5-10%      | > 20%             |
| TBG event emission     | 1-3%       | > 10%             |
| Logging                | 1-2%       | > 5%              |
| Other                  | 10-20%     | -                 |

---

## Memory Profiling

### Running a Memory Profile

#### Massif Mode (detailed heap analysis)

```bash
# Launch ckpool under Valgrind Massif
./scripts/profile_memory.sh --duration 60

# With custom ckpool binary
./scripts/profile_memory.sh --ckpool /opt/ckpool/bin/ckpool --config /etc/ckpool.conf
```

#### Attach Mode (live process monitoring)

```bash
# Monitor a running ckpool process
./scripts/profile_memory.sh --attach --duration 300

# Monitor a specific PID
./scripts/profile_memory.sh --attach --pid 1234 --duration 120
```

### Interpreting Memory Profiles

**Massif output (`massif_report.txt`)** shows a timeline of heap usage with
allocation stacks at peak points. Key things to look for:

1. **Monotonically increasing memory**: Indicates a memory leak. Track down the
   allocation site from the peak snapshot's call tree.

2. **Saw-tooth pattern**: Normal. Memory grows during batch operations and shrinks
   during cleanup cycles.

3. **Sudden spikes**: May indicate allocation amplification (e.g., allocating
   per-connection buffers that are never freed on disconnect).

**Attach mode output (`memory_samples.csv`)** provides time-series RSS/PSS data.
Plot with:

```bash
# Quick terminal plot
column -t -s, results/mem_*/memory_samples.csv | head -20

# Or use any CSV visualization tool
```

### Memory Leak Detection Procedure

1. Run a soak test: `./run_load_test.sh --profile soak`
2. Simultaneously run memory monitoring: `./profile_memory.sh --attach --duration 3600`
3. Check if RSS at T=3600s is significantly higher than RSS at T=60s
4. If growth exceeds 20%, run Massif mode during a shorter load test to identify
   the leaking allocation site

---

## Benchmarking Checklist

Before each release, run through this checklist:

- [ ] **Smoke test passes**: `./run_load_test.sh --profile smoke` with 0 connection errors
- [ ] **Standard test meets latency SLAs**: P99 < 5ms with 100 miners
- [ ] **Stress test holds**: 1000 miners connect, < 1% connection failures
- [ ] **No memory leaks**: RSS growth < 10% over 1-hour soak test
- [ ] **CPU profile reviewed**: No unexpected hotspots, event emission < 3% CPU
- [ ] **FlameGraph archived**: Saved to results directory for regression comparison
- [ ] **Event pipeline verified**: All share/block events reach the collector

---

## Results Storage

Load test results are saved to `services/tests/load/results/` with timestamped
filenames:

```
results/
  loadtest_smoke_20260223_143000.txt
  loadtest_standard_20260223_143500.txt
  loadtest_stress_20260223_144000.txt
```

CPU and memory profiles are saved to `/profiles/` inside the Docker container.
Copy them out with:

```bash
docker cp <container>:/profiles/cpu_20260223_143000/ ./profiles/
docker cp <container>:/profiles/mem_20260223_143000/ ./profiles/
```

The `results/` directory is git-tracked (via `.gitkeep`) but individual result
files should be added to `.gitignore` to avoid bloating the repository. Archive
baseline results separately for regression comparison.
