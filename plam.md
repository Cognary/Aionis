# Aionis Production Fix Plan (Severity-Ordered)

Last updated: 2026-02-18
Owner: release hardening

## P0 (Blocker)

### P0-1 Docker compose worker fails in runtime image
- Symptom: `worker` service restarts with `tsx: not found`.
- Impact: outbox processing stops, embedding backfill and memory value demo can fail silently.
- Root cause: compose worker command used dev-only `tsx`, but runtime image prunes dev dependencies.
- Fix:
  - `docker-compose.yml` worker command switched to `node dist/jobs/outbox-worker.js`.
- Acceptance:
  - `docker compose up -d` keeps worker in `Up` state.
  - worker logs no longer contain `tsx: not found`.

## P1 (High)

### P1-1 quickstart reports success even when value demo fails
- Symptom: `make quickstart` prints complete even when recall success flags are false.
- Impact: false positive release confidence.
- Root cause: killer demo computed success booleans but did not exit non-zero on failure.
- Fix:
  - `examples/killer_demo.sh` adds `--require-success` strict mode and optional `--result-file` output.
  - `scripts/quickstart.sh` now runs killer demo with `--require-success`.
- Acceptance:
  - quickstart exits non-zero when either:
    - `memory_recall_improved != true`
    - `cross_session_recall_stable != true`

### P1-2 Docker image naming inconsistent across docs/workflow
- Symptom: mixed usage of `ghcr.io/<owner>/aionis-memory-graph` and `ghcr.io/<owner>/aionis`.
- Impact: publish/pull confusion and release errors.
- Root cause: partial migration of naming convention.
- Fix:
  - Unified defaults/docs to `ghcr.io/<owner>/aionis` in:
    - `.github/workflows/docker-publish.yml`
    - `README.md`
    - `docs/DOCKER_RELEASE.md`
    - `scripts/docker-publish-ghcr.sh` usage text
- Acceptance:
  - no remaining `aionis-memory-graph` image references in release/docs/workflow paths.

## P2 (Performance)

### P2-1 consistency-check runtime too long on large data volume
- Symptom: minute-level runtime under existing production-scale data.
- Impact: release/ops gating latency.
- Root cause: many full `count(*)` scans in one monolithic run.
- Fix:
  - `src/jobs/consistency-check.ts` adds:
    - `--mode fast` (sample-first, lower-bound counts, skips full-count scans)
    - `--batch-size` + `--batch-index` (run checks in deterministic batches)
  - Added convenience scripts:
    - `job:consistency-check:scope:fast`
    - `job:consistency-check:cross-tenant:fast`
  - Operator docs updated with fast/batch commands.
- Acceptance:
  - command supports `--mode full|fast` and `--batch-size/--batch-index`.
  - output JSON contains run mode and batch metadata.

## Verification Checklist

- [x] `npm run -s build`
- [x] `npm run -s test:contract`
- [x] `npm run -s docs:check`
- [x] `node dist/jobs/consistency-check.js --scope default --mode fast --check-set scope`
- [x] `node dist/jobs/consistency-check.js --scope default --batch-size 10 --batch-index 0 --check-set scope`
- [x] `docker compose up -d` then confirm worker is healthy
- [x] `make quickstart` exits non-zero on demo failure and zero on success

## Release Decision Gate

Only release when all checklist items pass and no P0/P1 items remain open.

---

# Aionis Scale + SLA Debt Closure Plan (2026-02-20)

Owner: core runtime + ops governance  
Status: in progress

## Goal

Close the two production debts end-to-end:
1. Postgres single-cluster pressure at ultra-scale.
2. Recall quality/latency tradeoff lacking explicit SLA policy and adaptive control.

## Workstream 1: Partition Cutover Closure (Postgres pressure mitigation)

### Scope
- Complete `*_v2` partition cutover readiness as a hard production gate.
- Enforce partition-first purge/reset path in production operations.

### Deliverables
- Add optional blocking step in `core-production-gate` for `job:partition-cutover-readiness`.
- Keep `scope-purge` partition-first and fail when delete fallback appears in gated runs.
- Produce cutover evidence artifact per run.

### Acceptance
- Core gate can run with `CORE_GATE_REQUIRE_PARTITION_READY=true` and pass.
- No delete fallback in production perf/gate runs (`fail_on_delete`).

## Workstream 2: Recall SLA Policy (tenant/endpoint profile layering)

### Scope
- Move from one global profile default to layered profile selection:
  - global default
  - endpoint override
  - tenant default
  - tenant + endpoint override

### Deliverables
- New policy env JSON config + runtime resolver.
- Request logs include selected profile and source.

### Acceptance
- `recall` and `recall_text` can select different defaults by tenant/SLA class.
- Invalid policy config fails fast at startup.

## Workstream 3: Adaptive Degrade (latency safety valve)

### Scope
- When recall queue wait crosses threshold, auto-switch to a cheaper profile if caller did not pin recall knobs.

### Deliverables
- Configurable adaptive switch by wait threshold.
- Log mark when adaptive downgrade is applied.

### Acceptance
- Under queue pressure, non-pinned requests downgrade deterministically.
- Pinned requests remain unchanged.

## Workstream 4: Production Gate Standardization

### Scope
- Keep LoCoMo/LongMemEval as auxiliary.
- Promote production SLO/integrity checks as hard release gate.

### Deliverables
- Core gate exposes partition-readiness toggle and keeps SLO checks explicit in summary.
- Runbook and env sample align with gate inputs.

### Acceptance
- Release decision can be made from `core_gate/summary.json` only.

## Workstream 5: Ultra-scale Evolution Path (next phase)

### Scope
- Define threshold-based routing from single cluster -> read-replica -> tenant shard.

### Deliverables
- Decision matrix in docs (tenant cardinality, write QPS, recall p95, storage growth).
- Migration runbook for shard onboarding (non-disruptive).

### Acceptance
- A clear trigger policy exists for when to leave single-cluster Postgres.

## Execution Sequence (Now)

1. Add profile layering + adaptive degrade in runtime.
2. Add partition readiness hook to core gate.
3. Align `.env.example` + API contract doc with new policy knobs.
4. Run build + core checks; fix regressions.
5. Commit and push.

## Progress Update (2026-02-20)

- [x] Step 1 complete:
  - runtime supports layered profile resolution (`global/endpoint/tenant/tenant+endpoint`)
  - runtime supports adaptive downgrade under queue pressure for non-pinned recall requests
- [x] Step 2 complete:
  - `core-production-gate` supports blocking partition readiness step (`--require-partition-ready true`)
- [x] Step 3 complete:
  - `.env.example`, `docs/API_CONTRACT.md`, `docs/OPERATOR_RUNBOOK.md`, `README.md` updated
- [x] Step 4 (baseline) complete:
  - `npm run -s build`
  - `npm run -s test:contract`
  - `npm run -s docs:check`
- [ ] Step 5 pending:
  - commit + push
  - run partition-cutover readiness in target prod-like env and attach artifact proof
  - draft shard routing decision matrix (trigger thresholds)

### Added in this round

- `docs/ULTRA_SCALE_ROUTING_MATRIX.md` created with tiered trigger thresholds (`single cluster -> replica -> shard`).
