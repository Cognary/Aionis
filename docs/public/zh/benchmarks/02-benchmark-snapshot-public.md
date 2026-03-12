---
title: "Benchmark Snapshot（对外）"
---

# Benchmark Snapshot（对外）

这页是 Aionis 当前公开 benchmark 的摘要快照。

## 适用范围

当前快照只覆盖可复现、已文档化的 runs：

1. API 性能（`write` / `recall`）
2. policy loop 效果（`XMB-006`）
3. 同一批运行家族里的治理证据产物

不代表：

1. 任意硬件或网络环境下的通用性能结论
2. 无约束 autonomous training
3. 所有模型、所有规模、所有部署形态的统一结果

## 当前快照值

### 性能（100k events profile）

| 指标 | 值 |
| --- | --- |
| Recall p95 | `51.42 ms` |
| Recall p99 | `61.16 ms` |
| Write p95 | `182.5 ms` |
| Write p99 | `240.2 ms` |
| Recall failure rate | `0%` |
| Write failure rate | `0%` |

### Policy Loop（`XMB-006`）

| 指标 | Retrieval baseline | Policy loop | Delta |
| --- | --- | --- | --- |
| Success rate | `0.50` | `1.00` | `+0.50` |
| Selection switches | `19` | `0` | `-19` |
| Feedback link coverage | `n/a` | `1.00` | `+1.00` |
| Source rule coverage | `n/a` | `1.00` | `+1.00` |

## 环境参数

1. `PERF_PROFILE=perf_gate`
2. `SCALES=100000`
3. `tenant_id=default`
4. benchmark API base URL 指向本地测试 endpoint
5. evidence window 为 `168` 小时

## 如何复现

### 性能

```bash
PERF_PROFILE=perf_gate SCALES=100000 npm run -s perf:production-matrix
```

### 证据包

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

## 产物路径

1. `artifacts/perf/<run_id>/`
2. `artifacts/evidence/weekly/<report_week>_<run_id>/`
3. `artifacts/aionisbench/runs/<run_id>/`

## 相关页面

1. [性能基线](/public/zh/benchmarks/05-performance-baseline)
2. [AionisBench v0.1](/public/zh/benchmarks/06-aionis-bench-v01)
3. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
