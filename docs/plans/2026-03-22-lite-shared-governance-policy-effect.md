# Lite Shared Governance Policy-Effect Plan

1. Add a shared policy-effect preview helper in `src/memory/governance-shared.ts`
   - no-review path
   - not-admissible path
   - ordered guard path
   - no-raise path
   - apply path

2. Refactor replay `promote_memory` policy-effect derivation to use it

3. Refactor workflow `promote_memory` policy-effect derivation to use it

4. Refactor tools `form_pattern` policy-effect derivation to use it

5. Add a focused contract test for the shared helper

6. Run:
   - `npx tsc --noEmit`
   - targeted governance tests
   - `npm run -s test:lite`
