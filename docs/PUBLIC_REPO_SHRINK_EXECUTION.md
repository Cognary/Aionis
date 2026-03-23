# Public Repo Shrink Execution

This document tracks the executable shrink stage after the `sdk_demo` route residual audit reached zero.

## Current Facts

1. `npm run sdk-demo:audit` reports `residual runtime edges: 0`
2. `npm run public:keep-manifest` reports:
   - `src files: 141`
   - `keep files: 141`
   - `move candidates: 0`

## Meaning

The public repo is no longer blocked on direct route-surface entanglement or on outstanding transitive move candidates.

In practice, that means:

1. the public `sdk_demo` path is structurally isolated enough for the current public contract
2. the keep-manifest has converged on the exact public `src/` boundary
3. future regressions should be prevented with guardrails rather than by repeating large exploratory delete sweeps

## Executed Move Batches

The original first safe move batch was:

1. `src/index.ts`
2. `src/runtime-entry.ts`
3. `src/routes/memory-lifecycle.ts`
4. `src/memory/governance.ts`
5. `src/memory/nodes-activate.ts`
6. `src/memory/rehydrate.ts`

This batch has now been executed in the public repository tree.

Subsequent public cutover batches have also removed:

1. non-demo route surfaces
2. non-demo host surfaces
3. residual public memory helper modules

## Recommended Next Cutover Slice

1. keep the manifest script as the guardrail
2. fail CI if `move candidates` becomes non-zero again
3. move new moat-bearing runtime work to `Cognary/Aionis-runtime`
4. keep validating:
   - `npm run public:keep-manifest`
   - `npm run sdk-demo:audit`
   - `npm run -s build`
   - `npm run -s test:lite`

## Guardrail

Do not delete large `src/` areas from public based only on intuition.

The manifest is the current source of truth for what the public demo runtime still transitively needs, and it should stay converged at `move candidates: 0`.
