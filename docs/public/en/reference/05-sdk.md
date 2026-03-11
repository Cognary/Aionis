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

## Context Forgetting Policy (TypeScript)

Use layered context assembly when you want Aionis to keep cold or archived memory out of the injected prompt by default.

```ts
const assembled = await client.contextAssemble({
  query_text: "prepare deployment plan",
  context: { intent: "deploy", approval: "required" },
  return_layered_context: true,
  context_layers: {
    enabled: ["facts", "episodes", "rules", "citations"],
    char_budget_total: 2400,
    forgetting_policy: {
      allowed_tiers: ["hot", "warm"],
      exclude_archived: true,
      min_salience: 0.2,
    },
  },
});

console.log(assembled.layered_context?.forgetting, assembled.layered_context?.layers?.episodes?.forgotten_count);
```

## Replay Dispatch Notes

1. `replayPlaybookCandidate` is read-only and returns deterministic replay eligibility plus mismatch reasons.
2. `replayPlaybookRun` accepts optional `deterministic_gate`; a matching gate can promote `simulate` to `strict`.
3. `replayPlaybookDispatch` is the recommended top-level entrypoint for agents that want deterministic replay first and planner fallback second.
4. `dispatch.dispatch.decision` is one of:
   - `deterministic_replay_executed`
   - `fallback_replay_executed`
   - `candidate_only`

## Context Forgetting Notes

1. Forgetting policy only affects injected layered context.
2. It does not delete memory graph objects or archive them by itself.
3. The default policy is intentionally conservative: keep `hot/warm`, exclude archived, and only apply salience filtering when you opt in.

## Selective Static Injection (TypeScript)

Use this when your agent has large bootstrap/config blocks but only some of them are relevant to the current task.

```ts
const assembled = await client.contextAssemble({
  query_text: "prepare production deploy plan",
  context: { intent: "deploy", environment: "prod" },
  tool_candidates: ["kubectl", "bash"],
  return_layered_context: true,
  context_layers: {
    enabled: ["facts", "rules", "static", "tools", "citations"],
  },
  static_context_blocks: [
    {
      id: "deploy_bootstrap",
      title: "Deploy Bootstrap",
      content: "Require approval before prod deploy and collect rollback refs.",
      intents: ["deploy"],
      tools: ["kubectl"],
      priority: 70,
    },
    {
      id: "support_bootstrap",
      title: "Support Bootstrap",
      content: "Escalate severe tickets to support lead.",
      intents: ["support"],
      tools: ["jira"],
      priority: 60,
    },
  ],
  static_injection: {
    max_blocks: 2,
    min_score: 50,
  },
});

console.log(assembled.layered_context?.static_injection, assembled.layered_context?.merged_text);
```

## Error Handling Baseline

1. Retry transient network and `429` errors.
2. Log server `error` code and `request_id`.
3. Surface clear operator-facing error messages.

## Next Steps

1. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
2. [API Contract](/public/en/api/01-api-contract)
3. [Build Memory Workflows](/public/en/guides/01-build-memory)
