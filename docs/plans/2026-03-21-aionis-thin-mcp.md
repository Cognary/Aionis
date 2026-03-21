# Aionis Thin MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a thin, source-owned Aionis MCP server that exposes five execution-memory tools and uses a conservative feedback signal protocol plus a task-finalization adapter.

**Architecture:** Add a new `src/mcp/` stdio JSON-RPC MCP server that adapts stable Aionis HTTP routes into five tools. Keep the server thin: it should maintain only minimal pending-decision state and MCP-level feedback classification, while leaving workflow/pattern logic in the existing runtime. Task-finalization should wrap the existing feedback machinery rather than creating a second learning path.

**Tech Stack:** TypeScript, Node.js, stdio JSON-RPC 2.0, existing Fastify-backed Aionis HTTP routes, Zod-style route contracts.

---

### Task 1: Lock The Thin MCP Surface In Docs

**Files:**
- Create: `/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-thin-mcp-spec.md`
- Create: `/Volumes/ziel/Aionisgo/docs/plans/2026-03-21-aionis-thin-mcp.md`

**Step 1: Write the stable thin-MCP surface**

Document only these tools:

1. `aionis_get_planning_context`
2. `aionis_select_tool`
3. `aionis_record_feedback`
4. `aionis_finalize_task`
5. `aionis_introspect`

**Step 2: Write the feedback signal protocol**

Document:

1. pending decision lifecycle
2. high-confidence positive signals
3. high-confidence negative signals
4. abstain rules
5. special handling for non-zero `bash` exits and `edit` revert behavior
6. explicit ordering that prefers `user_confirmed` and `user_rejected` during onboarding

**Step 3: Save the docs and review**

Check that the docs explicitly say:

1. no `context_assemble` tool in v1
2. no raw API parity goal
3. no user-required prompt choreography

### Task 2: Add A Source-Owned MCP Server Skeleton

**Files:**
- Create: `/Volumes/ziel/Aionisgo/src/mcp/aionis-mcp.ts`
- Create: `/Volumes/ziel/Aionisgo/src/mcp/client.ts`
- Create: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`
- Create: `/Volumes/ziel/Aionisgo/src/mcp/session-state.ts`
- Modify: `/Volumes/ziel/Aionisgo/package.json`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/lite-source-scope.test.mjs`

**Step 1: Write the failing source-scope test expectation**

Make sure source scope now intentionally includes `src/mcp/aionis-mcp.ts`.

**Step 2: Add a minimal stdio JSON-RPC server**

Implement:

1. `initialize`
2. `tools/list`
3. `tools/call`
4. `shutdown`
5. `exit`

**Step 3: Add basic HTTP client helpers**

Create a shared client that posts JSON to the existing Aionis base URL.

**Step 4: Register the tool definitions**

List:

1. planning context
2. select tool
3. record feedback
4. finalize task
5. introspect

**Step 5: Add an npm entrypoint**

Add a script that runs the thin MCP from source.

### Task 3: Implement The Two Read Tools

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/client.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-tools.test.ts`

**Step 1: Add `aionis_get_planning_context`**

Map to:

1. `POST /v1/memory/planning/context`

Return a compact MCP-facing shape based on:

1. `planner_packet`
2. `workflow_signals`
3. `pattern_signals`
4. `planning_summary`
5. `execution_kernel`

**Step 2: Add `aionis_select_tool`**

Map to:

1. `POST /v1/memory/tools/select`

Expose:

1. selected tool
2. trusted-pattern provenance
3. decision identifier
4. candidates

**Step 3: Write route-adapter tests**

Verify:

1. both MCP tools call the correct HTTP routes
2. outputs remain compact
3. no heavy debug surface is leaked

### Task 4: Implement Pending Decision State

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/session-state.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Add pending decision storage**

Store:

1. `decision_id`
2. `run_id`
3. `selected_tool`
4. candidate list
5. minimal task/step summary
6. timestamp

**Step 2: Store a pending decision after `aionis_select_tool`**

Do not add any extra persistence layer in v1; keep it session-local.

**Step 3: Write failing protocol tests**

Cover:

1. one pending decision per decision id
2. duplicate weak signals do not cause duplicate feedback writes
3. clearing of pending decisions after final classification

### Task 5: Implement The Conservative Feedback Protocol

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/session-state.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Add MCP-level feedback signal parsing**

Accept:

1. `step_succeeded`
2. `step_failed`
3. `tool_reverted`
4. `task_completed`
5. `task_blocked`
6. `user_confirmed`
7. `user_rejected`
8. `unknown`

Make explicit that `user_confirmed` and `user_rejected` are the preferred first-slice onboarding signals.

**Step 2: Implement positive mapping**

Map only strong signals to route `positive`.

**Step 3: Implement negative mapping**

Map only strong signals to route `negative`.

**Step 4: Implement abstain**

If the signal is ambiguous:

1. do not call `/v1/memory/tools/feedback`
2. return `feedback_recorded = false`
3. return `classification = abstain`

**Step 5: Add edit-specific defer behavior**

`edit` should not become positive just because the write completed.

**Step 6: Add bash/test non-zero guard**

A non-zero exit alone should not be negative unless the step is clearly treated as failed.

### Task 6: Implement Introspection And Cold-Start Visibility

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/src/mcp/tools.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-tools.test.ts`

**Step 1: Add `aionis_introspect`**

Map to:

1. `POST /v1/memory/execution/introspect`

**Step 2: Keep the output compact**

Highlight:

1. workflow counts and current guidance
2. pattern counts and credibility
3. most recent learning/progression summary

**Step 3: Add a cold-start onboarding test**

Verify:

1. first task can create candidate learned state
2. introspect shows the learned state afterward
3. user-visible summary explains "learned but not trusted yet"
4. task finalization is the preferred cold-start completion path, with explicit user confirmation as optional extra evidence

### Task 7: Wire Up Benchmark-Oriented Coverage

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/scripts/lite-real-task-benchmark.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Add MCP-level protocol checks**

Cover:

1. ambiguous command failure abstains
2. explicit revert yields negative
3. explicit success after validation yields positive

**Step 2: Add a thin-MCP onboarding loop**

Benchmark:

1. first task creates visible candidate learning
2. second similar task benefits from guidance
3. task finalization is the preferred cold-start completion path, with explicit user confirmation as optional extra evidence

### Task 8: Documentation And Release Integration

**Files:**
- Modify: `/Volumes/ziel/Aionisgo/README.md`
- Modify: `/Volumes/ziel/Aionisgo/docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md`
- Create: `/Volumes/ziel/Aionisgo/docs/AIONIS_THIN_MCP_GUIDE.md`

**Step 1: Add README entry points**

Explain:

1. what the thin MCP is
2. which five tools it exposes
3. who should use it

**Step 2: Document the feedback signal protocol**

Make the conservative `record_feedback` behavior explicit.

**Step 3: Document cold-start onboarding**

Show the first-task and second-task user value model.

### Task 9: Verification

**Files:**
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-tools.test.ts`
- Test: `/Volumes/ziel/Aionisgo/scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts`

**Step 1: Run source and route-adapter tests**

Run:

```bash
npx tsx --test scripts/ci/aionis-thin-mcp-tools.test.ts scripts/ci/aionis-thin-mcp-feedback-protocol.test.ts
```

Expected:

1. PASS

**Step 2: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected:

1. PASS

**Step 3: Run lite baseline**

Run:

```bash
npm run -s test:lite
```

Expected:

1. PASS

**Step 4: Commit**

```bash
git add docs/plans/2026-03-21-aionis-thin-mcp-spec.md docs/plans/2026-03-21-aionis-thin-mcp.md src/mcp package.json scripts/ci README.md docs/LITE_GOVERNANCE_AND_STRATEGY_STATUS.md docs/AIONIS_THIN_MCP_GUIDE.md
git commit -m "Add thin MCP planning and feedback protocol"
```
