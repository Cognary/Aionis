---
title: "POST /v1/memory/replay/runs/get"
description: "Reference for loading one Aionis replay run as an inspectable timeline with status, steps, artifacts, and counters."
---

# POST /v1/memory/replay/runs/get

## Status

`code-backed`

## What It Does

Loads one replay run as a readable timeline.

This endpoint is the main inspection surface for:

1. run status
2. step timeline
3. artifact references
4. replay counters

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `run_id`
4. `include_steps`
5. `include_artifacts`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the replay scope to inspect. |
| `run_id` | yes | Identifies the replay run to load. |
| `include_steps` | no | Includes step-level timeline entries. |
| `include_artifacts` | no | Includes artifact references collected from step results. |

## Response Fields To Read First

1. `run.status`
2. `run.run_uri`
3. `steps`
4. `artifacts`
5. `counters`

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `run` | Top-level replay run status object. | Start here for status and timing. |
| `run.run_uri` | URI for the replay run node. | Useful for audit and drill-down links. |
| `steps[]` | Step timeline with result linkage. | Useful for debugging replay behavior. |
| `artifacts[]` | Artifact refs emitted by step results. | Useful for downstream inspection or UI linking. |
| `timeline[]` | Full replay node timeline. | Useful when you need the raw event sequence. |
| `counters` | Compact run counts. | Useful for dashboards and quick inspection. |

## Important Boundary

This is a replay read surface, not a replay execution surface.

It is currently documented as `code-backed` because replay retrieval has not yet been re-run through the same live validation pass used for the core Lite endpoints.

## Common Errors

1. `replay_read_not_supported_in_embedded`
   Trigger: replay read access is not available in the current embedded deployment mode.
2. `replay_run_not_found`
   Trigger: `run_id` does not exist in the current scope.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-core.ts`
3. `src/memory/replay.ts`
4. `packages/sdk/src/client.ts`
