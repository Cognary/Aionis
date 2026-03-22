# Lite Promote Memory Semantic Review Plan

1. add failing governance contract coverage for a bounded `promote_memory` semantic review packet
2. add failing governance contract coverage for bounded semantic review results
3. add failing governance contract coverage for runtime admissibility decisions on review results
4. add internal semantic review packet/result schemas to `src/memory/schemas.ts`
5. implement a minimal `promote_memory` semantic review helper in `src/memory/promote-memory-governance.ts`
6. run focused governance tests
7. run `npx tsc --noEmit`
8. run `npm run -s test:lite`
