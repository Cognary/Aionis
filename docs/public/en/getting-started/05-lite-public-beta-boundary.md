---
title: "Lite Public Beta Boundary"
---

# Lite Public Beta Boundary

This page defines what Aionis Lite public beta is, what it supports, and what it does not promise.

Read this before treating Lite as your default deployment profile.

## Positioning

Aionis Lite public beta is:

1. a single-user local runtime
2. a SQLite-backed edition of the Aionis kernel
3. the fastest path to local memory, replay, and context workflows

Aionis Lite public beta is not:

1. a production replacement for Server
2. a multi-user team control plane
3. a promise of Server parity

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
12. policy loop:
   - `rules/evaluate`
   - `tools/select`
   - `tools/decision`
   - `tools/run`
   - `tools/feedback`

## Intentionally Server-Only

These outer surfaces remain intentionally unavailable in Lite:

1. `/v1/admin/control/*`
2. `/v1/automations/*`

In Lite, these are expected to return:

1. `501 server_only_in_lite`

Treat that as edition behavior, not as a runtime failure.

## What Lite Beta Promises

Lite beta currently promises:

1. a real local startup path
2. a local SQLite-backed kernel path
3. repeatable dogfood validation through `npm run -s lite:dogfood`
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
3. automations
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
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

Canonical validation:

```bash
npm run -s lite:dogfood
```

Expected health:

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`

## Known Operator Edges

These are known Lite beta operator edges, not release blockers:

1. Lite requires Node `22+` because of `node:sqlite`
2. `memory_lane = "private"` follows visibility rules and may not appear in `find`
3. pack routes still require `ADMIN_TOKEN` and `X-Admin-Token`
4. successful writes may return `lite_embedding_backfill_completed_inline`

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
