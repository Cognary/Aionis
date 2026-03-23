## Goal

Add a minimal internal model-backed governance provider baseline to Lite without introducing any external model dependency or widening public route surface.

## Scope

- Add a mock internal governance model-client interface for:
  - `promote_memory`
  - `form_pattern`
- Add provider adapters that wrap a model client into the existing governance provider shape.
- Extend the shared Lite runtime provider builder so each live path can select:
  - mock-model-backed provider first
  - static provider fallback second
- Keep current default behavior unchanged unless new env gates are enabled.

## Non-Goals

- No network model calls.
- No async provider flow.
- No public request/response schema changes.
- No semantic changes to admissibility, policy-effect, or runtime apply.

## Acceptance

- Replay, workflow, and tools runtime builder paths can all select mock-model-backed providers through new env gates.
- Static provider behavior remains unchanged when mock-model gates are off.
- Builder tests prove model-backed provider precedence over static fallback.
