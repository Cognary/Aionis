# Lite Shared Governed Operation Runner Spec

## Goal

Unify the shared preview/admissibility runner shape across governed Lite operations without
changing current operation-specific semantics.

## Scope

This slice introduces one generic internal runner for governed semantic preview flows:

- build review packet
- accept optional bounded review result
- evaluate admissibility when review is supplied
- delegate policy-effect derivation to the call site
- delegate decision-trace shaping to the call site

It does not change:

- `promote_memory` packet or admissibility semantics
- `form_pattern` packet or admissibility semantics
- replay/workflow/tools runtime apply gates
- policy-effect thresholds

## Current duplication

Lite now has the same preview pipeline shape in two governed operation families:

1. `promote_memory`
2. `form_pattern`

Both perform:

- packet construction
- optional review-result pass-through
- admissibility evaluation
- policy-effect delegation
- decision-trace delegation

## Target

Introduce one shared internal generic runner and rebuild:

1. `runPromoteMemoryGovernancePreview(...)`
2. `runFormPatternGovernancePreview(...)`

on top of it.

Call sites continue owning:

- operation-specific packet builders
- operation-specific admissibility evaluators
- operation-specific policy-effect semantics
- operation-specific decision traces
- runtime apply

## Acceptance

- `promote_memory` shared runner uses the generic runner
- `form_pattern` shared runner uses the generic runner
- replay/workflow/tools behavior stays unchanged
- targeted governance tests stay green
- `test:lite` stays green
