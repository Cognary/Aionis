---
title: "SDK Guide"
---

# SDK Guide

Aionis provides official SDKs for TypeScript and Python.

## Packages

1. TypeScript: `@aionis/sdk`
2. Python: `aionis-sdk`

## Install

### TypeScript

```bash
npm install @aionis/sdk
```

### Python

```bash
pip install aionis-sdk
```

## Client Setup

Configure once per environment:

1. base URL
2. `tenant_id`
3. `scope`
4. auth (`api_key` or bearer token)

SDK field mapping:

1. TypeScript: `baseUrl`
2. Python: `base_url`

## Quick Start (TypeScript)

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  baseUrl: "https://api.aionisos.com",
  tenantId: "default",
  scope: "default",
  apiKey: process.env.AIONIS_API_KEY,
});

const writeRes = await client.write({
  input_text: "Customer prefers email follow-up",
});

const recallRes = await client.recallText({
  query_text: "preferred follow-up channel",
});

console.log(writeRes.commit_uri, recallRes.request_id);
```

## Quick Start (Python)

```python
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="https://api.aionisos.com",
    tenant_id="default",
    scope="default",
    api_key="<your-api-key>",
)

write_res = client.write(input_text="Customer prefers email follow-up")
recall_res = client.recall_text(query_text="preferred follow-up channel")

print(write_res.get("commit_uri"), recall_res.get("request_id"))
```

## Core SDK Methods

1. Memory: `write`, `recall`, `recall_text`
2. Context: `context_assemble`
3. Graph: `find`, `resolve`
4. Policy loop: `rules_evaluate`, `tools_select`, `tools_decision`, `tools_feedback`
5. Replay: `replayPlaybookGet`, `replayPlaybookCandidate`, `replayPlaybookRun`, `replayPlaybookDispatch`

## Replay Dispatch Quick Start (TypeScript)

Use replay candidate lookup to decide whether a playbook can skip primary reasoning, then let dispatch execute deterministic replay or fallback automatically.

```ts
const candidate = await client.replayPlaybookCandidate({
  playbook_uri: "aionis://memory/playbook/deploy-app",
  deterministic_gate: {
    preferred_execution_mode: "strict",
    required_playbook_statuses: ["active", "shadow"],
    matchers: { workflow: "deploy" },
    policy_constraints: { approval: "required" },
  },
});

if (candidate.candidate.eligible_for_deterministic_replay) {
  console.log(candidate.candidate.next_action);
}

const dispatch = await client.replayPlaybookDispatch({
  playbook_uri: "aionis://memory/playbook/deploy-app",
  deterministic_gate: {
    preferred_execution_mode: "strict",
    required_playbook_statuses: ["active", "shadow"],
    matchers: { workflow: "deploy" },
    policy_constraints: { approval: "required" },
  },
  execute_fallback: true,
  fallback_mode: "guided",
  params: {
    allow_local_exec: true,
  },
});

console.log(dispatch.dispatch.decision, dispatch.dispatch.primary_inference_skipped);
```

## Replay Dispatch Notes

1. `replayPlaybookCandidate` is read-only and returns deterministic replay eligibility plus mismatch reasons.
2. `replayPlaybookRun` accepts optional `deterministic_gate`; a matching gate can promote `simulate` to `strict`.
3. `replayPlaybookDispatch` is the recommended top-level entrypoint for agents that want deterministic replay first and planner fallback second.
4. `dispatch.dispatch.decision` is one of:
   - `deterministic_replay_executed`
   - `fallback_replay_executed`
   - `candidate_only`

## Error Handling Baseline

1. Retry transient network and `429` errors.
2. Log server `error` code and `request_id`.
3. Surface clear operator-facing error messages.

## Next Steps

1. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
2. [API Contract](/public/en/api/01-api-contract)
3. [Build Memory Workflows](/public/en/guides/01-build-memory)
