# Aionis Execution Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first adapter-first execution loop for Aionis so a coding client can use planning, selection, evidence capture, and task finalization without relying on prompt-level orchestration.

**Architecture:** Add a source-owned adapter layer that normalizes client execution events into existing Aionis runtime route calls. Keep thin MCP as a compatibility and introspection layer while moving automatic execution-loop behavior into adapter-owned hooks and ephemeral session state.

**Tech Stack:** TypeScript, existing Aionis runtime routes, node:test, zod, source-owned adapter code under `src/adapter/`.

---

### Task 1: Create adapter source structure and contracts

**Files:**
- Create: `src/adapter/aionis-adapter.ts`
- Create: `src/adapter/contracts.ts`
- Create: `src/adapter/session-state.ts`
- Test: `scripts/ci/aionis-execution-adapter-contract.test.ts`

**Step 1: Write the failing contract test**

Define tests for:

1. normalized `task_started`
2. normalized `tool_selection_requested`
3. normalized `tool_executed`
4. normalized terminal task outcomes

**Step 2: Run test to verify it fails**

Run:

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts
```

Expected:

1. missing adapter modules
2. missing exported contract helpers

**Step 3: Add minimal adapter contracts**

Implement:

1. task event types
2. normalized tool execution evidence types
3. terminal task outcome types

**Step 4: Run test to verify it passes**

Run:

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts
```

**Step 5: Commit**

```bash
git add src/adapter/contracts.ts src/adapter/session-state.ts src/adapter/aionis-adapter.ts scripts/ci/aionis-execution-adapter-contract.test.ts
git commit -m "Add Aionis adapter contracts"
```

### Task 2: Implement task-start planning hook

**Files:**
- Modify: `src/adapter/aionis-adapter.ts`
- Modify: `src/adapter/session-state.ts`
- Test: `scripts/ci/aionis-execution-adapter-contract.test.ts`

**Step 1: Write the failing test**

Add a case asserting that `task_started`:

1. calls planning once
2. stores planning context in adapter session state

**Step 2: Run the targeted test**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts
```

Expected:

1. task-start hook missing

**Step 3: Implement the minimal hook**

Add:

1. `beginTask(...)`
2. planning context request mapping
3. session-state cache for the active task

**Step 4: Run the test again**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts
```

**Step 5: Commit**

```bash
git add src/adapter/aionis-adapter.ts src/adapter/session-state.ts scripts/ci/aionis-execution-adapter-contract.test.ts
git commit -m "Add adapter task-start planning hook"
```

### Task 3: Implement pre-tool selection hook

**Files:**
- Modify: `src/adapter/aionis-adapter.ts`
- Modify: `src/adapter/session-state.ts`
- Test: `scripts/ci/aionis-execution-adapter-contract.test.ts`

**Step 1: Write the failing test**

Add a case asserting that pre-tool selection:

1. calls tool selection before `bash`, `edit`, or `test`
2. stores the decision handle when available
3. returns preferred ordering and provenance

**Step 2: Run the targeted test**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts
```

Expected:

1. selection hook missing

**Step 3: Implement minimal selection support**

Add:

1. `beforeToolUse(...)`
2. tool-candidate normalization
3. session-state storage for the last selection result

**Step 4: Run the test again**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts
```

**Step 5: Commit**

```bash
git add src/adapter/aionis-adapter.ts src/adapter/session-state.ts scripts/ci/aionis-execution-adapter-contract.test.ts
git commit -m "Add adapter pre-tool selection hook"
```

### Task 4: Implement execution evidence capture

**Files:**
- Modify: `src/adapter/aionis-adapter.ts`
- Modify: `src/adapter/session-state.ts`
- Test: `scripts/ci/aionis-execution-adapter-feedback.test.ts`

**Step 1: Write the failing test**

Create a new test file that asserts:

1. validated step success produces positive evidence
2. reverted step produces negative evidence
3. ambiguous step outcomes abstain

**Step 2: Run the targeted test**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-feedback.test.ts
```

Expected:

1. evidence normalization missing

**Step 3: Implement minimal evidence capture**

Add:

1. `recordToolOutcome(...)`
2. explicit abstain behavior
3. feedback-derived fallback when no prior decision exists

**Step 4: Run the test again**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-feedback.test.ts
```

**Step 5: Commit**

```bash
git add src/adapter/aionis-adapter.ts src/adapter/session-state.ts scripts/ci/aionis-execution-adapter-feedback.test.ts
git commit -m "Add adapter execution evidence capture"
```

### Task 5: Implement task-boundary finalization

**Files:**
- Modify: `src/adapter/aionis-adapter.ts`
- Test: `scripts/ci/aionis-execution-adapter-feedback.test.ts`

**Step 1: Write the failing test**

Add cases asserting:

1. `completed` finalizes once
2. `blocked` finalizes once
3. repeated finalize calls do not duplicate completion learning

**Step 2: Run the targeted test**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-feedback.test.ts
```

Expected:

1. finalize hook missing or duplicate finalization

**Step 3: Implement minimal finalization**

Add:

1. `finalizeTask(...)`
2. task terminal-state guard
3. one-shot task finalization behavior

**Step 4: Run the test again**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-feedback.test.ts
```

**Step 5: Commit**

```bash
git add src/adapter/aionis-adapter.ts scripts/ci/aionis-execution-adapter-feedback.test.ts
git commit -m "Add adapter task finalization"
```

### Task 6: Add a first concrete client bridge

**Files:**
- Create: `src/adapter/claude-code-bridge.ts`
- Test: `scripts/ci/aionis-claude-code-bridge.test.ts`
- Docs: `docs/AIONIS_EXECUTION_ADAPTER_SPEC.md`

**Step 1: Write the failing bridge test**

Assert that the bridge can:

1. translate a task start
2. translate a pre-tool event
3. translate a terminal task event

**Step 2: Run the targeted test**

```bash
npx tsx --test scripts/ci/aionis-claude-code-bridge.test.ts
```

Expected:

1. missing bridge module

**Step 3: Implement the minimal bridge**

The first bridge may stay local and thin. It only needs:

1. event normalization
2. adapter method calls
3. no UI

**Step 4: Run the test again**

```bash
npx tsx --test scripts/ci/aionis-claude-code-bridge.test.ts
```

**Step 5: Commit**

```bash
git add src/adapter/claude-code-bridge.ts scripts/ci/aionis-claude-code-bridge.test.ts docs/AIONIS_EXECUTION_ADAPTER_SPEC.md
git commit -m "Add first Claude Code adapter bridge"
```

### Task 7: Keep thin MCP aligned as a secondary layer

**Files:**
- Modify: `docs/AIONIS_THIN_MCP_GUIDE.md`
- Modify: `docs/AIONIS_ADAPTER_DIRECTION.md`
- Modify: `docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md`

**Step 1: Update docs**

Clarify:

1. adapter is the preferred mainline
2. thin MCP remains the compatibility and introspection surface
3. MCP should not grow into the primary execution loop

**Step 2: Review docs manually**

Check for contradictions between:

1. adapter direction
2. MCP guide
3. governance status

**Step 3: Commit**

```bash
git add docs/AIONIS_THIN_MCP_GUIDE.md docs/AIONIS_ADAPTER_DIRECTION.md docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md
git commit -m "Align docs around adapter-first direction"
```

### Task 8: Run release-level verification

**Files:**
- Test only

**Step 1: Run adapter tests**

```bash
npx tsx --test scripts/ci/aionis-execution-adapter-contract.test.ts scripts/ci/aionis-execution-adapter-feedback.test.ts scripts/ci/aionis-claude-code-bridge.test.ts
```

**Step 2: Run TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Run Lite test baseline**

```bash
npm run -s test:lite
```

**Step 4: Commit**

```bash
git add -A
git commit -m "Ship first Aionis execution adapter baseline"
```

## Notes

Implementation should stay conservative:

1. reuse existing route contracts
2. keep adapter state ephemeral
3. do not add new persistent stores
4. do not grow thin MCP at the same time
5. prefer one concrete client bridge over premature generalization
