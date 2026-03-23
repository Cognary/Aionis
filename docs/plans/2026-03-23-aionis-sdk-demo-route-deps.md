# Aionis SDK Demo Route Deps

This slice makes the demo route bundle thinner by moving per-route dependency assembly into dedicated builders.

After this change:

1. `sdk-demo-memory-routes.ts` only registers demo routes
2. `sdk-demo-memory-route-deps.ts` owns the concrete route argument wiring

That split makes future public shrink work safer because the high-level demo route bundle and the lower-level dependency assembly are now isolated from each other.
