# Aionis Lite Public Beta Dogfood

Date: `2026-03-12`  
Status: `green`

Related:

1. [AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md)
2. [AIONIS_LITE_BETA_GATE_V2_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_BETA_GATE_V2_2026-03-12.md)
3. [Lite Public Beta Boundary (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/05-lite-public-beta-boundary.md)
4. [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)

## Purpose

This run exists to answer a narrower question than the canonical script:

> Can Lite survive a realistic beta-style operator flow when the repository dogfood helper is not doing the orchestration for the user?

The point is not to replace `npm run -s lite:dogfood`.

The point is to prove that the public beta path is understandable and runnable through normal requests and operator checks.

## Environment

Real process startup:

```bash
PORT=3316 \
ADMIN_TOKEN=beta-admin \
LITE_WRITE_SQLITE_PATH=.tmp/aionis-lite-write-beta.sqlite \
LITE_REPLAY_SQLITE_PATH=.tmp/aionis-lite-replay-beta.sqlite \
npm run -s start:lite
```

Observed health:

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`

## Validation Shape

This pass intentionally did not use `npm run -s lite:dogfood`.

Instead it executed the public-beta-style operator path manually:

1. `GET /health`
2. `POST /v1/memory/write`
3. `POST /v1/memory/find`
4. `POST /v1/memory/recall_text`
5. `POST /v1/memory/planning/context`
6. `POST /v1/memory/context/assemble`
7. `POST /v1/memory/packs/export`
8. `POST /v1/memory/packs/import`
9. replay lifecycle:
   - `run/start`
   - `step/before`
   - `step/after`
   - `run/end`
   - `runs/get`

Artifact:

1. [public_beta_manual_20260312_123422](/Users/lucio/Desktop/Aionis/artifacts/lite/public_beta_manual_20260312_123422)

## Result

Current result is green.

Observed behavior:

1. all request statuses returned `200`
2. write returned `lite_embedding_backfill_completed_inline`
3. `find` returned one shared-lane node
4. `recall_text` returned one seed and non-empty context
5. `planning/context` returned `context_est_tokens = 23`
6. `context/assemble` returned `context_est_tokens = 23`
7. pack export/import succeeded
8. replay lifecycle succeeded
9. `runs/get` returned `status = "success"` with one step

## Interpretation

This matters because it is stronger than a repository-only helper pass.

It shows:

1. Lite public beta instructions are now good enough to drive a real process manually
2. the current Lite local envelope is not only gate-green, but also operator-usable without relying on the canonical wrapper script
3. current remaining risk is now mostly post-beta field hardening, not local runtime bring-up

## Final Judgment

This run is enough to support a stronger statement than before:

> Lite is no longer only a repository beta-candidate. It is now approved for a controlled public beta posture, provided messaging stays narrow and Server-only boundaries remain explicit.
