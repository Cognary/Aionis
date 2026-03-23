# Public Repo Shrink Execution

This document tracks the first executable shrink stage after the `sdk_demo` route residual audit reached zero.

## Current Facts

1. `npm run sdk-demo:audit` reports `residual runtime edges: 0`
2. `npm run public:keep-manifest` reports:
   - `src files: 164`
   - `keep files: 158`
   - `move candidates: 6`

## Meaning

The public repo is no longer blocked on direct route-surface entanglement.

It is still blocked on transitive runtime reachability. In practice, that means:

1. the public `sdk_demo` path is now structurally isolated enough
2. but the current demo runtime still reaches deeply into the runtime tree
3. only a small first batch is safe to move or remove immediately

## First Safe Move Batch

The current manifest identifies these as the first narrow move candidates:

1. `src/index.ts`
2. `src/runtime-entry.ts`
3. `src/routes/memory-lifecycle.ts`
4. `src/memory/governance.ts`
5. `src/memory/nodes-activate.ts`
6. `src/memory/rehydrate.ts`

## Recommended Next Cutover Slice

1. move the first safe batch to private mainline ownership
2. keep the manifest script as the guardrail
3. rerun:
   - `npm run public:keep-manifest`
   - `npm run sdk-demo:audit`
   - `npm run -s build`
   - one or more SDK examples against `start:lite:sdk-demo`

## Guardrail

Do not delete large `src/` areas from public based only on intuition.

The manifest is the current source of truth for what the public demo runtime still transitively needs.
