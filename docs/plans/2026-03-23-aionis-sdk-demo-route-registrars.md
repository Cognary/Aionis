# Aionis SDK Demo Route Registrars

This slice adds a demo-specific registrar layer between the public demo route bundle and the full route implementation entrypoints.

After this change:

1. `sdk-demo-memory-routes.ts` decides only which demo routes are registered
2. `sdk-demo-memory-route-registrars.ts` maps each demo route into the corresponding full runtime registrar
3. `sdk-demo-memory-route-deps.ts` continues to own per-route dependency assembly

That separation makes the public demo stack more modular and gives future shrink work a clearer place to replace or fork route behavior without touching the top-level demo bundle.
