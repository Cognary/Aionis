# Lite Shared Governance Runtime Builder Plan

1. Add a shared runtime builder under `src/app` for Lite static governance providers.
2. Move replay/workflow/tools env-gated provider construction into that builder.
3. Thread the builder output into:
   - replay runtime options
   - memory write route
   - memory feedback tools route
4. Add one small contract test for builder output.
5. Run targeted governance/provider tests, `npx tsc --noEmit`, and `npm run -s test:lite`.
