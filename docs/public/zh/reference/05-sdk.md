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

1. Memory: `write`、`recall`、`recall_text`
2. Context: `context_assemble`
3. Graph: `find`、`resolve`
4. Replay: `replayPlaybookGet`、`replayPlaybookCandidate`、`replayPlaybookRun`、`replayPlaybookDispatch`

## Replay Dispatch 说明

1. `replayPlaybookCandidate` 是只读判断接口，用于拿 eligibility、mismatch reasons 和建议模式。
2. `replayPlaybookRun` 支持可选 `deterministic_gate`，命中时可把 `simulate` 提升成 `strict`。
3. `replayPlaybookDispatch` 是更推荐的上层入口，会自动输出：
   - `deterministic_replay_executed`
   - `fallback_replay_executed`
   - `candidate_only`

## Context Forgetting 说明

1. forgetting policy 只影响 layered context 的注入结果。
2. 它不会自己删除 memory graph，也不会直接归档节点。
3. 默认策略是保守的：保留 `hot/warm`、排除 archived，只有显式配置 `min_salience` 才会做低 salience 过滤。

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
