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
