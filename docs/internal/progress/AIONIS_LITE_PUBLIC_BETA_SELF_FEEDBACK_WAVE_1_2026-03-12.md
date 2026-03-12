# Aionis Lite Public Beta Self-Feedback Wave 1

Date: `2026-03-12`
Status: `completed`

Related:

1. [AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_READINESS_2026-03-12.md)
2. [AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md)
3. [AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DOGFOOD_2026-03-12.md)
4. [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)
5. [Lite 排障与反馈 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md)

## Goal

Run a small first-party Lite beta wave as if it were external feedback intake, using both the standard scripted dogfood path and a manual public-beta-style API path.

## Executed Paths

1. Scripted dogfood:
   [dogfood_20260312_134530](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_134530)
2. Manual public-beta-style path:
   [public_beta_manual_20260312_134610](/Users/lucio/Desktop/Aionis/artifacts/lite/public_beta_manual_20260312_134610)

## Coverage

Both paths exercised these Lite beta flows:

1. `start:lite`
2. `/health`
3. `memory/write`
4. `memory/find`
5. `memory/recall_text`
6. `memory/planning/context`
7. `memory/context/assemble`
8. `memory/packs/export`
9. `memory/packs/import`
10. replay lifecycle:
    `run/start -> step/before -> step/after -> run/end -> runs/get`

## Result

Overall result: `pass`

Both paths completed the expected Lite beta workflow successfully.

Confirmed:

1. `/health` reported `aionis_edition = "lite"` and `memory_store_backend = "lite_sqlite"`
2. fresh writes were visible through `find`
3. fresh writes were discoverable through `recall_text`
4. `planning/context` and `context/assemble` returned valid context output
5. `packs export/import` worked with admin token auth
6. replay lifecycle completed successfully

## Important Observation

The manual-path ad hoc summarizer initially reported a false failure. The Lite runtime behavior was correct; the temporary summarizer was reading older top-level fields instead of the current response contract:

1. `write.warnings` now carries structured warning objects, not only flat strings
2. `recall_text` content is nested under `context.text`
3. `planning/context` and `context/assemble` expose the useful compact signal via `planning_summary`, `assembly_summary`, and nested context structures

This is not a Lite product regression. It is a reminder that beta validation tooling should read the current contract shape, not stale shortcuts.

## Feedback Summary

Self-run beta feedback from this wave:

1. Lite beta core flows are stable enough for continued controlled public beta intake
2. Operator guidance remains directionally correct
3. Internal ad hoc verification scripts should prefer current summary fields over legacy top-level shortcuts

## Next Step

1. keep collecting real external `lite-beta-feedback` issues
2. rerun `job:lite-public-beta-feedback-wave` after external reports arrive
3. if repeated operator confusion appears around response shape, add a short note to internal beta validation guidance rather than changing the public product boundary
