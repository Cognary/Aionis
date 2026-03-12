---
title: "上下文编排"
---

# 上下文编排

上下文编排是 Aionis 里的一个核心运行时能力。这一页只解释这项能力如何工作，以及应该怎么使用。

如果你还在理解 Aionis 整体是什么，先看：

1. [Aionis 一页说明](/public/zh/about/02-aionis-onepage)
2. [核心概念](/public/zh/core-concepts/00-core-concepts)
3. [架构](/public/zh/architecture/01-architecture)

## 分层模型

| 层 | 作用 |
| --- | --- |
| `facts` | 稳定事实片段 |
| `episodes` | 最近或场景相关事件 |
| `rules` | 策略约束与决策提示 |
| `static` | 经过选择的 bootstrap/config/instruction blocks |
| `decisions` | 历史执行决策依据 |
| `tools` | 工具路由相关上下文 |
| `citations` | 可解释引用与追踪信息 |

## 控制面

1. 启用/禁用层。
2. 总预算 `char_budget_total`。
3. 分层预算 `char_budget_by_layer`。
4. 分层条目上限 `max_items_by_layer`。
5. 合并/丢弃轨迹 `include_merge_trace`。
6. 使用 `static_context_blocks` + `static_injection` 对静态 bootstrap/config blocks 做按需注入。
7. 使用 `context_layers.forgetting_policy` 默认排除 cold/archive 记忆。
8. 如果你不想手工同时传 compaction、forgetting、static injection，可以直接使用 `context_optimization_profile=balanced|aggressive` 让 Aionis 自动补齐默认值。

## 预设

| 预设 | 适用场景 | 取舍 |
| --- | --- | --- |
| Compact | 低延迟链路 | 上下文深度较低 |
| Balanced | 默认生产使用 | 成本与质量均衡 |
| Policy-first | 策略强约束场景 | 叙事信息相对减少 |

按当前公开产品语言，最值得关注的是：

1. `balanced`：更稳的默认路径
2. `aggressive`：更偏节省成本，但会更强地压缩上下文

## 示例请求

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble context before tool selection",
  "return_layered_context": true,
  "tool_candidates": ["kubectl", "bash"],
  "context_layers": {
    "enabled": ["facts", "episodes", "rules", "static", "tools", "citations"],
    "char_budget_total": 1800,
    "max_items_by_layer": {
      "facts": 8,
      "episodes": 4,
      "rules": 6,
      "static": 3,
      "tools": 4,
      "citations": 8
    },
    "include_merge_trace": true,
    "forgetting_policy": {
      "allowed_tiers": ["hot", "warm"],
      "exclude_archived": true
    }
  },
  "static_context_blocks": [
    {
      "id": "deploy_bootstrap",
      "title": "Deploy Bootstrap",
      "content": "Require approval before prod deploy and collect rollback refs.",
      "intents": ["deploy"],
      "tools": ["kubectl"],
      "priority": 70
    }
  ],
  "static_injection": {
    "max_blocks": 2,
    "min_score": 50
  }
}
```

## Optimization Profile 快捷方式

如果你不想分别配置 compaction、forgetting 和 static injection，可以直接使用一个预设：

```json
{
  "query_text": "prepare prod deploy context",
  "context": { "intent": "deploy", "approval": "required" },
  "tool_candidates": ["kubectl", "bash"],
  "return_layered_context": true,
  "context_optimization_profile": "aggressive"
}
```

当前预设行为：

1. `balanced`
   - 在未显式提供时设置 `context_compaction_profile=balanced`
   - forgetting 默认保留 `hot + warm`，排除 archived，`min_salience=0.15`
   - static injection 默认 `max_blocks=4`、`min_score=50`
2. `aggressive`
   - 在未显式提供时设置 `context_compaction_profile=aggressive`
   - forgetting 默认只保留 `hot`，排除 archived，`min_salience=0.35`
   - static injection 默认 `max_blocks=2`、`min_score=80`

响应会在 `layered_context.optimization_profile` 里回显实际应用的预设。

## 重点监控

1. 负载下上下文尺寸稳定性。
2. 预算紧张时的分层丢弃率。
3. 关键流程中的策略层覆盖率。
4. 不同预设下的端到端延迟。
5. 静态块选择命中率与误选率。

## 从这里开始

1. 先在预发环境使用 `Balanced`。
2. 观测延迟与回答质量。
3. 按业务场景调优分层预算。

## 下一步

1. [Planner 上下文](/public/zh/reference/02-planner-context)
2. [构建记忆工作流](/public/zh/guides/01-build-memory)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
