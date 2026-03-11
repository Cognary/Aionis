---
title: "Aionis Agent Cost Reduction Status"
---

# Aionis Agent Cost Reduction Status

Date: `2026-03-11`  
Status: `in_progress`

Related roadmap: [/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_AGENT_COST_REDUCTION_ROADMAP.md)

## Executive Summary

Aionis has moved past the roadmap-definition stage and is now in active delivery.

The current system already implements the main runtime behaviors needed to reduce agent cost along three primary dimensions:

1. less repeated primary-model reasoning
2. less low-value context injection
3. less consumption of raw tool output on hot paths

The current state is best described as:

`memory-centered runtime kernel` -> `cost-aware runtime kernel`

## Current Capability Matrix

| Direction | Status | Delivery Level | Main Surfaces |
|---|---|---:|---|
| Deterministic replay gating | landed | high | `candidate / run / dispatch`, SDK, MCP, docs |
| Forgetting policy | landed | high | layered context assembly, tier-aware omission |
| Selective static injection | landed | high | `static_context_blocks / static_injection` |
| Write-time distillation | landed | medium-high | `/v1/memory/write` distill path |
| Tool result summarization | phase 1 landed | medium | sandbox, replay, MCP consumer surfaces |
| Default cost policy convergence | partial | medium-low | features exist, but not all are default-first |
| Cost telemetry and benchmark proof | partial | medium | machine-readable cost signals now exist in runtime responses and `job:perf-benchmark` can sample optimization deltas |

## Landed Work

### 1. Deterministic Replay

This is the strongest cost lever currently in Aionis because it can remove primary-model participation from repeated tasks.

Landed surfaces:

1. `POST /v1/memory/replay/playbooks/candidate`
2. `POST /v1/memory/replay/playbooks/run`
3. `POST /v1/memory/replay/playbooks/dispatch`
4. SDK and MCP exposure
5. EN/ZH public docs and contract coverage

Key code:

1. [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
2. [/Users/lucio/Desktop/Aionis/src/routes/memory-replay-core.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-replay-core.ts)
3. [/Users/lucio/Desktop/Aionis/src/routes/memory-replay-governed.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-replay-governed.ts)
4. [/Users/lucio/Desktop/Aionis/src/sdk/client.ts](/Users/lucio/Desktop/Aionis/src/sdk/client.ts)
5. [/Users/lucio/Desktop/Aionis/src/mcp/dev/tools.ts](/Users/lucio/Desktop/Aionis/src/mcp/dev/tools.ts)

Current assessment:

1. deterministic replay is no longer only a design concept
2. upper-layer agents now have a proper dispatch surface for inference-skipping decisions
3. the next improvement is not another endpoint, but higher default adoption and hit-rate measurement

### 2. Forgetting Policy

Tiering now affects prompt injection behavior, not only storage or archival semantics.

Landed surfaces:

1. `allowed_tiers`
2. `exclude_archived`
3. `min_salience`
4. `layered_context.forgetting`
5. per-layer `forgotten_count`

Key code:

1. [/Users/lucio/Desktop/Aionis/src/memory/context.ts](/Users/lucio/Desktop/Aionis/src/memory/context.ts)
2. [/Users/lucio/Desktop/Aionis/src/memory/context-orchestrator.ts](/Users/lucio/Desktop/Aionis/src/memory/context-orchestrator.ts)
3. [/Users/lucio/Desktop/Aionis/src/memory/schemas.ts](/Users/lucio/Desktop/Aionis/src/memory/schemas.ts)

Current assessment:

1. Aionis now supports omission by value, not only compression by budget
2. this is the first real bridge from storage tiering to context policy
3. the next step is to make default tier eligibility more opinionated and measurable

### 3. Selective Static Injection

Static config and bootstrap material no longer has to be all-or-nothing.

Landed surfaces:

1. `static_context_blocks`
2. `static_injection`
3. `static` layered-context surface
4. block selection traces in response payloads

Key code:

1. [/Users/lucio/Desktop/Aionis/src/memory/context-orchestrator.ts](/Users/lucio/Desktop/Aionis/src/memory/context-orchestrator.ts)
2. [/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts)
3. [/Users/lucio/Desktop/Aionis/src/mcp/dev/profile.ts](/Users/lucio/Desktop/Aionis/src/mcp/dev/profile.ts)

Current assessment:

1. static prompt inflation now has a first-class runtime control plane
2. Aionis can select configuration blocks instead of blindly reinjecting all of them
3. the next step is higher-quality block selection defaults and better block metadata conventions

### 4. Write-Time Distillation

Raw input can now be distilled before it becomes long-term hot-path memory.

Landed surfaces:

1. write-time `distill`
2. derived `evidence` nodes
3. derived `concept` nodes
4. `derived_from` provenance edges
5. response-level distillation summary

Key code:

1. [/Users/lucio/Desktop/Aionis/src/memory/write-distillation.ts](/Users/lucio/Desktop/Aionis/src/memory/write-distillation.ts)
2. [/Users/lucio/Desktop/Aionis/src/memory/write.ts](/Users/lucio/Desktop/Aionis/src/memory/write.ts)

Current assessment:

1. Aionis has started moving from raw-text retention toward distilled execution memory
2. this is still a deterministic first cut, not a full semantic extraction pipeline
3. the right next step is stronger extraction quality without losing raw-artifact auditability

### 5. Tool Result Summarization

This direction is now landed in phase 1 and is already usable.

Landed surfaces:

1. deterministic summary helper: `tool_result_summary_v1`
2. sandbox responses expose `result_summary`
3. replay step reports and persisted `output_signature` expose `result_summary`
4. MCP tool text output now prefers `result_summary`
5. dev orchestration command recording now uses the same summarizer

Key code:

1. [/Users/lucio/Desktop/Aionis/src/memory/tool-result-summary.ts](/Users/lucio/Desktop/Aionis/src/memory/tool-result-summary.ts)
2. [/Users/lucio/Desktop/Aionis/src/memory/sandbox.ts](/Users/lucio/Desktop/Aionis/src/memory/sandbox.ts)
3. [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
4. [/Users/lucio/Desktop/Aionis/src/mcp/dev/tools.ts](/Users/lucio/Desktop/Aionis/src/mcp/dev/tools.ts)
5. [/Users/lucio/Desktop/Aionis/src/mcp/dev/orchestration/workflow.ts](/Users/lucio/Desktop/Aionis/src/mcp/dev/orchestration/workflow.ts)

Latest commit in this direction:

1. `607019a` `feat: add deterministic tool result summaries`

Current assessment:

1. Aionis now has a bounded tool-output surface that upper layers can consume first
2. this is not full coverage yet; it is the first high-value slice
3. the next step is expanding summary-first behavior to more non-sandbox execution surfaces

### 6. Cost Signals And Benchmark Evidence

Cost-reduction signals are no longer only implicit in runtime behavior.

Landed surfaces:

1. replay `candidate / run / dispatch` responses expose machine-readable `cost_signals`
2. `planning/context` and `context/assemble` responses expose machine-readable `cost_signals`
3. `job:perf-benchmark` can now sample `context/assemble` baseline vs optimized runs
4. benchmark artifacts now carry optimization summaries for estimated token reduction, forgotten items, static-block selection, and latency delta
5. benchmark artifacts can also sample replay deterministic-eligibility and dispatch decision mix for an existing playbook
6. `job:perf-report` now renders both context-optimization and replay-optimization sections when those artifacts are present

Key code:

1. [/Users/lucio/Desktop/Aionis/src/memory/cost-signals.ts](/Users/lucio/Desktop/Aionis/src/memory/cost-signals.ts)
2. [/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts](/Users/lucio/Desktop/Aionis/src/routes/memory-context-runtime.ts)
3. [/Users/lucio/Desktop/Aionis/src/memory/replay.ts](/Users/lucio/Desktop/Aionis/src/memory/replay.ts)
4. [/Users/lucio/Desktop/Aionis/src/jobs/perf-benchmark.ts](/Users/lucio/Desktop/Aionis/src/jobs/perf-benchmark.ts)
5. [/Users/lucio/Desktop/Aionis/src/jobs/perf-report.ts](/Users/lucio/Desktop/Aionis/src/jobs/perf-report.ts)

Current assessment:

1. Aionis now has a first consolidated benchmark surface for context-optimization deltas
2. replay dispatch hit-rate and `result_summary` coverage now have a first artifact-level measurement path
3. the next gap is broader benchmark coverage across non-replay summary-first execution paths
4. this is enough to start publishing cost-reduction evidence instead of relying only on architectural claims

## Overall Stage Assessment

The roadmap is now in `delivery phase 1.5`.

That means:

1. the cost-reduction architecture is no longer hypothetical
2. most high-value control surfaces now exist in production code
3. several features are still opt-in or consumer-driven rather than default-on
4. the remaining work is more about expansion, defaulting, and measurement than about inventing entirely new primitives

## Next-Stage Priorities

Recommended order:

1. expand tool-result summarization beyond sandbox-centric execution paths
2. converge these features into more opinionated default runtime behavior
3. expand explicit cost telemetry and benchmark comparisons beyond the first context-optimization slice
4. improve distillation quality while keeping raw evidence retrievable
5. connect deterministic replay hit-rate, forgetting, and static injection into one measurable optimization profile

## What Should Not Happen Next

1. do not add many new cost-related endpoints before improving default behavior
2. do not replace raw output or raw evidence storage entirely; keep audit and repair paths intact
3. do not treat "prompt compression" as the primary north star; model non-participation is the bigger lever

## Success Criteria For The Next Milestone

The next milestone should be considered complete only if Aionis can demonstrate all of the following:

1. more tasks routed through deterministic replay or summary-first execution paths
2. lower default injected context size for comparable workloads
3. more runtime surfaces consuming summaries before raw outputs
4. at least one measurable benchmark or telemetry report showing real cost reduction deltas
5. benchmark artifacts expose optimization deltas in a way that can be compared across runs and profiles
