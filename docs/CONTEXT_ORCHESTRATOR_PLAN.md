---
title: "Context Orchestrator Plan"
---

# Context Orchestrator Plan

Status: `in progress`  
Owner: Aionis Core  
Track: `v0.3 context orchestration`

## 1. Goal

Build a fully productized, explicit multi-layer context orchestration module so users can control:

1. what context layers are included
2. how budgets are allocated per layer
3. why context lines are dropped
4. how final context is assembled and replayed

## 2. Why This Matters

Current Aionis already provides:

1. recall + recall_text
2. compaction budgets
3. rules/tools policy loop

Gap to close:

1. no explicit first-class "layer orchestration" surface for users/operators
2. limited visibility into merge/drop decisions at layer granularity

## 3. Scope

### In Scope

1. Explicit layer model (`facts`, `episodes`, `rules`, `decisions`, `tools`, `citations`)
2. Layer-level budget controls
3. Merge trace and drop reasons
4. Deterministic assembly output for replay/debug
5. API/SDK surface and docs

### Out of Scope (for v0.3)

1. LLM-driven dynamic layer scoring
2. Cross-request learned orchestration policy optimization
3. UI visual editor in Ops Console (planned after API stabilizes)

## 4. Phased Delivery

## Phase 0: Contract + Experimental Surface (Completed)

Delivered:

1. Planning-context request now accepts:
   - `return_layered_context?: boolean`
   - `context_layers?: { enabled, char_budget_total, char_budget_by_layer, max_items_by_layer, include_merge_trace }`
2. Planning-context response can return:
   - `layered_context` (experimental)
3. Introduced experimental orchestration module:
   - `src/memory/context-orchestrator.ts`

Acceptance:

1. Backward compatible when `return_layered_context=false`
2. `layered_context` includes layer stats + merged text + drop reasons

## Phase 1: Dedicated Endpoint + Hard Contract

Target:

1. Add `POST /v1/memory/context/assemble`
2. Add strict request/response DTO contract in `API_CONTRACT.md`
3. Add contract-smoke tests for valid/invalid inputs

Acceptance:

1. endpoint independent from planner-specific fields
2. deterministic output given same inputs/config
3. explicit error codes for invalid layer config/budget conflicts

## Phase 2: Governance + Operability

Target:

1. add telemetry for per-layer chars/hits/drops
2. add SLO metrics for assembly latency and budget adherence
3. add operator runbook section and failure drill cases

Acceptance:

1. per-layer metrics visible in ops diagnostics
2. alerts for chronic over-budget/dropped critical layers

## Phase 3: SDK + Playground Productization

Target:

1. TypeScript/Python SDK support for context assembly APIs
2. Playground panel for layer config and merge trace visualization
3. bilingual docs page with copy-ready templates

Progress update (`2026-03-02`):

1. TypeScript SDK: added `contextAssemble(...)` + typed request/response contracts.
2. Python SDK: added `context_assemble(...)` + TypedDict contracts.
3. Playground: added `context/assemble` operation, layer preset controls (balanced/compact/policy-first), enabled-layer toggles, budget/merge-trace toggles, and inspector merge-trace preview.
4. Added bilingual docs page `CONTEXT_ORCHESTRATION.md` with copy-ready presets and rollout guidance.
5. SDK smoke scripts now include `context/assemble` probe with `no_embedding_provider` graceful skip semantics.
6. Added context-assembly operability telemetry (summary + per-layer stats) and diagnostics aggregation for ops.
7. Updated Ops dashboard/governance surfaces and runbook/API docs with context-assembly SLO signals.

Acceptance:

1. users can tune layers without editing raw JSON manually
2. exportable assembly report for benchmark/evidence packs

## 5. API Direction (v0.3)

Proposed stable endpoint:

1. `POST /v1/memory/context/assemble`
2. request:
   - query
   - tenancy/scope
   - layer config
   - optional policy context
3. response:
   - `layers`
   - `merged_text`
   - `merge_trace`
   - `dropped_reasons`
   - `citations`
   - `observability`

## 6. Risks and Mitigations

1. Risk: context bloat from too many layers  
Mitigation: hard total budget + per-layer caps + deterministic truncation order

2. Risk: operator confusion about "why dropped"  
Mitigation: mandatory `dropped_reasons` and layer-level counters

3. Risk: schema drift between docs/UI/backend  
Mitigation: contract-smoke in CI and shared schema source

## 7. Execution Checklist

1. [x] Phase 0 experimental schema and output
2. [x] Add dedicated `context/assemble` endpoint
3. [x] Add hard contract + error code table
4. [x] Add CI contract probes
5. [x] Add SDK methods/types
6. [x] Add Playground orchestration panel
7. [x] Add ops metrics + runbook
