---
title: "Lite 运维说明"
---

# Lite 运维说明

如果 `npm run start:lite` 已经能启动，但你想避免在本地使用时反复猜测 Lite 的行为边界，就看这页。

## Lite 是什么

Lite Alpha 是 Aionis 的单用户、本地 SQLite 版。

它当前有意把 admin/control 保留为 server-only：

1. `/v1/admin/control/*`

这组路由稳定返回 `501 server_only_in_lite` 属于正常 Lite 语义，不是启动失败。

Lite 现在已经包含一组本地 automation 子集，挂在 `/v1/automations/*` 下。

当前支持：

1. definition 的 create/get/list/validate
2. run/get/list/cancel/resume
3. 基于 SQLite 的本地 playbook-driven run

在 automation 命名空间里仍然故意不可用的包括：

1. reviewer assignment 流程
2. promote 和 control-plane review 流程
3. compensation 和 telemetry surface

这些不支持的 automation 路由会返回 `501 automation_feature_not_supported_in_lite`。

Lite 错误响应现在统一使用一套稳定 envelope：

1. `status`
2. `error`
3. `message`
4. `details`

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
curl -fsS http://localhost:3001/health | jq '{ok,runtime,storage,lite}'
```

健康 Lite 应该显示：

1. `runtime.edition = "lite"`
2. `storage.backend = "lite_sqlite"`
3. `lite.stores.write` 和 `lite.stores.recall` 都存在

## Sandbox 默认行为

Lite 现在默认把 sandbox 路由开放给本地普通用户直接使用。

当前默认启动行为：

1. `SANDBOX_ENABLED=true`
2. `SANDBOX_ADMIN_ONLY=false`
3. `SANDBOX_EXECUTOR_MODE=mock`

如果你想把 sandbox 再锁回本地 admin token：

```bash
SANDBOX_ADMIN_ONLY=true npm run start:lite
```

如果你想直接启用一个更实用的本地进程 sandbox 预设：

```bash
npm run start:lite:local-process
```

这个预设当前故意保持很窄的 allowlist：

1. `SANDBOX_EXECUTOR_MODE=local_process`
2. `SANDBOX_ALLOWED_COMMANDS_JSON=["echo"]`

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
2. `memory_lane = "private"` 是 owner-scope 的，`find` 通常更严格
3. 不要把 private lane 简化理解成“在 Lite 下所有 surface 都看不到”
4. 当前更准确的经验判断是：
   - `find` 可能看不到 private 内容
   - `recall_text`、`planning/context`、`context/assemble` 仍然可能把 private 内容带出来

如果你想走最短调试路径，优先用 `shared` 去验证：

1. `/v1/memory/write`
2. `/v1/memory/find`
3. `/v1/memory/recall_text`
4. `/v1/memory/planning/context`
5. `/v1/memory/context/assemble`

如果 private write 之后 `find` 为空，先检查可见性语义，不要先断定 SQLite 持久化坏了。

## 最小写入请求要求

Lite 支持 `/v1/memory/write`，但最小请求形状和 Server 一样，不是“只传 nodes 就行”。

至少满足下面之一：

1. `input_text`
2. `input_sha256`

如果你只传 `nodes`，当前会返回：

1. `must set input_text or input_sha256`

这不是 Lite 特有故障，也不表示 SQLite 写路径坏了，而是请求本身不满足 write contract。

## Pack 路由

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

## 本地 Automation 身份

Lite 会把 replay、playbook、automation 的归属默认收敛到一个本地 actor。

实际规则：

1. 如果你什么都不配，Lite 默认 `LITE_LOCAL_ACTOR_ID=local-user`
2. replay/playbook 流程和 automation playbook node 会共用这个本地 actor
3. 如果你想让本机身份稳定可读，可以显式覆盖它

示例：

```bash
LITE_LOCAL_ACTOR_ID=lucio npm run start:lite
```

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

### `/health` 里的 storage backend 不是 `lite_sqlite`

先检查：

1. 你是不是实际用 `npm run start:lite` 启动的
2. `AIONIS_EDITION=lite` 是否被其他环境变量覆盖了

### write 成功但 `find` 为空

先检查：

1. 这次写入是不是 `memory_lane = "private"`？
2. 你是不是在没有 consumer identity 的情况下，期待 owner-scope 数据直接出现在 inspection 里？
3. 同一条链路改成 `memory_lane = "shared"` 后是否能复现？
4. 不要用 “`find` 为空” 直接推断 “`recall_text` 也一定为空”

### write 成功但 recall/context 为空

先检查：

1. 这次 write 是否真的创建了 node
2. 返回里是否出现了 `write_no_nodes`
3. 返回里如果有 `lite_embedding_backfill_completed_inline`，这反而是正常且有帮助的
4. 直接重跑 `npm run -s lite:dogfood`

### pack 路由本地失败

先检查：

1. import 时传的是不是嵌套 `pack`，而不是整个 export envelope
2. `/health` 返回里是否仍然显示 `runtime.edition = "lite"`

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
