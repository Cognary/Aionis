# Runbooks

Use these commands as the operator baseline for recurring production checks.

## How to use this page

1. Start with the core production gate for release readiness.
2. Use weekly evidence generation to keep audit and governance material current.
3. Run replay regression checks after changes to memory, policy, or execution flow.
4. Use consistency checks when a scope appears degraded or inconsistent.

## Core production gate

```bash
npm run -s gate:core:prod -- --base-url "$BASE_URL" --scope default
```

## Weekly governance evidence

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

## Replay regression checks

```bash
npm run -s e2e:replay-learning-fault-smoke
npm run -s e2e:replay-learning-retention-smoke
```

## Scope consistency check

```bash
npm run -s job:consistency-check:scope -- --scope default --strict-warnings
```

## Recommended cadence

1. Before release: core production gate
2. After release: replay regression checks on critical workflows
3. Weekly: governance evidence
4. During incidents: scope consistency check and replay commands
