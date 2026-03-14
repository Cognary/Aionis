---
title: "POST /v1/memory/replay/playbooks/run"
description: "Reference for running an Aionis replay playbook in simulate, strict, or guided mode."
---

# POST /v1/memory/replay/playbooks/run

## Status

`code-backed`  
`public-evidence-backed` for the documented replay modes and strict replay disclosure

## What It Does

Runs a replay playbook in one of three modes:

1. `simulate`
2. `strict`
3. `guided`

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `playbook_id`
4. `mode`
5. `version`
6. `deterministic_gate`
7. `params`
8. `max_steps`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the replay scope to execute in. |
| `playbook_id` | yes | Identifies the replay playbook family to run. |
| `mode` | no | Chooses `simulate`, `strict`, or `guided`. |
| `version` | no | Pins execution to one playbook version. |
| `deterministic_gate` | no | Supplies request-time gate constraints for deterministic execution. |
| `params` | no | Carries execution-time parameters such as backend and consent flags. |
| `max_steps` | no | Caps replay step execution. |

## Response Fields To Read First

1. replay mode actually used
2. deterministic gate decision
3. execution summary
4. cost or inference-skipped signals

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `playbook` | Identity and version actually executed. | Confirms what replay operated on. |
| `mode` | Replay mode actually used. | Fast confirmation of runtime behavior. |
| `deterministic_gate` | Final gate evaluation, when relevant. | Useful for debugging strict/simulate promotion behavior. |
| `run` | Persisted replay run object, when recorded. | Useful for audit and later `runs/get` inspection. |
| `summary` | Compact replay execution summary. | Start here before reading steps. |
| `steps[]` | Step-level replay results. | Useful for detailed operator inspection. |
| `execution` | Execution result payload. | Useful when integrating with executors. |
| `params_echo` | Normalized execution params. | Useful for debugging runtime settings. |
| `cost_signals` | Cost and inference-skipped signals. | Useful for reasoning about replay value. |

## External Positioning

This is where replay needs careful handling:

1. `simulate` is the safest first step
2. `strict` is the strongest reuse path when conditions match
3. `guided` is for repair-aware replay, not zero-token replay

## Important Boundary

Do not turn this endpoint into a blanket claim that every workflow is deterministic.

The grounded claim is:

1. Aionis supports reusable replay modes with explicit execution semantics

## Common Errors

1. `replay_playbook_not_found` or `replay_playbook_version_not_found`
   Trigger: the requested playbook or version does not exist in the current scope.
2. `replay_read_not_supported_in_embedded`
   Trigger: replay read access is not available in the current embedded deployment mode.
3. `replay_strict_async_not_supported`
   Trigger: strict replay was requested with an async sandbox backend.
4. `replay_executor_not_enabled` or `replay_sandbox_executor_not_enabled`
   Trigger: the requested execution backend is not configured.
5. `replay_local_exec_consent_required`
   Trigger: strict or guided execution was requested without explicit consent in params.
6. `replay_allowed_commands_empty`
   Trigger: allowlist filtering removed every executable command.
7. `replay_guided_repair_strategy_not_allowed`
   Trigger: the requested guided repair strategy is blocked by server policy.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-governed.ts`
3. `src/memory/replay.ts`
4. `docs/public/en/api-reference/00-api-reference.md`
5. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`
