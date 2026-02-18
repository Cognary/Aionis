---
title: "Aionis Personal + Custom Go-To-Market Plan"
---

# Aionis Personal + Custom Go-To-Market Plan

Status: active  
Horizon: 120 days  
Version: v1.0 (2026-02-17)

## 1) Strategy

Primary market motion:

1. Personal first: ship Aionis as a single-user AI agent memory kernel with fast setup and visible value.
2. Custom second: package multi-user, multi-tenant, governance, and SLA as enterprise custom modules.
3. One core product line: avoid separate codebases; keep shared API contract and gate system.

Why this is the fastest path:

1. Lower adoption friction for early users.
2. Faster iteration loop on memory UX and recall quality.
3. Enterprise deals can start in parallel without blocking self-serve shipping.

## 2) Product Packaging

## 2.1 Personal (self-serve)

Scope:

1. Single tenant default.
2. Core memory APIs (`write`, `recall`, `recall_text`, rules evaluation, tool selector).
3. One-command startup, regression, preflight.

Commitment:

1. Stable API contract.
2. Publish SDK baseline (TS first).
3. Clear operational defaults and troubleshooting.

## 2.2 Pro (upgrade path)

Scope:

1. Higher limits/quotas.
2. Advanced rule controls and better observability.
3. Priority support SLA (best effort).

## 2.3 Enterprise Custom

Scope:

1. Multi-tenant and group-level policy.
2. Auth mapping (API key/JWT), governance controls, auditable operations.
3. Deployment options and strict gate profile.

Delivery mode:

1. Discovery call.
2. Bounded pilot.
3. Paid rollout.

## 3) 120-Day Execution Plan

## Phase 1 (Day 1-30): Personal Productization

Objectives:

1. Make Personal installation and first value frictionless.
2. Ensure product defaults are safe and repeatable.

Deliverables:

1. Personal onboarding path with 10-minute time-to-first-recall.
2. Stable quickstart and smoke demos.
3. Error handling and docs consistency checks passing.

Exit criteria:

1. New user can run quickstart + first successful recall in under 10 minutes.
2. `preflight:prod` and `regression:oneclick` pass in clean environment.

## Phase 2 (Day 31-60): Activation and Early Revenue

Objectives:

1. Acquire first active Personal users.
2. Convert early usage into paid Pro signals.

Deliverables:

1. Public onboarding content and repeatable demos.
2. Weekly release cadence with visible changelog.
3. Early pricing experiment and upgrade path.

Exit criteria:

1. 20-30 active users.
2. At least 5 users retained for 2+ weeks.
3. First paid conversions.

## Phase 3 (Day 61-90): Reliability and Scale Proof

Objectives:

1. Stabilize Gate C under production-like load.
2. Produce repeatable evidence for SLO claims.

Deliverables:

1. Gate C blocking profile runbook.
2. Perf artifacts with adaptive rate-limit diagnostics.
3. Partition-first reset policy enforced in practice.

Exit criteria:

1. Gate C blocking pass on required scale profile.
2. No unresolved P0/P1 stability issues.

## Phase 4 (Day 91-120): Enterprise Custom Pipeline

Objectives:

1. Turn enterprise interest into structured paid pilots.
2. Keep Personal release train unblocked.

Deliverables:

1. Enterprise capability deck and scoping template.
2. Custom module matrix and pricing envelope.
3. Pilot governance checklist and success criteria.

Exit criteria:

1. At least 3 enterprise opportunities in pipeline.
2. At least 1 paid pilot signed or in contracting.

## 4) Weekly Operating Cadence

Every week:

1. Monday: KPI review + top risks.
2. Tuesday to Thursday: execution sprints.
3. Friday: release + evidence bundle + status report.

Artifacts to produce weekly:

1. Gate summary (`summary.json` from current gate runs).
2. Changelog and known issues.
3. KPI snapshot and next-week plan.

## 5) KPI Targets

Personal growth KPIs:

1. Time to first successful recall: <= 10 minutes.
2. Activation rate (new users reaching first recall): >= 60%.
3. D7 retention: >= 30%.

Quality and reliability KPIs:

1. Recall p95 in target profile: within configured SLO.
2. Error rate gate: within configured threshold by profile.
3. No generic 500 for known upstream throttling cases.

Commercial KPIs:

1. Weekly qualified inbound leads.
2. Trial-to-paid conversion.
3. Enterprise pipeline count and stage velocity.

## 6) Execution Backlog by Track

## Track A: Personal adoption

1. Improve quickstart clarity and examples.
2. Publish short scenario demos (OpenWork/LangGraph).
3. Tighten onboarding checks and failure messaging.

## Track B: Reliability

1. Keep Gate C and preflight strict and observable.
2. Track 429/non-429 error split in gate summaries.
3. Continue partition-first operational hardening.

## Track C: Enterprise custom readiness

1. Maintain module boundaries for multi-tenant controls.
2. Standardize discovery questionnaire.
3. Ship pilot statement-of-work template.

## 7) Governance Rules

1. No enterprise custom work bypasses API contract or gate checks.
2. Every custom requirement maps to a reusable module where possible.
3. Personal roadmap takes precedence unless enterprise work is explicitly funded.

## 8) Risk Register and Mitigation

Risk: Personal roadmap gets blocked by enterprise demands.  
Mitigation: fixed capacity split and custom intake policy.

Risk: Gate stability regresses under load.  
Mitigation: keep adaptive diagnostics and strict preflight in release pipeline.

Risk: Too much feature spread, weak messaging.  
Mitigation: one headline value proposition per release cycle.

## 9) Next 14 Days Action List

1. Publish Personal GTM messaging and pricing draft.
2. Produce two repeatable demo scripts with artifacts.
3. Run Gate C with current strict profile and collect evidence.
4. Build enterprise discovery and pilot template pack.
5. Start outreach to first 10 design-partner prospects.

## 10) Ownership Template

1. Product owner: `<name>`
2. Engineering owner: `<name>`
3. GTM owner: `<name>`
4. Review cadence: weekly
5. Escalation SLA: 24h for P0, 72h for P1

