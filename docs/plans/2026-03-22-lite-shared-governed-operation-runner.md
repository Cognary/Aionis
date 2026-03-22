# Lite Shared Governed Operation Runner Plan

1. Add a generic internal governed semantic preview runner in `src/memory`
   - packet build
   - optional review result
   - admissibility evaluation
   - delegated policy-effect
   - delegated decision trace

2. Refactor `promote_memory` shared runner to use it

3. Add a new `form_pattern` shared runner on top of it

4. Refactor `tools/feedback` to use the shared `form_pattern` runner

5. Add a focused contract test for the generic runner

6. Run:
   - `npx tsc --noEmit`
   - targeted governance tests
   - `npm run -s test:lite`
