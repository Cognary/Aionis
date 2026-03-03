---
title: "API 参考"
---

# API 参考

本页给出 Aionis 对接时最实用的 API 路由地图。

## 基础路径

所有 Memory Kernel 路由都在：

`/v1/memory/*`

## 认证方式

Memory 路由使用以下任一方式：

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

仅在明确需要的管理面接口使用 `X-Admin-Token`。

## 路由分组

### 记忆写入与召回

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`

### 上下文编排

1. `POST /v1/memory/context/assemble`
2. `POST /v1/memory/planning/context`

### 策略与执行闭环

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/feedback`

### 会话与事件

1. `POST /v1/memory/sessions`
2. `POST /v1/memory/events`
3. `POST /v1/memory/sessions/events/list`

### 图与回放工具

1. `POST /v1/memory/find`
2. `POST /v1/memory/resolve`

## 常见请求字段

1. `tenant_id`
2. `scope`
3. `run_id`（策略流程）
4. `context`（策略/规划输入）

## 常见响应字段

1. `request_id`
2. `tenant_id`
3. `scope`
4. `commit_id` / `commit_uri`（写入类接口）
5. `decision_id` / `decision_uri`（决策类接口）

## 错误结构

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

## 最小接入顺序

1. 先跑通一次 `write`。
2. 用 `recall_text` 验证召回质量。
3. 用 `context/assemble` 验证分层上下文。
4. 接入 `rules/evaluate` + `tools/select`。
5. 用 `resolve` + URI 做回放。

## 相关页面

1. [API 合约](/public/zh/api/01-api-contract)
2. [SDK 指南](/public/zh/reference/05-sdk)
3. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
