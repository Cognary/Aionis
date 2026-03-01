# AionisBench v0.1

AionisBench v0.1 is the minimum reproducible benchmark suite aligned to Aionis core claims:

1. Graph memory retrieval quality.
2. Commit/replay/derived pipeline stability.
3. Rule-driven execution impact.
4. Operability/safety under strict contracts.

## v0.1 Core Cases

1. `EAB-001` Embedding deferred write succeeds; backfill improves recall.
2. `OB-002` Debug embedding safety gate (limit/auth/preview bounds).
3. `GMB-003` Topic DRAFT formation and derived edge traceability.
4. `GMB-004` Budgeted graph expansion beats strict vector-only budget.
5. `XMB-005` ACTIVE rule changes tool selection with explainability.
6. `XMB-006` A/B: policy loop vs retrieval-only heuristic (success/stability/controllability deltas).
7. `EAB-006` Replay determinism summary hash stable across 3 runs.

## Run

```bash
npm run -s bench:aionis:v01
```

Optional:

```bash
python3 aionis-bench/run_v01.py \
  --base-url "http://127.0.0.1:${PORT:-3001}" \
  --scope-prefix "aionisbench" \
  --suites "gmb,eab,xmb,ob" \
  --allow-fail
```

## Artifacts

Default output:

- `artifacts/aionisbench/runs/<run_id>/details.json`
- `artifacts/aionisbench/runs/<run_id>/summary.json`
- `artifacts/aionisbench/runs/<run_id>/report.md`
- `artifacts/aionisbench/runs/<run_id>/raw/*.json`
