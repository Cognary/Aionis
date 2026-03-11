---
title: "Aionis Cost Delta Profile Compare"
---

# Aionis Cost Delta Profile Compare

Date: `2026-03-11`
Status: `wave_a_profile_compare_completed`

Related run summary: [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_COST_DELTA_BENCHMARK_RUN_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_COST_DELTA_BENCHMARK_RUN_2026-03-11.md)

## Compared Artifacts

### Aggressive

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012)

### Balanced

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_balanced_20260311_131536](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_balanced_20260311_131536)

## Shared Run Shape

Both runs used:

1. same seeded scope: `perf_cost_wave_a`
2. same scale: `10000` events / `100` topics / `20000` edges
3. same recall benchmark shape:
   - `recall_requests=36`
   - `recall_concurrency=1`
   - `pace_ms=250`
4. same optimization sampling:
   - `optimization_samples=24`
   - `optimization_token_budget=600`
   - `optimization_char_budget=1800`
   - `optimization_query_text="prepare production deploy context"`

The only intentional difference was:

1. `context_optimization_profile=aggressive`
2. `context_optimization_profile=balanced`

## Comparison Table

| Metric | Aggressive | Balanced |
| --- | ---: | ---: |
| Recall fail rate | `0%` | `0%` |
| Recall p50 | `206.945ms` | `215.114ms` |
| Recall p95 | `523.3ms` | `869.319ms` |
| Recall p99 | `691.404ms` | `873.196ms` |
| Estimated token reduction mean | `28.04%` | `0%` |
| Estimated token reduction p95 | `28.04%` | `0%` |
| Baseline context token estimate p95 | `189` | `189` |
| Optimized context token estimate p95 | `136` | `189` |
| Within token budget ratio | `100%` | `100%` |
| Optimization profile applied ratio | `100%` | `100%` |
| Static blocks selected mean | `2` | `4` |
| Forgotten items mean | `0` | `0` |
| Context assemble p95 delta | `+367.57ms` | `+289.79ms` |

## What This Means

The comparison is useful because it separates:

1. “profile was applied”
2. “profile actually reduced token volume”

In this workload:

1. both profiles were applied successfully on every optimization sample
2. both profiles stayed within the configured token budget
3. only `aggressive` produced meaningful context-size reduction
4. `balanced` behaved more like a low-friction selection preset than a real cost-cutting profile

## Recommended External Framing

Use the `aggressive` artifact when making the first public cost-reduction claim.

Recommended claim shape:

1. On the seeded `Wave A` workload, Aionis reduced assembled context token estimate by about `28%`
2. The reduction came from deterministic runtime controls:
   - aggressive compaction
   - static injection
   - explicit token budgeting
3. The current implementation shows a latency tradeoff, so the next optimization target is p95 latency rather than token reduction itself

Do not use the `balanced` profile as the primary external proof point for token savings.

## Engineering Implication

The current preset semantics are now clearer:

1. `aggressive` is the real cost-cutting preset
2. `balanced` is currently more of a conservative orchestration preset

That means the next engineering step should not be “add more profiles”.

It should be:

1. reduce the latency penalty on `aggressive`
2. decide whether `balanced` should stay conservative or gain a small but measurable reduction target
