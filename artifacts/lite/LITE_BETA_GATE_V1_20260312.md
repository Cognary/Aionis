# Lite Beta Gate v1

Generated at: `2026-03-12T03:47:24.998Z`

## Inputs

- package.json: `/Users/lucio/Desktop/Aionis/package.json`
- min successful/stable dogfood runs: `3`

## Gate Summary

| Gate | Status |
| --- | --- |
| startup_packaging_present | pass |
| dogfood_script_present | pass |
| alpha_gate_present | pass |
| operator_docs_present | pass |
| onboarding_links_operator_docs | pass |
| repeated_successful_dogfood_present | fail |
| repeated_stable_dogfood_present | fail |

## Public Operator Docs

| Document | Status |
| --- | --- |
| docs/public/en/getting-started/04-lite-operator-notes.md | pass |
| docs/public/zh/getting-started/04-lite-operator-notes.md | pass |
| docs/public/en/getting-started/01-get-started.md | pass |
| docs/public/en/getting-started/02-onboarding-5min.md | pass |
| docs/public/zh/getting-started/01-get-started.md | pass |
| docs/public/zh/getting-started/02-onboarding-5min.md | pass |

## Real-Process Dogfood Evidence

| Dogfood Run | ok | backend | inline_backfill | replay |
| --- | --- | --- | --- | --- |
| dogfood_20260312_112412 | pass | pass | pass | pass |
| dogfood_20260312_114014 | pass | pass | pass | pass |

## Verdict

- successful dogfood runs: 2
- stable dogfood runs: 2
- failing gates: repeated_successful_dogfood_present, repeated_stable_dogfood_present
- final verdict: fail

## Recommendations

- Run more real-process Lite dogfood passes until at least 3 successful and stable summaries exist under artifacts/lite/dogfood_*/summary.json.
