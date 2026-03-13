---
title: "L5 Serving-Side Compaction"
---

# L5 Serving-Side Compaction

Last updated: `2026-03-13`

This page documents the first public exploratory result for `L5`, the serving-side compaction layer.

`L5` is not a storage-derived memory layer. It changes how already selected memory is served under runtime compaction policies.

## Scope Statement

This disclosure covers:

1. The same stored `L0 + L1 + L2 + L3` memory graph
2. The same queries and context budgets
3. Two serving policies:
   - `balanced_serving`
   - `aggressive_serving`

This page does **not** claim that `L5` currently reduces `context_est_tokens`.

## Public Claim

### L5 currently reduces served payload size without dropping benchmark facts

Corpora:

1. `click` code-style corpus
2. `research` comparison corpus

| Corpus | Arm | Avg fact recall rate | Avg context est tokens | Avg context chars |
| --- | --- | --- | --- | --- |
| `click` | `balanced_serving` | `1.0` | `37.333333` | `902.666667` |
| `click` | `aggressive_serving` | `1.0` | `37.333333` | `454.0` |
| `research` | `balanced_serving` | `1.0` | `50.666667` | `955.333333` |
| `research` | `aggressive_serving` | `1.0` | `50.666667` | `506.666667` |

Most of the reduction appears in `context_assemble`:

| Corpus | Arm | `context_assemble` chars |
| --- | --- | --- |
| `click` | `balanced_serving` | `2260` |
| `click` | `aggressive_serving` | `914` |
| `research` | `balanced_serving` | `2260` |
| `research` | `aggressive_serving` | `914` |

Interpretation:

1. `L5` is now benchmarkable and produces a real serving-path difference.
2. In the current fixtures, `aggressive` serving preserves fact recall.
3. The measurable gain is served payload reduction, not lower `context_est_tokens`.

The correct current product statement is:

> `L5` is a served-payload reduction layer, not yet a proven token-estimate reduction layer.

## Reproduce

Prerequisites:

1. A local Aionis Lite endpoint reachable at `http://127.0.0.1:3321`
2. Node.js `22+`
3. The benchmark harness committed in this repository

Run the code-style corpus:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l5-serving-compaction-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l5-serving-compaction-click-v1.json
```

Run the research-style corpus:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:l5-serving-compaction-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/l5-serving-compaction-research-v1.json
```

## Artifact Paths

1. `click`:
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l5-serving-compaction/20260313-213543-click-v1/`
2. `research`:
   `/Users/lucio/Desktop/Aionis/artifacts/benchmarks/l5-serving-compaction/20260313-213543-research-v1/`

## Non-claims

1. This is not yet evidence that `L5` improves `context_est_tokens`.
2. This is not yet evidence that `L5` improves answer quality beyond preserving benchmark facts.
3. This is not a claim about provider billing token reduction.

## Related

1. [Agent Handoff and Replay](/public/en/benchmarks/07-agent-handoff-and-replay)
2. [Real GitHub Repo Handoff A/B](/public/en/benchmarks/10-real-repo-handoff-ab)
3. [Real GitHub Repo Policy A/B](/public/en/benchmarks/11-real-repo-policy-ab)
