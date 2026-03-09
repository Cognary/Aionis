---
title: Automation APIs
description: Bounded public-beta automation APIs for replay-backed orchestration, review, shadow validation, compensation, and telemetry.
---

# Automation APIs

Aionis Automation is a bounded orchestration layer above replay.

It is designed for governed, sequential automation runs, not for general-purpose workflow scheduling.

## What this page covers

1. automation definition and validation
2. run lifecycle and review controls
3. shadow validation and promotion
4. compensation and operator recovery
5. telemetry and alert-facing surfaces

## Core definition and validation

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`

## Run lifecycle

1. `POST /v1/automations/run`
2. `POST /v1/automations/runs/get`
3. `POST /v1/automations/runs/list`
4. `POST /v1/automations/runs/cancel`
5. `POST /v1/automations/runs/resume`

## Review and repair controls

1. `POST /v1/automations/runs/approve_repair`
2. `POST /v1/automations/runs/reject_repair`
3. `POST /v1/automations/runs/assign_reviewer`
4. `POST /v1/automations/assign_reviewer`

## Promotion and shadow

1. `POST /v1/automations/promote`
2. `POST /v1/automations/shadow/report`
3. `POST /v1/automations/shadow/validate`
4. `POST /v1/automations/shadow/validate/dispatch`

## Compensation

1. `POST /v1/automations/runs/compensation/retry`
2. `POST /v1/automations/runs/compensation/record_action`
3. `POST /v1/automations/runs/compensation/assign`
4. `POST /v1/automations/compensation/policy_matrix`

## Telemetry

1. `POST /v1/automations/telemetry`

## Public-beta constraints

1. automation stays sequential and replay-backed
2. parallel scheduling is out of scope
3. failure branching is out of scope
4. `shadow` versions require explicit `execution_mode=shadow`
5. marketplace publishing/install is not part of this public-beta surface

## Recommended reading

1. [Public Automation API Reference (EN)](/public/en/api-reference/01-automation-api-reference)
2. [Automation API Reference (ZH)](/public/zh/api-reference/01-automation-api-reference)
3. [Replay APIs](/api/replay)
4. [Operations](/operations/)
