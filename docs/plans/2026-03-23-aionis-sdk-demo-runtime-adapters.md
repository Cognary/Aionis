# Aionis SDK Demo Runtime Adapters

This slice adds a demo-specific runtime adapter layer beneath the demo route services.

After this change, the demo route stack is:

1. route bundle
2. demo-specific registrars
3. demo-specific implementations
4. demo-specific services
5. demo-specific runtime adapters
6. route dependency builders

This gives public shrink work another clean seam for replacing how the demo stack reaches into the deeper runtime, without changing the higher-level demo route orchestration.
