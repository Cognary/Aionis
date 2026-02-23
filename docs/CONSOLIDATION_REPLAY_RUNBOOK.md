---
title: "Consolidation Replay Runbook"
---

# Consolidation Replay Runbook

This runbook covers production incident handling for consolidation + abstraction evolution jobs.

## Scope

Applies to:

- `job:consolidation-candidates`
- `job:consolidation-apply`
- `job:consolidation-redirect-edges`
- `job:consolidation-health-slo`
- `job:consolidation-replay-determinism`
- abstraction jobs (`job:topic-cluster`, `job:compression-rollup`)

## Fast Health Check

```bash
npm run -s job:consolidation-health-slo -- --scope default --strict
npm run -s job:consolidation-replay-determinism -- --scope default --runs 3 --strict
```

If either command exits non-zero, treat as P1 until triage is complete.

## Rollback Checklist (Operational)

Use this when a consolidation rollout introduces unexpected aliasing or redirect drift.

1. Freeze additional mutations (stop scheduled consolidation apply/redirect jobs).

```bash
# only inspect, do not mutate
npm run -s job:consolidation-candidates -- --scope default --max-pairs 200
```

2. Capture evidence bundle before any repair.

```bash
npm run -s job:consolidation-health-slo -- --scope default --out artifacts/consolidation_incident/health_before.json
npm run -s job:consolidation-replay-determinism -- --scope default --runs 3 --out artifacts/consolidation_incident/replay_before.json
```

3. Restore from last known-good snapshot in staging first (pack export/import workflow), validate, then decide prod action.

4. If rollback is not required, repair redirect completeness first.

```bash
npm run -s job:consolidation-redirect-edges -- --scope default --apply
npm run -s job:consistency-check:scope -- --scope default --strict-warnings
```

5. Re-run health + determinism checks and archive artifacts.

```bash
npm run -s job:consolidation-health-slo -- --scope default --strict --out artifacts/consolidation_incident/health_after.json
npm run -s job:consolidation-replay-determinism -- --scope default --runs 3 --strict --out artifacts/consolidation_incident/replay_after.json
```

## Re-run Checklist (Safe Resume)

After incident resolution:

1. Dry-run candidate scan and review conflict-heavy pairs.

```bash
npm run -s job:consolidation-candidates -- --scope default --max-pairs 200
```

2. Apply bounded consolidation batch.

```bash
npm run -s job:consolidation-apply -- --scope default --apply --limit-apply 20
```

3. Run edge redirection.

```bash
npm run -s job:consolidation-redirect-edges -- --scope default --apply
```

4. Re-run strict consistency and quality gates.

```bash
npm run -s job:health-gate -- --scope default --strict-warnings --consistency-check-set scope
npm run -s job:consistency-check:cross-tenant -- --strict-warnings
```

5. Re-run production core gate (with consolidation + replay artifacts enabled).

```bash
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope default \
  --run-consolidation-health-slo true \
  --run-replay-determinism-report true
```

## Verification Stamp

- Last reviewed: `2026-02-24`
