---
title: "POST /v1/memory/replay/playbooks/compile_from_run"
description: "Reference for compiling a successful Aionis replay run into a reusable playbook for later strict, guided, or simulated replay."
---

# POST /v1/memory/replay/playbooks/compile_from_run

## Status

`code-backed`  
`public-evidence-backed` for the claim that compile happens before strict replay in the disclosed replay flow

## What It Does

Compiles a successful replay run into a reusable playbook.

This is the bridge between:

1. one successful execution
2. a reusable replay path

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `run_id`
4. `allow_partial`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the replay scope to compile from. |
| `run_id` | yes | Identifies the replay run to compile. |
| `playbook_id` | no | Reuses or pins the output playbook family identity. |
| `name` | no | Sets a human-readable playbook name. |
| `version` | no | Sets the output playbook version. |
| `allow_partial` | no | Allows compile from non-successful runs when true. |
| `matchers` | no | Stores request matchers on the compiled playbook. |
| `success_criteria` | no | Stores success criteria on the compiled playbook. |

## Response Fields To Read First

1. playbook identity and version fields
2. compile summary
3. quality annotations
4. usage estimate fields

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `playbook_id` | Stable identity of the compiled playbook family. | Primary key for future replay operations. |
| `version` | Version created by this compile operation. | Important for governance and reproducibility. |
| `status` | Initial status of the compiled playbook version. | Usually starts as `draft`. |
| `playbook_uri` | URI for the compiled playbook node. | Useful for audit and internal links. |
| `compile_summary` | Compile metadata, quality notes, and recommendations. | Main output for deciding whether the playbook is reusable. |
| `usage` | Token usage estimate for compile. | Important for cost-aware teams. |
| `commit_id` / `commit_uri` | Commit lineage for the new playbook version. | Useful for governance audit trails. |

## Why It Matters Externally

This endpoint is the reason replay in Aionis is more than "run the same prompt again."

It converts a past run into an explicit reusable artifact.

## Important Boundary

Keep the boundaries explicit:

1. compile can consume model tokens
2. compile quality is not the same thing as guaranteed deterministic replay

## Common Errors

1. `replay_read_not_supported_in_embedded`
   Trigger: replay read access is not available in the current embedded deployment mode.
2. `replay_run_not_found`
   Trigger: `run_id` does not exist in the current scope.
3. `replay_compile_requires_successful_run`
   Trigger: compile was requested from a non-successful run without `allow_partial=true`.
4. `replay_compile_no_steps`
   Trigger: the source run has no replay step nodes to compile into a playbook.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-core.ts`
3. `src/memory/replay.ts`
4. `docs/public/en/api-reference/00-api-reference.md`
5. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`
