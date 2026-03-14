---
title: "POST /v1/memory/replay/playbooks/candidate"
description: "Reference for evaluating whether an Aionis replay playbook is currently eligible for deterministic reuse."
---

# POST /v1/memory/replay/playbooks/candidate

## Status

`code-backed`

## What It Does

Evaluates whether a replay playbook is currently eligible for deterministic reuse.

This is the recommendation surface that sits between:

1. a stored playbook
2. a dispatch decision
3. an actual replay run

## Request Fields That Matter First

1. `tenant_id`
2. `scope`
3. `playbook_id`
4. optional `version`
5. optional `deterministic_gate`

## Request Field Table

| Field | Required | What It Does |
| --- | --- | --- |
| `tenant_id` | no | Selects the tenant boundary. |
| `scope` | no | Selects the replay scope to inspect. |
| `playbook_id` | yes | Identifies the replay playbook family to inspect. |
| `version` | no | Pins candidate evaluation to one playbook version. |
| `deterministic_gate` | no | Supplies request-time replay eligibility constraints such as allowed statuses and matchers. |

## Response Fields To Read First

1. `candidate.eligible_for_deterministic_replay`
2. `candidate.recommended_mode`
3. `candidate.next_action`
4. `deterministic_gate`
5. `cost_signals`

## Response Field Table

| Field | What It Means | Why You Care |
| --- | --- | --- |
| `playbook` | Identity and version of the inspected playbook. | Confirms what candidate evaluation actually targeted. |
| `candidate.eligible_for_deterministic_replay` | Whether deterministic replay is currently allowed. | Fast go/no-go signal. |
| `candidate.recommended_mode` | Recommended replay mode for the current gate result. | Useful default for dispatch or UI. |
| `candidate.next_action` | Human-readable next step. | Useful in operator or developer tooling. |
| `deterministic_gate` | Full gate evaluation result. | Useful when debugging why replay is not eligible. |
| `cost_signals` | Cost and savings signals from the gate result. | Useful for adoption and runtime policy decisions. |

## Important Boundary

`playbooks/candidate` does not execute replay.

It tells you whether deterministic replay is currently eligible, why it is or is not eligible, and what the recommended next action is.

## Common Errors

1. `replay_read_not_supported_in_embedded`
   Trigger: replay read access is not available in the current embedded deployment mode.
2. `replay_playbook_not_found`
   Trigger: `playbook_id` does not exist in the current scope.

## Grounding

1. `src/memory/schemas.ts`
2. `src/routes/memory-replay-core.ts`
3. `src/memory/replay.ts`
4. `src/app/http-observability.ts`
