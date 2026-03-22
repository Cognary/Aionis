# Lite Tools Feedback Form-Pattern Governance Admissibility Spec

Date: 2026-03-22

## Goal

Extend the new `tools/feedback` `form_pattern` governance preview so the route can optionally accept a bounded semantic review result and evaluate runtime admissibility without changing actual pattern-anchor writes.

## Scope

This slice adds:

1. bounded `governance_review.form_pattern.review_result` input
2. bounded `admissibility` output
3. expanded preview decision trace

This slice does **not**:

1. mutate pattern-anchor persistence
2. derive policy effects
3. apply runtime mutation overrides

## Runtime Rules

Review evaluation only happens when:

1. `tools/feedback` produced a `form_pattern` review packet
2. caller supplied `governance_review.form_pattern.review_result`

If the caller supplies a review result but the route cannot build a preview packet, the request is rejected.

Admissibility remains deterministic:

1. route builds the bounded packet
2. runtime validates the bounded review result
3. runtime evaluates admissibility with the existing helper

## Contract Additions

Add:

1. `ToolsFeedbackGovernanceInputSchema`
2. `ToolsFeedbackRequest.governance_review`
3. `governance_preview.form_pattern.review_result`
4. `governance_preview.form_pattern.admissibility`

Decision trace stages for this slice:

1. `review_packet_built`
2. `review_result_received`
3. `admissibility_evaluated`

## Validation

Required validation:

1. tools-feedback pattern test for admitted high-confidence review
2. tools-feedback pattern test for rejected low-confidence review
3. full `test:lite`
