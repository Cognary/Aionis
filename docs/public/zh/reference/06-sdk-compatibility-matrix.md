---
title: "SDK 兼容矩阵"
---

# SDK 兼容矩阵

最后更新：`2026-03-14`

## 版本策略

1. SDK 版本遵循 SemVer。
2. 合同级 breaking change 需要 major version 对齐。
3. 新增可选字段或新 helper 走 minor version。
4. 纯实现修复走 patch version。

## 矩阵

| SDK | 当前版本线 | API 合同基线 | 覆盖范围 | 错误模型 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `@aionis/sdk` (TypeScript) | `0.2.x` | `/public/zh/api-reference/00-api-reference` | memory、context、handoff、policy loop、replay、sandbox、automations、Phase 1 CLI | typed API/network errors | current |
| `aionis-sdk` (Python) | `0.2.x` | `/public/zh/api-reference/00-api-reference` | memory、context、handoff、policy loop、replay、sandbox、automations | typed API/network errors | current |

## 兼容说明

1. SDK `0.2.x` 预期服务端返回结构化错误：`error/message/details`。
2. SDK `0.2.x` 预期返回 `x-request-id` 关联头。
3. `recall_text` 在 embeddings 未启用时可能返回 `no_embedding_provider`。
4. 在 `2026-03-14`，Aionis 对 `65` 条非 admin、非 control-plane 路由做了 route-to-SDK 审计，结果是两套 SDK 都 `no missing`。
5. TypeScript 包额外提供本地 Lite 开发 CLI：`aionis dev`、`stop`、`health`、`doctor`、`selfcheck`。

## 发布对齐检查

1. 两套 SDK 的 build 和 package 检查都通过。
2. SDK smoke tests 能对齐当前服务端基线。
3. 发布前更新 changelog。
4. 发布时同步更新这张矩阵。

## 相关文档

1. [SDK 指南](/public/zh/reference/05-sdk)
2. [SDK CLI](/public/zh/reference/09-sdk-cli)
3. [API 参考](/public/zh/api-reference/00-api-reference)
