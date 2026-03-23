1. Add shared Lite governance model-client factory under `src/memory`.
2. Move mock model-client construction into the factory.
3. Rewrite the provider factory to consume shared client factory output.
4. Add client-factory contract tests.
5. Run targeted governance/provider tests plus `tsc` and `test:lite`.
