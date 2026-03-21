# Aionis Thin MCP Spec

Date: 2026-03-21
Status: Proposed

## Summary

Add a thin, execution-memory-first MCP surface for Aionis that lets MCP-aware agents consume the stable product mainline without learning the full HTTP route surface.

The first slice should stay intentionally small:

1. `aionis_get_planning_context`
2. `aionis_select_tool`
3. `aionis_record_feedback`
4. `aionis_finalize_task`
5. `aionis_introspect`

The core design constraint is that this MCP must expose stable product behavior, not raw internal API breadth.
It should help an agent:

1. start a task with workflow and pattern guidance
2. choose tools with learned policy support
3. record high-confidence feedback after execution
4. finalize a task with one high-confidence terminal outcome
5. show the user what Aionis has learned

## Goals

The first thin MCP slice should:

1. expose no more than five tools
2. map directly onto the existing execution-memory mainline
3. work well when the MCP client auto-calls tools without prompt choreography
4. preserve the slim/default product surface boundary
5. make cold start visible by showing what Aionis learned after the first task

## Non-Goals

The first slice should not:

1. mirror the full HTTP API
2. expose `context_assemble` or `rehydrate_payload` as first-class MCP tools
3. expose raw governance/admin surfaces beyond what is already stable
4. require the user to hand-write prompts like "call Aionis now"
5. auto-record negative feedback from weak or ambiguous execution signals

## Primary User Problem

This MCP is not mainly about "API convenience".
It should solve these user-facing problems:

1. repeated tasks keep starting from zero
2. tool choice is inconsistent and does not improve over time
3. useful execution experience is buried inside large raw context
4. users cannot easily see what the system has learned after a task

The MCP should make Aionis feel like a native execution-memory service inside an MCP-capable agent client.

## Target Caller Model

The intended caller is the MCP-aware agent runtime, not the human user.

Expected interaction model:

1. the user installs/configures the Aionis MCP server once
2. the agent auto-calls Aionis tools when useful
3. the user may explicitly call `aionis_introspect` when they want to inspect learned state

This means the MCP contract must be optimized for:

1. low-friction auto-calling
2. stable and compact outputs
3. conservative automatic feedback behavior

## Tool Surface

### 1. `aionis_get_planning_context`

Purpose:

1. provide workflow and pattern guidance at task start or major task shift

Backed by:

1. `POST /v1/memory/planning/context`

Expected use:

1. before a new task starts
2. when the task goal changes materially
3. when the agent needs fresh execution guidance

### 2. `aionis_select_tool`

Purpose:

1. provide tool-selection guidance before a concrete tool action

Backed by:

1. `POST /v1/memory/tools/select`

Expected use:

1. before picking among concrete candidates like `bash`, `edit`, `test`
2. before a step that is shaped enough to produce a meaningful tool decision

### 3. `aionis_record_feedback`

Purpose:

1. convert high-confidence execution outcomes into learned policy feedback

Backed by:

1. `POST /v1/memory/tools/feedback`

Expected use:

1. after a tool decision reaches a clear success or failure boundary
2. only for high-confidence signals
3. not for every tool call

### 4. `aionis_introspect`

Purpose:

1. show the current learned workflow and pattern state
2. make cold start visible after the first task

Backed by:

1. `POST /v1/memory/execution/introspect`

Expected use:

1. after a task completes
2. after the first task in onboarding
3. when the user explicitly asks what Aionis learned

### 5. `aionis_finalize_task`

Purpose:

1. record one high-confidence terminal task outcome without forcing conversational confirmation loops

Backed by:

1. thin MCP adapter over `POST /v1/memory/tools/feedback`

Expected use:

1. once at a clear task boundary
2. when the client knows the task completed, failed, or blocked
3. as the preferred thin-MCP completion path

## Cold-Start Product Behavior

Aionis should not try to oversell first-run guidance.

The first-day value proposition is:

1. do one real task
2. let the agent record high-confidence feedback
3. show the user what was learned with `aionis_introspect`

The ideal first-task experience is not:
"Aionis already knows what to do."

It is:
"Aionis has started learning your workflow and tool policy."

That means the onboarding loop should be:

1. start task
2. optionally call `aionis_get_planning_context`
3. call `aionis_select_tool` before concrete steps
4. call `aionis_record_feedback` only on high-confidence step boundaries
5. call `aionis_finalize_task` at the terminal task boundary
6. call `aionis_introspect` after the task and summarize the learned candidate state

The preferred first-run onboarding variant is:

1. run one real task
2. call `aionis_finalize_task` with the terminal task outcome
3. optionally add explicit user confirmation as extra evidence
4. call `aionis_introspect` and show what Aionis learned

This should produce cleaner first-run learning than relying only on inferred success or failure, without forcing the user through a confirmation loop.

## Feedback Signal Protocol

This is the most important design detail for the thin MCP.

The MCP should not ask the model to freely improvise "success" or "failure" for every tool call.
Instead, it should implement a conservative feedback signal protocol.

### Pending Decision Model

Each `aionis_select_tool` response should create a local pending decision record inside the MCP session state:

1. `decision_id`
2. `run_id`
3. `selected_tool`
4. candidate list
5. step/task context summary
6. decision timestamp

`aionis_record_feedback` should prefer one of these pending decisions.

But the first slice should also support a fallback `feedback_derived` mode when the client skipped `aionis_select_tool` and can still provide:

1. `selected_tool`
2. candidate list
3. step/task context summary

This keeps the MCP usable even when the client did not follow the ideal tool ordering.

### Allowed Automatic Outcomes

The MCP should classify execution into three buckets:

1. `positive`
2. `negative`
3. `abstain`

`abstain` means: do not auto-call `tools/feedback`.

The MCP should only emit `positive` or `negative` when the signal is high-confidence.

The first slice should prefer feedback sources in this order:

1. explicit task-boundary success or failure
2. explicit human confirmation
3. validated step success or explicit revert
4. everything else

That means `user_confirmed` and `user_rejected` remain strong optional cold-start signals, but they should not be the only productized completion path.

### Positive Feedback Signals

The first slice should automatically emit `positive` only for these cases:

1. `bash` or `test`
   - exit code is `0`
   - and the agent clearly advances to the next step without treating the command as a failure
2. `edit`
   - the edit is not immediately reverted
   - and a subsequent step validates or continues the intended workflow
3. explicit task completion
   - the selected tool contributed to a completed step or completed task
4. explicit user confirmation
   - the user accepts the result of the selected step or task
   - this should be treated as the highest-confidence cold-start positive signal

### Negative Feedback Signals

The first slice should automatically emit `negative` only for these cases:

1. `bash` or `test`
   - exit code is non-zero
   - and the agent explicitly treats that step as failed or blocked
2. `edit`
   - the change is explicitly reverted because it was wrong
   - or the agent states that the edit failed and switches to a different recovery path
3. explicit user rejection
   - the user rejects the selected approach or result
   - this should be treated as the highest-confidence cold-start negative signal
4. explicit same-step abandonment
   - the selected tool path is abandoned and replaced after a clear failure signal

### Abstain Rules

The MCP should abstain and not auto-call `record_feedback` when:

1. a command exits non-zero but is being used for exploration or diagnosis
2. an edit is later changed for normal iteration rather than explicit rollback
3. the agent cannot tell whether a step succeeded
4. multiple tools contributed and the causal signal is unclear
5. the execution result is partial, mixed, or ambiguous

This is the first-slice rule:

**when in doubt, do not learn from it automatically**

### Special Cases

#### Non-zero `bash` exit code

A non-zero exit code alone should not automatically mean negative feedback.

It should only become negative if:

1. the command was the selected step action
2. the agent clearly treats the result as a failed path
3. the agent abandons or replaces that path because of the failure

Otherwise, abstain.

#### `edit` later reverted

An edit should not receive immediate positive feedback just because the write completed.

For `edit`, the MCP should defer classification until one of these happens:

1. the next step validates the edit
2. the task completes with the edit intact
3. the edit is explicitly reverted as wrong

This avoids unstable "edit succeeded" signals.

### First-Slice Feedback State Machine

1. ideally `aionis_select_tool` produces a pending decision
2. tool executes
3. MCP collects tool result and agent step outcome
4. MCP classifies as `positive`, `negative`, or `abstain`
5. MCP calls `aionis_record_feedback` only for `positive` or `negative`
6. if a pending decision exists, clear it after final classification
7. otherwise, use `feedback_derived` mode with explicit execution evidence

The first slice should guarantee:

1. at most one automatic feedback call per pending decision
2. no automatic replay of duplicate weak signals
3. no automatic negative call for ambiguous failures

## MCP-Level Input Shape For `aionis_record_feedback`

The MCP tool should not require end users to manually set `positive` or `negative`.
The MCP-level tool contract should accept a higher-level signal shape and map it internally to the HTTP route.

Recommended MCP input:

1. `decision_id` or pending-decision handle when available
2. otherwise explicit `selected_tool`, candidate list, and `context`
3. `signal_kind`
4. optional `note`
5. optional `user_confirmed`
6. optional `step_status`

Initial `signal_kind` vocabulary:

1. `step_succeeded`
2. `step_failed`
3. `tool_reverted`
4. `task_completed`
5. `task_blocked`
6. `user_confirmed`
7. `user_rejected`
8. `unknown`

Mapping rule:

1. strong success signals map to route `positive`
2. strong failure signals map to route `negative`
3. `unknown` maps to abstain and produces no route call

When available, `user_confirmed` and `user_rejected` should be preferred over inferred signals.

This lets the MCP keep the HTTP route contract small while stabilizing auto-calling semantics.

## Output Design

Outputs should stay compact.

For `aionis_record_feedback` and `aionis_finalize_task`, the MCP should return a short structured result:

1. `feedback_recorded: true|false`
2. `classification: positive|negative|abstain`
3. `reason`
4. `feedback_mode: pending_decision|feedback_derived`
5. if recorded, the resulting pattern state summary

This is important for cold start because the user should be able to see:

1. whether Aionis learned from the step
2. if not, why it abstained

## Task-Finalization Adapter

`aionis_finalize_task` should be the preferred thin-MCP completion path.

Recommended mapping:

1. `success` -> `task_completed`
2. `failed` -> `task_blocked`
3. `blocked` -> `task_blocked`

It should prefer:

1. an existing pending decision when present
2. otherwise explicit `selected_tool`, candidate list, and `context`

## Architecture Notes

The thin MCP should be source-owned and implemented in `src/mcp/`, not by editing generated `dist/` artifacts.

It should likely reuse the current stdio JSON-RPC framing pattern already visible in the built MCP server, but the source of truth should move back into the repository source tree.

The MCP server should remain an adapter layer:

1. translate MCP tool inputs into stable Aionis HTTP requests
2. maintain minimal pending-decision session state
3. implement conservative feedback classification
4. keep product boundaries compact

## Testing Requirements

The thin MCP first slice should ship with:

1. tool-list contract coverage
2. per-tool request/response contract tests
3. feedback signal protocol tests
4. cold-start onboarding test
5. no-regression coverage for slim/default product boundaries

The most important MCP-specific tests are:

1. `record_feedback` abstains on ambiguous command failure
2. `record_feedback` defers `edit` success until validation or completion
3. `record_feedback` maps explicit revert to negative
4. `record_feedback` can still write high-confidence feedback without a prior pending decision when explicit execution evidence is provided
5. onboarding introspection shows newly learned candidate state after the first task
