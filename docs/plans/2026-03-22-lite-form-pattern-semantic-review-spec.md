# Lite Form Pattern Semantic Review Spec

## Goal

Add the first minimal LLM-assisted adjudication slice to Lite memory governance without widening the public runtime surface.

The slice is intentionally narrow:

1. runtime builds a bounded semantic-review packet for `form_pattern`
2. LLM returns a bounded semantic-review result
3. runtime decides admissibility from deterministic gate state plus the review result

## Why This Slice First

`form_pattern` is the cleanest first governed operation because Lite already has:

1. signature-first grouping language
2. deterministic request/adjudication schemas
3. clear governance guidance that pattern formation should be runtime-gated first and semantically reviewed second

This lets Lite add real LLM-assisted judgment without giving the LLM direct mutation authority.

## Scope

In scope:

1. internal semantic review packet schema for `form_pattern`
2. internal semantic review result schema for `form_pattern`
3. runtime helper that builds the bounded review packet
4. runtime helper that converts review result + deterministic gate state into admissibility
5. contract tests

Out of scope:

1. public routes
2. model calling
3. actual pattern-anchor writes
4. generalizing all governed operations at once

## Runtime Model

### Step 1: Deterministic nomination gate

The runtime only prepares semantic review when:

1. there are at least 2 source nodes
2. at least one of `task_signature`, `error_signature`, or `workflow_signature` is present

### Step 2: Bounded semantic review packet

The runtime sends the LLM only:

1. operation name
2. target level
3. grouped signatures
4. source count
5. compact source examples
6. deterministic gate state

### Step 3: Bounded review result

The LLM may only return:

1. `recommend`
2. `reject`
3. `insufficient_evidence`

and only for `target_kind = pattern | none`.

### Step 4: Runtime admissibility

The runtime still decides whether mutation is admissible:

1. deterministic gate must already be satisfied
2. recommending a pattern requires `target_level = L3`
3. recommendation confidence must meet the runtime floor
4. otherwise the result is non-admissible

## Acceptance

1. `form_pattern` semantic review packet has a stable schema and type
2. review result has a stable schema and type
3. runtime helper refuses to admit pattern formation when deterministic gate is unsatisfied
4. runtime helper refuses low-confidence recommendations
5. runtime helper admits a valid high-confidence recommendation without granting write authority directly
