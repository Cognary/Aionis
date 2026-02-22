---
title: "Adaptive Compression Plan"
---

# Adaptive Compression Plan

This plan upgrades Aionis from static compression rollup to a budget-driven adaptive compression engine while keeping auditability and stable production latency.

## Why

Current state is solid but limited:

1. Compression rollup exists and is non-destructive.
2. `recall_text` already prefers summary-first rendering.
3. Compression gain is material but modest in baseline docs (`4699 -> 4244` context chars).

Target state:

1. Per-request token budget control.
2. Adaptive context compaction under load/large context.
3. Measured compression KPI in CI and release gate.

## Scope

In scope:

1. Open Core API and recall path.
2. Context rendering and compaction policy.
3. SDK input type alignment (TypeScript + Python).
4. Operator/docs/runbook updates.

Out of scope:

1. Hosted-only internal policy engine.
2. Model-specific semantic summarization service.
3. Breaking response schema changes.

## Success Metrics

Primary:

1. `context_compression_ratio >= 0.40` on representative long-memory workload.
2. `answer_quality_retain >= 0.95` versus non-compressed baseline (task-specific eval set).
3. `recall_text p95` regression <= `+10%`.

Secondary:

1. `rate_limited_recall_text_embed` does not regress in steady traffic.
2. `consistency` checks remain clean for compression citations.

## Rollout Phases

## Phase 1 (Now): Budget-Driven Context Compaction

Status: `in_progress`

Deliverables:

1. Add request knobs:
   - `context_token_budget?: number`
   - `context_char_budget?: number`
2. Add server default:
   - `MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT` (`0` disables).
3. Apply compaction only to `context.text`, preserving `items` and `citations`.
4. Add observability fields in recall logs:
   - context length, estimated tokens, budget, compaction applied.

Acceptance:

1. Existing clients keep working with no request changes.
2. With budget set, context text shrinks deterministically.
3. Build/contract/docs/sdk checks pass.

## Phase 2: Multi-Level Compression Strategy

Status: `pending`

Deliverables:

1. Add section-level policy presets (`balanced`, `aggressive`).
2. Prefer topic/concept and rule lines before event fanout under tight budgets.
3. Add compaction diagnostics in debug block (bounded metadata only).

Acceptance:

1. Compression ratio improves beyond Phase 1 on long contexts.
2. No citation traceability regression.

## Phase 3: Production Gate and Benchmark Standardization

Status: `pending`

Deliverables:

1. Add compression KPI check into `gate:core:prod` (non-blocking first, then blocking).
2. Add production-style benchmark profile for compression.
3. Keep LoCoMo/LongMemEval as auxiliary regression only.

Acceptance:

1. Release evidence includes compression KPIs.
2. Gate fails when compression or quality thresholds breach (after stabilization period).

## Risk and Guardrails

1. Risk: over-compression hurts answer quality.
   Control: section-priority policy + quality-retain metric.
2. Risk: unpredictable output shape.
   Control: only compact `context.text`; keep `items` and `citations` stable.
3. Risk: per-model token mismatch.
   Control: use conservative token estimator first; calibrate by model family later.

## Execution Checklist

1. Implement Phase 1 code path and API schema.
2. Update API contract and operator runbook.
3. Align SDK input types.
4. Run:
   - `npm run -s build`
   - `npm run -s test:contract`
   - `npm run -s docs:check`
   - `npm run -s sdk:release-check`
   - `npm run -s sdk:py:release-check`
5. Ship and observe one release cycle before Phase 2.
