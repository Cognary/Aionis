# Lite Beta Gate v1

Generated at: `2026-03-12T03:59:07.362Z`

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
| repeated_successful_dogfood_present | pass |
| repeated_stable_dogfood_present | pass |

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
| dogfood_20260312_115851 | pass | pass | pass | pass |

## Verdict

- successful dogfood runs: 3
- stable dogfood runs: 3
- failing gates: none
- final verdict: pass

## Recommendations

- Lite beta gate v1 is satisfied for the current repository snapshot.
