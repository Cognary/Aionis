---
title: "Operator Runbook"
---

# Operator Runbook

This runbook defines a practical cadence and thresholds for operating Aionis in production.

## Daily

1. Health gate (deployment and runtime guard):

```bash
cd /Users/lucio/Desktop/Aionis
npm run job:health-gate
```

Note: health gate runs a pre-check `embedding_model` backfill by default to auto-heal historical READY rows.

2. If you want warning-tight mode:

```bash
npm run job:health-gate -- --strict-warnings --consistency-check-set scope
```

Run cross-tenant integrity as a separate gate (recommended at least daily, and always before schema/tenant releases):

```bash
npm run job:consistency-check:cross-tenant -- --strict-warnings
```

3. Lane visibility quick check (rules evaluate):

```bash
set -a; source /Users/lucio/Desktop/Aionis/.env; set +a
curl -sS localhost:${PORT:-3001}/v1/memory/rules/evaluate \
  -H 'content-type: application/json' \
  -d '{
    "context":{"intent":"json","provider":"minimax","tool":{"name":"psql"},"agent":{"id":"agent_a","team_id":"team_default"}},
    "include_shadow":true,
    "limit":50
  }' \
| jq '{lane:.agent_visibility_summary.lane, scope_stats:.agent_visibility_summary.rule_scope}'
```

4. Lane visibility quick check (tool selector):

```bash
set -a; source /Users/lucio/Desktop/Aionis/.env; set +a
curl -sS localhost:${PORT:-3001}/v1/memory/tools/select \
  -H 'content-type: application/json' \
  -d '{
    "context":{"intent":"json","provider":"minimax","tool":{"name":"psql"},"agent":{"id":"agent_a","team_id":"team_default"}},
    "candidates":["psql","curl","bash"],
    "strict":true,
    "include_shadow":true,
    "rules_limit":50
  }' \
| jq '{selected:.selection.selected, ordered:.selection.ordered, lane:.rules.agent_visibility_summary.lane, scope_stats:.rules.agent_visibility_summary.rule_scope}'
```

Expected (steady state):
- `lane.applied=true`
- `lane.legacy_unowned_private_detected=0`
- `scope_stats.filtered_by_lane` should be stable (non-zero can be normal in multi-agent isolation)

5. Recall default profile check:

```bash
set -a; source /Users/lucio/Desktop/Aionis/.env; set +a
echo "MEMORY_RECALL_PROFILE=${MEMORY_RECALL_PROFILE:-strict_edges}"
```

6. Throughput profile check/apply:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s env:throughput:prod
```

This updates only the managed throughput block in `.env` and keeps existing secrets unchanged.

## Weekly

1. Long-horizon drift snapshot:

```bash
cd /Users/lucio/Desktop/Aionis
npm run job:quality-eval -- --strict
```

2. Integrity deep check:

```bash
npm run job:consistency-check:scope -- --scope default --strict-warnings
npm run job:consistency-check:cross-tenant -- --strict-warnings
```

For large datasets where full scan runtime is too high, use fast mode (lower-bound counts) and batch by check index:

```bash
npm run job:consistency-check:scope:fast -- --scope default --strict-warnings
npm run job:consistency-check:scope -- --scope default --batch-size 10 --batch-index 0 --strict-warnings
npm run job:consistency-check:scope -- --scope default --batch-size 10 --batch-index 1 --strict-warnings
```

If `private_rule_without_owner` is non-zero:

```bash
npm run job:private-rule-owner-backfill -- --limit 5000
```

3. Lifecycle smoke (API + jobs + feedback loop):

```bash
npm run e2e:phase4-smoke
```

4. Tenant isolation smoke (Phase C):

```bash
npm run e2e:phasec-tenant
```

5. Auxiliary benchmark regression (non-blocking):

```bash
npm run -s env:throughput:benchmark
npm run -s bench:longmemeval:gate
npm run -s bench:locomo -- --sample-limit 1 --qa-limit 20
```

Do not use benchmark failures above as release blockers. Treat them as auxiliary drift signals.

## Suggested Thresholds

Use these as default SLO-style boundaries. Tune by scope once traffic stabilizes.

- `quality.summary.ready_ratio >= 0.80`
- `quality.summary.alias_rate <= 0.30`
- `quality.summary.archive_ratio <= 0.95`
- `quality.summary.fresh_30d_ratio >= 0.20`
- `consistency.summary.errors == 0` (always)
- `consistency.summary.warnings == 0` (recommended for production gate)
- `embedding_model_invalid_for_ready == 0` (no `unknown:*` model labels)
- `tenant_scope_key_malformed == 0` and all `cross_tenant_* == 0`

## Incident Playbook

1. If `quality_eval_failed`:
- Run `npm run job:quality-eval` and inspect `failed_checks`.
- Run `npm run job:salience-decay` and re-check.
- If failure is `ready_ratio` related, inspect embedding backfill and outbox worker.

2. If consistency errors appear:
- Run `npm run job:consistency-check:scope -- --scope default` and inspect the failing check names.
- If tenant integrity may be involved, run `npm run job:consistency-check:cross-tenant`.
- Verify migrations are up to date: `make db-migrate`.
- For outbox-related failures, run `npm run job:outbox-worker -- --once` and then replay failed items if needed.

3. If archive/activation behavior regresses:
- Run `npm run e2e:phase4-smoke` to reproduce end-to-end.
- Validate `last_rehydrated_*` and `feedback_*` slot markers for the test node.

4. If `recall_text` starts returning `upstream_embedding_rate_limited` / `upstream_embedding_unavailable`:
- Verify provider quotas first.
- Check whether query embedding cache is enabled:
  - `RECALL_TEXT_EMBED_CACHE_ENABLED=true`
  - `RECALL_TEXT_EMBED_CACHE_TTL_MS` / `RECALL_TEXT_EMBED_CACHE_MAX_KEYS` sized for traffic.
- Temporarily reduce upstream pressure by lowering caller concurrency or increasing repeated-query cache hit ratio.

## Release Gate Recommendation

Before production deploy:

```bash
cd /Users/lucio/Desktop/Aionis
npm run -s gate:core:prod -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope default \
  --run-perf true \
  --recall-p95-max-ms 1200 \
  --write-p95-max-ms 800 \
  --error-rate-max 0.02
```

Only deploy when the core gate passes.

## Verification Stamp

- Last reviewed: `2026-02-18`
- Verification commands:
  - `npm run docs:check`
  - `npm run job:health-gate -- --strict-warnings --consistency-check-set scope`
  - `npm run job:consistency-check:cross-tenant -- --strict-warnings`
