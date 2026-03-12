# Aionis Lite Beta Gate v1

Date: `2026-03-12`
Status: `defined_not_passing`

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

1. `fail`

Current failing gates:

1. `repeated_successful_dogfood_present`
2. `repeated_stable_dogfood_present`

This is expected.

The repository currently has only two successful script-level dogfood artifacts:

1. [dogfood_20260312_112412](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_112412)
2. [dogfood_20260312_114014](/Users/lucio/Desktop/Aionis/artifacts/lite/dogfood_20260312_114014)

## Interpretation

This is not a kernel-capability failure.

It means:

1. Lite alpha capability is strong enough
2. operator docs are now present
3. startup and dogfood path are repeatable
4. but beta posture should still wait for one more clean repeated dogfood run

So the current release posture remains:

1. `approved_for_internal_alpha`
2. not yet `beta_ready`

## Immediate Next Step

The shortest path to a passing beta gate v1 is:

1. run one more clean `npm run -s lite:dogfood`
2. verify a third `dogfood_*/summary.json` appears and is fully green
3. rerun `npm run -s job:lite-beta-gate`

If that passes, the next phase should not be "declare beta immediately".

It should be:

1. decide whether repeated local dogfood is enough
2. or whether beta should also require startup/troubleshooting UX checks beyond current script evidence
