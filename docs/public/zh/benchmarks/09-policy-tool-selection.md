---
title: "Policy 工具选择与反馈闭环"
---

# Policy 工具选择与反馈闭环

这一页记录 Aionis policy 当前已经成立的公开证据：

1. ACTIVE 规则可以改变工具选择，
2. SHADOW 规则可见但不强制执行，
3. policy loop 相比 retrieval-only 的选择方式有可测提升，
4. decision 和 feedback 可以端到端追踪。

## 这组基准在证明什么

这组测试不是在证明普通 recall。

它证明的是 Aionis policy 是否真的可以：

1. 激活规则，
2. 改变工具路由，
3. 保留 shadow 规则作为预览层，
4. 将后续 feedback 正确挂回 decision 链路。

## 环境

1. Aionis Lite
2. 本地 SQLite write store
3. XMB benchmark harness
4. 相关接口：
   - `/v1/memory/rules/state`
   - `/v1/memory/tools/select`
   - `/v1/memory/tools/decision`
   - `/v1/memory/tools/feedback`

## 证据

### XMB-005：ACTIVE 规则改变工具选择

观测结果：

1. rule write：`200`
2. ACTIVE 状态更新：`200`
3. SHADOW 状态更新：`200`
4. tools/select：`200`
5. selected tool：`curl`
6. denied tools：`bash`
7. shadow-selected tool：`bash`
8. explain 字段存在：`true`

解读：

1. ACTIVE policy 已经能把最终工具从冲突候选改成 `curl`
2. SHADOW policy 仍然只作为可见但非强制的预览层
3. 返回结果保留了解释信息，而不是只返回一个最终工具名

### XMB-006：policy loop vs retrieval-only heuristic

Episodes：`20`

Baseline：

1. method：`retrieval_only_first_candidate`
2. success rate：`0.5`
3. success count：`10`
4. selection switches：`19`
5. unique selected tools：`2`
6. second-step curl success rate：`0.0`
7. decision trace rate：`0.0`

Policy loop：

1. method：`rules_tools_select_feedback`
2. success rate：`1.0`
3. success count：`20`
4. selection switches：`0`
5. unique selected tools：`1`
6. second-step curl success rate：`1.0`
7. source rule coverage：`1.0`
8. explain coverage：`1.0`
9. feedback link coverage：`1.0`
10. feedback status coverage：`1.0`
11. decision id coverage：`1.0`
12. decision readback coverage：`1.0`

Delta：

1. success rate gain：`+0.5`
2. selection switch reduction：`19`
3. second-step curl success gain：`+1.0`

解读：

1. retrieval-only 选择方式在 episode 间会持续漂移
2. policy 驱动的选择方式稳定收敛到了预期工具
3. 从 rule activation 到 decision trace 到 feedback attribution 的闭环已经可观测

## 为什么这很重要

这组结果说明 Aionis policy 不是普通 recall，也不是简单摘要。

它会直接影响：

1. 工具路由，
2. 行为稳定性，
3. 可控性，
4. 运行后的反馈归因。

这才是“policy loop 成立”的最低标准。

## 复现方法

启动 Lite：

```bash
cd /Users/lucio/Desktop/Aionis

PORT=3331 \
AIONIS_MODE=local \
MEMORY_AUTH_MODE=off \
TENANT_QUOTA_ENABLED=false \
RATE_LIMIT_BYPASS_LOOPBACK=true \
LITE_WRITE_SQLITE_PATH=/tmp/aionis-policy-xmb-3331/write.sqlite \
LITE_REPLAY_SQLITE_PATH=/tmp/aionis-policy-xmb-3331/replay.sqlite \
bash scripts/start-lite.sh
```

执行 policy benchmark：

```bash
python3 /Users/lucio/Desktop/Aionis/aionis-bench/harness/run_xmb.py \
  --base-url http://127.0.0.1:3331 \
  --scope-prefix policybench \
  --out-file /tmp/aionis-policy-xmb-3331/xmb.json
```

查看结果：

```bash
cat /tmp/aionis-policy-xmb-3331/xmb.json
```

## 结果边界

这组 benchmark 当前证明的是：

1. Lite 下的规则激活已经可用
2. ACTIVE policy 会改变工具选择
3. SHADOW policy 保持为非强制预览层
4. policy feedback 和 decision readback 已经联通

它还不证明：

1. 所有 agent 的全局最优 policy
2. token 降低
3. replay 性能

这些属于其他 benchmark 页面。
