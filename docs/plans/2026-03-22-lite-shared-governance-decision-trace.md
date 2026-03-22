# Lite Shared Governance Decision Trace Plan

1. Add a shared trace-base helper in `src/memory/governance-shared.ts`
   - review flags
   - stage order
   - reason codes

2. Refactor replay governance trace assembly to use it

3. Refactor tools-feedback governance trace assembly to use it

4. Refactor workflow-promotion governance trace assembly to use it

5. Add a focused contract test for the new shared trace-base helper

6. Run:
   - `npx tsc --noEmit`
   - targeted governance tests
   - `npm run -s test:lite`
