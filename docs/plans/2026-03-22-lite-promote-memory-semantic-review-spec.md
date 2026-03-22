# Lite Promote Memory Semantic Review Spec

## Goal

Add the second minimal LLM-assisted adjudication slice to Lite memory governance:

1. runtime builds a bounded semantic-review packet for `promote_memory`
2. LLM returns a bounded semantic-review result
3. runtime decides admissibility from deterministic gate state plus the review result

This extends the same governed pattern established for `form_pattern` without widening the public route surface.

## Why This Slice

`promote_memory` is the next smallest governed operation because Lite already has:

1. stable promote request/adjudication schemas
2. explicit target level semantics
3. deterministic nomination conditions that can be expressed without model calls

Together with the existing `form_pattern` slice, this gives Lite a real internal semantic-review baseline for both:

1. memory promotion
2. pattern formation

## Scope

In scope:

1. internal semantic review packet schema for `promote_memory`
2. internal semantic review result schema for `promote_memory`
3. runtime helper that builds the bounded review packet
4. runtime helper that converts review result + deterministic gate state into admissibility
5. contract tests

Out of scope:

1. public routes
2. model calling
3. actual anchor writes
4. unifying all governed operations into one generic executor

## Runtime Model

### Step 1: Deterministic nomination gate

The runtime only prepares semantic review when:

1. there is at least 1 candidate node
2. a concrete `target_kind` is present
3. a concrete `target_level` is present

### Step 2: Bounded semantic review packet

The runtime sends the LLM only:

1. operation name
2. target kind
3. target level
4. candidate count
5. compact candidate examples
6. deterministic gate state

### Step 3: Bounded review result

The LLM may only return:

1. `recommend`
2. `reject`
3. `insufficient_evidence`

using the existing `promote_memory` adjudication schema.

### Step 4: Runtime admissibility

The runtime still decides admissibility:

1. deterministic gate must already be satisfied
2. recommendation target must match the requested target kind
3. recommendation target level must match the requested target level
4. recommendation confidence must meet the runtime floor

## Acceptance

1. `promote_memory` semantic review packet has a stable schema and type
2. review result has a stable schema and type
3. runtime helper rejects unsatisfied deterministic gate
4. runtime helper rejects target mismatches
5. runtime helper rejects low-confidence recommendations
6. runtime helper admits a valid high-confidence recommendation without granting write authority directly
