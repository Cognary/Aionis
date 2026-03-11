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
6. 如果你启用了 `context_optimization_profile`，也要保持 `intent`、`tool`、`request` 这些信号稳定，这样 Aionis 才能确定性地应用 forgetting 和 static injection 预设，而不是退回更宽的上下文装配。
7. 如果你要评估 workload-aware recall policy，可以在 `planning/context` 或 `context/assemble` 上按请求传 `recall_class_aware=true|false`，直接对比 selector 和静态默认值，而不用切整套服务配置。
8. 如果你明确需要更宽的图关系覆盖，优先在 `planning/context` 或 `context/assemble` 上显式传 `recall_mode="dense_edge"`，而不是依赖仍在评估阶段的自动 selector。这是当前更稳的 opt-in 宽图召回方式。
9. 运维侧也可以给 `planning/context` 和 `context/assemble` 配置默认的 `context_optimization_profile`，这样稳定的成本优化预设可以由服务端统一推进，而不用要求每个调用方都显式传参。
10. 如果你要在环境侧 rollout 这些 endpoint 默认值，优先使用受控 env preset，而不是手改零散配置，这样回滚也能保持一条命令完成。

## Planning Summary

`POST /v1/memory/planning/context` 现在还会返回 `planning_summary`，它会把 planner 最常关心的信号收成紧凑摘要：

1. `selected_tool`
2. `decision_id`
3. `rules_considered` / `rules_matched`
4. `context_est_tokens`
5. `forgotten_items`
6. `static_blocks_selected`
7. `primary_savings_levers`

这样调用方可以先看摘要，再决定是否继续读取完整的 `recall / rules / tools / layered_context` 载荷。

## Assembly Summary

`POST /v1/memory/context/assemble` 现在也会返回 `assembly_summary`，它会把装配侧最常关心的信号收成紧凑摘要：

1. `selected_tool`
2. `decision_id`
3. `rules_considered` / `rules_matched`
4. `include_rules`
5. `context_est_tokens`
6. `forgotten_items`
7. `static_blocks_selected`
8. `primary_savings_levers`

适合在调用方只需要快速判断“这份 assembled context 是否够用”时，先读摘要而不是马上遍历完整 `layered_context`。

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
4. [性能基线](../benchmarks/05-performance-baseline.md)
