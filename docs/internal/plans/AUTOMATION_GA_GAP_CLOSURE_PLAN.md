---
title: "Automation GA Gap Closure Plan"
---

# Automation GA Gap Closure Plan

Status: `draft` (`2026-03-07`)  
Owner: Aionis Core  
Depends on:

1. `/Users/lucio/Desktop/Aionis/docs/PLAYBOOK_MARKETPLACE_AUTOMATION_DAG_PLAN.md`
2. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_RELEASE_READINESS_CHECKLIST.md`
3. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_LIMITATIONS_AND_SUPPORT_BOUNDARY.md`
4. `/Users/lucio/Desktop/Aionis/docs/internal/plans/AUTOMATION_BETA_OPERATOR_RUNBOOK.md`

## 1. Goal

Close the concrete gaps between the current Automation design partner beta and a credible GA release.

This plan is for `Automation GA`, not `Marketplace GA`.

Recommended product line:

1. `Automation` may reach GA before Marketplace.
2. If Marketplace is not shipped, GA language must explicitly exclude package publishing, install, trust badges, and public catalog claims.

## 2. Current State

Current status as of `2026-03-07`:

1. runtime core is `mostly_complete`
2. governance is `partial`
3. operator support boundary is `implemented`
4. Marketplace package/install layer is `not_started`

Current release recommendation:

1. `Design partner beta`: `go`
2. `Public beta`: `no_go`
3. `GA`: `no_go`

## 3. GA Decision Rule

Do not claim GA until all of the following are true:

1. operator-facing governance is strong enough for daily use without ad hoc engineering intervention
2. shadow validation is inspectable and reviewable from product UI or reporting, not only raw API output
3. compensation behavior is operator-controllable and clearly documented by failure class
4. concurrency, recovery, and fault-injection coverage are strong enough to support broad rollout confidence
5. release docs, rollback docs, and support boundaries are consistent with the shipped surface
6. product language no longer implies a shipped Marketplace unless that layer actually exists

## 4. Primary GA Blockers

### 4.1 Governance UX

Current blocker:

1. there is no reviewer queue
2. there is no write-capable operator console
3. repair and promotion flows still depend on API/script execution

GA requirement:

1. operators can see actionable runs without manually knowing run IDs in advance
2. operators can approve, reject, cancel, retry compensation, and inspect evidence from one governed surface
3. governance actions leave explicit audit evidence

### 4.2 Shadow Validation UX

Current blocker:

1. there is a minimal read-only inspector
2. there is no shadow-vs-active diff view
3. there is no concise validation report oriented around promotion decisions

GA requirement:

1. operators can review shadow evidence by automation version
2. operators can compare `shadow` and `active` behavior at run and node level
3. promotion decisions can cite a stable shadow validation report

### 4.3 Compensation Controls

Current blocker:

1. compensation exists as a playbook-based skeleton
2. there is no failure-class matrix
3. there is no dedicated compensation control surface
4. non-playbook compensators are out of scope

GA requirement:

1. supported compensation classes are explicit
2. operator actions for `retry`, `stop`, and `accept residual failure` are defined where applicable
3. failure outcomes remain stable and inspectable after retries and recovery attempts

### 4.4 Hardening and Recovery Confidence

Current blocker:

1. targeted race and injected-failure coverage exists
2. full concurrency matrix is still incomplete
3. long-run recovery and repeated-control-action confidence is not yet GA-grade

GA requirement:

1. concurrency matrix covers all supported control-plane conflicts
2. recovery testing covers replay failure, DB failure, compensation failure, and repeated operator actions
3. there is a stable incident/rollback story for bad versions and stuck runs

### 4.5 Product Boundary and Docs

Current blocker:

1. public-beta and GA API docs are incomplete
2. the larger roadmap still contains Marketplace language
3. support and positioning material must stay narrower than the roadmap

GA requirement:

1. public docs match the shipped Automation surface exactly
2. unsupported workflow-engine expectations are explicitly rejected
3. Marketplace is either shipped in Phase 0 form or excluded from the GA promise

## 5. Recommended GA Track Split

Use two separate release tracks:

1. `Track A: Automation-only GA`
2. `Track B: Marketplace-enabled GA`

Recommendation:

1. target `Track A` first
2. treat `Track B` as a later expansion, not a blocker for Automation-only GA

Reason:

1. Automation runtime and governance are already partially built
2. Marketplace is still near zero implementation
3. forcing both into one GA milestone would delay release without improving near-term operator value

## 6. Phase Plan

### Phase G0: GA Scope Freeze

Goal:

1. lock the GA claim to `Automation-only GA`

Deliverables:

1. approved product positioning statement
2. explicit exclusion of Marketplace from GA promise unless shipped
3. final GA checklist owner map

Exit criteria:

1. release owners, engineering, and support agree on the GA boundary

### Phase G1: Write-Capable Governance Console

Goal:

1. move from read-only inspector to governed operator console

Current status:

1. `in_progress`
2. minimal run-scoped controls, reviewer assignment, an actionable run queue, and a promotion queue now exist in Ops
3. reviewer inbox semantics, assignment policy, and broader workflow routing are still missing

Scope:

1. queue view for actionable runs:
   - `paused_for_approval`
   - `paused_for_repair`
   - `compensation_failed`
   - recent `shadow` validation runs
2. run detail page with node evidence
3. guarded control actions:
   - `approve_repair`
   - `reject_repair`
   - `resume`
   - `cancel`
   - `compensation/retry`
4. explicit confirmation UX for destructive actions
5. audit event capture for every operator action

Exit criteria:

1. common beta runbook actions can be completed from UI
2. action results and failures are visible without shell scripts

### Phase G2: Shadow Validation Report

Goal:

1. make shadow validation a real promotion artifact

Current status:

1. `in_progress`
2. a first shadow report API and ops review surface now exist, including node deltas, recent history, recorded review verdicts, review history, review notes, shadow validation request tracking, and a dispatchable validator skeleton with live smoke coverage
3. a hosted or managed background validator and fuller multi-stage review workflow are still missing

Scope:

1. shadow run listing by automation version
2. per-version shadow summary:
   - run outcome
   - node outcomes
   - replay evidence completeness
   - auto-approved approval nodes
3. shadow-vs-active comparison:
   - node success/failure deltas
   - changed playbook versions
   - changed root cause classes
4. promotion recommendation field:
   - `ready`
   - `needs_review`
   - `blocked`

Exit criteria:

1. a promotion reviewer can decide from report data instead of raw JSON

### Phase G3: Compensation and Failure-Class Closure

Goal:

1. make recovery behavior explicit enough for GA support

Current status:

1. `in_progress`
2. run-level compensation assessment, repeat-action guidance, a compensation failures inbox, compensation workflow buckets, owner/escalation-owner/SLA filters, overdue and unassigned queue views, a compensation policy matrix, recorded manual-cleanup / engineering-escalation workflow actions, compensation owner / SLA / escalation-owner tracking, and a first telemetry/SLO surface now exist in API and Ops UI
3. non-playbook compensators and deeper policy automation are still missing

Scope:

1. supported compensation class table
2. operator-facing compensation state guidance
3. repeat-action rules:
   - when retry is allowed
   - when retry is blocked
   - when residual failure is terminal
4. compensation reporting in UI and docs

Exit criteria:

1. operators can identify whether a failed run is recoverable, compensable, or terminal

### Phase G4: Hardening Matrix

Goal:

1. close the confidence gap for broad release

Scope:

1. control-plane concurrency matrix:
   - `cancel vs resume`
   - `approve_repair vs reject_repair`
   - `cancel vs compensation/retry`
   - `resume vs compensation/retry`
   - repeated `approve_repair`
   - repeated `reject_repair`
2. fault-injection matrix:
   - replay failure
   - resume-path DB failure
   - compensation-finalize DB failure
   - repeated control action after partial failure
3. long-run soak for representative automation DAGs
4. rollback drill for bad automation version activation

Exit criteria:

1. release owners can point to a stable hardening report, not only ad hoc smoke logs

### Phase G5: Release Surface and Docs

Goal:

1. make the shipped surface legible and supportable

Scope:

1. release-ready API docs
2. operator docs
3. support escalation policy
4. GA limitation statement
5. migration and rollback notes

Exit criteria:

1. external users can understand the supported surface without reading internal planning docs

## 7. Work Breakdown by Priority

### P0

1. decide `Automation-only GA` versus `Automation + Marketplace GA`
2. build write-capable governance console
3. build shadow validation report
4. finish GA-grade rollback and recovery docs

### P1

1. compensation failure-class matrix
2. broader concurrency and fault-injection suite
3. release-ready public API docs

### P2

1. async shadow validator
2. richer reviewer queue semantics
3. Marketplace Phase 0, if product wants a unified GA story

## 8. Suggested Delivery Order

Recommended sequence:

1. `G0` scope freeze
2. `G1` write-capable governance console
3. `G2` shadow validation report
4. `G3` compensation closure
5. `G4` hardening matrix
6. `G5` docs and launch surface

Reason:

1. governance UX is the biggest user-visible GA gap
2. shadow review is the next biggest promotion/governance gap
3. hardening should validate the near-final surface, not a moving target

## 9. What Does Not Need To Block Automation-only GA

The following should not block `Automation-only GA` if the product claim is narrowed correctly:

1. Marketplace package publishing
2. public trust badges
3. package reputation scoring
4. public install flow
5. large-scale ecosystem positioning

## 10. Residual Risks

Even after the current gaps are closed, these risks remain:

1. users may still over-interpret Automation as a general workflow engine
2. compensation semantics will remain weaker than true distributed transactions
3. operator burden may stay higher than traditional queue-backed workflow systems

These are acceptable only if product language stays strict.

## 11. Concrete GA Exit Checklist

Automation may be called GA only when all of the following are true:

1. operator queue and write-capable control console are shipped
2. shadow validation report and comparison view are shipped
3. compensation behavior is documented by supported failure class
4. rollback drill is complete and documented
5. concurrency and fault-injection hardening report is complete
6. public API docs and support boundary docs are published
7. Marketplace is either shipped in minimum form or explicitly excluded from the GA claim

## 12. Immediate Next Step

Recommended next implementation step:

1. build `Phase G1` first

Rationale:

1. it closes the largest visible gap between design partner beta and a real product
2. it turns current API-only governance into an operable surface
3. it creates the base UI that `Phase G2` shadow reporting can extend
