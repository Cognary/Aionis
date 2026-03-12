# Aionis Lite Beta Gate v2

Date: `2026-03-12`  
Status: `passing`

Related:

1. [AIONIS_LITE_BETA_GATE_V1_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V1_2026-03-12.md)
2. [src/jobs/lite-beta-gate-v2.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-beta-gate-v2.ts)
3. [scripts/ci/lite-beta-gate-v2.test.mjs](/Users/lucio/Desktop/Aionis/scripts/ci/lite-beta-gate-v2.test.mjs)
4. [scripts/start-lite.sh](/Users/lucio/Desktop/Aionis/scripts/start-lite.sh)
5. [docs/public/en/getting-started/04-lite-operator-notes.md](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/04-lite-operator-notes.md)
6. [docs/public/zh/getting-started/04-lite-operator-notes.md](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/04-lite-operator-notes.md)

## Purpose

Beta gate v1 proved that Lite had:

1. startup packaging
2. operator docs
3. repeated successful dogfood evidence

Beta gate v2 tightens that posture.

It adds machine-checked expectations for:

1. startup help contract and Node requirement messaging
2. troubleshooting/operator guidance markers in EN and ZH operator docs
3. stricter real-process dogfood evidence beyond `ok=true`

## What v2 Adds

`job:lite-beta-gate-v2` now requires:

1. `start:lite`, `lite:dogfood`, `job:lite-alpha-gate`, and `job:lite-beta-gate` to remain present
2. `scripts/start-lite.sh` to keep a stable help contract
3. `scripts/start-lite.sh` to keep explicit `node:sqlite` / `Node 22+` requirement messaging
4. EN and ZH Lite operator notes to explicitly mention:
   - `22+`
   - `memory_lane`
   - `X-Admin-Token`
   - `lite_embedding_backfill_completed_inline`
   - `lite:dogfood`
   - `lite_sqlite`
5. repeated dogfood summaries that are not only successful, but also strict-stable:
   - health reports Lite + SQLite
   - all key route statuses are `200`
   - `find` returns nodes
   - `recall_text` returns seeds
   - `planning/context` and `context/assemble` return positive token estimates
   - pack export/import succeeds
   - replay succeeds with step evidence
   - inline embedding backfill completes

## Release Position

v2 is intended to answer a narrower question than v1:

> Is Lite only green in repository bring-up terms, or is it also green from a startup/operator/runtime experience perspective?

If v2 passes, Lite should be treated as a stronger beta candidate than a v1-only pass.

## Current Result

Current artifact:

1. [LITE_BETA_GATE_V2_20260312.md](/Users/lucio/Desktop/Aionis/artifacts/lite/LITE_BETA_GATE_V2_20260312.md)
2. [LITE_BETA_GATE_V2_20260312.json](/Users/lucio/Desktop/Aionis/artifacts/lite/LITE_BETA_GATE_V2_20260312.json)

Current verdict:

1. `ok = true`
2. `successful_dogfood_runs = 3`
3. `strict_stable_dogfood_runs = 3`

This means Lite now satisfies a stronger beta-candidate posture than v1 alone:

1. repeated dogfood is green
2. startup UX is machine-checked
3. operator troubleshooting guidance is machine-checked
