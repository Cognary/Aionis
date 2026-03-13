# L2-L5 Compression Benchmark Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define and stage the benchmark rollout for `L2 topic aggregation`, `L3 deterministic compression`, `L4 semantic abstraction`, and `L5 serving-side compaction` without mixing their failure modes.

**Architecture:** Reuse the `L1 distilled facts` benchmark shape and artifact layout. Add higher-layer benchmarks incrementally, starting with `L2` as the first additive comparison over `L0+L1`, then `L3`, then exploratory `L4`, and only finally `L5` once lower-layer quality is stable.

**Tech Stack:** TypeScript jobs, Aionis Lite HTTP APIs, JSON fixtures, markdown benchmark reports.

---

## Why This Roadmap Exists

`L1` is now benchmarked as:

- `L0-only`
- `L0 + L1`

That is the right first cut because `L1` is the first durable compression layer above raw evidence.

The next layers should not be benchmarked as a single stack immediately because they answer different questions:

- `L2`: topic consolidation quality
- `L3`: deterministic rollup quality
- `L4`: semantic abstraction quality
- `L5`: serving-time compaction quality

If all of them are mixed into one test too early, failures become uninterpretable.

---

## Rollout Order

### Phase 1: L2 Topic Aggregation

Benchmark shape:

- baseline: `L0 + L1`
- treatment: `L0 + L1 + L2`

Question:

- does `L2` preserve planner-useful facts while reducing topic duplication and payload size?

Primary metrics:

- critical fact recall rate
- context_est_tokens
- selected memory layers
- topic coverage
- duplicate evidence reduction

Release criterion:

- no material drop in fact recall
- measurable reduction in `planning/context` token estimate

### Phase 2: L3 Deterministic Compression

Benchmark shape:

- baseline: `L0 + L1 + L2`
- treatment: `L0 + L1 + L2 + L3`

Question:

- does deterministic rollup improve planner-ready recall while staying stable and auditable?

Primary metrics:

- fact recall rate
- context_est_tokens
- compression ratio
- citation retention
- determinism across repeated runs

Release criterion:

- no citation collapse
- stable outputs for repeated seeded inputs
- useful reduction in context payload

### Phase 3: L4 Semantic Abstraction

Benchmark shape:

- baseline: `L0 + L1 + L2 + L3`
- treatment: `L0 + L1 + L2 + L3 + L4`

Question:

- does semantic abstraction improve planning usefulness without inventing or dropping critical constraints?

Primary metrics:

- abstraction faithfulness
- unsupported claim rate
- fallback-to-lower-layer rate
- planning usefulness score

Release criterion:

- run in shadow mode first
- internal-only until unsupported claim rate is controlled

### Phase 4: L5 Serving-Side Compaction

Benchmark shape:

- baseline: serving with lower-layer outputs only
- treatment: serving with explicit `L5` compaction enabled

Question:

- does serving-time compaction preserve answerability under tight budgets?

Primary metrics:

- end-to-end answer quality under budget
- serving payload size
- lower-layer backfill / fallback rate
- high-risk answer downgrade rate

Release criterion:

- only after L2-L4 quality is stable

### Current L5 Status

`L5` now has a first exploratory benchmark harness with two arms:

- `balanced_serving`
- `aggressive_serving`

The current fixtures reuse the same `L0 + L1 + L2 + L3` graph and vary only serving-time compaction policy.

Current result:

- `fact_recall_rate`: flat
- `context_est_tokens`: flat
- `selected_memory_layers`: flat
- `context_chars`: materially lower under `aggressive`

Interpretation:

- `L5` currently behaves as a **served payload reduction layer**
- it is **not yet** a proven `context_est_tokens` reduction layer
- this is an interpretable positive result, but narrower than a full token-budget claim

---

## Fixture Strategy

Maintain two fixture families for every phase.

### 1. Code-style corpus

Use pinned Click-style evidence with:

- implementation file focus
- test scope focus
- repeated event noise
- topic-level grouping opportunities

### 2. Research-style corpus

Use vendor-comparison evidence with:

- overlapping factual mentions
- repeated pricing/context/API facts
- topic-style aggregation opportunities

This keeps every phase honest across both code and non-code memory use.

---

## Artifact Contract

Every phase should emit the same artifact shape:

- `cases.jsonl`
- `summary.json`
- `report.md`

And every summary should include:

- benchmark phase
- fixture file
- arm names
- average fact recall rate
- average context token estimate
- average context chars
- selected/retrieved memory layers
- endpoint breakdown for:
  - `recall_text`
  - `planning_context`
  - `context_assemble`

---

## Immediate Execution Plan

### Task 1: Add the roadmap doc

**Files:**
- Create: `docs/plans/2026-03-13-l2-l5-benchmark-roadmap.md`

**Step 1: Write the roadmap**
- Define the phased order: `L2 -> L3 -> L4 -> L5`
- State why all layers should not be benchmarked together yet
- Lock the metric vocabulary so later benchmark results are comparable

**Step 2: Save the doc**

Run: no command required
Expected: file exists in `docs/plans/`

### Task 2: Add L2 topic aggregation benchmark harness

**Files:**
- Create: `src/jobs/l2-topic-aggregation-benchmark.ts`
- Create: `src/jobs/fixtures/l2-topic-aggregation-click-v1.json`
- Create: `src/jobs/fixtures/l2-topic-aggregation-research-v1.json`
- Modify: `package.json`

**Step 1: Reuse the L1 benchmark shape**
- Keep the same artifact layout and endpoint set
- Use two arms:
  - `l0_plus_l1`
  - `l0_plus_l1_plus_l2`

**Step 2: Seed topic nodes**
- Represent `L2` using `type=topic`
- Attach `compression_layer=L2`
- Link topic nodes to source events/L1 nodes via citations or source ids

**Step 3: Add fixtures**
- Code fixture should group parser-related evidence into topic nodes
- Research fixture should group vendor facts into topic nodes

**Step 4: Add npm script**

Run: `npm run -s build`
Expected: build passes

### Task 3: Execute L2 benchmark on both corpora

**Files:**
- Output: `artifacts/benchmarks/l2-topic-aggregation/<timestamp>/...`

**Step 1: Run code corpus**

Run:
```bash
npm run -s job:l2-topic-aggregation-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /abs/path/to/l2-topic-aggregation-click-v1.json
```
Expected: benchmark artifacts written

**Step 2: Run research corpus**

Run:
```bash
npm run -s job:l2-topic-aggregation-benchmark -- \
  --base-url http://127.0.0.1:3321 \
  --fixture-file /abs/path/to/l2-topic-aggregation-research-v1.json
```
Expected: benchmark artifacts written

**Step 3: Compare results**
- Confirm whether `L2` reduces `context_est_tokens`
- Confirm whether fact recall stays flat or improves

**Step 4: Commit**

```bash
git add docs/plans/2026-03-13-l2-l5-benchmark-roadmap.md \
  src/jobs/l2-topic-aggregation-benchmark.ts \
  src/jobs/fixtures/l2-topic-aggregation-click-v1.json \
  src/jobs/fixtures/l2-topic-aggregation-research-v1.json \
  package.json
git commit -m "feat(bench): add l2 topic aggregation benchmark"
```

---

## Success Condition For This Turn

This turn is successful if:

1. the roadmap exists
2. the `L2` harness exists and builds
3. both code and research corpora run
4. we can state clearly whether `L2` is currently net-positive or mixed
