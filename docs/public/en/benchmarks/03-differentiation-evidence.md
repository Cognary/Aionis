---
title: "Differentiation Evidence"
---

# Differentiation Evidence

This page explains how to prove Aionis advantages over retrieval-only memory stacks.

## Claims Under Test

1. Higher task success with policy loop enabled
2. Better stability under repeated runs
3. Stronger controllability via traceable decisions and feedback links

## Benchmark Method

Run the Aionis benchmark suite with XMB scenarios:

```bash
npm run -s bench:aionis:v01 -- --suites xmb
```

Primary artifact outputs:

1. `details.json`
2. `summary.json`
3. `report.md`

## Key Metrics

1. `success_rate_gain`
2. `selection_switch_reduction`
3. `feedback_link_coverage`
4. `source_rule_coverage`

Interpretation:

1. Positive success-rate delta supports policy-loop effectiveness.
2. Lower switch count supports stability improvements.
3. High coverage metrics support governance and replay visibility.

## Weekly Evidence Pack

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

Use this for release-review evidence bundles.

## Related

1. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
2. [Governance Weekly Report](/public/en/benchmarks/04-governance-weekly-report)
3. [Policy and Execution Loop](/public/en/policy-execution/00-policy-execution-loop)
