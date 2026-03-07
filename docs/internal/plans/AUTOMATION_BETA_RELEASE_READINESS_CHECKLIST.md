---
title: "Automation Beta Release Readiness Checklist"
---

# Automation Beta Release Readiness Checklist

Status: `draft` (`2026-03-07`)  
Owner: Aionis Core  
Depends on:

1. `/Users/lucio/Desktop/Aionis/docs/PLAYBOOK_MARKETPLACE_AUTOMATION_DAG_PLAN.md`
2. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_PHASE1_IMPLEMENTATION_SPEC.md`
3. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_OPERATOR_RUNBOOK.md`
4. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_GA_GAP_CLOSURE_PLAN.md`

## 1. Release Recommendation

Current recommendation:

1. `Internal alpha`: `go`
2. `Design partner beta`: `go`
3. `Public beta`: `not_yet`
4. `GA`: `not_yet`

Reason:

1. the Automation DAG Phase 1 runtime now works end-to-end, including `approval`, `repair`, `reject_repair`, `compensation/retry`, and explicit `shadow` execution
2. the current product now has a minimal write-capable operator governance surface with reviewer-filtered actionable and promotion queues, but still lacks broader reviewer workflow UX, complete failure injection coverage, and Marketplace packaging/install capability
3. the runtime is still intentionally a thin sequential orchestrator, not a production workflow engine

## 2. Beta Scope

This checklist is for a bounded beta release of:

1. automation definition and validation
2. automation run lifecycle
3. approval and repair control flows
4. compensation skeleton
5. explicit shadow validation mode

This checklist is not a release gate for:

1. Marketplace package publishing
2. package reputation and trust badges
3. parallel scheduling
4. general workflow triggers
5. public self-serve ecosystem launch

## 3. Gate Summary

### 3.1 Product Gate

1. feature boundary is explicitly documented: `done`
2. known limitations are documented for beta users: `done`
3. success criteria for beta users are defined: `done`
4. operator ownership is assigned: `partial`

### 3.2 Runtime Gate

1. create/get/run/cancel/resume/validate are implemented: `done`
2. approve/reject repair are implemented: `done`
3. compensation retry is implemented: `done`
4. explicit shadow execution mode is implemented: `done`
5. replay-linked node evidence exists for strict/guided/shadow paths: `done`
6. branching and parallel scheduling are intentionally out of scope: `accepted_gap`

### 3.3 Governance Gate

1. automation version states `draft/shadow/active/disabled` work: `done`
2. disabled versions are not runnable: `done`
3. stale promotion is blocked: `done`
4. repair lineage checks are enforced before resume: `done`
5. minimal actionable run queue exists: `done`
6. reviewer queue / approval inbox exists: `not_done`
7. minimal shadow validation inspector / report exists: `done`
8. minimal shadow diff-oriented validation surface exists: `done`
9. recorded shadow review verdict exists: `done`
10. recorded shadow review history is visible: `done`
11. shadow to active promotion is gated on approved shadow review: `done`
12. shadow validation request tracking and inline validator exist: `done`
13. background shadow validation dispatch skeleton exists: `partial`
14. hosted or managed async shadow validator exists: `not_done`

### 3.4 Quality Gate

1. build passes: `done`
2. contract smoke passes: `done`
3. live automation smoke passes: `done`
4. live control-plane conflict smoke passes: `done`
5. live control-plane concurrency smoke passes: `done`
6. live failure injection smoke passes: `done`
7. live db failure injection smoke passes: `done`
8. live compensation db failure smoke passes: `done`
9. live repair smoke passes: `done`
10. live compensation smoke passes: `done`
11. live shadow smoke passes: `done`
12. live shadow dispatch smoke passes: `done`
13. concurrency and race-condition coverage is sufficient: `partial`
14. failure injection matrix is sufficient: `partial`

### 3.5 Operations Gate

1. migration path is defined: `done`
2. operator runbook exists for runtime failures: `done`
3. minimal operator governance UI / report surface exists: `done`
4. run-scoped write controls exist in Ops surface: `done`
5. run-level compensation assessment and repeat-action guidance exist: `done`
6. compensation failures inbox exists in Ops surface: `done`
7. compensation policy matrix exists in API and Ops surface: `done`
8. compensation workflow action recording exists in API and Ops surface: `done`
9. compensation owner / SLA / escalation-owner tracking exists in API and Ops surface: `done`
10. compensation queue filtering and overdue / unassigned views exist in Ops surface: `done`
11. alerting / telemetry / SLO view for automation exists: `partial`
12. rollback plan for bad automation versions exists: `partial`

### 3.6 Commercial Gate

1. positioning is limited to thin orchestrator beta: `partial`
2. public packaging/install story exists: `not_done`
3. marketplace trust/reputation story exists: `not_done`

## 4. Required Beta Exit Criteria

The following must be true before inviting external design partners:

1. `run`, `cancel`, `resume`, `approve_repair`, `reject_repair`, and `compensation/retry` are stable in live smoke
2. `shadow` runs must succeed for approval-gated and playbook-backed DAGs without human intervention
3. run terminal outcomes must remain stable after compensation bookkeeping
4. every playbook-backed node must retain replay evidence, including `playbook_run_id` for shadow simulate runs
5. the beta limitation set must be published in one operator-facing document
6. migrations must be validated on a non-empty database snapshot

Current status:

1. criteria 1-6: `met`

## 5. Required Public Beta Exit Criteria

The following should be finished before a broader public beta:

1. minimal operator governance console
2. shadow validation inspector or report view
3. release-ready API documentation for automation endpoints
4. known-limits and support policy document
5. concurrency/race test coverage for cancel/resume/reject/approve interactions
6. failure injection coverage for replay failure, DB failure, and compensation failure
7. migration rehearsal and rollback drill

Current status:

1. item 1: `met`
2. item 2: `met`
3. items 3-7: `not_yet_met`

## 6. Required GA Exit Criteria

The following should be finished before claiming GA:

1. operator-facing governance surfaces are complete enough for daily use
2. shadow validation is observable and auditable from UI/reporting, not just raw API
3. compensation behavior and failure classes are documented and operator-controllable
4. upgrade, rollback, and incident response runbooks are complete
5. long-running stability and recovery testing is complete
6. Marketplace Phase 0 install/governance layer is either shipped or clearly excluded from the GA promise

Current status:

1. all items: `not_yet_met`

## 7. Evidence Map

Current evidence for the beta recommendation:

1. core roadmap status: `/Users/lucio/Desktop/Aionis/docs/PLAYBOOK_MARKETPLACE_AUTOMATION_DAG_PLAN.md`
2. phase 1 implementation scope: `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_PHASE1_IMPLEMENTATION_SPEC.md`
3. beta limitation boundary: `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_LIMITATIONS_AND_SUPPORT_BOUNDARY.md`
4. operator runbook: `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_OPERATOR_RUNBOOK.md`
5. migration rehearsal: `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_MIGRATION_REHEARSAL_2026-03-07.md`
6. approval smoke: `/Users/lucio/Desktop/Aionis/examples/automation_phase1_smoke.sh`
7. control-plane conflict smoke: `/Users/lucio/Desktop/Aionis/examples/automation_control_plane_smoke.sh`
8. control-plane concurrency smoke: `/Users/lucio/Desktop/Aionis/examples/automation_control_plane_concurrency_smoke.sh`
9. failure injection smoke: `/Users/lucio/Desktop/Aionis/examples/automation_failure_injection_smoke.sh`
10. db failure injection smoke: `/Users/lucio/Desktop/Aionis/examples/automation_db_failure_smoke.sh`
11. compensation db failure smoke: `/Users/lucio/Desktop/Aionis/examples/automation_compensation_db_failure_smoke.sh`
12. shadow dispatch smoke: `/Users/lucio/Desktop/Aionis/examples/automation_shadow_dispatch_smoke.sh`
12. repair smoke: `/Users/lucio/Desktop/Aionis/examples/automation_playbook_repair_smoke.sh`
13. compensation smoke: `/Users/lucio/Desktop/Aionis/examples/automation_compensation_smoke.sh`
14. shadow smoke: `/Users/lucio/Desktop/Aionis/examples/automation_shadow_smoke.sh`
15. SDK smoke: `/Users/lucio/Desktop/Aionis/src/dev/sdk-smoke.ts`
16. contract regression smoke: `/Users/lucio/Desktop/Aionis/src/dev/contract-smoke.ts`
17. ops automation inspector, actionable queue, and run-scoped controls: `/Users/lucio/Desktop/Aionis/apps/ops/app/automations/page.jsx`
18. ops automation execute route: `/Users/lucio/Desktop/Aionis/apps/ops/app/api/automation/execute/route.js`
19. automation run list API: `/Users/lucio/Desktop/Aionis/src/memory/automation.ts`

## 8. Immediate Release Blockers

These are the concrete blockers for `public beta` or stronger:

1. there is no reviewer assignment policy engine or fuller promotion review workflow for repair and promotion flows
2. there is no hosted or managed async shadow validator, and there is still no broader multi-stage shadow review workflow
3. there is not yet enough concurrency and fault-injection coverage to trust broader rollout
4. there is no Marketplace install/distribution layer, so the broader product narrative still outruns implementation

## 9. Recommended Next Sequence

### 9.1 To Ship Design Partner Beta

1. add 2-3 high-value race and failure-injection tests `partial`
Current note: targeted control-plane conflict coverage, concurrent control-action smoke, replay/compensation failure injection smoke, resume-path DB failure smoke, and compensation-finalize DB failure smoke now exist, but the failure matrix is still incomplete.
2. prepare a short operator runbook for cancel/reject/compensation/shadow cases `done`

### 9.2 To Reach Public Beta

1. add minimal operator governance UI or report surface `done`
2. add shadow validation inspector/report `done`
3. harden test matrix for concurrent control-plane actions
4. publish complete automation API docs

### 9.3 To Reach GA

1. close the main governance UX gaps
2. complete compensation and failure-class controls
3. either ship Marketplace Phase 0 or narrow the product claim to Automation-only GA

## 10. Final Go / No-Go

Decision as of `2026-03-07`:

1. `Design partner beta`: `go`
2. `Public beta`: `no_go`
3. `GA`: `no_go`

Short justification:

1. the runtime and state model are now strong enough for controlled external use
2. the governance, operability, and packaging layers are not yet strong enough for broad release claims
