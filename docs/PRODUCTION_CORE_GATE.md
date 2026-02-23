---
title: "Production Core Gate"
---

# Production Core Gate

This is the blocking release gate for production go-live decisions.

## Policy

Blocking metrics:
1. Integrity: scope health gate (`strict_warnings`) + cross-tenant consistency (`strict_warnings`)
2. Operability: build/contract/docs/sdk release checks
3. Pack roundtrip: export -> verify import -> import -> re-import singleton check
4. Control-plane input safety (optional): control admin validation smoke
5. Availability and SLO: recall/write perf benchmark thresholds
6. Compression KPI (optional blocking): context compression ratio + retain metrics
7. Abstraction quality counters (non-blocking): clustering + compression signals from health gate
8. Rule conflict resolution report (optional blocking): winner/loser delta against baseline
9. Consolidation health SLO (optional blocking): candidate depth + apply/redirect completeness
10. Replay determinism report (optional blocking): combined consolidation+abstraction fingerprint stability

Auxiliary only (non-blocking):
1. LongMemEval
2. LoCoMo

## One-command execution

```bash
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --db-runner local \
  --scope default \
  --run-pack-gate true \
  --run-control-admin-validation false \
  --pack-gate-max-rows 2000 \
  --run-perf true \
  --recall-p95-max-ms 1200 \
  --write-p95-max-ms 800 \
  --error-rate-max 0.02 \
  --compression-gate-mode non_blocking \
  --compression-ratio-min 0.40 \
  --compression-items-retain-min 0.95 \
  --compression-citations-retain-min 0.95 \
  --run-rule-conflict-report true \
  --rule-conflict-gate-mode non_blocking \
  --rule-conflict-contexts-file examples/planner_context.json \
  --run-consolidation-health-slo true \
  --consolidation-health-gate-mode non_blocking \
  --run-replay-determinism-report true \
  --replay-determinism-gate-mode non_blocking
```

`--db-runner` notes:
- `local` (default): run DB-backed checks on local host using local `DATABASE_URL`.
- `auto`: currently aliases to `local` for compatibility.

The gate now compares API `/health.database_target_hash` and local `DATABASE_URL` target hash. If they differ, gate fails fast to prevent false green on the wrong database.

Artifacts:
- `artifacts/core_gate/<run_id>/summary.json`
- `artifacts/core_gate/<run_id>/06_health_gate_scope.json`
- `artifacts/core_gate/<run_id>/07_consistency_cross_tenant.json`
- `artifacts/core_gate/<run_id>/07b_pack_roundtrip_gate.json`
- `artifacts/core_gate/<run_id>/07c_control_admin_validation.log` (when enabled)
- `artifacts/core_gate/<run_id>/07e_consolidation_health_slo.json`
- `artifacts/core_gate/<run_id>/07f_replay_determinism.json`
- `artifacts/core_gate/<run_id>/08_perf_benchmark.json`

Pack gate controls:
- `--run-pack-gate true|false`
- `--pack-gate-scope <scope>`
- `--pack-gate-max-rows <n>`

Control admin validation controls:
- `--run-control-admin-validation true|false` (default `false`)
- when enabled, gate runs `npm run -s e2e:control-admin-validation`

## Compression KPI Gate

Compression KPI is collected via `job:perf-benchmark` and surfaced in `summary.json`:

- `blocking_metrics.compression_kpi.thresholds`
- `blocking_metrics.compression_kpi.observed`
- `blocking_metrics.compression_kpi.pass`

Abstraction counters are surfaced from health-gate quality metrics:

- `blocking_metrics.abstraction_quality_counters.profile`
- `blocking_metrics.abstraction_quality_counters.observed.compression_summaries`
- `blocking_metrics.abstraction_quality_counters.observed.cluster_cohesion`
- `blocking_metrics.abstraction_quality_counters.observed.cluster_orphan_rate`
- `blocking_metrics.abstraction_quality_counters.observed.cluster_merge_rate_30d`

Rule conflict report is surfaced in:

- `blocking_metrics.rule_conflict_resolution.thresholds`
- `blocking_metrics.rule_conflict_resolution.observed`
- `blocking_metrics.rule_conflict_resolution.pass`

Consolidation health SLO is surfaced in:

- `blocking_metrics.consolidation_health_slo.thresholds`
- `blocking_metrics.consolidation_health_slo.observed`
- `blocking_metrics.consolidation_health_slo.pass`

Replay determinism is surfaced in:

- `blocking_metrics.replay_determinism.thresholds`
- `blocking_metrics.replay_determinism.observed`
- `blocking_metrics.replay_determinism.pass`

Modes:

1. `non_blocking` (default): threshold breaches are added to `warn_reasons`, gate can still pass.
2. `blocking`: threshold breaches are added to `fail_reasons`, gate fails.

Control knobs:

- `--compression-gate-mode non_blocking|blocking`
- `--compression-ratio-min <0..1>`
- `--compression-items-retain-min <0..1>`
- `--compression-citations-retain-min <0..1>`
- `--perf-compression-check true|false`
- `--compression-pair-gate-mode non_blocking|blocking` (normally follows `--compression-gate-mode`)
- `--perf-compression-samples <n>`
- `--perf-compression-token-budget <n>`
- `--perf-compression-profile balanced|aggressive`
- `--run-rule-conflict-report true|false`
- `--rule-conflict-gate-mode non_blocking|blocking`
- `--rule-conflict-contexts-file <json|jsonl>`
- `--rule-conflict-baseline <summary.json>`
- `--rule-conflict-rules-limit <n>`
- `--rule-conflict-max-winner-changes <n>`
- `--run-consolidation-health-slo true|false`
- `--consolidation-health-gate-mode non_blocking|blocking`
- `--consolidation-health-max-candidate-queue-depth <n>`
- `--consolidation-health-min-apply-success-rate <0..1>`
- `--consolidation-health-min-redirect-completeness <0..1>`
- `--consolidation-health-max-pending-alias-edges <n>`
- `--run-replay-determinism-report true|false`
- `--replay-determinism-gate-mode non_blocking|blocking`
- `--replay-determinism-runs <n>`
- `--replay-determinism-max-fingerprint-variants <n>`

## CI workflow

- `.github/workflows/core-production-gate.yml`

This workflow is the main branch gate.

## Verification Stamp

- Last reviewed: `2026-02-24`
