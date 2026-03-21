# Aionis Lite

A standalone `Aionis Lite` repository for the single-user local runtime.

Short positioning:

`Aionis Lite` is a local execution-memory runtime.

It is no longer just a generic memory API.

Its current product center is:

1. turning stable work into reusable workflow memory
2. learning trusted tool-selection patterns from feedback
3. rehydrating historical detail only when the runtime actually needs it

Fast entry points:

1. public beta narrative:
   [docs/public/en/getting-started/08-lite-execution-memory-beta-narrative.md](docs/public/en/getting-started/08-lite-execution-memory-beta-narrative.md)
2. demo walkthrough:
   [docs/public/en/getting-started/09-lite-execution-memory-demo-walkthrough.md](docs/public/en/getting-started/09-lite-execution-memory-demo-walkthrough.md)
3. demo checklist:
   [docs/public/en/getting-started/10-lite-execution-memory-demo-checklist.md](docs/public/en/getting-started/10-lite-execution-memory-demo-checklist.md)
4. integrator guide:
   [docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md](docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md)

Repository split:

1. `Cognary/Aionis` = standalone Lite repository
2. `Cognary/AionisPro` = full repository with Server, SDKs, docs, playground, ops surfaces, and shared-core split scaffolding

This repository carries the Lite runtime, SQLite-backed stores, Lite operator docs, and the local automation kernel.

At a glance:

1. `Anchor-Guided Rehydration Loop`
   `stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`
2. `Execution Policy Learning Loop`
   `feedback -> pattern -> recall -> selector reuse`
3. planner/context routes expose a stable `planner_packet`, canonical `workflow_signals` and `pattern_signals`, compact `planning_summary`, and aligned `execution_kernel`
4. `POST /v1/memory/execution/introspect` provides a demo/operator execution-memory view in one response
5. current baseline is `V3`: workflow promotion, pattern credibility, counter-evidence, maintenance summaries, and auto-promotion of ready workflow candidates are all active

Current recommended integration model:

1. read full workflow, pattern, and rehydration collections from `planner_packet.sections.*`
2. read signal state from `workflow_signals` and `pattern_signals`
3. read compact explanations from `planning_summary` or `assembly_summary`
4. read compact runtime state from `execution_kernel.*_summary`

Current contract note:

1. default planner/context routes now return `planner_packet` as the only full collection owner
2. `execution_kernel` remains the compact aligned runtime owner
3. `workflow_signals` and `pattern_signals` remain canonical route-level signal surfaces
4. heavier inspection output lives on `POST /v1/memory/execution/introspect`

Documentation map:

Public docs:

1. [docs/public/en/getting-started/05-lite-public-beta-boundary.md](docs/public/en/getting-started/05-lite-public-beta-boundary.md)
2. [docs/public/en/getting-started/07-lite-api-capability-guide.md](docs/public/en/getting-started/07-lite-api-capability-guide.md)
3. [docs/public/en/getting-started/08-lite-execution-memory-beta-narrative.md](docs/public/en/getting-started/08-lite-execution-memory-beta-narrative.md)
4. [docs/public/en/getting-started/09-lite-execution-memory-demo-walkthrough.md](docs/public/en/getting-started/09-lite-execution-memory-demo-walkthrough.md)
5. [docs/public/en/getting-started/10-lite-execution-memory-demo-checklist.md](docs/public/en/getting-started/10-lite-execution-memory-demo-checklist.md)

Integrator docs:

1. [docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md](docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md)
2. [docs/LITE_API_CAPABILITY_MATRIX.md](docs/LITE_API_CAPABILITY_MATRIX.md)
3. [docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md](docs/LITE_PLANNER_PACKET_AND_PROVENANCE_CONTRACT.md)
4. [docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md](docs/LITE_EXECUTION_NATIVE_ROUTE_CONTRACT.md)
5. [docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md](docs/LITE_EXECUTION_MEMORY_PRODUCT_CONTRACT_V1.md)
6. [docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md](docs/LITE_EXECUTION_MEMORY_V2_MIRROR_MIGRATION_SKETCH.md)
7. [docs/LITE_TESTING_STRATEGY.md](docs/LITE_TESTING_STRATEGY.md)
8. [docs/LITE_CLAUDE_CODE_REAL_VALIDATION_REPORT.md](docs/LITE_CLAUDE_CODE_REAL_VALIDATION_REPORT.md)

Internal design docs:

1. [docs/LITE_ARCHITECTURE_AND_COMPLETION.md](docs/LITE_ARCHITECTURE_AND_COMPLETION.md)
2. [docs/LITE_EXECUTION_MEMORY_STRATEGY.md](docs/LITE_EXECUTION_MEMORY_STRATEGY.md)
3. [docs/LITE_MEMORY_GOVERNANCE_MODEL.md](docs/LITE_MEMORY_GOVERNANCE_MODEL.md)
4. [docs/LITE_MEMORY_TRIGGER_MATRIX.md](docs/LITE_MEMORY_TRIGGER_MATRIX.md)
5. [docs/LITE_ANCHOR_SCHEMA.md](docs/LITE_ANCHOR_SCHEMA.md)
6. [docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md](docs/LITE_FOUNDATION_MEMORY_UPGRADE_ROADMAP.md)
7. [docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md](docs/LITE_FOUNDATION_MEMORY_V1_IMPLEMENTATION_PLAN.md)
8. [docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md](docs/LITE_FOUNDATION_MEMORY_V2_IMPLEMENTATION_PLAN.md)
9. [docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md](docs/LITE_FOUNDATION_MEMORY_V3_IMPLEMENTATION_PLAN.md)
10. [docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md](docs/LITE_EXECUTION_MEMORY_CONTRACT_CLEANUP_PLAN.md)
11. [docs/LITE_EXECUTION_MEMORY_REDUNDANCY_AUDIT.md](docs/LITE_EXECUTION_MEMORY_REDUNDANCY_AUDIT.md)
12. [docs/adr/ADR-0001-lite-execution-memory-kernel.md](docs/adr/ADR-0001-lite-execution-memory-kernel.md)

Current scope:

1. local Lite runtime packaging
2. Lite startup contracts and smoke validation
3. Lite public-beta operator docs
4. shared runtime-core boundary package

Current limitations:

1. some shared runtime implementation still lives in the copied `src/` tree
2. replay/playbook and automation still share one local-user identity model rather than a multi-user control plane
3. release packaging is intentionally source-first
4. Lite keeps a narrower capability surface than Server by design

## Automation API Contract

Lite automation responses now expose a stable `runtime` envelope instead of transitional `lite_kernel` flags.

Current runtime contract:

1. `runtime.edition = "lite"`
2. `runtime.automation_kernel = "local_playbook_v1"`
3. `supported_node_kinds` and `supported_routes` are returned on validation responses

Lite error responses now follow one stable envelope:

1. `status`
2. `error`
3. `message`
4. `details`

## Quick Start

```bash
nvm use
npm install
npm run start:lite
```

`npm run build` is still available as a packaging/contract check, but Lite startup no longer depends on a prebuilt wrapper artifact.

## Local Identity

Lite now defaults replay, playbook, and automation flows to a single local actor.

By default:

1. `LITE_LOCAL_ACTOR_ID=local-user`
2. replay writes default to private local ownership
3. automation playbook nodes reuse the same local actor when no explicit actor is provided

Override it when you want a stable local identity:

```bash
LITE_LOCAL_ACTOR_ID=lucio npm run start:lite
```

## Sandbox

Lite now starts with the local sandbox enabled for ordinary local users.

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
npm run smoke:lite
npm run smoke:lite:local-process
```

`smoke:lite` now verifies:

1. Lite health and startup
2. approval-only automation run/resume
3. replay compile -> playbook promote -> playbook-driven automation run
4. local sandbox session -> command execute -> logs

`smoke:lite:local-process` verifies the same sandbox path against the Lite local-process preset.

## Repository Operations

Repository maintenance files:

1. [CONTRIBUTING.md](CONTRIBUTING.md)
2. [SECURITY.md](SECURITY.md)
3. [NOTICE](NOTICE)

Release-baseline checks are part of the standard Lite test suite.

## Provenance

Derived from the `Aionis` mainline runtime and now maintained as the standalone Lite baseline that occupies the public `Cognary/Aionis` repository.
