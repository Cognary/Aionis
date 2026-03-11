---
title: "Planner 上下文"
---

# Planner 上下文

Aionis 的 Planner 上下文是 rules、tools 和 planning/context 共用的标准化运行时输入。

## 主要用途

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/planning/context`
4. `POST /v1/memory/context/assemble`

## 核心字段

| 字段 | 作用 |
| --- | --- |
| `run.id` | 执行关联键 |
| `intent` | 当前任务意图 |
| `agent.id` | 执行 Agent 标识 |
| `agent.team_id` | 可选团队边界 |
| `tool.name` | 当前或候选工具 |
| `request.endpoint` | 请求级上下文 |

## 设计规则

1. 字段名在服务、SDK、调用方之间保持稳定。
2. 优先传规范化标识，不要传高熵 prompt blob。
3. rules 和 tools/select 尽量复用同一个 context 对象。
4. 每条策略决策链都带上 `run.id`。
5. 如果你启用了 `static_context_blocks`，要尽量把 `intent`、`tool`、`request` 这些信号结构化传入，这样静态块选择才能稳定命中。

## 最小示例

```json
{
  "version": 1,
  "run": { "id": "run_001" },
  "intent": "support_triage",
  "agent": { "id": "agent_a", "team_id": "team_default" },
  "tool": { "name": "ticket_router" },
  "request": { "endpoint": "/chat/reply", "method": "POST" }
}
```

## 相关页面

1. [英文版 Planner Context](../../en/reference/02-planner-context.md)
2. [上下文编排](../context-orchestration/00-context-orchestration.md)
3. [API 合约](/public/zh/api/01-api-contract)
