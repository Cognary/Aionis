---
title: "POST /v1/memory/replay/playbooks/get"
description: "Reference for fetching the latest stored Aionis replay playbook version by playbook id."
---

# POST /v1/memory/replay/playbooks/get

## Status

`code-backed`

## What It Does

Fetches the latest stored version of one replay playbook by `playbook_id`.

Use it when you already know the playbook identity and want the current reusable template, compile summary, and status.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `playbook_id`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the replay scope to inspect. |
| `playbook_id` | yes | Identifies the replay playbook family to load. |

## Response Fields To Read First

1. `playbook.version`
2. `playbook.status`
3. `playbook.steps_template`
4. `playbook.compile_summary`
5. `playbook.uri`
6. `playbook.commit_uri`

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `playbook.playbook_id` | Stable playbook identity across versions. | Primary key for future replay operations. |
| `playbook.version` | Latest stored version returned by this lookup. | Important for governance and reproducibility. |
| `playbook.status` | Current status such as `draft`, `shadow`, or `active`. | Tells you whether the playbook is production-usable. |
| `playbook.steps_template` | Reusable step template compiled from prior runs. | Core reusable replay asset. |
| `playbook.compile_summary` | Compile quality and generation metadata. | Useful for deciding whether the playbook is trustworthy. |
| `playbook.uri` | URI for the playbook node. | Useful for audit and internal linking. |
| `playbook.commit_uri` | Commit lineage for the returned version. | Useful for governance audit trails. |

## Important Boundary

`playbooks/get` is a read-only playbook lookup surface.

It returns the latest version for one `playbook_id`; it is not a listing or search endpoint.

## Common Errors

1. `replay_read_not_supported_in_embedded`
   Trigger: replay read access is not available in the current embedded deployment mode.
2. `replay_playbook_not_found`
   Trigger: `playbook_id` does not exist in the current scope.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-core.ts`
3. `src/memory/replay.ts`
4. `packages/sdk/src/client.ts`
