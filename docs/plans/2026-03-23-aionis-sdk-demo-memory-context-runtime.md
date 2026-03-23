# Aionis SDK Demo Memory Context Runtime

This slice removes the public `sdk_demo` stack's direct dependency on the full `memory-context-runtime` route target.

The demo runtime now uses `sdk-demo-memory-context-runtime.ts`, which registers only:

1. planning context
2. context assemble

The full runtime keeps the broader route surface, but the public demo path no longer points at that full route file directly. That drops one more residual target from the shrink audit and keeps the public SDK demo surface narrower.
