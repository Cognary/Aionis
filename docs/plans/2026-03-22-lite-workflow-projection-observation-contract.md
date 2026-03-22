# Lite Workflow Projection Observation Contract Plan

1. add failing projection-contract coverage for equivalent continuity family identity
2. add failing projection-contract coverage for source-provenance distinct observation counting
3. add failing projection-contract coverage for linked projection suppression
4. implement a source-provenance observation identity helper in `src/memory/workflow-write-projection.ts`
5. switch distinct observation counting to that helper
6. reuse the same linked-projection lookup rule in both explain and project paths
7. run focused projection tests
8. run `npx tsc --noEmit`
9. run `npm run -s test:lite`
