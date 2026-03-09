---
title: Automation API Reference
description: Public-beta automation API compatibility page for the docs site.
---

# Automation API Reference

This page documents the bounded public-beta Automation API surface.

Automation is a thin orchestrator above replay. It is not a general workflow engine.

## Auth

Use the same memory-plane auth as other automation endpoints:

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

Use `X-Admin-Token` only for admin/control routes such as alert delivery operations.

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

## Public-beta guardrails

1. parallel scheduling is out of scope
2. failure branching is out of scope
3. automation remains sequential and replay-backed
4. `shadow` versions are not runnable through plain `run`
5. `shadow -> active` promotion requires approved shadow review
6. marketplace publishing/install is not part of the public-beta promise

## Canonical docs

1. [Automation APIs](/api/automation)
2. [API Reference](/api/)
