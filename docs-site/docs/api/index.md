# Aionis API Reference

This section documents the public API surface for production integrations.

## What you will learn

1. Which endpoint group to use for each integration task.
2. Which IDs to log for replay and incident analysis.
3. Where to find contract-level details for auth, errors, and operations.

## How to use this section

1. Use the left sidebar to pick an endpoint group.
2. Use [API Guide](/guide/api-guide) for auth, isolation, and integration guardrails.
3. Use [Operations and Gates](/guide/operations-and-gates) for release and incident workflows.

## What this section gives you

1. Group-level intent for each API surface.
2. The identifiers you must keep if you want reliable replay and incident debugging.
3. Pointers to contract pages for request and response details.

## Task to endpoint mapping

1. Persist new execution memory:
   use `POST /v1/memory/write`
2. Build prompt context from natural language:
   use `POST /v1/memory/recall_text` or `POST /v1/memory/context/assemble`
3. Enforce policy before action:
   use `POST /v1/memory/rules/evaluate` then `POST /v1/memory/tools/select`
4. Reconstruct and inspect a failed run:
   use `POST /v1/memory/replay/runs/get` and `POST /v1/memory/resolve`
5. Run bounded replay-backed automations:
   use `POST /v1/automations/*` surfaces summarized in [Automation APIs](/api/automation)

## Common integration fields

Always persist these fields in logs and telemetry:

1. `request_id`
2. `tenant_id`
3. `scope`
4. `run_id`
5. `decision_id`
6. `commit_uri`

## Core request conventions

1. Send `tenant_id` and `scope` on every request unless your environment injects them by policy.
2. Use one auth mode consistently per environment.
3. Persist IDs from every response, not only from failures.
4. Treat `request_id` as mandatory operational metadata.

## Quick endpoint map

### Memory

> `POST /v1/memory/write`
> `POST /v1/memory/recall_text`
> `POST /v1/memory/context/assemble`

### Policy

> `POST /v1/memory/rules/evaluate`
> `POST /v1/memory/tools/select`
> `POST /v1/memory/tools/decision`
> `POST /v1/memory/tools/run`
> `POST /v1/memory/tools/feedback`

### Replay

> `POST /v1/memory/replay/runs/get`
> `POST /v1/memory/replay/playbooks/run`

### Automation

> `POST /v1/automations/create`
> `POST /v1/automations/run`
> `POST /v1/automations/runs/get`
> `POST /v1/automations/promote`
> `POST /v1/automations/shadow/report`
> `POST /v1/automations/telemetry`

## Endpoint schema pages

1. [Endpoint Schemas Index](/api/endpoints/)
2. [POST /v1/memory/write](/api/endpoints/write)
3. [POST /v1/memory/recall_text](/api/endpoints/recall-text)
4. [POST /v1/memory/context/assemble](/api/endpoints/context-assemble)
5. [POST /v1/memory/rules/evaluate](/api/endpoints/rules-evaluate)
6. [POST /v1/memory/tools/select](/api/endpoints/tools-select)
7. [POST /v1/memory/tools/decision](/api/endpoints/tools-decision)
8. [POST /v1/memory/tools/run](/api/endpoints/tools-run)
9. [POST /v1/memory/resolve](/api/endpoints/resolve)
10. [POST /v1/memory/replay/runs/get](/api/endpoints/replay-runs-get)
11. [Automation APIs](/api/automation)

## Suggested reading order

1. [Authentication](/api/authentication)
2. [Memory APIs](/api/memory)
3. [Policy APIs](/api/policy)
4. [Replay APIs](/api/replay)
5. [Automation APIs](/api/automation)
6. [Error Model](/api/errors)
