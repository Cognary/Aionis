# ADR-0002: Add Operator Intervention Overlay For Lite Execution Policy Learning

Status: Proposed

Date: 2026-03-21

## Context

`Aionis Lite` now has a real execution-policy learning loop:

1. tool decisions are recorded
2. tool feedback can produce pattern anchors
3. pattern anchors can move through `candidate`, `trusted`, and `contested`
4. trusted patterns can influence selector ordering
5. explicit rule or operator `tool.prefer` remains higher priority than recalled trusted pattern preference

This means Lite already has:

1. a real learned policy surface
2. planner-facing trust visibility
3. selector-facing provenance visibility
4. introspection surfaces for workflow and pattern state

However, the current runtime still lacks a first-class operator intervention surface for learned execution policy.

This ADR records the intended direction, but it is not yet part of the active Lite runtime baseline.

Specifically, Lite does not yet have:

1. operator-override storage alongside learned pattern state
2. operator intervention routes for suppress / unsuppress / policy override / review
3. selector precedence integration for operator override
4. introspection or compact-summary surfaces that expose operator intervention state

When a trusted pattern is wrong, the current operator options are limited to:

1. indirect correction through negative feedback
2. explicit rule preference that bypasses the learned pattern
3. introspection and observation without a direct mutation surface

That is enough for runtime learning, but it is not enough for product-grade operator control.

The immediate problem is not observability.

The immediate problem is controlled intervention:

1. how to stop a bad trusted pattern from causing more harm
2. how to apply a clean operator preference without mutating learned state incorrectly
3. how to review or revalidate learned state without conflating runtime evidence with operator override

## Decision

We will add an operator intervention model for Lite execution policy as a separate overlay on top of learned pattern state.

The intervention model will prioritize:

1. `suppress`
2. `unsuppress`
3. `policy_override`
4. `review`

The intervention model will not treat operator stop-loss actions as direct edits to learned credibility.

Instead, Lite will distinguish:

1. learned state
2. operator override state

## Learned State Versus Operator State

### Learned state

Learned state remains the runtime-owned interpretation of accumulated evidence.

Examples:

1. `candidate`
2. `trusted`
3. `contested`
4. `counter_evidence_open`
5. `last_transition`
6. maintenance and offline-priority summaries

This state continues to be updated by runtime learning and bounded governance logic.

### Operator state

Operator state is a separate overlay that controls whether and how a learned pattern may participate in live selection.

Examples:

1. `active`
2. `suppressed`
3. operator-preferred replacement tool
4. suppression reason
5. suppression actor
6. suppression expiry

This state is not a substitute for learned credibility.

It is an intervention layer above learned credibility.

## Why Suppress Comes First

`suppress` is a stop-loss action.

It exists to halt damage immediately when an operator determines that a currently recalled pattern should stop influencing live tool selection.

`review` is slower governance.

It exists to decide whether the learned state should be reclassified, revalidated, or left unchanged.

These are not the same urgency class.

Therefore Lite will treat:

1. `suppress` as the first operator intervention primitive
2. `policy_override` as the second operator intervention primitive
3. `review` as a later governance primitive

## Why Suppress Must Not Rewrite Credibility State

We will not encode `suppress` by directly flipping a pattern from `trusted` to `contested`.

That would conflate two different meanings:

1. what the runtime currently believes based on evidence
2. what the operator currently permits in live selection

If suppress rewrites learned credibility directly, Lite loses an important distinction:

1. runtime evidence may still say the pattern was historically trusted
2. operator policy may still say the pattern must not be used right now

Those two facts must be representable at the same time.

For that reason:

1. `credibility_state` remains learned-state truth
2. `suppressed` remains operator-state truth

## Suppression Semantics

The default Lite suppression mode will be:

`shadow_learn`

Meaning:

1. the suppressed pattern does not participate in selector reuse
2. the runtime may continue to observe and accumulate feedback about it
3. learned state may continue to evolve while the operator stop-loss remains active

This is the default because it preserves evidence flow without allowing further live damage.

Lite may later add a stricter suppression mode:

`hard_freeze`

Meaning:

1. the suppressed pattern does not participate in selector reuse
2. new learning updates against that pattern are frozen until manual release

But `hard_freeze` is not the default.

## Selector Precedence

The intended selector precedence becomes:

1. explicit operator override
2. explicit runtime rule or `tool.prefer`
3. trusted learned pattern
4. candidate and contested patterns remain visible but do not act as trusted reuse

This preserves the current Lite rule that memory-guided reuse does not override explicit policy intent.

In this model:

1. `policy_override` is a distinct operator overlay, not a rewrite of learned credibility
2. `tool.prefer` remains the current runtime mechanism for explicit preference
3. the first implementation may translate `policy_override` requests into bounded explicit policy state
4. the product contract must still keep operator-origin override semantically separate from learned pattern trust

## Data Model Direction

Lite will introduce an operator override layer on top of pattern anchors.

Recommended shape:

1. `operator_override.suppressed`
2. `operator_override.suppressed_at`
3. `operator_override.suppressed_by`
4. `operator_override.reason`
5. `operator_override.until`
6. `operator_override.mode`
7. `operator_override.policy_preferred_tool`

This overlay may live beside anchor-governance state, but it must remain semantically distinct from:

1. `credibility_state`
2. `counter_evidence_open`
3. `last_transition`
4. maintenance summaries

## Minimum API Surface

Lite should expose the following minimum operator intervention routes:

1. `POST /v1/memory/patterns/suppress`
2. `POST /v1/memory/patterns/unsuppress`
3. `POST /v1/memory/patterns/policy_override`
4. `POST /v1/memory/patterns/review`

### `suppress`

Purpose:

1. immediate stop-loss
2. prevent selector reuse for a specific learned pattern

Expected inputs:

1. `anchor_id`
2. `reason`
3. optional `until`
4. optional `mode`

### `unsuppress`

Purpose:

1. release operator stop-loss
2. allow the pattern to re-enter selector consideration

Expected inputs:

1. `anchor_id`
2. optional `reason`

### `policy_override`

Purpose:

1. give operators a clean intervention surface for explicit preference
2. expose operator-origin explicit preference without mutating learned credibility

Clarification:

1. `policy_override` is not a synonym for learned pattern promotion
2. `policy_override` is not a direct edit of `credibility_state`
3. `policy_override` may be implemented on top of existing explicit `tool.prefer` selector authority in the first Lite slice
4. even if it reuses that underlying precedence path, the API and stored state should remain operator-scoped rather than being represented as learned trust

Expected inputs:

1. task or pattern scope
2. preferred tool
3. reason
4. optional expiry

### `review`

Purpose:

1. provide a governed route for human-directed reclassification or revalidation
2. support explicit review outcomes after stop-loss or accumulated evidence

Expected inputs:

1. `anchor_id`
2. `action`
3. `reason`

Examples of `action`:

1. `mark_contested`
2. `revalidate_trusted`
3. `keep_candidate`

## Permission Boundary

Lite is currently a single-user local runtime, but the intervention model must leave room for future multi-actor boundaries.

Therefore the first implementation should not hard-code the assumption that any caller may mutate any learned pattern.

The intervention layer should preserve space for:

1. `scope`
2. `tenant_id`
3. request actor
4. operator actor
5. optional owner actor

Near-term Lite behavior may still gate these routes behind the current local operator/admin boundary.

But the data model and route contract should be compatible with future rules such as:

1. only the local operator may suppress shared patterns
2. one actor may not suppress another actor's learned pattern without authority
3. operator overrides may need audit identity independent of pattern owner identity

## Consequences

### Positive consequences

1. Lite gains direct stop-loss control for bad trusted patterns.
2. Learned state remains auditable without being overwritten by operator intervention.
3. Selector behavior becomes easier to explain: operator overlay first, learned trust later.
4. Product semantics become clearer for future multi-actor expansion.

### Negative consequences

1. The runtime now carries two related but distinct governance layers.
2. Planner, selector, and introspection surfaces must explain learned state and operator override separately.
3. API and storage complexity will increase compared with feedback-only correction.

## Follow-Up

Recommended implementation order:

1. add suppression overlay storage and route contracts
2. integrate suppression and policy override into selector precedence
3. expose operator-visible intervention state through introspection and compact summaries
4. add review mutations only after stop-loss and override semantics are stable
