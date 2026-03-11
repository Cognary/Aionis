---
title: "Aionis Cost Delta Benchmark Run"
---

# Aionis Cost Delta Benchmark Run

Date: `2026-03-11`
Status: `wave_a_completed`

Related plan: [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_COST_DELTA_BENCHMARK_PLAN_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_COST_DELTA_BENCHMARK_PLAN_2026-03-11.md)

## What Was Run

Environment brought up locally with:

1. `docker compose up -d db migrate api`
2. API health confirmed on `http://localhost:3021/health`
3. source-scope bootstrap write inserted one client-supplied READY embedding into `scope=default`
4. `job:perf-seed` populated `scope=perf_cost_wave_a` with:
   - `10000` events
   - `100` topics
   - `20000` edges

## Artifact Directories

### Wave A Initial

Artifact dir:

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_20260311_130511](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_20260311_130511)

Outcome:

1. valid optimization artifact
2. recall benchmark polluted by `429`
3. kept as evidence of pipeline correctness, not as the preferred public snapshot

### Wave A Clean

Artifact dir:

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_clean_20260311_130904](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_clean_20260311_130904)

Outcome:

1. lower `429` rate than initial run
2. still not clean enough for external quoting

### Wave A Publishable

Artifact dir:

[/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012)

This is the preferred first public-facing artifact from this run.

## Preferred Wave A Metrics

Source files:

1. [/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012/benchmark_10000.json](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012/benchmark_10000.json)
2. [/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012/PERFORMANCE_REPORT_V1.md](/Users/lucio/Desktop/Aionis/artifacts/perf/cost_delta_wave_a_publishable_20260311_131012/PERFORMANCE_REPORT_V1.md)

Key measurements:

1. recall benchmark success rate: `36/36` (`0%` failures)
2. recall latency:
   - `p50=206.945ms`
   - `p95=523.3ms`
   - `p99=691.404ms`
3. context optimization delta:
   - estimated token reduction mean: `28.04%`
   - estimated token reduction p95: `28.04%`
   - baseline context token estimate p95: `189`
   - optimized context token estimate p95: `136`
4. optimization activation:
   - `within_token_budget_ratio=100%`
   - `optimization_profile_applied_ratio=100%`
   - `static_blocks_selected mean=2`
5. dominant savings levers:
   - `optimization_profile:aggressive`
   - `static_injection`
   - `aggressive_compaction`
   - `token_budget`
6. tradeoff observed:
   - `context assemble` optimization-path `p95` was slower than baseline in this run (`+367.57ms`)

## Interpretation

Wave A already proves a real and externally usable statement:

1. Aionis can reduce assembled context token volume by about `28%` on this seeded workload
2. the reduction was achieved with deterministic runtime controls that applied on every optimization sample
3. this specific run shows a latency tradeoff rather than a latency win

So the current claim should be:

`Aionis already demonstrates measurable context-cost reduction; the next benchmark wave should optimize the latency side of that tradeoff.`

## Next Steps

1. run a second publishable Wave A sweep with `balanced` vs `aggressive` optimization profile comparison
2. produce Wave B replay artifact using one representative promoted playbook
3. produce Wave C sandbox artifact in a sandbox-enabled environment
