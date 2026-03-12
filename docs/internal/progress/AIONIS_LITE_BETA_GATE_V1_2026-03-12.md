# Aionis Lite Beta Gate v1

Date: `2026-03-12`
Status: `passing`

Related:

1. [AIONIS_LITE_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_STATUS_2026-03-11.md)
2. [AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_ALPHA_RELEASE_MEMO_2026-03-12.md)
3. [AIONIS_LITE_INTERNAL_ALPHA_DOGFOOD_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_INTERNAL_ALPHA_DOGFOOD_2026-03-12.md)
4. [LITE_BETA_GATE_V1_20260312.md](/Users/lucio/Desktop/Aionis/artifacts/lite/LITE_BETA_GATE_V1_20260312.md)
5. [lite-beta-gate.ts](/Users/lucio/Desktop/Aionis/src/jobs/lite-beta-gate.ts)

## Purpose

Lite alpha gate proves repository capability.

Lite beta gate v1 adds a stricter question:

> Is Lite now stable enough, documented enough, and repeatedly validated enough to move beyond internal alpha posture?

This first beta gate is intentionally narrow.

It does not try to prove field hardening.

It only checks whether the repository has crossed the minimum threshold for:

1. repeatable local operator validation
2. public operator guidance
3. repeated successful dogfood evidence

## Current Gate Definition

`job:lite-beta-gate` currently checks:

1. `start:lite` exists
2. `lite:dogfood` exists
3. `job:lite-alpha-gate` exists
4. EN and ZH Lite operator notes exist
5. EN and ZH get-started / onboarding pages link to those operator notes
6. at least `3` successful real-process dogfood summaries exist
7. at least `3` stable dogfood summaries exist where:
   - Lite backend is `lite_sqlite`
   - inline backfill completed
   - replay finished successfully

## Current Result

Current artifact verdict:

1. `pass`

Current failing gates:

1. none

The repository now has three successful and stable script-level dogfood artifacts:

1. [dogfood_20260312_112412](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_112412)
2. [dogfood_20260312_114014](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_114014)
3. [dogfood_20260312_115851](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_115851)

## Interpretation

This is not a kernel-capability failure.

It means:

1. Lite alpha capability is strong enough
2. operator docs are now present
3. startup and dogfood path are repeatable
4. the current repository snapshot satisfies beta gate v1

So the current release posture can now move from:

1. `approved_for_internal_alpha`

to:

1. `beta_candidate_by_v1_gate`

## Immediate Next Step

Passing beta gate v1 should not immediately be interpreted as "ship broad beta".

The next phase should be:

1. decide whether v1 evidence is enough for a true Lite beta label
2. or whether beta gate v2 should add startup/troubleshooting UX checks beyond current script evidence
3. collect at least one more real operator-style run outside the canonical scripted path
