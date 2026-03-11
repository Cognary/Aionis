---
title: "Aionis Context Optimization Rollout Note"
---

# Aionis Context Optimization Rollout Note

Date: `2026-03-11`  
Status: `ready_for_controlled_enablement`

Related:

1. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_CONTEXT_OPTIMIZATION_DEFAULT_ROLLOUT_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_CONTEXT_OPTIMIZATION_DEFAULT_ROLLOUT_2026-03-11.md)
2. [/Users/lucio/Desktop/Aionis/artifacts/perf/CONTEXT_OPTIMIZATION_ROLLOUT_GATE_V1_20260311.md](/Users/lucio/Desktop/Aionis/artifacts/perf/CONTEXT_OPTIMIZATION_ROLLOUT_GATE_V1_20260311.md)
3. [/Users/lucio/Desktop/Aionis/scripts/env/apply-context-optimization-profile.sh](/Users/lucio/Desktop/Aionis/scripts/env/apply-context-optimization-profile.sh)

## Decision

The current recommendation is to allow controlled endpoint-default rollout for context optimization on:

1. `POST /v1/memory/planning/context`
2. `POST /v1/memory/context/assemble`

The approved rollout preset is:

1. `aggressive_endpoint_defaults`

This decision does not apply to:

1. recall-profile defaults
2. automatic class-aware recall selector rollout
3. any wider mode-level default outside the evaluated context endpoints

## Why This Is Approved

The current recommendation is backed by:

1. two endpoint-default benchmark artifacts
2. a passing machine rollout gate
3. one-command rollback to `off`

Current gate reading:

1. verdict: `pass`
2. median token reduction mean: `28.04%`
3. median latency p95 delta: `-27.18ms`

## Enablement Command

Apply the managed preset:

```bash
npm run -s env:context-optimization:aggressive-endpoint-defaults
```

This updates only the managed context-optimization block in `.env`.

## Rollback Command

Rollback is one command:

```bash
npm run -s env:context-optimization:off
```

## Operational Guardrails

Use this rollout only under these conditions:

1. keep the rollout scoped to context endpoints
2. do not simultaneously change recall-policy defaults
3. treat environment-specific latency regressions as rollback conditions
4. re-run the rollout gate if the benchmark fixture, token budgets, or endpoint behavior materially change

## Recommended Operator Sequence

1. confirm the current benchmark gate artifact is still the latest approved read
2. apply `aggressive_endpoint_defaults`
3. restart or reload the API process
4. confirm startup config logs show:
   - `memory_planning_context_optimization_profile_default=aggressive`
   - `memory_context_assemble_optimization_profile_default=aggressive`
5. if unexpected latency regression appears, revert with `env:context-optimization:off`

## Current Limitation

This note is intentionally narrower than a platform-wide default recommendation.

It only says:

`endpoint-default context optimization is ready for controlled enablement on the evaluated context endpoints.`
