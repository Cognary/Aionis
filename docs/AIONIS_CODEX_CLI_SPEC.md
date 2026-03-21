# Aionis Codex CLI Integration Spec

## Goal

Define the first real product-facing Aionis host path on top of Codex CLI.

The target is not "another integration experiment".
The target is a usable product shell where Aionis can participate in everyday coding work without relying on MCP prompt habits.

## Product Intent

Codex CLI is the preferred open host candidate because:

1. it is Apache-2.0 licensed
2. it exposes lifecycle hooks through `hooks.json`
3. it already supports shell-tool replacement and MCP composition
4. it is more open to deep integration than Claude Code

The first Codex CLI slice should make Aionis feel present in the task loop before full execution-evidence wiring exists.

## Product Shape

The product shape is:

1. user installs Codex CLI
2. user installs or points Codex hooks at an Aionis bridge command
3. Codex automatically injects Aionis task guidance at prompt submission time
4. later slices add execution evidence and task-boundary learning

The user should not need to:

1. manually call Aionis tools
2. remember prompt choreography
3. type "use Aionis now"

## First Release Scope

The first Codex CLI bridge slice should own three hook events:

1. `SessionStart`
2. `UserPromptSubmit`
3. `Stop`

The first slice should only make one of them materially product-visible:

1. `UserPromptSubmit`

That is the first place where the bridge can reliably see the actual task prompt and inject useful planning guidance.

## Why Start With `UserPromptSubmit`

`SessionStart` happens too early to know the real task.
`Stop` happens too late to reconstruct reliable execution evidence if the shell path was not bridged.

`UserPromptSubmit` is the first stable moment where the bridge knows:

1. session id
2. turn id
3. cwd
4. model
5. permission mode
6. raw task prompt

That is enough to call:

1. `POST /v1/memory/planning/context`

and feed the result back into Codex as additional task context.

## First-Slice Responsibilities

### 1. Session Start

For `SessionStart`, the bridge should:

1. parse the hook request
2. return a no-op continue response
3. avoid polluting the model with boilerplate startup text

This hook exists mainly to keep the integration boundary explicit and ready for later session-scoped state.

### 2. User Prompt Submit

For `UserPromptSubmit`, the bridge should:

1. normalize the Codex hook input into an Aionis task-start shape
2. call `POST /v1/memory/planning/context`
3. build a compact additional-context string from:
   - recommended workflows
   - candidate workflows
   - trusted pattern count
   - contested pattern count
   - planner explanation
4. return that string through the Codex hook output shape

The bridge should inject context only when Aionis has something meaningful to say.

### 3. Stop

For `Stop`, the first slice should:

1. parse the request
2. return a safe no-op continue response

The first slice should not guess task success at stop time.

## Runtime Mapping

The first slice maps to the current runtime like this:

1. `SessionStart`
   - no runtime call
2. `UserPromptSubmit`
   - `POST /v1/memory/planning/context`
3. `Stop`
   - no runtime call in v1

This is intentionally conservative.

## Bridge Output Contract

The bridge should emit valid Codex hook command output JSON.

For `UserPromptSubmit`, the normal shape is:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "..."
  }
}
```

For `SessionStart` and `Stop`, the normal shape is:

```json
{
  "continue": true
}
```

## Guidance Formatting Rules

Injected context must stay compact.

Good guidance should:

1. fit in a short block
2. prefer counts and top labels over raw payloads
3. not dump full planner packets
4. avoid adding noise when Aionis is empty

The bridge should prefer:

1. one short header line
2. a few factual bullets
3. one planner note when available

## Error Handling

The bridge must be safe by default.

If Aionis is unavailable or the input is malformed:

1. the hook should not block Codex
2. the bridge should degrade to a no-op continue response
3. later observability can be added separately

The first slice optimizes for non-breaking behavior over loud failure.

## Out Of Scope

The first Codex CLI slice does not need:

1. shell execution evidence capture
2. automatic tool-selection override
3. task-boundary finalization
4. persisted bridge-side session storage
5. rich UI or dashboard output

Those belong to later slices once the Codex host path is proven.

## Follow-On Slices

After the first slice, the next work should be:

1. shell-path bridge using Codex shell-tool replacement or wrapper integration
2. execution evidence capture
3. task-boundary finalization
4. learning visibility and onboarding guide

## Success Criteria

The first slice is good enough if:

1. a user can install one Codex hook command
2. Codex automatically receives Aionis planning guidance on prompt submit
3. empty Aionis state stays quiet
4. non-empty Aionis state becomes visible without MCP choreography
