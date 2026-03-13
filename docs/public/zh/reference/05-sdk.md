---
title: "SDK 指南"
---

# SDK 指南

Aionis 提供官方 TypeScript 和 Python SDK。

## 安装

### TypeScript

```bash
npm install @aionis/sdk
```

### Python

```bash
pip install aionis-sdk
```

## 客户端初始化

每个环境至少配置这几项：

1. `baseUrl`
2. `tenantId`
3. `scope`
4. `apiKey` 或 bearer token

字段命名映射：

1. TypeScript: `baseUrl`
2. Python: `base_url`

## Quick Start（TypeScript）

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

## Find Summary（TypeScript）

现在也可以先把 `find` 当成紧凑的 inventory surface 来用；只有当 `find_summary` 提示需要时，再去读取完整的 `nodes` 列表。

```ts
const found = await client.find({
  text_contains: "deploy",
  limit: 20,
});

console.log(found.find_summary?.returned_nodes);
console.log(found.find_summary?.type_counts);
console.log(found.find_summary?.filters_applied);
```

现在也可以直接用 SDK helper 拿到 summary-first 结构：

```ts
const found = await client.inspectFind({
  text_contains: "deploy",
  limit: 20,
});

console.log(found.summary?.returned_nodes);
console.log(found.summary?.type_counts);
console.log(found.data.nodes.length);
```

## Resolve Summary（TypeScript）

现在也可以先把 `resolve` 当成紧凑的 object inspection surface 来用；只有当 `resolve_summary` 提示需要时，再去读取完整的 `node`、`edge`、`commit` 或 `decision` 载荷。

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

如果你想默认先走 summary-first inspection，更适合直接用 SDK helper：

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

## Rule Evaluation Summary（TypeScript）

`rulesEvaluate` 现在也可以先当紧凑的 policy inspection surface 来用；只有当 `evaluation_summary` 不够时，再去看完整的 `active / shadow / applied` 载荷。

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

同样的 summary-first helper 模式现在也适用于：

1. `inspectContextAssemble`
2. `inspectRulesEvaluate`
3. `inspectToolsSelect`
4. `inspectToolsDecision`
5. `inspectToolsRun`

## Replay Dispatch（TypeScript）

当你希望 Aionis 先尝试 deterministic replay，再在不命中时回退到普通 replay/planner，可以直接使用 replay dispatch 面。

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

console.log(
  candidate.candidate.eligible_for_deterministic_replay,
  dispatch.dispatch.decision,
);
console.log(dispatch.cost_signals.estimated_primary_model_calls_avoided);
```

## Sandbox Result Summary（TypeScript）

如果你希望先用低 token 成本的工具结果摘要做判断，再按需读取原始日志，可以直接消费 sandbox 响应里的 `result_summary`。

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

## Tool Lifecycle Summary（TypeScript）

`toolsDecision` 和 `toolsRun` 现在也可以先当紧凑的 lifecycle surface 来用；只有当 `lifecycle_summary` 不够时，再去看完整 payload。

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

## Exact Handoff Recovery（TypeScript）

如果你希望 continuation 依赖结构化 handoff，而不是临时自由文本摘要，可以直接使用 handoff helpers。

```ts
const stored = await client.handoffStore({
  anchor: "patch:planner-layer-policy",
  file_path: "src/memory/recall.ts",
  handoff_kind: "patch_handoff",
  summary: "让 recall 和 context 路径都携带 memory-layer policy。",
  handoff_text: "Recall 现在会回显 selection policy，调用方也能显式收紧 allowed layers。",
  acceptance_checks: ["recall 返回 selection_policy", "文档说明 recall 支持 layer tightening"],
});

const recovered = await client.handoffRecover({
  anchor: "patch:planner-layer-policy",
  file_path: "src/memory/recall.ts",
  handoff_kind: "patch_handoff",
});

console.log(stored.handoff?.id, recovered.handoff.handoff_text);
```

## Context Forgetting（TypeScript）

如果你希望 Aionis 在注入上下文时默认排除 `cold/archive` 或低 salience 记忆，可以直接在 layered context 上启用 forgetting policy。

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

console.log(
  assembled.layered_context?.forgetting,
  assembled.layered_context?.layers?.episodes?.forgotten_count,
);
console.log(assembled.cost_signals?.primary_savings_levers, assembled.cost_signals?.context_est_tokens);
console.log(assembled.cost_signals?.selected_memory_layers, assembled.recall.context.selection_policy);
```

## Write-Time Distillation（TypeScript）

如果你希望原始任务文本进入记忆前先变成结构化 `evidence/fact` 节点，而不是只当作 commit 输入，可以直接在 write 上开启蒸馏。

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

## 核心 SDK 方法

1. TypeScript memory: `write`、`recall`、`recallText`
2. TypeScript context 与 graph: `contextAssemble`、`find`、`resolve`
3. TypeScript policy loop: `rulesEvaluate`、`toolsSelect`、`toolsDecision`、`toolsRun`、`toolsFeedback`
4. TypeScript replay: `replayPlaybookGet`、`replayPlaybookCandidate`、`replayPlaybookRun`、`replayPlaybookDispatch`
5. TypeScript continuity helpers: `handoffStore`、`handoffRecover`
6. Python SDK 对重叠核心流程使用 snake_case 命名，比如 `write`、`recall`、`recall_text`、`context_assemble`

说明：

1. 最新的 summary-first helpers 与 continuity helpers 目前优先体现在 TypeScript client 上。
2. Python SDK 当前覆盖面更窄；如果某个 helper 还没有对应方法，可以直接调用同一条 HTTP 路由。

## Replay Dispatch 说明

1. `replayPlaybookCandidate` 是只读判断接口，用于拿 eligibility、mismatch reasons 和建议模式。
2. `replayPlaybookRun` 支持可选 `deterministic_gate`，命中时可把 `simulate` 提升成 `strict`。
3. `replayPlaybookDispatch` 是更推荐的上层入口，会自动输出：
   - `deterministic_replay_executed`
   - `fallback_replay_executed`
   - `candidate_only`
4. replay 响应现在也会带 `cost_signals`，可以直接看 deterministic replay 命中情况和避免的主模型调用次数。

## Context Forgetting 说明

1. forgetting policy 只影响 layered context 的注入结果。
2. 它不会自己删除 memory graph，也不会直接归档节点。
3. 默认策略是保守的：保留 `hot/warm`、排除 archived，只有显式配置 `min_salience` 才会做低 salience 过滤。
4. `contextAssemble` 响应现在也会带 `cost_signals`，可直接查看估算 token、forgotten items 和当前生效的节省杠杆。
5. `cost_signals.selected_memory_layers` 会直接告诉你这次 assemble 实际选中了哪些 memory compression layers。
6. `recall.context.selection_policy` 与 `recall.observability.memory_layers` 会回显当前 endpoint-default 的 layer preference 与 trust-anchor 策略。
7. `memory_layer_preference.allowed_layers` 可以在 `recall`、`recall_text`、`planning/context`、`context/assemble` 上显式收紧可用层，但 Aionis 仍会自动保留 `L3/L0` trust anchors。

## Selective Static Injection（TypeScript）

如果你的 Agent 有很大的 bootstrap/config/system blocks，但每轮只需要其中一部分，可以把这些块交给 Aionis 在 assemble 阶段按需选择。

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

## 相关页面

1. [英文版 SDK Guide](../../en/reference/05-sdk.md)
2. [API 参考](../api-reference/00-api-reference.md)
3. [API 合约](/public/zh/api/01-api-contract)
