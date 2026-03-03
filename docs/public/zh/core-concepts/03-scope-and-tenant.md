---
title: "租户与作用域隔离"
---

# 租户与作用域隔离

Aionis 基于 `(tenant_id, scope)` 做隔离，并在写入、召回、策略路径统一执行。

## 隔离层

| 层级 | 边界 | 结果 |
| --- | --- | --- |
| Tenant | 组织级分区 | 防止跨租户泄露 |
| Scope | 工作负载/环境分区 | 记忆上下文独立 |
| Lane 可见性 | 身份绑定私有访问 | 按 agent/team 控制可见 |

## 隔离保障

1. 写入与召回都按 tenant/scope 分区。
2. 私有 lane 读取需 owner 身份匹配。
3. 策略评估限定在当前隔离边界。
4. 可按租户执行配额与控制策略。

## 推荐作用域策略

1. 按业务域或环境拆 scope（如 `prod`、`staging`）。
2. 测试数据与生产流量分离。
3. 不同团队避免共享可变运维 scope。
4. SDK 与 API 客户端统一 scope 命名。

## 接入检查项

1. 每次请求显式传 `tenant_id`、`scope`。
2. 私有 lane 场景补齐身份字段。
3. 发布前回归测试验证隔离。
4. 监控跨 scope/tenant 漂移信号。

## 相关页面

1. [API 合约](/public/zh/api/01-api-contract)
2. [运维与生产](/public/zh/operate-production/00-operate-production)
3. [Planner 上下文](/public/zh/reference/02-planner-context)
