# Tool Evolution Phase A Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a registry-only tool evolution layer so Aionis can understand tool family and promotion metadata without changing current runtime selection behavior.

**Architecture:** Phase A is intentionally non-disruptive. Add a new internal tool-registry module, thread registry metadata into `tools/select` parsing and response metadata, and validate the registry with focused unit tests. Do not change final candidate ordering, replay behavior, or host-side candidate generation in this phase.

**Tech Stack:** TypeScript, Fastify route layer, Zod schemas, Node test runner (`node:test` / `tsx --test`)

---

### Task 1: Add the registry model and lookup helpers

**Files:**
- Create: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/src/memory/tool-registry.ts`
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/src/memory/tool-selector.ts`
- Test: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/tool-registry.test.mjs`

**Step 1: Write the failing test**

Create `scripts/ci/tool-registry.test.mjs` with coverage for:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildToolRegistryIndex,
  getToolRegistryRecord,
  mapCandidatesToFamilies,
} from "../../src/memory/tool-registry.ts";

test("tool registry returns configured family and tier for known tool", () => {
  const index = buildToolRegistryIndex([
    {
      tool_name: "read-source-focused-v2",
      capability_family: "focused_repo_read",
      capability_tags: ["repo_read", "file_targeted"],
      quality_tier: "preferred",
      status: "active",
      replacement_for: ["read-markdown-impl"],
      replaced_by: [],
    },
  ]);

  const record = getToolRegistryRecord(index, "read-source-focused-v2");
  assert.equal(record?.capability_family, "focused_repo_read");
  assert.equal(record?.quality_tier, "preferred");
});

test("tool registry maps unknown tools to null metadata without throwing", () => {
  const index = buildToolRegistryIndex([]);
  const mapped = mapCandidatesToFamilies(index, ["unknown-tool"]);
  assert.deepEqual(mapped, [
    {
      tool_name: "unknown-tool",
      capability_family: null,
      quality_tier: null,
      status: null,
      replacement_for: [],
      replaced_by: [],
    },
  ]);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test scripts/ci/tool-registry.test.mjs
```

Expected: FAIL because `src/memory/tool-registry.ts` does not exist.

**Step 3: Write minimal implementation**

Create `src/memory/tool-registry.ts` with:

- `ToolQualityTier = "experimental" | "supported" | "preferred" | "deprecated"`
- `ToolRegistryStatus = "active" | "disabled" | "shadow_only"`
- `ToolRegistryRecord`
- `ToolRegistryIndex`
- `buildToolRegistryIndex(records)`
- `getToolRegistryRecord(index, toolName)`
- `mapCandidatesToFamilies(index, candidates)`

Implementation should be minimal and pure:

```ts
export type ToolRegistryRecord = {
  tool_name: string;
  capability_family: string;
  capability_tags: string[];
  quality_tier: "experimental" | "supported" | "preferred" | "deprecated";
  status: "active" | "disabled" | "shadow_only";
  replacement_for: string[];
  replaced_by: string[];
};

export type ToolRegistryIndex = Map<string, ToolRegistryRecord>;

export function buildToolRegistryIndex(records: ToolRegistryRecord[]): ToolRegistryIndex {
  const out = new Map<string, ToolRegistryRecord>();
  for (const record of records) out.set(record.tool_name, record);
  return out;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test scripts/ci/tool-registry.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan add src/memory/tool-registry.ts scripts/ci/tool-registry.test.mjs
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan commit -m "feat(kernel): add tool registry primitives"
```

### Task 2: Expose registry metadata through `tools/select` without changing selection behavior

**Files:**
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/src/memory/tools-select.ts`
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/src/memory/schemas.ts`
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/src/sdk/types.ts`
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/packages/sdk/src/types.ts`
- Test: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/control-profile-tools-select.test.mjs`

**Step 1: Write the failing test**

Extend `scripts/ci/control-profile-tools-select.test.mjs` with a new case:

```js
test("tools/select includes capability-family metadata for known candidates without changing filtered order", async () => {
  const result = await selectTools(null, {
    scope: "openclaw:test",
    context: { source: "test-tools-select" },
    candidates: ["read-source-focused-v2", "read-markdown-impl"],
    strict: false,
  }, "memory", "default", {
    liteWriteStore: {
      insertExecutionDecision: async () => ({ id: "decision-1", created_at: new Date().toISOString() }),
      listRuleCandidates: async () => [],
    },
  });

  assert.deepEqual(result.selection.ordered, ["read-source-focused-v2", "read-markdown-impl"]);
  assert.equal(result.execution_kernel.tool_registry_present, true);
  assert.equal(result.execution_kernel.candidate_families[0].capability_family, "focused_repo_read");
  assert.equal(result.execution_kernel.candidate_families[0].quality_tier, "preferred");
});
```

Use a deterministic in-memory registry constant inside `tools-select.ts` for Phase A. Do not plumb storage or config yet.

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test scripts/ci/control-profile-tools-select.test.mjs
```

Expected: FAIL because `execution_kernel.tool_registry_present` and `candidate_families` do not exist yet.

**Step 3: Write minimal implementation**

Implement the minimum additive change:

1. Add a small static registry constant to `src/memory/tools-select.ts` for one or two clear family examples.
2. Use the new `tool-registry.ts` helpers to annotate normalized candidates.
3. Add response metadata only; do not change `selection.selected`, `selection.ordered`, or `applyToolPolicy` behavior in this task.
4. Add schema/type fields for response metadata.

Suggested response shape extension:

```ts
execution_kernel: {
  control_profile_origin: kernelInputs.controlProfileOrigin,
  execution_state_v1_present: !!kernelInputs.executionState,
  current_stage: kernelInputs.executionState?.current_stage ?? null,
  active_role: kernelInputs.executionState?.active_role ?? null,
  tool_registry_present: true,
  candidate_families: [
    {
      tool_name: "read-source-focused-v2",
      capability_family: "focused_repo_read",
      quality_tier: "preferred",
      status: "active",
      replacement_for: ["read-markdown-impl"],
      replaced_by: [],
    },
  ],
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test scripts/ci/control-profile-tools-select.test.mjs scripts/ci/tool-registry.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan add src/memory/tools-select.ts src/memory/schemas.ts src/sdk/types.ts packages/sdk/src/types.ts scripts/ci/control-profile-tools-select.test.mjs
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan commit -m "feat(kernel): expose tools-select registry metadata"
```

### Task 3: Add route-level contract coverage for the new metadata

**Files:**
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/src/routes/memory-feedback-tools.ts`
- Create: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/tool-evolution-tools-select-route.test.mjs`

**Step 1: Write the failing test**

Create a route-focused test that boots the relevant route registration and asserts the JSON contract includes the new execution-kernel metadata.

Skeleton:

```js
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerMemoryFeedbackToolRoutes } from "../../src/routes/memory-feedback-tools.ts";

test("POST /v1/memory/tools/select returns tool registry metadata", async () => {
  const app = Fastify();
  registerMemoryFeedbackToolRoutes({
    app,
    env: { MEMORY_SCOPE: "memory", MEMORY_TENANT_ID: "default", MAX_TEXT_LEN: 2000, PII_REDACTION: false },
    store: {
      withTx: async (fn) => fn({}),
      withClient: async (fn) => fn({}),
    },
    embeddedRuntime: null,
    liteWriteStore: {
      insertExecutionDecision: async () => ({ id: "decision-1", created_at: new Date().toISOString() }),
      listRuleCandidates: async () => [],
    },
    requireMemoryPrincipal: async () => ({ actor: "test" }),
    withIdentityFromRequest: (_req, body) => body,
    enforceRateLimit: async () => {},
    enforceTenantQuota: async () => {},
    tenantFromBody: () => "default",
    acquireInflightSlot: async () => ({ release() {} }),
  });

  const res = await app.inject({
    method: "POST",
    url: "/v1/memory/tools/select",
    payload: {
      scope: "openclaw:test",
      context: { source: "route-test" },
      candidates: ["read-source-focused-v2", "read-markdown-impl"],
      strict: false,
    },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.execution_kernel.tool_registry_present, true);
  assert.equal(body.execution_kernel.candidate_families[0].capability_family, "focused_repo_read");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test scripts/ci/tool-evolution-tools-select-route.test.mjs
```

Expected: FAIL until the route response shape is asserted correctly and any missing env/test scaffolding is added.

**Step 3: Write minimal implementation**

Only adjust route-facing serialization if needed. The preferred outcome is that no route logic change is required because `selectTools(...)` already returns the enriched object.

If minor fixes are needed, keep them additive and local to `memory-feedback-tools.ts` or the test harness.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test scripts/ci/tool-evolution-tools-select-route.test.mjs scripts/ci/control-profile-tools-select.test.mjs scripts/ci/tool-registry.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan add src/routes/memory-feedback-tools.ts scripts/ci/tool-evolution-tools-select-route.test.mjs
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan commit -m "test(kernel): cover tools-select registry metadata contract"
```

### Task 4: Document the Phase A boundary and explicitly defer selection changes

**Files:**
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/docs/internal/plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md`
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/docs/internal/progress/AIONIS_PROJECT_STATUS_2026-03-15.md`
- Modify: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md`

**Step 1: Write the failing documentation checkpoint**

Before editing, confirm the docs do not yet state the Phase A guardrail clearly.

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
rg -n "registry only|does not change selection|family metadata only" docs/internal || true
```

Expected: no matches or insufficient wording.

**Step 2: Write minimal documentation updates**

Add explicit wording that Phase A:

1. introduces registry metadata only
2. does not change final tool ordering
3. does not change replay behavior
4. exists to create observability before promotion logic

Suggested wording in `AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md`:

```md
Phase A is intentionally non-disruptive.
It adds capability metadata and response visibility, but it does not yet change:
1. final tool selection ordering
2. replay migration behavior
3. host-side candidate expansion
```

Add a short progress note in `AIONIS_PROJECT_STATUS_2026-03-15.md` that the first implementation slice should be metadata-first.

**Step 3: Run a documentation sanity check**

Run:

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
rg -n "registry only|does not change final tool selection ordering|metadata-first" docs/internal
```

Expected: matches in the updated docs.

**Step 4: Commit**

```bash
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan add docs/internal/plans/AIONIS_TOOL_EVOLUTION_PLAN_2026-03-17.md docs/internal/progress/AIONIS_PROJECT_STATUS_2026-03-15.md docs/internal/plans/AIONIS_EXECUTION_CONTINUITY_KERNEL_PHASE2_PLAN_2026-03-16.md
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan commit -m "docs(kernel): constrain tool evolution phase a rollout"
```

### Task 5: Run the minimum release-safe validation set

**Files:**
- Test: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/tool-registry.test.mjs`
- Test: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/control-profile-tools-select.test.mjs`
- Test: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/tool-evolution-tools-select-route.test.mjs`
- Test: `/Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan/scripts/ci/execution-continuity-phase1.test.mjs`

**Step 1: Run focused registry/select tests**

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npx tsx --test \
  scripts/ci/tool-registry.test.mjs \
  scripts/ci/control-profile-tools-select.test.mjs \
  scripts/ci/tool-evolution-tools-select-route.test.mjs
```

Expected: PASS.

**Step 2: Run continuity smoke to ensure no accidental regressions**

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
node --test scripts/ci/execution-continuity-phase1.test.mjs
```

Expected: PASS.

**Step 3: Run build**

```bash
cd /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan
npm run build
```

Expected: PASS.

**Step 4: Final commit**

```bash
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan status
```

Expected: clean working tree.

If any implementation files remain unstaged after Task 4, commit them before merge with:

```bash
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan add -A
git -C /Users/lucio/Desktop/Aionis-worktrees/tool-evolution-phase-a-plan commit -m "chore(kernel): finalize tool evolution phase a"
```

## Notes For Execution

1. Do not add replay migration in this plan.
2. Do not modify `applyToolPolicy(...)` ordering semantics in this plan.
3. Do not expand host candidate sets in this plan.
4. Treat unknown tools as valid candidates with null registry metadata.
5. Registry metadata must be observable before it becomes policy-bearing.

## Merge Gate

This plan is merge-ready only if all of the following stay true:

1. `tools/select` output gains registry metadata
2. `selection.ordered` remains backward-compatible for existing candidate sets
3. current continuity tests still pass
4. no replay behavior changes occur
5. docs explicitly state that Phase A is metadata-first
