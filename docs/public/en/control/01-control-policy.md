---
title: "Control and Policy"
---

# Control and Policy

Aionis policy controls turn memory into governed execution behavior.

## Policy Loop Endpoints

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

## What This Enables

1. Deterministic rule matching for planner/runtime context
2. Tool decisions constrained by explicit policy
3. Feedback-linked adaptation with replayable provenance

## Integration Checklist

1. Send normalized planner context to rules and tool selection endpoints.
2. Persist `request_id`, `run_id`, `decision_id`, and `commit_uri`.
3. Record feedback outcomes for each completed run.
4. Monitor decision stability and negative-ratio drift.

## Related

1. [Rule Lifecycle](/public/en/control/02-rule-lifecycle)
2. [Execution Loop Gate](/public/en/control/03-execution-loop-gate)
3. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)
4. [API Contract](/public/en/api/01-api-contract)
