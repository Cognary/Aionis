---
title: "Control & Policy"
---

# Control & Policy

Aionis policy loop makes behavior controllable and replayable, not only retrievable.

## Decision Flow

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/feedback`
4. `POST /v1/memory/tools/decision`

## What To Validate

1. Rule match quality and visibility behavior
2. Tool selection determinism under policy
3. Feedback attribution and decision replay traceability

## Read

1. [Rule Lifecycle](/public/en/control/02-rule-lifecycle)
2. [Execution Loop Gate](/public/en/control/03-execution-loop-gate)
3. [Policy Adaptation Gate](/public/en/control/04-policy-adaptation-gate)
4. [API Contract](/public/en/api/01-api-contract)
