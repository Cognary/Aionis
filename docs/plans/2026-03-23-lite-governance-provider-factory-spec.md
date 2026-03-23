## Goal

Extract the current Lite governance provider selection logic into one shared provider factory, so runtime builders no longer duplicate mock-model/static precedence rules.

## Scope

- Add a shared provider factory for:
  - `promote_memory`
  - `form_pattern`
- Move mock-model-first and static-fallback precedence into the factory.
- Keep the shared runtime builder as a thin env-to-factory mapper.
- Add contract tests for provider selection precedence and fallback behavior.

## Non-Goals

- No semantic changes to review generation.
- No route contract changes.
- No external model calls.

## Acceptance

- Runtime builder no longer contains provider selection branching.
- Provider factory proves:
  - mock-model-backed provider wins over static fallback
  - static fallback works when mock-model is off
  - disabled paths return `undefined`
