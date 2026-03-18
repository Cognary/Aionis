# Policy APIs

Policy APIs make tool selection and action execution inspectable, enforceable, and replayable.

## Endpoints

> `POST /v1/memory/rules/evaluate`
> `POST /v1/memory/tools/select`
> `POST /v1/memory/tools/decision`
> `POST /v1/memory/tools/run`
> `POST /v1/memory/tools/feedback`

## Typical sequence

1. Evaluate rules with normalized runtime context.
2. Select candidate tools under policy constraints.
3. Inspect or persist decision linkage.
4. Inspect run lifecycle state.
5. Submit feedback for closed-loop learning.

## What each endpoint does

1. `rules/evaluate` returns policy matches for the current context.
2. `tools/select` narrows tool candidates under active rules.
3. `tools/decision` reads the chosen decision and provenance from the authoritative store.
4. `tools/run` reads execution lifecycle linked to the prior decision.
5. `tools/feedback` records whether the outcome was useful or needs adjustment.

## Required IDs

1. `run_id`
2. `decision_id`
3. `request_id`

## Minimal evaluate request

```bash
curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","run_id":"run_001","context":{"intent":"support_triage"}}' | jq
```

## Example response (rules/evaluate, trimmed)

```json
{
  "status": "ok",
  "request_id": "req_rules_001",
  "tenant_id": "default",
  "scope": "default",
  "data": {
    "matched": [],
    "applied": []
  }
}
```

## Tool selection request skeleton

```json
{
  "tenant_id": "default",
  "scope": "default",
  "run_id": "run_001",
  "context": {
    "intent": "support_triage",
    "tool": { "name": "ticket_router" }
  },
  "candidates": ["ticket_router", "email_sender"]
}
```

## Error example and fix

Example error:

```json
{
  "error": "invalid_request",
  "message": "run_id is required for policy flow"
}
```

Fix:
1. Ensure the same `run_id` is passed across evaluate/select/decision/feedback.
2. Send normalized `context` with stable keys.
3. Validate required payload shape before request submission.

## Production guidance

1. Normalize context keys before they reach Aionis.
2. Reuse one `run_id` for the full agent execution, not per tool call.
3. Persist `decision_id` immediately after selection or decision recording.
4. Feed outcome quality back into `tools/feedback` if you expect policy tuning to improve over time.
