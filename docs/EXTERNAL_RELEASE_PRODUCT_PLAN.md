---
title: "Aionis 对外发布产品总规划（Open Core + Hosted + Kernel Control）"
---

# Aionis 对外发布产品总规划（Open Core + Hosted + Kernel Control）

Last updated: `2026-02-19`  
Owner: `Aionis Core + GTM`

## 1. 目标与定位

本规划用于把 Aionis 从“工程可用”统一推进到“对外可卖、可试用、可规模化交付”。

固定定位（对外统一）：

`Aionis is a Verifiable / Operable Memory Kernel for agents.`

固定叙事结构（官网、发布说明、销售材料一致）：

`Problem -> Architecture Principles -> Evidence -> Boundaries -> Next Step`

## 2. 战略模型（采用）

采用：`Open Core + Hosted + Kernel Control`

## Layer 1 — Open Source（必须开）

开源能力（长期保持生产可用，不做 demo 阉割）：

1. 单用户 memory kernel
2. Commit-chain
3. Basic recall（含 `recall_text`）
4. Graph memory（nodes + edges）
5. Derived pipeline（async/outbox）
6. Rule system（基础版）

战略作用：

1. 建立 Memory Kernel 标准
2. 吸引 AI infra 开发者与生态集成方
3. 形成 GitHub 扩散与技术权威
4. 锁定长期记忆基础设施心智

## Layer 2 — Hosted Aionis（核心收入）

闭源/托管差异化能力：

1. 多租户与组织级权限
2. 企业级隔离与合规控制
3. 高可用与托管 SLO
4. 分布式 memory 与大规模 recall
5. 高级 rule engine 与执行策略系统
6. 性能优化、可观测性、运营控制台
7. Memory governance 与 lifecycle 管理

战略作用：

1. 将生产需求转化为经常性收入
2. 通过“治理深度 + 运维能力”而非“阉割内核”变现

## Layer 3 — Execution Memory Platform（长期护城河）

平台化能力：

1. Memory -> Planner -> Execution substrate
2. Policy memory
3. Agent memory governance
4. Multi-agent shared memory
5. Verifiable execution history
6. Autonomous memory evolution（带强约束）

战略作用：

1. 从 memory feature 升级为 execution control plane
2. 形成长期护城河和生态锁定

## 3. 当前基线（基于仓库现状）

截至 `2026-02-19` 已具备：

1. 核心 API 与单租户内核能力（`write/recall/recall_text`、commit chain、graph）
2. 规则与反馈闭环（`rules/evaluate`、`tools/select`、`tools/feedback`）
3. 运维门禁与证据链（health gate、consistency-check、回归脚本、GTM gate）
4. TS/Python SDK 与 Docker 分发路径
5. 官网应用已存在（`apps/marketing`），包含 `Home/Product/Developers/Pricing/Security/Contact/Open Core`

主要缺口（对外发布视角）：

1. 缺“单一对外发布蓝图”统一产品、官网、销售与发布节奏
2. Hosted 包装与价格锚点不够清晰（现在偏咨询型描述）
3. Layer 3 的“里程碑化对外证明”尚未产品化表达

## 4. 对外产品线设计（发布口径）

## 4.1 产品线

1. `Aionis OSS`（Layer 1）：开源标准内核
2. `Aionis Cloud`（Layer 2）：托管服务（默认商业入口）
3. `Aionis Platform`（Layer 3）：执行记忆平台（先 Design Partner）

## 4.2 边界矩阵（必须公开）

Always Open：

1. write/recall contract
2. commit-chain invariants
3. graph schema & migration format
4. baseline rules

Hosted Differentiators：

1. tenancy/identity/governance/compliance
2. HA/SLO and managed operations
3. observability + control plane + lifecycle management

Platform Differentiators：

1. execution provenance and policy-governed autonomous loops
2. multi-agent governance substrate

## 4.3 商业包装（建议）

1. `OSS`：免费开源，自托管
2. `Cloud Builder`：按量计费，面向小团队（自助开通）
3. `Cloud Team`：团队治理与更高配额（标准支持）
4. `Enterprise`：合规/SLA/专属治理（销售驱动）
5. `Platform Design Partner`：Layer 3 联合试点（限量）

## 5. 官网发布规划（基于现有 apps/marketing）

官网不是从零重建，采用“现有页面收敛 + 转化补强”。

## 5.1 信息架构（发布版）

1. `/` Home（定位 + 证据 + CTA）
2. `/open-core` Model（三层模型与边界）
3. `/product/personal` -> 建议命名文案为 `OSS / Builder`
4. `/product/enterprise` -> 建议命名文案为 `Cloud / Enterprise`
5. `/pricing`（分层包装、升级路径、销售入口）
6. `/developers`（API/SDK/Quickstart）
7. `/security`（安全与运维基线）
8. `/integrations`（OpenWork/LangGraph/MCP）
9. `/changelog`（可验证发布记录）
10. `/contact`

## 5.2 首页文案骨架（必须保留）

1. Hero：`Verifiable / Operable Memory Kernel`
2. 三原则：Audit-first / Derived async / Memory -> Policy
3. 三层模型：Open Core / Hosted / Platform
4. 证据区：Gate 命令 + SDK/Docker 发布件
5. 边界区：明确“做什么/不做什么”
6. 双 CTA：`Start OSS` + `Talk to Sales`

## 5.3 官网改造重点（4 周）

Week 1:

1. 统一命名（Personal/Enterprise 与 OSS/Cloud 对齐）
2. 上线边界矩阵（Open vs Hosted vs Platform）
3. 首页加入“谁该用 OSS、何时升级 Cloud”

Week 2:

1. Pricing 页面补齐套餐差异与升级触发条件
2. Contact 页面补齐 ICP 选择与意向分流
3. Changelog 页面绑定 release evidence 模板

Week 3:

1. Security 页面补齐合规与治理能力声明边界
2. Developers 页面强化 3 分钟路径与复制命令
3. Integrations 页面加入“典型接入架构图”

Week 4:

1. 全站 CTA 埋点与漏斗校验
2. 法务/术语一致性审校
3. 上线与回滚预案演练

## 5.4 官网核心指标（MVP）

1. `cta_start_oss_click`
2. `cta_start_cloud_click`
3. `cta_talk_to_sales_click`
4. `quickstart_complete`
5. `contact_submit`
6. `oss_to_cloud_intent`（从 OSS 页面进入销售或定价）

## 6. 180 天对外发布节奏

时间起点：`2026-02-23` 当周。

## Phase A（0-30 天）：Launch Foundation

目标：统一叙事与边界，官网可发布，OSS 转化路径清晰。

交付：

1. 对外边界页面上线（Open vs Hosted vs Platform）
2. 官网 CTA 与追踪事件可用
3. 首版 pricing 包装和 FAQ 完成
4. 每次发布使用统一 evidence 模板

Gate：

1. 官网关键页面可访问（移动端可用）
2. docs 链接全绿
3. 关键 CTA 事件有真实数据

## Phase B（31-90 天）：Hosted Revenue Motion

目标：把 Hosted 从“咨询叙事”变成“标准产品包”。

交付：

1. Cloud Builder / Team 包装与配额模型
2. 3 家 Design Partner 进入 Hosted PoC
3. 标准化销售资料（架构、SLO、治理边界）
4. 发布月度 evidence 报告（性能/稳定性/变更）

Gate：

1. 至少 1 家付费试用
2. Hosted 漏斗可追踪（线索->PoC->付费）
3. 生产门禁连续稳定通过

## Phase C（91-180 天）：Platform Wedge

目标：把 Layer 3 从路线图变成可验证的产品楔子。

交付：

1. Execution provenance 对外能力包
2. Multi-agent governance 首批试点
3. Platform Design Partner 方案（限量）
4. 季度平台白皮书与案例

Gate：

1. 至少 2 个平台化里程碑有客户侧证据
2. Layer 3 不影响 Layer 1/2 主线稳定性

## 7. 销售与市场动作（对外）

1. 内容主线：`Kernel Standard -> Hosted Operations -> Execution Platform`
2. 线索主攻：AI infra 团队、Agent 平台团队、企业内部 copilot 团队
3. 渠道优先：GitHub 技术扩散 + 文档 SEO + 集成伙伴共建
4. 销售素材统一三套：技术版、产品版、业务版（仓库已有模板）

## 8. 组织与运营机制

1. 产品、工程、GTM 每周一次 joint review
2. 所有对外声明必须附 evidence 链接
3. 无边界声明的功能不得对外发布
4. 若 Gate 出现 blocker，暂停新增叙事，优先稳定性修复

## 9. 未来 30 天执行清单（立即开始）

1. 完成官网命名统一：Personal/Enterprise 对齐 OSS/Cloud 术语
2. 在 `/open-core` 和 `/pricing` 增加可下载边界矩阵
3. 为 Contact 增加线索分级字段（Builder/Team/Enterprise/Platform）
4. 建立 monthly release evidence 页面（关联 `/changelog`）
5. 固化一份“OSS -> Cloud 升级触发条件”文档并站内可见

## 10. 该规划关联文档

1. `docs/COMMERCIAL_STRATEGY.md`
2. `docs/NARRATIVE_CANON.md`
3. `docs/GO_TO_MARKET_EXECUTION_PLAN.md`
4. `docs/WEBSITE_NEXTJS_HEROUI_SKELETON.md`
5. `docs/RELEASE_MATERIAL_PRODUCT.md`
6. `docs/RELEASE_MATERIAL_BUSINESS.md`
