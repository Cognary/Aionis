---
title: "Governance"
description: "Understand the Aionis governance surface across rule lifecycle, decision traceability, quotas, budgets, and audit events."
---

# Governance

This page covers the surfaces that make Aionis governable instead of opaque.

For external users, this is the difference between "the agent seemed to do something reasonable" and "we can explain, constrain, review, and limit what happened."

## Governance Surface

The current governance story has four parts:

1. policy lifecycle
2. decision traceability
3. quotas and budgets
4. audit events and release evidence

## Rule Lifecycle

Rules already move through explicit states:

1. `draft`
2. `shadow`
3. `active`
4. `disabled`

That matters because Aionis does not require teams to jump straight from idea to enforcement.

The repository already treats safe rollout as a staged process.

## Decision Traceability

The policy loop persists identifiers that make review possible:

1. `run_id`
2. `decision_id`
3. `decision_uri`
4. `commit_uri`

This is one of the core reasons Aionis reads differently from a simple retrieval stack.

The system is trying to make behavior inspectable, not only effective.

## Quotas and Budgets

The server control plane already exposes configurable tenant quota surfaces for:

1. recall throughput
2. write throughput
3. debug embedding throughput
4. recall-text embedding throughput

It also exposes sandbox tenant and project budget controls.

That is important externally because it shows Aionis already has a real resource-governance layer, not only a prompt-and-pray runtime.

## Auditability

The control plane emits audit events for governance actions such as:

1. tenant quota changes
2. sandbox budget updates
3. other control-plane mutations

The API also exposes audit-event listing.

Combined with decision and commit identifiers, this gives teams a workable audit trail for both configuration and execution.

## Review and Promotion Gates

Governance in Aionis is not only endpoint-level.

The repository also includes release and promotion checks such as:

1. `job:rule-promotion-governance`
2. `job:governance-weekly-report`
3. execution-loop and policy-adaptation gates

This is a strong external signal because it shows that policy change is expected to pass through evidence, not intuition.

## Edition Boundary

One important external caveat:

These governance and control-plane surfaces are server-oriented.

Lite is intentionally not positioned as the full multi-tenant governance environment.

## Primary Code and Doc Grounding

1. `src/memory/tools-select.ts`
2. `src/memory/tools-decision.ts`
3. `src/memory/tools-feedback.ts`
4. `src/routes/admin-control-config.ts`
5. `src/control-plane.ts`
6. `docs/public/en/control/01-control-policy.md`
7. `docs/public/en/control/02-rule-lifecycle.md`
8. `docs/public/en/reference/03-rule-promotion-governance.md`
9. `src/jobs/README.md`
