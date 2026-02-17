# Product / Scale / Cognition Priority Plan

Last updated: `2026-02-16`
Owner: `Aionis Core`
Status: `active`

## 1. Problem Statement

当前系统内核能力已经具备（图记忆、规则、反馈、长期记忆基础），但商业化落地还存在三个优先缺口：

1. 产品化缺口：还不是“开箱即用 + 一眼可见价值”的体验。
2. 平台化缺口：SDK 标准化、多 agent/多租户治理仍是 MVP 级别。
3. 规模化缺口：缺少大规模数据压测与容量基线，无法给出生产级承诺。

并且在认知层面还处于“部分实现”：

1. 长期结构重组（compression/consolidation 已有，但需自动化与策略化）
2. 多层记忆抽象（tier 有了，记忆类型抽象还不完整）
3. 自动概念形成（有 rollup，但缺少更强语义归纳）
4. 记忆权重进化（有 salience/feedback，但缺少统一演化模型）

## 2. Priority Principles

优先级按以下原则排序：

1. 先做“可用性与可感知价值”（决定 adoption）。
2. 再做“平台化接口”（决定集成速度与生态）。
3. 再做“规模与可靠性证明”（决定生产信任）。
4. 最后做“认知质量跃迁”（决定长期护城河）。

## 3. Current Baseline (Confirmed)

已实现：

1. 记忆节点/边/提交链
2. 派生聚类与自组织 Topic
3. 规则形成（DRAFT/SHADOW/ACTIVE）与冲突解释
4. 反馈学习（rule/tool feedback）
5. 长期记忆基础（tier、decay、compression、consolidation、rehydrate）

仍需强化：

1. 开箱即用路径与 killer demo
2. 标准化 SDK（强类型、错误语义、重试策略）
3. 多租户治理（不是只有 scope）
4. 大规模性能与稳定性验证
5. 认知层高级能力（结构重组、多层抽象、自动概念、权重演化）

## 4. Execution Roadmap (Priority Ordered)

## Phase A (P0): Productization / Out-of-Box / Killer Demo

Goal:
把“能用”变成“5 分钟看懂价值并跑通”。

Work items:

1. One-command quickstart:
   - `make quickstart` 一键拉起 DB + migrate + API + worker + demo seed。
2. Demo dataset + script:
   - 新增 `examples/killer_demo.sh`，输出前后对比（无记忆 vs 有记忆）。
3. Demo narrative:
   - 3 个固定故事：项目协作、规则约束、跨会话长期记忆。
4. Value dashboard (minimal):
   - 输出 recall 命中率、context 压缩率、规则命中率、反馈正负比。
5. 文档入口重构:
   - README 顶部加入“3 分钟体验路径”。

Acceptance:

1. 新用户 5 分钟内跑通 demo。
2. demo 输出中明确体现“有记忆比无记忆更好”。
3. 所有命令可在新环境重复成功。

Risks:

1. 过度脚本化掩盖真实依赖。
2. demo 结果不稳定导致“价值不可复现”。

Gate:

1. `npm run build`
2. `npm run docs:check`
3. `bash examples/killer_demo.sh`

Progress snapshot (`2026-02-16`):

1. done: `make quickstart` + `examples/killer_demo.sh` + `examples/value_dashboard.sh` + cleanup script.
2. done: README 顶部 3 分钟路径与 demo 清理路径。
3. done: killer demo 输出已覆盖 3 条叙事线（协作记忆、规则约束、跨会话记忆）。

## Phase B (P1): SDK Standardization

Goal:
把 HTTP API 变成“稳定、可类型化、可维护”的开发者体验。

Work items:

1. 发布 `@aionis/sdk`（TypeScript first）。
2. 统一 SDK 方法：
   - `write`, `recall`, `recallText`, `rulesEvaluate`, `toolsSelect`, `toolsFeedback`。
3. 统一错误类型：
   - 映射 API `error/code/message/details` 到 typed errors。
4. 内置重试策略：
   - 对 429/5xx 提供可配置退避。
5. 内置请求追踪：
   - 自动携带/透传 `x-request-id`。
6. SDK examples:
   - Node CLI、OpenWork/agent integration、server middleware。
7. 版本策略：
   - semver + changelog + contract compatibility matrix。

Acceptance:

1. 任意调用不再直接拼 `curl`/JSON 字符串。
2. API 合同字段与 SDK 类型一一对应。
3. 错误语义可被上层业务稳定消费。

Risks:

1. SDK 与 API contract 漂移。
2. 早期过度抽象导致后续迭代成本上升。

Gate:

1. contract smoke + SDK smoke 双通过。
2. 至少 2 个 demo 用 SDK 替换直连 HTTP。

Progress snapshot (`2026-02-16`):

1. done (MVP): `src/sdk` TypeScript client，覆盖 `write/recall/recallText/rulesEvaluate/toolsSelect/toolsFeedback`。
2. done (MVP): 统一错误类型 + 429/5xx 退避重试 + `x-request-id` 透传。
3. done (MVP): `npm run sdk:smoke` 与 `npm run sdk:tools-feedback-smoke`。
4. done (MVP): 提炼独立可发布包骨架 `packages/sdk`（`@aionis/sdk`），含 build/pack dry-run。
5. done (MVP): 增加 SDK changelog + compatibility matrix。
6. done (MVP): 两个 demo 入口已切到 SDK（`examples/rules_evaluate.sh`、`examples/tools_select.sh`）。
7. done (MVP): 建立 SDK CI + publish workflow 与 release runbook。
8. pending: 首次正式发布到 npm registry（需要生产 token 与版本策略执行）。

## Phase C (P2): Multi-Agent to Multi-Tenant

Goal:
从“多 agent MVP”升级到“多租户可治理平台”。

Work items:

1. Tenant 模型：
   - 在 `scope` 之外引入 `tenant_id`（逻辑或物理隔离策略二选一）。
2. 鉴权与隔离：
   - API key/JWT -> tenant/agent/team 映射。
3. 读写授权矩阵：
   - shared/private + team + tenant boundary 全量矩阵测试。
4. 审计链完善：
   - 记录 `tenant_id`, `producer`, `consumer`, `rule_source`。
5. 管理接口：
   - tenant 配置、配额、密钥轮换、吊销。

Acceptance:

1. 任何跨 tenant 访问默认拒绝。
2. 审计可回答“谁在何 tenant 写入/读取/触发规则”。
3. 现有单 tenant 能平滑迁移。

Risks:

1. schema 改动影响现网数据。
2. 权限规则复杂导致漏配或误拒。

Gate:

1. tenant isolation e2e 必过。
2. consistency-check 增加 cross-tenant violation=0。

Progress snapshot (`2026-02-16`):

1. done (MVP): API contract 已支持 `tenant_id`（body）与 `X-Tenant-Id`（header fallback）。
2. done (MVP): write/recall/rules/tools/feedback/rehydrate/activate 主链路接入 tenant-aware scope key，默认 tenant 完全兼容旧行为。
3. done (MVP): SDK 类型与文档已补齐 `tenant_id` 入参/出参。
4. done (MVP): API key/JWT -> tenant/agent/team 映射（`X-Api-Key` / `Authorization: Bearer`）与身份字段防伪造约束。
5. done (MVP): tenant-level request quotas（recall/write/debug 分桶）。
6. done (MVP): `job:consistency-check` 增加 cross-tenant violation 检查项（edge/rule/feedback/outbox/commit chain + scope key 格式）。
7. done (MVP): tenant isolation e2e 套件 `npm run e2e:phasec-tenant`（包含规则隔离断言与 cross-tenant checks=0 断言）。

## Phase D (P3): Large-Scale Validation

Goal:
给出生产级容量、延迟、稳定性证据。

Work items:

1. Synthetic data generator:
   - 10^5 / 10^6 / 10^7 级别节点边数据集。
2. Benchmark suite:
   - write p50/p95/p99
   - recall p50/p95/p99
   - worker throughput
3. Failure drills:
   - embedding provider 超时/限流/故障
   - outbox 堵塞/重放
4. Capacity baseline:
   - index size, storage growth, vacuum/maintenance windows。
5. 发布性能报告模板：
   - 可对比不同配置（单机/分片/云数据库）。

Acceptance:

1. 形成 `Performance Report v1`（可复现实验脚本）。
2. 给出推荐 SLO 与容量边界。
3. 关键路径在目标规模下无明显退化断点。

Risks:

1. 压测环境与真实环境偏差。
2. 过拟合某一数据库参数组合。

Gate:

1. `sql/explain_baseline.sql` + 压测脚本输出可复现。
2. `docs/PERFORMANCE_BASELINE.md` 升级到“规模化版本”。

Progress snapshot (`2026-02-16`):

1. done (MVP): `job:perf-seed`（tenant-aware synthetic dataset generator，commit-tracked，支持 reset）。
2. done (MVP): `job:perf-benchmark`（recall/write p50/p95/p99 + RPS + status breakdown）。
3. done (MVP): `job:perf-worker-benchmark`（outbox worker processed/sec 与 backlog delta）。
4. done (MVP): `job:perf-report`（从 artifacts 自动汇总 `Performance Report v1` markdown）。
5. done (MVP): `perf:phase-d-matrix` 一键矩阵执行（multi-scale seed/bench/explain/report）。
6. done (MVP): `docs/PERFORMANCE_BASELINE.md` 升级为规模化可复现流程（seed/benchmark/worker/explain/report template）。
7. pending: 10^6/10^7 级别真实运行结果沉淀与对外发布版 `Performance Report v1`。

## Phase E (P4): Long-Term Structure Reorganization (Complete)

Goal:
把“已有长期记忆组件”升级为自动化、闭环、可控策略系统。

Work items:

1. 自动编排：
   - decay -> compression -> consolidation -> redirect -> quality gate。
2. 策略联动：
   - 根据质量指标自动调节 job 频率/阈值。
3. 冲突策略：
   - consolidation 与 rule lifecycle 冲突时的优先级规则。
4. 审计视图：
   - 展示“哪些结构重组改变了 recall 输出”。

Acceptance:

1. 不依赖人工手工串行执行 job。
2. 同一输入下重跑结果稳定、可解释。

## Phase F (P5): Multi-Layer Memory Abstraction

Goal:
建立明确的记忆分层语义，而不只是 tier 热度管理。

Work items:

1. 抽象层定义：
   - episodic, semantic, procedural, self-model。
2. 节点映射策略：
   - 现有 type/slots 如何映射到多层抽象。
3. 检索融合策略：
   - 不同层在 recall 中的权重与拼接顺序。
4. 层间转换：
   - event -> concept/procedure 的条件与保真链路。

Acceptance:

1. API 能返回层标签（受 `include_meta` 控制）。
2. 至少 2 个真实场景证明分层带来 recall 质量提升。

## Phase G (P6): Automatic Concept Formation + Weight Evolution

Goal:
让概念形成与权重演化从“规则化”走向“学习化”。

Work items:

1. 概念候选生成：
   - 从高频事件簇自动提取概念候选。
2. 概念合并/拆分：
   - 语义相似 + 冲突检测 + 时间演化。
3. 统一权重模型：
   - salience + feedback + access recency + decay 联合打分。
4. 在线/离线双通道：
   - 在线快速更新，离线批量校正。

Acceptance:

1. 概念质量指标可量化提升（覆盖率、重复率、漂移率）。
2. 权重演化可解释（每次变化可追溯输入信号）。

## 5. 90-Day Milestone Plan

1. Day 0-14: 完成 Phase A（killer demo + out-of-box）。
2. Day 15-35: 完成 Phase B（SDK v1）。
3. Day 36-60: 完成 Phase C（多租户治理基础）。
4. Day 61-90: 完成 Phase D（规模化验证与报告）。

Phase E/F/G 进入下一周期，按数据反馈滚动推进。

## 6. KPI / Success Metrics

Product KPI:

1. Time-to-first-value <= 5 分钟
2. demo 成功率 >= 95%

Platform KPI:

1. SDK 覆盖核心 API >= 95%
2. 多租户隔离违规 = 0

Scale KPI:

1. recall p95 在目标数据规模下满足设定 SLO
2. outbox 失败积压可在运维窗口内清零

Cognition KPI:

1. context 压缩率持续优化
2. 概念重复率下降、漂移率可控
3. 规则正反馈率上升

## 7. Definition of Done (Global)

任一 Phase 完成必须同时满足：

1. 代码与文档同步更新。
2. E2E 回归脚本可复现。
3. consistency-check 无新增 error。
4. 关键指标有前后对比数据。
5. 变更可回滚且有明确操作说明。

## 8. Commands (Common Gate)

```bash
cd /Users/lucio/Desktop/Aionis
npm run build
npm run test:contract
npm run docs:check
npm run job:consistency-check
npm run job:health-gate -- --strict-warnings
```
