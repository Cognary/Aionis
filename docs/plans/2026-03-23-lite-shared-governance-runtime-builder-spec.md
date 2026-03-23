# Lite Shared Governance Runtime Builder Spec

## Goal

Unify the current Lite static governance provider wiring for replay, workflow, and tools behind one shared runtime builder.

## Scope

- Centralize env-gated static governance provider construction.
- Preserve current per-path semantics:
  - replay uses static `promote_memory` with current default confidence
  - workflow uses static `promote_memory` with the higher workflow-specific confidence
  - tools uses static `form_pattern`
- Keep route/runtime call sites small by consuming prebuilt provider groups.

## Non-Goals

- No public route contract changes.
- No model-backed provider yet.
- No policy/admissibility/apply semantic changes.

## Expected Result

- One shared builder constructs all current Lite static governance providers.
- Replay, workflow, and tools runtime paths consume the same builder output.
- Existing tests and route behavior remain unchanged.
