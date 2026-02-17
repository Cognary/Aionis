# Aionis Memory Graph (Postgres + pgvector)

This repo is a minimal, runnable skeleton for a "Memory Graph" backed by Postgres + pgvector.

## Current GTM Snapshot (2026-02-17)

- Phase 1 Gate A: pass  
  `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/20260217_132642/summary.json`
- Phase 2 Gate B (blocking + API smoke): pass  
  `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_b/20260217_140548/summary.json`
- Phase 2 integrations (OpenWork/LangGraph/MCP): pass  
  `/Users/lucio/Desktop/Aionis/artifacts/gtm/phase2_integrations/20260217_140317/summary.json`
- Phase 3 Gate C: has pass sample, but not yet continuously stable  
  pass sample: `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_172017/summary.json`  
  latest quick sample (`error_rate_pass=false`): `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_172832/summary.json`

## 3-Minute Experience (Recommended)

```bash
cd /Users/lucio/Desktop/Aionis
make quickstart
```

What you get:

- one-command stack startup (`db + migrate + api + worker`)
- a deterministic killer demo run with before/after recall delta
- direct output showing memory recall gain and tool-selection policy effect

Optional quick value snapshot:

```bash
make value-dashboard
```

Optional demo data cleanup (dry-run):

```bash
make killer-demo-cleanup
```

Apply deletion:

```bash
./examples/killer_demo_cleanup.sh --all --apply
```

## Requirements

- Docker Desktop (recommended) OR a local Postgres 16+ with `pgvector` installed
- `psql` available on your host (or use `docker compose exec` as shown below)

## Quickstart (Docker)

1. Start DB only:

```bash
make db-up
```

2. Run migrations:

```bash
cp .env.example .env
make db-migrate
```

3. Open SQL shell:

```bash
make db-psql
```

## Daemon Mode (Docker Compose)

Run DB + migrations + API + outbox worker as long-running services:

```bash
cp .env.example .env
make stack-up
```

API will be available at `http://localhost:<PORT>` (default `3001`).

Stop:

```bash
make stack-down
```

## Web UI (Graph Visualization)

This repo includes a minimal web UI in `apps/web` for:

- capturing notes (writes an `event` with `slots.content`)
- searching via `recall_text`
- visualizing the returned `subgraph` as an interactive graph
- copying the server-built `context.text`

Dev (two terminals):

1. Start API:

```bash
cd /Users/lucio/Desktop/Aionis
npm run dev
```

2. Install web deps and start web UI (Vite dev server proxies `/v1/*` to the API):

```bash
cd /Users/lucio/Desktop/Aionis/apps/web
npm install
# Point the UI proxy at your API (check `.env` PORT or `curl http://localhost:<port>/health`).
AIONIS_API_ORIGIN="http://localhost:${PORT:-3001}" npm run dev
```

Open: `http://localhost:5173`.

## API (Fastify + TypeScript)

This repo includes a minimal API server.

1. Install deps:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

Start production-like API process (single command):

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run build
nohup node dist/index.js > /tmp/aionis_api.log 2>&1 &
echo $! > /tmp/aionis_api.pid
curl -fsS "http://localhost:${PORT:-3005}/health"
```

If `health` fails, inspect:

```bash
tail -n 80 /tmp/aionis_api.log
```

### Migrations (Two-Phase Constraints)

For production-safe constraint rollouts (validated CHECK first, then `SET NOT NULL` later), see:

- `docs/MIGRATIONS_TWO_PHASE.md`

Recent hardening example:

- `0014_private_rule_owner_guard.sql`: adds private-rule owner guard as `NOT VALID`
- `0015_validate_private_rule_owner_guard.sql`: validates the guard globally after backfill convergence

Dev helper (deterministic fake embeddings for local testing):

```bash
npm run fake-embed -- "some text" > /tmp/emb.json
```

### Rules: Execution Injection

Recommended planner context shape:

- `/Users/lucio/Desktop/Aionis/docs/PLANNER_CONTEXT.md`
- `/Users/lucio/Desktop/Aionis/examples/planner_context.json`

Try:

```bash
/Users/lucio/Desktop/Aionis/examples/rules_evaluate.sh | jq '.applied'
```

Tool selector:

```bash
/Users/lucio/Desktop/Aionis/examples/tools_select.sh psql curl bash \
| jq '{selected:.selection.selected, ordered:.selection.ordered, lane:.rules.agent_visibility_summary.lane}'
```

Endpoints:

- `POST /v1/memory/write` insert nodes/edges + commit chain
- `POST /v1/memory/recall` pgvector candidates + 1-2 hop neighborhood + spreading activation scoring (+ `context.text` builder)
- `POST /v1/memory/recall_text` same as `recall`, but server generates the query embedding from `query_text`
- `POST /v1/memory/feedback` record rule feedback and update rule stats
- `POST /v1/memory/rules/evaluate` evaluate ACTIVE/SHADOW rules against planner context, including `agent_visibility_summary`
- `POST /v1/memory/tools/select` apply rule tool policy (`allow/deny/prefer`) to candidates with deterministic selection
- `POST /v1/memory/tools/feedback` write outcome feedback for matched tool rules
- `POST /v1/memory/rules/state` manually promote/demote a rule (`draft/shadow/active/disabled`)

### SDK (TypeScript + Python)

SDK client is available at:

- `/Users/lucio/Desktop/Aionis/src/sdk/index.ts`
- `/Users/lucio/Desktop/Aionis/packages/sdk` (`@aionis/sdk` publishable package)
- `/Users/lucio/Desktop/Aionis/docs/SDK.md`
- `/Users/lucio/Desktop/Aionis/docs/SDK_COMPATIBILITY_MATRIX.md`
- `/Users/lucio/Desktop/Aionis/docs/SDK_RELEASE.md`

Current release status:

- TypeScript SDK published: `@aionis/sdk@0.1.0`.
- Python SDK published: `aionis-sdk==0.1.0`.
- Release runbook: `/Users/lucio/Desktop/Aionis/docs/SDK_RELEASE.md`.

Smoke:

```bash
npm run sdk:smoke
npm run sdk:tools-feedback-smoke
npm run sdk:py:smoke
```

Package dry-run:

```bash
npm run sdk:build
npm run sdk:pack-dry-run
npm run sdk:release-check
npm run sdk:py:compile
npm run sdk:py:release-check
# or
make sdk-build
make sdk-pack-dry-run
make sdk-release-check
```

### Docker Image Release (GHCR)

Runbook:

- `/Users/lucio/Desktop/Aionis/docs/DOCKER_RELEASE.md`

Local dry-run build:

```bash
npm run docker:publish:ghcr:dry-run
```

Publish (multi-arch):

```bash
IMAGE_REPO=ghcr.io/<owner>/aionis-memory-graph \
TAG=0.1.0 \
PUBLISH_LATEST=true \
npm run docker:publish:ghcr
```

### Phase-D Performance Baseline

Run multi-scale performance matrix (seed + API benchmark + worker throughput + explain + markdown report):

```bash
npm run perf:phase-d-matrix
```

SLO-focused profiles (recommended):

```bash
# Recall SLO (read-heavy, lower concurrency to isolate recall stability)
PERF_PROFILE=recall_slo SCALES=100000 npm run perf:phase-d-matrix

# Write SLO (write-only, conservative concurrency to avoid rate-limit noise)
PERF_PROFILE=write_slo SCALES=100000 npm run perf:phase-d-matrix

# Worker SLO (build embed backlog first, then measure worker throughput)
PERF_PROFILE=worker_slo SCALES=100000 npm run perf:phase-d-matrix
```

Important perf note:

- If benchmark results contain `429` in `by_status`, this run is rate-limit dominated and cannot be used as recall/write latency evidence.
- For a cleaner local SLO signal, reduce benchmark pressure:

```bash
PERF_PROFILE=recall_slo RECALL_REQUESTS=120 RECALL_CONCURRENCY=2 SCALES=100000 npm run perf:phase-d-matrix
```

- Or temporarily raise recall limits on the API process (tenant + per-IP) and restart API before running perf.

Recommended for stable runs:

- keep default `SCOPE_STRATEGY=isolated` (unique scope per run, avoids hot-scope reset locks)
- keep default `RESET_MODE=auto` (isolated scope => no reset delete)
- keep default `RESET_IMPL=scope_purge` + `RESET_PURGE_MODE=partition` (reset path prefers partition truncate)
- keep default `RESET_PURGE_FAIL_ON_DELETE=true` to hard-fail if reset falls back to chunked delete
- run destructive reset only in offline window

Destructive fixed-scope reset (offline only):

```bash
SCOPE_STRATEGY=fixed RESET_MODE=always PERF_OFFLINE_WINDOW=true \
RESET_IMPL=scope_purge RESET_PURGE_MODE=partition \
npm run perf:phase-d-matrix
```

If partition cutover is not ready yet (temporary compatibility mode):

```bash
SCOPE_STRATEGY=fixed RESET_MODE=always PERF_OFFLINE_WINDOW=true \
RESET_IMPL=scope_purge RESET_PURGE_MODE=auto RESET_PURGE_ALLOW_FALLBACK_DELETE=true \
RESET_PURGE_FAIL_ON_DELETE=false npm run perf:phase-d-matrix
```

Artifacts are written to:

- `/Users/lucio/Desktop/Aionis/artifacts/perf/<timestamp>/`
- final report: `PERFORMANCE_REPORT_V1.md`

Manual tools:

```bash
npm run job:perf-seed -- --scope perf --events 100000 --topics 1000 --reset
npm run job:scope-purge -- --scope perf --tenant-id default --mode partition --apply
npm run job:perf-benchmark -- --scope perf --mode all
npm run job:perf-worker-benchmark -- --scope default --iterations 8
npm run job:perf-report -- --dir /Users/lucio/Desktop/Aionis/artifacts/perf/<run_id>
```

### One-Click Regression (Step 2-7)

Single command to run migration/build/contract + service check/start + phase-c/phase4 e2e + health gate + phase-d perf matrix:

```bash
npm run regression:oneclick
```

Optional quick mode (skip perf):

```bash
SKIP_PERF=true npm run regression:oneclick
```

Optional custom perf scales:

```bash
PERF_SCALES=100000,300000 npm run regression:oneclick
```

Optional SLO perf profile for regression:

```bash
PERF_PROFILE=recall_slo npm run regression:oneclick
```

Optional skip migration (when DB schema is already current):

```bash
SKIP_MIGRATE=true npm run regression:oneclick
```

Reuse existing API/worker only (do not auto-start services):

```bash
START_SERVICES_IF_NEEDED=false npm run regression:oneclick
```

If `START_SERVICES_IF_NEEDED=false`, regression exits at step `[2/7]` when API or outbox-worker is not already healthy.

Optional disable alias-edge auto-repair step:

```bash
AUTO_REPAIR_ALIAS_EDGES=false npm run regression:oneclick
```

Optional run GTM Phase 1 gate at the end of regression:

```bash
GTM_PHASE1_GATE=true npm run regression:oneclick
```

Optional enforce GTM gate (fail regression when GTM gate fails):

```bash
GTM_PHASE1_GATE=true GTM_PHASE1_GATE_ENFORCE=true npm run regression:oneclick
```

Optional GTM gate tuning for regression:

```bash
GTM_PHASE1_GATE=true \
GTM_PHASE1_GATE_ITERATIONS=3 \
GTM_PHASE1_GATE_MIN_PASS_RATE=0.8 \
GTM_PHASE1_GATE_MIN_EXECUTED=3 \
GTM_PHASE1_GATE_LOOKBACK_DAYS=7 \
npm run regression:oneclick
```

Optional run GTM Phase 2 Gate B at the end of regression:

```bash
GTM_PHASE2_GATE=true npm run regression:oneclick
```

Optional enforce GTM Phase 2 gate:

```bash
GTM_PHASE2_GATE=true GTM_PHASE2_GATE_ENFORCE=true npm run regression:oneclick
```

Optional require API smoke in Phase 2 gate:

```bash
GTM_PHASE2_GATE=true GTM_PHASE2_GATE_REQUIRE_API_SMOKE=true npm run regression:oneclick
```

By default, perf step logs are streamed in terminal and saved to file.
To keep terminal quiet and only write logfile:

```bash
PERF_LOG_STREAM=false npm run regression:oneclick
```

Avoid worker contention during perf:

```bash
PERF_REQUIRE_IDLE_WORKER=true npm run regression:oneclick
```

### GTM Phase 1 Gate A Check

Run the Phase 1 gate checklist and write machine-readable evidence:

```bash
npm run gtm:phase1:gatea
```

Artifacts:

- `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/<run_id>/summary.json`
- demo/value/docs logs under the same directory

CI/blocking mode:

```bash
GATEA_FAIL_ON_FAIL=true npm run gtm:phase1:gatea
```

Phase 1 rehearsal (run Gate A multiple times and aggregate pass rate):

```bash
ITERATIONS=3 npm run gtm:phase1:rehearsal
```

Blocking rehearsal threshold example:

```bash
ITERATIONS=5 MIN_PASS_RATE=0.8 REHEARSAL_FAIL_ON_THRESHOLD=true npm run gtm:phase1:rehearsal
```

Generate weekly status draft from recent Gate A / rehearsal artifacts:

```bash
LOOKBACK_DAYS=7 OWNER=lucio npm run gtm:phase1:weekly-report
```

Export Phase 1 KPI snapshot + gate time-series CSV:

```bash
LOOKBACK_DAYS=30 npm run gtm:phase1:kpi-export
```

Generate Gate A review package (markdown + summary JSON):

```bash
LOOKBACK_DAYS=30 OWNER=lucio npm run gtm:phase1:review-pack
```

Review package now includes a computed `go_no_go` decision and reason list in `summary.json`.

Generate prioritized fix tasks automatically from review `go_no_go_reasons`:

```bash
LOOKBACK_DAYS=30 OWNER=lucio npm run gtm:phase1:fix-plan
```

Outputs `FIX_TASKS.md` + `tasks.json` under `/Users/lucio/Desktop/Aionis/artifacts/gtm/fix_plan/<run_id>/`.

Export fix tasks to Jira/Linear CSV import files:

```bash
LOOKBACK_DAYS=30 OWNER=lucio npm run gtm:phase1:fix-export
```

Outputs `jira_import.csv` + `linear_import.csv` under `/Users/lucio/Desktop/Aionis/artifacts/gtm/fix_export/<run_id>/`.
Also emits split CSVs for rollout:
- `jira_import_p0.csv`, `jira_import_p1p2.csv`
- `linear_import_p0.csv`, `linear_import_p1p2.csv`

Team/project mapping example:

```bash
JIRA_PROJECT_KEY=AION \
JIRA_COMPONENTS=Memory,GTM \
JIRA_EPIC_LINK=AION-123 \
LINEAR_TEAM=Core \
LINEAR_PROJECT="GTM Phase 1" \
LINEAR_CYCLE="2026-W08" \
npm run gtm:phase1:fix-export
```

Check rehearsal threshold gate (non-zero exit on fail):

```bash
MIN_EXECUTED=3 MIN_PASS_RATE=0.8 npm run gtm:phase1:threshold-check
```

Combined CI-style gate (rehearsal + threshold + weekly report):

```bash
ITERATIONS=3 MIN_PASS_RATE=0.8 MIN_EXECUTED=3 npm run gtm:phase1:ci-gate
```

`ci-gate` now includes review-pack, fix-plan, and fix-export outputs in its `summary.json`.

GitHub Actions workflow: `/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase1-gate.yml`

- supports manual run (`workflow_dispatch`) with inputs
- runs weekly by schedule
- uses concurrency lock to avoid overlapping runs on the same ref
- artifact upload can be toggled and retention days are configurable in dispatch inputs

### GTM Phase 2 Gate B Check

Run the Phase 2 SDK/ecosystem gate checklist and write machine-readable evidence:

```bash
npm run gtm:phase2:gateb
```

Blocking mode + API smoke required:

```bash
GATEB_FAIL_ON_FAIL=true GATEB_REQUIRE_API_SMOKE=true npm run gtm:phase2:gateb
```

Artifacts:

- `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_b/<run_id>/summary.json`
- TS/Python build/release/smoke logs under the same directory

GitHub Actions workflow: `/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase2-gate.yml`

### GTM Phase 3 Gate C Check

Run Phase 3 gate in non-blocking mode:

```bash
npm run gtm:phase3:gatec
```

Run in blocking mode (recommended for pre-prod):

```bash
START_SERVICES_IF_NEEDED=false \
GATEC_FAIL_ON_FAIL=true \
GATEC_PERF_PROFILE=recall_slo \
GATEC_SCALES=100000 \
GATEC_ENFORCE_PARTITION_FIRST_RESET=true \
GATEC_RESET_IMPL=scope_purge \
GATEC_RESET_PURGE_MODE=partition \
GATEC_RESET_PURGE_FAIL_ON_DELETE=true \
GATEC_REQUIRE_PARTITION_SHADOW_READY=true \
GATEC_PARTITION_DUAL_WRITE_ENABLED=true \
GATEC_PARTITION_READ_SHADOW_CHECK=true \
GATEC_PARTITION_READ_SHADOW_MIN_OVERLAP=0.95 \
RECALL_CONCURRENCY=2 \
RECALL_REQUESTS=120 \
npm run gtm:phase3:gatec
```

Rate-limit stabilization knobs (recommended when you see intermittent `429` in perf cases):

```bash
GATEC_AUTO_ADAPT_RATE_LIMIT=true \
GATEC_MAX_RATE_LIMIT_RETRIES=10 \
GATEC_SLO_MAX_ERROR_RATE=0.03 \
GATEC_BENCH_PACE_MS=50 \
GATEC_PACE_STEP_MS=25 \
GATEC_PACE_MAX_MS=2000
```

Current note: Gate C has pass samples, but sustained pass still depends on environment-specific rate-limit capacity and benchmark pacing.
You can inspect adaptive pacing behavior in:

- `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/summary.json` -> `metrics.adaptive_rate_limit`
- `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/perf/benchmark_adapt_<scale>.json`

Error-rate diagnostics in Gate C summary:

- steady-state (blocking):
  - `checks.steady_state_error_rate_pass`
  - `metrics.effective_steady_429_rate`
  - `metrics.max_case_non429_error_rate`
- process-phase (non-blocking, tuning only):
  - `metrics.process_max_case_429_rate`
  - `metrics.process_max_case_error_rate`
  - `checks.process_error_rate_over_budget`
- `checks.acceptable_429_within_budget`
- `gate.fail_reasons` now distinguishes:
  - `error_rate_failed_due_to_429_over_budget`
  - `error_rate_failed_due_to_non429_errors`
- `gate.notes` now also includes:
  - `process_429_observed_non_blocking`
  - `process_429_over_budget_non_blocking`
  - `process_non429_errors_over_budget_non_blocking`

### Production Preflight (One Command)

Run production-style gate + smoke checks (no perf matrix), and fail fast on known bad states:

```bash
npm run preflight:prod
```

`APP_ENV` modes:

- `APP_ENV=dev` (default): local-friendly behavior
- `APP_ENV=ci`: CI-friendly behavior
- `APP_ENV=prod`: strict fail-fast safeguards enabled

In `APP_ENV=prod`, the runtime/scripts enforce:

- `MEMORY_AUTH_MODE` must not be `off`
- `RATE_LIMIT_BYPASS_LOOPBACK=false`
- preflight/regression/gate-c default to `START_SERVICES_IF_NEEDED=false`

Useful flags:

```bash
SKIP_MIGRATE=true npm run preflight:prod
BASE_URL=http://localhost:3005 npm run preflight:prod
PREFLIGHT_START_SERVICES_IF_NEEDED=false npm run preflight:prod
# optional: include GTM Phase1 gate during preflight regression stage
PREFLIGHT_GTM_PHASE1_GATE=true PREFLIGHT_GTM_PHASE1_GATE_ENFORCE=true npm run preflight:prod
# optional: include GTM Phase2 gate during preflight regression stage
PREFLIGHT_GTM_PHASE2_GATE=true PREFLIGHT_GTM_PHASE2_GATE_ENFORCE=true npm run preflight:prod
```

Behavior highlights:

- executes `regression:oneclick` with `SKIP_PERF=true`
- executes orchestration compliance checks first (`00_orchestration.json`)
- can optionally enforce GTM Phase1 gate via `PREFLIGHT_GTM_PHASE1_GATE=true`
- runs write smoke and `recall_text` smoke
- enforces `recall_text` must not return generic `500` (upstream faults must be mapped to `429/503/502`)
- writes artifacts to `/Users/lucio/Desktop/Aionis/artifacts/preflight/<run_id>/`

### Rate Limits (P3.2)

To prevent abuse/load spikes, recall endpoints are protected by a basic in-memory token-bucket rate limiter.

Env knobs (see `.env.example`):

- `RATE_LIMIT_ENABLED=true`
- `RATE_LIMIT_BYPASS_LOOPBACK=true` (dev default; set false to test locally)
- `RECALL_RATE_LIMIT_RPS=10`, `RECALL_RATE_LIMIT_BURST=20` (per-IP best-effort)
- `DEBUG_EMBED_RATE_LIMIT_RPS=0.2`, `DEBUG_EMBED_RATE_LIMIT_BURST=2` (extra strict, on top of recall limits)
- `WRITE_RATE_LIMIT_RPS=5`, `WRITE_RATE_LIMIT_BURST=10`
- `WRITE_RATE_LIMIT_MAX_WAIT_MS=200` (write burst smoothing: wait+retry once before 429)

Note: this limiter is **per-process**. If you run multiple API processes, limits are not global.

`recall_text` production hardening:

- query embedding singleflight (same query in flight only calls upstream once)
- in-memory LRU+TTL cache (`RECALL_TEXT_EMBED_CACHE_*`) to reduce provider RPM pressure
- upstream embedding rate limit/unavailable now maps to explicit `429/503` API errors (not generic `500`)

### Tenant Isolation (P2.5)

Tenant-aware calls use `(tenant_id, scope)` as the isolation key.

Env knobs:

- `MEMORY_TENANT_ID=default` (default tenant)
- `MEMORY_SCOPE=default`

Request patterns:

- Body field: `tenant_id`
- Header fallback: `X-Tenant-Id` (used when body omits `tenant_id`)

Backward compatibility: `tenant_id=default` preserves existing single-tenant behavior.

#### API Key Identity Mapping

Enable hard identity binding:

- `MEMORY_AUTH_MODE=api_key`
- `MEMORY_API_KEYS_JSON='{"dev-key":{"tenant_id":"default","agent_id":"agent_a","team_id":"team_default"}}'`

When enabled:

- memory endpoints require `X-Api-Key`
- `tenant_id` must match the key-bound tenant (mismatch returns `403`)
- `consumer_agent_id` / `producer_agent_id` / `context.agent.*` are auto-filled from key identity when omitted
- identity mismatch in these fields returns `403`

#### JWT Identity Mapping (HS256)

Enable JWT mode:

- `MEMORY_AUTH_MODE=jwt` (or `api_key_or_jwt`)
- `MEMORY_JWT_HS256_SECRET=your_shared_secret`

JWT claims used:

- required: `tenant_id` (or `tenant`)
- optional: `agent_id` (fallback `sub`), `team_id`, `role`
- time checks: `exp` / `nbf` (clock skew via `MEMORY_JWT_CLOCK_SKEW_SEC`)

Example token (local):

```bash
node -e 'const c=require("crypto");const h={alg:"HS256",typ:"JWT"};const p={tenant_id:"default",agent_id:"agent_a",team_id:"team_default",exp:Math.floor(Date.now()/1000)+3600};const b=s=>Buffer.from(JSON.stringify(s)).toString("base64url");const x=b(h)+"."+b(p);const sig=c.createHmac("sha256",process.env.JWT_SECRET||"dev-secret").update(x).digest("base64url");console.log(x+"."+sig)'
```

Use it in requests:

```bash
-H "Authorization: Bearer <token>"
```

#### Tenant Quotas

Tenant-level quotas are independent from per-IP rate limits:

- `TENANT_QUOTA_ENABLED=true`
- `TENANT_RECALL_RATE_LIMIT_RPS`, `TENANT_RECALL_RATE_LIMIT_BURST`
- `TENANT_WRITE_RATE_LIMIT_RPS`, `TENANT_WRITE_RATE_LIMIT_BURST`
- `TENANT_WRITE_RATE_LIMIT_MAX_WAIT_MS=300` (write burst smoothing at tenant quota layer)
- `TENANT_DEBUG_EMBED_RATE_LIMIT_RPS`, `TENANT_DEBUG_EMBED_RATE_LIMIT_BURST`

Quick smoke:

```bash
bash /Users/lucio/Desktop/Aionis/examples/tenant_isolation_smoke.sh
# stricter e2e (assert tenant visibility + cross-tenant consistency checks)
npm run e2e:phasec-tenant
```

### Embeddings

By default, `.env.example` uses `EMBEDDING_PROVIDER=fake` (deterministic vectors for local dev).

For real embeddings:

- set `EMBEDDING_PROVIDER=openai`
- set `OPENAI_API_KEY=...`
- keep `EMBEDDING_DIM=1536` and `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`

For real embeddings via MiniMax:

- set `EMBEDDING_PROVIDER=minimax`
- set `MINIMAX_API_KEY=...` and `MINIMAX_GROUP_ID=...`
- set `MINIMAX_EMBED_MODEL=embo-01` (MiniMax-M2.1 is a text generation model, not an embeddings model)

`POST /v1/memory/write` supports `auto_embed` (default `true`). If enabled and a provider is configured, the server will schedule embedding backfill for nodes missing `node.embedding`.

Embeddings are treated as derived artifacts: `/write` does not block on embeddings. Missing embeddings are backfilled asynchronously via `memory_outbox` (`event_type=embed_nodes`). Until ready, those nodes are not recallable by default.

### Auto Topic Clustering On Write

`POST /v1/memory/write` supports:

- `trigger_topic_cluster: true` to run topic clustering right after the write
- `topic_cluster_async: true` to enqueue a `memory_outbox` item instead of running synchronously

Server defaults (can be overridden per request):

- `AUTO_TOPIC_CLUSTER_ON_WRITE=true` (default): if the write includes `event` nodes, topic clustering triggers automatically
- `TOPIC_CLUSTER_ASYNC_ON_WRITE=true` (default): enqueue to outbox (recommended)

Process queued items with:

```bash
npm run job:outbox-worker
```

Run once:

```bash
npm run job:outbox-worker -- --once
```

### Private Rule Owner Hard Guard

Rules with `memory_lane=private` must have at least one owner:

- `owner_agent_id`, or
- `owner_team_id`

Enforcement points:

- API write/promote paths return `400 invalid_private_rule_owner` on violation
- DB constraint `memory_nodes_private_rule_owner_ck` (migrations `0014` + `0015`)

Repair legacy rows (if any):

```bash
npm run job:private-rule-owner-backfill -- --dry-run --limit 5000
npm run job:private-rule-owner-backfill -- --limit 5000
```

### Example: write an Event + Topic + edge

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{
    "input_text": "demo write",
    "nodes": [
      { "client_id": "e1", "type": "event", "text_summary": "User asked to build memory graph." },
      { "client_id": "t1", "type": "topic", "title": "Memory Graph", "text_summary": "All memory graph work." }
    ],
    "edges": [
      { "type": "part_of", "src": { "client_id": "e1" }, "dst": { "client_id": "t1" }, "weight": 0.9 }
    ]
  }' | jq
```

Note: `recall` requires embeddings. For real usage, write nodes with `embedding` (length 1536).

### Example: recall (using fake embeddings)

```bash
Q="$(npm run -s fake-embed -- 'memory graph')"
curl -sS localhost:${PORT:-3001}/v1/memory/recall \
  -H 'content-type: application/json' \
  -d "{\"query_embedding\": $Q, \"limit\": 20, \"return_debug\": true}" | jq
```

### Example: recall_text (server-side embeddings)

```bash
curl -sS localhost:${PORT:-3001}/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"query_text":"memory graph topic clustering", "limit": 20, "return_debug": true}' | jq
```

Embeddings are never returned by default. To include a bounded embedding *preview* for debugging, pass:

- `return_debug: true`
- `include_embeddings: true`

If `ADMIN_TOKEN` is set, debug embeddings require `X-Admin-Token: $ADMIN_TOKEN`. If `ADMIN_TOKEN` is unset, debug embeddings are only allowed from localhost in non-production.

Hard contract details (DTO whitelist, debug auth/caps, edge/node caps): see `docs/API_CONTRACT.md`.
Stability work tracking checklist: see `docs/STABILITY_ROADMAP.md`.
Operator cadence and thresholds: see `docs/OPERATOR_RUNBOOK.md`.
Full documentation index: see `docs/README.md`.

## What's Included

- SQL migrations that create:
  - `memory_commits` (append-only, hash-chained)
  - `memory_nodes` (Event/Entity/Topic/Rule/Evidence + future-proof types)
  - `memory_edges` (`part_of/related_to/derived_from`)
  - `memory_rule_defs` (Rule lifecycle: `draft/shadow/active/disabled`)
  - `memory_rule_feedback` (verification signals for promotion)
  - `memory_outbox` (future Neo4j sync without invasive refactors)
- Query templates in `sql/`:
  - Stage-1 candidate retrieval (pgvector)
  - 1-2 hop neighborhood fetch for app-layer spreading activation

## Conventions / Design Notes

- Embedding dimension is fixed at **1536** for `text-embedding-3-small`.
- `client_id` (optional) is stored on `memory_nodes` and is unique per `scope` (when present). If you provide `client_id` without `id`, the server will generate a stable id derived only from `(scope, client_id)` for idempotency.
- `scope` is a first-class column on nodes/edges/commits:
  - Year-1: single user/single domain
  - Day-1: you can still segment by `scope` (visibility domain) to avoid migration pain later
- Write path applies minimal text normalization (whitespace collapse + length clamp) and optional PII redaction (`PII_REDACTION=true`).
- `tier` supports `hot/warm/cold/archive`; default recall targets `hot + warm`.
- Derived artifacts should be tracked via `derivation_version` so you can re-run clustering/rewrites.

## Operations Quick Commands

```bash
npm run job:salience-decay
npm run job:topic-cluster
npm run job:outbox-worker
npm run job:partition-maintenance -- --scope default --tenant-id default --ensure-scope-partition
npm run job:partition-backfill -- --scope default --tenant-id default --table all --batch-size 5000 --dry-run
npm run job:partition-verify -- --scope default --tenant-id default --sample-limit 20
npm run job:partition-cutover-gap -- --scope default --tenant-id default
npm run job:partition-read-shadow-check -- --scope default --tenant-id default --limit 20 --min-overlap 0.95
npm run job:scope-purge -- --scope default --tenant-id default --mode auto
npm run job:scope-purge -- --scope default --tenant-id default --mode partition --allow-fallback-delete --fail-on-delete
npm run job:partition-cutover-readiness
bash scripts/admin/scope-purge.sh
npm run job:private-rule-owner-backfill -- --dry-run --limit 5000
npm run job:quality-eval -- --strict
npm run job:health-gate -- --strict-warnings
```

Topic clustering uses DRAFT topics until they reach `TOPIC_MIN_EVENTS_PER_TOPIC` members, then they become ACTIVE.
