---
title: "Lite 排障与反馈"
---

# Lite 排障与反馈

如果 Lite 已经能启动，但本地行为仍然让你不确定，或者你准备在 beta 期间提交反馈，就看这页。

## 快速排查顺序

按这个顺序查：

1. 启动环境
2. `/health`
3. `memory_lane`
4. pack 路由的 admin token
5. `npm run -s lite:dogfood`

这个顺序能先排掉最常见的误判。

## 启动问题

### `npm run start:lite` 一启动就退出

先检查：

1. Node 是否为 `22+`
2. `npm run build` 是否完成
3. 当前 shell 是否把 `AIONIS_EDITION` 覆盖成了 `server`

Lite 依赖 `node:sqlite`。如果 Node 太老，先修这个，不要先怀疑别的地方。

### `/health` 看起来不像 Lite

执行：

```bash
curl -fsS http://localhost:3001/health | jq '{ok,aionis_edition,memory_store_backend,lite_write_store,lite_recall_store}'
```

预期结果：

1. `ok = true`
2. `aionis_edition = "lite"`
3. `memory_store_backend = "lite_sqlite"`
4. `lite_write_store` 存在
5. `lite_recall_store` 存在

如果 `memory_store_backend` 不是 `lite_sqlite`，说明你实际跑起来的不是想要的 Lite。

## Write、Recall、Context 问题

### write 成功但 `find` 为空

先检查：

1. 写入是否用了 `memory_lane = "private"`
2. 读取方身份是否真的匹配 owner-scope 数据
3. 同一条链路换成 `memory_lane = "shared"` 是否正常

第一次验证优先用 `shared`，这是最短排错路径。

### write 成功但 `recall_text` 或 `planning/context` 很弱

先检查：

1. write 返回里是否没有 `write_no_nodes`
2. 返回里是否出现 `lite_embedding_backfill_completed_inline`
3. 换成 `memory_lane = "shared"` 后问题是否还在
4. `npm run -s lite:dogfood` 是否也会失败

`lite_embedding_backfill_completed_inline` 是正常信号，表示 Lite 已经本地 inline 完成 embedding backfill。

## Replay 问题

### replay lifecycle 在本地失败

先做这三件事：

1. 确认 `/health` 显示 Lite
2. 重跑 `npm run -s lite:dogfood`
3. 确认失败点是在 `run/start`、step 写入，还是 `runs/get`

当前 beta 预期是：

1. replay lifecycle 在真实 Lite 进程里可用
2. `run/start -> step -> run/end -> runs/get` 能在 dogfood 里跑通

如果 dogfood 是绿的，而你的本地链路不是，问题更可能是请求形状或环境漂移，不是 Lite 持久化本身坏了。

## Pack 问题

### pack export/import 本地失败

先检查：

1. 启动前是否设置了 `ADMIN_TOKEN`
2. 请求里是否带了 `X-Admin-Token`
3. `packs/import` 收到的是嵌套 `pack`，而不是整个 export envelope

当前 beta 预期是：

1. `Lite -> Server` pack 兼容性成立
2. `Server -> Lite` pack 兼容性成立

## 哪些不算 Bug

这些都属于 Lite beta 的正常边界：

1. `/v1/admin/control/*` 是 server-only
2. `/v1/automations/*` 是 server-only
3. Lite 不是推荐的默认生产部署形态
4. Lite 不是完整的 Server parity

如果这些路由返回 `501 server_only_in_lite`，那是正确语义，不是故障。

## 标准验证命令

不确定时，直接跑：

```bash
npm run -s lite:dogfood
```

它会验证：

1. startup
2. health
3. write
4. find
5. recall_text
6. planning/context
7. context/assemble
8. pack export/import
9. replay lifecycle

同时会把 artifact 写到 `artifacts/lite/`。

## 如何提交反馈

建议使用 GitHub 上的 `Lite Beta Feedback` 模板，并至少附上：

1. 操作系统和 Node 版本
2. 启动命令
3. `/health` 输出
4. `lite:dogfood` 是否通过
5. 问题属于 startup、visibility、replay 还是 packs
6. 最小可复现请求

模板直达：

[github.com/Cognary/Aionis/issues/new?template=lite-beta-feedback.yml](https://github.com/Cognary/Aionis/issues/new?template=lite-beta-feedback.yml)

如果你不确定这是不是预期行为，也照样提。public beta 的目标就是把 operator UX 打磨到不靠猜。

如果这次运行是成功的，也一样值得反馈。成功路径反馈能帮助我们确认哪些启动和运维路径已经稳定。

## 下一步阅读

1. [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)
2. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
3. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
