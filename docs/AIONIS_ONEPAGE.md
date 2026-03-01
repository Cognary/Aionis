---
title: "Aionis Onepage"
---

# Aionis Onepage

Last updated: `2026-02-28`

## 1) Aionis 是什么

`Aionis = Verifiable / Operable Memory Kernel for Agents`

它不是“仅向量库”，而是一个可审计、可运营、可策略化的 Agent Memory 内核：

1. **Audit-first**：写入走 commit chain，可追溯、可回放。
2. **Derived async**：embedding/topic/compression 等派生异步执行，不阻塞核心写路径。
3. **Memory -> Policy**：规则与反馈把“记忆”转成“可执行决策”（planner/tools）。

## 2) 解决的问题

面向真实 Agent 业务，Aionis 主要解决四类问题：

1. 记忆可持续：跨会话、跨流程持久化（nodes/edges/commits）。
2. 召回可用：返回 LLM-ready 的结构化上下文（`/v1/memory/recall_text`）。
3. 行为可控：规则评估、工具选择、反馈闭环（`rules/evaluate`, `tools/select`, `tools/feedback`）。
4. 运营可验证：健康门禁、一致性检查、性能基线、回归脚本、发布门禁。

## 3) 核心架构（当前主路径）

1. **SoR（系统事实源）**：Postgres + pgvector  
   - 存储 nodes / edges / commit chain。  
   - 图扩展与激活逻辑主要在应用层。
2. **双阶段召回**：  
   - Stage1：向量候选 + 字面匹配（快）。  
   - Stage2：1-2 hop 邻域扩展 + 排序（准）。
3. **异步派生流水线**：  
   - outbox worker 负责 embedding backfill、聚类与其他派生任务。  
   - 写成功不依赖派生成功（高可用优先）。
4. **存储抽象演进中**：  
   - MemoryStore adapter 已落地并进入 `phase_p2_in_progress`。  
   - Postgres 仍是 reference backend；embedded 路线已具备实验/能力协商路径。

## 4) 能力面（对外可用）

1. 核心 Memory API：`write / recall / recall_text / find`
2. Session/Event：`create session / write event / list session events`
3. Pack 操作：`packs/export`、`packs/import`（admin/operator 面）
4. Policy/Planner：`rules/evaluate`、`tools/select`、`tools/feedback`、`tools/decision`
5. 多租户与隔离：`tenant_id + scope` 作为隔离键
6. 能力协商：后端能力不足时返回类型化 `backend_capability_unsupported`（501）与标准 details

## 5) 部署形态（从轻到强）

1. **Tier 0: Standalone**（单容器）  
   - Postgres + migrations + API + worker 同容器。  
   - 适合本地、演示、CI smoke。  
   - 明确 **非 HA 生产形态**。
2. **Tier 1: Compose 分服务（单机）**  
   - `db/api/worker/migrate` 分离，更接近生产。
3. **Tier 2: HA 服务**（推荐生产）  
   - 外部托管 Postgres + API 多副本 + worker 独立部署 + 回滚/门禁体系。

## 6) 轻量化策略（已落地）

1. 官方 `standalone + lite profile` 路径已完成。
2. 官方 `lite recall profile` 已完成（本地默认可更省资源）。
3. `env:throughput:lite/prod/benchmark` 可一键切换吞吐配置。

结论：Aionis 现在可以“本地够轻”，同时保留“生产可进阶”的主干架构。

## 7) 生产可用性与门禁

核心生产门禁（`Production Core Gate`）覆盖：

1. 一致性与隔离完整性（scope + cross-tenant）
2. API/SDK/文档与构建契约检查
3. pack roundtrip
4. 性能阈值（recall/write）
5. 可选压缩 KPI、冲突治理、回放确定性等扩展指标

CI 层面已形成：`backend-parity-smoke` + `sdk-ci` + `core-production-gate` 组合门禁。

## 8) Open Core 边界（你能公开什么）

公开（Open Core）：

1. 内核模型、API/SDK 合约、异步派生基线、规则基线、公共 runbook/spec。

私有（Hosted/Enterprise）：

1. 控制面实现、计费与配额变现、企业 IAM/合规模块、托管运维内部自动化。

这保证了“标准公开 + 托管护城河”并存。

## 9) 当前发布基线（已对齐）

1. Core: `v0.2.1`
2. npm SDK: `@aionis/sdk@0.2.1`
3. PyPI SDK: `aionis-sdk==0.2.1`
4. Docker: `ghcr.io/cognary/aionis:v0.2.1`
5. Standalone Docker: `ghcr.io/cognary/aionis:standalone-v0.2.1`

## 10) 一句话评估

Aionis 当前状态可以概括为：

1. **可用**：核心能力、SDK、镜像、门禁链路完整可运行。  
2. **可扩展**：从本地轻量形态平滑升级到 HA 生产形态。  
3. **可演进**：MemoryStore adapter 仍在 P2 收口期，但方向明确且有持续验证体系。

## 11) 入口命令（最短路径）

```bash
git clone https://github.com/Cognary/Aionis
cd Aionis
cp .env.example .env
npm run -s env:throughput:lite
npm run -s docker:build:standalone
npm run -s docker:run:standalone
```

---

References:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/API_CONTRACT.md`
4. `docs/STANDALONE_TO_HA_RUNBOOK.md`
5. `docs/PRODUCTION_CORE_GATE.md`
6. `docs/MEMORY_STORE_ADAPTER_PLAN.md`
7. `docs/LITE_STANDALONE_AND_RECALL_PLAN.md`
8. `docs/OPEN_CORE_BOUNDARY.md`
