# Aionis Go-To-Market 120 天执行计划（四阶段）

## 0. 文档定位

本文件是 Aionis 从“工程可用”走向“市场可卖、可部署、可复制”的单一执行计划。  
周期：120 天（约 17 周）  
目标：在 120 天内达成可对外规模化试点与可复用交付能力。

## 0.1 最新执行快照（2026-02-17）

1. Phase 1 Gate A 已通过。
2. Phase 2 Gate B（阻断模式，含 API smoke）已通过。  
   证据：`/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_b/20260217_140548/summary.json`
3. Phase2 integrations 已通过。  
   证据：`/Users/lucio/Desktop/Aionis/artifacts/gtm/phase2_integrations/20260217_140317/summary.json`
4. Phase 3 Gate C 在准生产参数下已有通过样本（含 `required_scale=100000`、`error_rate_pass=true`）。  
   证据：`/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_172017/summary.json`
5. 最近一轮快速非阻断样本出现 `error_rate_pass=false`，说明 Gate C 仍需持续稳定化。  
   证据：`/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_172832/summary.json`
6. 1e6 规模仅有 seed 证据，完整 Gate/报告尚未收口。  
   证据：`/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_143333/perf/seed_1000000.json`
7. 当前建议：进入 Phase 3 收口（1e6 可复现报告 + 14 天无 blocker）并并行启动 Phase 4 试点准备。

---

## 1. 北极星目标（North Star）

120 天结束时必须同时满足：

1. 产品化：新用户 30 分钟内完成首次有效价值（Write + Recall + 可解释规则命中）。
2. 生态化：TS/Python SDK GA，文档与示例覆盖核心接口。
3. 生产化：回归与预检流程稳定，达到对外试点可用的 SLO。
4. 商业化：至少 3 家设计合作伙伴（Design Partners）进入正式 PoC，且有可量化业务收益。

---

## 2. 范围与非范围

### 2.1 本周期范围（In Scope）

1. 开箱体验（docker compose、one-click regression、starter demos）。
2. 两个 killer demo（面向业务价值展示）。
3. SDK 标准化（TS/Python）与兼容矩阵。
4. 生产可靠性（SLO、健康门禁、故障演练、性能报告）。
5. 试点交付机制（PoC 包、运营 runbook、升级/回滚策略）。

### 2.2 本周期非范围（Out of Scope）

1. 全功能多区域全球分布式部署。
2. 全自动自学习闭环（无需人工策略治理）。
3. 全行业通用 UI 产品（本期以 API/SDK/集成为主）。

---

## 3. 四阶段总览（120 天）

## Phase 1（Day 1-30）开箱与首价值闭环

目标：把“难接入”问题降到最低，做出可见价值。

交付：

1. `docker compose up` 一键运行（API + worker + Postgres + pgvector）。
2. `15 分钟快速上手`（文档+脚本+视频）。
3. Killer Demo A：跨会话业务记忆（客服/知识助手）。
4. Killer Demo B：规则驱动工具选择（coding/agent 场景）。
5. 首次价值漏斗监控（TTFV, 激活率, 错误率）。

验收门槛：

1. 新用户 TTFV（time to first value）P50 < 30 分钟。
2. Demo 脚本在干净环境连续 20 次通过率 >= 95%。
3. 回归脚本（无 perf）稳定通过。

---

## Phase 2（Day 31-60）SDK 标准化与生态接入

目标：把“能用”变成“可规模复用”。

交付：

1. TypeScript SDK v1 GA（核心接口全覆盖）。
2. Python SDK v1 GA（同等语义与错误模型）。
3. OpenWork / LangGraph / MCP 适配示例（至少 2 个完整样例）。
4. 兼容矩阵与版本策略（服务端/SDK 对齐）。
5. SDK 回归测试与契约测试入 CI。

验收门槛：

1. TS/Python SDK 均有生产级 release tag。
2. 核心 API 的 SDK 覆盖率 100%（write/recall/rules/tools/feedback）。
3. 3 个外部项目在 1 天内完成接入验证。

---

## Phase 3（Day 61-90）生产稳定性与规模证明

目标：把“可复用”变成“可上线”。

交付：

1. SLO 基线（write/recall p95、可用性、错误预算）。
2. 10^6 数据规模真实性能报告（必须可复现）。
3. 可靠性机制完善（限流、配额、熔断、回退策略）。
4. 运行治理（备份/恢复演练、故障注入、灾备流程）。
5. 成本剖析（存储、向量检索、worker 开销）。

验收门槛：

1. 连续 14 天通过健康门禁（无 blocker）。
2. 1e6 规模下 recall/write 达到目标 SLO（见第 7 节）。
3. 重大故障演练（服务不可用/embedding provider 异常）可恢复。

---

## Phase 4（Day 91-120）商业化试点与可交付产品包

目标：把“可上线”变成“可售卖”。

交付：

1. Design Partner 试点包（部署、集成、SLO、运维手册）。
2. 对外标准材料（架构白皮书、性能报告、安全与边界说明）。
3. PoC 交付模板（目标/KPI/里程碑/验收模板）。
4. 商业化基础（版本打包、许可策略、服务支持等级）。
5. 首轮客户成功案例沉淀（可匿名）。

验收门槛：

1. 至少 3 家 Design Partner 启动 PoC。
2. 至少 1 家进入付费试用或签署下一阶段意向。
3. 产品发布清单（发布、回滚、支持）可由非核心开发执行。

---

## 4. 周级执行节奏（17 周）

## Week 1-2（启动期）

1. 明确 ICP（优先：Agent 平台团队、工作流编排团队）。
2. 固化 demo 数据集与 benchmark 数据集。
3. 完成 one-click 本地环境与 CI smoke。

## Week 3-4（Phase 1 收口）

1. 发布快速上手文档与双 demo。
2. 建立 activation 漏斗监控面板。
3. Phase 1 验收评审。

## Week 5-6（SDK 骨架）

1. TS SDK 核心模块完成。
2. Python SDK 核心模块完成。
3. 契约测试对齐。

## Week 7-8（Phase 2 收口）

1. SDK 文档、示例、错误码统一。
2. 生态适配器样例完成。
3. Phase 2 验收评审。

## Week 9-10（稳定性强化）

1. 完成 SLO 指标采集、告警与阈值。
2. 完成限流/配额策略验证。
3. perf profile 固化（recall_slo/write_slo）。

## Week 11-12（规模验证）

1. 1e6 数据规模完整压测与报告。
2. 故障注入演练（provider down / worker 积压）。
3. 备份恢复演练报告。

## Week 13（Phase 3 收口）

1. 生产门禁审计（回归、preflight、健康阈值）。
2. Phase 3 验收评审。

## Week 14-15（商业化准备）

1. Design Partner 试点包打磨。
2. 交付模板、支持流程、问题升级路径定稿。

## Week 16-17（Phase 4 收口）

1. 启动/推进 3 家试点。
2. 汇总试点 KPI 与下一周期路线。
3. 120 天复盘与下一季度计划冻结。

---

## 5. 工作流与负责人模板（每项任务必填）

每个任务卡必须包含：

1. Owner（唯一责任人）
2. Start / Due Date
3. Definition of Done（可量化）
4. 风险与依赖
5. 回滚/降级方案
6. 证据链接（PR、报告、日志、录屏）

建议用以下标签：

1. `GTM-P1` / `GTM-P2` / `GTM-P3` / `GTM-P4`
2. `BLOCKER` / `RISK` / `SLO` / `SDK` / `DEMO` / `OPS`

---

## 6. 关键指标体系（每周必看）

## 6.1 产品激活指标

1. TTFV（P50/P90）
2. 首次接入成功率
3. Demo 跑通率

## 6.2 可靠性指标

1. `write` p95 / p99
2. `recall_text` p95 / p99
3. 5xx 错误率
4. outbox backlog 深度与恢复时间

## 6.3 交付指标

1. SDK 版本发布节奏
2. 文档覆盖率（核心路径）
3. 回归门禁通过率

## 6.4 商业化指标

1. 有效线索数（ICP）
2. PoC 启动数/完成数
3. PoC->付费转化率

---

## 7. SLO 建议基线（试点前必须达成）

可按环境调整，建议先采用：

1. Availability（月度）>= 99.5%
2. `write` p95 <= 300ms（不含异步派生）
3. `recall_text` p95 <= 800ms（1e6 规模目标，标准查询）
4. 5xx 错误率 <= 0.5%
5. outbox 延迟（P95）<= 60s

说明：若任一 SLO 连续两周未达标，则冻结新功能，进入稳定性冲刺。

---

## 8. 风险清单与应对

## R1：开箱路径复杂，流失高

应对：

1. 一键脚本 + starter repo + 录屏演示。
2. 文档中只保留“黄金路径”，高级参数移至附录。

## R2：性能报告不可复现

应对：

1. perf 脚本固定 profile 与参数快照。
2. 每次报告保留 artifacts 与环境元数据。

## R3：规则系统复杂导致误配

应对：

1. 规则冲突可解释输出默认开启。
2. 规则变更前先 shadow 观测，后 active。

## R4：生产运维负担高

应对：

1. 预检脚本标准化（preflight/regression）。
2. operator runbook 与值班流程模板化。

## R5：商业化信号弱

应对：

1. 强制每个 PoC 定义业务 KPI。
2. 每两周复盘：继续/调整/终止。

---

## 9. 里程碑检查点（Gate Review）

## Gate A（Day 30）

1. 开箱体验可复现
2. 双 demo 可演示
3. 激活数据可追踪

## Gate B（Day 60）

1. TS/Python SDK GA
2. 生态接入样例可跑通
3. 契约测试稳定

## Gate C（Day 90）

1. SLO 达标
2. 1e6 报告发布
3. 生产门禁可稳定执行

## Gate D（Day 120）

1. 3 家试点启动
2. 至少 1 家进入付费阶段
3. 下周期 roadmap 基于真实试点反馈冻结

---

## 10. 执行纪律（避免后续混乱）

1. 单周只设一个“主目标”，避免多头推进。
2. 所有“已完成”必须附证据链接。
3. 无量化验收标准的任务不得标记完成。
4. 若出现 P0 故障，暂停新增功能，优先修复。
5. 每周固定一次 GTM 评审（产品+工程+运营）。

---

## 11. 本周立即行动（Next 7 Days）

1. 生成 `Phase 1` 的任务分解清单（按 owner 分配）。
2. 固化 one-click 新手路径并录制 10 分钟演示视频。
3. 锁定两个 killer demo 的“成功截图/指标”模板。
4. 搭建周报模板（指标、风险、决策）。
5. 预约第一个 Gate A 评审时间（Day 30）。

---

## 12. 变更记录

1. v1.0（2026-02-16）：创建 120 天四阶段 GTM 执行计划。
2. v1.1（2026-02-17）：同步 Gate C 阻断通过样本与最新 Phase 2/3 状态证据。
3. v1.2（2026-02-17）：补充最新 Gate C 非阻断回归结果（error_rate 未通过）并更新 Phase 3 风险描述。

---

## 13. 执行状态快照（截至 2026-02-17）

说明：以下状态基于仓库内可复现证据（脚本、workflow、artifact）。  
状态定义：`completed`（已达成）、`partial`（已落地但未达验收门槛）、`not_started`（尚未形成可验收交付）。

## 13.1 Phase 1（Day 1-30）开箱与首价值闭环

状态：`completed`

已完成：

1. Phase 1 执行看板与命令集已落地：`/Users/lucio/Desktop/Aionis/docs/GTM_PHASE1_EXECUTION_BOARD.md`
2. Gate A 自动化与周报/修复计划链路已落地：
   - `/Users/lucio/Desktop/Aionis/scripts/gtm/gate-a-check.sh`
   - `/Users/lucio/Desktop/Aionis/scripts/gtm/phase1-ci-gate.sh`
   - `/Users/lucio/Desktop/Aionis/scripts/gtm/phase1-weekly-report.sh`
3. CI workflow 已存在：`/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase1-gate.yml`

验收证据（通过）：

1. Gate A 通过：`/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_a/20260217_132642/summary.json`
2. CI Gate（含 threshold/review/fix-export）通过：`/Users/lucio/Desktop/Aionis/artifacts/gtm/ci_gate/20260217_133644/summary.json`
3. 关键指标达标：
   - `gate_pass_rate=1.0`（3/3）
   - `ttfv_p50_ms=2877`
   - `go_no_go=true`

## 13.2 Phase 2（Day 31-60）SDK 标准化与生态接入

状态：`partial`

已完成：

1. TS SDK 流程齐备（build/release-check/smoke）：
   - `/Users/lucio/Desktop/Aionis/packages/sdk`
   - `/Users/lucio/Desktop/Aionis/scripts/sdk-release-check.sh`
2. Python SDK 已落地（核心接口 + 错误模型 + retry）：
   - `/Users/lucio/Desktop/Aionis/packages/python-sdk`
   - `/Users/lucio/Desktop/Aionis/scripts/sdk-python-release-check.sh`
3. Gate B 自动化已落地，且有通过样本：
   - `/Users/lucio/Desktop/Aionis/scripts/gtm/gate-b-check.sh`
   - `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_b/20260217_140548/summary.json`
4. 相关 CI workflow 已补齐：
   - `/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase2-gate.yml`
   - `/Users/lucio/Desktop/Aionis/.github/workflows/sdk-ci.yml`
   - `/Users/lucio/Desktop/Aionis/.github/workflows/sdk-py-publish.yml`
5. Phase2 生态接入样例（OpenWork/LangGraph/MCP）通过样本已沉淀：
   - `/Users/lucio/Desktop/Aionis/artifacts/gtm/phase2_integrations/20260217_140317/summary.json`

未完成（阻塞 Day-60 验收）：

1. TS/Python SDK 的“对外生产发布闭环”尚未形成稳定验收证据（当前以流程与 dry-run 为主）。
2. “3 个外部项目 1 天内完成接入验证”暂无可审计记录。
3. 持续性发布稳定证据不足（仅有点状通过样本，缺少连续周期发布验收包）。

## 13.3 Phase 3（Day 61-90）生产稳定性与规模证明

状态：`partial`

已完成：

1. 回归、preflight、health gate、一致性检查已形成标准链路：
   - `/Users/lucio/Desktop/Aionis/scripts/regression-oneclick.sh`
   - `/Users/lucio/Desktop/Aionis/scripts/prod-preflight.sh`
   - `/Users/lucio/Desktop/Aionis/scripts/health-gate.sh`
   - `/Users/lucio/Desktop/Aionis/src/jobs/consistency-check.ts`
2. perf matrix + 报告生成链路已落地：
   - `/Users/lucio/Desktop/Aionis/scripts/perf/phase-d-matrix.sh`
   - `/Users/lucio/Desktop/Aionis/src/jobs/perf-report.ts`
3. 最近一轮无 perf 阶段回归门禁可通过：
   - `/Users/lucio/Desktop/Aionis/artifacts/regression/20260217_012624/summary.json`
4. Gate C（Day-90）自动化脚本与执行看板已落地：
   - `/Users/lucio/Desktop/Aionis/scripts/gtm/gate-c-check.sh`
   - `/Users/lucio/Desktop/Aionis/docs/GTM_PHASE3_EXECUTION_BOARD.md`
   - `/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase3-gate.yml`
5. Gate C（阻断模式）已有通过样本（含 error_rate 通过）：
   - `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_172017/summary.json`
6. perf benchmark 已加入 transport error 硬门禁（避免 `error:*` 假快结果）：
   - `/Users/lucio/Desktop/Aionis/src/jobs/perf-benchmark.ts`
   - `/Users/lucio/Desktop/Aionis/scripts/perf/phase-d-matrix.sh`
7. 最新快速非阻断 Gate C 样本可用于持续监控（当前 `error_rate_pass=false`）：
   - `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/20260217_172832/summary.json`

未完成（阻塞 Day-90 验收）：

1. 1e6 规模可复现性能报告尚未达成并固化。
2. 在默认限流配置下，`recall_slo` 仍可能出现 429 主导，需要固化“perf 专用限流模板/运行档位”以降低环境耦合。
3. Gate C 阻断模式（`GATEC_FAIL_ON_FAIL=true`）稳定通过样本仍需持续沉淀（含 `required_scale=1000000` 完整链路）。
4. “连续 14 天无 blocker 门禁”暂无完整证据链。

## 13.4 Phase 4（Day 91-120）商业化试点与可交付产品包

状态：`not_started`

已完成（基础材料）：

1. 技术与运营基础文档已具备：
   - `/Users/lucio/Desktop/Aionis/docs/OPERATOR_RUNBOOK.md`
   - `/Users/lucio/Desktop/Aionis/docs/OPENWORK_INTEGRATION.md`
   - `/Users/lucio/Desktop/Aionis/docs/AIONIS_MEMORY_GRAPH_PAPER_CN.md`

未完成（核心商业里程碑）：

1. 至少 3 家 Design Partner 启动 PoC：暂无证据。
2. 至少 1 家进入付费试用/下一阶段意向：暂无证据。
3. 非核心开发可独立执行发布/回滚/支持流程：暂无完整演练验收包。

## 13.5 当前结论

1. 总体状态：`Phase 1 completed / Phase 2 partial / Phase 3 partial / Phase 4 not_started`。
2. 下一步优先顺序：
   1. 先补齐 Phase 2 的外部发布与外部接入验收证据；
   2. 再收口 Phase 3（`required_scale=1000000` + 14 天无 blocker + 故障演练报告）；
   3. 并行启动 Phase 4 的 Design Partner 试点包与首批客户推进。
