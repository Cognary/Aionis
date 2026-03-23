# Aionis SDK Demo Route Bundle

This slice moves the demo route implementation bundle out of the demo host module.

After this change:

1. `http-host-sdk-demo.ts` only composes:
   1. lite server-only routes
   2. sdk demo memory routes
2. `sdk-demo-memory-routes.ts` owns the concrete route implementation wiring

That split matters because the public demo host becomes a thinner orchestration layer, while the concrete route bundle becomes a clearer target for future extraction or replacement during public repository shrink.
