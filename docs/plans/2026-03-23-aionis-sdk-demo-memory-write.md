# Aionis SDK Demo Memory Write

This slice removes the last residual runtime target from the public `sdk_demo` path.

The write route logic now lives in `memory-write-shared.ts`, while:

1. `memory-write.ts` remains the full-runtime wrapper
2. `sdk-demo-memory-write.ts` becomes the demo-specific wrapper

That keeps `/v1/memory/write` behavior unchanged but lets the public demo stack stop depending directly on the full `memory-write.ts` route target.
