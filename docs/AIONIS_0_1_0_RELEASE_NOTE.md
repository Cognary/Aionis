# Aionis 0.1.0 Release Note

Release date: 2026-03-21

## Summary

`Aionis 0.1.0` is the first public release of the standalone local execution-memory runtime.

This release establishes Aionis as:

1. a single-user local runtime
2. a SQLite-backed execution-memory system
3. a product that remembers stable workflow guidance instead of only storing generic memory
4. a runtime that learns, contests, and revalidates tool-selection patterns from feedback

## What Is New In 0.1.0

The `0.1.0` baseline now includes:

1. a stable execution-memory-first planner/context surface
2. workflow progression from structured execution continuity into planner-visible workflow guidance
3. policy learning with `candidate`, `trusted`, `contested`, and `revalidated` pattern states
4. trust hardening with:
   - `3` distinct positive runs required before `trusted`
   - `2` fresh post-contest runs required before revalidation
   - task-affinity-weighted selector reuse
5. a slim default planner/context product surface with heavy inspection separated into explicit debug/operator paths
6. a repeatable real-task benchmark suite with a current `8/8 PASS` baseline

## Product Positioning

`Aionis 0.1.0` should currently be understood as:

1. a local execution-memory runtime
2. a strong fit for advanced users, agent builders, IDE and MCP integrations, and local runtime experiments
3. a product that is closer to a credible `1.0` baseline for local execution memory than to a generic memory beta

`Aionis 0.1.0` should not currently be understood as:

1. a multi-user control plane
2. a broadly hosted default deployment profile
3. a complete human-governed policy platform
4. a guarantee of full server/control-plane parity

## Core Runtime Loops

This release now treats two loops as real product behavior:

1. `Anchor-Guided Rehydration Loop`
   `stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`
2. `Execution Policy Learning Loop`
   `feedback -> pattern -> recall -> selector reuse`

## Validation

Release validation for `0.1.0` is based on:

1. `npm run test:lite`
2. `npm run benchmark:lite:real`
3. `npm run smoke:lite`
4. `npm run smoke:lite:local-process`

Current release-validation result:

1. `test:lite` passed
2. `benchmark:lite:real` passed with `8/8 PASS` and `100% suite score`
3. `smoke:lite` passed
4. `smoke:lite:local-process` passed

The benchmark baseline currently covers:

1. `policy_learning_loop`
2. `cross_task_isolation`
3. `nearby_task_generalization`
4. `contested_revalidation_cost`
5. `wrong_turn_recovery`
6. `workflow_progression_loop`
7. `multi_step_repair_loop`
8. `slim_surface_boundary`

Related report:

1. [docs/LITE_REAL_TASK_BENCHMARK_REPORT.md](./LITE_REAL_TASK_BENCHMARK_REPORT.md)
2. Reproducible JSON artifact path: `tmp/lite-benchmark-0.1.0.json`
3. Reproducible Markdown artifact path: `tmp/lite-benchmark-0.1.0.md`

These benchmark artifacts are generated locally during release validation and are not committed to the repository.

## Current Readiness Judgment

The current `0.1.0` release is ready when positioned as:

1. a local, single-user, execution-memory-first runtime
2. a product for advanced local workflows and builder-facing evaluation

The main remaining gaps are not the core workflow/pattern loops themselves.
They are:

1. broader operator governance beyond the current `suppress-first` slice
2. fuller lifecycle and maintenance productization
3. broader production-default posture beyond local advanced-user deployments

## Recommended Entry Points

For product overview:

1. [docs/public/en/getting-started/08-lite-execution-memory-beta-narrative.md](./public/en/getting-started/08-lite-execution-memory-beta-narrative.md)
2. [docs/public/zh/getting-started/08-lite-execution-memory-beta-narrative.md](./public/zh/getting-started/08-lite-execution-memory-beta-narrative.md)

For product boundary:

1. [docs/public/en/getting-started/05-lite-public-beta-boundary.md](./public/en/getting-started/05-lite-public-beta-boundary.md)
2. [docs/public/zh/getting-started/05-lite-public-beta-boundary.md](./public/zh/getting-started/05-lite-public-beta-boundary.md)

For integration:

1. [docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md](./LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md)

For benchmark evidence:

1. [docs/LITE_REAL_TASK_BENCHMARK_REPORT.md](./LITE_REAL_TASK_BENCHMARK_REPORT.md)
