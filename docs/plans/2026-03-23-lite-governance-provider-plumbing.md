# Lite Governance Provider Plumbing Plan

1. Add provider hook types to replay/tools/workflow internal options/signatures
2. Thread provider hooks into shared `promote_memory` / `form_pattern` runners
3. Add focused shared-runner contract coverage for provider pass-through
4. Run:
   - `npx tsc --noEmit`
   - targeted governance tests
   - `npm run -s test:lite`
