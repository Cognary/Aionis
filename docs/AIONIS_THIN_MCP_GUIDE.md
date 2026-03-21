# Aionis Thin MCP Guide

## Summary

The first Aionis thin MCP slice exposes five tools:

1. `aionis_get_planning_context`
2. `aionis_select_tool`
3. `aionis_record_feedback`
4. `aionis_finalize_task`
5. `aionis_introspect`

This MCP is designed to let an MCP-aware agent consume the stable execution-memory mainline without learning the full Aionis HTTP route surface.

## Minimal Setup

Start the Aionis runtime first:

```bash
npm run start:lite
```

Then register the MCP server with any stdio-capable MCP client using:

```bash
npm run -s mcp:aionis
```

Minimum environment:

1. `AIONIS_BASE_URL`
   - default: `http://localhost:3001`
2. `AIONIS_SCOPE`
   - default: `default`

Optional auth environment:

1. `AIONIS_AUTH_BEARER`
2. `AIONIS_API_KEY`
3. `AIONIS_ADMIN_TOKEN`

A generic stdio MCP registration should look like:

```json
{
  "command": "npm",
  "args": ["run", "-s", "mcp:aionis"],
  "env": {
    "AIONIS_BASE_URL": "http://127.0.0.1:3001",
    "AIONIS_SCOPE": "default"
  }
}
```

The first slice is designed for stdio MCP clients that can auto-call tools without requiring the user to manually prompt for each tool invocation.

## What It Solves

The thin MCP should help users:

1. stop repeating similar tasks from zero
2. let tool choice become more stable over time
3. keep default context compact while still surfacing execution guidance
4. see what Aionis learned after a task

## Tool Roles

### `aionis_get_planning_context`

Use at task start or when the goal changes materially.
It should return compact workflow and pattern guidance.

### `aionis_select_tool`

Use before choosing among concrete tools like `bash`, `edit`, or `test`.
It creates a pending decision that later feedback can attach to.

### `aionis_record_feedback`

Use only at high-confidence boundaries.
The first slice prefers fewer, cleaner feedback writes over noisy automatic learning.
It supports two modes:

1. `pending_decision`
   - preferred when the client previously called `aionis_select_tool`
2. `feedback_derived`
   - fallback when the client skipped `aionis_select_tool` but can still provide:
     - `selected_tool`
     - `candidates`
     - `context`

### `aionis_introspect`

Use after a task or when the user explicitly asks what Aionis learned.
It should make learned workflow and pattern state visible without leaking heavy debug surfaces by default.

### `aionis_finalize_task`

Use once at a clear task boundary.
This is the preferred thin-MCP path when the client wants to record a completed or blocked task without asking the user to confirm in a loop.

## Recommended Feedback Protocol

The thin MCP should not freely guess success or failure for every action.
It should classify signals conservatively and abstain when necessary.

Supported signal kinds:

1. `step_succeeded`
2. `step_failed`
3. `tool_reverted`
4. `task_completed`
5. `task_blocked`
6. `user_confirmed`
7. `user_rejected`
8. `unknown`

## Preferred Cold-Start Signals

In the first slice, the best feedback sources are:

1. `user_confirmed`
2. `user_rejected`

These should be treated as the highest-confidence cold-start signals because they come from explicit human judgment rather than model-side inference.

If the client already has a clear task-boundary completion signal, it should prefer `aionis_finalize_task` over conversational confirmation.

Optional confirmation examples:

1. "Did that work?"
2. "Is this the right direction?"

Map the answer to:

1. `user_confirmed`
2. `user_rejected`

## Signal Semantics

### Strong Positive

Use positive feedback only for:

1. explicit `user_confirmed`
2. explicit `task_completed`
3. validated `step_succeeded`

### Strong Negative

Use negative feedback only for:

1. explicit `user_rejected`
2. explicit `task_blocked`
3. explicit `tool_reverted`
4. clearly failed `step_failed`

### Abstain

Abstain when:

1. a command exits non-zero but is exploratory or diagnostic
2. an edit completed but has not yet been validated
3. the result is partial or mixed
4. the causal link between selected tool and outcome is unclear

## Special Cases

### Non-Zero `bash` Or `test`

A non-zero exit code alone should not automatically become negative feedback.
Only record negative feedback when the selected path is clearly treated as failed or abandoned.

### `edit`

An edit should not become positive just because the file write completed.
It should become positive only after validation or task completion.
If the edit is explicitly reverted as wrong, it should become negative.

## Recommended Onboarding Loop

1. run one real task
2. call `aionis_select_tool` before concrete steps
3. after the task, call `aionis_finalize_task`
4. call `aionis_introspect`
5. show the user what Aionis learned

This is the cleanest first-run path because it gives Aionis one high-confidence task-boundary outcome without relying on conversational confirmation loops.

## Minimal Client Setup Example

For a Claude Code style MCP client, the recommended behavior is:

1. register the stdio server with `npm run -s mcp:aionis`
2. let the client auto-call `aionis_get_planning_context` at task start
3. let the client auto-call `aionis_select_tool` before concrete tool choice
4. after the task, auto-call `aionis_finalize_task`
5. auto-call `aionis_introspect`

The user should not need to manually type "call Aionis now" to make the thin MCP useful.
If the client skipped `aionis_select_tool`, it should still record the terminal task outcome instead of dropping the feedback entirely.

Preferred fallback order:

1. call `aionis_finalize_task` with explicit `selected_tool`, `candidates`, and `context`
2. only fall back to `aionis_record_feedback` when the client already has a more specific step-boundary signal

## Minimal Onboarding Example

This is the recommended first-task flow for a Claude Code style MCP client.

### Task Example

User asks:

`Fix the export failure in the node tests.`

### Recommended MCP Sequence

1. call `aionis_get_planning_context`
   - purpose: check whether Aionis already has workflow or pattern guidance
2. call `aionis_select_tool`
   - candidates: `bash`, `edit`, `test`
   - purpose: pick the first concrete tool action
3. execute the selected tool path
4. after the task completes, call `aionis_finalize_task`
5. call `aionis_introspect`
6. summarize what Aionis learned

If the agent did not previously call `aionis_select_tool`, the fallback finalization/feedback call should still include:

1. `selected_tool`
2. `candidates`
3. `context`

### Example First-Task Outcome

After one successful task, the user should not expect a fully trusted pattern yet.
The expected result is closer to:

1. a candidate pattern or workflow was created
2. Aionis can explain what it started learning
3. the next similar task can begin to benefit from that state

### Example User-Facing Summary

After the first task, a client can say something like:

1. `Aionis learned a candidate tool pattern for export-repair work.`
2. `It is not trusted yet and still needs more evidence.`
3. `The next similar task can start from this candidate state instead of from zero.`

## Minimal Client Behavior

The first thin MCP slice works best if the client follows these rules:

1. auto-call `aionis_get_planning_context` at task start
2. auto-call `aionis_select_tool` before concrete tool choice
3. avoid auto-calling `aionis_record_feedback` from weak inferred signals
4. prefer `aionis_finalize_task` over conversational confirmation loops at task end
5. auto-call `aionis_introspect` after the first task so the learned state is visible

This keeps the first-run experience simple:

1. one real task
2. one task-boundary finalization call
3. one visible learning summary

## Feedback Fallback Rule

The thin MCP should not treat "no prior decision" as a dead end.

Recommended behavior:

1. if a pending decision exists, record feedback against it
2. otherwise, if the client knows the executed `selected_tool`, `candidates`, and `context`, call `aionis_finalize_task` or `aionis_record_feedback` in `feedback_derived` mode
3. only fail when neither a pending decision nor explicit execution evidence is available
