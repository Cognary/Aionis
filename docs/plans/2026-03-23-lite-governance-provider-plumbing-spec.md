# Lite Governance Provider Plumbing Spec

## Goal

Thread the internal governance review-provider interface through replay, tools, and workflow
governed paths so all three can hang an internal provider without changing public Lite contracts.

## Scope

This slice only adds internal optional provider plumbing:

- replay repair review options
- tools feedback options
- workflow projection options
- shared `promote_memory` / `form_pattern` runners

It does not:

- enable a default provider
- change public request bodies
- change public response bodies
- change admissibility or policy semantics

## Target

All three governed call-site families should be able to pass an internal provider hook down to the
shared governed preview runner:

1. replay / `promote_memory`
2. tools / `form_pattern`
3. workflow promotion / `promote_memory`

## Acceptance

- replay/tools/workflow signatures all support optional internal provider hooks
- shared runner behavior stays unchanged when provider is absent
- shared runner behavior still prefers explicit review results
- targeted tests stay green
- `test:lite` stays green
