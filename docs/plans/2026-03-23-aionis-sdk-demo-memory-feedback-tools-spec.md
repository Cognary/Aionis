# Aionis SDK Demo Memory Feedback Tools Spec

## Goal

Replace the public `sdk_demo` dependency on the full `memory-feedback-tools` route with a demo-only feedback route that serves only the SDK demo use cases.

## Why

The shrink audit identified `src/routes/memory-feedback-tools.ts` as a residual runtime target. For the public demo profile, the SDK examples only require:

1. `/v1/memory/tools/select`
2. `/v1/memory/tools/feedback`

They do not require rules state/evaluate, decision/run lookup, pattern suppression, or tools payload rehydration.

## Scope

1. add `sdk-demo-memory-feedback-tools.ts`
2. expose only demo-needed feedback endpoints
3. point the demo runtime adapter at that demo-only route
4. reduce one residual runtime target from the audit

## Non-Goals

1. no behavior changes for the supported demo endpoints
2. no changes to full runtime `memory-feedback-tools.ts`
3. no public SDK contract changes
