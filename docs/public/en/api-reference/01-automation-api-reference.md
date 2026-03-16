---
title: "Automation API Reference"
---

# Automation API Reference

This page documents the bounded public-beta Automation API surface.

Automation is a thin orchestrator above replay. It is not a general workflow engine.

## Auth

Use the same memory-plane auth as other automation endpoints:

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

Use `X-Admin-Token` only for admin/control routes such as alert delivery operations.

## Core Definition and Validation

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`

## Run Lifecycle

1. `POST /v1/automations/run`
2. `POST /v1/automations/runs/get`
3. `POST /v1/automations/runs/list`
4. `POST /v1/automations/runs/cancel`
5. `POST /v1/automations/runs/resume`

## Review and Repair Controls

1. `POST /v1/automations/runs/approve_repair`
2. `POST /v1/automations/runs/reject_repair`
3. `POST /v1/automations/runs/assign_reviewer`
4. `POST /v1/automations/assign_reviewer`

## Promotion and Shadow

1. `POST /v1/automations/promote`
2. `POST /v1/automations/shadow/report`
3. `POST /v1/automations/shadow/review`
4. `POST /v1/automations/shadow/validate`
5. `POST /v1/automations/shadow/validate/dispatch`

## Compensation

1. `POST /v1/automations/runs/compensation/retry`
2. `POST /v1/automations/runs/compensation/record_action`
3. `POST /v1/automations/runs/compensation/assign`
4. `POST /v1/automations/compensation/policy_matrix`

## Telemetry

1. `POST /v1/automations/telemetry`

## Run Modes

Supported modes:

1. default execution against `active` versions
2. explicit `execution_mode=shadow` against `shadow` versions only

Public-beta constraints:

1. parallel scheduling is out of scope
2. failure branching is out of scope
3. automation remains sequential and replay-backed

## Important Status Semantics

Read these fields first:

1. `lifecycle_state`
2. `pause_reason`
3. `terminal_outcome`
4. `status_summary` for UI only

Examples:

1. review pending:
   `lifecycle_state=paused`, `pause_reason=repair_required`
2. compensated failure:
   `lifecycle_state=terminal`, `terminal_outcome=failed_compensated`

## Public Beta Guardrails

1. `shadow` versions are not runnable through plain `run`
2. `shadow -> active` promotion requires approved shadow review
3. Marketplace publishing/install is not part of the public-beta promise

## Related

1. [API Reference](/public/en/api-reference/00-api-reference)
2. [Operator Runbook](/public/en/operations/02-operator-runbook)
3. [Production Go-Live Gate](/public/en/operations/04-prod-go-live-gate)
