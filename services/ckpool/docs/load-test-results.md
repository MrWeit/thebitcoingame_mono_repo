# CKPool Load Test Results

Part of **The Bitcoin Game -- Phase 5 Production Hardening**.

This is a **results template**. Run the load test and fill in the placeholder
values (`___`) with actual measurements.

---

## Test Environment

| Parameter          | Value                                                 |
|--------------------|-------------------------------------------------------|
| Date               | ___                                                   |
| CKPool version     | TBG-patched @ `88e99e0`                               |
| Host OS            | ___                                                   |
| CPU                | ___                                                   |
| RAM                | ___ GB                                                |
| Docker version     | ___                                                   |
| Network            | ___ (e.g., `--net=host`, bridge, overlay)              |
| Bitcoin node        | ___ (e.g., Bitcoin Core 27.x, regtest/signet/mainnet) |
| Load test tool     | `stratum_load_test.py` (Python 3.12, asyncio)         |

---

## Test Configuration

### Profiles Used

| Profile    | Miners | Duration | Share Rate   | Ramp-Up | Purpose                     |
|------------|--------|----------|--------------|---------|-----------------------------|
| smoke      | 10     | 30s      | 5/min/miner  | 2s      | Quick sanity check          |
| standard   | 100    | 60s      | 10/min/miner | 10s     | Normal operational load     |
| stress     | 1000   | 120s     | 20/min/miner | 30s     | High concurrency limits     |
| soak       | 100    | 3600s    | 10/min/miner | 10s     | Long-running stability      |

### CKPool Configuration

| Setting             | Value       |
|---------------------|-------------|
| Stratum port        | 3333        |
| Vardiff min         | ___         |
| Vardiff max         | ___         |
| Log level           | ___         |
| Event ring size     | 4096        |
| BTC address         | `bc1q8p0cpy5q4fefkc8tptt6wr77z6luztrgjf7cls` |

---

## Smoke Test Results (10 miners, 30s)

### Connection Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total connections       | ___       |
| Successful connects     | ___       |
| Failed connects         | ___       |
| Avg connect time        | ___ ms    |
| Peak concurrent miners  | ___       |

### Share Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total submitted         | ___       |
| Accepted                | ___       |
| Rejected                | ___       |
| Stale rate              | ___ %     |
| Accept rate             | ___ %     |
| Throughput              | ___ shares/sec |

### Response Time (ms)

| Percentile | Value     |
|------------|-----------|
| Min        | ___       |
| P50        | ___       |
| P95        | ___       |
| P99        | ___       |
| Max        | ___       |

### Resource Usage

| Metric                  | Value     |
|-------------------------|-----------|
| CKPool CPU (avg %)      | ___       |
| CKPool CPU (peak %)     | ___       |
| CKPool RSS (avg MB)     | ___       |
| CKPool RSS (peak MB)    | ___       |
| File descriptors (peak) | ___       |
| Network sent (KB)       | ___       |
| Network received (KB)   | ___       |

### Event Pipeline

| Metric                    | Value     |
|---------------------------|-----------|
| Events emitted            | ___       |
| Events persisted          | ___       |
| Events dropped            | ___       |
| End-to-end latency P50    | ___ ms    |
| End-to-end latency P95    | ___ ms    |
| End-to-end latency P99    | ___ ms    |

### Errors

| Error Type              | Count     |
|-------------------------|-----------|
| Connection errors       | ___       |
| Protocol errors         | ___       |
| Timeout errors          | ___       |

---

## Standard Test Results (100 miners, 60s)

### Connection Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total connections       | ___       |
| Successful connects     | ___       |
| Failed connects         | ___       |
| Avg connect time        | ___ ms    |
| Peak concurrent miners  | ___       |

### Share Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total submitted         | ___       |
| Accepted                | ___       |
| Rejected                | ___       |
| Stale rate              | ___ %     |
| Accept rate             | ___ %     |
| Throughput              | ___ shares/sec |

### Response Time (ms)

| Percentile | Value     |
|------------|-----------|
| Min        | ___       |
| P50        | ___       |
| P95        | ___       |
| P99        | ___       |
| Max        | ___       |

### Resource Usage

| Metric                  | Value     |
|-------------------------|-----------|
| CKPool CPU (avg %)      | ___       |
| CKPool CPU (peak %)     | ___       |
| CKPool RSS (avg MB)     | ___       |
| CKPool RSS (peak MB)    | ___       |
| File descriptors (peak) | ___       |
| Network sent (KB)       | ___       |
| Network received (KB)   | ___       |

### Event Pipeline

| Metric                    | Value     |
|---------------------------|-----------|
| Events emitted            | ___       |
| Events persisted          | ___       |
| Events dropped            | ___       |
| End-to-end latency P50    | ___ ms    |
| End-to-end latency P95    | ___ ms    |
| End-to-end latency P99    | ___ ms    |

### Errors

| Error Type              | Count     |
|-------------------------|-----------|
| Connection errors       | ___       |
| Protocol errors         | ___       |
| Timeout errors          | ___       |

---

## Stress Test Results (1000 miners, 120s)

### Connection Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total connections       | ___       |
| Successful connects     | ___       |
| Failed connects         | ___       |
| Avg connect time        | ___ ms    |
| Peak concurrent miners  | ___       |

### Share Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total submitted         | ___       |
| Accepted                | ___       |
| Rejected                | ___       |
| Stale rate              | ___ %     |
| Accept rate             | ___ %     |
| Throughput              | ___ shares/sec |

### Response Time (ms)

| Percentile | Value     |
|------------|-----------|
| Min        | ___       |
| P50        | ___       |
| P95        | ___       |
| P99        | ___       |
| Max        | ___       |

### Resource Usage

| Metric                  | Value     |
|-------------------------|-----------|
| CKPool CPU (avg %)      | ___       |
| CKPool CPU (peak %)     | ___       |
| CKPool RSS (avg MB)     | ___       |
| CKPool RSS (peak MB)    | ___       |
| File descriptors (peak) | ___       |
| Network sent (KB)       | ___       |
| Network received (KB)   | ___       |

### Event Pipeline

| Metric                    | Value     |
|---------------------------|-----------|
| Events emitted            | ___       |
| Events persisted          | ___       |
| Events dropped            | ___       |
| End-to-end latency P50    | ___ ms    |
| End-to-end latency P95    | ___ ms    |
| End-to-end latency P99    | ___ ms    |

### Errors

| Error Type              | Count     |
|-------------------------|-----------|
| Connection errors       | ___       |
| Protocol errors         | ___       |
| Timeout errors          | ___       |

---

## Soak Test Results (100 miners, 3600s)

### Connection Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total connections       | ___       |
| Successful connects     | ___       |
| Failed connects         | ___       |
| Avg connect time        | ___ ms    |
| Peak concurrent miners  | ___       |

### Share Metrics

| Metric                  | Value     |
|-------------------------|-----------|
| Total submitted         | ___       |
| Accepted                | ___       |
| Rejected                | ___       |
| Stale rate              | ___ %     |
| Accept rate             | ___ %     |
| Throughput              | ___ shares/sec |

### Response Time (ms)

| Percentile | Value     |
|------------|-----------|
| Min        | ___       |
| P50        | ___       |
| P95        | ___       |
| P99        | ___       |
| Max        | ___       |

### Resource Usage (sampled every 60s)

| Metric                  | t=0       | t=15min   | t=30min   | t=45min   | t=60min   |
|-------------------------|-----------|-----------|-----------|-----------|-----------|
| CKPool CPU (%)          | ___       | ___       | ___       | ___       | ___       |
| CKPool RSS (MB)         | ___       | ___       | ___       | ___       | ___       |
| File descriptors        | ___       | ___       | ___       | ___       | ___       |

### Memory Stability

| Metric                      | Value     |
|-----------------------------|-----------|
| RSS at start                | ___ MB    |
| RSS at end                  | ___ MB    |
| RSS delta                   | ___ MB    |
| Memory leak suspected?      | ___       |
| Pool alloc total            | ___       |
| Pool free total             | ___       |
| Pool in-use at end          | ___       |

### Event Pipeline

| Metric                    | Value     |
|---------------------------|-----------|
| Events emitted            | ___       |
| Events persisted          | ___       |
| Events dropped            | ___       |
| End-to-end latency P50    | ___ ms    |
| End-to-end latency P95    | ___ ms    |
| End-to-end latency P99    | ___ ms    |

### Errors

| Error Type              | Count     |
|-------------------------|-----------|
| Connection errors       | ___       |
| Protocol errors         | ___       |
| Timeout errors          | ___       |

---

## Summary Comparison

| Metric                   | Smoke (10m/30s) | Standard (100m/60s) | Stress (1000m/120s) | Soak (100m/3600s) |
|--------------------------|-----------------|---------------------|---------------------|--------------------|
| Peak concurrent miners   | ___             | ___                 | ___                 | ___                |
| Total shares submitted   | ___             | ___                 | ___                 | ___                |
| Accept rate (%)          | ___             | ___                 | ___                 | ___                |
| Throughput (shares/sec)  | ___             | ___                 | ___                 | ___                |
| Response time P50 (ms)   | ___             | ___                 | ___                 | ___                |
| Response time P95 (ms)   | ___             | ___                 | ___                 | ___                |
| Response time P99 (ms)   | ___             | ___                 | ___                 | ___                |
| CPU avg (%)              | ___             | ___                 | ___                 | ___                |
| RSS peak (MB)            | ___             | ___                 | ___                 | ___                |
| Events dropped           | ___             | ___                 | ___                 | ___                |
| Total errors             | ___             | ___                 | ___                 | ___                |

---

## Acceptance Criteria

The following thresholds define a passing load test for production readiness:

| Metric                      | Smoke     | Standard  | Stress    | Soak      |
|-----------------------------|-----------|-----------|-----------|-----------|
| Connect success rate        | 100%      | >= 99%    | >= 95%    | >= 99%    |
| Share accept rate           | >= 90%    | >= 90%    | >= 80%    | >= 90%    |
| Response time P95           | < 50 ms   | < 100 ms  | < 500 ms  | < 100 ms  |
| Response time P99           | < 100 ms  | < 250 ms  | < 1000 ms | < 250 ms  |
| CPU avg                     | < 10%     | < 30%     | < 80%     | < 30%     |
| RSS peak                    | < 50 MB   | < 150 MB  | < 500 MB  | < 200 MB  |
| Events dropped              | 0         | 0         | < 100     | 0         |
| Memory growth (soak delta)  | N/A       | N/A       | N/A       | < 20 MB   |

---

## Notes

_Record any observations, anomalies, or follow-up items here._

- ___
- ___
- ___
