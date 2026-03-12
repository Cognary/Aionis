# Aionis Lite Internal Alpha Dogfood

Date: `2026-03-12`
Branch baseline:

1. first pass: `main@1561a10`
2. second pass: `main@000dd37`
3. third pass: `main@833bc6e`

## Summary

Two internal alpha dogfood passes were run against a real local Lite process started with `npm run -s start:lite`.

Current conclusion:

1. Lite startup and health reporting are in good shape.
2. Fresh-write recallability is now restored in a real Lite process.
3. Replay lifecycle is now restored in a real Lite process.
4. Pack export/import remains usable as the Lite-to-Server bridge.
5. A repeatable real-process dogfood script is now green on `main`.
6. The main remaining frictions are operator polish, not kernel bring-up.

## Environment

Primary second-pass command:

- `PORT=3317 DATABASE_URL= ADMIN_TOKEN=dogfood-admin npm run -s start:lite`

Confirmed health surface:

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`

## First Pass Findings

The first pass established:

1. startup and `/health` were good
2. write and pack routes were usable
3. fresh-write `recall_text -> planning/context` discoverability was weak
4. replay lifecycle still failed in a real Lite process

The first-pass replay blocker was:

- `TypeError: client.query is not a function`

That finding was real and was not a false alarm.

## Second Pass Findings

The second pass was rerun after the Lite replay write-path fix and the inline embedding backfill fix.

### 1. Startup and health remain good

Lite still starts cleanly through the public startup path and reports the correct runtime backend.

This remains the strongest proof that Lite is now a real local operator path rather than a test-only profile.

### 2. Fresh-write recallability is fixed

Fresh writes now become recallable without an external worker.

Observed second-pass behavior:

1. `/v1/memory/write` returned `200`
2. response warnings included `lite_embedding_backfill_completed_inline`
3. `/v1/memory/recall_text` immediately returned `seed_count = 1`
4. `/v1/memory/planning/context` returned non-zero `context_est_tokens`
5. `/v1/memory/context/assemble` also returned non-zero `context_est_tokens`

Interpretation:

1. the previous Lite recall/context usability gap is no longer the main alpha blocker
2. inline embedding backfill is sufficient for the current Lite local envelope

### 3. Replay lifecycle is fixed

The previous real-process replay blocker is now gone.

Observed second-pass behavior:

1. `/v1/memory/replay/run/start` returned `200`
2. `/v1/memory/replay/step/before` returned `200`
3. `/v1/memory/replay/step/after` returned `200`
4. `/v1/memory/replay/run/end` returned `200`
5. `/v1/memory/replay/runs/get` returned `200`
6. the retrieved run status was `success`
7. the retrieved step count was `1`

Interpretation:

1. the prior `client.query`-shaped runtime assumption has been removed from the Lite replay lifecycle path
2. Lite replay is now viable in operator-mode dogfooding, not just in smoke tests

### 4. Pack bridge still works

The Lite-to-Server pack bridge still works in a real Lite process.

Observed behavior:

1. `/v1/memory/packs/export` returned `200`
2. `/v1/memory/packs/import` returned `200`
3. the imported pack matched the locally exported envelope

This remains one of the most important practical Lite properties.

### 5. Inspection semantics are usable, with an important note

`find` works in Lite, but visibility semantics matter.

Observed behavior:

1. shared-lane writes were immediately visible through `/v1/memory/find`
2. private-lane writes were not visible through `find` without consumer identity

This is not a persistence failure.

It reflects the current fail-closed visibility rules on the Lite inspection path.

For dogfooding conclusions, this means:

1. operator workflows should use shared-lane examples unless consumer identity is part of the scenario
2. any perceived `find` regression must be checked against memory-lane visibility first

## Third Pass Findings

The third pass reran the canonical script path after publishing Lite operator notes.

Command:

- `npm run -s lite:dogfood`

Observed behavior:

1. the script completed with `ok = true`
2. all HTTP checks returned `200`
3. fresh write still returned `lite_embedding_backfill_completed_inline`
4. `find` returned one shared-lane node
5. `recall_text`, `planning/context`, and `context/assemble` all remained non-empty
6. pack export/import remained green
7. replay lifecycle remained green

Artifact:

- [dogfood_20260312_114014](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_114014)

Interpretation:

1. the canonical dogfood workflow is now stable on current `main`
2. publishing operator guidance did not reveal a new Lite runtime regression

## Remaining Frictions

### 1. Pack operator friction remains

Pack routes still require an admin token even when Lite otherwise runs with auth disabled.

This is acceptable for alpha, but it still creates local friction because the operator must know:

1. `ADMIN_TOKEN` must be set at startup
2. the request header is `X-Admin-Token`
3. export returns an envelope whose nested `pack` is what import expects

### 2. `node:sqlite` is still experimental

The runtime warning remains visible during Lite startup.

This is acceptable for alpha, but should remain explicit in operator-facing notes.

### 3. Dogfood should be repeatable

The second pass confirmed that ad hoc manual verification is now strong enough to justify a reusable operator workflow.

To reduce drift, the repository now includes:

- `npm run -s lite:dogfood`

Public operator guidance now also exists at:

1. [Lite Operator Notes (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/04-lite-operator-notes.md)
2. [Lite 运维说明 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/04-lite-operator-notes.md)

That script exercises the same real-process workflow:

1. startup
2. health
3. write
4. find
5. recall_text
6. planning/context
7. context/assemble
8. pack export/import
9. replay lifecycle

## Current Recommendation

Short-term recommendation:

1. treat Lite as a valid internal alpha local edition
2. stop describing replay lifecycle and fresh-write recallability as open alpha blockers
3. shift the next phase from kernel bring-up to operator polish and beta-gate definition

## Suggested Next Actions

1. improve Lite operator guidance for pack routes and admin token usage
2. tighten the public Lite onboarding text around memory-lane visibility
3. define a Lite beta gate centered on startup UX, troubleshooting, and repeated dogfood success
4. keep using `npm run -s lite:dogfood` as the canonical internal validation path
