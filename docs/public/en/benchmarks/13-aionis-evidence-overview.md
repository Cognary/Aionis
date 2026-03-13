---
title: "Aionis Evidence Overview"
---

# Aionis Evidence Overview

Last updated: `2026-03-13`

This page is the shortest public map of what Aionis has already proved, what is still internal-only, and what is currently neutral or mixed.

Use it when you want the current evidence boundary, not only architecture or product language.

## Status Legend

1. `public / proven`: documented public benchmark claim with reproducible artifacts
2. `internal / positive`: benchmarked internally with a positive result, but not yet promoted as a public marketing claim
3. `internal / mixed`: benchmarked internally with a real tradeoff
4. `internal / neutral`: benchmarked internally, but no measurable net gain is established

## Public / Proven

| Surface | Comparison | Result | Status | Source |
| --- | --- | --- | --- | --- |
| Cross-runtime handoff | `file_export` vs `aionis_handoff` | `33.33% -> 100%` success | `public / proven` | [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay) |
| Real GitHub repo handoff | `file_export` vs `aionis_handoff` on `pallets/click` | `0% -> 100%` success, with full repo/test scope preserved | `public / proven` | [Real GitHub Repo Handoff A/B](/public/en/benchmarks/10-real-repo-handoff-ab) |
| Real GitHub repo policy | `without policy` vs `with Aionis policy` on `pallets/click` | `0% -> 100%` success, with routing converging to `rg` and `pytest-focused` | `public / proven` | [Real GitHub Repo Policy A/B](/public/en/benchmarks/11-real-repo-policy-ab) |
| Strict replay | `baseline -> compile -> replay1 -> replay2` on `pallets/click` | `replay1 = 0 tokens`, `replay2 = 0 tokens` | `public / proven` | [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay) |
| Guided replay repair | guided replay smoke | repair spent `1063` total model tokens only when repair was invoked | `public / proven` | [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay) |
| L5 serving compaction | `balanced_serving` vs `aggressive_serving` | served payload chars dropped materially while benchmark facts stayed intact | `public / proven` | [L5 Serving-Side Compaction](/public/en/benchmarks/12-l5-serving-compaction) |

## Internal Compression-Layer Status

| Layer | Current reading | Strongest current signal | Status |
| --- | --- | --- | --- |
| `L1 distilled facts` | first stable public positive result | fact recall held while `planning/context` estimate dropped from `100 -> 45.33` on code corpus and `66 -> 34.67` on research corpus | `public / proven` |
| `L2 topic aggregation` | mixed but interpretable | code corpus improved from `41.33 -> 36` estimated tokens with fact recall held; research corpus improved fact recall from `0.703704 -> 1.0` but increased estimated tokens from `34.89 -> 50.67` | `internal / mixed` |
| `L3 deterministic compression` | valid benchmark, no measured gain | fact recall and token estimate stayed flat against `L2` in current fixtures | `internal / neutral` |
| `L4 semantic abstraction` | opt-in serving path exists, but no measured gain yet | `L4` can enter `selected_memory_layers`, but current result remains neutral and slightly heavier | `internal / neutral` |
| `L5 serving compaction` | public exploratory result | facts preserved while served payload chars shrank materially | `public / proven` |

## What Aionis Can Honestly Claim Today

1. Aionis handoff preserves external execution contracts across process and runtime boundaries.
2. Aionis policy can measurably change real-repo tool routing and keep execution on a focused path.
3. Aionis strict replay can execute as a zero-model-token deterministic path under the documented mode.
4. Aionis guided replay separates deterministic replay from model-assisted repair, and makes repair cost visible.
5. Aionis compression evidence is strongest today at `L1` and `L5`, while `L2-L4` still need narrower claims.

## What Aionis Should Not Overclaim Yet

1. `L2` is not yet a universal token-win layer.
2. `L3` is not yet a proven positive deterministic compression layer.
3. `L4` is not yet a proven public serving gain layer.
4. `L5` is not yet a proven `context_est_tokens` reduction layer; it is currently a served-payload reduction layer.

## Read Next

1. [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay)
2. [Task Handoff and Recover Semantics](/public/en/benchmarks/08-task-handoff-and-recover)
3. [Policy Tool Selection and Feedback Loop](/public/en/benchmarks/09-policy-tool-selection)
4. [Real GitHub Repo Handoff A/B](/public/en/benchmarks/10-real-repo-handoff-ab)
5. [Real GitHub Repo Policy A/B](/public/en/benchmarks/11-real-repo-policy-ab)
6. [L5 Serving-Side Compaction](/public/en/benchmarks/12-l5-serving-compaction)
7. [Layer 1 Capability Matrix](/public/en/benchmarks/14-layer1-capability-matrix)
8. [L1 Distilled Facts](/public/en/benchmarks/15-l1-distilled-facts)
