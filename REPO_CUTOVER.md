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

1. `apps/lite` currently launches root `src/index.ts`
2. that means `src/` cannot disappear from public until the demo shell stops depending on the full runtime tree
3. public shrink therefore needs a staged replacement, not a one-step delete

## Recommended Cutover Phases

### Phase 1

1. keep pushing current runtime work to `runtime`
2. stop treating `origin` as the main runtime implementation repo
3. keep public docs and SDK work moving in `origin`

### Phase 2

1. replace the current public Lite shell dependency on the full runtime tree
2. introduce a smaller public demo/runtime shim
3. prove SDK quickstart still works

### Phase 3

1. remove or replace the no-longer-needed deep runtime directories from public
2. keep only the demo-capable public shell plus SDK/docs/examples

## Validation

After cutover:

1. `Cognary/Aionis` should read as an SDK-first public repository
2. `Cognary/Aionis` should still support a lightweight quickstart demo path
3. `Cognary/Aionis-runtime` should be the main place where runtime internals evolve
4. new moat-bearing runtime work should land in `runtime`, not `origin`
