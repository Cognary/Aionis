---
title: "Aionis Selector Compare Status"
---

# Aionis Selector Compare Status

Date: `2026-03-11`  
Status: `experimental_not_default`

Related:

1. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_RECALL_POLICY_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_RECALL_POLICY_STATUS_2026-03-11.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md)
3. [/Users/lucio/Desktop/Aionis/src/jobs/fixtures/ann-query-taxonomy-v1.json](/Users/lucio/Desktop/Aionis/src/jobs/fixtures/ann-query-taxonomy-v1.json)

## What Landed

The first selector-evaluation loop is now in place.

Landed pieces:

1. request-level `recall_class_aware=true|false` override on:
   - `POST /v1/memory/recall_text`
   - `POST /v1/memory/planning/context`
   - `POST /v1/memory/context/assemble`
2. benchmark support for single-process selector comparison:
   - `npm run job:perf-benchmark -- --ann-selector-check true`
3. selector observability now includes:
   - `enabled`
   - `source`
   - `workload_class`
   - `profile`
   - `applied`
   - `reason`

This means selector-vs-static comparison no longer requires two separate API processes.

## Artifacts

First single-process selector artifacts:

1. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_selector_compare_v1_20260311_145130](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_selector_compare_v1_20260311_145130)
2. [/Users/lucio/Desktop/Aionis/artifacts/perf/ann_selector_compare_v2_20260311_145503](/Users/lucio/Desktop/Aionis/artifacts/perf/ann_selector_compare_v2_20260311_145503)

## Current Reading

The right current conclusion is cautious:

1. selector comparison is now reproducible
2. selector `v1` is still experimental
3. evidence is not yet strong enough to enable selector-by-default

Observed behavior so far:

1. `dense_edge -> quality_first` consistently increases recall breadth
2. `workflow_path -> strict_edges` behaves like a no-op policy choice, but benchmark latency still shows noise
3. `broad_semantic -> legacy` remains mixed:
   - some slices reduce ANN latency
   - some slices narrow result breadth
4. `sparse_hit -> legacy` looked unsafe in the first compare run, so the mapping was tightened to `strict_edges`

## Current v1 Mapping

1. `dense_edge` -> `quality_first`
2. `workflow_path` -> `strict_edges`
3. `broad_semantic` -> `legacy`
4. `sparse_hit` -> `strict_edges`

## Why It Is Not Default Yet

Two things are true at the same time:

1. the selector mechanism is working
2. the policy is still noisy under repeated benchmark runs

That means the remaining problem is no longer implementation.

It is policy confidence.

## Next Step

The next useful step is not another one-off query batch.

It should be:

1. run at least `3` selector-compare artifacts against the same canonical taxonomy
2. aggregate median deltas per class:
   - recall p95
   - stage1 ANN p95
   - result nodes / edges
3. only after that decide whether:
   - `broad_semantic -> legacy` stays
   - `dense_edge -> quality_first` stays
   - selector can move from experimental to recommended
