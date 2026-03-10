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

## 相关页面

1. [英文版 SDK Guide](../../en/reference/05-sdk.md)
2. [API 参考](../api-reference/00-api-reference.md)
3. [API 合约](/public/zh/api/01-api-contract)
