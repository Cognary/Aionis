# L5 Serving-Side Compaction Benchmark Plan

**Goal:** Measure whether serving-time compaction improves context efficiency without harming fact retention once lower memory layers are already stable.

**Scope:** This plan benchmarks `L5` as a serving/runtime behavior, not as a storage-derived memory layer. The comparison is between identical stored memory graphs served under different compaction policies.

## Benchmark Shape

Arms:
- baseline: `balanced` serving compaction
- treatment: `aggressive` serving compaction

Constant across both arms:
- same corpus
- same stored `L0 + L1 + L2 + L3` graph
- same query set
- same context budgets
- same allowed memory layers

Endpoints:
- `/v1/memory/recall_text`
- `/v1/memory/planning/context`
- `/v1/memory/context/assemble`

## Questions

1. Does aggressive serving compaction reduce `context_est_tokens`?
2. Does it preserve critical fact recall?
3. Does it alter selected memory layers or only reshape the final served payload?
4. Does it improve character footprint enough to justify any fact loss?

## Metrics

Primary:
- `fact_recall_rate`
- `context_est_tokens`
- `context_chars`

Secondary:
- `selected_memory_layers`
- `retrieved_memory_layers`
- endpoint-by-endpoint deltas

## Initial Interpretation Rules

Positive:
- fact recall holds within 0.0 to -0.05 absolute delta
- context estimate or context chars improve materially

Neutral:
- fact recall and payload are effectively unchanged

Negative:
- fact recall drops without meaningful payload reduction
- payload grows under aggressive serving

## Fixture Strategy

Two initial corpora:
- `click` code-style corpus
- `research` comparison corpus

Both fixtures should reuse the same `L0-L3` node shape already used by the `L3` benchmark so that the only variable is serving-side compaction.

## Output Contract

Artifacts:
- `cases.jsonl`
- `summary.json`
- `report.md`

The summary must include:
- arm names
- average fact recall rate
- average context token estimate
- average context chars
- selected/retrieved memory layers
- endpoint breakdown

## Decision Boundary

This benchmark is exploratory first.

Do not publish `L5` as a proven benefit unless at least one corpus shows:
- no material fact loss
- clear payload reduction

If results are mixed, keep `L5` internal and document the boundary explicitly.
