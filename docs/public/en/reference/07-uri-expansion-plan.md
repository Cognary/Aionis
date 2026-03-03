---
title: "URI Object Coverage"
---

# URI Object Coverage

Aionis uses URI-first identity so objects can be inspected and replayed consistently.

## Canonical Format

`aionis://tenant/scope/type/id`

## Current Coverage

1. Node objects: `event`, `entity`, `topic`, `rule`, `evidence`, `concept`, `procedure`, `self_model`
2. Edge objects: relationship-level URI coverage
3. Commit objects: immutable write-chain anchors
4. Decision objects: policy and execution provenance

## API Surfaces

1. Recall/context outputs include node URIs.
2. Graph responses include edge URI fields.
3. Write and policy responses include `commit_uri` and `decision_uri` where applicable.
4. `POST /v1/memory/resolve` resolves `node|edge|commit|decision` URIs with tenant/scope enforcement.

## Recommended Usage

1. Treat URI as your primary object key in app telemetry.
2. Persist `request_id`, `run_id`, `decision_id`, and `commit_uri` together.
3. Use `resolve` before replay or incident analysis workflows.

## Why It Matters

1. Reproducible troubleshooting with stable object references.
2. Consistent links across API, SDK, and operator tools.
3. Faster root-cause workflows in production incidents.

## Related

1. [API Contract](/public/en/api/01-api-contract)
2. [Planner Context](/public/en/reference/02-planner-context)
3. [Operate and Production](/public/en/operate-production/00-operate-production)
