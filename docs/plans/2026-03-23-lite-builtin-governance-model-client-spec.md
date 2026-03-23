## Goal

Add a first builtin internal governance model-client baseline so the current model-backed provider path no longer depends on wrapping static providers.

## Scope

- Add builtin internal governance model-client implementations for:
  - `promote_memory`
  - `form_pattern`
- Keep current output semantics aligned with the existing deterministic/mock baseline.
- Update the shared model-client factory so runtime provider paths can request builtin clients.
- Keep public route contracts and provider gate names unchanged.

## Non-Goals

- No external model calls.
- No async review resolution.
- No admissibility or policy-effect changes.

## Acceptance

- Model-backed provider paths can use builtin client implementations instead of static-provider wrapping.
- Existing replay/workflow/tools tests remain green.
- Client-factory tests cover builtin mode directly.
