---
title: "按角色阅读路径"
---

# 按角色阅读路径

根据你当前要完成的事情选择最短阅读链路，不要从头到尾硬读全站。

## 本地 Builder 路径

适合：个人开发者、Codex 用户、本地 agent workflow 测试。

1. [选择 Lite 还是 Server](/public/zh/getting-started/07-choose-lite-vs-server)
2. [5 分钟上手](/public/zh/getting-started/02-onboarding-5min)
3. [Lite 运维说明](/public/zh/getting-started/04-lite-operator-notes)
4. [Lite Public Beta 边界](/public/zh/getting-started/05-lite-public-beta-boundary)

产出：

1. 启动 Lite、确认 health、知道当前 beta 边界，以及知道反馈应该走哪条路径。

## 集成工程师路径

适合：SDK 用户、API 接入、MCP / Codex 集成。

1. [快速开始](/public/zh/getting-started/01-get-started)
2. [构建记忆工作流](/public/zh/guides/01-build-memory)
3. [API 参考](/public/zh/api-reference/00-api-reference)
4. [SDK 指南](/public/zh/reference/05-sdk)
5. [集成](/public/zh/integrations/00-overview)
6. [Codex 本地集成](/public/zh/integrations/05-codex-local)

产出：

1. 跑通 write、recall、planning、replay 和 Dev MCP 的真实接入链路。

## 自托管平台路径

适合：评估 Server、自托管生产、运维落地。

1. [选择 Lite 还是 Server](/public/zh/getting-started/07-choose-lite-vs-server)
2. [运维与生产](/public/zh/operate-production/00-operate-production)
3. [运维手册](/public/zh/operations/02-operator-runbook)
4. [生产核心门禁](/public/zh/operations/03-production-core-gate)
5. [Standalone 到 HA 手册](/public/zh/operations/06-standalone-to-ha-runbook)

产出：

1. 明确哪些属于 self-hosted Server、哪些还不在当前公开产品面里，以及生产路径怎么运维。

## 运行时架构路径

适合：架构师、平台设计者、想理解 kernel 的贡献者。

1. [核心概念](/public/zh/core-concepts/00-core-concepts)
2. [架构](/public/zh/architecture/01-architecture)
3. [上下文编排](/public/zh/context-orchestration/00-context-orchestration)
4. [策略与执行闭环](/public/zh/policy-execution/00-policy-execution-loop)
5. [基准测试](/public/zh/benchmarks/05-performance-baseline)
6. [Aionis 一页说明](/public/zh/about/02-aionis-onepage)

产出：

1. 理解运行时模型、为什么 replay/context/policy 在一个 kernel 里，以及关键产品主张的证据在哪里。

## 阅读规则

1. 先按产品路径选 Lite、集成、还是 self-hosted Server。
2. 先解决你当前的问题，再回头读架构和概念页。
3. `about/*` 是辅助页，不是第一站。
