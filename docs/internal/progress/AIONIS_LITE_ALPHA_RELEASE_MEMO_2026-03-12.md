# Aionis Lite Alpha Release Memo

Date: `2026-03-12`  
Status: `approved_for_internal_alpha`

Related:

1. [AIONIS_LITE_STATUS_2026-03-11.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_STATUS_2026-03-11.md)
2. [LITE_SINGLE_USER_KERNEL_IMPLEMENTATION_SPEC.md](/Users/lucio/Desktop/Aionis/docs/LITE_SINGLE_USER_KERNEL_IMPLEMENTATION_SPEC.md)
3. [LITE_ALPHA_GATE_V1_20260311.md](/Users/lucio/Desktop/Aionis/artifacts/lite/LITE_ALPHA_GATE_V1_20260311.md)
4. [scripts/start-lite.sh](/Users/lucio/Desktop/Aionis/scripts/start-lite.sh)

## Decision

The repository is now approved for an internal Lite alpha release path.

This approval is intentionally narrow.

It means:

1. Aionis now has a real Lite edition profile.
2. Lite preserves the kernel-required local path for single-user execution.
3. Lite startup, health, replay, write, recall, sessions, packs, graph inspection, policy loop, and context runtime all have repository evidence.

It does not mean:

1. Lite has full Server parity.
2. Lite is the recommended default install path.
3. Lite has completed external-user hardening.

## Approved Scope

The approved Lite alpha surface is:

1. `AIONIS_EDITION=lite`
2. `npm run start:lite`
3. local SQLite-backed write / recall / replay / sessions / packs / inspection paths
4. local policy loop:
   `rules/evaluate`, `tools/select`, `tools/decision`, `tools/run`, `tools/feedback`
5. local context runtime:
   `recall_text`, `planning/context`, `context/assemble`

Current intentional exclusions remain:

1. `/v1/admin/control/*`
2. `/v1/automations/*`

Those route groups remain `server_only_in_lite` and are part of the approved alpha boundary.

## Release Evidence

The current alpha decision is backed by these repository facts:

1. Lite runtime host split exists and is machine-tested.
2. Lite alpha gate currently passes with no failing items.
3. Cross-edition pack compatibility has explicit runtime-host evidence.
4. Lite startup packaging exists as a real launcher, not just an env note.
5. Real Lite process startup was validated with:
   `DATABASE_URL=` unset,
   `npm run start:lite`,
   and `/health` returning:
   - `aionis_edition = "lite"`
   - `memory_store_backend = "lite_sqlite"`
   - Lite write/recall store presence

## Current Known Limits

These limits are accepted for alpha:

1. Lite is still a local single-user topology, not a production replacement for Server.
2. Some capabilities remain intentionally server-only by edition.
3. Alpha readiness is repository-gated readiness, not field-hardened readiness.
4. SQLite recall is valid for the Lite local envelope, not a claim of Server-grade recall equivalence.

## Operator Guidance

For internal alpha usage:

1. treat Lite as the local-first edition
2. use it for single-user memory/replay workflows, IDE integrations, and local agent execution
3. do not route team governance or automation expectations onto Lite
4. verify `/health.aionis_edition` and `/health.memory_store_backend` on startup

Recommended startup path:

```bash
cp .env.example .env
npm install
npm run build
npm run start:lite
```

Recommended health check:

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

## Next Gates

The next phase after alpha approval is not more kernel bring-up.

It is:

1. startup and operator doc polish
2. internal alpha usage evidence
3. post-alpha hardening
4. beta gate definition

## Final Release Position

The correct internal positioning now is:

> Aionis Lite is approved as an internal alpha edition: real, local, SQLite-backed, kernel-preserving, and intentionally narrower than Server.
