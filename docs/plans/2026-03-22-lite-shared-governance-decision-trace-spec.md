# Lite Shared Governance Decision Trace Spec

## Goal

Reduce duplicated decision-trace assembly across governed Lite runtime call sites without
changing current trace semantics.

## Scope

This slice only unifies the common trace skeleton:

- `review_supplied`
- `admissibility_evaluated`
- `admissible`
- `policy_effect_applies`
- `stage_order`
- `reason_codes`

Call sites still own:

- `trace_version`
- operation-specific base/effective state fields
- operation-specific runtime-apply delta fields

## Current duplication

Three live governance paths currently rebuild the same trace base separately:

1. replay repair review / `promote_memory`
2. tools feedback / `form_pattern`
3. workflow promotion / `promote_memory`

All three reassemble the same:

- review presence
- admissibility presence/result
- shared stage-order logic
- shared reason-code collation

## Target

Add one shared internal trace-base helper and refactor all three live paths to use it.

## Acceptance

- replay/tools/workflow all use the shared trace-base helper
- trace payloads stay unchanged
- targeted governance tests stay green
- `test:lite` stays green
