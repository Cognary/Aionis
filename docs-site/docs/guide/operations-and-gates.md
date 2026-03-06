# Operations and Gates

This page defines the production operating baseline.

## What this page is for

1. Decide whether a deployment is safe enough to release.
2. Define the minimum operating evidence for production.
3. Use replay to debug incidents and verify fixes.

## Daily checks

Health:

```bash
curl -sS http://localhost:${PORT:-3001}/health | jq
```

Core production gate:

```bash
npm run -s gate:core:prod -- --base-url "http://localhost:${PORT:-3001}" --scope default
```

Policy sanity:

```bash
curl -sS http://localhost:${PORT:-3001}/v1/memory/rules/evaluate \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","context":{"intent":"support_triage"}}' | jq '{matched}'
```

## Go-live minimum

Before production traffic, confirm all of the following:

1. Health checks pass from the real deployment environment.
2. Core production gate completes without blocking failures.
3. Auth, rate limiting, and tenant isolation are enabled.
4. One end-to-end workflow produces a complete replay chain.
5. Operators know where to find logs, metrics, and rollback procedure.

## Replay Execution

Replay identifiers:

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`

Operational replay workflow:

1. Extract failing `request_id` from logs.
2. Rebuild run/decision chain with `run_id` and `decision_id`.
3. Resolve affected objects via `POST /v1/memory/resolve` and `commit_uri`.
4. Replay workflow and compare with expected behavior.

## Release evidence checklist

1. Core gate summary.
2. Health and consistency outputs.
3. Performance snapshot.
4. Replay evidence chain for at least one workflow.

## Regression checks

```bash
npm run -s e2e:replay-learning-fault-smoke
npm run -s e2e:replay-learning-retention-smoke
RUN_REPLAY_LEARNING_SMOKES=true npm run -s regression:oneclick
```

## What to archive after a release

1. Gate outputs and health evidence.
2. The deployment version or commit linked to the release.
3. At least one replayable workflow trace from the new release.
4. Any policy changes introduced with the release.
