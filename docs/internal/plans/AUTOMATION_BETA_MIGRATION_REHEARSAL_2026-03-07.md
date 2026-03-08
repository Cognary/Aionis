---
title: "Automation Beta Migration Rehearsal 2026-03-07"
---

# Automation Beta Migration Rehearsal 2026-03-07

Status: `completed` (`2026-03-07`)  
Owner: Aionis Core  
Purpose:

1. satisfy the design partner beta gate requiring migration validation on a non-empty database snapshot
2. validate `0035_automation_phase1.sql` and `0036_automation_run_nodes_fk.sql`
3. document the rollback note for the current automation beta release

## 1. Environment

Rehearsal environment:

1. PostgreSQL 17 local cluster at `/tmp/aionis-pg-automation-rehearsal`
2. database name: `aionis_rehearsal`
3. port: `55434`
4. API bind: `127.0.0.1:3043`

Migration target:

1. start from schema state `up to 0034_memory_sandbox_project_budget_profiles.sql`
2. apply `0035_automation_phase1.sql`
3. apply `0036_automation_run_nodes_fk.sql`

## 2. Rehearsal Procedure

Executed sequence:

1. initialized a fresh PostgreSQL cluster
2. created a fresh database
3. applied migrations through `0034`
4. started the current API binary against the pre-automation schema
5. wrote non-empty legacy data into `memory_nodes` and `memory_commits` under scope `migration_rehearsal`
6. stopped the API
7. applied `0035` and `0036`
8. verified legacy row counts remained stable
9. restarted the API on the migrated schema
10. ran `automation:smoke` successfully against the migrated database

## 3. Pre-Migration Evidence

Legacy non-empty data before applying `0035/0036`:

1. `memory_nodes(scope='migration_rehearsal') = 3`
2. `memory_commits(scope='migration_rehearsal') = 3`
3. `schema_migrations` contained neither `0035_automation_phase1.sql` nor `0036_automation_run_nodes_fk.sql`

Interpretation:

1. this was a non-empty pre-automation schema, not a greenfield empty database

## 4. Migration Application Result

Applied successfully:

1. `0035_automation_phase1.sql`
2. `0036_automation_run_nodes_fk.sql`

Post-migration checks:

1. `schema_migrations` recorded both filenames
2. `automation_defs` exists
3. `automation_versions` exists
4. `automation_runs` exists
5. `automation_run_nodes` exists
6. `automation_run_nodes.run_id -> automation_runs.run_id` foreign key is present

## 5. Post-Migration Data Integrity Result

Legacy data counts after applying `0035/0036`:

1. `memory_nodes(scope='migration_rehearsal') = 3`
2. `memory_commits(scope='migration_rehearsal') = 3`

Result:

1. no observed loss or mutation of pre-existing legacy data during migration

## 6. Post-Migration Runtime Validation

Validation performed after migration:

1. started API on the migrated database
2. ran `BASE_URL=http://127.0.0.1:3043 npm run automation:smoke`

Observed result:

1. automation create succeeded
2. first run paused on approval as expected
3. resume succeeded
4. second run cancel succeeded
5. cancelled run retained `terminal_outcome=cancelled`

Conclusion:

1. the migrated schema is usable by the current automation beta runtime

## 7. Rollback Note

Current rollback posture for this beta release:

1. `0035` and `0036` are additive migrations
2. they create new tables, indexes, triggers, and one FK
3. they do not rewrite or mutate legacy core memory tables

Operational rollback recommendation:

1. if automation beta must be disabled after rollout, prefer `application rollback` and `feature disablement`, not destructive schema rollback
2. set automation usage to blocked at the application layer
3. keep the additive schema in place unless a separate database maintenance window is approved
4. do not drop automation tables as part of an urgent rollback unless data retention implications are reviewed

Why this is the preferred rollback:

1. additive schema is low-risk to leave in place
2. application rollback is faster and less error-prone than destructive DDL rollback
3. design partner beta does not require immediate schema removal to restore pre-beta behavior

## 8. Remaining Gap After Rehearsal

This rehearsal closes:

1. the checklist item requiring migration validation on a non-empty database snapshot

This rehearsal does not close:

1. public-beta concurrency hardening
2. public-beta failure injection matrix
3. operator governance UI
4. Marketplace packaging/install work

## 9. Final Result

Decision:

1. migration rehearsal gate for design partner beta: `passed`

Short justification:

1. additive automation migrations applied cleanly on a non-empty pre-automation schema
2. pre-existing data remained intact
3. post-migration automation runtime behavior was validated with live smoke
