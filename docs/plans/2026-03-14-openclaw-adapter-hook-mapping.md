# OpenClaw Adapter v1 Hook Mapping

**Goal:** Define an adapter-first integration shape for OpenClaw that uses existing OpenClaw plugin hooks to connect Aionis policy, memory, handoff, replay, and loop-control capabilities without forking OpenClaw planner logic.

## Executive Summary

OpenClaw already exposes enough hook surface to build **Adapter v1**.

What exists today:

1. `before_agent_start`
2. `agent_end`
3. `before_tool_call`
4. `after_tool_call`
5. `tool_result_persist`
6. `before_message_write`
7. `session_start`
8. `session_end`

What does **not** exist today:

1. a generic `before_react_step` hook
2. a generic `after_react_step` hook
3. a planner-internal reasoning loop event stream

Therefore Adapter v1 should be defined as a:

**tool-loop control adapter**, not a full planner-loop controller.

This is still enough to solve the highest-value OpenClaw failure modes:

1. repeated high-cost tool loops
2. broad tool drift
3. repeated no-progress tool retries
4. missing decision traceability
5. failure to escape into handoff or replay when a run is degrading

---

## Architectural Split

### Aionis Loop Control Adapter

Reusable logic layer responsible for:

1. run/session state tracking
2. policy evaluation
3. tool selection gating
4. duplicate/no-progress detection
5. budget checks
6. stop reason generation
7. handoff/replay escape-hatch choice

### OpenClaw Binding

Thin binding responsible for:

1. subscribing to OpenClaw hooks
2. translating OpenClaw event payloads into adapter inputs
3. applying adapter outputs back into OpenClaw hook results
4. persisting summaries and diagnostics into Aionis

### Plugin Shell

Minimal package surface responsible for:

1. configuration
2. OpenClaw plugin registration
3. CLI/selfcheck exposure
4. wiring binding + adapter together

This keeps the control logic reusable and prevents loop-control semantics from being locked into one plugin file.

---

## Hook Inventory

The following hook capability is already present in OpenClaw.

### `before_agent_start`

Available context includes:

1. `prompt`
2. optional `messages`
3. `agentId`
4. `sessionKey`
5. `sessionId`
6. `workspaceDir`
7. `trigger`
8. `channelId`

Hook can return:

1. `prependContext`
2. `systemPrompt`
3. `modelOverride`
4. `providerOverride`

Use it for:

1. initial Aionis context injection
2. run bootstrap state initialization
3. run-level budget initialization
4. optional model/provider downgrade when risk profile is already bad

### `agent_end`

Available event includes:

1. `messages`
2. `success`
3. `error`
4. `durationMs`

Use it for:

1. final capture
2. final policy feedback writeback
3. final stop-reason summary
4. optional handoff store on degraded or partial completion

### `before_tool_call`

Available event/context includes:

1. `toolName`
2. `params`
3. `runId`
4. `toolCallId`
5. `sessionKey`
6. `sessionId`
7. `agentId`

Hook can return:

1. modified `params`
2. `block = true`
3. `blockReason`

This is the most important Adapter hook.

Use it for:

1. pre-tool policy gating
2. deny/allow decisions
3. tool downgrade or redirect by param rewrite
4. same-tool streak checks
5. duplicate/no-progress hard stops
6. broad-test and broad-scan suppression

### `after_tool_call`

Available event/context includes:

1. `toolName`
2. `params`
3. `runId`
4. `toolCallId`
5. `result`
6. `error`
7. `durationMs`
8. `sessionKey`
9. `sessionId`
10. `agentId`

Use it for:

1. post-tool feedback
2. decision trace capture
3. no-progress heuristic updates
4. token and duration burn estimates
5. replay capture side effects

### `tool_result_persist`

Available event/context includes:

1. `toolName`
2. `toolCallId`
3. transcript `message`
4. `isSynthetic`
5. `sessionKey`
6. `agentId`

Hook can return modified `message`.

Use it for:

1. embedding structured stop reasons into persisted transcript entries
2. tagging synthetic abort/repair results
3. trimming noisy tool payloads before persistence when necessary

### `before_message_write`

Available event/context includes:

1. transcript `message`
2. `sessionKey`
3. `agentId`

Hook can:

1. block message write
2. mutate message

Use it for:

1. final stop-summary insertion
2. transcript annotation for operator visibility
3. optional suppression of duplicated loop-noise messages

### `session_start` and `session_end`

Available context includes:

1. `sessionId`
2. `sessionKey`
3. `agentId`

Use them for:

1. adapter state initialization and cleanup
2. session-scoped statistics
3. continuity across `/new` and `/reset`

---

## Adapter State Model

The adapter should maintain a per-run state object keyed by:

1. `runId` when available
2. otherwise `sessionId`
3. otherwise `sessionKey`

Minimum fields:

1. `agentId`
2. `sessionKey`
3. `sessionId`
4. `runId`
5. `workspaceDir`
6. `promptHash`
7. `stepCount`
8. `sameToolStreak`
9. `duplicateObservationStreak`
10. `noProgressStreak`
11. `broadTestCount`
12. `broadScanCount`
13. `estimatedTokenBurn`
14. `estimatedLatencyBurnMs`
15. `lastToolName`
16. `lastToolParamsHash`
17. `lastObservationHash`
18. `lastDecisionId`
19. `lastDecisionUri`
20. `lastSelectedTool`
21. `forcedStopReason`
22. `handoffTriggered`
23. `replayDispatchAttempted`

This state belongs in the adapter, not in the plugin shell.

---

## Hook-to-Capability Mapping

## 1. Run Bootstrap

### Hook

`before_agent_start`

### Adapter inputs

1. prompt
2. workspaceDir
3. sessionKey/sessionId
4. agentId
5. trigger

### Aionis calls

1. optional `planning/context`
2. `context/assemble`
3. optional `rules/evaluate`

### Adapter outputs

1. initialize run state
2. inject `prependContext`
3. attach run-level risk profile
4. optionally downgrade model/provider for known risky run class

### Why here

This is the last safe point before the model starts its turn. It is the right place to inject compact context and initialize budgets.

---

## 2. Pre-Tool Gate

### Hook

`before_tool_call`

### Adapter inputs

1. tool name
2. tool params
3. run/session identity
4. loop state counters
5. workspace hints

### Aionis calls

1. `rules/evaluate`
2. `tools/select`
3. optional `tools/decision` pre-read when policy state already exists

### Adapter decisions

1. allow unchanged
2. allow with param rewrite
3. downgrade tool
4. block tool
5. stop run
6. escape to handoff/replay path

### Concrete examples

1. rewrite `grep -R` style tool params into narrower `rg` patterns
2. block second full-repo scan after same-query repetition
3. block second broad `pytest-all` after focused target already known
4. stop if same tool repeats with same params beyond threshold

### Why this matters

This hook is where loop-control becomes operational rather than observational.

---

## 3. Post-Tool Feedback

### Hook

`after_tool_call`

### Adapter inputs

1. tool name
2. tool params
3. tool result or error
4. duration
5. run/session identity

### Aionis calls

1. `tools/feedback`
2. `memory/write`
3. optional replay capture:
   - `replay/step/before`
   - `replay/step/after`

### Adapter state updates

1. increment `stepCount`
2. update duplicate output hash
3. update no-progress streak
4. update estimated burn
5. store latest decision trace

### Why this matters

Without post-tool writeback, pre-tool gating becomes stateless and the agent keeps rediscovering the same bad path.

---

## 4. Escape Hatch Selection

### Trigger points

Usually from `before_tool_call`, sometimes from `after_tool_call`.

### Conditions

1. `maxStepsExceeded`
2. `sameToolStreakExceeded`
3. `duplicateObservationStreakExceeded`
4. `noProgressStreakExceeded`
5. `budgetExceeded`
6. `policyDeniedOnlyPath`

### Aionis calls

1. `replay/playbooks/candidate`
2. `replay/playbooks/dispatch`
3. `handoff/store`

### Strategy order

1. if reusable workflow candidate exists, prefer replay dispatch
2. else if current state is still recoverable, store handoff
3. else hard stop with structured reason

### Why not in `agent_end`

By `agent_end`, the expensive damage is already done. Escape logic must happen while the loop is still trying to continue.

---

## 5. Transcript / Operator Visibility

### Hooks

1. `tool_result_persist`
2. `before_message_write`
3. `agent_end`

### Adapter outputs

1. structured stop reason annotation
2. decision trace annotation
3. handoff/replay transition annotation
4. suppression of duplicate loop-noise transcript artifacts when needed

### Reason codes

Minimum stable set:

1. `max_steps_exceeded`
2. `same_tool_streak_exceeded`
3. `duplicate_observation_exceeded`
4. `no_progress_exceeded`
5. `budget_exceeded`
6. `policy_denied_only_path`
7. `replay_dispatch_selected`
8. `handoff_store_selected`

---

## 6. Session Lifecycle

### Hooks

1. `session_start`
2. `session_end`

### Use

1. initialize session-scoped adapter state
2. clear orphan state on reset/end
3. correlate `/new` and `/reset` boundaries with Aionis scope/session identity

### Note

This is useful but not sufficient for loop control by itself. The heavy lifting is still `before_tool_call` and `after_tool_call`.

---

## What Adapter v1 Can Reliably Enforce

1. tool allow/deny decisions
2. param rewrites
3. broad-tool suppression
4. repeated-tool loop detection
5. duplicate observation loop detection
6. structured budget stops
7. decision/feedback persistence
8. replay/handoff escape transitions

---

## What Adapter v1 Cannot Reliably Enforce

1. planner-internal reasoning loop count
2. reasoning-only infinite loops without tool emission
3. semantic correctness of model plans before first tool call
4. exact token accounting unless OpenClaw exposes turn usage incrementally at the right phase

This boundary should be explicit in product messaging.

---

## Implementation Recommendation

### v1

Build:

1. `AionisLoopControlAdapter`
2. `OpenClawBinding`
3. plugin shell wiring

Do not put loop-control logic directly into one giant plugin file.

### File split recommendation

In `/Users/lucio/Desktop/aionis-openclaw-plugin/src/`:

1. `adapter/loop-control-adapter.ts`
2. `adapter/state.ts`
3. `adapter/heuristics.ts`
4. `binding/openclaw-hook-binding.ts`
5. `binding/event-normalizers.ts`
6. `binding/stop-reasons.ts`
7. keep `index.ts` as plugin shell and registration only

---

## Acceptance Criteria for Adapter v1

1. `before_tool_call` blocks or rewrites high-cost repeated tool paths
2. `after_tool_call` writes decision + feedback + loop evidence to Aionis
3. every forced stop has a stable reason code
4. replay candidate/dispatch is attempted before blind continuation when thresholds trip
5. handoff is stored when replay is unavailable but continuity is still valuable
6. plugin shell contains minimal orchestration glue, not full control logic

---

## Bottom Line

OpenClaw already has enough hook surface for an **Adapter-first Aionis integration**.

The right definition is:

**OpenClaw Binding + Aionis Tool-Loop Control Adapter**

not:

**A fully planner-aware ReAct controller**

That is still a meaningful and product-worthy integration, and it is the correct v1 target.
