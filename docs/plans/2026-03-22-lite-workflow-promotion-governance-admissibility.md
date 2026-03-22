# Lite Workflow Promotion Governance Admissibility Plan

1. Extend workflow-promotion governance helper to accept bounded review input
2. Evaluate admissibility with existing `promote_memory` semantic review logic
3. Derive preview-only policy effect and decision trace
4. Feed optional review input from source-node slots in workflow projection
5. Extend workflow projection route tests
6. Run:
   - `npx tsc --noEmit`
   - targeted workflow projection tests
   - `npm run -s test:lite`
