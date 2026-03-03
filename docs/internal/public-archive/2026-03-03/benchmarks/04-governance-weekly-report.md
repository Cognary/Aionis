---
title: "Governance Weekly Report"
---

# Governance Weekly Report

Generate a weekly governance snapshot with:

1. Scope-level controls (feedback/decision/recall/lane coverage)
2. Cross-tenant drift (active-rule count spread and negative-ratio spread)
3. JSON + Markdown artifacts for release and operations review

## Command

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168
```

Optional strict modes:

```bash
npm run -s job:governance-weekly-report -- --scope default --strict
npm run -s job:governance-weekly-report -- --scope default --strict-warnings
```

## Output

Default output directory:

`artifacts/governance/weekly/<report_week>_<run_id>/`

Generated files:

1. `summary.json`: machine-readable snapshot + checks + recommendations
2. `WEEKLY_STATUS.md`: human-readable weekly status report

## Core Metrics

1. `scope.feedback.run_id_coverage`
2. `scope.decision.link_coverage`
3. `scope.recall.identity_coverage`
4. `scope.lane.private_owner_coverage`
5. `cross_tenant.active_rule_count_drift`
6. `cross_tenant.negative_ratio_drift`

## Default Thresholds

1. `min_decision_link_coverage = 0.95`
2. `min_recall_identity_coverage = 0.80`
3. `min_private_owner_coverage = 1.00`
4. `max_tenant_active_rule_count_drift = 20`
5. `max_tenant_negative_ratio_drift = 0.30`
6. `tenant_drift_min_feedback = 5`

Cross-tenant drift checks are enforced only when at least two tenants meet `tenant_drift_min_feedback`.

Override with flags when needed:

```bash
npm run -s job:governance-weekly-report -- \
  --scope default \
  --window-hours 168 \
  --min-decision-link-coverage 0.98 \
  --min-recall-identity-coverage 0.90 \
  --max-tenant-active-rule-count-drift 15
```

## Schema Requirements

The report degrades gracefully when optional tables/columns are missing, and emits warning/error checks indicating required migrations.

Recommended baseline:

1. `0013_multi_agent_fabric.sql`
2. `0021_execution_decision_provenance.sql`

## CI Integration

Weekly non-blocking snapshot:

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168
```

Release hard gate:

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168 --strict-warnings
```

GitHub Actions wiring:

1. Weekly scheduled export:
   `.github/workflows/governance-weekly-report.yml`
2. Production release gate integration:
   `.github/workflows/core-production-gate.yml` (via `evidence:weekly --strict`, includes governance stage artifact)

## Verification Stamp

1. Last reviewed: `2026-02-19`
2. Reviewer: `codex`
