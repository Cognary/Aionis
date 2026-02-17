# GTM Phase 1 Execution Board (Day 1-30)

Source plan: `/Users/lucio/Desktop/Aionis/docs/GO_TO_MARKET_EXECUTION_PLAN.md`  
Scope: Phase 1 only (out-of-box + killer demo + first-value telemetry + Gate A)

## 1) Phase Goal

Within 30 days, make Aionis demonstrably easy to start, easy to show, and measurable.

Success criteria:

1. New user can complete first-value flow in < 30 minutes.
2. Killer demo shows clear recall gain and cross-session stability.
3. Gate A checklist can be run with a single command and produces machine-readable evidence.

## 2) Workstreams

## WS-A: Out-of-box Startup

1. Task: keep `make quickstart` stable and deterministic.
2. Owner: `TBD`
3. DoD:
   1. `make quickstart` completes without manual edits on clean environment.
   2. API health check and worker run are visible in output.
   3. Evidence in artifacts (health + demo output).

## WS-B: Killer Demo Story

1. Task: maintain deterministic value narrative (`before -> write/rules -> after`).
2. Owner: `TBD`
3. DoD:
   1. Demo outputs `memory_recall_improved=true`.
   2. Demo outputs `cross_session_recall_stable=true`.
   3. Tool-selection policy effect is visible (`before/after`).

## WS-C: Value Snapshot

1. Task: keep `examples/value_dashboard.sh` usable for operator snapshots.
2. Owner: `TBD`
3. DoD:
   1. Script returns valid JSON with storage/rules/recall probe.
   2. Runs against current default scope without manual SQL.

## WS-D: Gate A Automation

1. Task: provide one-command Gate A execution with evidence bundle.
2. Owner: `TBD`
3. DoD:
   1. `npm run gtm:phase1:gatea` writes `/artifacts/gtm/gate_a/<run_id>/summary.json`.
   2. Summary contains pass/fail + per-check details.
   3. Exit artifacts include demo log and parseable value delta.

## WS-E: Metrics and Weekly Cadence

1. Task: run weekly status review with consistent template.
2. Owner: `TBD`
3. DoD:
   1. Weekly report uses `/Users/lucio/Desktop/Aionis/docs/GTM_WEEKLY_STATUS_TEMPLATE.md`.
   2. Includes KPI deltas, risks, decisions, and next actions.

## 3) Week-by-Week Breakdown

## Week 1

1. Freeze Phase 1 command set.
2. Validate quickstart + killer demo on current branch.
3. Start collecting first-value evidence.

## Week 2

1. Stabilize Gate A script and artifacts layout.
2. Add clear pass/fail thresholds to report fields.
3. Capture one full rehearsal run.

## Week 3

1. Run at least 3 rehearsal cycles.
2. Track failures by category (env/data/limit/auth).
3. Apply fixes to scripts/docs for top failure modes.

## Week 4

1. Run formal Gate A.
2. Produce operator-readable summary.
3. Lock Phase 1 retrospective and handoff to Phase 2.

## 4) Command Set (Phase 1)

1. Startup and demo:
```bash
cd /Users/lucio/Desktop/Aionis
make quickstart
```

2. Value snapshot:
```bash
cd /Users/lucio/Desktop/Aionis
make value-dashboard
```

3. Gate A one-command check:
```bash
cd /Users/lucio/Desktop/Aionis
npm run gtm:phase1:gatea
```
   1. 默认会在 API 不可达时尝试自动拉起服务（`START_SERVICES_IF_NEEDED=true`）。
   2. 在 `MEMORY_AUTH_MODE=api_key|api_key_or_jwt` 下会自动读取 `API_KEY` 或 `MEMORY_API_KEYS_JSON` 首个 key。
   3. 在 `MEMORY_AUTH_MODE=jwt` 下需提前设置 `AUTH_BEARER`。

4. Gate A rehearsal aggregate (Week 3 recommended):
```bash
cd /Users/lucio/Desktop/Aionis
ITERATIONS=3 npm run gtm:phase1:rehearsal
```

5. Weekly report draft from latest artifacts:
```bash
cd /Users/lucio/Desktop/Aionis
LOOKBACK_DAYS=7 OWNER=lucio npm run gtm:phase1:weekly-report
```

6. Rehearsal threshold gate:
```bash
cd /Users/lucio/Desktop/Aionis
MIN_EXECUTED=3 MIN_PASS_RATE=0.8 npm run gtm:phase1:threshold-check
```

7. Combined CI-style Phase 1 gate:
```bash
cd /Users/lucio/Desktop/Aionis
ITERATIONS=3 MIN_PASS_RATE=0.8 MIN_EXECUTED=3 npm run gtm:phase1:ci-gate
```

8. KPI export for trend tracking:
```bash
cd /Users/lucio/Desktop/Aionis
LOOKBACK_DAYS=30 npm run gtm:phase1:kpi-export
```

9. Review package for Gate A sign-off:
```bash
cd /Users/lucio/Desktop/Aionis
LOOKBACK_DAYS=30 OWNER=lucio npm run gtm:phase1:review-pack
```
   1. Review summary includes `status.go_no_go` + `status.go_no_go_reasons`.

10. Auto-generate prioritized fix tasks from review reasons:
```bash
cd /Users/lucio/Desktop/Aionis
OWNER=lucio npm run gtm:phase1:fix-plan
```
   1. Output includes `FIX_TASKS.md` + `tasks.json` for execution tracking.

11. Export fix tasks as Jira/Linear CSV:
```bash
cd /Users/lucio/Desktop/Aionis
OWNER=lucio npm run gtm:phase1:fix-export
```
   1. Output includes `jira_import.csv` + `linear_import.csv`.
   2. Split files for staged import: `jira_import_p0.csv` / `jira_import_p1p2.csv`, `linear_import_p0.csv` / `linear_import_p1p2.csv`.
   3. Optional mapping:
```bash
JIRA_PROJECT_KEY=AION JIRA_COMPONENTS=Memory,GTM JIRA_EPIC_LINK=AION-123 \
LINEAR_TEAM=Core LINEAR_PROJECT="GTM Phase 1" LINEAR_CYCLE="2026-W08" \
npm run gtm:phase1:fix-export
```

12. GitHub workflow (manual/scheduled):
   1. `/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase1-gate.yml`
   2. use workflow_dispatch inputs to tune iterations/threshold/artifact retention.

13. Regression integration (optional):
```bash
cd /Users/lucio/Desktop/Aionis
GTM_PHASE1_GATE=true GTM_PHASE1_GATE_ENFORCE=true npm run regression:oneclick
```

14. Preflight integration (optional):
```bash
cd /Users/lucio/Desktop/Aionis
PREFLIGHT_GTM_PHASE1_GATE=true PREFLIGHT_GTM_PHASE1_GATE_ENFORCE=true npm run preflight:prod
```

## 5) Risks and Mitigations

1. Risk: perf/rate-limit noise pollutes demo interpretation.
   1. Mitigation: Gate A focuses on value delta checks, not perf SLO.
2. Risk: local env drift (`.env` inconsistency).
   1. Mitigation: enforce `.env.example` sync and run `docs:check`.
3. Risk: service lifecycle ambiguity (api/worker not running).
   1. Mitigation: Gate A summary includes explicit API health and script exit codes.

## 6) Evidence Layout

Gate A evidence path:

1. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/<run_id>/summary.json`
2. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/<run_id>/01_killer_demo.log`
3. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/<run_id>/02_value_dashboard.json`
4. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/<run_id>/03_docs_check.log`

## 7) Approval Log

1. Created: `2026-02-17`
2. Status: `completed`
3. Final evidence:
   1. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/20260217_132642/summary.json`
   2. `/Users/lucio/Desktop/Aionis/artifacts/gtm/ci_gate/20260217_133644/summary.json`
