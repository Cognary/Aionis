---
title: "URI Object Coverage"
---

# URI Object Coverage

Aionis uses URI-first object identity for inspect, replay, and audit workflows.

## Canonical URI Format

`aionis://tenant/scope/type/id`

## Current Coverage

1. Node objects: `event/entity/topic/rule/evidence/concept/procedure/self_model`
2. Edge objects: relation-level URI coverage
3. Commit objects: immutable write-chain anchors
4. Decision objects: policy/planner execution provenance

## API Surfaces

1. Recall/context outputs include node URIs.
2. `subgraph.edges[]` include edge URI fields.
3. Write and policy responses surface `commit_uri` and `decision_uri` where applicable.
4. `POST /v1/memory/resolve` resolves `node|edge|commit|decision` URIs with tenant/scope checks.

## Operational Value

1. Reproducible troubleshooting with stable object references
2. Cleaner runbook workflows for replay and forensic analysis
3. Consistent object links across API, SDK, and operator tools

## Recommended Usage

1. Treat URI as the primary external object key.
2. Preserve `request_id`, `run_id`, `decision_id`, and `commit_uri` in your telemetry.
3. Use `resolve` before mutation or replay steps in operator workflows.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [Planner Context](/public/en/reference/02-planner-context)
3. [Operate and Production](/public/en/operate-production/00-operate-production)
