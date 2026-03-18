---
title: "SDK Guide"
---

# SDK Guide

Aionis provides official SDKs for TypeScript and Python.

Current state:

1. TypeScript SDK and Python SDK now cover the main developer-facing `memory`, `handoff`, `policy`, `replay`, `sandbox`, and `automations` routes.
2. On `2026-03-14`, Aionis ran a route-to-SDK audit over `65` non-admin, non-control-plane routes and found `no missing` surfaces in either SDK.
3. The TypeScript package also ships the Phase 1 local developer CLI via `aionis dev`.
4. The recommended local workflow for Python uses the same official CLI rather than a separate Python runtime launcher.

## Packages

1. TypeScript: `@aionis/sdk`
2. Python: `aionis-sdk`

## Install

### TypeScript

```bash
npm install @aionis/sdk@0.2.20
```

The TypeScript package also exposes:

```bash
npx @aionis/sdk@0.2.20 --help
```

### Python

```bash
pip install aionis-sdk==0.2.20
```

For local Lite startup, use:

```bash
npx @aionis/sdk@0.2.20 dev
```

## Client Setup

Configure once per environment:

1. base URL
2. auth (`api_key` or bearer token)
3. per-request `tenant_id`
4. per-request `scope`

SDK field mapping:

1. TypeScript: `base_url`
2. Python: `base_url`

## Quick Start (TypeScript)

```ts
import { AionisClient } from "@aionis/sdk";

const client = new AionisClient({
  base_url: "https://api.aionisos.com",
  api_key: process.env.AIONIS_API_KEY,
});

const writeRes = await client.write({
  tenant_id: "default",
  scope: "default",
  input_text: "Customer prefers email follow-up",
});

const recallRes = await client.recallText({
  tenant_id: "default",
  scope: "default",
  query_text: "preferred follow-up channel",
});

console.log(writeRes.commit_uri, recallRes.request_id);
```

## Quick Start (Python)

```python
from aionis_sdk import AionisClient

client = AionisClient(
    base_url="http://127.0.0.1:3321",
)

write_res = client.write({"scope": "default", "input_text": "Customer prefers email follow-up"})
recall_res = client.recall_text({"scope": "default", "query_text": "preferred follow-up channel"})

print(write_res.get("commit_uri"), recall_res.get("request_id"))
```

Recommended local developer sequence:

1. `pip install aionis-sdk==0.2.20`
2. `npx @aionis/sdk@0.2.20 dev`
3. `AionisClient(base_url=\"http://127.0.0.1:3321\")`

See [Python SDK + Aionis CLI](/public/en/getting-started/08-python-sdk-with-cli) for the full onboarding flow.

## Core SDK Methods

1. TypeScript memory: `write`, `recall`, `recallText`
2. TypeScript session helpers: `listSessions`, `createSession`, `writeEvent`, `listSessionEvents`
3. TypeScript context and graph: `contextAssemble`, `find`, `resolve`
4. TypeScript policy loop: `rulesEvaluate`, `toolsSelect`, `toolsDecision`, `toolsRun`, `toolsFeedback`
5. TypeScript Aionis Doc helpers: `docRecover`, `docResume`, `docRecoverAndResume`
6. TypeScript replay: `replayPlaybookGet`, `replayPlaybookCandidate`, `replayPlaybookRun`, `replayPlaybookDispatch`
7. TypeScript continuity helpers: `handoffStore`, `handoffRecover`
8. TypeScript automation helpers: `automationCreate`, `automationValidate`, `automationGraphValidate`, `automationRun`
9. Python SDK uses snake_case naming for overlapping core flows, such as `write`, `recall`, `recall_text`, `list_sessions`, `list_session_events`, `handoff_store`, `replay_playbook_dispatch`, and `automation_graph_validate`

Notes:

1. The current TypeScript client exposes the newest summary-first helpers, continuity helpers, and the native session inventory surface.
2. `docResume` is the current typed entrypoint when you already have a `recover_result`, and `docRecoverAndResume` is the wrapped entrypoint when you only have a recover request or handoff anchor.
3. The Python SDK now mirrors the same Aionis Doc high-level helper surface via `doc_recover`, `doc_resume`, and `doc_recover_and_resume`, while staying Pythonic with snake_case naming and plain-dict responses.
4. Local runtime startup is intentionally centralized in one CLI so TypeScript and Python do not drift into two separate bootstrap flows.

## Aionis Doc Resume Helper (TypeScript)

If you already have an `aionis_doc_recover_result_v1`, you no longer need to manually chain:

`handoff/recover -> context/assemble -> tools/select -> tools/decision -> tools/run`

Use the SDK helper instead:

```ts
const resumed = await client.docResume({
  recover_result,
  candidates: ["resume_patch", "request_review"],
  feedback_outcome: "positive",
});

console.log(resumed.resume_summary.resume_state);
console.log(resumed.resume_summary.lifecycle_transition);
```

The helper returns a typed `AionisDocResumeResult` envelope that already includes:

1. `resume_summary`
2. `context_assemble_response`
3. `tools_select_response`
4. `tools_decision_response`
5. `tools_run_response`
6. optional `tools_feedback_response`
7. optional `tools_run_post_feedback_response`

If you do not already have a recover envelope, use the wrapped helper:

```ts
const resumed = await client.docRecoverAndResume({
  recover_request: { anchor: "aionis-doc:workflow-001", scope: "default" },
  input_kind: "handoff-store-request",
  candidates: ["resume_patch", "request_review"],
});
```

Python now exposes the same flow shape:

```python
resumed = client.doc_recover_and_resume(
    {
        "recover_request": {"anchor": "aionis-doc:workflow-001", "scope": "default"},
        "input_kind": "handoff-store-request",
        "candidates": ["resume_patch", "request_review"],
    }
)
```

## Coverage Snapshot

As of `2026-03-14`, the public SDK surface covers the full audited developer path:

1. memory write/recall/context/session/event routes
2. handoff store/recover
3. policy evaluation, tool selection, decision, run, and feedback
4. replay run, playbook compile/get/candidate/run/dispatch/promote/repair/review
5. sandbox session/execute/get/logs/artifact/cancel
6. automation create/get/list/validate/graph-validate/shadow/run surfaces

Boundary:

1. This statement excludes `server-only`, `admin`, and `control-plane` routes.
2. Those surfaces remain intentionally outside the default public SDK promise.

## Local Developer CLI

The TypeScript package now includes a Phase 1 Lite developer CLI:

1. `aionis dev`
2. `aionis stop`
3. `aionis health`
4. `aionis doctor`
5. `aionis selfcheck`

Use it when you want the SDK package to manage a local Lite runtime during development.

See [SDK CLI](/public/en/reference/09-sdk-cli) for command details, and see [Aionis Doc](/public/en/reference/10-aionis-doc) for the executable-document surface built on top of the CLI.

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
7. `recall.context.selection_stats` and layered `cost_signals` expose both retrieval-side and context-side layer filtering stats, so you can tell whether nodes were excluded before ranking/subgraph assembly or only during final context tightening.
8. `memory_layer_preference.allowed_layers` can tighten the active layer set on `recall`, `recall_text`, `planning/context`, and `context/assemble`, but Aionis still preserves `L3/L0` trust anchors automatically.

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
