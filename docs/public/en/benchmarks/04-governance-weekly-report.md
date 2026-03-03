---
title: "Governance Weekly Report"
---

# Governance Weekly Report

This report summarizes weekly governance and control signals for production usage.

## Purpose

1. Track decision and feedback linkage quality
2. Track recall identity and scope hygiene
3. Track cross-tenant drift signals
4. Produce release-friendly JSON and Markdown artifacts

## Command

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168
```

Strict mode for release workflows:

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168 --strict-warnings
```

## Output

1. `summary.json`
2. `WEEKLY_STATUS.md`

Default location:

`artifacts/governance/weekly/<report_week>_<run_id>/`

## Core Metrics

1. decision link coverage
2. recall identity coverage
3. lane owner coverage
4. cross-tenant active-rule drift
5. cross-tenant negative-ratio drift

## Related

1. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
2. [Operate and Production](/public/en/operate-production/00-operate-production)
