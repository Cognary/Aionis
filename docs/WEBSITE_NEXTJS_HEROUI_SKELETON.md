---
title: "Aionis 官网骨架清单（Next.js + HeroUI）"
---

# Aionis 官网骨架清单（Next.js + HeroUI）

Last updated: `2026-02-17`
Owner: `Aionis`

## 1. 技术选型结论

1. Framework: `Next.js` (App Router)
2. UI: `HeroUI` + 原生 `HTML/CSS` 组件优先
3. 内容策略: Marketing 站点与技术文档分离
4. 部署建议: `Vercel`（官网） + `docs` 独立路径（可同仓）

## 2. 站点目标（当前阶段）

1. 对外只公开 `Personal` 路线（可立即试用）
2. `Enterprise` 展示能力但引导邮件咨询
3. 强化“3 分钟可上手”与“生产可运行”双信号
4. 所有产品声明可追溯到现有文档/运行脚本

## 3. 信息架构（IA）

1. `/` Home
2. `/product/personal`
3. `/product/enterprise`
4. `/developers`
5. `/docs`（跳转或嵌入文档入口）
6. `/pricing`
7. `/integrations`
8. `/security`
9. `/changelog`
10. `/contact`

## 4. 页面骨架（每页必须有 CTA）

### 4.1 Home

1. Hero: 一句话价值 + 主次 CTA
2. Problem -> Solution 三段
3. 核心能力卡片（Memory Graph / Recall / Rules / Ops）
4. Quickstart 代码片段（写 -> 召回）
5. Integrations logo 区（OpenWork/LangGraph/MCP）
6. Footer：Docs / SDK / Docker / Contact

CTA:
1. `Start Personal`
2. `Talk to Enterprise`

### 4.2 Product Personal

1. Who is this for
2. 3-minute onboarding steps
3. SDK examples (TS + Python)
4. Local Docker path
5. FAQ（端口、Auth、fake embedding 行为）

CTA:
1. `Read Onboarding`
2. `Install SDK`

### 4.3 Product Enterprise

1. 多租户/团队隔离能力描述
2. 规则系统与策略治理
3. 运行稳定性与运维能力
4. 典型接入流程（评估 -> PoC -> 上线）

CTA:
1. `Contact Sales`（邮件/表单）

### 4.4 Developers

1. Core endpoints 三板斧
2. SDK 安装入口
3. API contract 入口
4. 集成入口（MCP/OpenWork/LangGraph）

CTA:
1. `Open API Docs`
2. `Run Quickstart`

### 4.5 Pricing

1. Personal（公开）
2. Enterprise（定制）
3. 差异项（SLA、支持、部署模式）

CTA:
1. `Start Personal`
2. `Talk to Sales`

### 4.6 Integrations

1. OpenWork
2. LangGraph
3. MCP
4. 每个集成 3 步接入

### 4.7 Security

1. Auth 模式说明（api_key / jwt）
2. 速率限制与配额
3. 租户隔离与审计
4. 生产最低安全基线

### 4.8 Changelog

1. 发布版本时间线
2. SDK / Docker / Core API 分栏
3. 每个版本链接到详细变更

### 4.9 Contact

1. 企业咨询表单
2. 联系邮箱
3. 预期回复时间

## 5. 目录结构（建议）

```txt
apps/marketing/
  app/
    (site)/
      page.tsx                    # Home
      product/personal/page.tsx
      product/enterprise/page.tsx
      developers/page.tsx
      pricing/page.tsx
      integrations/page.tsx
      security/page.tsx
      changelog/page.tsx
      contact/page.tsx
    docs/page.tsx                 # docs 入口跳转
    layout.tsx
    globals.css
  components/
    marketing/
      hero.tsx
      section.tsx
      feature-grid.tsx
      cta-band.tsx
      code-preview.tsx
      metric-cards.tsx
      faq.tsx
      site-header.tsx
      site-footer.tsx
    shared/
      logo.tsx
      badge.tsx
      link-card.tsx
  lib/
    content/
      home.ts
      personal.ts
      enterprise.ts
      pricing.ts
      integrations.ts
      security.ts
      changelog.ts
    seo.ts
    analytics.ts
  public/
    og/
    logos/
    favicon/
```

## 6. HeroUI 与原生组件分工

1. HeroUI 用于：`Navbar`, `Button`, `Card`, `Tabs`, `Accordion`, `Input`, `Textarea`, `Modal`
2. 原生组件用于：大段排版、代码块、对比表、营销 section 布局
3. 原则：可读性优先，减少“过度组件化”导致的品牌稀释

## 7. 设计与品牌规范（OpenAI 风格借鉴）

1. 结构节奏借鉴：大标题 -> 价值点 -> 快速行动
2. 不复制视觉：使用自有配色和字重体系
3. 文案规则：短句、动词开头、可执行 CTA
4. 每屏只保留 1 个主任务，避免多目标冲突

## 8. 内容映射（复用现有文档）

1. Onboarding: [ONBOARDING_5MIN.md](./ONBOARDING_5MIN.md)
2. API: [API_CONTRACT.md](./API_CONTRACT.md)
3. SDK: [SDK.md](./SDK.md)
4. SDK matrix: [SDK_COMPATIBILITY_MATRIX.md](./SDK_COMPATIBILITY_MATRIX.md)
5. Integrations:
   1. [OPENWORK_INTEGRATION.md](./OPENWORK_INTEGRATION.md)
   2. [LANGGRAPH_INTEGRATION.md](./LANGGRAPH_INTEGRATION.md)
6. Ops/Security:
   1. [OPERATOR_RUNBOOK.md](./OPERATOR_RUNBOOK.md)
   2. [E2E_REGRESSION.md](./E2E_REGRESSION.md)
7. Performance: [PERFORMANCE_BASELINE.md](./PERFORMANCE_BASELINE.md)

## 9. 埋点与转化指标（MVP）

1. `cta_start_personal_click`
2. `cta_talk_to_sales_click`
3. `sdk_install_copy`
4. `quickstart_complete`（触发条件：看到成功响应示例）
5. `contact_submit`

## 10. 4 周执行清单

### Week 1（信息架构 + 文案）

1. 完成 sitemap 与导航
2. 完成 Home/Personal/Enterprise 文案 v1
3. 完成品牌基础样式（色板、字号、间距）

### Week 2（页面骨架开发）

1. 完成 Home + Product 两页
2. 完成 Developers + Pricing
3. 接入基础 SEO（title/description/og）

### Week 3（能力页 + 表单）

1. 完成 Integrations + Security + Changelog
2. 完成 Contact 表单（邮件转发/CRM）
3. 接入基础 analytics

### Week 4（上线前收敛）

1. 性能优化（LCP/CLS）
2. 文案法务审校
3. 上线检查与回滚预案

## 11. 上线验收标准（Go/No-Go）

1. 所有页面可访问，移动端不破版
2. Lighthouse（主页）:
   1. Performance >= 85
   2. SEO >= 90
3. CTA 埋点有数据
4. Contact 链路可用
5. 所有 docs 链接有效

## 12. 下一步（你现在可直接做）

1. 新建 `apps/marketing`（Next.js App Router）
2. 先落地 3 页：`/`, `/product/personal`, `/product/enterprise`
3. 第一个上线版本只要求：
   1. 清晰定位
   2. 可点 CTA
   3. 文档入口通畅
