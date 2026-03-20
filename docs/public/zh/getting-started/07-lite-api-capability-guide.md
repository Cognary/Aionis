---
title: "Lite API 能力指南"
---

# Lite API 能力指南

这页是面向 operator 的简版能力说明，用来快速回答：

1. Lite 现在能用什么
2. 哪些只支持 Lite 子集
3. 哪些仍然属于 `AionisPro`

如果你要看内部精确矩阵，直接看 [Lite API Capability Matrix](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md)。

如果你需要一版更偏产品叙事、适合发布说明或 demo 开场的短文案，直接看 [Lite Execution-Memory Beta Narrative](/public/zh/getting-started/08-lite-execution-memory-beta-narrative)。

命名后的执行记忆主链：

`Anchor-Guided Rehydration Loop`

定义：

`stable execution -> workflow anchor -> recall -> runtime hint -> optional rehydration`

## 核心运行时

支持：

1. `npm run start:lite`
2. `npm run start:lite:local-process`
3. `GET /health`

期望的健康面信号：

1. `runtime.edition = "lite"`
2. `storage.backend = "lite_sqlite"`

## 支持的 Memory 能力面

Lite 现在支持这些本地 memory 核心路由：

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`
4. `POST /v1/memory/planning/context`
5. `POST /v1/memory/context/assemble`
6. `POST /v1/memory/find`
7. `POST /v1/memory/resolve`

Lite 也支持本地 sessions 和 packs：

1. `POST /v1/memory/sessions`
2. `GET /v1/memory/sessions`
3. `POST /v1/memory/events`
4. `GET /v1/memory/sessions/:session_id/events`
5. `POST /v1/memory/packs/export`
6. `POST /v1/memory/packs/import`

## 推荐的集成读取方式

对新的 Lite 集成，推荐这样读 response：

1. workflow、pattern、rehydration 的完整集合优先从 `planner_packet.sections.*` 读取
2. `workflow_signals` 和 `pattern_signals` 直接当 canonical signal surface 使用
3. `planning_summary` 或 `assembly_summary` 用来读取紧凑的 planner-facing explanation
4. `execution_kernel.*_summary` 用来读取紧凑的 runtime state

推荐理解方式：

1. top-level `recommended_workflows`、`candidate_workflows`、`candidate_patterns`、`trusted_patterns`、`contested_patterns`、`rehydration_candidates` 在 `v1` 里仍然保留，但更适合作为 convenience mirrors 看待
2. top-level `supporting_knowledge` 仍然保留，作为 retained compatibility mirror
3. 对新集成来说，不建议把 `layered_context` 当成 execution-memory 的主读取入口

如果你需要更详细的集成指引，可以直接看 [Execution-Memory Integrator Guide](/Volumes/ziel/Aionisgo/docs/LITE_EXECUTION_MEMORY_INTEGRATOR_GUIDE.md)。

## 支持的 Replay 和 Playbook 能力面

Lite 包含真实可用的 replay/playbook kernel。
这也是 `Anchor-Guided Rehydration Loop` 的生产侧。

支持：

1. `POST /v1/memory/replay/run/start`
2. `POST /v1/memory/replay/step/before`
3. `POST /v1/memory/replay/step/after`
4. `POST /v1/memory/replay/run/end`
5. `POST /v1/memory/replay/runs/get`
6. `POST /v1/memory/replay/playbooks/compile_from_run`
7. `POST /v1/memory/replay/playbooks/get`
8. `POST /v1/memory/replay/playbooks/candidate`
9. `POST /v1/memory/replay/playbooks/promote`
10. `POST /v1/memory/replay/playbooks/repair`

Lite 还保留了一组缩减后的 governed replay 子集：

1. `POST /v1/memory/replay/playbooks/repair/review`
2. `POST /v1/memory/replay/playbooks/run`
3. `POST /v1/memory/replay/playbooks/dispatch`

这不代表 Server 那套完整治理面也在 Lite 里，只代表 Lite 保留了本地执行路径。

## 支持的 Handoff、Rules、Tools 能力面

这一组路由里也包含了 runtime 可调用的 rehydration 工具别名，以及可以沉淀 tool-selection pattern 的本地 feedback 路径。

支持：

1. `POST /v1/handoff/store`
2. `POST /v1/handoff/recover`
3. `POST /v1/memory/feedback`
4. `POST /v1/memory/rules/state`
5. `POST /v1/memory/rules/evaluate`
6. `POST /v1/memory/tools/select`
7. `POST /v1/memory/tools/decision`
8. `POST /v1/memory/tools/run`
9. `POST /v1/memory/tools/runs/list`
10. `POST /v1/memory/tools/rehydrate_payload`
11. `POST /v1/memory/tools/feedback`

从运行链路理解：

1. replay 产生稳定执行产物
2. recall 命中 anchor
3. runtime tool 暴露按需展开
4. 这就是 Lite 当前版本里的 `Anchor-Guided Rehydration Loop`

## 支持的 Lite Automation Kernel

Lite 现在包含一套本地、playbook-driven 的 automation kernel。

支持：

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`
6. `POST /v1/automations/run`
7. `POST /v1/automations/runs/get`
8. `POST /v1/automations/runs/list`
9. `POST /v1/automations/runs/cancel`
10. `POST /v1/automations/runs/resume`

Lite 当前支持的 node kind：

1. `playbook`
2. `approval`
3. `condition`
4. `artifact_gate`

不包含：

1. reviewer assignment
2. promotion workflow
3. shadow governance
4. compensation governance
5. telemetry orchestration

不支持的 automation 治理面会返回：

1. `501 automation_feature_not_supported_in_lite`

## 支持的 Sandbox 能力面

Sandbox 在 Lite 里可用。

当 `SANDBOX_ENABLED=true` 时支持：

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`

当前实用模式：

1. 默认 `mock`
2. `npm run start:lite:local-process` 可启用窄白名单的本地进程 preset

如果设置 `SANDBOX_ADMIN_ONLY=true`，sandbox 仍可用，但会重新要求本地 admin token。

## 明确不属于 Lite 的能力

这些能力面就是故意不属于 Lite：

1. `/v1/admin/control/*`
2. `/v1/memory/archive/rehydrate*`
3. `/v1/memory/nodes/activate*`
4. 多用户治理
5. 完整 control-plane automation
6. Server HA / 生产部署拓扑

这些 route group 会返回：

1. `501 server_only_in_lite`

## 推荐验证方式

最小验证链：

```bash
npm install
npm run build
npm run smoke:lite
```

如果你还想验证更实用的本地进程 sandbox preset：

```bash
npm run smoke:lite:local-process
```

如果你要看精确到 route 级别的完整矩阵，直接看 [Lite API Capability Matrix](/Volumes/ziel/Aionisgo/docs/LITE_API_CAPABILITY_MATRIX.md)。
