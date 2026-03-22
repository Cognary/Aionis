# Lite Workflow Promotion Governance Admissibility Spec

## Goal

Extend workflow auto-promotion governance preview so it can consume a bounded
`promote_memory.review_result` and derive admissibility, policy-effect preview, and richer trace.

## Scope

This slice adds:

- bounded review result input
- admissibility evaluation
- policy-effect preview derived from review + admissibility
- decision trace stages for review/admissibility

It still does not:

- apply governance to workflow auto-promotion behavior
- alter stable/candidate workflow promotion semantics

## Input path

The bounded review result is supplied through source-node metadata:

- `slots.workflow_promotion_governance_review.promote_memory.review_result`

This avoids adding a new route surface while the third governed call site is still preview-only.

## Acceptance

- workflow stable auto-promotion preview accepts a bounded review result
- admissibility becomes visible in stored governance preview metadata
- high-confidence admissible review can mark preview policy-effect as applying
- workflow auto-promotion result itself stays unchanged
