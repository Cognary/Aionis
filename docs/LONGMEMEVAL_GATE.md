# LongMemEval Gate

This runbook defines the production LongMemEval benchmark gate used for regression detection.

## Scope

- Primary production recall profile: `strict_edges`
- Low-latency profile: `quality_first`
- Gate slices (by default): `offset=0` and `offset=180`

## Profiles (Frozen)

Source of truth:
- `/Users/lucio/Desktop/Aionis/scripts/bench/longmemeval_profiles_production.json`

`strict_edges`:
- `limit=24`
- `neighborhood_hops=2`
- `max_nodes=60`
- `max_edges=80`
- `ranked_limit=140`
- `min_edge_weight=0.2`
- `min_edge_confidence=0.2`

`quality_first`:
- `limit=30`
- `neighborhood_hops=2`
- `max_nodes=80`
- `max_edges=100`
- `ranked_limit=180`
- `min_edge_weight=0.05`
- `min_edge_confidence=0.05`

## Local Gate Command

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s env:throughput:benchmark
npm run -s bench:longmemeval:gate
```

Default gate knobs:
- `LONGMEMEVAL_GATE_LIMIT=8`
- `LONGMEMEVAL_GATE_OFFSETS=0,180`
- `LONGMEMEVAL_GATE_RECALL_RETRY_ON_EMPTY=2`
- `LONGMEMEVAL_GATE_RECALL_RETRY_SLEEP_MS=250`
- `LONGMEMEVAL_GATE_MIN_SEED_NONZERO_RATIO=0.9`
- `LONGMEMEVAL_GATE_MIN_F1_STRICT_OFFSET0=0.05`
- `LONGMEMEVAL_GATE_MIN_F1_QUALITY_OFFSET0=0.04`
- `LONGMEMEVAL_GATE_MAX_RECALL_P95_QUALITY_OFFSET0_MS=250`
- `LONGMEMEVAL_GATE_MIN_F1_STRICT_OFFSET180=0.015`
- `LONGMEMEVAL_GATE_MIN_F1_QUALITY_OFFSET180=0.015`

Artifacts:
- `artifacts/longmemeval/ci_gate/<run_id>/gate_summary.json`
- `artifacts/longmemeval/ci_gate/<run_id>/gate_summary.md`

## CI Workflow

- Workflow file: `/Users/lucio/Desktop/Aionis/.github/workflows/longmemeval-gate.yml`
- CI env setup uses `npm run -s env:throughput:benchmark` before stack startup.
- Required GitHub Actions secrets:
  - `MINIMAX_API_KEY`
  - `MINIMAX_GROUP_ID`

## Notes

- Gate uses `recall-retry-on-empty` to avoid false negatives from embedding readiness lag.
- The gate is for regression control; it does not replace full offline evaluation.
