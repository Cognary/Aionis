# Lite Static Promote-Memory Provider Spec

## Goal

Introduce the first deterministic internal governance review provider on a live runtime path without expanding any public route surface.

## Scope

- Add a replay-only static `promote_memory` governance review provider.
- Keep it disabled by default behind an internal env gate.
- Wire it only through `buildReplayRepairReviewOptions()`.
- Preserve explicit `governance_review.promote_memory.review_result` precedence over provider output.

## Behavior

- When enabled, replay repair review may synthesize a bounded `promote_memory` review result if:
  - no explicit review result is supplied
  - deterministic gate is already satisfied
  - requested target is `workflow/L2`
  - at least one candidate example carries a non-empty `workflow_signature`
- The provider returns a deterministic `recommend` review with:
  - `confidence = 0.84`
  - `strategic_value = high`
- Otherwise it returns `null`.

## Non-Goals

- No real model call
- No new public request fields
- No provider wiring for tools/workflow in this slice
- No change to admissibility or policy-effect semantics

## Validation

- Route-level replay test proving provider-generated review can drive governed apply when explicit review is absent
- Existing precedence tests continue to prove explicit review wins
- `tsc`
- `test:lite`
