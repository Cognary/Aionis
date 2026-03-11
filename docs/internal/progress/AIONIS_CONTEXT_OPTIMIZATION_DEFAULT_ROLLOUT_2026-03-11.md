---
title: "Aionis Context Optimization Default Rollout"
---

# Aionis Context Optimization Default Rollout

Date: `2026-03-11`  
Status: `evidence_backed_for_seeded_workload`

Related:

1. [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md)
3. [/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v1_20260311_1540](/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v1_20260311_1540)
4. [/Users/lucio/Desktop/Aionis/artifacts/perf/CONTEXT_OPTIMIZATION_ROLLOUT_GATE_V1_20260311.md](/Users/lucio/Desktop/Aionis/artifacts/perf/CONTEXT_OPTIMIZATION_ROLLOUT_GATE_V1_20260311.md)
5. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_CONTEXT_OPTIMIZATION_ROLLOUT_NOTE_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_CONTEXT_OPTIMIZATION_ROLLOUT_NOTE_2026-03-11.md)

## Executive Summary

The first endpoint-default rollout benchmark for `context_optimization_profile=aggressive` is now complete.

For the seeded `perf_cost_wave_a` workload, server-side endpoint defaults preserved the same token reduction already observed under request-level opt-in and did not introduce a p95 context-assembly regression in this run.

This is enough evidence to keep endpoint-default rollout on the table for context-side optimization. It is not yet evidence for a wider mode-level default.

That conclusion is now also machine-checked by the first rollout-gate artifact.

## Benchmark Setup

Local benchmark API process:

1. code source: current local `main`
2. backend: local Postgres
3. auth mode: `off`
4. embedding provider: `fake`
5. port: `3031`

Relevant env defaults:

1. `MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT=aggressive`
2. `MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT=aggressive`

Benchmark command shape:

1. `job:perf-benchmark`
2. `mode=recall`
3. `optimization-check=true`
4. `optimization-profile=aggressive`
5. `optimization-request-mode=inherit_default`
6. `optimization-token-budget=600`
7. `optimization-char-budget=1800`
8. `optimization-samples=12`
9. scope: `perf_cost_wave_a`

Artifacts:

1. broad-semantic slice:
   - benchmark JSON: [/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v1_20260311_1540/benchmark_1.json](/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v1_20260311_1540/benchmark_1.json)
   - report: [/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v1_20260311_1540/PERFORMANCE_REPORT_V1.md](/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v1_20260311_1540/PERFORMANCE_REPORT_V1.md)
2. dense-edge slice:
   - benchmark JSON: [/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v2_dense_edge_20260311_1608/benchmark_1.json](/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v2_dense_edge_20260311_1608/benchmark_1.json)
   - report: [/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v2_dense_edge_20260311_1608/PERFORMANCE_REPORT_V1.md](/Users/lucio/Desktop/Aionis/artifacts/perf/context_opt_default_aggressive_v2_dense_edge_20260311_1608/PERFORMANCE_REPORT_V1.md)

## Key Results

### Broad-Semantic Slice

Query:

1. `prepare production deploy context`

Optimization source proof:

1. `optimization_profile_source_frequency.endpoint_default = 12`
2. request mode was `inherit_default`

Context-size delta:

1. estimated token reduction mean: `28.04%`
2. baseline context p95: `189` tokens
3. optimized context p95: `136` tokens

Latency delta:

1. baseline context-assemble p95: `666.02ms`
2. optimized context-assemble p95: `648.72ms`
3. p95 delta: `-17.30ms`

Other observations:

1. `within_token_budget_ratio = 100%`
2. `optimization_profile_applied_ratio = 100%`
3. `static_blocks_selected mean = 2`
4. `forgotten_items mean = 0`

### Dense-Edge Slice

Query:

1. `dense edge relationship recall`

Optimization source proof:

1. `optimization_profile_source_frequency.endpoint_default = 12`
2. request mode was `inherit_default`

Context-size delta:

1. estimated token reduction mean: `28.04%`
2. baseline context p95: `189` tokens
3. optimized context p95: `136` tokens

Latency delta:

1. baseline context-assemble p95: `611.42ms`
2. optimized context-assemble p95: `574.37ms`
3. p95 delta: `-37.06ms`

Other observations:

1. `within_token_budget_ratio = 100%`
2. `optimization_profile_applied_ratio = 100%`
3. `static_blocks_selected mean = 2`
4. `forgotten_items mean = 0`

## Interpretation

The current reading should stay narrow and precise:

1. endpoint-default rollout is now evidence-backed across two query classes on the seeded workload
2. the evidence is specifically for `planning/context` and `context/assemble`
3. this supports the rollout path `request opt-in -> endpoint default`
4. this still does not justify a wider global default beyond the covered endpoints and benchmarked classes

The most important practical result is that endpoint-default rollout no longer depends on caller discipline to pass `context_optimization_profile` on every request.

## Recommendation

Recommended next move:

1. keep endpoint-default rollout available for context endpoints
2. use the same benchmark shape on at least one additional seeded workload before treating `aggressive` as broadly safe
3. do not widen this to automatic recall-policy defaults; those remain a separate policy problem

## Rollout Gate

The first machine-checkable rollout gate is now part of this evidence path.

Current intended usage:

1. supply multiple `optimization_request_mode=inherit_default` benchmark artifacts
2. require `endpoint_default` as the recorded optimization source
3. require token-reduction and latency thresholds to hold for each artifact
4. only then recommend endpoint-default rollout

Current gate result:

1. verdict: `pass`
2. artifact count: `2`
3. median token reduction mean: `28.04%`
4. median latency p95 delta: `-27.18ms`
5. recommendation: endpoint-default rollout is evidence-backed for the evaluated context endpoints and benchmarked query classes

## Operational Rollout Shape

The current recommended operational shape is intentionally narrow:

1. apply endpoint defaults only for `planning/context` and `context/assemble`
2. use managed env preset `aggressive_endpoint_defaults`
3. keep automatic recall-policy rollout out of scope
4. keep one-command rollback available via `off`

## Working Conclusion

The current endpoint-default rollout evidence supports this statement:

`Aionis can now promote context-side optimization from request opt-in to endpoint defaults across at least two benchmarked query classes without losing the seeded workload token-reduction win.`
