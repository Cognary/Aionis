# Go-To-Market Week 4 Daily Playbook

Status: active  
Week scope: Week 4 (Phase 1 closeout and handoff)  
Parent board: `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_WEEKLY_BOARD.md`

## 1) Week 4 Mission

By Friday, lock these outcomes:

1. Phase 1 review package is complete and reproducible.
2. Open P0/P1 onboarding blockers are closed or explicitly accepted with owners and due dates.
3. Gate A and baseline operational checks are green.
4. Phase 2 backlog and ownership are frozen.

## 2) Day-by-Day Execution

## Monday (Day 1): Phase 1 review preparation

Goal:

1. Collect all Phase 1 evidence and identify missing items.

Actions:

1. Gather latest gate/regression/preflight artifacts.
2. Validate all docs links in review package.
3. Build Phase 1 checklist draft.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

Acceptance:

1. Evidence inventory complete.
2. No broken documentation links.

## Tuesday (Day 2): Blocker closure sprint

Goal:

1. Close or triage remaining onboarding blockers.

Actions:

1. Resolve top P0/P1 onboarding defects.
2. For unresolved items, assign explicit owner + due date + mitigation.
3. Update closeout checklist status.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick
```

Acceptance:

1. No unowned P0/P1 blockers.
2. Regression evidence updated after fixes.

## Wednesday (Day 3): Operational readiness pass

Goal:

1. Reconfirm Phase 1 operational baseline is stable.

Actions:

1. Run production preflight in current environment.
2. Verify key smoke paths (`write`, `recall_text`) remain healthy.
3. Record any drift and corrective action.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
```

Acceptance:

1. Preflight summary is green.
2. No new operational blockers introduced.

## Thursday (Day 4): Gate and handoff package

Goal:

1. Lock final Phase 1 gate evidence and handoff package.

Actions:

1. Run Gate A and optional Gate C snapshot.
2. Assemble phase closeout report with pass/fail per objective.
3. Draft Phase 2 kickoff scope and owners.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run gtm:phase1:gatea
START_SERVICES_IF_NEEDED=false GATEC_FAIL_ON_FAIL=false GATEC_RUN_HEALTH=true GATEC_RUN_PERF=false npm run gtm:phase3:gatec
```

Acceptance:

1. Gate A evidence exists and is parseable.
2. Phase 2 kickoff draft is ready.

## Friday (Day 5): Phase 1 signoff

Goal:

1. Execute Phase 1 signoff and Week 5 start readiness.

Actions:

1. Run final review meeting.
2. Approve/deny each Phase 1 exit criterion explicitly.
3. Freeze Week 5 priorities and assign owners.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

Acceptance:

1. Phase 1 signoff document published.
2. Week 5 backlog is owner-assigned and prioritized.

## 3) Week 4 Evidence Checklist

Required links:

1. Latest Gate A summary (`artifacts/gtm/gate_a/.../summary.json`).
2. Latest regression summary (`artifacts/regression/.../summary.json`).
3. Latest preflight summary (`artifacts/preflight/.../summary.json`).
4. Optional Gate C summary (`artifacts/gtm/gate_c/.../summary.json`).
5. Phase 1 closeout note.
6. Week 5 kickoff/backlog note.

## 4) Week 4 Stop/Go Rule

Stop (do not move to Week 5) if any is true:

1. Phase 1 exit criteria not explicitly reviewed.
2. Unowned P0/P1 blockers remain.
3. Evidence checklist incomplete.
4. Week 5 ownership is unclear.

Go to Week 5 only when:

1. Phase 1 signoff is complete.
2. Evidence checklist is complete.
3. Week 5 backlog and owners are locked.

