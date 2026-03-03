---
title: "治理周报"
---

# 治理周报

该报告用于输出生产治理信号的周级快照，支持发布评审与连续运营跟踪。

## 目的

1. 跟踪决策与反馈关联质量
2. 跟踪召回身份与作用域卫生
3. 跟踪跨租户漂移信号
4. 生成发布友好的 JSON/Markdown 产物

## 命令

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168
```

发布严格模式：

```bash
npm run -s job:governance-weekly-report -- --scope default --window-hours 168 --strict-warnings
```

## 输出

1. `summary.json`
2. `WEEKLY_STATUS.md`

默认输出目录：

`artifacts/governance/weekly/<report_week>_<run_id>/`

## 核心指标

1. 决策关联覆盖率（decision link coverage）
2. 召回身份覆盖率（recall identity coverage）
3. 私有条目 owner 覆盖率（lane owner coverage）
4. 跨租户 active rule 漂移
5. 跨租户 negative ratio 漂移
6. sandbox 失败分类（`scope_snapshot.sandbox.top_errors`）
7. sandbox 超时/失败/截断率

## Sandbox 治理信号

当存在 `memory_sandbox_run_telemetry` 表时，周报会包含：

1. `scope_snapshot.sandbox`（比率 + p95 延迟）
2. gate 检查：
 - `scope_sandbox_failure_rate_max`
 - `scope_sandbox_timeout_rate_max`
 - `scope_sandbox_output_truncated_rate_max`
3. 基于错误桶（top errors）的建议项

可选阈值参数：

```bash
npm run -s job:governance-weekly-report -- \
  --scope default \
  --window-hours 168 \
  --min-sandbox-runs-for-gate 10 \
  --max-sandbox-failure-rate 0.2 \
  --max-sandbox-timeout-rate 0.1 \
  --max-sandbox-output-truncated-rate 0.2
```

## 相关页面

1. [差异化证据包](/public/zh/benchmarks/03-differentiation-evidence)
2. [运维与生产](/public/zh/operate-production/00-operate-production)
