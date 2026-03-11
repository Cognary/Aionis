---
title: "Aionis Top 3 Gaps"
---

# Aionis Top 3 Gaps

Date: `2026-03-11`  
Status: `current_limitations_not_fatal`

Related:

1. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_AGENT_COST_REDUCTION_STATUS_2026-03-11.md)
2. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_RECALL_POLICY_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_RECALL_POLICY_STATUS_2026-03-11.md)
3. [/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_SELECTOR_COMPARE_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_SELECTOR_COMPARE_STATUS_2026-03-11.md)
4. [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md)

## Executive Summary

Aionis is not blocked by missing primitives anymore.

Its main current gaps are higher-level:

1. default policy convergence is incomplete
2. cost-reduction gains are not yet fully defaultized
3. benchmark-to-policy iteration is still slower than it should be

These are real defects, but they are not architecture-invalidating defects.

They mean:

`strong cost-aware runtime`  
is already true

while

`fully mature default cost-aware runtime`

is not true yet.

## Gap 1: Default Policy Convergence Is Incomplete

This is the largest current gap.

Aionis already has multiple cost-control mechanisms:

1. deterministic replay
2. forgetting policy
3. selective static injection
4. write-time distillation
5. summary-first execution
6. class-aware recall selector

The problem is not that these controls are absent.

The problem is that their best default behavior is not fully converged.

The clearest example is recall policy:

1. static profile ranking is workload-sensitive
2. class-aware selector `v1` works technically
3. repeated selector compare runs still do not justify default enablement

Why this matters:

1. Aionis is powerful, but not yet "default optimal"
2. external users may still need tuning or explicit opt-in modes
3. internal narrative must avoid overclaiming "automatic optimization"

Current reading:

1. kernel validity: established
2. policy maturity: still in progress

## Gap 2: Cost Gains Are Not Yet Fully Defaultized

Aionis can now produce real savings signals and real benchmark deltas.

But many gains still behave like:

1. available capability
2. caller-enabled feature
3. benchmark-proven slice

rather than:

1. stable default system behavior

Examples:

1. replay dispatch exists, but hit-rate still depends on workload shape and caller integration
2. context optimization profiles exist, but not all caller paths use them by default
3. selector exists, but should remain experimental
4. summary-first behavior is landed, but not yet on every high-value execution surface

Why this matters:

1. Aionis can truthfully say "we can reduce cost"
2. it cannot yet always say "the default path already gives the best cost outcome"

This is a product-quality gap, not a conceptual gap.

## Gap 3: Benchmark-To-Policy Loop Is Still Too Manual

Aionis now has a real measurement loop:

1. seeded benchmark datasets
2. taxonomy-based ANN comparisons
3. selector-vs-static comparison
4. repeated-run aggregation
5. internal progress memos and policy status documents

That is already materially better than informal tuning.

But the loop is still slower and more manual than an ideal runtime platform loop.

Current flow still looks like:

1. define a hypothesis
2. run artifacts
3. inspect JSON and markdown outputs
4. adjust policy
5. rerun benchmark
6. manually decide whether the evidence is strong enough

Why this matters:

1. policy convergence takes longer than it should
2. default tuning becomes more expensive than necessary
3. rollout confidence depends too much on manual review

This is not a missing-benchmark problem anymore.

It is a benchmark operationalization problem.

## What These Gaps Do Not Mean

These gaps do not mean:

1. Aionis failed as a runtime kernel
2. cost reduction is fake or only theoretical
3. replay/context/governance architecture was the wrong direction
4. Lite or broader product strategy should stop

The correct interpretation is narrower:

1. kernel architecture is established
2. cost-reduction mechanisms are established
3. default policy and rollout discipline are the current bottlenecks

## Priority Order

Current severity order:

1. default policy convergence
2. gain defaultization
3. benchmark-to-policy loop speed

If only one problem is addressed next, it should be:

`default policy convergence`

because it directly controls whether the existing mechanisms become reliable default behavior.

## Recommended Next Actions

### 1. Keep Automatic Recall Selector Experimental

Do not default-enable `MEMORY_RECALL_CLASS_AWARE_ENABLED`.

Near-term direction:

1. keep request-level `recall_class_aware` override
2. keep selector compare artifacts in place
3. treat `dense_edge -> quality_first` as the only mapping with a repeatable breadth upside
4. if needed, expose that as an explicit opt-in policy mode rather than a hidden automatic default

### 2. Convert Stronger Cost Levers Into More Opinionated Defaults

Prioritize defaults where evidence is stronger:

1. deterministic replay dispatch adoption
2. context optimization profile guidance
3. summary-first execution expansion

Avoid defaulting weak or noisy policies too early.

### 3. Continue Operationalizing The Measurement Loop

The next benchmark step should not be "invent more benchmark types."

It should be:

1. repeated-run median comparisons for any candidate default change
2. stable artifact naming and aggregation conventions
3. promoting only changes with repeatable evidence

## Working Conclusion

The shortest correct statement is:

`Aionis already works as a cost-aware runtime kernel, but its default optimization policy layer is still immature.`

That is the current state.
