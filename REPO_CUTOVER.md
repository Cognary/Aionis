# Repo Cutover

Current target topology:

1. `Cognary/Aionis` = public SDK-first repository
2. `Cognary/Aionis-runtime` = private runtime-core repository

## Current Local Repository

1. working repository: `/Volumes/ziel/Aionisgo`

Current remotes:

1. `origin` = `https://github.com/Cognary/Aionis.git`
2. `runtime` = `https://github.com/Cognary/Aionis-runtime.git`

## Current State

The full current `main` history has already been pushed to both:

1. public `origin`
2. private `runtime`

That means the next cutover step is no longer repository creation.
It is **public repository shrinkage** and **private repository mainline ownership**.

Current shrink status:

1. `sdk_demo` direct residual runtime route targets are now **0**
2. the public demo path no longer depends directly on the former audited residual route targets
3. the next execution problem is no longer route-surface disentangling
4. it is now **transitive source-tree shrinkage**

## Recommended Direction

### Public `Cognary/Aionis`

Keep this repository as:

1. the public product identity
2. the home of `@aionis/sdk`
3. docs, examples, and public contracts
4. a weak demo/local runtime shell for quickstart and onboarding

### Private `Cognary/Aionis-runtime`

Treat this repository as:

1. the main runtime development repository
2. the home of deeper execution-memory internals
3. the home of stronger governance/learning implementation
4. the home of private evaluation, benchmark, and operator tooling

## Public Repository Keep List

Keep in public:

1. `packages/sdk`
2. `examples/sdk`
3. `docs/SDK_QUICKSTART.md`
4. `docs/SDK_PUBLISHING.md`
5. `docs/OPEN_CORE_BOUNDARY.md`
6. root README and public release notes
7. `packages/runtime-core` if it remains the shared published boundary
8. a minimal `apps/lite` demo shell
9. the smallest script set needed to build SDK and run demo quickstart

## Public Repository Remove-Or-Replace List

Move to private mainline ownership:

1. deep runtime implementation under `src/`
2. benchmark/eval internals
3. deeper governance/learning internals
4. private operator tooling
5. most runtime-focused CI and internal validation surfaces

Important nuance:

1. `apps/lite` now launches root `src/index-sdk-demo.ts`
2. public startup no longer depends on `src/index.ts` or `src/runtime-entry.ts`
3. public shrink can therefore start executing the first safe move batch instead of only planning it

## Recommended Cutover Phases

### Phase 1

1. keep pushing current runtime work to `runtime`
2. stop treating `origin` as the main runtime implementation repo
3. keep public docs and SDK work moving in `origin`

### Phase 2

1. replace the current public Lite shell dependency on the full runtime tree
2. introduce a smaller public demo/runtime shim
3. prove SDK quickstart still works

Phase 2 status:

1. completed for direct route residuals
2. `npm run sdk-demo:audit` now reports `residual runtime edges: 0`
3. the public demo shell now runs through demo-specific wrappers for:
   - access
   - tools feedback
   - replay governed review
   - context runtime
   - write

### Phase 3

1. remove or replace the no-longer-needed deep runtime directories from public
2. keep only the demo-capable public shell plus SDK/docs/examples

Current Phase 3 entry condition:

1. `npm run public:keep-manifest` computes the transitive `src/` keep set from `src/index-sdk-demo.ts`
2. current manifest result:
   - `src files: 164`
   - `keep files: 158`
   - `move candidates: 6`
3. the first safe move batch is therefore narrow, not broad
4. that first safe move batch has now been executed in public shrink

## Validation

After cutover:

1. `Cognary/Aionis` should read as an SDK-first public repository
2. `Cognary/Aionis` should still support a lightweight quickstart demo path
3. `Cognary/Aionis-runtime` should be the main place where runtime internals evolve
4. new moat-bearing runtime work should land in `runtime`, not `origin`
