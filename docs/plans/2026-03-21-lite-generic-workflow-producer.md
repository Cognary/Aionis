# Lite Generic Workflow Producer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Broaden Lite workflow-memory production by turning structured execution-continuity `/v1/memory/write` requests into governed workflow memory without making planner/context responses fatter.

**Architecture:** Add a Lite-only workflow-projection helper on the memory-write route. The helper inspects prepared structured execution-continuity nodes, derives a conservative workflow signature, queries existing Lite execution-native rows to count observations, and appends deterministic projected workflow nodes before commit. Planner/context and introspection then consume the new workflow artifacts through the existing recall pipeline.

**Tech Stack:** TypeScript, Fastify, SQLite-backed Lite stores, existing execution-native schemas, node:test, tsx.

**Current status:** The initial execution-state-backed slice is implemented. The current active runtime also supports packet-only execution continuity, conservative generic-path stable auto-promotion on repeated unique observations, and a shared Lite continuity write pipeline across `memory/write`, `handoff/store`, and `memory/events`.

---

### Task 1: Add a Lite workflow-write projection helper

**Files:**
- Create: `src/memory/workflow-write-projection.ts`
- Modify: `src/memory/schemas.ts`
- Test: `scripts/ci/lite-memory-write-workflow-projection-route.test.ts`

**Step 1: Write the failing route test skeleton**

Create a new test that:

1. boots Lite write + context routes on a temporary SQLite database
2. posts one structured execution-continuity `/v1/memory/write`
3. posts `/v1/memory/planning/context`
4. expects one candidate workflow and no route bloat

**Step 2: Run the new test to verify it fails**

Run:

```bash
npx tsx --test scripts/ci/lite-memory-write-workflow-projection-route.test.ts
```

Expected:

`FAIL` because ordinary execution-continuity writes do not yet create governed workflow memory.

**Step 3: Implement the helper**

Create `src/memory/workflow-write-projection.ts` with:

1. conservative workflow-signature derivation from `task_brief`, target files, and `resume_anchor`
2. deterministic candidate client-id generation from source node id and workflow signature
3. Lite store lookup for:
   - existing stable workflow anchor by signature
   - existing candidate rows by signature
   - existing candidate row for the same source node
4. projected candidate node builder using:
   - `summary_kind = "workflow_candidate"`
   - `execution_native_v1.execution_kind = "workflow_candidate"`
   - `workflow_promotion.promotion_origin = "execution_write_projection"`
   - `workflow_promotion.required_observations = 2`
   - `workflow_promotion.observed_count = existing + 1`
   - `maintenance_state = "observe"`

**Step 4: Add the new promotion origin to schema**

Update `src/memory/schemas.ts` so workflow promotion origin accepts:

```ts
"execution_write_projection"
```

**Step 5: Run the new test again**

Run:

```bash
npx tsx --test scripts/ci/lite-memory-write-workflow-projection-route.test.ts
```

Expected:

The first scenario now passes and shows one candidate workflow in planner packet.

**Step 6: Commit**

```bash
git add src/memory/workflow-write-projection.ts src/memory/schemas.ts scripts/ci/lite-memory-write-workflow-projection-route.test.ts
git commit -m "Add Lite workflow projection from execution-state writes"
```

### Task 2: Integrate projection into the Lite memory-write route

**Files:**
- Modify: `src/routes/memory-write.ts`
- Test: `scripts/ci/lite-memory-write-workflow-projection-route.test.ts`

**Step 1: Extend the Lite write-store route typing**

Add the minimum Lite store methods needed by the route helper:

1. `findExecutionNativeNodes`
2. `findLatestNodeByClientId`

**Step 2: Call the projection helper before commit**

Inside `prepareWriteRouteState(...)`:

1. detect Lite mode
2. call the projection helper
3. append projected nodes and edges into `preparedForRoute`
4. preserve existing route shape and warnings behavior

**Step 3: Ensure projected nodes remain embed-ready**

When auto-embed is active:

1. give projected nodes deterministic `embed_text`
2. let existing Lite inline embedding logic backfill them

**Step 4: Run the focused test**

Run:

```bash
npx tsx --test scripts/ci/lite-memory-write-workflow-projection-route.test.ts
```

Expected:

Candidate workflow becomes recallable after a real `/v1/memory/write`.

**Step 5: Commit**

```bash
git add src/routes/memory-write.ts scripts/ci/lite-memory-write-workflow-projection-route.test.ts
git commit -m "Project workflow candidates during Lite memory writes"
```

### Task 3: Add maturity progression coverage

**Files:**
- Modify: `scripts/ci/lite-memory-write-workflow-projection-route.test.ts`
- Test: `scripts/ci/lite-context-runtime-packet-contract.test.ts`

**Step 1: Extend the route test with a second matching write**

Add a second `/v1/memory/write` request with:

1. a different source node id
2. the same derived workflow signature inputs

Expected route behavior:

1. `planning_context` first shows a single aggregated candidate workflow
2. on repeated unique observations the generic path can move from candidate wording to stable workflow guidance
3. retries do not inflate observations

**Step 2: Add a no-duplicate retry check**

Retry the same source write again and verify:

1. candidate count does not increase
2. observed count does not inflate from pure retry

**Step 3: Run the tests**

Run:

```bash
npx tsx --test scripts/ci/lite-memory-write-workflow-projection-route.test.ts
npx tsx --test scripts/ci/lite-context-runtime-packet-contract.test.ts
```

Expected:

Both pass with no extra default route fields.

**Step 4: Commit**

```bash
git add scripts/ci/lite-memory-write-workflow-projection-route.test.ts scripts/ci/lite-context-runtime-packet-contract.test.ts
git commit -m "Cover workflow candidate maturity from generic execution writes"
```

### Task 4: Wire the test into Lite CI

**Files:**
- Modify: `package.json`

**Step 1: Add the new test file to `test:lite`**

Append:

```text
scripts/ci/lite-memory-write-workflow-projection-route.test.ts
```

to the `npx tsx --test ...` list.

**Step 2: Run the full relevant suite**

Run:

```bash
npx tsc --noEmit
npm run -s test:lite
```

Expected:

Both pass.

**Step 3: Commit**

```bash
git add package.json
git commit -m "Cover generic workflow projection in Lite test suite"
```

### Task 5: Update roadmap/status docs after code lands

**Files:**
- Modify: `docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md`
- Modify: `docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md`
- Modify: `docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md`

**Step 1: Record the new producer slice**

Update docs so they say:

1. Lite now supports structured execution-continuity workflow production through `/v1/memory/write`, including packet-only continuity writes
2. generic path now supports conservative stable auto-promotion on repeated unique observations
3. replay is still the strongest and richest stable workflow path
4. broader producer coverage is now partially reduced but not fully solved
5. continuity-backed route families now share one Lite projected-write commit path instead of drifting as separate implementations
6. continuity-backed producer preconditions and distinct-observation semantics now have a dedicated projection contract test
7. `execution/introspect` now exposes compact continuity-producer provenance and skip-reason reporting for operator/debug use

**Step 2: Run a quick doc sanity check**

Run:

```bash
rg -n "execution_write_projection|workflow candidate" docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md
```

Expected:

Updated wording appears in all three files.

**Step 3: Commit**

```bash
git add docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md
git commit -m "Document generic workflow projection slice"
```

Plan complete and saved to `docs/plans/2026-03-21-lite-generic-workflow-producer.md`.
