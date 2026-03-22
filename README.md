# Aionis

`Aionisgo` is the local execution-memory runtime repository.

Current repository focus:

1. runtime/core
2. SQLite-backed local memory
3. execution-memory routes
4. benchmark and validation

Core source areas:

1. [src/app](/Volumes/ziel/Aionisgo/src/app)
2. [src/execution](/Volumes/ziel/Aionisgo/src/execution)
3. [src/memory](/Volumes/ziel/Aionisgo/src/memory)
4. [src/routes](/Volumes/ziel/Aionisgo/src/routes)
5. [src/store](/Volumes/ziel/Aionisgo/src/store)
6. [src/runtime-entry.ts](/Volumes/ziel/Aionisgo/src/runtime-entry.ts)
7. [src/index.ts](/Volumes/ziel/Aionisgo/src/index.ts)

Primary docs:

1. [docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md)
2. [docs/LITE_API_CAPABILITY_MATRIX.md](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md)
3. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
4. [docs/LITE_TESTING_STRATEGY.md](/Volumes/ziel/Aionisgo/docs/LITE_TESTING_STRATEGY.md)
5. [docs/LITE_REAL_TASK_BENCHMARK_REPORT.md](/Volumes/ziel/Aionisgo/docs/LITE_REAL_TASK_BENCHMARK_REPORT.md)
6. [docs/AIONIS_0_1_0_RELEASE_NOTE.md](/Volumes/ziel/Aionisgo/docs/AIONIS_0_1_0_RELEASE_NOTE.md)

Everything else in this repository should be read as runtime/internal reference material, not as the primary product surface.

Quick start:

```bash
nvm use
npm install
npm run start:lite
```

`npm run build` is still available as a packaging/contract check, but Aionis startup no longer depends on a prebuilt wrapper artifact.

## Local Identity

Aionis now defaults replay, playbook, and automation flows to a single local actor.

By default:

1. `LITE_LOCAL_ACTOR_ID=local-user`
2. replay writes default to private local ownership
3. automation playbook nodes reuse the same local actor when no explicit actor is provided

Override it when you want a stable local identity:

```bash
LITE_LOCAL_ACTOR_ID=lucio npm run start:lite
```

## Sandbox

Aionis now starts with the local sandbox enabled for ordinary local users.

By default:

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_ADMIN_ONLY=false`
3. the default executor stays on `mock`, so `smoke:lite` can validate the path without extra system setup

If you want the old lock-back behavior:

```bash
SANDBOX_ADMIN_ONLY=true npm run start:lite
```

If you want a practical local-process sandbox preset without writing raw JSON env by hand:

```bash
npm run start:lite:local-process
```

That preset currently maps to:

1. `LITE_SANDBOX_PROFILE=local_process_echo`
2. `SANDBOX_EXECUTOR_MODE=local_process`
3. `SANDBOX_ALLOWED_COMMANDS_JSON=["echo"]`

## Validation

```bash
npm run test:lite
npm run benchmark:lite:real
npm run smoke:lite
npm run smoke:lite:local-process
```

`smoke:lite` now verifies:

1. Aionis health and startup
2. approval-only automation run/resume
3. replay compile -> playbook promote -> playbook-driven automation run
4. local sandbox session -> command execute -> logs

`smoke:lite:local-process` verifies the same sandbox path against the Aionis local-process preset.

`benchmark:lite:real` runs the current repeatable Aionis real-task benchmark suite for:

1. policy learning
2. cross-task isolation
3. nearby-task generalization
4. contested revalidation cost
5. wrong-turn recovery
6. workflow progression
7. multi-step repair continuity
8. slim planner/context boundary

You can also persist benchmark artifacts directly:

```bash
npx tsx scripts/lite-real-task-benchmark.ts --out-json tmp/lite-benchmark.json --out-md tmp/lite-benchmark.md
```

## Repository Operations

Repository maintenance files:

1. [CONTRIBUTING.md](CONTRIBUTING.md)
2. [SECURITY.md](SECURITY.md)
3. [NOTICE](NOTICE)

Release-baseline checks are part of the standard Aionis test suite.

## Provenance

Derived from the `Aionis` mainline runtime and now maintained as the standalone Aionis baseline that occupies the public `Cognary/Aionis` repository.
