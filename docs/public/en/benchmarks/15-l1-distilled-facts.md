---
title: "L1 Distilled Facts"
---

# L1 Distilled Facts

Last updated: `2026-03-13`

This page documents the first public benchmark result for `L1 distilled facts`.

`L1` is the first compression layer above raw memory events and evidence.

The question is narrow:

**Can `L1` reduce planning-time context load without dropping benchmark facts?**

## Scope Statement

This disclosure compares:

1. `L0-only`
2. `L0 + L1`

It covers the following read paths:

1. `/v1/memory/recall_text`
2. `/v1/memory/planning/context`
3. `/v1/memory/context/assemble`

Corpora:

1. code-style corpus
2. research-style corpus

## Public Claim

### `L1` is now a public positive result for planning-time context reduction

#### Code corpus

| Arm | Avg fact recall rate | Avg planning/context est tokens |
| --- | --- | --- |
| `L0-only` | `1.0` | `100.0` |
| `L0 + L1` | `1.0` | `45.333333` |

Interpretation:

1. fact recall held flat
2. `planning/context` estimate dropped by about `54.7%`

#### Research corpus

| Arm | Avg fact recall rate | Avg planning/context est tokens |
| --- | --- | --- |
| `L0-only` | `0.555556` | `66.0` |
| `L0 + L1` | `0.555556` | `34.666667` |

Interpretation:

1. fact recall held flat
2. `planning/context` estimate dropped by about `47.5%`

## What This Proves

This benchmark shows:

1. `L1` can reduce planning-time context load relative to raw-event-only retrieval
2. the current benchmark facts can be preserved while doing so
3. the first useful compression step in Aionis is now publicly benchmarked

## What This Does Not Prove

This page does **not** claim:

1. that `L1` always reduces `context_assemble` payload size
2. that `L1` solves every long-context problem
3. that higher layers (`L2-L5`) are automatically positive

## Reproduce

Code corpus:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l1-distilled-facts-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l1-distilled-facts-click-v1.json
```

Research corpus:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l1-distilled-facts-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l1-distilled-facts-research-v1.json
```

## Artifact Paths

1. code corpus:
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l1-distilled-facts/20260313-205335/`
2. research corpus:
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l1-distilled-facts/20260313-205549/`

## Why This Matters

If `L1` were not reliable, later compression layers would not be trustworthy.

This page is the first public proof that Aionis can already make context lighter at the first compression step without weakening the benchmark facts used for planning.

## Related

1. [Aionis Evidence Overview](/public/en/benchmarks/13-aionis-evidence-overview)
2. [Layer 1 Capability Matrix](/public/en/benchmarks/14-layer1-capability-matrix)
3. [L5 Serving-Side Compaction](/public/en/benchmarks/12-l5-serving-compaction)
