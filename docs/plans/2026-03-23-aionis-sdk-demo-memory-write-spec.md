# Aionis SDK Demo Memory Write Spec

## Goal

Remove the public `sdk_demo` dependency on the full `memory-write` route target by routing the demo profile through a demo-specific write entry.

## Why

After the earlier shrink slices, `src/routes/memory-write.ts` is the last residual runtime target reported by the SDK demo audit. The public demo profile only needs the standard SDK-facing write endpoint:

1. `/v1/memory/write`

The goal is to keep that endpoint behavior while removing the direct public dependency on the full route file.

## Scope

1. extract shared write route registration into `memory-write-shared.ts`
2. keep `memory-write.ts` as the full-runtime wrapper
3. add `sdk-demo-memory-write.ts` as the demo wrapper
4. repoint `sdk_demo` to the demo wrapper
5. reduce the final residual runtime target from the shrink audit

## Non-Goals

1. no public SDK contract changes
2. no write behavior changes for full runtime or demo runtime
3. no additional shrink work beyond the last audited target
