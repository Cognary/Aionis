# Lite Static Promote-Memory Provider Plan

1. Add a deterministic static provider for `promote_memory`.
2. Add a replay-only env gate in runtime config.
3. Thread the provider through replay runtime option defaults.
4. Add a replay route test for provider-driven governed apply with no explicit review.
5. Re-run targeted governance tests, `tsc`, and `test:lite`.
