---
title: "真实 GitHub 仓库 Policy A/B"
---

# 真实 GitHub 仓库 Policy A/B

这一页记录一组基于真实 GitHub 仓库的 policy benchmark。

它要证明的不是泛泛的任务成功，而是：Aionis policy 是否能在真实仓库里改变工具路由，并把执行限制在更聚焦的工具路径上。

## 仓库

1. repo：`pallets/click`
2. commit：`cdab890e57a30a9f437b88ce9652f7bfce980c1f`

## 测试设计

每个 case 都在同一个真实仓库快照上跑两种条件：

1. `without Aionis policy`
   - 搜索使用 `grep`
   - 测试执行使用 `pytest-all`
2. `with Aionis policy`
   - ACTIVE rule 偏好 `rg`
   - ACTIVE rule 偏好 `pytest-focused`

所有 case 使用相同的仓库、相同的目标范围、相同的 focused 验收目标。

## Cases

1. parser/options scope
2. parser/shell completion scope
3. testing/termui scope

## 结果

Artifacts：

1. 汇总：
   - `/Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-policy-ab-20260313-201800/summary.json`
2. 逐 case 明细：
   - `/Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench/artifacts/cross-boundary-real-repo-policy-ab-20260313-201800/cases.jsonl`

Baseline：

1. success rate：`0.0`
2. avg duration：`6720.0 ms`
3. expected search tool rate：`0.0`
4. expected test tool rate：`0.0`

Treatment：

1. success rate：`1.0`
2. avg duration：`2136.0 ms`
3. expected search tool rate：`1.0`
4. expected test tool rate：`1.0`
5. avg rule write：`64.67 ms`
6. avg rule activate：`11.33 ms`
7. avg search select：`21.0 ms`
8. avg test select：`8.33 ms`

## 这组数据说明什么

这组 benchmark 证明了：

1. Aionis policy 可以在真实 GitHub 仓库上改变工具选择
2. policy 路径把执行限制在更聚焦的工具路径上：
   - `rg`
   - `pytest-focused`
3. 没有 policy 的基线会漂到更宽的工具路径：
   - `grep`
   - `pytest-all`
4. 差异不只是可观测的工具选择变化，也直接反映在端到端任务结果上

## 为什么这很重要

这比合成 selector demo 更强。

它说明 Aionis policy 不只是抽象规则层，而是可以在真实仓库工作流里约束工具路由，让 agent 保持在更窄、更便宜、也更贴近任务的执行路径上。

## 复现

启动 Lite：

```bash
cd /Users/lucio/Desktop/Aionis

PORT=3338 \
AIONIS_EDITION=lite \
AIONIS_MODE=local \
MEMORY_AUTH_MODE=off \
TENANT_QUOTA_ENABLED=false \
RATE_LIMIT_BYPASS_LOOPBACK=true \
LITE_WRITE_SQLITE_PATH=/tmp/aionis-policy-realrepo-3338/write.sqlite \
LITE_REPLAY_SQLITE_PATH=/tmp/aionis-policy-realrepo-3338/replay.sqlite \
bash scripts/start-lite.sh
```

运行 benchmark：

```bash
cd /Users/lucio/Desktop/aionis-openclaw-plugin/experiments/cross-boundary-aionis-bench
. .venv/bin/activate

export REAL_REPO_PYTHON=/Users/lucio/.local/share/uv/python/cpython-3.10.19-macos-aarch64-none/bin/python3.10

python -m cross_boundary_aionis_bench.cli real-repo-policy-ab \
  --aionis-base-url http://127.0.0.1:3338
```

## 结果边界

这组 benchmark 当前证明的是：

1. ACTIVE policy 能改变真实仓库任务中的工具路由
2. focused search 和 focused pytest 路径可以被强制出来
3. policy 会影响 GitHub 代码任务的真实执行结果

它还不证明：

1. 所有仓库上的全局最优 policy
2. 所有任务形态下都一定降 token
3. replay 行为
