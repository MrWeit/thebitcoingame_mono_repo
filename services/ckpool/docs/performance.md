# CKPool Performance Analysis & Optimizations

Part of **The Bitcoin Game -- Phase 5 Production Hardening**.

This document covers expected CPU hotspots in the TBG-patched CKPool,
optimizations applied during Phase 5, and the recommended workflow for
profiling production or staging deployments.

---

## Table of Contents

1. [Hot Path Analysis](#hot-path-analysis)
2. [SHA256 Hardware Acceleration](#sha256-hardware-acceleration)
3. [Event Ring Buffer](#event-ring-buffer)
4. [Memory Pool Allocator](#memory-pool-allocator)
5. [Compiler Hardening Flags](#compiler-hardening-flags)
6. [Expected CPU Hotspots](#expected-cpu-hotspots)
7. [Profiling Workflow](#profiling-workflow)

---

## Hot Path Analysis

The critical path for every incoming share follows this sequence:

```
TCP recv -> JSON parse -> Extranonce check -> SHA256 double-hash
  -> Difficulty check -> Event emission -> TCP response
```

**stratifier.c `submit_share()`** is the single most CPU-intensive function in
the entire CKPool codebase. Every share submitted by every connected miner
passes through this path. At scale (10k+ miners, each submitting ~10
shares/min), this amounts to 1,600+ share validations per second, each
requiring at minimum:

- One JSON parse (jansson `json_loads`)
- One or two SHA256 double-hashes (80-byte block header)
- One difficulty target comparison
- One JSON-serialized event emission to the TBG event pipeline

The share validation SHA256 double-hash dominates CPU time in a properly tuned
deployment. Everything else -- JSON parsing, socket I/O, event serialization --
contributes but is secondary.

### Share Validation Breakdown

| Step                    | Typical Cost     | Notes                                |
|-------------------------|------------------|--------------------------------------|
| JSON parse (jansson)    | ~2-5 us          | Depends on message size              |
| Extranonce validation   | <1 us            | Simple memcmp                        |
| SHA256 double-hash      | ~0.5-1.5 us      | With hardware acceleration           |
| SHA256 double-hash      | ~5-15 us         | Software-only fallback               |
| Difficulty comparison   | <0.5 us          | 256-bit integer compare              |
| Event emission          | <1 us            | Lock-free ring buffer push           |
| Response serialization  | ~1-2 us          | JSON result + socket write           |

**Total per share (HW accel): ~5-10 us**
**Total per share (SW only): ~10-25 us**

---

## SHA256 Hardware Acceleration

CKPool uses the SHA256 implementation provided by its internal `libckpool`
library. Modern CPUs provide dedicated instructions that accelerate SHA256 by
5-10x compared to software implementations.

### Supported Instruction Sets

| Architecture | Extension         | Detection Method                          |
|--------------|-------------------|-------------------------------------------|
| x86_64       | SHA-NI (SHA-256)  | `cpuid` leaf 7, bit 29 of EBX             |
| ARM64        | Crypto Extensions | `getauxval(AT_HWCAP)` with `HWCAP_SHA2`   |

### Startup Check

At startup, CKPool logs the availability of hardware SHA256:

```
[NOTICE] SHA256 hardware acceleration: available (SHA-NI)
```

or:

```
[NOTICE] SHA256 hardware acceleration: not available (software fallback)
```

### Verifying in Docker

Inside a running CKPool container, check for hardware support:

```bash
# x86_64 -- check for SHA-NI
grep -o 'sha_ni' /proc/cpuinfo | head -1

# ARM64 -- check for Crypto Extensions
grep -o 'sha2' /proc/cpuinfo | head -1
```

Most modern cloud instances (AWS c5/c6i/c7g, GCP n2/t2a) support hardware
SHA256. If profiling reveals SHA256 as the dominant hotspot on a machine
*without* hardware acceleration, moving to an instance type with SHA-NI or
Crypto Extensions is the single highest-impact optimization available.

---

## Event Ring Buffer

**File:** `src/event_ring.c` / `src/event_ring.h`

### Problem

The original TBG event emission used a per-event `sendto()` on the Unix
datagram socket. Each share validation triggered one syscall, adding ~2-5 us of
kernel overhead to the hot path. Under stress (1,000+ shares/sec), this
created measurable contention on the socket and kernel scheduler.

### Solution

Replaced per-event `sendto()` with a lock-free SPMC ring buffer:

```
Hot path (producer):
  tbg_event_ring_push()
    -> Atomic CAS on write_pos
    -> memcpy JSON into slot
    -> Atomic store SLOT_READY
    -> Zero syscalls

Background thread (consumer):
  tbg_event_ring_flusher()
    -> Scan for SLOT_READY slots
    -> Build iovec array (up to EVENT_BATCH_MAX = 64)
    -> Single writev() syscall
    -> Mark slots SLOT_EMPTY
```

### Key Parameters

| Parameter                 | Value   | Purpose                              |
|---------------------------|---------|--------------------------------------|
| `EVENT_RING_SIZE`         | 4096    | Total slots (must be power of 2)     |
| `EVENT_MAX_SIZE`          | 4096    | Max bytes per serialized event       |
| `EVENT_BATCH_MAX`         | 64      | Max events per `writev()` call       |
| `EVENT_FLUSH_INTERVAL_US` | 100     | Flusher poll interval (0.1 ms)       |

### Performance Impact

- **Hot path latency:** Reduced from ~3-5 us (sendto) to <1 us (atomic push)
- **Syscall reduction:** Up to 64x fewer kernel transitions (64 events per writev)
- **Throughput:** Sustains 100k+ events/sec without backpressure
- **Drop behavior:** If the ring is full, events are dropped and the
  `events_dropped` counter increments. This is intentional -- dropping a
  gamification event is always preferable to blocking share validation.

### Monitoring

Ring buffer statistics are exposed via the Prometheus metrics endpoint:

```
tbg_event_ring_queued    -- Total events pushed to ring
tbg_event_ring_sent      -- Total events flushed to socket
tbg_event_ring_dropped   -- Total events dropped (ring full)
tbg_event_ring_batches   -- Total writev() calls made
```

If `events_dropped > 0`, either the consumer is too slow (check socket
consumer CPU) or event volume exceeds expectations. Consider increasing
`EVENT_RING_SIZE` if drops are consistent under normal load.

---

## Memory Pool Allocator

**File:** `src/memory_pool.c` / `src/memory_pool.h`

### Problem

Under high connection counts (10k+ miners), CKPool performs frequent small
allocations for share structs and event buffers. Standard `malloc()` incurs
~100-500 ns per call on glibc, with additional fragmentation overhead over
time.

### Solution

Slab-based pool allocator providing O(1) allocation and deallocation without
syscalls on the hot path:

```
Allocation:
  tbg_pool_alloc()
    -> Pop from intrusive free list (pthread_mutex)
    -> If empty: grow pool (aligned_alloc new slab)
    -> Return cache-line aligned pointer

Deallocation:
  tbg_pool_free()
    -> Push to intrusive free list head
    -> O(1), always succeeds
```

### Key Parameters

| Parameter               | Value     | Purpose                              |
|-------------------------|-----------|--------------------------------------|
| `POOL_CACHE_LINE_SIZE`  | 64        | Alignment boundary (avoids false sharing) |
| `POOL_INITIAL_SLABS`    | 256       | Items pre-allocated at init          |
| `POOL_MAX_ITEMS`        | 1,000,000 | Growth limit per pool                |

### Pools in Use

| Pool Name        | Item Size    | Purpose                              |
|------------------|-------------|--------------------------------------|
| `share_pool`     | ~256 bytes  | Share validation structs             |
| `event_pool`     | ~4096 bytes | Event serialization buffers          |

### Performance Impact

- **Allocation cost:** Reduced from ~200 ns (malloc) to ~30 ns (free list pop)
- **Memory footprint:** Target <300 MB at 100k connections (down from ~600 MB
  with naive malloc, due to reduced fragmentation)
- **Cache behavior:** Cache-line alignment prevents false sharing between
  adjacent pool items accessed by different threads

---

## Compiler Hardening Flags

**Patch:** `patches/14-compiler-hardening.sh`

Phase 5 adds the following compiler and linker flags to every CKPool build.
These flags impose a small but measurable performance cost (typically <2% on
share validation throughput) in exchange for significant security hardening.

### Compiler Flags (CFLAGS)

| Flag                        | Purpose                                      | Cost    |
|-----------------------------|----------------------------------------------|---------|
| `-fstack-protector-strong`  | Stack canary on functions with local buffers  | ~0.5%   |
| `-D_FORTIFY_SOURCE=2`       | Compile-time + runtime buffer overflow checks | ~0.5%   |
| `-fPIE`                     | Position-independent code for ASLR            | ~0.5%   |
| `-Wformat -Wformat-security`| Warn on format string vulnerabilities         | 0% (compile-time only) |

### Linker Flags (LDFLAGS)

| Flag                   | Purpose                                        |
|------------------------|-------------------------------------------------|
| `-Wl,-z,relro`         | Read-only relocations (partial RELRO)           |
| `-Wl,-z,now`           | Immediate binding (full RELRO, prevents GOT overwrites) |
| `-Wl,-z,noexecstack`   | Non-executable stack (prevents stack-based code execution) |
| `-pie`                 | Link as position-independent executable for ASLR |

### Profiling Build

The `Dockerfile.profile` image uses `-O2 -g -fno-omit-frame-pointer` instead
of full hardening flags. Frame pointers are essential for `perf` stack
unwinding. Do not use the hardened production build for profiling -- the
missing frame pointers will produce incomplete flamegraphs.

---

## Expected CPU Hotspots

When profiling a production CKPool under typical mining load, expect the
following distribution in the flamegraph:

### Top Functions by CPU Time

| Rank | Function / Region             | Expected CPU % | Notes                    |
|------|-------------------------------|-----------------|--------------------------|
| 1    | SHA256 double-hash            | 25-40%          | Share validation core    |
| 2    | JSON parsing (jansson)        | 15-25%          | `json_loads` / `json_dumps` |
| 3    | Socket I/O (read/write/writev)| 10-20%          | Kernel time in epoll     |
| 4    | String operations (memcpy, sprintf) | 5-10%    | Event serialization      |
| 5    | Lock contention (pthread)     | 3-8%            | Stats updates, pool alloc|
| 6    | Memory allocation             | 2-5%            | Pool fallback to malloc  |
| 7    | TBG event pipeline            | 2-5%            | Ring push + flusher      |
|      | Everything else               | 5-15%           | Networking, logging, etc.|

### Warning Signs

If profiling reveals a distribution that diverges significantly from the above:

- **SHA256 > 50%:** Hardware acceleration may be missing. Check `cpuinfo`.
- **JSON > 30%:** Possible excessively large messages or high reject rate
  causing extra error serialization. Check `share_reject_rate` metric.
- **Socket I/O > 30%:** Likely too many small writes. Verify the event ring
  buffer is active (check `batch_count` metric -- should be non-zero).
- **Lock contention > 15%:** Pool or stats mutex under high contention.
  Consider per-thread stats accumulation.
- **malloc > 10%:** Memory pool may not be initialized or is exhausting its
  free list. Check `tbg_pool_total_free` metric.

---

## Profiling Workflow

### Prerequisites

- Docker installed
- The `Dockerfile.profile` image built:
  ```bash
  cd services/ckpool
  docker build -f Dockerfile.profile -t tbg-ckpool:profile .
  ```

### Step 1: CPU Profiling

Use `profile_cpu.sh` to generate a flamegraph:

```bash
# Run ckpool in the profiling container
docker run -d --name ckpool-prof --privileged \
  -v $(pwd)/profiles:/profiles \
  tbg-ckpool:profile

# Generate load (from a separate terminal)
cd services/tests/load
./run_load_test.sh --profile standard --host localhost --port 3333

# Profile CPU for 30 seconds
docker exec ckpool-prof /opt/ckpool/scripts/profile_cpu.sh --duration 30

# Extract the flamegraph
docker cp ckpool-prof:/profiles/cpu_*/flamegraph.svg ./flamegraph.svg
```

**Output files:**

| File               | Description                                      |
|--------------------|--------------------------------------------------|
| `perf.data`        | Raw perf recording (can be re-analyzed later)    |
| `perf_stat.txt`    | Hardware counter summary (IPC, cache misses)     |
| `perf_report.txt`  | Top functions by CPU sample count                |
| `collapsed.txt`    | Collapsed stack traces (FlameGraph intermediate) |
| `flamegraph.svg`   | Interactive SVG flamegraph (open in browser)     |

### Step 2: Memory Profiling

Use `profile_memory.sh` in one of two modes:

**Launch mode** (starts ckpool under Valgrind Massif):

```bash
docker exec ckpool-prof /opt/ckpool/scripts/profile_memory.sh \
  --duration 60 \
  --config /etc/ckpool/ckpool-mainnet.conf
```

**Attach mode** (monitors a running ckpool via /proc):

```bash
docker exec ckpool-prof /opt/ckpool/scripts/profile_memory.sh \
  --attach --duration 120
```

**Output files:**

| File                   | Description                                     |
|------------------------|-------------------------------------------------|
| `massif.out`           | Raw Massif data (launch mode only)              |
| `massif_report.txt`    | Human-readable allocation timeline              |
| `peak_summary.txt`     | Peak memory usage summary                       |
| `memory_samples.csv`   | RSS/PSS time series (attach mode only)          |
| `smaps_snapshot.txt`    | Full /proc/PID/smaps at end of sampling          |

### Step 3: Analyze

1. Open `flamegraph.svg` in a browser. Click to zoom into hot stacks.
2. Search for `sha256` -- this should be the tallest tower.
3. Search for `json_loads` -- second major contributor.
4. If `sendto` appears prominently, the event ring buffer may not be active.
5. Check `massif_report.txt` for the heap growth timeline. Peak heap should
   stay under 300 MB for a 100-miner load test.

### Step 4: Regression Testing

After making performance changes, re-run the same load test profile and
compare:

```bash
# Before
./run_load_test.sh --profile standard 2>&1 | tee results/before.txt

# After
./run_load_test.sh --profile standard 2>&1 | tee results/after.txt

# Compare key metrics (P95 response time, shares/sec throughput)
diff <(grep -E "P95|Throughput" results/before.txt) \
     <(grep -E "P95|Throughput" results/after.txt)
```

---

## References

- [CKPool source (Bitbucket)](https://bitbucket.org/ckolivas/ckpool)
- [Brendan Gregg's FlameGraph](https://github.com/brendangregg/FlameGraph)
- [Valgrind Massif manual](https://valgrind.org/docs/manual/ms-manual.html)
- [Intel SHA Extensions](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sha-extensions.html)
- [ARM Cryptography Extensions](https://developer.arm.com/documentation/ddi0500/j/CJHDEBAF)
