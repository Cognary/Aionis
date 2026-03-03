---
title: "Sandbox API（实验）"
---

# Sandbox API（实验）

Sandbox 提供受控执行面，可与策略闭环追踪字段关联（`planner_run_id`、`decision_id`）。

当前状态：实验功能，默认关闭。

## 启用方式

必要环境变量：

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_EXECUTOR_MODE=mock|local_process`
3. `SANDBOX_ALLOWED_COMMANDS_JSON=["echo","python3", ...]`

可选流量控制：

1. `SANDBOX_WRITE_RATE_LIMIT_RPS` / `SANDBOX_WRITE_RATE_LIMIT_BURST`
2. `SANDBOX_READ_RATE_LIMIT_RPS` / `SANDBOX_READ_RATE_LIMIT_BURST`

生产环境建议：

1. 保持 `SANDBOX_ADMIN_ONLY=true`。
2. 对外开放前优先接入独立执行平面（容器/VM 隔离）。
3. 命令白名单保持最小且显式。

## 接口列表

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/cancel`

## 最小流程

1. 创建 sandbox session。
2. 提交一次执行请求（`mode=sync` 或 `mode=async`）。
3. 查询 run 状态。
4. 拉取 run 日志。
5. 如需停止，调用 cancel（仅 queued/running 生效）。

## 请求说明

执行请求结构：

```json
{
  "session_id": "<uuid>",
  "mode": "sync",
  "action": {
    "kind": "command",
    "argv": ["echo", "hello"]
  },
  "planner_run_id": "run_xxx",
  "decision_id": "<uuid>"
}
```

约束：

1. 当前仅支持 `action.kind=command`。
2. 使用 `local_process` 时，`argv[0]` 必须在 `SANDBOX_ALLOWED_COMMANDS_JSON` 内。
3. `timeout_ms` 会被服务端上限约束。

## 安全边界

1. Sandbox API 不能替代宿主机/容器隔离策略。
2. `local_process` 仅适用于受控环境与验证阶段。
3. 不要在 `argv` 放入敏感凭据；仅持久化必要元数据。

## 可观测信号

Sandbox 运行数据会汇总到租户诊断接口 `GET /v1/admin/control/diagnostics/tenant/:tenant_id` 的 `diagnostics.sandbox` 字段。

当前聚合包含：

1. 吞吐与状态分布（`total`、`by_status`、`by_mode`）
2. 延迟分布（`queue_wait_p50/p95`、`runtime_p50/p95`、`total_latency_p95`）
3. 稳定性指标（`timeout_rate`、`cancel_rate`、`output_truncated_rate`）
4. 高发错误分类（`top_errors`）

## 压测命令（快速）

可直接运行队列/超时压测脚本：

```bash
npm run -s bench:sandbox:stress
```

可用环境变量：

1. `SANDBOX_STRESS_RUNS`
2. `SANDBOX_STRESS_CONCURRENCY`
3. `SANDBOX_STRESS_POLL_INTERVAL_MS`
4. `SANDBOX_STRESS_POLL_TIMEOUT_MS`

## 相关页面

1. [Planner Context](/public/zh/reference/02-planner-context)
2. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
3. [API 参考](/public/zh/api-reference/00-api-reference)
