# Claims Backing

This file is the drift-control map for the external docs draft.

Use it to keep product-facing claims tied to:

1. current code surfaces
2. current public evidence
3. current edition boundaries

## Core Product Claim

Claim:

1. Aionis helps agents continue work instead of rediscovering it.

Code backing:

1. memory write and recall routes
2. planning/context and context/assemble routes
3. handoff store and recover routes
4. replay run and playbook routes

Primary files:

1. `src/routes/memory-write.ts`
2. `src/routes/memory-recall.ts`
3. `src/routes/memory-context-runtime.ts`
4. `src/routes/handoff.ts`
5. `src/routes/memory-replay-core.ts`
6. `src/routes/memory-replay-governed.ts`

Public evidence:

1. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`
2. `docs/public/en/benchmarks/02-benchmark-snapshot-public.md`
3. `docs/public/en/benchmarks/03-differentiation-evidence.md`

## Memory And Context Claim

Claim:

1. Aionis does not only store memory; it assembles bounded context under policy and budget.

Code backing:

1. `MemoryRecallTextRequest`
2. `PlanningContextRequest`
3. `ContextAssembleRequest`
4. layered context assembly
5. memory-layer policy

Primary files:

1. `src/memory/schemas.ts`
2. `src/routes/memory-context-runtime.ts`
3. `src/memory/context-orchestrator.ts`
4. `src/memory/layer-policy.ts`

## Handoff Claim

Claim:

1. Aionis handoff is a structured continuity artifact, not just a free-form summary.

Code backing:

1. `handoff/store`
2. `handoff/recover`
3. `prompt_safe_handoff`
4. `execution_ready_handoff`

Primary files:

1. `src/routes/handoff.ts`
2. `src/memory/handoff.ts`
3. `src/memory/schemas.ts`

Public evidence:

1. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`

## Replay Claim

Claim:

1. Aionis turns successful runs into reusable execution paths.

Code backing:

1. replay run lifecycle
2. compile-from-run
3. playbook candidate
4. playbook run
5. playbook repair and review
6. playbook dispatch

Primary files:

1. `src/routes/memory-replay-core.ts`
2. `src/routes/memory-replay-governed.ts`
3. `src/memory/replay.ts`
4. `src/memory/schemas.ts`

Public evidence:

1. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`

## Policy Claim

Claim:

1. Aionis makes tool selection and adaptation inspectable and reviewable.

Code backing:

1. rules evaluate
2. tools select
3. tools decision
4. tools run
5. tools feedback
6. rule feedback and rule state

Primary files:

1. `src/routes/memory-feedback-tools.ts`
2. `src/memory/rules-evaluate.ts`
3. `src/memory/tools-select.ts`
4. `src/memory/tools-decision.ts`
5. `src/memory/tools-run.ts`
6. `src/memory/tools-feedback.ts`
7. `src/memory/rules.ts`

## Lite / Server Boundary Claim

Claim:

1. Lite keeps core continuity surfaces, while admin/control and automations remain server-only.

Code backing:

1. Lite server-only route matrix
2. route registration and edition gating

Primary files:

1. `src/host/lite-edition.ts`
2. `src/host/http-host.ts`

Public docs backing:

1. `docs/public/en/getting-started/07-choose-lite-vs-server.md`

## Production Operations Claim

Claim:

1. Aionis already has a real operations posture, including health, release gates, and an HA migration path.

Code backing:

1. `/health` response exposes edition, backend, capabilities, and Lite route matrix
2. host request telemetry is recorded for key memory endpoints
3. Lite explicitly rejects server-only control routes
4. jobs and runbooks define deployment and gate workflows

Primary files:

1. `src/host/http-host.ts`
2. `src/host/lite-edition.ts`
3. `src/jobs/README.md`

Public docs backing:

1. `docs/public/en/operations/00-operate.md`
2. `docs/public/en/operations/06-standalone-to-ha-runbook.md`

## Governance Claim

Claim:

1. Aionis exposes staged rule lifecycle, decision traceability, quota controls, and audit surfaces.

Code backing:

1. tool decision and feedback provenance
2. tenant quota and sandbox budget control routes
3. control audit-event listing

Primary files:

1. `src/memory/tools-select.ts`
2. `src/memory/tools-decision.ts`
3. `src/memory/tools-feedback.ts`
4. `src/routes/admin-control-config.ts`
5. `src/control-plane.ts`

Public docs backing:

1. `docs/public/en/control/01-control-policy.md`
2. `docs/public/en/control/02-rule-lifecycle.md`
3. `docs/public/en/reference/03-rule-promotion-governance.md`

## Benchmark And SLO Claim

Claim:

1. Aionis has reproducible public evidence for performance, continuity, policy loop, and replay, plus deeper gate artifacts for operational standards.

Code backing:

1. benchmark and report jobs
2. consolidation SLO and replay determinism jobs

Primary files:

1. `src/jobs/perf-benchmark.ts`
2. `src/jobs/perf-report.ts`
3. `src/jobs/consolidation-health-slo.ts`
4. `src/jobs/consolidation-replay-determinism.ts`

Public docs backing:

1. `docs/public/en/benchmarks/02-benchmark-snapshot-public.md`
2. `docs/public/en/benchmarks/03-differentiation-evidence.md`
3. `docs/public/en/benchmarks/05-performance-baseline.md`
4. `docs/public/en/benchmarks/07-agent-handoff-and-replay.md`

## Guardrail For Future Rewrites

Do not publish a top-level claim in `docs-v2` unless at least one of these is true:

1. there is a route or schema that implements it now
2. there is a public benchmark page that supports it now
3. the wording clearly frames it as direction, not current repository capability

Additional rule for ongoing experiments:

1. an internal or still-running comparison experiment is not enough by itself for a public top-level claim
2. use it to prioritize what to validate next, not to inflate the current external story
