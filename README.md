# Aionis

`Aionis` is an execution-memory runtime for building agents that learn workflows, trust patterns, and govern memory updates.

This repository is the runtime/core source of truth behind the future **Aionis SDK**.

Public product direction:

1. Aionis Runtime
2. Aionis SDK
3. adapters and integrations later

Planned distribution boundary:

1. `@aionis/sdk` is the primary open developer surface
2. runtime contracts and integration boundaries stay explicit
3. the strongest runtime learning/governance layers can remain layered and selectively distributed

SDK entry points:

1. [packages/sdk/README.md](/Volumes/ziel/Aionisgo/packages/sdk/README.md)
2. [docs/SDK_QUICKSTART.md](/Volumes/ziel/Aionisgo/docs/SDK_QUICKSTART.md)
3. [docs/SDK_PUBLISHING.md](/Volumes/ziel/Aionisgo/docs/SDK_PUBLISHING.md)

Recommended mental model:

1. Aionis captures execution evidence, not just chat history
2. Aionis turns repeated execution into stable workflow guidance and trusted patterns
3. Aionis exposes that behavior through a local runtime today and a first-party SDK surface next

Important product boundary:

1. MCP, Codex, IDE, and host integrations are adapter layers
2. they should not be treated as the primary Aionis identity
3. the primary identity is the runtime plus SDK
4. the public adoption wedge is the SDK, not full exposure of every runtime-internal capability

Current repository focus:

1. runtime/core
2. SQLite-backed local memory
3. execution-memory routes and contracts
4. benchmark, regression gating, and real validation
5. SDK-first release preparation

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
7. [docs/plans/2026-03-23-aionis-sdk-release-design.md](/Volumes/ziel/Aionisgo/docs/plans/2026-03-23-aionis-sdk-release-design.md)

Everything else in this repository should be read as runtime/internal reference material, not as the final public SDK surface.

Quick start:

```bash
nvm use
npm install
npm run start:lite:sdk-demo
```

`npm run build` is still available as a packaging/contract check, but Aionis startup no longer depends on a prebuilt wrapper artifact.

## Why Aionis Exists

Aionis is for agent and runtime builders who want memory to behave like execution infrastructure instead of a generic note store.

Current mainlines:

1. workflow learning from repeated execution continuity
2. pattern learning from repeated tool feedback
3. planner-visible workflow guidance and rehydration
4. governed memory behavior on replay, workflow, and tools paths

Current technical posture:

1. real-task benchmark baseline currently passes `14/14`
2. benchmark/profile regression gates are in place
3. real external LLM governance shadow validation has already been run without governed outcome drift on the benchmark suite

This means the runtime is no longer only internally self-consistent.
It has already been validated against a real external governance backend in shadow mode.

## SDK-First Direction

The next public-facing step for Aionis is a first-party SDK.

Recommended release stance:

1. keep `@aionis/sdk` open and easy to adopt
2. keep runtime contracts explicit
3. treat deeper runtime learning/governance implementation as a controlled layer, not a mandatory open-source surface

Recommended SDK v1 surface:

1. `memory.write`
2. `memory.planningContext`
3. `memory.contextAssemble`
4. `memory.executionIntrospect`
5. `memory.tools.select`
6. `memory.tools.feedback`
7. `memory.replay.repairReview`
8. `memory.anchors.rehydratePayload`

Recommended public hierarchy:

1. Aionis Runtime
2. Aionis SDK
3. adapters like MCP or Codex integrations later

For the current SDK release design, see:

1. [docs/plans/2026-03-23-aionis-sdk-release-design.md](/Volumes/ziel/Aionisgo/docs/plans/2026-03-23-aionis-sdk-release-design.md)
2. [docs/SDK_QUICKSTART.md](/Volumes/ziel/Aionisgo/docs/SDK_QUICKSTART.md)
3. [docs/SDK_PUBLISHING.md](/Volumes/ziel/Aionisgo/docs/SDK_PUBLISHING.md)
4. [docs/OPEN_CORE_BOUNDARY.md](/Volumes/ziel/Aionisgo/docs/OPEN_CORE_BOUNDARY.md)

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

If you want the public SDK/demo route surface instead of the full Lite runtime profile:

```bash
npm run start:lite:sdk-demo
```

That preset currently maps to:

1. `LITE_SANDBOX_PROFILE=local_process_echo`
2. `SANDBOX_EXECUTOR_MODE=local_process`
3. `SANDBOX_ALLOWED_COMMANDS_JSON=["echo"]`

## Validation

```bash
npm run test:lite
npm run benchmark:lite:real
npm run benchmark:lite:real:http-shadow
npm run smoke:lite
npm run smoke:lite:local-process
npm run validate:lite:real
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
8. governed learning runtime loop
9. governed replay runtime loop
10. governance provider precedence
11. custom model-client replacement
12. HTTP model-client replacement
13. HTTP external shadow compare
14. slim planner/context boundary

`benchmark:lite:real:http-shadow` runs the same benchmark surface with an external HTTP governance shadow compare when the relevant env vars are provided.

You can also persist benchmark artifacts directly:

```bash
npx tsx scripts/lite-real-task-benchmark.ts --out-json /tmp/lite-benchmark.json --out-md /tmp/lite-benchmark.md
```

Or run a full isolated validation outside the repository:

```bash
bash scripts/lite-real-validation.sh --workdir /tmp/aionis_lite_real_validation
```

## Repository Operations

Repository maintenance files:

1. [CONTRIBUTING.md](CONTRIBUTING.md)
2. [SECURITY.md](SECURITY.md)
3. [NOTICE](NOTICE)

Release-baseline checks are part of the standard Aionis test suite.

## Provenance

Derived from the `Aionis` mainline runtime and now maintained as the standalone Aionis baseline that occupies the public `Cognary/Aionis` repository.
