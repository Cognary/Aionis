---
title: "Context Orchestration"
---

# Context Orchestration

`POST /v1/memory/context/assemble` gives a deterministic, replayable, multi-layer context output.

## What You Control

1. `context_layers.enabled`: choose layers (`facts`, `episodes`, `rules`, `decisions`, `tools`, `citations`)
2. `context_layers.char_budget_total`: global char budget
3. `context_layers.char_budget_by_layer`: per-layer budgets
4. `context_layers.max_items_by_layer`: per-layer item caps
5. `context_layers.include_merge_trace`: include trace for drop/merge reasoning

## Copy-Ready Templates

### 1) Balanced preset

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble context before answering user question",
  "context": {
    "task": "chat_reply",
    "channel": "chat"
  },
  "include_rules": true,
  "tool_candidates": ["search_profile", "draft_answer"],
  "tool_strict": false,
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

### 2) Compact preset

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble compact context",
  "include_rules": true,
  "return_layered_context": true,
  "context_layers": {
    "enabled": ["facts", "rules", "tools", "citations"],
    "char_budget_total": 1000,
    "max_items_by_layer": {
      "facts": 5,
      "rules": 4,
      "tools": 3,
      "citations": 6
    },
    "include_merge_trace": true
  }
}
```

### 3) Policy-first preset

```json
{
  "tenant_id": "default",
  "scope": "default",
  "query_text": "Assemble policy-first context",
  "include_rules": true,
  "tool_candidates": ["kb_search", "draft_reply"],
  "tool_strict": true,
  "return_layered_context": true,
  "context_layers": {
    "enabled": ["rules", "tools", "facts", "citations"],
    "char_budget_total": 1400,
    "max_items_by_layer": {
      "rules": 8,
      "tools": 4,
      "facts": 6,
      "citations": 8
    },
    "include_merge_trace": true
  }
}
```

## Response Fields To Inspect

1. `layered_context.order`
2. `layered_context.stats`
3. `layered_context.dropped_reasons`
4. `layered_context.merge_trace`
5. `layered_context.merged_text`

## 中文速览

### 能力说明

1. `context/assemble` 用于显式多层上下文编排，不再只依赖隐式召回文本。
2. 可按层控制预算、条目上限和输出顺序。
3. 可输出 `merge_trace` 与 `dropped_reasons`，支持审计和回放。

### 建议上线口径

1. 先用 `Balanced` 预设验证效果与延迟。
2. 对高实时场景切换 `Compact`，降低 token 成本。
3. 对合规/工具调用严格场景使用 `Policy-first`。

## Playground

Playground 已内置：

1. `context/assemble` 操作模板
2. 层预设按钮（Balanced / Compact / Policy-first）
3. 启用层勾选与预算输入
4. `layered_context` 摘要与 `merge_trace` 预览

See also: [Playground](/public/en/guides/02-playground), [Planner Context](/public/en/reference/02-planner-context), [API Contract](/public/en/api/01-api-contract)
