# Lite Workflow Governance Apply And Provider Plan

1. Add runtime-apply semantics to workflow governance decision trace.
2. Persist a minimal governed override marker in workflow projection output.
3. Add an env gate for a workflow static `promote_memory` provider.
4. Thread the provider through Lite write/projection runtime wiring.
5. Add route tests for:
   - runtime apply metadata
   - provider-driven governance review with no explicit review
6. Re-run targeted workflow governance tests, `tsc`, and `test:lite`.
