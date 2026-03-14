---
title: "POST /v1/memory/replay/playbooks/dispatch"
description: "Reference for dispatching an Aionis replay playbook into deterministic, fallback, or candidate-only execution paths."
---

# POST /v1/memory/replay/playbooks/dispatch

## Status

`code-backed`

## What It Does

Chooses between:

1. deterministic replay now
2. fallback replay now
3. candidate-only inspection

This is the policy-and-execute surface that sits one step above `playbooks/candidate`.

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `playbook_id`
4. optional `version`
5. optional `deterministic_gate`
6. `fallback_mode`
7. `execute_fallback`
8. `params`
9. `max_steps`

## Response Fields To Read First

1. `dispatch.decision`
2. `dispatch.primary_inference_skipped`
3. `dispatch.fallback_executed`
4. `candidate`
5. `replay`
6. `cost_signals`

## Important Boundary

This endpoint goes further than `playbooks/candidate` because it can execute replay, but it is not a blanket deterministic guarantee.

The grounded claim is narrower:

1. Aionis can inspect deterministic eligibility
2. skip primary inference when conditions match
3. fall back explicitly when they do not

## Common Errors

1. `replay_playbook_not_found` or `replay_playbook_version_not_found`
   Trigger: the requested playbook or version does not exist in the current scope.
2. `replay_read_not_supported_in_embedded`
   Trigger: replay read surfaces are called in a deployment that does not expose replay read access.
3. `replay_strict_async_not_supported`
   Trigger: strict replay is requested with `sandbox_async`.
4. `replay_executor_not_enabled` or `replay_sandbox_executor_not_enabled`
   Trigger: the requested replay execution backend is not configured on this deployment.
5. `replay_local_exec_consent_required`
   Trigger: strict or guided replay is requested without explicit `params.allow_local_exec=true`.
6. `replay_allowed_commands_empty`
   Trigger: replay execution allowlist filtering leaves no executable commands.
7. `replay_guided_repair_strategy_not_allowed`
   Trigger: the requested guided repair strategy is blocked by server policy.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-governed.ts`
3. `src/memory/replay.ts`
4. `src/dev/contract-smoke.ts`
