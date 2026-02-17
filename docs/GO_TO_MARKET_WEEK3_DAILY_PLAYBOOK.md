# Go-To-Market Week 3 Daily Playbook

Status: active  
Week scope: Week 3 (demo A/B build and rehearsal)  
Parent board: `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_WEEKLY_BOARD.md`

## 1) Week 3 Mission

By Friday, lock these outcomes:

1. Demo A (memory continuity) is deterministic and reusable.
2. Demo B (rule-driven tool selection) is deterministic and reusable.
3. Both demos have one-command execution and troubleshooting notes.
4. Demo pass-rate evidence is collected for Week 4 phase review.

## 2) Day-by-Day Execution

## Monday (Day 1): Demo scope freeze

Goal:

1. Freeze demo storylines and pass criteria.

Actions:

1. Define explicit before/after expected outputs for demo A and B.
2. Lock demo input datasets and scenarios.
3. Define “demo pass” criteria for both flows.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

Acceptance:

1. Both demo acceptance criteria documented.
2. Scenario/data drift eliminated.

## Tuesday (Day 2): Demo A implementation

Goal:

1. Make demo A one-command runnable.

Actions:

1. Finalize demo A script and output markers.
2. Add direct troubleshooting notes for demo A.
3. Validate one clean end-to-end run.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run build
SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick
```

Acceptance:

1. Demo A can run from one command.
2. Output includes deterministic success markers.

## Wednesday (Day 3): Demo B implementation

Goal:

1. Make demo B one-command runnable.

Actions:

1. Finalize rule/tool-selection demo flow.
2. Ensure policy before/after difference is visible.
3. Add demo B troubleshooting notes.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
```

Acceptance:

1. Demo B one-command flow works.
2. Policy impact is explicit in output.

## Thursday (Day 4): Rehearsal loop

Goal:

1. Collect demo stability evidence.

Actions:

1. Run both demos in repeated rehearsal loops.
2. Capture pass/fail and failure reasons.
3. Patch top failure modes (env/data/order issues).

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
for i in {1..20}; do
  SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick >/tmp/aionis_week3_demo_run_${i}.log 2>&1 || true
done
```

Acceptance:

1. Combined demo pass rate >= 95%.
2. Failure categories are documented and minimized.

## Friday (Day 5): Week 3 closeout and Week 4 handoff

Goal:

1. Freeze demo bundle for Phase 1 review week.

Actions:

1. Run latest preflight and Gate C snapshot for evidence.
2. Publish Week 3 closeout (pass/fail + risks).
3. Prepare Week 4 phase-review checklist inputs.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
START_SERVICES_IF_NEEDED=false GATEC_FAIL_ON_FAIL=false GATEC_PERF_PROFILE=recall_slo GATEC_SCALES=100000 npm run gtm:phase3:gatec
```

Acceptance:

1. Demo bundle and evidence links are complete.
2. Week 4 review inputs are owner-assigned.

## 3) Week 3 Evidence Checklist

Required links:

1. Demo A run logs and script path.
2. Demo B run logs and script path.
3. Rehearsal pass-rate summary.
4. Latest preflight summary.
5. Latest Gate C summary.
6. Week 3 closeout note.

## 4) Week 3 Stop/Go Rule

Stop (do not move to Week 4) if any is true:

1. Demo A or B is non-deterministic.
2. Combined demo pass rate < 95%.
3. Troubleshooting notes are incomplete.
4. Evidence checklist is incomplete.

Go to Week 4 only when:

1. Both demos meet acceptance criteria.
2. Evidence checklist is complete.
3. Phase 1 review package is ready.

