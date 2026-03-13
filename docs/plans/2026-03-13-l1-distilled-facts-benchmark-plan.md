# 2026-03-13 Aionis L1 Distilled Facts Benchmark Plan

## Purpose

This document defines the benchmark plan for `L1 distilled facts` in the Aionis memory-compression ladder.

This is **not** the same thing as the product capability matrix for:

1. handoff
2. policy
3. replay

This plan only covers the memory mainline:

- `/v1/memory/write`
- `/v1/memory/recall`
- `/v1/memory/recall_text`
- `/v1/memory/planning/context`
- `/v1/memory/context/assemble`

And it focuses on the compression progression:

1. `L0` raw events / evidence
2. `L1` distilled facts
3. `L2` topic aggregation
4. `L3` deterministic compression
5. `L4` semantic abstraction
6. `L5` serving-side compaction

The question for this benchmark is narrow:

- Does `L1 distilled facts` improve memory usefulness relative to `L0-only` retrieval without losing critical facts?

---

## Why This Needs Its Own Benchmark

Current public benchmark evidence for Aionis is strong on:

1. handoff
2. policy
3. replay

But those do **not** prove the value of `L1 distilled facts`.

`L1` is a memory-compression layer, not an execution handoff surface.
It needs a dedicated benchmark because its value proposition is different:

1. less noisy retrieval
2. lower context payload
3. more stable planner-ready facts
4. better fact retention than raw-event-only recall at the same serving budget

If we keep mixing `L1` with handoff/policy/replay, the benchmark will become unclear and the product story will be wrong.

---

## Product Interpretation Of L1

`L1 distilled facts` should be treated as:

- the first durable compression layer above raw evidence
- the layer that converts repeated event-level evidence into stable factual units
- the first layer that should improve planning/context quality without requiring full abstraction

The benchmark should therefore test whether `L1` makes these calls more useful:

1. `recall_text`
2. `planning/context`
3. `context/assemble`

---

## Benchmark Goal

The benchmark must establish whether `L1` does three things at once:

1. preserves critical facts
2. reduces context size and noise
3. improves planner/use-case usefulness under a fixed budget

This is the core tradeoff.
If `L1` only compresses but drops important facts, it fails.
If `L1` preserves everything but does not reduce noise or cost, it also fails.

---

## Benchmark Design

### A/B Shape

Every benchmark run should compare two arms on the same seeded corpus.

#### Arm A: `L0-only`

- write raw event/evidence only
- disable or exclude `L1 distilled facts` from selection
- allow downstream endpoints to compose from `L0` only

#### Arm B: `L0 + L1`

- write the same raw event/evidence
- enable `L1 distilled facts`
- allow downstream endpoints to use `L1` as an available layer

Optional future arms:

1. `L0 + L1 + L2`
2. `L0 + L1 + L2 + L3`
3. `L0 + L1 + ... + L5`

But the initial public proof should stay narrow:

- `L0-only` vs `L0 + L1`

---

## Benchmark Inputs

### Dataset Types

Use three dataset families.

#### 1. Real GitHub repo evidence streams

Example:

- `pallets/click`
- pinned commit
- synthetic but realistic event stream produced from:
  - file reads
  - test observations
  - patch findings
  - review notes

Why:

- easy to audit
- deterministic
- directly relevant to coding agents

#### 2. Multi-turn research / investigation logs

Example:

- fixed vendor comparison task
- repeated findings written as separate events
- factual overlap + noise across turns

Why:

- tests whether `L1` can consolidate repeated factual mentions
- reveals whether `planning/context` becomes cleaner

#### 3. Operational task traces

Example:

- deployment triage
- incident investigation
- approval-related facts

Why:

- tests whether `L1` can retain stable non-code facts
- prevents overfitting the layer to code only

Initial recommendation:

- start with `pallets/click`
- then add one research-style corpus

---

## Endpoints Under Test

The minimum benchmark surface should include:

1. `POST /v1/memory/recall_text`
2. `POST /v1/memory/planning/context`
3. `POST /v1/memory/context/assemble`

Optional supporting surface:

1. `POST /v1/memory/recall`
2. health/debug metrics for compaction or selected layers

---

## Metrics

### 1. Fact Retention

The most important metric.

For each benchmark case, define a gold set of critical facts.

Measure:

1. retained critical facts count
2. critical fact recall rate
3. false omission count

Rule:

- `L1` cannot be considered better if critical fact recall drops below acceptable threshold.

### 2. Context Reduction

Measure:

1. `context_chars`
2. `context_est_tokens`
3. response payload size
4. selected item count
5. duplicate evidence count

Goal:

- `L1` should reduce payload and duplication relative to `L0-only`.

### 3. Planning Usefulness

For `planning/context` and `context/assemble`, define expected planner outputs:

1. correct next-step focus
2. correct file/test scope
3. correct cited supporting facts

Measure:

1. planning correctness score
2. wrong-focus rate
3. planner disagreement rate

### 4. Traceability

`L1` must remain auditable.

Measure:

1. citation coverage back to `L0`
2. evidence trace completeness
3. unsupported summary count

### 5. Stability

Run each case multiple times.

Measure:

1. output variance
2. selected-layer variance
3. planning summary variance

---

## Suggested Pass Criteria

For a public `L1` claim, recommended gate:

1. `critical_fact_recall_rate >= 0.95`
2. `context_est_tokens` reduced by at least `20%`
3. `duplicate_evidence_count` reduced by at least `30%`
4. `planning correctness` equal to or better than `L0-only`
5. `citation coverage` remains above `0.90`

If `L1` reduces cost but loses too many facts, the benchmark must fail.

---

## Artifact Contract

Each run should emit:

1. `cases.jsonl`
2. `summary.json`
3. `report.md`

Per-case fields should include:

1. dataset family
2. scope / tenant
3. arm (`l0_only` or `l0_plus_l1`)
4. endpoint under test
5. critical fact set
6. returned facts / citations
7. `context_chars`
8. `context_est_tokens`
9. selected layers
10. planner score
11. traceability score
12. pass/fail

---

## Recommended First Public Matrix

The first public L1 benchmark should publish one table like this:

| Dataset | Endpoint | L0-only | L0 + L1 | Key Result |
| --- | --- | --- | --- | --- |
| `click` | `recall_text` | raw evidence only | distilled facts enabled | fewer chars, critical facts retained |
| `click` | `planning/context` | raw evidence only | distilled facts enabled | same-or-better planning focus with lower token estimate |
| `click` | `context/assemble` | raw evidence only | distilled facts enabled | lower duplicate evidence and better layered usefulness |

This would be the correct public proof for `L1 distilled facts`.

---

## Non-Claims

This benchmark should **not** claim:

1. replay improvement
2. policy routing improvement
3. handoff quality improvement
4. end-to-end multi-agent superiority

Those are separate product surfaces and should remain separate benchmark pages.

---

## Implementation Recommendation

### Phase 1

Build one dedicated benchmark harness:

- `l1-distilled-facts-bench`

Inputs:

1. seeded event corpus
2. critical fact labels
3. fixed query set
4. fixed budget profile

Outputs:

1. recall_text A/B
2. planning/context A/B
3. context/assemble A/B

### Phase 2

Add:

1. one research-style corpus
2. one operational task corpus

### Phase 3

Publish a public benchmark page:

- `L1 Distilled Facts Benchmark`

---

## Immediate Next Step

The immediate next step should be:

1. define the gold fact labels for one `pallets/click` corpus
2. build `L0-only` vs `L0 + L1` harness for:
   - `recall_text`
   - `planning/context`
   - `context/assemble`
3. publish the first small benchmark before expanding to `L2+`

That is the right proof for the memory-compression `L1`.
