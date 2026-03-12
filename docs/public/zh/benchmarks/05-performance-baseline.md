---
title: "性能基线"
---

# 性能基线

本页定义 Aionis 的可复现性能与优化基线流程。

如果你想复现实验，或者自己生成一份证据包，就从这页开始。

## 这页的作用

这页不只是测原始延迟，它还是公开证据背后的执行配方，用来支持：

1. 基线 API 性能
2. context optimization 行为
3. replay optimization 行为
4. summary-first execution 行为
5. recall profile 对比与 selector rollout 判断

## 测什么

1. Recall 延迟（`p50/p95/p99`）
2. Write 延迟（`p50/p95/p99`）
3. 分接口错误率
4. 可选 worker 吞吐
5. 可选上下文优化信号（`context/assemble` baseline vs optimized）
6. 可选 replay 优化信号（`playbooks/candidate` + `playbooks/dispatch`）
7. 可选 summary-first sandbox 信号（`sandbox/execute` + `runs/get|logs|artifact`）
8. 可选 ANN stage1 profile 对比信号（支持按 query 和 workload class 拆分）

## 前置条件

```bash
set -a; source .env; set +a
make db-migrate
```

启动 API 和 worker：

```bash
npm run dev
npm run job:outbox-worker
```

## Seed 基准数据集

```bash
npm run job:perf-seed -- \
  --scope perf \
  --tenant-id default \
  --src-scope default \
  --src-tenant-id default \
  --events 100000 \
  --topics 1000 \
  --reset
```

## 跑基准

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode all
```

或者直接跑矩阵：

```bash
npm run perf:production-matrix
```

## 上下文优化证据

请求级 opt-in：

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --optimization-check true \
  --optimization-profile aggressive \
  --optimization-request-mode explicit \
  --optimization-samples 12
```

评估 endpoint-default rollout：

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --optimization-check true \
  --optimization-profile aggressive \
  --optimization-request-mode inherit_default \
  --optimization-samples 12
```

这要求 API 已经带上类似下面的 endpoint 默认值：

1. `MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT`
2. `MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT`

评估 endpoint-default rollout gate：

```bash
npm run job:perf-context-rollout-gate -- \
  --benchmark-files-json '["/path/to/context_opt_default_a/benchmark_1.json","/path/to/context_opt_default_b/benchmark_1.json"]'
```

如果 gate 通过，对应的本地 env helper 是：

```bash
npm run -s env:context-optimization:aggressive-endpoint-defaults
```

这个建议比“全局默认”更窄，只适用于已经评估过的 context endpoint。

## Recall Selector 证据

单进程 selector-vs-static 对比：

```bash
npm run job:perf-benchmark -- \
  --base-url "http://localhost:${PORT:-3001}" \
  --scope perf \
  --tenant-id default \
  --mode recall \
  --ann-selector-check true \
  --ann-query-spec-file /Users/lucio/Desktop/Aionis/src/jobs/fixtures/ann-query-taxonomy-v1.json \
  --ann-samples 6
```

聚合多轮 selector compare：

```bash
npm run job:perf-selector-aggregate -- \
  --dirs-json '["/path/to/ann_selector_compare_v1","/path/to/ann_selector_compare_v2","/path/to/ann_selector_compare_v3"]'
```

判断 selector 是否适合默认 rollout：

```bash
npm run job:perf-selector-rollout-gate -- \
  --aggregate-json /path/to/SELECTOR_COMPARE_AGGREGATE.json
```

如果这个 gate 失败，就继续把 selector 保持在实验态，优先使用显式 opt-in 策略模式，例如 `recall_mode="dense_edge"`。

## 输出字段

1. `latency_ms.p50/p95/p99`
2. `rps`
3. `failed`
4. `by_status`
5. 可选 `optimization.summary.*`
6. 可选 `replay.*`
7. 可选 `sandbox.*`
8. 可选 `ann.*`

## 产物目录

`artifacts/perf/<run_id>/`

## 如何读结果

建议按三层看：

1. `latency_ms` 和 `failed`：看基础性能
2. `optimization.summary.*`、`replay.*`、`sandbox.*`：看成本感知行为
3. `ann.*`：看 recall profile 和 selector 策略判断

## 相关页面

1. [基准测试](/public/zh/benchmarks/01-benchmarks)
2. [公开基准快照](./02-benchmark-snapshot-public.md)
3. [差异化证据](./03-differentiation-evidence.md)
4. [AionisBench v0.1](./06-aionis-bench-v01.md)
