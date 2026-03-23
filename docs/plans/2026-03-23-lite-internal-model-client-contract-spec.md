## Goal

Define the first real internal governance model-client contract and explicit replacement points, so later internal model implementations can be swapped in without rewriting provider factories or runtime builders.

## Scope

- Add explicit contract types for:
  - governance model-client modes
  - governance model-client factory requests
  - governance model-client factory hooks
- Extend the shared model-client factory so it can consume an injected custom factory.
- Extend provider factory and runtime builder so they can accept internal replacement hooks while preserving current defaults.
- Keep all public routes unchanged.

## Non-Goals

- No external model calls.
- No default semantic changes.
- No public env rename.

## Acceptance

- Internal callers can inject a custom governance model-client factory.
- Runtime builder can select custom model-client mode per live path without changing route contracts.
- Existing default runtime behavior remains unchanged.
