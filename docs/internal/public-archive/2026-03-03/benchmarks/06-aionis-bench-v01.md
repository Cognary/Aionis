---
title: "AionisBench v0.1"
---

# AionisBench v0.1

AionisBench v0.1 is the production-oriented benchmark harness for Aionis.

Core proof goals:

1. Graph retrieval/linking correctness.
2. Evolution and audit stability (commit/replay/derived async).
3. Rule-to-execution impact (policy changes tool behavior).
4. Operability and safety controls.

## Case Set (v0.1)

1. `EAB-001` embedding deferred write -> backfill improves recall.
2. `OB-002` debug embedding safety gate: limit/auth/preview constraints.
3. `GMB-003` topic DRAFT formation + derived edge traceability.
4. `GMB-004` graph expansion under budget outperforms strict vector-only budget.
5. `XMB-005` ACTIVE rule overrides tool selection with explainability.
6. `XMB-006` A/B: policy loop vs retrieval-only heuristic (success/stability/controllability deltas).
7. `EAB-006` replay determinism summary hash stable across 3 runs.

## Repo Layout

```
aionis-bench/
  scenarios/
    gmb_small.jsonl
    xmb_rules.jsonl
  harness/
    common.py
    run_gmb.py
    run_eab.py
    run_xmb.py
    run_ob.py
  metrics/
    summarize.py
  docker/
    compose.bench.yml
  run_v01.py
```

## Run

```bash
npm run -s bench:aionis:v01
```

Optional suite subset:

```bash
python3 aionis-bench/run_v01.py --suites gmb,eab --allow-fail
```

## Outputs

- `artifacts/aionisbench/runs/<run_id>/details.json`
- `artifacts/aionisbench/runs/<run_id>/summary.json`
- `artifacts/aionisbench/runs/<run_id>/report.md`
- `artifacts/aionisbench/runs/<run_id>/raw/*.json`
