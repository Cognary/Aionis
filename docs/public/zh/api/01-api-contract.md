---
title: "API 合约（硬约束）"
---

# API 合约（硬约束）

本页是中文速览版，覆盖 Aionis 对外 API 的硬约束边界与实现原则。

英文完整规范：

1. [API Contract (Hard)](/public/en/api/01-api-contract)

## 设计目标

这些约束用于避免以下问题：

1. 通过 embedding 误泄漏数据。
2. 响应体无限膨胀（token/带宽/客户端内存）。
3. 子图扩展后出现契约回归。

## 三条硬规则（A/B/C）

1. 产品边界：默认不返回 embeddings；调试预览必须走受限通道。
2. 契约边界：响应必须通过 DTO 白名单，避免意外字段外泄。
3. 查询边界：数据库查询默认不取 embedding，除非显式 debug 且有上限。

## 租户隔离（Tenant Isolation）

1. 关键隔离键为 `(tenant_id, scope)`。
2. `tenant_id` 支持 body 显式传入，也支持 `X-Tenant-Id` 兜底。
3. `tenant_id=default` 保持历史单租户行为兼容。
4. `scope` 不允许为空，且不能以保留前缀 `tenant:` 开头。

## 鉴权模式（Auth）

1. `MEMORY_AUTH_MODE=api_key`：所有 `/v1/memory/*` 需 `X-Api-Key`。
2. `MEMORY_AUTH_MODE=jwt`：使用 `Authorization: Bearer <jwt>`。
3. `MEMORY_AUTH_MODE=api_key_or_jwt`：任一凭证有效即可通过。
4. 生产环境建议 JWT 必须包含 `exp`，并结合 `iss/aud` 做网关侧校验。

## 配额与限流（Tenant Quota）

开启 `TENANT_QUOTA_ENABLED=true` 后，按租户分别限制：

1. recall 速率。
2. write 类接口速率。
3. debug embedding 速率。

超限返回 `429`，并包含 `retry-after`。

## 能力降级契约（Capability Fallback）

1. 能力关闭场景可返回 `501 backend_capability_unsupported`。
2. 可降级子路径必须显式返回 `degraded_mode` 与 `fallback_applied`。
3. 严格模式下 shadow mirror 失败返回 `500 shadow_dual_write_strict_failure`。

## 核心端点（最常用）

1. `POST /v1/memory/write`：写入 SoR 提交链，返回 `commit_id/commit_uri`。
2. `POST /v1/memory/recall`：结构化召回。
3. `POST /v1/memory/recall_text`：文本召回。
4. `POST /v1/memory/resolve`：URI 统一解析（node/edge/commit/decision）。
5. `POST /v1/memory/tools/select`：工具选择。
6. `POST /v1/memory/tools/decision`：决策记录。
7. `POST /v1/memory/tools/run`：运行生命周期查询。
8. `POST /v1/memory/tools/feedback`：反馈闭环。
9. `POST /v1/memory/sandbox/sessions`：创建 Sandbox 会话。
10. `POST /v1/memory/sandbox/execute`：提交 Sandbox 执行。
11. `POST /v1/memory/sandbox/runs/get`：查询执行状态。
12. `POST /v1/memory/sandbox/runs/logs`：查看执行日志。
13. `POST /v1/memory/sandbox/runs/artifact`：获取执行产物与可选 bundle 指针。
14. `POST /v1/memory/sandbox/runs/cancel`：取消排队/运行中的任务。

## 写入契约防误用

1. `input_text` 本身不会自动创建记忆节点。
2. 要让召回可见，写入请求必须包含 `nodes`（例如 `event` 节点）。
3. 当 `/v1/memory/write` 最终 `nodes=0` 时，响应可能返回：
   - `warnings: [{ code: "write_no_nodes", ... }]`
4. 可选严格模式：
   - `MEMORY_WRITE_REQUIRE_NODES=true` 时，空 `nodes` 会直接返回 `400 write_nodes_required`。

## 上线前最小检查

1. 用真实 `tenant_id/scope` 跑通 `write -> recall_text -> resolve`。
2. 验证鉴权模式与预期一致（api_key / jwt / or）。
3. 验证私有 lane 可见性：无身份字段时 private 数据必须被过滤。
4. 验证超限返回是否稳定且带 `retry-after`。
