---
title: "Lite 运维说明"
---

# Lite 运维说明

如果 `npm run start:lite` 已经能启动，但你想避免在本地使用时反复猜测 Lite 的行为边界，就看这页。

## Lite 是什么

Lite Alpha 是 Aionis 的单用户、本地 SQLite 版。

它当前有意把这些外层能力保留为 server-only：

1. `/v1/admin/control/*`
2. `/v1/automations/*`

这些路由稳定返回 `501 server_only_in_lite` 属于正常 Lite 语义，不是启动失败。

## 运行前提

Lite 需要带 `node:sqlite` 的 Node.js。

实际规则：

1. 使用 Node `22+`
2. 如果 `npm run start:lite` 一启动就报 SQLite 支持错误，先修 Node 版本，不要先怀疑 Aionis 内核

最小启动路径：

```bash
cp .env.example .env
npm install
npm run build
npm run start:lite
```

健康检查：

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

健康 Lite 应该显示：

1. `aionis_edition = "lite"`
2. `memory_store_backend = "lite_sqlite"`
3. `lite_write_store` 和 `lite_recall_store` 都存在

## 默认本地文件

Lite 默认把本地状态写到：

1. `.tmp/aionis-lite-write.sqlite`
2. `.tmp/aionis-lite-replay.sqlite`

你也可以通过下面两个环境变量改路径：

1. `LITE_WRITE_SQLITE_PATH`
2. `LITE_REPLAY_SQLITE_PATH`

适合这些场景：

1. 隔离不同 dogfood 轮次
2. 固定保存一份本地 memory graph
3. 只重置 Lite 数据，不影响仓库其他文件

## Memory Lane 行为

Lite 本地最容易让人误判的问题，通常不是启动，而是可见性。

经验规则：

1. `memory_lane = "shared"` 最适合 onboarding、demo、inspection
2. `memory_lane = "private"` 是 owner-scope 的，不一定会出现在 `find`

如果你想走最短调试路径，优先用 `shared` 去验证：

1. `/v1/memory/write`
2. `/v1/memory/find`
3. `/v1/memory/recall_text`
4. `/v1/memory/planning/context`
5. `/v1/memory/context/assemble`

如果 private write 之后 `find` 为空，先检查可见性语义，不要先断定 SQLite 持久化坏了。

## Pack 路由和 Admin Token

Lite 默认本地认证很宽松，但 `packs` 路由仍然要求 admin token。

启动时设置：

```bash
ADMIN_TOKEN=dogfood-admin npm run start:lite
```

调用 pack 路由时带上：

```bash
-H 'X-Admin-Token: dogfood-admin'
```

你需要记住：

1. `packs/export` 返回的是 envelope
2. `packs/import` 需要的是这个 envelope 里的嵌套 `pack`
3. `Lite -> Server` 和 `Server -> Lite` 的 pack 兼容性已经进入 Lite alpha 证据链

## 写入时的正常 warning

Lite 成功写入后可能会返回这个 warning：

1. `lite_embedding_backfill_completed_inline`

这是正常的。

它表示 Lite 已经本地 inline 完成 embedding backfill，因此 fresh write 不需要依赖外部 worker 就能被 recall。

不要把它当成降级写入错误，它更接近“本地补全已完成”的确认信号。

## 标准验证路径

当前标准的真实进程验证命令是：

```bash
npm run -s lite:dogfood
```

它会验证完整本地链路：

1. startup
2. health
3. write
4. find
5. recall_text
6. planning/context
7. context/assemble
8. pack export/import
9. replay lifecycle

脚本会把结果写到 `artifacts/lite/` 下。

适用场景：

1. 本地首次起 Lite 后做确认
2. 修完 Lite bug 后跑回归
3. 给 beta gate 收集重复证据

## 排障清单

### `start:lite` 直接退出

先检查：

1. Node 版本是否为 `22+`
2. `npm run build` 是否完成
3. 当前 shell 是否把 `AIONIS_EDITION` 覆盖成了 `server`

### `/health` 里不是 `lite_sqlite`

先检查：

1. 你是不是实际用 `npm run start:lite` 启动的
2. `AIONIS_EDITION=lite` 是否被其他环境变量覆盖了

### write 成功但 `find` 为空

先检查：

1. 这次写入是不是 `memory_lane = "private"`？
2. 你是不是在没有 consumer identity 的情况下，期待 owner-scope 数据直接出现在 inspection 里？
3. 同一条链路改成 `memory_lane = "shared"` 后是否能复现？

### write 成功但 recall/context 为空

先检查：

1. 这次 write 是否真的创建了 node
2. 返回里是否出现了 `write_no_nodes`
3. 返回里如果有 `lite_embedding_backfill_completed_inline`，这反而是正常且有帮助的
4. 直接重跑 `npm run -s lite:dogfood`

### pack 路由本地失败

先检查：

1. 启动前是否设置了 `ADMIN_TOKEN`
2. 请求里是否带了 `X-Admin-Token`
3. import 时传的是不是嵌套 `pack`，而不是整个 export envelope

## 推荐的运维顺序

内部 alpha 目前最稳的顺序是：

1. 启动 Lite
2. 查 `/health`
3. 写一条 `shared` event
4. 验证 `find`
5. 验证 `recall_text`
6. 验证 `planning/context`
7. 验证 `context/assemble`
8. 跑 `lite:dogfood`

## 下一步阅读

1. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
2. [Embedding 配置](/public/zh/getting-started/03-embedding-setup)
3. [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)
4. [快速开始](/public/zh/getting-started/01-get-started)
5. [Lite 排障与反馈](/public/zh/getting-started/06-lite-troubleshooting-and-feedback)
