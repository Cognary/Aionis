---
title: "E2E 回归清单"
---

# E2E 回归清单

该清单用于发布前验证 Aionis 的完整产品闭环。

## 前置条件

1. 目标 API 健康可用。
2. 测试 tenant/scope 已隔离。
3. 已准备可用鉴权凭据。

设置变量：

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"
```

## 回归流程

1. **Write** 写入记忆：

```bash
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","input_text":"regression sample"}' | jq
```

2. **Recall** 召回上下文：

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"regression sample","limit":5}' | jq
```

3. **Assemble** 分层上下文装配：

```bash
curl -sS "$BASE_URL/v1/memory/context/assemble" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","query_text":"support case","char_budget_total":1200}' | jq
```

4. **Policy path** 规则路径：

```bash
curl -sS "$BASE_URL/v1/memory/rules/evaluate" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{"tenant_id":"default","scope":"default","run_id":"regression-run-1","context":{"intent":"support_triage"}}' | jq
```

5. **Core gate**：

```bash
npm run -s gate:core:prod -- --base-url "$BASE_URL" --scope default
```

6. **Replay-learning 故障分类 smoke**：

```bash
npm run -s e2e:replay-learning-fault-smoke
```

预期：

1. 注入 `fatal_error` 的路径进入失败态/死信（`failed_reason` 有值）。
2. 注入 `retryable_error` 的路径保持可重试（`failed=false`、`published=false`、`last_error` 有值）。

7. **Replay-learning retention smoke**：

```bash
npm run -s e2e:replay-learning-retention-smoke
```

预期：

1. TTL 候选被归档，`archived_reason=ttl_expired`。
2. 规则稳定候选被归档，`archived_reason=rule_stabilized`。

8. **一键回归（开启 replay-learning smokes）**：

```bash
RUN_REPLAY_LEARNING_SMOKES=true npm run -s regression:oneclick
```

## 通过标准

1. 必要 API 调用返回预期 2xx。
2. 写入/策略路径返回的 ID/URI 完整且可解析。
3. 无 tenant/scope 隔离回归。
4. Core gate 通过阻断项检查。
5. Replay-learning 故障分类与 retention smoke 全部通过。

## 相关文档

1. [Operator Runbook](/public/zh/operations/02-operator-runbook)
2. [Production Core Gate](/public/zh/operations/03-production-core-gate)
3. [API Contract](/public/zh/api/01-api-contract)
