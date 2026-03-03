---
title: "上下文编排"
---

# 上下文编排

上下文编排用于在明确预算和分层控制下，生成稳定、可规划、可解释的上下文。

## 分层模型

| 层 | 作用 |
| --- | --- |
| `facts` | 稳定事实片段 |
| `episodes` | 最近或场景相关事件 |
| `rules` | 策略约束与决策提示 |
| `decisions` | 历史执行决策依据 |
| `tools` | 工具路由相关上下文 |
| `citations` | 可解释引用与追踪信息 |

## 控制面

1. 启用/禁用层。
2. 总预算 `char_budget_total`。
3. 分层预算 `char_budget_by_layer`。
4. 分层条目上限 `max_items_by_layer`。
5. 合并/丢弃轨迹 `include_merge_trace`。

## 预设

| 预设 | 适用场景 | 取舍 |
| --- | --- | --- |
| Compact | 低延迟链路 | 上下文深度较低 |
| Balanced | 默认生产使用 | 成本与质量均衡 |
| Policy-first | 策略强约束场景 | 叙事信息相对减少 |

## 示例请求

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble context before tool selection",
  "return_layered_context": true,
  "context_layers": {
    "enabled": ["facts", "episodes", "rules", "tools", "citations"],
    "char_budget_total": 1800,
    "max_items_by_layer": {
      "facts": 8,
      "episodes": 4,
      "rules": 6,
      "tools": 4,
      "citations": 8
    },
    "include_merge_trace": true
  }
}
```

## 重点监控

1. 负载下上下文尺寸稳定性。
2. 预算紧张时的分层丢弃率。
3. 关键流程中的策略层覆盖率。
4. 不同预设下的端到端延迟。

## 从这里开始

1. 先在预发环境使用 `Balanced`。
2. 观测延迟与回答质量。
3. 按业务场景调优分层预算。

## 下一步

1. [Planner 上下文](/public/zh/reference/02-planner-context)
2. [构建记忆工作流](/public/zh/guides/01-build-memory)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
