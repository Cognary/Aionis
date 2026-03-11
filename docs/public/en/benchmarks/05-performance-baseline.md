---
title: "Performance Baseline"
---

# Performance Baseline

This page defines the reproducible performance baseline workflow for Aionis.

## What Is Measured

1. Recall latency (`p50/p95/p99`)
2. Write latency (`p50/p95/p99`)
3. Error rates by endpoint category
4. Optional worker throughput metrics
5. Optional context-optimization cost signals (`context/assemble` baseline vs optimized)
6. Optional replay-optimization signals (`playbooks/candidate` + `playbooks/dispatch`)
7. Optional summary-first sandbox signals (`sandbox/execute` + `runs/get|logs|artifact`)
8. Optional ANN stage1 profile comparison signals (`recall_text` across recall profiles, including per-query and per-class breakdown)

## Preconditions

```bash
set -a; source .env; set +a
make db-migrate
```

Run API and worker:

```bash
npm run dev
npm run job:outbox-worker
```

## Seed Benchmark Dataset

```bash
npm run job:perf-seed -- \
  --scope perf \
  --tenant-id default \
  --src-scope default \
  --src-tenant-id default \
  --events 100000 \
  --topics 1000 \
  --reset
```

## Run Benchmark

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode all
```

Or one-command matrix:

```bash
npm run perf:production-matrix
```

Add context optimization evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --optimization-check true \
  --optimization-profile aggressive \
  --optimization-request-mode explicit \
  --optimization-samples 12
```

To benchmark endpoint-default rollout instead of request-level opt-in:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --optimization-check true \
  --optimization-profile aggressive \
  --optimization-request-mode inherit_default \
  --optimization-samples 12
```

Use this against an API process started with endpoint defaults such as `MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT` or `MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT`.

Add replay optimization evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --replay-check true \
  --replay-playbook-id "<playbook_uuid>" \
  --replay-gate-matchers '{"tool":"kubectl"}' \
  --replay-gate-policy-constraints '{"risk_profile":"low"}' \
  --replay-samples 12
```

Add summary-first sandbox evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --sandbox-check true \
  --sandbox-argv-json '["echo","hello from sandbox benchmark"]' \
  --sandbox-samples 8
```

Add ANN-focused evidence to the benchmark artifact:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --ann-check true \
  --ann-profiles strict_edges,quality_first,lite \
  --ann-query-texts-json '["memory graph perf","prepare production deploy context"]' \
  --ann-samples 8
```

Or classify ANN queries by workload shape:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --ann-check true \
  --ann-profiles legacy,strict_edges,quality_first,lite \
  --ann-query-spec-json '[{"text":"dense edge relationship recall","class":"dense_edge"},{"text":"broad semantic memory context","class":"broad_semantic"},{"text":"one-off unique phrase no match","class":"sparse_hit"},{"text":"edge-heavy deployment rollback path","class":"workflow_path"}]' \
  --ann-samples 6
```

Or load a checked-in taxonomy fixture:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --ann-check true \
  --ann-profiles legacy,strict_edges,quality_first,lite \
  --ann-query-spec-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/ann-query-taxonomy-v1.json \
  --ann-samples 6
```

Compare static recall against request-level class-aware selection inside one API process:

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --ann-selector-check true \
  --ann-query-spec-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/ann-query-taxonomy-v1.json \
  --ann-samples 6
```

Aggregate repeated selector-compare runs:

```bash
npm run job:perf-selector-aggregate -- \
  --dirs-json '["/path/to/ann_selector_compare_v1","/path/to/ann_selector_compare_v2","/path/to/ann_selector_compare_v3"]'
```

Evaluate whether repeated selector evidence is strong enough for default rollout:

```bash
npm run job:perf-selector-rollout-gate -- \
  --aggregate-json /path/to/SELECTOR_COMPARE_AGGREGATE.json
```

If this gate fails, keep automatic selector rollout experimental and prefer explicit opt-in policy modes for the classes that still have evidence-backed upside.

Evaluate whether endpoint-default context optimization rollout is strong enough from multiple artifacts:

```bash
npm run job:perf-context-rollout-gate -- \
  --benchmark-files-json '["/path/to/context_opt_default_a/benchmark_1.json","/path/to/context_opt_default_b/benchmark_1.json"]'
```

Use this gate only for endpoint-default context rollout. It expects `optimization_request_mode=inherit_default` evidence and checks that `endpoint_default` was the actual optimization source.

If the gate passes, the corresponding local env helper is:

```bash
npm run -s env:context-optimization:aggressive-endpoint-defaults
```

This rollout recommendation is intentionally narrower than a global runtime default. It only covers endpoint-default context optimization on the evaluated endpoints.

## Output Fields

1. `latency_ms.p50/p95/p99`
2. `rps`
3. `failed`
4. `by_status`
5. optional `optimization.summary.*` for estimated token reduction, forgotten items, static-block selection, and `context/assemble` p95 delta
6. optional `replay.*` for deterministic eligibility ratio, dispatch decision mix, primary-inference-skipped ratio, and `result_summary` coverage
7. optional `sandbox.*` for `result_summary` coverage across `execute/get/logs/artifact` and endpoint latency percentiles
8. optional `ann.*` for `stage1_candidates_ann_ms`, ANN seed counts, final seed counts, recall latency by recall profile, query, and workload class, plus selector-vs-static aggregates under `ann.selector_compare`

## Starter SLO Guidance

1. Recall p95: team-defined threshold
2. Write p95: team-defined threshold
3. Error rate: below release gate threshold

## Artifacts

`artifacts/perf/<run_id>/`

## Related

1. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [AionisBench v0.1](/public/en/benchmarks/06-aionis-bench-v01)
