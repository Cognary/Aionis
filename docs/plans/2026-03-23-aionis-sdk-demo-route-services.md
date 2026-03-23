# Aionis SDK Demo Route Services

This slice adds a demo-specific service layer underneath the demo route implementations.

After this change, the demo route stack is:

1. route bundle
2. demo-specific registrars
3. demo-specific implementations
4. demo-specific services
5. route dependency builders

That separation gives future public shrink work another clean seam for replacing or minimizing demo behavior without changing the higher-level public demo wiring.
