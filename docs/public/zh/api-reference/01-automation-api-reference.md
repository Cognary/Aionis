---
title: "Automation API 参考"
---

# Automation API 参考

本页给出面向 public beta 的 Automation API 范围。

Automation 是建立在 replay 之上的薄编排层，不是通用 workflow engine。

## 认证

Automation 路由与 memory 面共用认证方式：

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

仅在 alert/control 等管理面路由上使用 `X-Admin-Token`。

## 定义与校验

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`

## Run 生命周期

1. `POST /v1/automations/run`
2. `POST /v1/automations/runs/get`
3. `POST /v1/automations/runs/list`
4. `POST /v1/automations/runs/cancel`
5. `POST /v1/automations/runs/resume`

## 审核与修复控制

1. `POST /v1/automations/runs/approve_repair`
2. `POST /v1/automations/runs/reject_repair`
3. `POST /v1/automations/runs/assign_reviewer`
4. `POST /v1/automations/assign_reviewer`

## Promotion 与 Shadow

1. `POST /v1/automations/promote`
2. `POST /v1/automations/shadow/report`
3. `POST /v1/automations/shadow/validate`
4. `POST /v1/automations/shadow/validate/dispatch`

## Compensation

1. `POST /v1/automations/runs/compensation/retry`
2. `POST /v1/automations/runs/compensation/record_action`
3. `POST /v1/automations/runs/compensation/assign`
4. `POST /v1/automations/compensation/policy_matrix`

## Telemetry

1. `POST /v1/automations/telemetry`

## Run 模式

支持的模式：

1. 默认执行：仅对 `active` 版本
2. 显式 `execution_mode=shadow`：仅对 `shadow` 版本

public beta 限制：

1. 不支持并行调度
2. 不支持失败分支
3. automation 仍然是顺序、replay-backed 的薄编排层

## 关键状态语义

优先读取：

1. `lifecycle_state`
2. `pause_reason`
3. `terminal_outcome`
4. `status_summary` 仅用于 UI

示例：

1. repair 待审核：
   `lifecycle_state=paused`，`pause_reason=repair_required`
2. 已补偿失败：
   `lifecycle_state=terminal`，`terminal_outcome=failed_compensated`

## Public Beta 边界

1. `shadow` 版本不能通过普通 `run` 直接执行
2. `shadow -> active` promotion 必须先有 approved shadow review
3. Marketplace 发布与安装不在此次 public beta 承诺内

## 相关页面

1. [API 参考](/public/zh/api-reference/00-api-reference)
2. [Operator Runbook](/public/zh/operations/02-operator-runbook)
3. [Production Go-Live Gate](/public/zh/operations/04-prod-go-live-gate)
