---
title: "Aionis Onepage (Public)"
---

# Aionis Onepage (Public)

Last updated: `2026-02-28`

## Aionis 是什么

**Aionis 是面向 Agent 的 Verifiable / Operable Memory Kernel。**

它把“能记住”升级成“可验证、可运营、可治理”的记忆基础设施，帮助团队从 Demo 走到生产。

## 为什么不是“再一个向量库”

很多方案只解决“相似检索”，Aionis 解决的是完整记忆系统问题：

1. **可追溯写入**：nodes + edges + commit chain，关键写入可审计可回放。
2. **异步派生架构**：embedding/topic 等派生异步执行，核心写路径可用性优先。
3. **策略化决策闭环**：memory -> rules -> tool decisions -> feedback。
4. **运营门禁完整**：健康、一致性、性能、回归与发布门禁可落地。

## 核心能力

1. Durable Memory API：`write / recall / recall_text / find`
2. Session/Event 记忆流：`sessions / events`
3. Policy Engine：`rules/evaluate`、`tools/select`、`tools/feedback`、`tools/decision`
4. Operator 能力：`packs/export`、`packs/import`（admin 口）
5. 多租户隔离：`tenant_id + scope`

## 架构原则（对外可理解版）

1. **Audit-first**：先保证事实链路可追踪。
2. **Derived-async**：把昂贵派生从关键路径解耦。
3. **Memory -> Policy**：让记忆直接驱动可执行行为，而不是只做“检索拼接”。

## 典型场景

1. 个人/团队 Agent 助手（跨会话长期记忆）
2. Tool-heavy Copilot（策略化工具选择与反馈学习）
3. 组织级记忆系统（租户隔离 + 运营可观测）
4. 与 MCP / LangGraph / OpenWork 的记忆层集成

## 部署路径（从轻到强）

1. **本地最快**：`standalone` 单容器（本地、演示、CI smoke）
2. **服务化过渡**：compose 分离 DB/API/worker
3. **生产推荐**：HA 拓扑（托管 Postgres + API 多副本 + 独立 worker）

说明：standalone 明确用于 local/demo，不是 HA 生产形态。

## 3 分钟开始

```bash
git clone https://github.com/Cognary/Aionis
cd Aionis
make quickstart
curl -fsS http://localhost:3001/health
```

本地轻量模式：

```bash
cp .env.example .env
npm run -s env:throughput:lite
npm run -s docker:build:standalone
npm run -s docker:run:standalone
```

## SDK 与发行

1. TypeScript SDK: [`@aionis/sdk`](https://www.npmjs.com/package/@aionis/sdk)
2. Python SDK: [`aionis-sdk`](https://pypi.org/project/aionis-sdk/)
3. Docker: `ghcr.io/cognary/aionis`

当前发布基线：

1. Core: `v0.2.1`
2. npm: `0.2.1`
3. PyPI: `0.2.1`
4. Docker: `v0.2.1` / `standalone-v0.2.1`

## 开源边界（Open Core）

公开：kernel、API/SDK 合约、异步派生基线、规则基线、公共 runbook/spec。  
私有：托管控制面实现、计费/企业 IAM/内部运维自动化等。

这让 Aionis 同时具备：

1. 公共标准化与生态可集成性
2. 托管服务可持续演进空间

## 一句话总结

**Aionis 不是“记忆插件”，而是可上线、可治理、可演进的 Agent Memory Kernel。**

