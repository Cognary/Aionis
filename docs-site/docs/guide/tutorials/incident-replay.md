# Tutorial: Incident Replay for a Production Failure

Use Aionis replay primitives to reconstruct and verify a failed workflow.

## Before you start

1. You have observed a failed or suspicious run in logs.
2. You can access `run_id` or `decision_id`.
3. You know the `tenant_id` and `scope` for the incident.

## What you will finish with

A replay evidence chain you can attach to incident review and use to verify the fix.

> **Tip - Copy and run**
> Use the copy button on each code block. For consistent environment variables, run [One-click Environment Template](env-template).

## Input

### Input fields

| Field | Required | Used in steps | Example |
| --- | --- | --- | --- |
| `BASE_URL` | Yes | 2, 3 | `http://localhost:3001` |
| `AIONIS_API_KEY` | Yes | 2, 3 | `aionis_live_xxx` |
| `tenant_id` | Yes | 2, 3 | `default` |
| `scope` | Yes | 2, 3 | `support` |
| `run_id` | Yes | 2 | `3d1868e2-e6d3-4f69-952e-61f53ef2ef30` |
| `decision_id` | Conditional | 3 | `8fe92f61-...` |
| `commit_id` | Conditional | 3 | `commit_xxx` |

### Output fields to persist

| Field | Source step | Why keep it |
| --- | --- | --- |
| `request_id` | 2, 3 | Incident timeline correlation |
| `run_id` | 2 | Replay run anchor |
| `timeline[]` | 2 | Step-by-step incident evidence |
| `steps[]` | 2 | Failure boundary and postconditions |
| `artifacts[]` | 2 | Forensics and audit attachment |
| `resolved` payload | 3 | Decision/commit root-cause verification |

## Steps

### Step 1: Collect incident identifiers

From app and gateway logs, collect:

1. `request_id`
2. `run_id`
3. `decision_id`
4. `commit_uri`
5. `tenant_id`
6. `scope`

### Step 2: Pull replay timeline


#### TypeScript

```ts
const replayRes = await fetch(`${process.env.BASE_URL}/v1/memory/replay/runs/get`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': process.env.AIONIS_API_KEY!
  },
  body: JSON.stringify({
    tenant_id: 'default',
    scope: 'support',
    run_id: '<run_uuid>',
    include_steps: true,
    include_artifacts: true
  })
})

const replay = await replayRes.json()
console.log(replay)
```

#### Python

```python
import os
import requests

replay = requests.post(
    f"{os.environ['BASE_URL']}/v1/memory/replay/runs/get",
    headers={"content-type": "application/json", "X-Api-Key": os.environ["AIONIS_API_KEY"]},
    json={
        "tenant_id": "default",
        "scope": "support",
        "run_id": "<run_uuid>",
        "include_steps": True,
        "include_artifacts": True,
    },
    timeout=30,
)

print(replay.json())
```

#### cURL

```bash
curl -sS "$BASE_URL/v1/memory/replay/runs/get" \
  -H "X-Api-Key: $AIONIS_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "run_id":"<run_uuid>",
    "include_steps":true,
    "include_artifacts":true
  }' | jq
```


Review:

1. failed step index
2. tool input/output signatures
3. postcondition status

### Step 3: Resolve decision and commit evidence

```bash
curl -sS "$BASE_URL/v1/memory/resolve" \
  -H "X-Api-Key: $AIONIS_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "uri":"aionis://default/support/decision/<decision_id>",
    "include_meta":true
  }' | jq

curl -sS "$BASE_URL/v1/memory/resolve" \
  -H "X-Api-Key: $AIONIS_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id":"default",
    "scope":"support",
    "uri":"memory://commit/<commit_id>",
    "include_meta":true
  }' | jq
```

### Step 4: Confirm root-cause hypothesis

Use an evidence table in incident notes:

1. expected decision or tool
2. actual selected tool and rule sources
3. context mismatch or stale memory cause
4. remediation patch and owner

### Step 5: Verify fix before close

After patching rules or integration logic, rerun the same business case and compare:

1. selection outcome
2. replay timeline status
3. artifacts and postconditions

## Expected response sample

```json
{
  "status": "ok",
  "request_id": "req_replay_123",
  "tenant_id": "default",
  "scope": "support",
  "run": {
    "run_id": "3d1868e2-e6d3-4f69-952e-61f53ef2ef30",
    "status": "failed"
  },
  "timeline": [
    { "step_index": 1, "status": "success" },
    { "step_index": 2, "status": "failed" }
  ]
}
```

## Common failure and fix

Failure:

```json
{"error":"not_found","message":"replay run or playbook not found"}
```

Fix:

1. Confirm `tenant_id` and `scope` match the original failing run.
2. Validate `run_id` format and value from source logs.
3. If run record is missing, resolve `decision_id` first and rebuild chain from `decision_uri`.

## Success criteria

1. `replay/runs/get` returns the targeted `run_id` with timeline data.
2. A failing or divergent step can be clearly identified.
3. `resolve` returns decision/commit evidence tied to the same incident scope.
4. Post-fix rerun shows expected status change on the critical step.

### Incident close checklist

1. Root cause linked to concrete IDs.
2. Corrective change merged.
3. Replay evidence attached.
4. Follow-up monitor or gate added.
