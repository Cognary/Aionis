# Lite Shared Governance Policy-Effect Spec

## Goal

Reduce duplicated policy-effect preview branching across governed Lite runtime call sites without
changing current promotion semantics.

## Scope

This slice only unifies shared state-raise preview logic:

- no review
- review not admissible
- explicit no-apply guards
- review did not raise target state
- review raised target state

It does not change:

- replay apply behavior
- tools-feedback apply behavior
- workflow promotion preview-only behavior
- confidence thresholds
- admissibility rules

## Current duplication

Three governance paths still hand-roll the same preview branching:

1. replay repair review / `promote_memory`
2. workflow promotion / `promote_memory`
3. tools feedback / `form_pattern`

They all decide:

- whether review is absent
- whether admissibility blocks effect
- whether an explicit guard blocks effect
- whether review raises state
- what effective state to preview

## Target

Add one shared internal helper for governed state-raise previews and rebuild the three
operation-specific policy-effect derivations on top of it.

## Acceptance

- replay/workflow/tools all use the shared policy-effect helper
- returned route payloads stay unchanged
- targeted governance tests stay green
- `test:lite` stays green
