---
title: "差异化证据"
---

# 差异化证据

本页说明如何证明 Aionis 相比“仅检索记忆”方案的差异化优势。

## 待验证主张

1. 在启用 policy loop 时任务成功率更高
2. 重复运行稳定性更好
3. 通过可追溯决策与反馈链实现更强可控性

## Benchmark 方法

运行 Aionis 基准套件（XMB 场景）：

```bash
npm run -s bench:aionis:v01 -- --suites xmb
```

核心产物：

1. `details.json`
2. `summary.json`
3. `report.md`

## 关键指标

1. `success_rate_gain`
2. `selection_switch_reduction`
3. `feedback_link_coverage`
4. `source_rule_coverage`

解读方式：

1. 成功率增益为正，说明 policy loop 有效
2. 切换次数降低，说明稳定性提升
3. 覆盖率高，说明治理与回放可见性更强

## 周证据包

```bash
npm run -s evidence:weekly -- --scope default --window-hours 168 --strict
```

证据包重点：

1. 治理周报（`governance_weekly/summary.json`）
2. 执行闭环 gate 输出（`raw/execution_loop_gate.json`）
3. sandbox 探针产物（`raw/sandbox_api_probe.json`）
4. benchmark 摘要与报告（`bench_xmb/summary.json`, `bench_xmb/report.md`）

## 相关页面

1. [Benchmark 快照（公开版）](/public/zh/benchmarks/02-benchmark-snapshot-public)
2. [治理周报](/public/zh/benchmarks/04-governance-weekly-report)
3. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
