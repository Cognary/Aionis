---
title: "Aionis Cost Delta Aggressive Budget Sweep"
---

# Aionis Cost Delta Aggressive Budget Sweep

Date: `2026-03-11`
Status: `completed`

## Purpose

After the first `aggressive` Wave A artifact showed real token reduction but a noticeable latency penalty, the next question was:

`Is the current tradeoff mostly caused by the token budget threshold itself?`

To answer that, the same run shape was repeated with three `optimization_token_budget` values:

1. `600`
2. `900`
3. `1200`

## Compared Artifacts

### Aggressive 600

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012)

### Aggressive 900

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_aggressive_budget_900_20260311_131813](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_aggressive_budget_900_20260311_131813)

### Aggressive 1200

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_aggressive_budget_1200_20260311_131902](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_aggressive_budget_1200_20260311_131902)

## Shared Run Shape

All three runs used:

1. `scope=perf_cost_wave_a`
2. same seeded graph: `10000` events / `100` topics / `20000` edges
3. same recall benchmark shape:
   - `recall_requests=36`
   - `recall_concurrency=1`
   - `pace_ms=250`
4. same optimization sampling:
   - `optimization_profile=aggressive`
   - `optimization_samples=24`
   - `optimization_char_budget=1800`
   - query: `"prepare production deploy context"`

## Comparison Table

| Metric | Budget 600 | Budget 900 | Budget 1200 |
| --- | ---: | ---: | ---: |
| Recall fail rate | `0%` | `0%` | `0%` |
| Recall p50 | `206.945ms` | `184.158ms` | `249.437ms` |
| Recall p95 | `523.3ms` | `892.935ms` | `437.751ms` |
| Recall p99 | `691.404ms` | `1440.178ms` | `472.179ms` |
| Estimated token reduction mean | `28.04%` | `28.04%` | `28.04%` |
| Optimized context token estimate p95 | `136` | `136` | `136` |
| Static blocks selected mean | `2` | `2` | `2` |
| Context assemble p95 delta | `+367.57ms` | `+197.03ms` | `+228.16ms` |

## Main Finding

For this workload, increasing the aggressive token budget from `600` to `900` or `1200` did **not** change the context-size outcome:

1. estimated token reduction stayed at `28.04%`
2. optimized context token estimate p95 stayed at `136`
3. static block selection stayed at `2`

That means the current size reduction is being driven primarily by:

1. aggressive compaction behavior
2. static block selection
3. the current query/workload shape

It is **not** being driven by the exact `600 vs 900 vs 1200` token budget threshold.

## Practical Interpretation

This sweep reduces uncertainty in the next engineering decision:

1. raising the token budget alone is unlikely to preserve the same reduction while eliminating the latency penalty
2. the next useful lever is not another budget number
3. the next useful lever is reducing optimization-path latency directly

## Recommended Next Step

Do not keep sweeping token budget first.

Instead:

1. inspect `context_assemble` latency breakdown under aggressive mode
2. separate time spent in recall, static selection, and compaction
3. optimize the aggressive path itself before running more public-facing sweeps
