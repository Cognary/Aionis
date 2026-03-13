# L4 Serve Opt-In Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define a safe opt-in serving path for `L4 semantic abstraction` so it can be benchmarked meaningfully without changing default serving behavior.

**Architecture:** Keep `L4` shadow-first by default. Add an explicit request-level opt-in path for `planning/context` and `context/assemble` so internal benchmarks can compare `L3`-only serving against `L3+L4` serving under controlled conditions.

**Tech Stack:** Aionis TypeScript routes, memory layer policy, context assembly, benchmark jobs.

---

## Current Problem

`L4` objects are being written and retrieved, but they are not selected into serving output.

Observed benchmark result:

- `retrieved_memory_layers` includes `L4`
- `selected_memory_layers` does **not** include `L4`
- `L3`-only and `L3+L4` arms produce identical context/token outputs

This means the current `L4 exploratory shadow benchmark` is not yet testing `L4` as a serving layer.

The current system behavior is coherent:

- `L4` is shadow-only
- serving defaults still prefer `L3 -> L0 -> L1 -> L2`
- no explicit request-level path exists to consume `L4`

So the missing piece is not more benchmark data. The missing piece is a deliberate `serve opt-in` contract.

---

## Design Principle

Do **not** make `L4` part of default serving yet.

Instead:

1. preserve current default behavior
2. add an explicit opt-in path for internal use
3. benchmark that opt-in path separately
4. only consider default promotion after quality gates are met

This keeps `L4` additive and low-risk.

---

## Proposed Serving Modes

### Mode A: Default (current)

- `L4` may be retrieved for observability
- `L4` is not selected for final context injection
- current serving behavior remains unchanged

### Mode B: Opt-In Shadow Serving

- request explicitly allows `L4` in final serving
- route still records explainability / selected layers
- intended only for:
  - internal evaluation
  - benchmark runs
  - tenant/profile experiments

### Mode C: Future Profile-Gated Serving

- not part of this plan
- only after benchmark quality gates are passed

---

## Proposed Request Contract

Add an internal serving control on the request path for:

- `POST /v1/memory/planning/context`
- `POST /v1/memory/context/assemble`
- optionally `POST /v1/memory/recall_text`

Recommended request shape:

```json
{
  "memory_layer_preference": {
    "allowed_layers": ["L0", "L1", "L2", "L3", "L4"]
  },
  "memory_serving_mode": {
    "allow_l4_selection": true
  }
}
```

Internal-only alternative:

- reuse an internal header, e.g. `x-aionis-internal-allow-l4-serving: true`

Recommendation:

- start with header-gated internal-only behavior
- later, if stable, promote to an explicit request field

Why header first:

- avoids public API churn
- reduces accidental exposure
- simpler for benchmark harnesses

---

## Required Code Changes

### 1. Layer policy / serving policy

Current policy does not include `L4` in selected layers for serving.

Need:

- an internal flag that extends serving selection to include `L4`
- only when explicitly requested

Likely files:

- `src/memory/layer-policy.ts`
- `src/memory/context.ts`
- `src/memory/recall.ts`

### 2. Route plumbing

Need request/header plumbing for:

- `planning/context`
- `context/assemble`
- optionally `recall_text`

Likely file:

- `src/routes/memory-context-runtime.ts`

### 3. Observability

Need explicit traces showing whether `L4` was only retrieved or also selected.

This should already mostly exist through:

- `selected_memory_layers`
- `retrieved_memory_layers`
- selection policy explain blocks

But the benchmark should confirm that `L4` moves from `retrieved` to `selected` only under opt-in.

---

## Benchmark Plan After Opt-In Exists

### Baseline arm

- `allowed_layers = [L0,L1,L2,L3]`
- no `L4` serving opt-in

### Treatment arm

- `allowed_layers = [L0,L1,L2,L3,L4]`
- `allow_l4_selection = true`

### Metrics

Primary:

- fact recall rate
- unsupported claim rate
- context_est_tokens
- selected_memory_layers
- planning usefulness

Secondary:

- context_chars
- citation coverage
- fallback-to-lower-layer rate

### Pass condition for internal exploration

`L4` opt-in is worth continuing only if:

1. fact recall does not regress materially
2. unsupported claim rate stays controlled
3. selected layers actually include `L4`
4. at least one of:
   - context payload drops
   - planner usefulness improves
   - lower-layer dependence falls without losing critical facts

---

## Non-Goals

This plan does **not** do any of the following yet:

1. make `L4` default
2. change public default serving semantics
3. publish `L4` benchmark claims externally
4. remove `L3` as the trust anchor

---

## Current Status (2026-03-13)

The internal `L4` serve opt-in path has now been implemented behind:

- `x-aionis-internal-allow-l4-serving: true`

Observed benchmark result after implementation:

- baseline arm selects `L0,L1,L2,L3`
- treatment arm selects `L0,L1,L2,L3,L4`
- `fact_recall_rate` stays flat
- `context_est_tokens` stays flat
- `context_chars` increases slightly

Current interpretation:

- the `L4` serving path now exists and is testable
- the current research-style fixture does **not** show a serving gain
- `L4` should remain internal/experimental
- no external benchmark or product claim should present `L4` as a proven improvement yet

Recommended next step:

- pause public `L4` claims
- keep the opt-in path
- revisit only with a fixture explicitly designed to reward semantic abstraction over lower-layer redundancy

---

## Implementation Sequence

### Task 1: Add design doc

**Files:**
- Create: `docs/plans/2026-03-13-l4-serve-opt-in-plan.md`

**Step 1: Write the plan**
- Explain why current `L4` benchmark is neutral
- Define internal opt-in path
- Define benchmark consequences

**Step 2: Save doc**
- No code changes required

### Task 2: Add internal L4 serving gate

**Files:**
- Modify: `src/routes/memory-context-runtime.ts`
- Modify: `src/memory/layer-policy.ts`
- Modify: `src/memory/context.ts`
- Modify: `src/memory/recall.ts`

**Step 1: Add request/header gate**
- internal-only
- default off

**Step 2: Thread the gate into serving selection**
- retrieved-only when off
- selectable when on

**Step 3: Preserve observability**
- selected vs retrieved layers remain visible

### Task 3: Re-run L4 exploratory benchmark

**Files:**
- Existing benchmark harness

**Step 1: Baseline run**
- `L3` only

**Step 2: Treatment run**
- `L3 + L4` with opt-in enabled

**Step 3: Evaluate**
- If `L4` still adds no value, do not promote further
- If `L4` shows value, keep it internal until quality gates are clearer

---

## Success Condition

This plan succeeds when:

1. `L4` can be explicitly selected in internal serving tests
2. default serving remains unchanged
3. benchmark results become meaningful instead of trivially identical
