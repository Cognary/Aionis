---
title: "AionisBench v0.1"
---

# AionisBench v0.1

AionisBench v0.1 is the benchmark harness for memory, policy, and replay behavior.

## Coverage Areas

1. Memory write/recall correctness
2. Policy-loop behavior impact
3. Replay and audit consistency
4. Safety and operability checks

## Scenario Families

1. `EAB-*`: embedding and async-derived behavior
2. `GMB-*`: graph memory behavior
3. `XMB-*`: execution/policy-loop behavior
4. `OB-*`: observability and safety controls

## Run

```bash
npm run -s bench:aionis:v01
```

Subset run example:

```bash
python3 aionis-bench/run_v01.py --suites xmb,eab --allow-fail
```

## Outputs

1. `artifacts/aionisbench/runs/<run_id>/details.json`
2. `artifacts/aionisbench/runs/<run_id>/summary.json`
3. `artifacts/aionisbench/runs/<run_id>/report.md`

## Related

1. [Differentiation Evidence](/public/en/benchmarks/03-differentiation-evidence)
2. [Benchmark Snapshot (Public)](/public/en/benchmarks/02-benchmark-snapshot-public)
