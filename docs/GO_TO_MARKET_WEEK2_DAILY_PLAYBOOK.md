# Go-To-Market Week 2 Daily Playbook

Status: active  
Week scope: Week 2 (onboarding determinism)  
Parent board: `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_WEEKLY_BOARD.md`

## 1) Week 2 Mission

By Friday, lock these outcomes:

1. Onboarding path is deterministic and reproducible.
2. First successful `write + recall_text` is consistently <= 10 minutes.
3. Common setup failures are documented with direct fixes.
4. Week 3 demo build starts from a stable onboarding baseline.

## 2) Day-by-Day Execution

## Monday (Day 1): Onboarding baseline run

Goal:

1. Capture current onboarding success/failure baseline.

Actions:

1. Run clean onboarding pass once end-to-end.
2. Record exact time-to-first-value (TTFV).
3. Capture failure points and rough categories.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run build
npm run docs:check
SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick
```

Acceptance:

1. Baseline run artifacts are stored and linked.
2. TTFV baseline number is recorded.

## Tuesday (Day 2): Quickstart path hardening

Goal:

1. Remove setup ambiguity in quickstart flow.

Actions:

1. Tighten quickstart instructions and prerequisites.
2. Ensure env setup instructions are explicit.
3. Clarify service start/health verification steps.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

Acceptance:

1. Quickstart has no ambiguous required step.
2. Docs check passes after updates.

## Wednesday (Day 3): Failure-mode playbook

Goal:

1. Turn recurring onboarding failures into documented fixes.

Actions:

1. Collect top setup failures from logs and previous runs.
2. Add troubleshooting entries with copy-paste commands.
3. Validate each troubleshooting step once.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
```

Acceptance:

1. Top 5 failure modes each have a documented fix path.
2. Preflight runs clean on current environment.

## Thursday (Day 4): Determinism verification loop

Goal:

1. Verify onboarding repeatability across multiple runs.

Actions:

1. Run onboarding flow 10 times (same instructions).
2. Capture pass/fail and TTFV per run.
3. Summarize failure distribution.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
for i in {1..10}; do
  SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick >/tmp/aionis_week2_run_${i}.log 2>&1 || true
done
```

Acceptance:

1. Onboarding pass rate >= 90%.
2. TTFV target trend is clearly improving.

## Friday (Day 5): Week 2 closeout and Week 3 handoff

Goal:

1. Close Week 2 and hand off stable base for demo week.

Actions:

1. Run preflight and Gate C snapshot for evidence.
2. Publish Week 2 closeout report (pass/fail by mission item).
3. Freeze Week 3 priorities (demo A/B build tasks).

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
START_SERVICES_IF_NEEDED=false GATEC_FAIL_ON_FAIL=false GATEC_PERF_PROFILE=recall_slo GATEC_SCALES=100000 npm run gtm:phase3:gatec
```

Acceptance:

1. Week 2 mission outcomes all marked pass/fail.
2. Week 3 backlog is owner-assigned and prioritized.

## 3) Week 2 Evidence Checklist

Required links:

1. Baseline regression summary (`artifacts/regression/.../summary.json`).
2. Latest preflight summary (`artifacts/preflight/.../summary.json`).
3. Latest Gate C summary (`artifacts/gtm/gate_c/.../summary.json`).
4. Quickstart/troubleshooting docs PR link.
5. Week 2 closeout note.

## 4) Week 2 Stop/Go Rule

Stop (do not move to Week 3) if any is true:

1. Onboarding pass rate is below 90%.
2. TTFV cannot reach <= 10 minutes in normal conditions.
3. Top failure fixes are missing in docs.
4. Week 2 evidence checklist is incomplete.

Go to Week 3 only when:

1. Onboarding determinism target is met.
2. Evidence checklist is complete.
3. Demo-week owners and scope are locked.

