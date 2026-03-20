---
title: "Lite Public Beta Boundary"
---

# Lite Public Beta Boundary

This page defines what Aionis Lite public beta is, what it supports, and what it does not promise.

Read this before treating Lite as your default deployment profile.

For a shorter operator-facing capability summary, see [Lite API Capability Guide](/public/en/getting-started/07-lite-api-capability-guide).

For a shorter public-facing release/demo narrative, see [Lite Execution-Memory Beta Narrative](/public/en/getting-started/08-lite-execution-memory-beta-narrative).

If you need the step-by-step demo script, see [Lite Execution-Memory Demo Walkthrough](/public/en/getting-started/09-lite-execution-memory-demo-walkthrough).

## Positioning

Aionis Lite public beta is:

1. a single-user local runtime
2. a SQLite-backed edition of the Aionis kernel
3. the fastest path to local memory, replay, and context workflows
4. the first Lite release line that exposes the `Anchor-Guided Rehydration Loop`

Aionis Lite public beta is not:

1. a production replacement for Server
2. a multi-user team control plane
3. a promise of Server parity

Named execution-memory loop:

`Anchor-Guided Rehydration Loop`

Definition:

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

## Supported In Lite Public Beta

The current supported Lite beta surface is:

1. `npm run start:lite`
2. `/health`
3. `/v1/memory/write`
4. `/v1/memory/recall`
5. `/v1/memory/recall_text`
6. `/v1/memory/planning/context`
7. `/v1/memory/context/assemble`
8. replay lifecycle and playbooks:
   - `run/start`
   - `step/before`
   - `step/after`
   - `run/end`
   - `runs/get`
   - `playbooks/get`
   - `playbooks/candidate`
   - `playbooks/run`
   - `playbooks/dispatch`
   - `playbooks/compile_from_run`
   - `playbooks/promote`
   - `playbooks/repair`
   - `playbooks/repair/review`
9. sessions/events
10. packs export/import
11. graph inspection:
   - `find`
   - `resolve(node|edge|commit|decision)`
   - `anchors/rehydrate_payload`
12. policy loop:
   - `rules/evaluate`
   - `tools/select`
   - `tools/decision`
   - `tools/run`
   - `tools/rehydrate_payload`
   - `tools/feedback`

This means Lite already exposes the main runtime surfaces behind the `Anchor-Guided Rehydration Loop`.
Replay and playbook promotion produce the stable execution side.
Recall and tool rehydration routes expose the later recall, hint, and optional payload-expansion side.

Additional constraints:

1. `/v1/memory/write` still requires `input_text` or `input_sha256` in the minimum valid request
2. Lite supporting these routes does not imply identical visibility semantics across every lane and inspection surface

## Intentionally Server-Only

This outer surface remains intentionally unavailable in Lite:

1. `/v1/admin/control/*`

In Lite, it is expected to return:

1. `501 server_only_in_lite`

Treat that as edition behavior, not as a runtime failure.

## Local Automation Subset

Lite now includes a local automation subset instead of treating the whole automation namespace as unavailable.

Currently supported:

1. `/v1/automations/create`
2. `/v1/automations/get`
3. `/v1/automations/list`
4. `/v1/automations/validate`
5. `/v1/automations/graph/validate`
6. `/v1/automations/run`
7. `/v1/automations/runs/get`
8. `/v1/automations/runs/list`
9. `/v1/automations/runs/cancel`
10. `/v1/automations/runs/resume`

Unsupported automation routes now return:

1. `501 automation_feature_not_supported_in_lite`

## What Lite Beta Promises

Lite beta currently promises:

1. a real local startup path
2. a local SQLite-backed kernel path
3. repeatable validation through `npm run smoke:lite`
4. repository gates for alpha and beta-candidate posture

Lite beta does not currently promise:

1. multi-user coordination
2. hosted governance workflows
3. production HA topology
4. Server-level scaling or operational guarantees

## Who Should Use Lite Beta

Lite beta is best for:

1. single developers
2. local agent runtime experiments
3. IDE and MCP integrations
4. replay and memory workflow prototyping
5. evaluating Aionis without Docker + Postgres

Use Server instead if you need:

1. team governance
2. admin/control plane routes
3. full automation governance and reviewer workflows
4. production traffic
5. shared operational ownership

## Recommended Lite Beta Validation

Minimum path:

```bash
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Health:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,runtime,storage,lite}'
```

Canonical validation:

```bash
npm run smoke:lite
```

Optional practical sandbox validation:

```bash
npm run smoke:lite:local-process
```

Expected health:

1. `runtime.edition = "lite"`
2. `storage.backend = "lite_sqlite"`
3. `sandbox.mode = "mock"` for the default startup path

## Known Operator Edges

These are known Lite beta operator edges, not release blockers:

1. Lite requires Node `22+` because of `node:sqlite`
2. `memory_lane = "private"` should not be read as “hidden everywhere”
3. in the current Lite beta, `find` is stricter for private lane visibility while `recall_text` / context paths may still surface private content
4. pack routes are local Lite routes and no longer require an admin token
5. successful writes may return `lite_embedding_backfill_completed_inline`

For details, see:

1. [Lite Operator Notes](/public/en/getting-started/04-lite-operator-notes)

## Escalation Rule

If your workflow needs any of the following, move to Server rather than trying to stretch Lite:

1. shared tenant governance
2. automation orchestration
3. operator recovery and alerting surfaces
4. production deployment guarantees

## Current Release Posture

Current posture is:

1. internal alpha completed
2. repository beta-candidate gates passing
3. suitable for controlled public beta evaluation

It is not yet positioned as:

1. GA
2. default deployment mode
3. production-recommended topology
