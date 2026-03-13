---
title: "真实 GitHub 仓库 Handoff A/B"
---

# 真实 GitHub 仓库 Handoff A/B

最后更新：`2026-03-13`

这一页记录的是同一个真实 GitHub 仓库上的 handoff A/B。

目标很简单：

1. 仓库固定，
2. commit 固定，
3. 任务固定，
4. 对比 `without Aionis` 和 `with Aionis`。

## 范围说明

仓库：

1. URL：`https://github.com/pallets/click.git`
2. Commit：`cdab890e57a30a9f437b88ce9652f7bfce980c1f`

Cases：

1. `click_real_repo_001`
2. `click_real_repo_002`
3. `click_real_repo_003`

对照方式：

1. baseline transport：`file_export`
2. treatment transport：`aionis_handoff`

这组 benchmark 证明的是外部化 execution contract 的质量，不是 replay。

## 可公开主张

在同一个真实 GitHub 仓库、同一个 commit、同一组任务下：

1. lossy `file_export` 只能保住部分 repo/test scope，
2. `aionis_handoff` 能保住完整 execution contract，
3. 差异不是 prompt 运气，而是 contract 完整度差异。

## 结果

| Arm | Cases | Success rate | Avg duration ms | Avg focused files | Avg pytest targets |
| --- | --- | --- | --- | --- | --- |
| `file_export` | `3` | `0.0%` | `11841.0` | `1.0` | `1.0` |
| `aionis_handoff` | `3` | `100.0%` | `12033.0` | `4.0` | `2.0` |

解读：

1. baseline 看起来稍快，只是因为它做的事情更少：平均只保住了 `1` 个文件和 `1` 个 pytest target。
2. Aionis handoff 保住了多文件 target set 和完整测试范围。
3. 这组 benchmark 的关键结论不是“更快”，而是“contract 更完整”。

## Case 级模式

### `click_real_repo_001`

Baseline：

1. focused files：`1`
2. pytest targets：`1`
3. 只保住了 `src/click/parser.py`
4. `src/click/core.py`、`tests/test_parser.py`、`tests/test_options.py` 都丢了

Treatment：

1. focused files：`4`
2. pytest targets：`2`
3. 所有预期的文件和测试 marker 都被保住了

同样的丢失模式也出现在：

1. `click_real_repo_002`
2. `click_real_repo_003`

## 为什么这很重要

这组 benchmark 不是在泛泛证明“memory 有帮助”。

它回答的是：

**外部化 contract 能不能保住下一个 agent 阶段真正需要的 repo 范围和测试范围？**

在这组实验里：

1. 弱导出 note 做不到，
2. Aionis handoff 做到了。

这才是这组结果真正的价值。

## 如何复现

### 前置条件

1. 本地 Aionis Lite endpoint
2. 配套实验目录：
   `/Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench`
3. Python `>=3.10`

如果机器默认 `python3` 过旧，先设置：

```bash
export REAL_REPO_PYTHON=/Users/lucio/.local/share/uv/python/cpython-3.10.19-macos-aarch64-none/bin/python3.10
```

### 执行

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
source .venv/bin/activate

python -m cross_boundary_aionis_bench.cli real-repo-handoff-ab \
  --aionis-base-url http://127.0.0.1:3321 \
  --case-id click_real_repo_001 \
  --case-id click_real_repo_002 \
  --case-id click_real_repo_003
```

## Artifact 路径

主要 disclosure artifacts：

1. run 目录：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/`
2. manual summary：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/manual-summary.json`
3. manual case details：
   `experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-handoff-ab-20260313-195606/manual-cases.json`

## 结果边界

这组 benchmark 当前证明的是：

1. Aionis handoff 比 lossy exported baseline 更能保住真实 repo 的 execution scope。
2. 差异直接体现在 file coverage 和 test-target coverage 上。
3. 外部化 execution contract 会实质改变同一真实仓库任务的成功率。

它还不证明：

1. replay 性能，
2. policy loop 行为，
3. 相对所有 framework-native state system 的普遍优势。
