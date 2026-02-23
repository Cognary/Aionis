---
title: "Partition Shadow Migration (Phase B Scaffold)"
---

# Partition Shadow Migration (Phase B Scaffold)

## Purpose

This document describes the non-disruptive partition scaffold introduced by migration `0016_partition_shadow_scaffold.sql`,
plus cutover-prep parity introduced by `0017_partition_cutover_prepare.sql`.

It does **not** switch online read/write traffic yet.  
It creates partition-ready shadow tables (`*_v2`) so we can rehearse:

1. scope partition creation
2. batched backfill
3. partition-based reset/truncate behavior

## What Is Created

Migration `0016_partition_shadow_scaffold.sql` adds:

1. `memory_commits_v2` (LIST partition by `scope`)
2. `memory_nodes_v2` (LIST partition by `scope`)
3. `memory_edges_v2` (LIST partition by `scope`)
4. `memory_outbox_v2` (LIST partition by `scope`)
5. default partitions for all four tables
6. helper SQL functions:
   - `aionis_partition_scope_exists(parent_table, scope_key)`
   - `aionis_partition_ensure_scope(scope_key)`
   - `aionis_partition_list_scope(scope_key)`

Migration `0017_partition_cutover_prepare.sql` adds:

1. index parity for `memory_nodes_v2` (scope/embedding/lane + HNSW variants)
2. index parity for `memory_outbox_v2` (published/claimed/job_key)
3. helper SQL function:
   - `aionis_partition_cutover_gap(scope_key)` (legacy-vs-v2 row delta by table)

## Apply Migration

```bash
make db-migrate
```

## Create/Ensure Scope Partitions

```bash
npm run job:partition-maintenance -- --scope perf_d_100000 --tenant-id default --ensure-scope-partition
```

Expected output includes `ensure_result.created` and `partitions`.

## Backfill One Scope to v2 (Dry Run)

```bash
npm run job:partition-backfill -- \
  --scope perf_d_100000 \
  --tenant-id default \
  --table all \
  --batch-size 5000 \
  --max-batches 20 \
  --dry-run
```

## Backfill One Scope to v2 (Apply)

```bash
npm run job:partition-backfill -- \
  --scope perf_d_100000 \
  --tenant-id default \
  --table all \
  --batch-size 5000 \
  --max-batches 0 \
  --ensure-scope-partition
```

`--max-batches 0` means no artificial cap.

## Verify Counts

```bash
npm run job:partition-verify -- --scope perf_d_100000 --tenant-id default --sample-limit 20
npm run job:partition-verify -- --scope perf_d_100000 --tenant-id default --strict
npm run job:partition-cutover-gap -- --scope perf_d_100000 --tenant-id default
npm run job:partition-read-shadow-check -- --scope perf_d_100000 --tenant-id default --limit 20 --min-overlap 0.95
```

`--strict` exits non-zero if any table pair has mismatch.

## Scope Purge (Operational)

Dry run (default):

```bash
npm run job:scope-purge -- --scope perf_d_100000 --tenant-id default --mode auto
```

Enforce no-delete strategy (recommended gate behavior):

```bash
npm run job:scope-purge -- --scope perf_d_100000 --tenant-id default --mode partition --allow-fallback-delete --fail-on-delete
```

Apply purge:

```bash
npm run job:scope-purge -- --scope perf_d_100000 --tenant-id default --mode auto --apply
```

Bash wrapper:

```bash
SCOPE=perf_d_100000 TENANT_ID=default MODE=auto APPLY=false FAIL_ON_DELETE=false bash scripts/admin/scope-purge.sh
```

## Cutover Readiness Gate (Phase C)

This gate checks:

1. migration `0016` applied
2. migration `0017` applied
3. `*_v2` tables present
4. `MEMORY_SHADOW_DUAL_WRITE_ENABLED=true`
5. `partition-verify --strict` passes for the target scope
6. if `aionis_partition_cutover_gap` exists, all deltas are zero
7. optional: if `READ_SHADOW_CHECK=true`, read shadow parity check must pass

Run:

```bash
MEMORY_SHADOW_DUAL_WRITE_ENABLED=true \
SCOPE=default TENANT_ID=default FAIL_ON_FAIL=true \
npm run job:partition-cutover-readiness
```

Optional read-path parity check (legacy vs v2 top-K):

```bash
npm run job:partition-read-shadow-check -- \
  --scope default \
  --tenant-id default \
  --limit 20 \
  --min-overlap 0.95 \
  --strict
```

You can combine both in readiness:

```bash
MEMORY_SHADOW_DUAL_WRITE_ENABLED=true \
READ_SHADOW_CHECK=true READ_SHADOW_LIMIT=20 READ_SHADOW_MIN_OVERLAP=0.95 \
SCOPE=default TENANT_ID=default FAIL_ON_FAIL=true \
npm run job:partition-cutover-readiness
```

Output:

- `artifacts/partition_cutover/<run_id>/summary.json`

## Reset Behavior Note

`src/jobs/perf-seed.ts` now tries partition-level truncate first:

1. if scope-bound partitions exist for a table, truncate those partitions
2. otherwise fallback to chunked delete

This provides immediate acceleration once partitioned tables are in use.

## Current Limitation

Live API/worker still uses legacy tables (`memory_*`), not `*_v2`.
Shadow scaffold is for migration rehearsal and validation before cutover.
