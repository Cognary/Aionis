---
title: "5 分钟上手"
---

# 5 分钟上手

用这页在几分钟内跑通你的第一条 Aionis memory loop。

## 你需要准备什么

1. 一个可访问的 Aionis endpoint。
2. 一种认证方式：
   API key 或 bearer token。
3. 本地安装好 `curl` 和 `jq`。

## 方案 A：Hosted Aionis（最快）

先设置 endpoint 和凭证：

```bash
export BASE_URL="https://api.your-domain.com"
export API_KEY="your_api_key"
```

健康检查：

```bash
curl -fsS "$BASE_URL/health" | jq
```

写入一条 memory：

```bash
curl -sS "$BASE_URL/v1/memory/write" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{
    "tenant_id":"default",
    "scope":"default",
    "input_text":"Customer prefers email follow-up",
    "memory_lane":"shared",
    "nodes":[{"type":"event","memory_lane":"shared","text_summary":"Customer prefers email follow-up"}]
  }' | jq
```

召回文本上下文：

```bash
curl -sS "$BASE_URL/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  -H "X-Api-Key: $API_KEY" \
  -d '{
    "tenant_id":"default",
    "scope":"default",
    "query_text":"preferred follow-up channel",
    "limit":5
  }' | jq
```

如果你的部署使用 JWT，而不是 API key，把 `X-Api-Key` 替换成：

```bash
-H "authorization: Bearer $BEARER_TOKEN"
```

## 方案 B：Lite Alpha（单用户、本地、无 Docker）

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
npm install
npm run build
npm run start:lite
```

健康检查：

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

Lite 下期望看到：

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`
3. `lite_write_store` 和 `lite_recall_store` 都存在

运行一次 write + recall：

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"hello from lite onboarding","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"hello from lite onboarding"}]}' | jq

curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"hello","limit":5}' | jq
```

Lite Alpha 当前有意保留这两个 server-only 外层面：

1. `/v1/admin/control/*`
2. `/v1/automations/*`

它们会稳定返回 `501 server_only_in_lite`。

如果你要本地长期跑 Lite，建议继续看：

1. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
2. [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)
3. [Lite 排障与反馈](/public/zh/getting-started/06-lite-troubleshooting-and-feedback)

## 方案 C：Self-Host（Docker）

```bash
git clone https://github.com/Cognary/Aionis.git
cd Aionis
cp .env.example .env
```

本地最小 `.env` 推荐：

1. `PORT=3001`
2. `MEMORY_AUTH_MODE=off`
   仅限本地开发
3. `EMBEDDING_PROVIDER=fake`

启动：

```bash
make stack-up
curl -fsS http://localhost:3001/health | jq
```

运行 write + recall：

```bash
curl -sS http://localhost:3001/v1/memory/write \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","input_text":"hello from local onboarding","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","text_summary":"hello from local onboarding"}]}' | jq

curl -sS http://localhost:3001/v1/memory/recall_text \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"default","scope":"default","query_text":"hello","limit":5}' | jq
```

停止：

```bash
make stack-down
```

## 成功标准

满足以下条件就算上手完成：

1. `/health` 返回 `ok`
2. 如果你跑的是 Lite，则 `/health.aionis_edition = "lite"` 且 `/health.memory_store_backend = "lite_sqlite"`
3. `write` 返回 `request_id` 和写入元数据
4. `recall_text` 返回非空 context 或 seeds

## 常见错误

1. `401/403`
   认证头错误或缺失。
2. `400 invalid_request`
   JSON 结构不对，或缺少必填字段。
3. recall 为空
   新写入内容可能还没形成可召回节点，或 `nodes` 本身为空。
4. `warnings[0].code=write_no_nodes`
   commit 成功了，但没有真正写入可召回 node。
5. private write 之后 `find` 为空
   这可能是 memory lane 可见性，不一定是 Lite store 出错。
6. Lite 下 pack 路由失败
   先检查启动时是否设置了 `ADMIN_TOKEN`，以及请求里是否带了 `X-Admin-Token`。

## 下一步

1. 配置正式 Embedding：
   [Embedding 配置](/public/zh/getting-started/03-embedding-setup)
2. 跑一遍 Lite 运维清单：
   [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
3. 查看 Lite public beta 边界：
   [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)
4. 本地行为和预期不一致时，走统一排障路径：
   [Lite 排障与反馈](/public/zh/getting-started/06-lite-troubleshooting-and-feedback)
5. 继续搭完整 memory workflow：
   [构建 Memory Workflow](/public/zh/guides/01-build-memory)
6. 查看 API 契约：
   [API Reference](/public/zh/api-reference/00-api-reference)
