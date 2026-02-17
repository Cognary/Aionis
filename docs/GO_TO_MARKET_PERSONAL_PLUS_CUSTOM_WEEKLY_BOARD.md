# Aionis Personal + Custom Weekly Execution Board

Status: active  
Source plan: `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_PLAN.md`  
Horizon: 16 weeks (120-day execution window)

## 1) How to Use This Board

1. Every Monday, copy this week section into your issue board and assign owners.
2. Every Friday, attach evidence links and mark acceptance as pass/fail.
3. Any failed acceptance item must become next-week Priority 1.

## 2) Standard Weekly Evidence Commands

1. Core regression:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick
```

2. Production preflight:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
```

3. Gate C (non-blocking snapshot):

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
START_SERVICES_IF_NEEDED=false \
GATEC_FAIL_ON_FAIL=false \
GATEC_PERF_PROFILE=recall_slo \
GATEC_SCALES=100000 \
npm run gtm:phase3:gatec
```

## 3) Week-by-Week Plan

## Week 1

Goal: freeze positioning and Personal scope.

Daily execution runbook:

1. `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_WEEK1_DAILY_PLAYBOOK.md`

Tasks:

1. Finalize value proposition statement (one sentence).
2. Freeze Personal API surface for launch.
3. Define Pro and Enterprise Custom feature boundaries.
4. Assign product/engineering/GTM owners.

Acceptance:

1. Scope doc approved by all owners.
2. No unresolved product-boundary dispute.

Evidence:

1. Final scope PR link.
2. Meeting decision note.

## Week 2

Goal: make onboarding path deterministic.

Daily execution runbook:

1. `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_WEEK2_DAILY_PLAYBOOK.md`

Tasks:

1. Tighten quickstart doc and startup scripts.
2. Verify clean-machine setup time.
3. Standardize env requirements and failure messages.
4. Record onboarding walkthrough.

Acceptance:

1. First successful `write + recall_text` in <= 10 minutes.
2. Onboarding test pass rate >= 90% across 10 runs.

Evidence:

1. Onboarding run logs.
2. Walkthrough link.

## Week 3

Goal: publish first repeatable demo bundle.

Daily execution runbook:

1. `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_WEEK3_DAILY_PLAYBOOK.md`

Tasks:

1. Prepare demo A (memory continuity).
2. Prepare demo B (rule-driven tool selection).
3. Add one-command demo scripts.
4. Create demo troubleshooting notes.

Acceptance:

1. Both demo scripts pass in clean environment.
2. Demo pass rate >= 95% in 20 runs.

Evidence:

1. Demo logs and artifact paths.

## Week 4

Goal: Phase 1 exit review.

Daily execution runbook:

1. `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_WEEK4_DAILY_PLAYBOOK.md`

Tasks:

1. Run Phase 1 review checklist.
2. Close P0 onboarding defects.
3. Publish Phase 1 summary snapshot.
4. Lock Phase 2 backlog.

Acceptance:

1. Phase 1 checklist all green.
2. No open P0/P1 onboarding blockers.

Evidence:

1. Review summary and issue links.

## Week 5

Goal: SDK hardening sprint 1.

Tasks:

1. Validate TS SDK against current API contract.
2. Align Python SDK behavior and errors.
3. Add missing contract tests.
4. Validate compatibility matrix entries.

Acceptance:

1. SDK contract tests pass.
2. No undocumented API/SDK drift.

Evidence:

1. CI logs and release notes draft.

## Week 6

Goal: SDK hardening sprint 2.

Tasks:

1. Complete high-priority SDK ergonomics fixes.
2. Add integration examples for OpenWork/LangGraph.
3. Publish SDK usage recipes.
4. Run SDK smoke in clean env.

Acceptance:

1. End-to-end SDK smoke pass.
2. Example scripts run without manual patching.

Evidence:

1. Example execution logs.

## Week 7

Goal: early activation and demand capture.

Tasks:

1. Launch Personal beta invite flow.
2. Instrument activation funnel.
3. Open weekly office-hours/demo session.
4. Start collecting structured user feedback.

Acceptance:

1. Activation telemetry visible in weekly report.
2. At least 10 active beta users.

Evidence:

1. Weekly KPI snapshot.

## Week 8

Goal: Phase 2 exit review.

Tasks:

1. Validate SDK and ecosystem readiness.
2. Review retention and support burden.
3. Finalize pricing hypothesis for Pro.
4. Lock Phase 3 reliability backlog.

Acceptance:

1. Phase 2 checklist pass.
2. No unresolved P0 SDK issues.

Evidence:

1. Gate B/GTM summary links.

## Week 9

Goal: reliability stabilization sprint 1.

Tasks:

1. Run Gate C baseline and collect failure reasons.
2. Triage 429 vs non-429 error profile.
3. Tune benchmark pacing/concurrency defaults.
4. Close top 3 reliability blockers.

Acceptance:

1. Gate C fail reasons are explainable and actionable.
2. Reliability blocker list shrinks week-over-week.

Evidence:

1. Gate C summary and issue links.

## Week 10

Goal: reliability stabilization sprint 2.

Tasks:

1. Enforce strict preflight usage before release.
2. Validate partition-first reset policy in perf path.
3. Verify adaptive rate-limit diagnostics in artifacts.
4. Patch operational docs for current defaults.

Acceptance:

1. No hidden delete-strategy paths in reset flow.
2. Preflight and regression both green.

Evidence:

1. Preflight summary and perf artifacts.

## Week 11

Goal: scale proof sprint 1.

Tasks:

1. Run required Gate C profile on target scale.
2. Capture `PERFORMANCE_REPORT_V1.md`.
3. Verify SLO pass/fail clarity in summary.
4. Document observed bottlenecks.

Acceptance:

1. Required-scale evidence exists.
2. Performance report is reproducible from commands.

Evidence:

1. Gate C summary + perf report paths.

## Week 12

Goal: scale proof sprint 2.

Tasks:

1. Repeat scale run for consistency.
2. Run failure-injection scenarios.
3. Validate recovery runbooks.
4. Close residual high-severity reliability gaps.

Acceptance:

1. Two consecutive reproducible scale runs.
2. Recovery drill evidence captured.

Evidence:

1. Drill logs and runbook checklist.

## Week 13

Goal: Phase 3 exit review.

Tasks:

1. Execute blocking Gate C profile.
2. Review 14-day reliability trend.
3. Sign off SLO readiness.
4. Freeze enterprise pilot entry criteria.

Acceptance:

1. Gate C blocking profile pass with required evidence.
2. No unresolved release-blocking reliability defect.

Evidence:

1. Final Phase 3 review packet.

## Week 14

Goal: enterprise custom packaging sprint 1.

Tasks:

1. Build enterprise capability deck.
2. Build discovery questionnaire template.
3. Define custom module pricing envelope.
4. Define pilot success metrics template.

Acceptance:

1. Sales/solutioning pack complete.
2. Internal rehearsal completed.

Evidence:

1. Deck and templates links.

## Week 15

Goal: enterprise custom packaging sprint 2.

Tasks:

1. Start design-partner outreach campaign.
2. Run first discovery calls.
3. Qualify opportunities by fit criteria.
4. Draft pilot statements of work.

Acceptance:

1. At least 3 qualified opportunities in pipeline.
2. At least 1 pilot draft ready.

Evidence:

1. Pipeline tracker snapshot.

## Week 16

Goal: 120-day close and next-cycle lock.

Tasks:

1. Run full closeout review against phase exits.
2. Publish final KPI report and lessons learned.
3. Confirm next 90-day roadmap.
4. Convert approved items into execution backlog.

Acceptance:

1. 120-day review signed off by owners.
2. Next-cycle roadmap published.

Evidence:

1. Final closeout report and backlog links.

## 4) Weekly KPI Scorecard Template

Use these fields in every weekly report:

1. Activation: TTFV P50, first-run success rate, D7 retention.
2. Reliability: recall p95, write p95, max_case_error_rate, 429 split.
3. Delivery: gate pass/fail, regression pass rate, docs drift count.
4. Commercial: new leads, active opportunities, pilot conversion.

## 5) Weekly Stop/Go Rule

Stop condition:

1. Any P0 reliability blocker unresolved for > 72 hours.
2. Gate checks missing evidence in release week.

Go condition:

1. Weekly acceptance all pass.
2. Evidence links complete and reproducible.
