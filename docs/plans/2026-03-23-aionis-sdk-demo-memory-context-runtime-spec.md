# Aionis SDK Demo Memory Context Runtime Spec

## Goal

Remove the public `sdk_demo` dependency on the full `memory-context-runtime` route target by introducing a demo-specific context runtime entry that exposes only the SDK demo surfaces.

## Why

The shrink audit still identifies `src/routes/memory-context-runtime.ts` as a residual runtime target. The public SDK demo only needs:

1. `/v1/memory/planning/context`
2. `/v1/memory/context/assemble`

It does not need `/v1/memory/recall_text`.

## Scope

1. add `sdk-demo-memory-context-runtime.ts`
2. route `sdk_demo` through that demo-specific file
3. enable only `planning_context` and `context_assemble` for the demo path
4. reduce one residual runtime target from the shrink audit

## Non-Goals

1. no public SDK contract changes
2. no behavior changes for full runtime routes
3. no shrink work on `memory-write.ts` in this slice
