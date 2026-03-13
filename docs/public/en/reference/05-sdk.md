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

1. TypeScript memory: `write`, `recall`, `recallText`
2. TypeScript context and graph: `contextAssemble`, `find`, `resolve`
3. TypeScript policy loop: `rulesEvaluate`, `toolsSelect`, `toolsDecision`, `toolsRun`, `toolsFeedback`
4. TypeScript replay: `replayPlaybookGet`, `replayPlaybookCandidate`, `replayPlaybookRun`, `replayPlaybookDispatch`
5. TypeScript continuity helpers: `handoffStore`, `handoffRecover`
6. Python SDK uses snake_case naming for overlapping core flows, such as `write`, `recall`, `recall_text`, and `context_assemble`

Notes:

1. The current TypeScript client exposes the newest summary-first helpers and continuity helpers first.
2. Python SDK coverage is narrower today; when a helper is missing there, use the same HTTP routes directly.

## Find Summary (TypeScript)

Use `find` as a compact inventory surface first, then read the full `nodes` payload only when `find_summary` shows you need it.

```ts
const found = await client.find({
  text_contains: "deploy",
  limit: 20,
});

console.log(found.find_summary?.returned_nodes);
console.log(found.find_summary?.type_counts);
console.log(found.find_summary?.filters_applied);
```

You can also let the SDK extract the summary-first shape directly:

```ts
const found = await client.inspectFind({
  text_contains: "deploy",
  limit: 20,
});

console.log(found.summary?.returned_nodes);
console.log(found.summary?.type_counts);
console.log(found.data.nodes.length);
```

## Resolve Summary (TypeScript)

Use `resolve` as a compact object-inspection surface first, then read the full `node`, `edge`, `commit`, or `decision` payload only when `resolve_summary` says you need it.

```ts
const resolved = await client.resolve({
  uri: "aionis://default/default/event/00000000-0000-0000-0000-000000001101",
  include_meta: true,
  include_slots_preview: true,
});

console.log(resolved.resolve_summary?.payload_kind);
console.log(resolved.resolve_summary?.related_uris);
console.log(resolved.resolve_summary?.object_keys);
```

For summary-first inspection, prefer the SDK helper:

```ts
const resolved = await client.inspectResolve({
  uri: "aionis://default/default/event/00000000-0000-0000-0000-000000001101",
  include_meta: true,
  include_slots_preview: true,
});

console.log(resolved.summary?.payload_kind);
console.log(resolved.summary?.related_uris);
console.log(resolved.data.node?.uri);
```

## Rule Evaluation Summary (TypeScript)

Use `rulesEvaluate` as a compact policy-inspection surface first, then inspect full `active`, `shadow`, or `applied` payloads only when the summary indicates you need them.

```ts
const rules = await client.rulesEvaluate({
  context: { agent: { id: "agent_a" } },
  include_shadow: false,
  limit: 50,
});

console.log(rules.evaluation_summary?.matched);
console.log(rules.evaluation_summary?.filtered_by_lane);
console.log(rules.evaluation_summary?.selected_tool);
```

The same summary-first helper pattern is available for:

1. `inspectContextAssemble`
2. `inspectRulesEvaluate`
3. `inspectToolsSelect`
4. `inspectToolsDecision`
5. `inspectToolsRun`

## Sandbox Result Summary (TypeScript)

Use sandbox responses as a compact tool-output surface first, and only inspect raw logs when the bounded summary indicates you need them.

```ts
const run = await client.sandboxRunGet({
  run_id: "11111111-1111-1111-1111-111111111111",
});

console.log(run.run.result_summary.stdout_preview);
console.log(run.run.result_summary.result_keys);

const logs = await client.sandboxRunLogs({
  run_id: "11111111-1111-1111-1111-111111111111",
  tail_bytes: 4096,
});

console.log(logs.logs.summary.signals, logs.logs.summary.truncated);
```

## Tool Lifecycle Summary (TypeScript)

Use `toolsDecision` and `toolsRun` as compact lifecycle surfaces first, then inspect the full payload only when the summary indicates you need more detail.

```ts
const selected = await client.toolsSelect({
  context: { intent: "deploy" },
  candidates: ["kubectl", "bash", "python3"],
});

console.log(selected.selection_summary?.selected_tool);
console.log(selected.selection_summary?.matched_rules);

const decision = await client.toolsDecision({
  decision_id: "22222222-2222-2222-2222-222222222222",
});

console.log(decision.lifecycle_summary?.selected_tool);
console.log(decision.lifecycle_summary?.candidate_count);

const lifecycle = await client.toolsRun({
  run_id: "33333333-3333-3333-3333-333333333333",
  include_feedback: true,
});

console.log(lifecycle.lifecycle_summary?.status);
console.log(lifecycle.lifecycle_summary?.recent_decisions);
```

## Exact Handoff Recovery (TypeScript)

Use structured handoffs when continuation quality matters more than ad hoc free-form summaries.

```ts
const stored = await client.handoffStore({
  anchor: "patch:planner-layer-policy",
  file_path: "src/memory/recall.ts",
  handoff_kind: "patch_handoff",
  summary: "Carry memory-layer policy through recall and context surfaces.",
  handoff_text: "Recall now echoes selection policy and callers can tighten allowed layers.",
  acceptance_checks: ["recall returns selection_policy", "docs mention recall layer tightening"],
});

const recovered = await client.handoffRecover({
  anchor: "patch:planner-layer-policy",
  file_path: "src/memory/recall.ts",
  handoff_kind: "patch_handoff",
});

console.log(stored.handoff?.id, recovered.handoff.handoff_text);
```

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
console.log(dispatch.cost_signals.estimated_primary_model_calls_avoided);
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
console.log(assembled.cost_signals?.primary_savings_levers, assembled.cost_signals?.context_est_tokens);
console.log(assembled.cost_signals?.selected_memory_layers, assembled.recall.context.selection_policy);
```

## Write-Time Distillation (TypeScript)

Use this when raw task text should enter memory as structured evidence/fact nodes instead of only as commit input.

```ts
const writeRes = await client.write({
  input_text: "Service: payments. Owner: platform team. payments requires approval before deploy.",
  distill: {
    enabled: true,
    max_evidence_nodes: 1,
    max_fact_nodes: 3,
    attach_edges: true,
  },
});

console.log(writeRes.distillation, writeRes.nodes);
```

## Replay Dispatch Notes

1. `replayPlaybookCandidate` is read-only and returns deterministic replay eligibility plus mismatch reasons.
2. `replayPlaybookRun` accepts optional `deterministic_gate`; a matching gate can promote `simulate` to `strict`.
3. `replayPlaybookDispatch` is the recommended top-level entrypoint for agents that want deterministic replay first and planner fallback second.
4. `dispatch.dispatch.decision` is one of:
   - `deterministic_replay_executed`
   - `fallback_replay_executed`
   - `candidate_only`
5. replay responses now expose `cost_signals` so callers can inspect deterministic replay eligibility and avoided primary-model calls directly.

## Context Forgetting Notes

1. Forgetting policy only affects injected layered context.
2. It does not delete memory graph objects or archive them by itself.
3. The default policy is intentionally conservative: keep `hot/warm`, exclude archived, and only apply salience filtering when you opt in.
4. `contextAssemble` responses now expose `cost_signals` so callers can inspect estimated context tokens, forgotten items, and active savings levers directly.
5. `cost_signals.selected_memory_layers` exposes which memory compression layers were actually selected for the assembled context.
6. `recall.context.selection_policy` and `recall.observability.memory_layers` expose the active endpoint-default layer preference and trust-anchor policy used during context selection.
7. `memory_layer_preference.allowed_layers` can tighten the active layer set on `recall`, `recall_text`, `planning/context`, and `context/assemble`, but Aionis still preserves `L3/L0` trust anchors automatically.

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
