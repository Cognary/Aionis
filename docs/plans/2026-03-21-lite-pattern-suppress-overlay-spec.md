# Lite Pattern Suppress Overlay Spec

Date: 2026-03-21

## Goal

Add a minimal operator intervention slice for Lite execution-policy learning that can stop a bad learned pattern from influencing live tool selection without mutating learned credibility state.

## Non-Goals

This slice does not implement the full ADR-0002 surface.

Specifically, it does not add:

1. `policy_override`
2. `review`
3. planner-facing operator overlay semantics
4. multi-actor authority rules beyond the current Lite local-operator boundary

## Product Shape

The first slice is `suppress-first`.

It includes:

1. `POST /v1/memory/patterns/suppress`
2. `POST /v1/memory/patterns/unsuppress`
3. selector integration so suppressed patterns do not participate in trusted reuse
4. introspection/operator visibility for suppression state

## Core Rule

Suppression is an operator overlay, not a learned-state rewrite.

The following learned fields remain untouched:

1. `pattern_state`
2. `credibility_state`
3. `counter_evidence_open`
4. `last_transition`
5. maintenance summaries

Instead, suppression is stored beside learned pattern state in `slots.operator_override_v1`.

## Minimal Data Model

`slots.operator_override_v1`:

1. `schema_version = "operator_override_v1"`
2. `suppressed: boolean`
3. `reason: string | null`
4. `mode: "shadow_learn" | "hard_freeze"`
5. `until: string | null`
6. `updated_at: string`
7. `updated_by: string | null`
8. `last_action: "suppress" | "unsuppress"`

This overlay is valid only for pattern-anchor nodes.

## Runtime Semantics

### Suppressed pattern

When a pattern is suppressed:

1. it may still be recalled and shown in operator/introspection surfaces
2. it must not be counted as trusted reusable policy during `tools/select`
3. it must not contribute to `pattern_preferred_tools`
4. it should remain distinguishable from naturally contested patterns

### Unsuppressed pattern

When suppression is removed:

1. selector behavior returns to normal learned-state semantics
2. learned trust resumes from existing credibility state
3. the overlay remains operator-origin state rather than being merged into learned credibility

## Selector Behavior

Minimal precedence for this slice:

1. explicit runtime rule / `tool.prefer`
2. trusted learned pattern that is not suppressed
3. candidate and contested patterns remain visible but not trusted
4. suppressed patterns remain visible but not trusted

This slice does not yet add a distinct `policy_override` precedence tier.

## Introspection / Operator Visibility

`execution/introspect` should expose suppression on pattern entries:

1. `operator_override_present`
2. `suppressed`
3. `suppression_mode`
4. `suppressed_until`
5. `suppression_reason`
6. `suppressed_by`
7. `suppressed_at`

The demo/operator text may mention suppression, but default planner/context surfaces should remain slim.

## Route Contract

### Suppress request

Required:

1. `anchor_id`
2. `reason`

Optional:

1. `tenant_id`
2. `scope`
3. `actor`
4. `mode`
5. `until`

### Unsuppress request

Required:

1. `anchor_id`

Optional:

1. `tenant_id`
2. `scope`
3. `actor`
4. `reason`

### Response

Return the updated operator overlay state plus stable pattern identity:

1. `anchor_id`
2. `anchor_uri`
3. `selected_tool`
4. `pattern_state`
5. `credibility_state`
6. `operator_override`

## Tests

Minimum required tests:

1. route contract test for `suppress`
2. route contract test for `unsuppress`
3. selector behavior test proving suppressed trusted pattern no longer acts as trusted reuse
4. introspection route test proving suppressed state is visible

## Acceptance

This slice is complete when:

1. a trusted pattern can be suppressed without changing learned credibility
2. `tools/select` skips it as trusted reuse
3. introspection shows the suppression overlay
4. unsuppress restores normal learned-state participation
