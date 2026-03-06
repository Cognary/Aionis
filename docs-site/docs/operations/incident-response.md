# Incident Response and Replay

Use replay as the backbone of incident debugging. The goal is not only to restore service, but to preserve enough evidence to explain what happened and verify the fix.

## First 15 minutes

1. Identify the failing `request_id` and affected tenant or scope.
2. Pull `run_id`, `decision_id`, and `commit_uri` from logs if available.
3. Confirm whether the failure is isolated or release-wide.
4. Decide whether mitigation or rollback is required before deeper analysis.

## Incident workflow

1. Capture failing `request_id` from client and server logs.
2. Resolve `run_id`, `decision_id`, and `commit_uri` chain.
3. Reconstruct execution path with replay APIs.
4. Apply mitigation.
5. Re-run replay to verify fix.

## Evidence package

1. Timeline of key events.
2. Request/decision payload snapshots.
3. Replay before/after comparison.
4. Mitigation and rollback notes.

## What good incident evidence looks like

1. A reproducible failure path tied to concrete IDs
2. The exact decision or memory object that influenced the bad outcome
3. A fix verification replay showing the expected behavior
4. A clear record of whether the issue came from code, policy, or runtime context

## Example: replay-based fix validation

Scenario:
1. A support workflow selected `email_sender` instead of `ticket_router` after a rule update.

Validation steps:
1. Pull original IDs: `request_id`, `run_id`, `decision_id`, `commit_uri`.
2. Replay original chain and confirm wrong selection is reproducible.
3. Apply rule fix.
4. Replay same workflow and verify selected tool changed to expected target.

Expected comparison:

| Check | Before fix | After fix |
| --- | --- | --- |
| selected tool | `email_sender` | `ticket_router` |
| decision_id | old chain | new chain |
| status | failed expectation | pass |

## Fast command

```bash
curl -sS "$BASE_URL/v1/memory/resolve" \
  -H 'content-type: application/json' \
  -d "{\"tenant_id\":\"default\",\"scope\":\"default\",\"uri\":\"$COMMIT_URI\"}" | jq
```

## Incident exit criteria

1. The mitigation or rollback is complete.
2. The replay chain has been reconstructed or explicitly ruled out as unavailable.
3. The likely root cause is documented with IDs and evidence.
4. A verification replay or regression check has passed.
