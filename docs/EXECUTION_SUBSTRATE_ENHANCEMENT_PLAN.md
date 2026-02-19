---
title: "Execution Substrate Enhancement Plan"
---

# Execution Substrate Enhancement Plan

Last updated: `2026-02-19`

## Objective

Strengthen Aionis from `Memory -> Policy` into an auditable `Memory -> Planner -> Execution` operating loop with explicit production gates.

## Baseline (current)

1. Data structure and SoR commit chain are in place.
2. Write path and derived async pipeline are in place.
3. Rule lifecycle and planner/tool injection are in place.
4. Feedback capture is in place.
5. Gap: no dedicated gate that verifies execution-loop health in release decisions.

## Phase Plan

## Phase A: Execution Loop Gate (now)

Goal:

1. Add a dedicated job that quantifies execution-loop integrity and freshness.
2. Make it available from operations workflows (`health-gate` optional hook).

Deliverables:

1. `job:execution-loop-gate` with JSON output and strict modes.
2. Metrics:
   - feedback volume and outcome distribution
   - `run_id` coverage
   - active/shadow rule coverage
   - stale active-rule detection
3. Hook in `scripts/health-gate.sh` (opt-in first).

DoD:

1. Job compiles and runs on default local DB.
2. Health gate can include this check with one flag.
3. Operator docs include execution command and interpretation.

## Phase B: Execution Provenance (next)

Goal:

1. Add explicit execution-correlation records for planner/tool decisions (decision id, selected tool, policy hash, run id).

Deliverables:

1. Persistence model for execution decisions.
2. API contract extension for optional `decision_id`.
3. Consistency checks for decision-feedback linkage.

DoD:

1. Every feedback event can be linked to at least one decision record.
2. Replay/audit can reconstruct selected-tool history per run.

Progress (`2026-02-19`):

1. Added persisted `memory_execution_decisions` records from `tools/select`.
2. Added `decision_id` linkage path in `tools/feedback` (`provided` / `inferred` / `created_from_feedback`).
3. Added consistency checks for feedback-decision linkage integrity.

## Phase C: Policy Adaptation Guardrails

Goal:

1. Promote/disable policy with objective thresholds and rollback safety.

Deliverables:

1. Promotion thresholds codified as gate policy.
2. Shadow-to-active and active-to-disabled suggestions with confidence.
3. Change-risk scoring and canary policy mode.

DoD:

1. Promotion decisions are reproducible from evidence data.
2. Rollback path is one command with commit trace.

Progress (`2026-02-19`):

1. Added `job:policy-adaptation-gate` with objective promote/disable thresholds.
2. Added confidence + risk scoring + canary recommendation in suggestion output.
3. Added `apply` + `rollback` payloads for each suggestion.
4. Integrated optional policy adaptation sub-gate into `scripts/health-gate.sh`.

## Phase D: Multi-Agent Execution Governance

Goal:

1. Enforce cross-agent memory policy controls with measurable drift detection.

Deliverables:

1. Agent/team governance checks in execution loop gate.
2. Shared-memory boundary coverage metrics.
3. Drift alarms for policy mismatch across tenants.

DoD:

1. Cross-agent violations are detectable and blockable.
2. Governance metrics are included in weekly release evidence.

Progress (`2026-02-19`):

1. Extended `job:execution-loop-gate` with governance metrics:
   - recall identity coverage
   - private-lane owner coverage
   - cross-tenant policy drift
2. Added governance-oriented gate checks for drift and boundary coverage.
3. Added `job:governance-weekly-report` to export weekly governance evidence (`summary.json` + `WEEKLY_STATUS.md`) for release review.

## Execution Commands (Phase A target)

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s job:execution-loop-gate -- --scope default
npm run -s job:health-gate -- --run-execution-loop-gate --strict-warnings
npm run -s job:governance-weekly-report -- --scope default --window-hours 168 --strict-warnings
```

## Risks

1. False negatives in low-traffic environments.
2. Over-strict thresholds causing noisy gate failures.
3. Feedback data quality varies by client integration maturity.

## Mitigations

1. Start with warning mode + explicit strict flags.
2. Keep thresholds configurable by CLI args.
3. Track evidence in JSON output with check-level transparency.
