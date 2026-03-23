## Goal

Extract the current Lite mock governance model-client construction into one shared internal client factory, so later real internal model clients can replace mock clients without changing provider factory or runtime wiring.

## Scope

- Add a shared Lite governance model-client factory.
- Move current mock `promote_memory` and `form_pattern` client creation into that factory.
- Rewrite the governance provider factory to consume the model-client factory rather than direct mock client constructors.
- Add contract coverage for client factory output shape.

## Non-Goals

- No route contract changes.
- No provider precedence changes.
- No external model calls.

## Acceptance

- Provider factory no longer imports direct mock-client constructors.
- Shared client factory can build:
  - promote-memory-only client
  - form-pattern-only client
  - combined client
- Existing provider factory tests remain green.
