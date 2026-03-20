---
title: "Lite API Capability Guide"
---

# Lite API Capability Guide

This page is the operator-facing summary of what `Aionis Lite` can do today.

Use it when you need the short answer to:

1. what works in Lite
2. what only works as a Lite subset
3. what still belongs to `AionisPro`

For the internal source-of-truth matrix, see [Lite API Capability Matrix](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md).

If you need the short public-facing product narrative instead of the route summary, see [Lite Execution-Memory Beta Narrative](/public/en/getting-started/08-lite-execution-memory-beta-narrative).

Named execution-memory loop:

`Anchor-Guided Rehydration Loop`

Definition:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

## Core Runtime

Supported:

1. `npm run start:lite`
2. `npm run start:lite:local-process`
3. `GET /health`

Expected health signals:

1. `runtime.edition = "lite"`
2. `storage.backend = "lite_sqlite"`

## Supported Memory Surface

Lite supports these primary local memory routes:

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/planning/context`
5. `POST /v1/memory/context/assemble`
6. `POST /v1/memory/find`
7. `POST /v1/memory/resolve`

Lite also supports local sessions and packs:

1. `POST /v1/memory/sessions`
2. `GET /v1/memory/sessions`
3. `POST /v1/memory/events`
4. `GET /v1/memory/sessions/:session_id/events`
5. `POST /v1/memory/packs/export`
6. `POST /v1/memory/packs/import`

## Recommended Integration Pattern

For new Lite integrations, the recommended read path is:

1. read full workflow, pattern, and rehydration collections from `planner_packet.sections.*`
2. read `workflow_signals` and `pattern_signals` directly as canonical signal surfaces
3. read `planning_summary` or `assembly_summary` for compact planner-facing explanations
4. read `execution_kernel.*_summary` for compact runtime state

Recommended interpretation:

1. `planner_packet.sections.*` is now the only default full collection surface on planner/context routes
2. `workflow_signals` and `pattern_signals` remain canonical signal surfaces
3. `execution_kernel.*_summary` is the compact runtime surface
4. `layered_context` is no longer part of the default planner/context response and should be treated as explicit debug/operator output only
5. use `POST /v1/memory/execution/introspect` when you want a heavier demo or inspection surface
6. use `return_layered_context=true` only when you intentionally want the lower-level assembly view

If you need the more detailed integrator-oriented guide, see [Execution-Memory Integrator Guide](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md).

## Supported Replay And Playbook Surface

Lite includes a real replay/playbook kernel.
This is the producer side of the `Anchor-Guided Rehydration Loop`.

Supported:

1. `POST /v1/memory/replay/run/start`
2. `POST /v1/memory/replay/step/before`
3. `POST /v1/memory/replay/step/after`
4. `POST /v1/memory/replay/run/end`
5. `POST /v1/memory/replay/runs/get`
6. `POST /v1/memory/replay/playbooks/compile_from_run`
7. `POST /v1/memory/replay/playbooks/get`
8. `POST /v1/memory/replay/playbooks/candidate`
9. `POST /v1/memory/replay/playbooks/promote`
10. `POST /v1/memory/replay/playbooks/repair`

Lite also keeps a reduced governed replay subset:

1. `POST /v1/memory/replay/playbooks/repair/review`
2. `POST /v1/memory/replay/playbooks/run`
3. `POST /v1/memory/replay/playbooks/dispatch`

That does not mean full server governance is present. It means Lite keeps the local execution path.

## Supported Handoff, Rules, And Tooling Surface

This route group contains the runtime-facing rehydration tool alias and the local tool-feedback path that can distill reusable tool-selection patterns.

Supported:

1. `POST /v1/handoff/store`
2. `POST /v1/handoff/recover`
3. `POST /v1/memory/feedback`
4. `POST /v1/memory/rules/state`
5. `POST /v1/memory/rules/evaluate`
6. `POST /v1/memory/tools/select`
7. `POST /v1/memory/tools/decision`
8. `POST /v1/memory/tools/run`
9. `POST /v1/memory/tools/runs/list`
10. `POST /v1/memory/tools/rehydrate_payload`
11. `POST /v1/memory/tools/feedback`

In practical terms:

1. replay produces stable execution artifacts
2. recall surfaces anchor hits
3. runtime tools expose optional payload expansion
4. this is the current Lite realization of the `Anchor-Guided Rehydration Loop`

## Supported Lite Automation Kernel

Lite includes a local playbook-driven automation kernel.

Supported:

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`
6. `POST /v1/automations/run`
7. `POST /v1/automations/runs/get`
8. `POST /v1/automations/runs/list`
9. `POST /v1/automations/runs/cancel`
10. `POST /v1/automations/runs/resume`

Supported Lite node kinds:

1. `playbook`
2. `approval`
3. `condition`
4. `artifact_gate`

Not included:

1. reviewer assignment
2. promotion workflow
3. shadow governance
4. compensation governance
5. telemetry orchestration

Unsupported automation governance routes return:

1. `501 automation_feature_not_supported_in_lite`

## Supported Sandbox Surface

Sandbox is available in Lite.

Supported when `SANDBOX_ENABLED=true`:

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`

Practical runtime modes:

1. default `mock`
2. `npm run start:lite:local-process` for the narrow local-process preset

If you set `SANDBOX_ADMIN_ONLY=true`, sandbox remains available but requires the local admin token.

## Explicitly Not Part Of Lite

These surfaces are intentionally outside the Lite product boundary:

1. `/v1/admin/control/*`
2. `/v1/memory/archive/rehydrate*`
3. `/v1/memory/nodes/activate*`
4. multi-user governance
5. full control-plane automation
6. Server HA / production topology

These route groups return:

1. `501 server_only_in_lite`

## Recommended Validation

Minimum validation:

```bash
npm install
npm run build
npm run smoke:lite
```

If you also want to validate the practical local-process sandbox preset:

```bash
npm run smoke:lite:local-process
```

If you need the exact internal route-level matrix, use [Lite API Capability Matrix](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md).
