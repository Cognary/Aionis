# Aionis Thin MCP Feedback Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `aionis_record_feedback` work even when the client skipped `aionis_select_tool`, as long as the client can provide explicit execution evidence.

**Architecture:** Keep the current decision-linked feedback path for the happy case. Add a second evidence-derived path in the thin MCP layer that synthesizes the minimal pending-decision shape needed for classification and forwards the explicit execution evidence to `/v1/memory/tools/feedback`, which already supports feedback-derived decision creation.

**Tech Stack:** TypeScript, zod, source-owned thin MCP under `src/mcp`, node:test.

---

### Task 1: Extend the thin MCP feedback contract

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`

**Step 1: Update `RecordFeedbackArgs`**

Add optional fallback fields:
- `selected_tool`
- `candidates`
- `context`

Keep `decision_id` / `run_id` optional. The contract should allow either:
- an existing pending decision reference, or
- explicit execution evidence for feedback-derived recording.

**Step 2: Update the tool schema**

Expose the new fallback fields in the `aionis_record_feedback` tool definition so MCP clients can see how to use the fallback path.

### Task 2: Implement evidence-derived feedback in thin MCP

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`

**Step 1: Add a helper to synthesize a pending decision**

When no stored pending decision exists, build a minimal in-memory pending object from:
- `selected_tool`
- `candidates`
- `context`
- optional `run_id`

**Step 2: Preserve conservative classification**

Run the same `classifyFeedbackSignal(...)` logic against the synthesized pending object. Do not weaken current abstain rules.

**Step 3: Forward feedback to the backend**

Call `/v1/memory/tools/feedback` with:
- `run_id`
- `selected_tool`
- `candidates`
- `context`
- `outcome`
- `target`
- `note`
- `input_text`

Do not send a fake `decision_id` in the fallback path. Let the backend create a feedback-derived decision if needed.

**Step 4: Return a clear operator result**

Include whether the record path was:
- `pending_decision`
- `feedback_derived`

Return a hard error when neither a pending decision nor explicit execution evidence is available.

### Task 3: Lock the regression in tests

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Add a fallback success test**

Cover:
- no prior pending decision
- `signal_kind = user_confirmed`
- explicit `selected_tool`, `candidates`, `context`
- request reaches `/v1/memory/tools/feedback`
- body omits `decision_id`
- body includes explicit execution evidence

**Step 2: Add a missing-evidence failure test**

Cover:
- no prior pending decision
- no explicit execution evidence
- result is an error with an actionable message

### Task 4: Verify

**Files:**
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Run MCP protocol tests**

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
