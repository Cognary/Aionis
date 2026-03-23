# Aionis SDK Demo Route Implementations

This slice inserts a demo-specific implementation layer underneath the demo route registrars.

After this change, the demo route stack is:

1. route bundle
2. demo-specific route registrars
3. demo-specific route implementations
4. route dependency builders

That separation matters because future public shrink work can replace implementation behavior under the registrar layer without forcing changes to the higher-level demo route bundle.
