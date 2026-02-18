---
title: "Go-To-Market Week 1 Daily Playbook"
---

# Go-To-Market Week 1 Daily Playbook

Status: active  
Week scope: Week 1 (Personal positioning + scope freeze)  
Parent board: `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_PERSONAL_PLUS_CUSTOM_WEEKLY_BOARD.md`

## 1) Week 1 Mission

By Friday, lock these four outcomes:

1. One-sentence positioning finalized.
2. Personal launch scope frozen.
3. Pro / Enterprise Custom boundary frozen.
4. Named owners assigned (Product / Engineering / GTM).

## 2) Day-by-Day Execution

## Monday (Day 1): Baseline and alignment

Goal:

1. Establish current technical and documentation baseline.

Actions:

1. Pull latest code and env.
2. Run baseline checks.
3. Snapshot current GTM gate status.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
npm run build
npm run docs:check
SKIP_MIGRATE=true SKIP_PERF=true npm run regression:oneclick
```

Deliverables:

1. Baseline run links in weekly note.
2. Known blockers list (if any).

Acceptance:

1. Build and docs check both pass.
2. Regression summary artifact exists and is readable.

## Tuesday (Day 2): Positioning lock

Goal:

1. Finalize Aionis positioning statement for Personal launch.

Actions:

1. Draft 3 candidate one-line propositions.
2. Pick one final statement.
3. Place final statement in GTM plan and public-facing intro docs.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

Deliverables:

1. Final one-sentence proposition.
2. Updated docs with that proposition.

Acceptance:

1. One single approved statement (no multiple versions).
2. Statement appears consistently in planning docs.

## Wednesday (Day 3): Personal scope freeze

Goal:

1. Freeze Personal launch API and operating scope.

Actions:

1. Confirm Personal includes only core APIs.
2. Explicitly mark non-Personal capabilities as Pro/Custom.
3. Update scope table in GTM docs.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run test:contract
npm run docs:check
```

Deliverables:

1. Personal scope table with in/out boundaries.
2. Contract smoke pass log.

Acceptance:

1. No unresolved disagreement on Personal feature boundary.
2. Contract smoke passes after documentation changes.

## Thursday (Day 4): Packaging and ownership

Goal:

1. Finalize three-tier package boundary and owner map.

Actions:

1. Confirm `Personal / Pro / Enterprise Custom` package matrix.
2. Assign owners and escalation path.
3. Add weekly cadence owner responsibilities.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
npm run docs:check
```

Deliverables:

1. Packaging matrix (tier -> capability -> owner).
2. Owner assignment block in plan.

Acceptance:

1. Each tier has explicit boundaries.
2. Product/Engineering/GTM owners are all assigned.

## Friday (Day 5): Week 1 gate and closeout

Goal:

1. Produce Week 1 closeout evidence and decide go/no-go for Week 2.

Actions:

1. Run preflight and Gate C snapshot.
2. Fill weekly status report using template.
3. Publish Week 2 priorities.

Commands:

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
SKIP_MIGRATE=true npm run preflight:prod
START_SERVICES_IF_NEEDED=false GATEC_FAIL_ON_FAIL=false GATEC_PERF_PROFILE=recall_slo GATEC_SCALES=100000 npm run gtm:phase3:gatec
```

Deliverables:

1. Week 1 closeout report.
2. Week 2 priority list.

Acceptance:

1. Week 1 mission items all marked pass/fail.
2. Evidence links attached for all accepted items.

## 3) Week 1 Evidence Checklist

Required links before closing the week:

1. Latest regression summary (`artifacts/regression/.../summary.json`).
2. Latest preflight summary (`artifacts/preflight/.../summary.json`).
3. Latest Gate C summary (`artifacts/gtm/gate_c/.../summary.json`).
4. Updated GTM docs PR link.
5. Week 1 decision log.

## 4) Week 1 Stop/Go Rule

Stop (do not move to Week 2) if any is true:

1. Positioning statement not finalized.
2. Personal scope still ambiguous.
3. Owners not assigned.
4. No reproducible evidence artifacts.

Go to Week 2 only when:

1. All four mission outcomes are complete.
2. Evidence checklist is complete.
3. Week 2 backlog is prioritized and owned.

