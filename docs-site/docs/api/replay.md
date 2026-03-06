# Replay APIs

Replay APIs reconstruct what happened in a prior execution and let you rerun or inspect the workflow.

## Endpoints

> `POST /v1/memory/replay/run/start`
> `POST /v1/memory/replay/step/before`
> `POST /v1/memory/replay/step/after`
> `POST /v1/memory/replay/run/end`
> `POST /v1/memory/replay/runs/get`
> `POST /v1/memory/replay/playbooks/compile_from_run`
> `POST /v1/memory/replay/playbooks/get`
> `POST /v1/memory/replay/playbooks/promote`
> `POST /v1/memory/replay/playbooks/repair`
> `POST /v1/memory/replay/playbooks/repair/review`
> `POST /v1/memory/replay/playbooks/run`

## Replay workflow

1. Collect provenance chain (`request_id`, `run_id`, `decision_id`, `commit_uri`).
2. Reconstruct run context and decision path.
3. Replay and compare actual vs expected behavior.
4. Archive replay output as release evidence.

## When to use replay

1. A production run behaved incorrectly and you need to know why.
2. A code or policy change needs regression evidence before release.
3. A support or compliance workflow requires decision provenance.
4. You want to turn a real execution into a reusable playbook.

## Operational usage

1. Incident debugging.
2. Regression verification before production rollout.
3. Post-change confidence checks.

## Error example and fix

Example error:

```json
{
  "error": "not_found",
  "message": "replay run or playbook not found"
}
```

Fix:
1. Confirm source `run_id` or playbook identifier exists in target scope.
2. Verify replay request uses correct `tenant_id` and `scope`.
3. Recompile playbook from a valid run before replaying.

## Minimum identifiers to retain

1. `request_id` for request-level tracing
2. `run_id` for workflow-level replay
3. `decision_id` for policy and tool provenance
4. `commit_uri` for memory object resolution
