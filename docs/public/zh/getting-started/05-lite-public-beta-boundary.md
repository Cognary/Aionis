---
title: "Lite Public Beta 边界"
---

# Lite Public Beta 边界

这页用来明确 Aionis Lite public beta 是什么、支持什么、不承诺什么。

如果你准备把 Lite 当成默认部署形态，先看这页。

如果你想先看一版更短的 operator 视角能力总结，直接看 [Lite API 能力指南](/public/zh/getting-started/07-lite-api-capability-guide)。

如果你想先看一版更适合发布说明或 demo 开场的对外短叙事，直接看 [Lite Execution-Memory Beta Narrative](/public/zh/getting-started/08-lite-execution-memory-beta-narrative)。

如果你需要一步一步照着讲的 demo 脚本，直接看 [Lite Execution-Memory Demo Walkthrough](/public/zh/getting-started/09-lite-execution-memory-demo-walkthrough)。

## 定位

Aionis Lite public beta 是：

1. 单用户、本地运行时
2. SQLite-backed 的 Aionis kernel edition
3. 本地体验 memory、replay、context 工作流的最快路径
4. 第一条已经明确暴露 `Anchor-Guided Rehydration Loop` 的 Lite 发布线

Aionis Lite public beta 不是：

1. Server 的生产替代品
2. 多用户团队 control plane
3. 对 Server parity 的承诺

命名后的执行记忆主链：

`Anchor-Guided Rehydration Loop`

定义：

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

## Lite Public Beta 当前支持

当前 Lite beta 支持的能力面：

1. `npm run start:lite`
2. `/health`
3. `/v1/memory/write`
4. `/v1/memory/recall`
5. `/v1/memory/recall_text`
6. `/v1/memory/planning/context`
7. `/v1/memory/context/assemble`
8. replay 生命周期与 playbooks：
   - `run/start`
   - `step/before`
   - `step/after`
   - `run/end`
   - `runs/get`
   - `playbooks/get`
   - `playbooks/candidate`
   - `playbooks/run`
   - `playbooks/dispatch`
   - `playbooks/compile_from_run`
   - `playbooks/promote`
   - `playbooks/repair`
   - `playbooks/repair/review`
9. sessions/events
10. packs export/import
11. graph inspection：
   - `find`
   - `resolve(node|edge|commit|decision)`
   - `anchors/rehydrate_payload`
12. policy loop：
   - `rules/evaluate`
   - `tools/select`
   - `tools/decision`
   - `tools/run`
   - `tools/rehydrate_payload`
   - `tools/feedback`

这意味着 Lite 已经暴露出 `Anchor-Guided Rehydration Loop` 的主链路由面。
replay / playbook promotion 对应稳定执行产物一侧。
recall 与 `rehydrate_payload` 对应后续的 recall、runtime hint 与按需展开一侧。

补充约束：

1. `/v1/memory/write` 仍然要求最小请求里带 `input_text` 或 `input_sha256`
2. Lite 支持这些 route，不代表所有 lane 和 inspection surface 的可见性完全一致

## 明确保留为 Server-Only 的能力

这个外层能力在 Lite 里仍然故意不可用：

1. `/v1/admin/control/*`

在 Lite 中，这组路由预期返回：

1. `501 server_only_in_lite`

这属于 edition 语义，不是运行时故障。

## Lite 本地 Automation 子集

Lite 现在已经包含一组本地 automation 子集，而不是把整个 automation 命名空间都视为不可用。

当前支持：

1. `/v1/automations/create`
2. `/v1/automations/get`
3. `/v1/automations/list`
4. `/v1/automations/validate`
5. `/v1/automations/graph/validate`
6. `/v1/automations/run`
7. `/v1/automations/runs/get`
8. `/v1/automations/runs/list`
9. `/v1/automations/runs/cancel`
10. `/v1/automations/runs/resume`

不支持的 automation 路由现在返回：

1. `501 automation_feature_not_supported_in_lite`

## Lite Beta 当前承诺什么

Lite beta 目前承诺的是：

1. 真实可用的本地启动路径
2. 本地 SQLite-backed kernel path
3. 可重复执行的 `npm run smoke:lite` 验证
4. alpha / beta-candidate 的仓库级 gate

Lite beta 当前不承诺：

1. 多用户协作
2. hosted governance workflow
3. 生产 HA 拓扑
4. Server 级别的扩展性和运行保证

## 谁适合用 Lite Beta

Lite beta 最适合：

1. 单个开发者
2. 本地 agent runtime 实验
3. IDE 和 MCP 集成
4. replay / memory 工作流原型验证
5. 不想先上 Docker + Postgres 的 Aionis 评估

如果你需要下面这些，请直接用 Server：

1. 团队治理
2. admin/control plane 路由
3. 完整 automation 治理和 reviewer workflow
4. 生产流量
5. 多人共同运维

## 推荐的 Lite Beta 验证路径

最小路径：

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

标准验证：

```bash
npm run smoke:lite
```

可选的实用 sandbox 验证：

```bash
npm run smoke:lite:local-process
```

预期健康面：

1. `runtime.edition = "lite"`
2. `storage.backend = "lite_sqlite"`
3. 默认启动路径下 `sandbox.mode = "mock"`

## 当前已知的运维边缘点

这些是 Lite beta 当前已知的 operator edge，不属于 release blocker：

1. Lite 依赖 Node `22+`，因为用到了 `node:sqlite`
2. `memory_lane = "private"` 不该被理解成“所有 surface 一律不可见”
3. 在当前 Lite beta 里，`find` 对 private lane 更严格，而 `recall_text` / context 路径可能仍然返回 private 内容
4. pack 路由现在属于本地 Lite 路由，不再要求 admin token
5. 成功写入后可能返回 `lite_embedding_backfill_completed_inline`

详细说明见：

1. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)

## 升级到 Server 的判断规则

如果你的需求出现下面任一项，就应该转到 Server，而不是继续把 Lite 拉长：

1. 共享 tenant 治理
2. automation orchestration
3. operator recovery / alerting surface
4. 生产部署保证

## 当前发布姿态

当前最准确的发布姿态是：

1. internal alpha 已完成
2. repository beta-candidate gate 已通过
3. 适合受控 public beta 评估

它还不是：

1. GA
2. 默认部署模式
3. 生产推荐拓扑
