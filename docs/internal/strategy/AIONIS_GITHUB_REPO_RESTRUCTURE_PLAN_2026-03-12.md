---
title: "Aionis GitHub Repo Restructure Plan"
---

# Aionis GitHub 仓库重组方案

Last updated: `2026-03-12`  
Status: `working plan`

## 1. Executive Summary

当前不建议把 Aionis 拆成 `Lite / Server / Cloud` 三个代码仓库。

推荐目标结构是：

1. 一个公开主仓库：`Aionis`
2. 一个私有商业仓库：`aionis-cloud`

如果后续确实有需要，可以再考虑单独的内部运营仓库，但这不是当前第一优先级。

核心原则：

1. **共享内核不拆仓**
2. **Cloud 外层能力独立成私有仓库**
3. **先做边界和归属重组，再做代码迁移**

## 2. Why Not Three Repos

不建议拆成三个仓库的原因：

1. `Lite` 和 `Server` 当前共享同一套 kernel 语义
2. 如果拆成两个公开仓库，修复和发布会双倍复杂
3. 当前代码已经明确是 edition split，而不是两个不同产品内核
4. 对开发者和社区来说，一个公开 canonical repo 更清晰

`Lite / Server / Cloud` 应该是 **产品分层**，不是 **仓库分层**。

## 3. Target Repo Topology

### 3.1 Public Canonical Repo: `Aionis`

这个仓库继续承担：

1. Lite
2. Server core
3. shared kernel
4. SDK / MCP
5. public docs
6. open-core self-hosted baseline

公开仓库应该继续是：

> community + open-core + canonical development home

### 3.2 Private Commercial Repo: `aionis-cloud`

这个仓库承担：

1. Cloud control plane
2. multi-tenant governance surfaces
3. org / quota / billing / admin layers
4. hosted automation governance
5. managed ops / enterprise integrations

私有仓库应该是：

> managed-service and commercial outer layer

## 4. Open / Closed Boundary

### 4.1 Keep in Public `Aionis`

以下必须留在公开主仓库：

1. memory graph core
2. commit-chain
3. replay / playbooks / dispatch
4. context orchestration
5. rules / tools policy loop
6. packs import/export bridge
7. Lite runtime
8. self-hosted Server core
9. SDK / MCP / public integration surfaces

原因：

1. 这些共同构成 Aionis 的 kernel truth
2. 这部分是 adoption 和技术心智来源
3. 这部分不适合拆分为多个仓库或闭源隐藏

### 4.2 Move or Rebuild in Private `aionis-cloud`

以下建议迁移到私有 Cloud 仓库，或以后只在私有仓库演进：

1. hosted control plane
2. multi-tenant org identity and governance
3. quota / billing / admin console logic
4. cloud-specific alerting, reporting, and operator tooling
5. managed automation orchestration workflows
6. enterprise-only integrations and compliance surfaces

## 5. What Counts as Cloud-Only

以当前代码和文档为基础，Cloud-only 归属大致是：

1. `/v1/admin/control/*`
2. hosted governance / quota / operator jobs
3. multi-tenant control-plane surfaces
4. Cloud packaging / hosted ops runbooks

注意：

`/v1/automations/*` 当前在产品边界上更像 `Server + Cloud` 的上层能力。  
短期内它仍然可以留在主仓库，作为 self-hosted production capability；但如果后续明显长成 hosted-first orchestration/control surface，可以再拆。

## 6. Immediate Cleanup Goal

这次重组第一阶段不追求“把所有 Cloud-only 代码今天搬完”。

第一阶段目标更现实：

1. 明确两个仓库的职责
2. 初始化 `aionis-cloud`
3. 把 Cloud repo 里的目录骨架和 README 建好
4. 在公开仓库里保留 canonical open-core 路径
5. 列出第一批迁移候选，而不是立即做大搬家

## 7. Phase Plan

### Phase A: Define Boundaries

1. 写清 `Aionis` 与 `aionis-cloud` 的职责
2. 明确“共享内核不迁移”
3. 明确第一批 Cloud-only 候选

### Phase B: Create Private Repo Skeleton

在 `aionis-cloud` 中创建最小结构：

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/BOUNDARY.md`
4. `apps/control-plane/`
5. `apps/cloud-console/`
6. `packages/cloud-common/`

### Phase C: Migrate Documentation and Ownership

先迁移这类非运行时核心内容：

1. 商业/托管导向文档
2. Cloud-only 架构说明
3. control-plane 责任说明

Current status:

1. Batch 1 completed
2. commercial strategy ownership moved to `aionis-cloud`
3. business-facing release material ownership moved to `aionis-cloud`
4. public repo now keeps redirect stubs for those two documents

### Phase D: Move First Code Slice

第一批代码迁移应优先选：

1. 不依赖 kernel 深层重构的 control-plane outer layer
2. Hosted admin / governance helpers
3. Cloud-specific jobs and operator tooling

不要第一批就迁：

1. replay
2. memory write/recall core
3. Lite runtime
4. SDK / MCP

## 8. Recommended First Migration Batch

当前最适合做第一批迁移候选的不是 kernel，而是这些方向：

1. Cloud/control-plane docs and packaging
2. hosted governance and operator reports
3. admin/control outer surface adapters

当前暂不建议第一批就迁的代码：

1. `src/memory/*`
2. `src/routes/memory-*`
3. Lite-specific runtime stores
4. SDK / MCP / public docs

## 9. Repo Hygiene Guidance

公开主仓库目前“看起来乱”的一个真实原因，不是产品分层不清，而是内部文档很多。

建议后续再做第二阶段整理：

1. 继续保留 `docs/public/` 在公开仓库
2. 将真正 Cloud-only / commercial-only 的内部策略文档逐步迁到私有仓库
3. 保留与 open-core 直接相关的架构/发布文档在主仓库

这一步应该晚于仓库骨架初始化，不要先大删文档。

## 10. Proposed `aionis-cloud` Initial Structure

```text
aionis-cloud/
  README.md
  docs/
    ARCHITECTURE.md
    PRODUCT_SCOPE.md
    MIGRATION_NOTES.md
  apps/
    control-plane/
    cloud-console/
  packages/
    cloud-common/
```

## 11. Success Criteria

这次重组第一阶段完成的标准不是“代码全部拆完”，而是：

1. 两个仓库职责已经明确
2. `aionis-cloud` 已经初始化
3. 第一批迁移候选已经清单化
4. 公开仓库仍然保持可作为 canonical open-core home

## 12. Final Recommendation

推荐立即执行：

1. 保留 `Aionis` 为公开 canonical repo
2. 使用私有 `aionis-cloud` 承接 Cloud-only 外层能力
3. 先建骨架和职责边界
4. 再按批次迁移 Cloud-only 内容

不推荐立即执行：

1. 把 `Aionis` 直接改私有
2. 拆成 `Lite / Server / Cloud` 三个仓库
3. 第一刀就迁 kernel 或 shared runtime code
