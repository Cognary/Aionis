# Two-Phase Migrations (Gentle Constraints)

Goal: enforce strong constraints (typically `NOT NULL`) **without** taking long locks unexpectedly on large tables.

This repo's migrator applies everything under `migrations/` by default (`make db-migrate`). For production, prefer the two-phase pattern:

## Phase 1: Add + Validate a CHECK Constraint

Deploy code that writes the field consistently, then add a validated check:

1. Add a constraint as `NOT VALID` (fast)
2. `VALIDATE CONSTRAINT` (scans table; less intrusive than `SET NOT NULL` in practice)
3. Run in production and monitor for violations (should be 0)

At this point:
- you have a hard rule (writes that violate it will fail if constraint is valid)
- but the column is still nullable at the schema type level (so tools/ORMs might still treat it as optional)

## Phase 2: Promote to `NOT NULL`

After Phase 1 has proven stable in production for a while, ship another change that:

1. preflights `WHERE col IS NULL` (must be 0)
2. executes `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL`

With a validated check already in place, `SET NOT NULL` is typically fast.

## Applying Only Up To a Given Migration

To support staged rollouts, the migration runner supports `--up-to` (or env `MIGRATE_UP_TO`):

```bash
make db-migrate MIGRATE_UP_TO=0012_memory_tier_long_term.sql
# or:
./scripts/db-migrate.sh --up-to 0012_memory_tier_long_term.sql
```

This applies migrations **in order** until the specified filename (inclusive), then stops.

## Important Notes

- Avoid editing old migrations once applied in production. Prefer new numbered migrations for Phase 2.
- For "must be auditable" fields (like `commit_id`), do Phase 1 soon after code rollout, then Phase 2 once stable.

## Repo Examples

- `0010_commit_id_not_null.sql`
  - phase-1 style safety (`CHECK ... NOT VALID` + `VALIDATE`) plus promotion to `SET NOT NULL`
- `0014_private_rule_owner_guard.sql` -> `0015_validate_private_rule_owner_guard.sql`
  - phase-1: add guard as `NOT VALID` for private rule ownership
  - phase-2: validate globally after running `job:private-rule-owner-backfill`
