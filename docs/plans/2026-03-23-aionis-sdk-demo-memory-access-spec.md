# Aionis SDK Demo Memory Access Spec

## Goal

Replace the public `sdk_demo` dependency on the full `memory-access` route with a demo-only access route that serves only the SDK demo use cases.

## Why

The shrink audit identified `src/routes/memory-access.ts` as a residual runtime target. For the public demo profile, the SDK examples only require:

1. `/v1/memory/execution/introspect`
2. `/v1/memory/anchors/rehydrate_payload`

They do not require the full sessions, packs, find, or resolve surface.

## Scope

1. add `sdk-demo-memory-access.ts`
2. expose only demo-needed access endpoints
3. point the demo runtime adapter at that demo-only route
4. reduce one residual runtime target from the audit

## Non-Goals

1. no behavior changes for the supported demo endpoints
2. no changes to full runtime `memory-access.ts`
3. no public SDK contract changes
