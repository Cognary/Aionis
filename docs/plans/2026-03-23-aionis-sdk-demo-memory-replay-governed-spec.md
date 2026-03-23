# Aionis SDK Demo Memory Replay Governed Spec

## Goal

Replace the public `sdk_demo` dependency on the full `memory-replay-governed` route with a demo-only replay route that serves only the SDK demo use case.

## Why

The shrink audit identified `src/routes/memory-replay-governed.ts` as a residual runtime target. For the public demo profile, the SDK examples only require:

1. `/v1/memory/replay/playbooks/repair/review`

They do not require replay run or dispatch endpoints.

## Scope

1. add `sdk-demo-memory-replay-governed.ts`
2. expose only demo-needed replay review endpoint
3. point the demo runtime adapter at that demo-only route
4. reduce one residual runtime target from the audit

## Non-Goals

1. no behavior changes for replay repair review
2. no changes to full runtime `memory-replay-governed.ts`
3. no public SDK contract changes
