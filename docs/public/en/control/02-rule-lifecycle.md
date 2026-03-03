---
title: "Rule Lifecycle"
---

# Rule Lifecycle

Aionis rules move through explicit lifecycle states for safe rollout.

## States

1. `draft`: newly created rule, not used for enforcement
2. `shadow`: evaluated for signal quality without hard enforcement
3. `active`: used in policy decisions
4. `disabled`: retained for audit, excluded from enforcement

## Promotion Principles

1. Promote only with sufficient positive signal volume.
2. Verify stability across distinct runs before activation.
3. Disable quickly when severe negative patterns appear.
4. Keep transitions auditable and reversible.

## Lifecycle API

Use state transition endpoint for controlled changes:

`POST /v1/memory/rules/state`

## Pre-Change Validation

Before each promotion:

1. Run rule governance checks.
2. Review conflict and winner-change signals.
3. Confirm tenant/scope visibility boundaries.

## Related

1. [Rule Promotion Governance](/public/en/reference/03-rule-promotion-governance)
2. [Rule Conflict Report](/public/en/reference/04-rule-conflict-report)
3. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)
