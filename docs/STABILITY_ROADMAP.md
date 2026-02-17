# Stability Roadmap (Executable Checklist)

This file is the **source of truth** for making this project stable over time. Work should be driven by the items below (add a short note + link to code changes when completed) so we don't lose context or repeat mistakes.

Related:
- Hard API contract: `docs/API_CONTRACT.md`
- Long-term memory roadmap: `docs/LONG_TERM_MEMORY_ROADMAP.md`
- Operator runbook: `docs/OPERATOR_RUNBOOK.md`

## Stability Goals

- **Predictable behavior** under failures (network, DB hiccups, partial writes).
- **No silent data expansion** (response sizes bounded; embeddings never leak).
- **Recoverable async processing** (outbox/worker is at-least-once and idempotent).
- **Observable** (errors have codes; key operations have timing + counts).

## Definitions

- **Hard cap**: server-enforced maximum; client cannot bypass.
- **Idempotent**: same request/job can run multiple times without duplicating effects.
- **At-least-once**: a job may run more than once; correctness must still hold.

---

## Phase 0: Baseline Guardrails (Must-Have)

- [x] Hard API contract: no embeddings by default; debug embeddings are privileged + bounded (`docs/API_CONTRACT.md`).
- [x] Contract smoke test (no DB needed): `npm run test:contract`.

### P0.1 Standardize error responses (400 vs 500)
- [x] Zod validation errors return 400 with structured issues.
- [x] Contract violations return 400 with stable `error` codes.

**DoD**
- No known “client mistake → 500” paths for recall endpoints.

---

## Phase 1: Embedding Stability (Network Hardening)

### P1.1 Timeouts + retries + concurrency limit
- [x] Add embedding HTTP hardening:
  - request timeout (AbortController)
  - bounded retries with exponential backoff + jitter
  - classify errors: retry on network/5xx; do not retry on 4xx
  - per-process max concurrency for embedding requests

**DoD**
- Configurable via env (sane defaults):
  - `EMBED_HTTP_TIMEOUT_MS` (e.g. 10000)
  - `EMBED_HTTP_MAX_RETRIES` (e.g. 2)
  - `EMBED_HTTP_BASE_DELAY_MS` (e.g. 250)
  - `EMBED_HTTP_MAX_DELAY_MS` (e.g. 5000)
  - `EMBED_HTTP_MAX_CONCURRENCY` (e.g. 8)
- Embedding providers (`openai`, `minimax`) use the shared hardened fetch.

**Manual verification**
- Temporarily set a low timeout (e.g. 1ms) and confirm embedding calls fail fast.
- Confirm 4xx from provider does not retry (one attempt).

### P1.2 Define embedding failure policy (write path)
- [x] Pick one and make it explicit:
  - **fail-fast**: if `auto_embed=true` and embedding fails → whole `/write` fails
  - **eventual**: write succeeds, but node is marked `embedding_status=pending` and an outbox job backfills embeddings

**DoD**
- Behavior documented + enforced; no silent partial states.

**Implemented choice**
- Eventual: `/write` is the SoR. Embeddings are derived artifacts backfilled via `memory_outbox` (`event_type=embed_nodes`).
- Recall uses only `embedding_status=ready` as seeds and activatable content sources.

---

## Phase 2: Outbox/Worker Reliability (Recoverable Async)

### P2.1 Dead-letter (FAILED) state + replay
- [x] Add `failed_at` (or status) to `memory_outbox`.
- [x] Worker marks items as failed when attempts exceed `OUTBOX_MAX_ATTEMPTS` (no poison-loop).
- [x] Provide a replay mechanism (SQL snippet or CLI script) to requeue failed items.

**DoD**
- Failed jobs stop being claimed.
- Operator can replay safely.

**Implementation**
- Migration: `migrations/0007_outbox_failed.sql`
- Replay CLI: `npm run job:outbox-replay -- ...`

### P2.2 Job handler idempotency audit
- [x] For each job type, document and enforce idempotency:
  - stable ids for derived nodes/edges
  - `ON CONFLICT` behavior is safe

**DoD**
- Running the worker twice on the same outbox item does not create duplicates.

**Implementation**
- Migration: `migrations/0008_outbox_job_key.sql`
- Added `memory_outbox.job_key` + unique index to prevent duplicate enqueues for the same logical job (migration `0008_outbox_job_key.sql`).
- `embed_nodes` and `topic_cluster` enqueue paths set deterministic `job_key` + `payload_sha256`.
- `embed_nodes` is idempotent: backfill skips nodes already `embedding_status=ready`.
- `/write` suppresses enqueue for nodes already `embedding_status=ready` to reduce outbox noise.
- `topic_cluster` is idempotent at the graph layer: edges use stable ids + unique constraints (`memory_edges_unique`).

---

## Phase 3: API Operational Stability

### P3.1 Request IDs and structured logs
- [x] Generate/propagate `request_id` for API requests and include it in logs.
- [x] Log essential counters per recall:
  - seeds count
  - neighborhood counts (nodes/edges)
  - returned nodes/edges
  - timing per DB query stage (coarse)

**DoD**
- A single request can be traced end-to-end from logs.

**Implementation**
- `src/index.ts`:
  - `x-request-id` generation/propagation (response header + log correlation)
  - structured per-request logs for `/write`, `/recall`, `/recall_text` include counts + stage timings

### P3.2 Rate-limits for debug channels
- [x] Add basic throttling for:
  - debug embeddings (admin)
  - recall endpoints

**DoD**
- Debug channel cannot be trivially abused to create load spikes.

**Implementation**
- In-memory token bucket limiter (per-process):
  - `RECALL_RATE_LIMIT_RPS`, `RECALL_RATE_LIMIT_BURST`
  - `DEBUG_EMBED_RATE_LIMIT_RPS`, `DEBUG_EMBED_RATE_LIMIT_BURST`
  - `RATE_LIMIT_ENABLED`, `RATE_LIMIT_TTL_MS`
- Dev ergonomics: loopback traffic is not rate-limited when `NODE_ENV != production`.

---

## Phase 4: Data Integrity + Idempotency (DB-Level)

### P4.1 Uniqueness and conflict behavior
- [x] Ensure DB constraints support idempotency and auditability:
  - nodes: `UNIQUE(scope, client_id)` when `client_id` is present
  - edges: either stable `id`, or `UNIQUE(scope, type, src_id, dst_id)`
  - nodes/edges: `commit_id` is **NOT NULL** (everything is auditable)

**DoD**
- Re-sending the same write payload does not duplicate records.

**Notes**
- Implemented node `client_id` column + partial unique index in migration `0006_memory_nodes_client_id.sql` (apply via `make db-migrate`).
- Enforced `commit_id NOT NULL` for `memory_nodes` and `memory_edges` in migration `0010_commit_id_not_null.sql`.

### P4.2 Consistency checks (offline job)
- [x] Add an offline check job:
  - edges referencing missing nodes
  - embedding dim mismatches
  - unexpected nulls on required fields

**Implementation**
- Job: `npm run job:consistency-check`
- Script: `src/jobs/consistency-check.ts`

---

## Phase 5: Performance Stability

### P5.1 Query budget enforcement
- [x] Make all stage-2 neighborhood queries budgeted:
  - hard caps (already) plus optional quality filters (min weight/confidence)
  - avoid slow scans as data grows

### P5.2 Baseline EXPLAIN + index checklist
- [x] Document required indexes and record baseline `EXPLAIN (ANALYZE)` for:
  - stage-1 pgvector retrieval
  - neighborhood edge fetch

**Implementation**
- Budgeted neighborhood edge fetch + node fetch: `src/memory/recall.ts`
- New optional filters: `min_edge_weight`, `min_edge_confidence` (request fields; documented in `docs/API_CONTRACT.md`)
- Baseline EXPLAIN SQL: `sql/explain_baseline.sql`
- Perf checklist doc: `docs/PERFORMANCE_BASELINE.md`
- Recommended recall ANN index (active tiers): `migrations/0012_memory_tier_long_term.sql`
  - `0011_vector_index_ready_hot.sql` is legacy and can remain for compatibility.

---

## Regression Commands (Operator Cheatsheet)

- Contract-only (no DB): `npm run test:contract`
- API sanity:
  - `curl -sS localhost:$PORT/health | jq`
  - Recall (no embeddings in DTO): see `docs/API_CONTRACT.md`
- Worker:
  - once: `npm run job:outbox-worker -- --once`
  - daemon: `npm run job:outbox-worker`

## Verification Stamp

- Last reviewed: `2026-02-16`
- Verification commands:
  - `npm run docs:check`
  - `npm run job:health-gate`
