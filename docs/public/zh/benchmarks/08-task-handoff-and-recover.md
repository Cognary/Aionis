---
title: "Task Handoff 与 Recover 语义"
---

# Task Handoff 与 Recover 语义

最后更新：`2026-03-13`

这页记录了 Aionis handoff 的两个增量升级：

1. `repo_root` 已经成为 recover 的正式判别维度。
2. `task_handoff` 不再强制要求 `file_path`。

这两点重要，是因为 Aionis 不应该只服务于代码补丁交接。它还应该支持审批、浏览器任务、事故处理等非文件中心的执行合同。

## 对外可讲的结论

### 1. `repo_root` 现在已经进入 recover 匹配

Aionis 的 `handoff/recover` 现在可以按 `repo_root` 做判别，而不只是依赖：

1. `anchor`
2. `file_path`
3. `symbol`

这修掉了共享 scope 下的一个正确性问题：多个 repo 或 workspace 里，如果出现同名 anchor/file path，recover 以前可能取到“最新但错误”的 contract。

### 2. `task_handoff` 现在可以不依赖 `file_path`

Aionis 现在允许非文件中心的 handoff contract 走原生 handoff 路由和 MCP/dev tool 表面。

这意味着同一套 handoff 模型现在可以用于：

1. 部署审批
2. 浏览器 checkout 接棒
3. 事故升级流程
4. 其他不以单个代码文件为中心的执行合同

## 受控 Cross-Process Task Handoff Benchmark

环境：

1. `planner`：独立进程
2. `executor`：独立进程
3. `reviewer`：独立进程
4. baseline transport：有损 `file_export`
5. treatment transport：`aionis_handoff`
6. case family：非文件中心 `task_handoff`

Case：

1. 部署审批 continuation
2. 浏览器 checkout confirmation
3. 事故升级 continuation

结果：

| Transport | Cases | Success rate | Avg quality score | Avg store ms | Avg recover ms |
| --- | --- | --- | --- | --- | --- |
| `file_export` | `3` | `0%` | `0.3730` | `0` | `0` |
| `aionis_handoff` | `3` | `100%` | `1.0000` | `28.33` | `10.0` |

解读：

1. 有损 baseline 只保住了 summary 文本，但丢掉了 `next_action`、`must_keep` 这类执行关键字段。
2. 原生 `task_handoff` 可以跨进程保住这些字段。
3. 这说明 Aionis handoff 不只是代码补丁交接物，而是一种外部化 execution contract。

## 如何复现

### 前置条件

1. 本地可访问的 Aionis Lite
2. 配套实验目录：
   `aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench`
3. Python `3.9+`
4. `uv`

### 环境准备

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
uv venv
source .venv/bin/activate
uv pip install -e .
```

### 跑 baseline

```bash
python -m cross_boundary_aionis_bench.task_handoff_bench run \
  --transport file_export
```

### 跑 Aionis treatment

```bash
python -m cross_boundary_aionis_bench.task_handoff_bench run \
  --transport aionis_handoff \
  --aionis-base-url http://127.0.0.1:3321
```

## Artifact 路径

这页用到的数据来自：

1. baseline：
   `experiments/cross-boundary-aionis-bench/artifacts/task-handoff-file_export-20260313-191019/`
2. treatment：
   `experiments/cross-boundary-aionis-bench/artifacts/task-handoff-aionis_handoff-20260313-191021/`

## 为什么这很重要

1. `repo_root` 让共享 scope 下的 recover 更安全。
2. `task_handoff` 让 Aionis 不再被 file-centric schema 锁死。
3. Aionis 现在可以外部化非文件中心的执行合同，而不是强行把所有交接都包装成代码文件 patch。

## Related

1. [Agent Handoff 与 Replay](/public/zh/benchmarks/07-agent-handoff-and-replay)
2. [差异化证据](/public/zh/benchmarks/03-differentiation-evidence)
