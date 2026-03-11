---
title: "Aionis Recall Policy Status"
---

# Aionis Recall Policy Status

Date: `2026-03-11`  
Status: `policy_not_yet_converged`

Related documents:

1. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_ANN_STAGE1_PROFILE_COMPARE_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_ANN_STAGE1_PROFILE_COMPARE_2026-03-11.md)
3. [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md)

## Executive Summary

Aionis is not failing.

The current evidence shows something narrower and more actionable:

1. the kernel architecture is already established
2. the cost-reduction mechanisms are already real
3. the recall default policy is not yet converged

The current bottleneck is therefore not `whether Aionis works`, but `how Aionis should choose recall behavior by workload class`.

## What Is Already Established

### 1. Kernel Status

The runtime kernel is already established.

Evidence:

1. `/src/index.ts` has been reduced to a thin bootstrap entrypoint
2. host, runtime services, routes, and kernel-facing surfaces now have explicit boundaries
3. dependency-direction checks and kernel contract checks are already machine-enforced

This means Aionis is no longer a loose collection of capabilities.

### 2. Cost-Reduction Mechanisms

The main cost levers are already implemented in production code:

1. deterministic replay gating and dispatch
2. forgetting policy in layered context assembly
3. selective static injection
4. write-time distillation
5. tool-result summarization
6. context optimization profiles

This means Aionis already has working runtime controls for:

1. less repeated primary-model reasoning
2. less low-value context injection
3. less raw tool-output consumption on hot paths

### 3. Benchmark Evidence

Real benchmark artifacts already show measurable value.

Most importantly:

1. context optimization has already produced a real token-reduction delta on the seeded workload
2. replay/context/sandbox surfaces now expose machine-readable cost signals
3. ANN benchmarking is now good enough to compare recall profiles by query and by retrieval breadth

So the system has moved past architecture-only claims.

## What Is Not Yet Converged

### Recall Default Policy

The main unresolved issue is recall-profile convergence.

Current ANN evidence shows:

1. `lite` often wins on raw stage-1 ANN latency
2. `quality_first` often wins on retrieval breadth
3. `strict_edges` can look like a balanced candidate on some slices
4. `legacy` still wins some sparse or broader semantic queries
5. rankings shift with query mix

That means one important assumption does not currently hold:

`one static recall default profile is sufficient`

It is not sufficient yet.

## What This Does And Does Not Mean

### What It Means

1. Aionis needs workload-aware recall policy
2. profile selection should eventually depend on query shape or task class
3. benchmark methodology now needs a stable query taxonomy, not ad hoc query batches

### What It Does Not Mean

1. it does not mean Aionis is invalid
2. it does not mean the cost-reduction architecture failed
3. it does not mean recall is random or unusable
4. it does not mean Lite or broader roadmap work was a mistake

It only means the policy layer is now the limiting factor.

## Current Best Reading Of The Evidence

The safest current interpretation is:

1. `lite` is the raw-latency floor reference
2. `quality_first` is the broad-recall reference
3. `strict_edges` is still a balanced candidate, but not yet a justified default
4. `legacy` cannot yet be fully retired from comparison

So Aionis is now in a policy-selection phase, not a mechanism-invention phase.

## Main Risk

The main near-term risk is narrative overreach.

If Aionis now publicly claims a single recommended recall default without workload qualification, the current evidence does not fully support that claim.

The technically correct message is narrower:

`Aionis has working cost-aware recall controls, but its best default recall policy still depends on workload shape.`

## Recommended Next Step

The next step should not be another arbitrary profile sweep.

It should be a query-taxonomy benchmark phase:

1. classify benchmark queries into:
   - sparse-hit
   - broad semantic
   - dense-edge
   - workflow path
2. freeze a small canonical query set for each class
3. rerun ANN profile comparison per class
4. only then propose:
   - a global default
   - or a workload-aware policy selector

## Working Conclusion

The correct current conclusion is:

`Aionis is already architecturally and functionally valid as a cost-aware runtime kernel.`

`The largest unresolved problem is not kernel validity, but recall policy convergence.`
