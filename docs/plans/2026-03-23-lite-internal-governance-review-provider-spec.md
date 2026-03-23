# Lite Internal Governance Review Provider Spec

## Goal

Introduce the first internal governance review-provider interface so governed runtime flows can
optionally obtain bounded review results without widening external Lite route contracts.

## Scope

This slice only adds an internal resolver interface beneath governed preview runners:

- explicit `review_result` still works
- explicit `review_result` keeps priority
- when explicit review is absent, an internal resolver may provide one

It does not change:

- public request schemas
- public response schemas
- admissibility rules
- policy-effect semantics
- runtime apply gates

## Target

Add one internal review-provider abstraction and wire it into the generic governed preview runner,
then expose optional provider hooks from the shared `promote_memory` and `form_pattern` runners.

## Acceptance

- generic governed preview runner supports explicit-or-provider review resolution
- explicit review still wins over provider output
- existing call sites stay behaviorally unchanged when no provider is passed
- targeted governance tests stay green
- `test:lite` stays green
