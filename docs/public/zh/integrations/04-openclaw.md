---
title: "OpenClaw 集成"
---

# OpenClaw 集成

Aionis 可作为 OpenClaw/Clawbot 类工具型 Agent 的记忆层与策略层。

## 集成形态

建议在 skill 运行时接入四个动作：

1. `memory.write`
2. `memory.context`
3. `memory.policy`
4. `memory.feedback`（建议启用，形成闭环）

参考实现位于：

1. `src/integrations/openclaw-skill.ts`

## 动作契约

1. `memory.write`
   把用户意图、工具结果、关键决策写入项目记忆。
2. `memory.context`
   用预算预设组装分层上下文（`facts/episodes/rules/decisions/tools/citations`）。
3. `memory.policy`
   在工具路由前执行 `tools/select`（或 `rules/evaluate`）。
4. `memory.feedback`
   将执行结果按 `run_id/decision_id` 回写，驱动受控策略适配。

## Scope 与隔离建议

1. 单用户场景可固定 `tenant_id=default`。
2. 每个项目固定一个 scope：`scope=clawbot:<project>`。
3. 在 `select -> feedback` 之间持久化 `run_id` 与 `decision_id`。

## Smoke Test

```bash
set -a; source .env; set +a
bash examples/openclaw_skill_smoke.sh
```

该 smoke 会执行：write -> context -> policy -> feedback。
若目标服务暂未提供 `context/assemble`，smoke 会将 context 标记为 `context_assemble_unavailable`，并继续校验 policy + feedback。

## 最小运行示例

```ts
import { createOpenClawSkillFromEnv } from "../src/integrations/openclaw-skill.js";

const skill = createOpenClawSkillFromEnv(process.env);

await skill.invoke("memory.write", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  kind: "event",
  text: "客户偏好邮件跟进",
});

const ctx = await skill.invoke("memory.context", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  query_text: "下一步怎么跟进客户？",
  budget: "normal",
  context: { intent: "follow_up" },
});

const policy = await skill.invoke("memory.policy", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  mode: "tools_select",
  context: { intent: "follow_up" },
  candidate_tools: ["send_email", "call_crm", "search_docs"],
  strict: false,
});

await skill.invoke("memory.feedback", {
  project: "sales-assistant",
  run_id: "run_20260304_001",
  decision_id: policy.decision_id ?? undefined,
  outcome: "positive",
  context: { intent: "follow_up" },
  candidate_tools: ["send_email", "call_crm", "search_docs"],
  selected_tool: policy.selected_tool ?? "send_email",
});
```

## 相关页面

1. [集成概览](/public/zh/integrations/00-overview)
2. [API 契约](/public/zh/api/01-api-contract)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
