# Aionis Thin MCP Execution Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a task-finalization adapter to the thin MCP so clients can record one high-confidence task outcome without relying on user confirmation prompts or a previously stored tool-selection decision.

**Architecture:** Keep the current four-tool thin MCP core. Add one thin adapter tool, `aionis_finalize_task`, that wraps the existing conservative feedback machinery and maps task-boundary outcomes onto the existing feedback pipeline. This stays within the "thin" surface while removing the current requirement that the client either ask the user or preserve a prior decision handle.

**Tech Stack:** TypeScript, zod, source-owned MCP server under `src/mcp`, node:test.

---

### Task 1: Extend the thin MCP plan/spec docs

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-thin-mcp-spec.md`
- Modify: `/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-thin-mcp.md`
- Modify: `/Volumes/ziel/Aionisgo/docs/AIONIS_THIN_MCP_GUIDE.md`

**Step 1: Define the adapter tool**

Document a fifth tool:
- `aionis_finalize_task`

Its job:
- record one high-confidence terminal outcome
- prefer task-boundary signals over conversational confirmation
- internally route through the same conservative feedback logic

**Step 2: Update recommended client behavior**

Change onboarding and client guidance from:
- "ask the user and then call `record_feedback`"

to:
- "call `aionis_finalize_task` when the task is clearly complete, blocked, or failed"
- treat user confirmation as optional extra evidence rather than required product behavior

### Task 2: Implement the adapter tool

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`

**Step 1: Add a `FinalizeTaskArgs` schema**

Required:
- `outcome` (`success | failed | blocked`)

Optional but expected for feedback-derived recording:
- `run_id`
- `selected_tool`
- `candidates`
- `context`
- `note`

**Step 2: Add `aionis_finalize_task` to tool definitions**

Description should make the intended use explicit:
- call once at a clear task boundary
- use instead of conversational prompt loops

**Step 3: Implement handler**

Map outcomes to the conservative signal protocol:
- `success` -> `task_completed`
- `failed` -> `task_blocked`
- `blocked` -> `task_blocked`

Reuse the existing `aionis_record_feedback` path internally so all feedback recording rules stay centralized.

**Step 4: Keep outputs compact**

Return:
- `feedback_recorded`
- `classification`
- `reason`
- `feedback_mode`
- resulting pattern summary if any

### Task 3: Add regression coverage

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-tools.test.ts`
- Modify: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Add tool-list coverage**

Assert that the thin MCP now exposes five tools and includes `aionis_finalize_task`.

**Step 2: Add task-finalization success coverage**

Cover:
- no prior pending decision
- explicit execution evidence
- `outcome = success`
- request records positive feedback through the existing route

**Step 3: Add task-finalization blocked/failure coverage**

Cover:
- `outcome = blocked`
- request records negative feedback through the existing route

### Task 4: Verify

**Files:**
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-tools.test.ts`

**Step 1: Run MCP tests**

Run:
```bash
npx tsx --test scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts scripts/ci/aionis-thin-mcp-tools.test.ts
```

Expected: PASS

**Step 2: Run typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: PASS

**Step 3: Run lite suite**

Run:
```bash
npm run -s test:lite
```

Expected: PASS
