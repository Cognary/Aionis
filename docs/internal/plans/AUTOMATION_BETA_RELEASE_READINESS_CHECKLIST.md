---
title: "Automation Beta Release Readiness Checklist"
---

# Automation Beta Release Readiness Checklist

Status: `draft` (`2026-03-08`)  
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
3. `Public beta`: `go`
4. `GA`: `not_yet`

Reason:

1. the Automation DAG Phase 1 runtime now works end-to-end, including `approval`, `repair`, `reject_repair`, `compensation/retry`, and explicit `shadow` execution
2. the current product now has a bounded write-capable operator governance surface with explicit reviewer inboxes, hosted-style shadow validation dispatch, public automation API docs, executed rollback drill evidence, and broad live smoke coverage across runtime, control-plane, and alert-recovery paths
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
4. operator ownership is assigned: `done`

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
6. reviewer queue / approval inbox exists: `done`
7. minimal shadow validation inspector / report exists: `done`
8. minimal shadow diff-oriented validation surface exists: `done`
9. recorded shadow review verdict exists: `done`
10. recorded shadow review history is visible: `done`
11. shadow to active promotion is gated on approved shadow review: `done`
12. shadow validation request tracking and inline validator exist: `done`
13. background shadow validation dispatch skeleton exists: `done`
14. hosted or managed async shadow validator exists: `done`

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
13. live hosted shadow-validator smoke passes: `done`
14. hosted shadow-validator watch loop survives transient dispatch failure: `done`
15. live alert dispatch smoke passes: `done`
16. live alert dispatch failure smoke passes: `done`
17. live alert dispatch job smoke passes: `done`
18. live alert dispatch rate-limit smoke passes: `done`
19. live hosted alert dispatch smoke passes: `done`
20. live alert delivery replay smoke passes: `done`
21. live Ops alert-delivery replay route smoke passes: `done`
22. live Ops alert-delivery batch replay route smoke passes: `done`
23. live hosted alert-delivery replay worker smoke passes: `done`
24. live dead-letter reopen replay worker smoke passes: `done`
25. live replay-worker dedupe smoke passes: `done`
26. live replay-worker backoff smoke passes: `done`
27. live overdue replay-worker smoke passes: `done`
28. live unassigned replay-worker smoke passes: `done`
29. concurrency and race-condition coverage is sufficient for bounded public beta: `done`
30. failure injection coverage is sufficient for bounded public beta: `done`
Current note: broader long-run concurrency and fault-matrix expansion remains a GA hardening task, but the current evidence set is now treated as sufficient for bounded public beta.

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
11. alerting / telemetry / SLO view for automation exists: `done`
Current note: telemetry, SLO, recent incidents, alert-candidate signals, admin alert-route coverage preview, a filterable failed alert deliveries inbox, failed alert-delivery owner / escalation-owner / SLA assignment, explicit failed alert-delivery workflow states (`replay_backlog`, `manual_review`, `dead_letter`), replay-backlog / dead-letter / overdue / unassigned alert-delivery queue views, queue-specific alert-delivery action panels with focus links, batch workflow assignment, batch replay preview, batch replay execute, route-level cooldown/retry/rate-limit policy, route-level failed alert-delivery replay backoff policy, owner/SLA-aware replay worker filtering, manual alert-dispatch controls, explicit failed-delivery replay, a dispatchable automation-alert worker job, a hosted-style alert dispatch loop entrypoint, a hosted-style failed alert-delivery replay worker with replay backoff, a dedicated dead-letter replay worker entrypoint, a dedicated overdue replay worker entrypoint, a dedicated unassigned replay worker entrypoint, and live webhook dispatch smokes for success, cooldown/dedupe, failed-delivery retry, failed-delivery replay, batch failed-delivery replay execute, hosted failed alert-delivery replay worker execution, replay-worker dedupe for already-replayed originals, route-policy replay-worker backoff after failed replay attempts, dead-letter worker preview execution, dead-letter reopen via hosted worker execution, overdue replay worker selection by SLA breach, unassigned replay worker selection by missing owner, rate-limit enforcement, worker-driven dispatch, hosted-loop dispatch, and Ops forwarding-route replay paths now exist. Remaining hosted alerting gaps are GA-grade, not public-beta blockers.
12. rollback plan for bad automation versions exists: `done`

### 3.6 Commercial Gate

1. positioning is limited to thin orchestrator public beta: `done`
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
3. item 3: `met`
4. item 4: `met`
5. item 5: `met`
6. item 6: `met`
7. item 7: `met`

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
6. public beta rollback drill: `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_PUBLIC_BETA_ROLLBACK_DRILL_2026-03-08.md`
7. public beta rollback drill script: `/Users/lucio/Desktop/Aionis/examples/automation_public_beta_rollback_drill.sh`
8. public automation API docs (EN): `/Users/lucio/Desktop/Aionis/docs/public/en/api-reference/01-automation-api-reference.md`
9. public automation API docs (ZH): `/Users/lucio/Desktop/Aionis/docs/public/zh/api-reference/01-automation-api-reference.md`
10. approval smoke: `/Users/lucio/Desktop/Aionis/examples/automation_phase1_smoke.sh`
11. control-plane conflict smoke: `/Users/lucio/Desktop/Aionis/examples/automation_control_plane_smoke.sh`
12. control-plane concurrency smoke: `/Users/lucio/Desktop/Aionis/examples/automation_control_plane_concurrency_smoke.sh`
13. failure injection smoke: `/Users/lucio/Desktop/Aionis/examples/automation_failure_injection_smoke.sh`
14. db failure injection smoke: `/Users/lucio/Desktop/Aionis/examples/automation_db_failure_smoke.sh`
15. compensation db failure smoke: `/Users/lucio/Desktop/Aionis/examples/automation_compensation_db_failure_smoke.sh`
16. shadow dispatch smoke: `/Users/lucio/Desktop/Aionis/examples/automation_shadow_dispatch_smoke.sh`
17. hosted shadow-validator smoke: `/Users/lucio/Desktop/Aionis/examples/automation_hosted_shadow_validator_smoke.sh`
18. hosted shadow-validator failure probe: `/Users/lucio/Desktop/Aionis/examples/automation_hosted_shadow_validator_failure_probe.sh`
19. repair smoke: `/Users/lucio/Desktop/Aionis/examples/automation_playbook_repair_smoke.sh`
20. compensation smoke: `/Users/lucio/Desktop/Aionis/examples/automation_compensation_smoke.sh`
21. shadow smoke: `/Users/lucio/Desktop/Aionis/examples/automation_shadow_smoke.sh`
22. SDK smoke: `/Users/lucio/Desktop/Aionis/src/dev/sdk-smoke.ts`
23. contract regression smoke: `/Users/lucio/Desktop/Aionis/src/dev/contract-smoke.ts`
24. ops automation inspector, actionable queue, reviewer inboxes, and run-scoped controls: `/Users/lucio/Desktop/Aionis/apps/ops/app/automations/page.jsx`
25. ops automation execute route: `/Users/lucio/Desktop/Aionis/apps/ops/app/api/automation/execute/route.js`
26. automation run list API: `/Users/lucio/Desktop/Aionis/src/memory/automation.ts`

## 8. Immediate Release Blockers

These are the concrete blockers for `public beta` or stronger:

1. broader reviewer routing and policy automation are still missing, but bounded reviewer inboxes and write-capable controls now exist for public beta
2. hosted shadow validation now exists for bounded public beta, but fuller multi-stage review workflow is still a GA blocker
3. Marketplace install/distribution layer is still missing, so public beta positioning must remain Automation-only

## 9. Recommended Next Sequence

### 9.1 To Ship Design Partner Beta

1. add 2-3 high-value race and failure-injection tests `partial`
Current note: targeted control-plane conflict coverage, concurrent control-action smoke, replay/compensation failure injection smoke, resume-path DB failure smoke, and compensation-finalize DB failure smoke now exist, but the failure matrix is still incomplete.
2. prepare a short operator runbook for cancel/reject/compensation/shadow cases `done`

### 9.2 To Reach Public Beta

1. add minimal operator governance UI or report surface `done`
2. add shadow validation inspector/report `done`
3. harden test matrix for concurrent control-plane actions `met`
4. publish complete automation API docs `met`

### 9.3 To Reach GA

1. close the main governance UX gaps
2. complete compensation and failure-class controls
3. either ship Marketplace Phase 0 or narrow the product claim to Automation-only GA

## 10. Final Go / No-Go

Decision as of `2026-03-08`:

1. `Design partner beta`: `go`
2. `Public beta`: `go`
3. `GA`: `no_go`

Short justification:

1. the runtime and state model are now strong enough for controlled external use
2. the shipped surface is now strong enough for bounded Automation public beta, but GA-grade governance and Marketplace scope are still incomplete
