# Prompt: CKPool Service — Phase 6 (Stratum V2 Integration)

You are continuing the build of the mining engine service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phases 1-5 are complete: the ckpool-solo fork has a production-hardened event system, multi-region deployment, full monitoring, and is stable on mainnet. Phase 6 adds **Stratum V2 (SV2)** support — encrypted connections, reduced bandwidth, and miner-selected transactions.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. The mining engine service lives at `services/ckpool/` and the event collector at `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **macOS development machine** — ckpool is Linux-only (epoll, Unix-specific syscalls). ALL ckpool building and running MUST happen inside Docker containers. Do NOT attempt to build ckpool natively on macOS.
2. **SRI (Stratum Reference Implementation) is Rust** — Build it inside Docker. The SRI project lives at `https://github.com/stratum-mining/stratum`. All Rust compilation happens in Docker build stages.
3. **Don't break SV1 support** — Dual-stack is required. Most miners still use Stratum V1 on port 3333. SV2 runs on port 3334. Both must work simultaneously at all times.
4. **GPLv3 compliance** — All C code modifications to ckpool MUST remain GPLv3. Rust FFI code that links into ckpool is also GPLv3. The event collector (Python) is a separate process — it is NOT GPL.
5. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
6. **Phases 1-5 must remain stable** — All existing tests, event schemas, monitoring, and multi-region infrastructure must continue to work. Zero regressions.
7. **All new events include `source` and `protocol` fields** — Every event emitted from SV2 code paths must include `"protocol": "stratum_v2"` alongside the existing `"source": "hosted"` field.

---

## Before You Start — Read These Files (in order)

1. `docs/ckpool-service/00-master-plan.md` — Architecture overview, communication flows, event system design.
2. `docs/ckpool-service/roadmap/phase-06-stratum-v2.md` — Full Phase 6 specification with architecture diagrams, code examples, FFI designs, testing matrix, and deliverable checklists. **This is your primary reference for Phase 6.**
3. `docs/ckpool-service/open-source/events.md` — Existing event system documentation with JSON schemas. You will extend these schemas.
4. `docs/ckpool-service/open-source/architecture.md` — Technical architecture of the fork (connector, stratifier, generator processes).
5. `docs/ckpool-service/open-source/configuration.md` — Configuration reference. You will add SV2 configuration options.
6. `docs/ckpool-service/roadmap/phase-01-core-fork.md` — Phase 1 implementation for context on how events and hooks were originally built.
7. `docs/ckpool-service/roadmap/phase-05-production-hardening.md` — Phase 5 implementation for context on current production state.

Read ALL of these before writing any code. They contain the exact specifications for what to build.

---

## What You Are Building

Phase 6 is divided into three sub-phases, each deliverable independently. Complete them in order — each builds on the previous.

### Phase 6A — SV2 Translation Proxy (Month 1)

#### Overview

The fastest path to SV2 support. Deploy the SRI Translation Proxy alongside ckpool. The proxy accepts Stratum V2 connections from SV2-capable miners, translates SV2 to SV1, and communicates with our existing ckpool instance. **Zero changes to ckpool C code required.**

#### Architecture

```
SV2 Miners  ──(encrypted, binary)──▶  SRI Translation Proxy (:3334)
                                            │
                                            ▼  (translates SV2 → SV1)
                                       CKPool (:3333, unchanged)
                                            │
SV1 Miners  ──(plaintext, JSON)────────────▶│
                                            ▼
                                       Stratifier (share validation)
```

#### What to Build

1. **Docker service: `sv2-proxy`**
   - New Dockerfile at `services/sv2-proxy/Dockerfile`
   - Multi-stage Rust build: clone SRI repo, build the `translator` role (`roles/translator`)
   - Runtime image: minimal (debian-slim or alpine with required libs)
   - The proxy binary listens on :3334 (SV2) and connects upstream to ckpool on :3333 (SV1)

2. **SRI Translation Proxy Configuration**
   - Config file at `services/sv2-proxy/config/translator-config.toml`
   - Upstream: connect to ckpool at `ckpool:3333` (Docker internal network)
   - Downstream: listen on `0.0.0.0:3334` for SV2 miners
   - Noise Protocol keys: generate keypair at build time or first-run, store in volume
   - Pool signature: `TheBitcoinGame`

3. **Docker Compose additions**
   - Add `sv2-proxy` service to `services/docker-compose.yml`
   - Depends on: `ckpool` (must be healthy first)
   - Expose port 3334 to host
   - Shared volume for Noise protocol keys
   - Health check: TCP check on :3334

4. **Event pipeline integration**
   - The translation proxy itself does not emit events — ckpool emits events as usual when it receives translated SV1 messages
   - However, we need to distinguish SV2 miners from SV1 miners. Add a sidecar script or proxy log parser (`services/sv2-proxy/src/connection_tracker.py`) that:
     - Monitors the translation proxy logs
     - Emits `miner_connected` events with `"protocol": "stratum_v2"` to the event pipeline
     - Tracks SV2 connection metadata (encryption status, bandwidth savings)
   - Update the event collector (`services/event-collector/`) to accept the new `protocol` field in event schemas

5. **DNS configuration documentation**
   - Document the intended DNS setup:
     - `mine.thebitcoingame.com` → :3333 (SV1, unchanged)
     - `sv2.mine.thebitcoingame.com` → :3334 (SV2 via translation proxy)

6. **Monitoring additions**
   - Prometheus metrics endpoint on the SV2 proxy (or via exporter sidecar)
   - Metrics: `sv2_connections_total`, `sv2_connections_active`, `sv2_bytes_in`, `sv2_bytes_out`, `sv2_translation_errors`
   - Grafana dashboard panel for SV2 connections alongside existing SV1 panels

#### Testing (Phase A)

- **SV2-A-01:** SV2 miner connects via proxy → shares are counted in ckpool. Use SRI test miner (`mining-device` from the SRI repo).
- **SV2-A-02:** SV1 miners are completely unaffected — normal operation on :3333. Run existing SV1 test suite.
- **SV2-A-03:** All SV2 traffic is encrypted — verify with packet capture (tcpdump/Wireshark). No plaintext Stratum JSON on :3334.
- **SV2-A-04:** Bandwidth measurement — >50% reduction vs SV1 for the same hashrate. Byte counter comparison.
- **SV2-A-05:** Proxy crash recovery — kill the proxy, verify it auto-restarts (Docker restart policy) and miners reconnect.
- **SV2-A-06:** MitM attempt on SV2 connection — connection must be rejected (Noise protocol authentication).
- **SV2-A-07:** Mixed SV1 + SV2 load — both protocols work simultaneously under load.

---

### Phase 6B — Native SV2 Pool Support (Month 2)

#### Overview

Integrate the SV2 protocol directly into ckpool via Rust FFI bindings to the SV2 roles library. This eliminates the translation proxy, reduces latency, and enables full SV2 features including header-only mining.

#### Architecture

```
SV2 Miners  ──(encrypted, binary)──▶  CKPool (:3334, native SV2)
                                            │
                                            ▼  SV2 Roles Library (Rust FFI)
                                       Connector process
                                            │
SV1 Miners  ──(plaintext, JSON)────────────▶│
                                            ▼
                                       Stratifier (share validation — same code path)
```

#### What to Build

1. **Rust FFI bridge: `services/ckpool/sv2-ffi/`**
   - Create a Rust library crate at `services/ckpool/sv2-ffi/`
   - `Cargo.toml` with dependencies on the SV2 roles library crates (`roles-logic-sv2`, `mining-sv2`, `noise-sv2`, etc.)
   - `src/lib.rs` with `#[no_mangle] extern "C"` functions:
     - `sv2_pool_init(listen_port, authority_pub_key, authority_sec_key) -> *mut Sv2PoolHandle` — Initialize SV2 pool state with Noise protocol keys
     - `sv2_accept_connection(handle, client_fd) -> c_int` — Perform Noise handshake on new SV2 connection
     - `sv2_process_message(handle, client_fd, buf, len, out_msg) -> c_int` — Decrypt, decode, and translate SV2 message to internal C struct
     - `sv2_send_new_mining_job(handle, client_fd, job) -> c_int` — Encrypt and send new mining job to SV2 miner
     - `sv2_pool_destroy(handle)` — Clean shutdown and resource deallocation
   - C header file `sv2_ffi.h` (auto-generated via `cbindgen` or manually maintained)
   - C structs: `Sv2Message` (msg_type, user, worker, job_id, nonce, ntime, version, share_diff) and `Sv2MiningJob` (job_id, prev_hash, coinbase, merkle_branches, version, nbits, ntime, clean_jobs)
   - Build produces a static library: `libsv2_ffi.a`

2. **CKPool connector.c modifications**
   - Include `sv2_ffi.h`
   - In `setup_listeners()`: if SV2 is enabled in config, call `sv2_pool_init()` and set up a listener on :3334
   - In the epoll event loop: detect SV2 connections (by port), use `sv2_accept_connection()` for handshake
   - In message processing: if `client->protocol == PROTOCOL_SV2`, call `sv2_process_message()` to decode, then pass the decoded share to the same stratifier code path as SV1
   - Add `PROTOCOL_SV1` and `PROTOCOL_SV2` enum values to the client struct
   - When sending new work to SV2 clients, call `sv2_send_new_mining_job()` instead of JSON-RPC `mining.notify`

3. **Event emission with protocol field**
   - Update `emit_event()` calls in stratifier.c to include `"protocol": "stratum_v1"` or `"protocol": "stratum_v2"` based on the client's protocol type
   - The `miner_connected` event must include the protocol field
   - The `share_submitted` event must include the protocol field
   - All existing events continue to work unchanged for SV1 miners

4. **Build system integration**
   - Update `services/ckpool/Makefile`:
     - New target: `sv2_ffi/target/release/libsv2_ffi.a` (runs `cargo build --release` in the `sv2-ffi/` directory)
     - Add `-Lsv2_ffi/target/release -lsv2_ffi -lpthread -ldl -lm` to `LDFLAGS`
     - Optional: `NO_SV2=1` flag to build without SV2 support (for backward compatibility)
     - Add `CFLAGS += -DNO_SV2` when building without SV2, with `#ifdef NO_SV2` guards in C code
   - Update `services/ckpool/Dockerfile`:
     - Multi-stage build: first stage compiles Rust FFI library, second stage builds ckpool linked against it
     - Install Rust toolchain in first stage (use `rustup`)
     - Copy `libsv2_ffi.a` and `sv2_ffi.h` to the ckpool build stage

5. **Configuration additions**
   - Update ckpool config schema to include SV2 block:
     ```json
     {
         "sv2": {
             "enabled": true,
             "port": 3334,
             "authority_public_key": "<base58-encoded-pub-key>",
             "authority_secret_key": "<base58-encoded-sec-key>",
             "cert_validity_seconds": 3600,
             "min_miner_hashrate": 500000000000,
             "header_only_mining": true
         }
     }
     ```
   - Create `services/ckpool/config/ckpool-signet-sv2.conf` (signet config with SV2 enabled)
   - Add key generation utility: `services/ckpool/scripts/generate-sv2-keys.sh`

6. **Translation proxy deprecation**
   - After Phase 6B is verified, the translation proxy from Phase 6A becomes a fallback only
   - Update Docker Compose: `sv2-proxy` service gets `profiles: ["fallback"]` so it doesn't start by default
   - Document the transition path

#### Testing (Phase B)

- **SV2-B-01:** SV2 miner connects directly to ckpool on :3334 (no proxy) — shares are submitted and validated. Use SRI test miner.
- **SV2-B-02:** Noise Protocol handshake completes — encrypted channel established. Protocol-level verification.
- **SV2-B-03:** Header-only mining works — SV2 miner with header-only mode receives only block header data.
- **SV2-B-04:** Dual-stack (SV1 :3333 + SV2 :3334) — both protocols work simultaneously under mixed load.
- **SV2-B-05:** SV2 share RTT <= SV1 share RTT — comparative latency benchmark.
- **SV2-B-06:** Rust FFI memory safety — no memory leaks under sustained load. Verify with Valgrind and AddressSanitizer.
- **SV2-B-07:** SV2 connection scalability — 10,000+ concurrent SV2 connections.
- **SV2-B-08:** Translation proxy no longer needed — verify direct SV2 path works end-to-end without the proxy.

---

### Phase 6C — Job Negotiation (Month 3)

#### Overview

Full SV2 Job Negotiation protocol support. Miners running their own Bitcoin Core can propose their own block templates. The pool validates template structure (not content — we do NOT enforce transaction selection). This is the technical foundation for The Bitcoin Game's "Decentralized Mining" vision: maximum censorship resistance, maximum sovereignty.

#### Architecture

```
Miner's Home Setup:
  Bitcoin Core (miner's node) → Template Provider → Job Negotiator
                                                          │
                                                          ▼ (Job Negotiation Protocol)
The Bitcoin Game Infrastructure:
  CKPool (SV2 Pool Role) ← validates template structure
       │                      does NOT censor transactions
       ▼
  Event Pipeline ── "template_source: miner" in share events
```

#### What to Build

1. **Job Negotiation message handlers in ckpool**
   - Handle `AllocateMiningJobToken` — authorize miner to submit custom templates, return token
   - Handle `CommitMiningJob` — receive miner's proposed template hash + coinbase prefix, validate, accept/reject
   - Handle `CommitMiningJobSuccess` / `CommitMiningJobError` — respond to miner
   - Store committed templates in memory (keyed by job token) for share validation
   - When shares are submitted against a miner-committed template, validate against that template (not the pool's default)

2. **Template validation logic**
   - Create `template_validation_result_t validate_miner_template()` function
   - Validation rules (structural only — NOT content-based):
     - Valid `prev_hash`: must match current chain tip (reject if >1 block behind)
     - Reasonable `ntime`: within 2 hours of current time
     - Block weight within protocol limits (reject if >4MW)
     - Coinbase includes pool payout output (if using shared reward model; for solo mining, the entire reward goes to the miner)
     - Timestamp range check
   - **Crucially: do NOT enforce transaction selection policy.** The entire point of Job Negotiation is miner sovereignty over transaction inclusion. We validate structure, not content.

3. **Work accounting for miner-proposed templates**
   - Shares submitted against miner-proposed templates count identically to pool-template shares
   - The `share_submitted` event includes:
     - `"template_source": "miner"` (vs `"template_source": "pool"` for default)
     - `"miner_template_hash": "a1b2c3..."`
     - `"miner_tx_count": 3847`
     - `"miner_template_fees_sat": 12500000`
   - If a block is found using a miner's template, the block is submitted using the miner's transactions

4. **New event types**
   - `job_negotiated` event:
     ```json
     {
         "event": "job_negotiated",
         "timestamp": 1693612345678,
         "source": "hosted",
         "protocol": "stratum_v2",
         "data": {
             "user": "bc1q...",
             "template_hash": "a1b2c3...",
             "tx_count": 3847,
             "total_fees_sat": 12500000,
             "block_weight": 3998421,
             "validation_result": "accepted"
         }
     }
     ```
   - `template_proposed` event (when miner submits a template for negotiation)
   - `template_accepted` / `template_rejected` events
   - Update event collector schemas (`services/event-collector/src/schemas.py`) for all new event types

5. **Rust FFI extensions for Job Negotiation**
   - Add to `sv2-ffi/src/lib.rs`:
     - `sv2_handle_job_negotiation_message()` — process JN protocol messages
     - `sv2_validate_committed_job()` — validate a committed job's template hash
     - `sv2_get_template_info()` — extract template metadata for events
   - Update `sv2_ffi.h` with new function signatures and structs

6. **Gamification integration**
   - New badge triggers via the event pipeline:
     - "Sovereign Miner" (legendary) — first share with miner-selected transactions
     - "Node Runner" (epic) — connect with Job Negotiation active
     - "Template Crafter" (rare) — build 1000 custom templates
   - These badges are triggered by the event pipeline — the badge logic lives in the frontend/API layer, but the events must carry enough data to trigger them
   - Document the badge trigger conditions for the API team

7. **Database schema additions**
   - New table: `miner_templates` (template_hash, user_id, tx_count, total_fees_sat, block_weight, submitted_at, validation_result)
   - Add columns to `shares` table: `template_source VARCHAR(8) DEFAULT 'pool'`, `miner_template_hash VARCHAR(64)`
   - Update TimescaleDB continuous aggregates to include template_source breakdown

#### Testing (Phase C)

- **SV2-C-01:** Miner proposes valid template via Job Negotiation → template accepted, shares validated against it. Use SRI Job Negotiator + Template Provider.
- **SV2-C-02:** Miner proposes stale template (old prev_hash) → template rejected with clear error.
- **SV2-C-03:** Miner proposes oversized block (>4MW) → template rejected.
- **SV2-C-04:** Template with unusual transaction selection (low-fee txs, empty block, etc.) → template ACCEPTED. We do not censor.
- **SV2-C-05:** Block found via miner template → block submitted with miner's chosen transactions. Test on signet.
- **SV2-C-06:** Mixed miners — some using Job Negotiation, some using pool templates — both paths work simultaneously.
- **SV2-C-07:** Template validation performance — <10ms per template validation under load.
- **SV2-C-08:** Events for JN shares include `template_source: "miner"` and all metadata fields.

---

## Rules

1. **Read all the docs first.** The `docs/ckpool-service/` directory has comprehensive specifications, especially `roadmap/phase-06-stratum-v2.md`. Don't reinvent — implement what's documented.
2. **Docker everything.** ckpool does not build on macOS. The SRI project (Rust) builds in Docker. The entire dev stack runs in Docker Compose.
3. **Don't modify `dashboard/`.** The frontend is done.
4. **GPLv3 compliance.** All C modifications carry the GPL header. Rust FFI code that links into ckpool is also GPLv3. The Python event collector is a separate process (not GPL).
5. **SRI is the reference implementation.** Use `https://github.com/stratum-mining/stratum` for the translation proxy (Phase A) and as a reference for protocol behavior. Build the `translator` role from the `roles/` directory.
6. **Dual-stack is non-negotiable.** SV1 on :3333 and SV2 on :3334 must coexist. Most miners still use SV1. Never break SV1 to add SV2.
7. **Phase 6A first, then 6B, then 6C.** The translation proxy (6A) is the simplest path. Get it working before attempting native integration (6B). The Rust FFI is complex — earn confidence with the proxy first. Job Negotiation (6C) is the most experimental — document all limitations clearly.
8. **All new events include `source` and `protocol` fields.** Every event from SV2 code paths must include `"protocol": "stratum_v2"`. Every event from SV1 code paths must include `"protocol": "stratum_v1"`. The `source` field continues to be `"hosted"` (future-proofing for decentralized mining).
9. **Test with SRI-provided test miners.** The SRI project includes `mining-device` (test miner), `mining-proxy`, `job-negotiator`, and `template-provider` roles. Use these for end-to-end testing.
10. **Job Negotiation is sovereignty.** Do NOT add transaction censorship logic. Do NOT filter by fee rate. Do NOT reject templates based on which transactions they include. Validate structure only. This is a core philosophical principle.
11. **Signet for development, testnet4 for staging.** All development testing happens on signet. Production deployment targets mainnet only after full staging validation.
12. **Log extensively.** During development, log every SV2 event at DEBUG level. Noise handshakes, message translations, template validations — all visible in logs.

---

## Files to Create/Edit

### Phase 6A — SV2 Translation Proxy

| Action | File |
|---|---|
| CREATE | `services/sv2-proxy/Dockerfile` |
| CREATE | `services/sv2-proxy/config/translator-config.toml` |
| CREATE | `services/sv2-proxy/scripts/generate-noise-keys.sh` |
| CREATE | `services/sv2-proxy/src/connection_tracker.py` |
| CREATE | `services/sv2-proxy/README.md` |
| EDIT | `services/docker-compose.yml` — add `sv2-proxy` service |
| EDIT | `services/event-collector/src/schemas.py` — add `protocol` field to event schemas |
| EDIT | `services/event-collector/src/collector.py` — handle `protocol` field |
| CREATE | `services/sv2-proxy/tests/test_sv2_proxy.sh` — integration test script |
| EDIT | Grafana dashboard config — add SV2 panel |
| EDIT | Prometheus config — add SV2 proxy scrape target |

### Phase 6B — Native SV2 Pool Support

| Action | File |
|---|---|
| CREATE | `services/ckpool/sv2-ffi/Cargo.toml` |
| CREATE | `services/ckpool/sv2-ffi/src/lib.rs` |
| CREATE | `services/ckpool/sv2-ffi/src/types.rs` |
| CREATE | `services/ckpool/sv2-ffi/sv2_ffi.h` |
| CREATE | `services/ckpool/sv2-ffi/cbindgen.toml` |
| CREATE | `services/ckpool/sv2-ffi/build.rs` |
| EDIT | `services/ckpool/src/connector.c` — dual-stack listener, SV2 message processing via FFI |
| EDIT | `services/ckpool/src/ckpool.h` — add SV2 config fields, protocol enum, SV2 handle pointer |
| EDIT | `services/ckpool/src/ckpool.c` — parse SV2 config, init/destroy SV2 handle |
| EDIT | `services/ckpool/src/stratifier.c` — add `protocol` field to all event emissions |
| EDIT | `services/ckpool/Makefile` — add Rust build target, link `libsv2_ffi.a` |
| EDIT | `services/ckpool/Dockerfile` — multi-stage build with Rust toolchain |
| CREATE | `services/ckpool/config/ckpool-signet-sv2.conf` — signet config with SV2 enabled |
| CREATE | `services/ckpool/scripts/generate-sv2-keys.sh` |
| EDIT | `services/docker-compose.yml` — update ckpool service for SV2 port, add `sv2-proxy` fallback profile |

### Phase 6C — Job Negotiation

| Action | File |
|---|---|
| EDIT | `services/ckpool/sv2-ffi/src/lib.rs` — add Job Negotiation FFI functions |
| CREATE | `services/ckpool/sv2-ffi/src/job_negotiation.rs` — JN protocol handler module |
| CREATE | `services/ckpool/sv2-ffi/src/template_validation.rs` — template validation logic (Rust side) |
| EDIT | `services/ckpool/sv2-ffi/sv2_ffi.h` — add JN structs and function signatures |
| EDIT | `services/ckpool/src/connector.c` — handle Job Negotiation messages |
| EDIT | `services/ckpool/src/stratifier.c` — validate shares against miner-committed templates, emit JN events |
| CREATE | `services/ckpool/src/template_store.c` — in-memory store for committed miner templates |
| CREATE | `services/ckpool/src/template_store.h` — header for template store |
| EDIT | `services/event-collector/src/schemas.py` — add `job_negotiated`, `template_proposed`, `template_accepted`, `template_rejected` event schemas |
| EDIT | `services/event-collector/src/db_writer.py` — persist template events |
| EDIT | `services/event-collector/sql/init.sql` — add `miner_templates` table, update `shares` table |
| CREATE | `services/event-collector/sql/migration-006-job-negotiation.sql` — migration for existing deployments |
| CREATE | `docs/ckpool-service/guides/job-negotiation-user-guide.md` — user-facing documentation for miners |
| CREATE | `docs/ckpool-service/guides/sv2-connection-guide.md` — how to connect via SV2 |

---

## Definition of Done

### Phase 6A — SV2 Translation Proxy

1. SV2 Translation Proxy runs as a Docker service alongside ckpool (`docker compose up` starts it)
2. SV2-capable miners can connect on :3334 and submit shares through the proxy
3. Shares from SV2 miners appear in the event pipeline identically to SV1 shares (same validation, same persistence)
4. `miner_connected` events include `"protocol": "stratum_v2"` field for SV2 miners and `"protocol": "stratum_v1"` for SV1 miners
5. All SV2 traffic is encrypted (Noise Protocol) — verified by packet capture
6. Bandwidth reduction >50% measured and documented (SV2 binary framing vs SV1 JSON)
7. SV1 miners on :3333 are completely unaffected — zero regression
8. Prometheus metrics for SV2 proxy are available (connections, throughput, errors)
9. All Phase A tests passing (SV2-A-01 through SV2-A-07)
10. Proxy auto-restarts on crash (Docker restart policy)

### Phase 6B — Native SV2 Pool Support

1. ckpool natively accepts SV2 connections on :3334 — no translation proxy needed
2. Dual-stack: SV1 on :3333 and SV2 on :3334, both working simultaneously
3. Encrypted connections verified — Noise Protocol handshake completes, all SV2 traffic encrypted
4. Share validation works identically for both protocols — same stratifier code path
5. Rust FFI compiles cleanly and links into ckpool with no memory leaks (Valgrind + ASAN clean)
6. SV2 share round-trip latency <= SV1 share round-trip latency
7. 10,000+ concurrent SV2 connections supported
8. Header-only mining mode supported for SV2 miners
9. `NO_SV2=1` build flag produces a working ckpool without SV2 (backward compatible build)
10. Translation proxy moved to fallback profile in Docker Compose
11. All Phase B tests passing (SV2-B-01 through SV2-B-08)

### Phase 6C — Job Negotiation

1. Miners can propose their own block templates via the Job Negotiation protocol
2. Templates are validated structurally (valid prev_hash, reasonable ntime, within weight limits) but NOT by transaction content
3. Shares submitted against miner-proposed templates are validated and counted correctly
4. Pool correctly tracks work from both pool-template and miner-template shares
5. `share_submitted` events include `template_source` field (`"pool"` or `"miner"`)
6. New events emitted: `job_negotiated`, `template_proposed`, `template_accepted`, `template_rejected`
7. Block found via miner template is submitted with the miner's chosen transactions
8. Template validation performance: <10ms per template under load
9. Backward compatible — miners NOT using Job Negotiation work exactly as before
10. Database schema updated: `miner_templates` table, `shares.template_source` column
11. All Phase C tests passing (SV2-C-01 through SV2-C-08)
12. User-facing documentation: SV2 connection guide and Job Negotiation guide

### Overall Phase 6 Success Criteria

| Criterion | Measurement |
|---|---|
| SV2 endpoint live | :3334 accepting encrypted SV2 connections |
| Encryption for all SV2 | Noise Protocol verified via packet capture |
| Bandwidth reduction | >50% fewer bytes per share vs SV1 |
| Native SV2 (no proxy) | Direct SV2 in ckpool, proxy deprecated |
| Job Negotiation operational | Miners can propose own templates |
| Zero regression for SV1 | SV1 on :3333 fully unaffected |
| Latency targets | Share RTT <10ms, template validation <10ms |
| Gamification triggers | "Sovereign Miner" badge earnable via events |
| Event completeness | All events carry `source` and `protocol` fields |

---

## Order of Implementation

Do these in order — each step builds on the previous:

### Phase 6A (Weeks 1-4)

1. **Study SRI codebase** — Clone `https://github.com/stratum-mining/stratum`, read the `roles/translator` source, understand the configuration
2. **Build SRI Translation Proxy in Docker** — Multi-stage Dockerfile, Rust compilation, verify binary runs
3. **Configure the proxy** — Point upstream to ckpool, generate Noise keys, set up pool signature
4. **Docker Compose integration** — Add `sv2-proxy` service, ensure it starts after ckpool
5. **Test with SRI test miner** — Build the `mining-device` role from SRI, connect to proxy on :3334, verify shares reach ckpool
6. **Event schema updates** — Add `protocol` field to event schemas in the event collector
7. **Connection tracking** — Build the connection tracker to emit `protocol` field in `miner_connected` events
8. **Monitoring** — Add Prometheus metrics and Grafana panels for SV2 connections
9. **Bandwidth benchmarks** — Measure and document SV2 vs SV1 bandwidth usage
10. **Full regression test** — SV1 miners still work perfectly, all existing tests pass

### Phase 6B (Weeks 5-8)

1. **Study SV2 roles library** — Read the Rust source for the pool role in SRI, understand message types and Noise integration
2. **Design C FFI bindings** — Define the `sv2_ffi.h` header, map SV2 message types to C structs
3. **Build Rust FFI library** — Implement `sv2-ffi/src/lib.rs` with all extern "C" functions, compile to `libsv2_ffi.a`
4. **Integrate into ckpool connector** — Modify connector.c for dual-stack, SV2 message processing via FFI
5. **Noise Protocol integration** — SV2 connections use authenticated encryption natively in ckpool
6. **Protocol field in events** — Update stratifier.c to include protocol field in all event emissions
7. **Build system** — Update Makefile and Dockerfile for multi-stage Rust + C build
8. **Dual-stack testing** — SV1 on :3333 and SV2 on :3334, both working under mixed load
9. **Memory safety verification** — Valgrind and ASAN on the Rust FFI boundary
10. **Scalability testing** — 10,000+ SV2 connections, latency benchmarks

### Phase 6C (Weeks 9-12)

1. **Study Job Negotiation protocol** — Read the SV2 spec for AllocateMiningJobToken, CommitMiningJob, etc.
2. **Template Provider interface** — Define how ckpool receives and stores miner-proposed templates
3. **Job Negotiation message handlers** — Implement token allocation and job commitment in the FFI bridge
4. **Template validation** — Implement structural validation (prev_hash, ntime, weight, coinbase) — NO content censorship
5. **Template store** — In-memory store for committed templates, keyed by job token
6. **Work accounting** — Shares validated against miner-committed templates, correct attribution
7. **Event schema extensions** — `job_negotiated`, `template_proposed`, `template_accepted`, `template_rejected` events
8. **Database schema** — `miner_templates` table, `shares.template_source` column
9. **End-to-end testing** — SRI Job Negotiator + Template Provider → ckpool → share validation → events → database
10. **Block found via miner template** — Test on signet: miner proposes template, mines, finds block with their transactions
11. **Mixed miner testing** — JN miners + standard miners + SV1 miners, all simultaneously
12. **Documentation** — SV2 connection guide, Job Negotiation user guide, badge trigger documentation

**Critical: Get Phase 6A working completely before starting Phase 6B. Get Phase 6B working completely before starting Phase 6C.** Each phase adds complexity, and the simpler path must be proven stable first.
