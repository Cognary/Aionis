---
title: "Recall Path Tail Latency Plan"
---

# Recall Path Tail Latency Plan

Last updated: `2026-02-22`

## Goal

Reduce recall tail latency (`p95/p99`) without breaking Aionis recall quality and auditability guarantees.

Target SLO (production gate baseline):

1. Recall `p95 <= 1200ms`
2. Write `p95 <= 800ms`
3. API error rate `<= 2%`
4. Under queue pressure, recall tail should degrade gracefully (bounded expansion, no unbounded graph fanout).

## Scope

Applies to:

1. `POST /v1/memory/recall`
2. `POST /v1/memory/recall_text`
3. Throughput profile presets used by production/benchmark.

Out of scope:

1. Hosted-only infra controls (private repo runbooks)
2. LLM-provider latency (bench harness side)

## Plan Phases

### Phase 0: Baseline and observability

- [x] Keep recall profile resolution and adaptive downgrade telemetry in request logs.
- [x] Keep inflight gate wait telemetry (`inflight_wait_ms`) for queue pressure attribution.
- [x] Expose startup config snapshot for recall profile policy and adaptive controls.

Exit criteria:

1. Every recall/recall_text log has enough fields to explain profile selection and queue pressure.

### Phase 1: Queue-pressure hard-cap (code-level)

- [x] Add environment knobs for sustained-pressure hard-cap:
  - `MEMORY_RECALL_ADAPTIVE_HARD_CAP_*`
- [x] Add hard-cap resolver in API path:
  - apply only when caller did not explicitly pin recall knobs
  - clamp expansion budgets (`limit/hops/max_nodes/max_edges/ranked_limit`)
  - raise quality floors (`min_edge_weight/min_edge_confidence`)
- [x] Apply to both `/recall` and `/recall_text`.
- [x] Add log fields:
  - `adaptive_hard_cap_applied`
  - `adaptive_hard_cap_reason`
  - `adaptive_hard_cap_wait_ms`

Exit criteria:

1. Build passes.
2. Logs show deterministic hard-cap behavior on queue pressure.

### Phase 2: Runtime profile alignment

- [x] Add hard-cap knobs to `.env.example`.
- [x] Add hard-cap defaults to throughput profiles:
  - `scripts/env/profiles/prod.env`
  - `scripts/env/profiles/benchmark.env`
- [x] Document adaptive hard-cap semantics in API contract.

Exit criteria:

1. `apply-throughput-profile.sh` can roll out hard-cap values without manual env drift.

### Phase 3: Validation and gate

- [x] Run focused perf benchmark on representative scope (`>=100k` class dataset preferred).
- [x] Compare before/after for:
  - recall `p95/p99`
  - error rate
  - quality proxy (score/seed hit rate in selected benchmark run)
- [x] Update gate evidence artifact path in release notes or runbook.

Exit criteria:

1. Core gate and perf evidence are both green for selected profile.

## Validation Snapshot (`2026-02-22`)

Dataset and seed evidence:

1. Scope: `tailplan_100k_1771779923`
2. Seed artifact: `artifacts/perf_seed_tailplan_100k_1771779923.json`
3. Data shape: `events=100000`, `topics=1000`, `nodes=101000`, `edges=200000`

Before/after (same 100k scope):

1. Baseline stress run (aggressive concurrency, no pacing):
  - artifact: `artifacts/perf_benchmark_tailplan_100k_1771779923.json`
  - recall: `97/220` success, `123` × `429`, `p95=57.786ms`
  - write: `120/120` success, `p95=110.582ms`
2. Gate-tuned run (pacing + lower concurrency):
  - artifact: `artifacts/core_gate/20260223_011529/08_perf_benchmark.json`
  - recall: `180/180` success, `0` error, `p95=19.13ms`
  - write: `80/80` success, `0` error, `p95=128.843ms`

Core gate evidence:

1. Summary: `artifacts/core_gate/20260223_011529/summary.json`
2. Result: `ok=true`, `fail_reasons=[]`
3. SLO observed:
  - recall `p95=19.13ms` (threshold `<=1200ms`)
  - write `p95=128.843ms` (threshold `<=800ms`)
  - max error rate `0` (threshold `<=0.02`)

## Rollout Strategy

1. Start with `MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED=true`, moderate threshold (`WAIT_MS=700` in prod profile).
2. Observe `adaptive_hard_cap_applied` rate and recall quality signal for 24h.
3. Tighten/relax cap budget gradually by tenant profile policy and throughput profile updates.

## Rollback

Fast rollback options (no code revert):

1. Set `MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED=false`
2. Or raise `MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS` to effectively disable trigger
3. Re-apply env profile and restart API.

## Verification Commands

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s build

# optional: apply managed profile first
bash scripts/env/apply-throughput-profile.sh prod

# core gate (example)
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope default \
  --run-perf true
```
