# Aionis Adapter Wrapper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first wrapper-oriented client wiring layer on top of the adapter sidecar so command-backed client steps can participate in Aionis automatically.

**Architecture:** Add a narrow source-owned wrapper in `src/adapter/` that reuses the sidecar in-process, executes real command-backed steps through an injected runner, and forwards normalized lifecycle events to the sidecar.

**Tech Stack:** TypeScript, node:test, child_process, existing adapter sidecar contracts under `src/adapter/`.

---

### Task 1: Define the wrapper baseline

**Files:**
- Create: `docs/AIONIS_ADAPTER_WRAPPER_SPEC.md`
- Create: `docs/plans/2026-03-21-aionis-adapter-wrapper.md`

**Step 1: Write the scope**

Define:

1. why the wrapper exists
2. why the first slice is command-backed
3. what stays in the sidecar
4. what stays out of scope

### Task 2: Implement the command-backed wrapper

**Files:**
- Create: `src/adapter/wrapper.ts`
- Test: `scripts/ci/aionis-adapter-wrapper.test.ts`

**Step 1: Write the failing wrapper test**

Assert that the wrapper can:

1. start a task
2. request tool selection
3. execute one command-backed step
4. forward the step result into the sidecar
5. finalize the task
6. introspect learned state

**Step 2: Run test to verify it fails**

```bash
npx tsx --test scripts/ci/aionis-adapter-wrapper.test.ts
```

**Step 3: Implement the minimal wrapper**

Add:

1. an injected command runner contract
2. a default local command runner
3. wrapper methods for start, select, execute step, finalize, introspect

**Step 4: Run test to verify it passes**

```bash
npx tsx --test scripts/ci/aionis-adapter-wrapper.test.ts
```

### Task 3: Fold the wrapper into the Lite verification baseline

**Files:**
- Modify: `package.json`

**Step 1: Add the wrapper test to `test:lite`**

**Step 2: Run verification**

```bash
npx tsx --test scripts/ci/aionis-adapter-wrapper.test.ts
npx tsc --noEmit
npm run -s test:lite
```

### Notes

The wrapper should stay narrow:

1. command-backed first
2. no editor hook fiction
3. no second state machine
4. sidecar remains the event contract boundary
