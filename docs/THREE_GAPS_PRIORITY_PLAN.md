---
title: "Three Gaps Priority Plan"
---

# Three Gaps Priority Plan

## 背景
当前三项核心缺口：
1. 仍是单用户 Memory Kernel（缺少 multi-agent fabric/shared cognition）
2. 聚类仍偏 heuristic（缺少离线语义聚类与跨主题推理）
3. 规则冲突系统仍不够强（优先级/权重/条件覆盖/多规则推理）

## 优先级（按 ROI 与落地难度）

### P0（最高）：规则冲突治理增强
目标：让 ACTIVE/SHADOW 规则在冲突时可解释、可控、可演进。

工作项：
- [x] 引入规则排序元数据（priority/weight），并纳入最终 rank 计算。
- [x] 在 `/v1/memory/rules/evaluate` 输出中增加规则 rank 细节（evidence/priority/weight/specificity）。
- [x] 增加 `applied.conflict_explain`（冲突路径、赢家、输家、原因）。
- [x] 在 tool policy 解释中对 winner 使用统一 rank 语义（而非仅 pos-neg）。
- [x] 更新 API 合同文档并补充回归用例。

验收标准：
- 同一 context 命中多条互斥规则时，响应中能直接读出冲突路径和最终赢家。
- 提升某规则 priority 或 weight 后，赢家可按预期切换。
- `npm run build`、`npm run test:contract` 通过。

---

### P1：聚类从 heuristic 升级到“可插拔语义层”
目标：保持在线低延迟聚类，同时为离线高质量聚类铺路。

工作项：
- [x] 增加聚类策略抽象（online_knn / offline_hdbscan 占位接口）。
- [x] 新增 consolidation/merge 输入协议（候选 topic 对 + 证据分）。
- [x] 增加 cross-topic merge 冲突保护（negation/contradiction guard）。
- [x] 输出聚类质量指标（cohesion、drift、merge_rate）。

验收标准：
- 不改现有 API contract 的前提下，可切换聚类策略。
- consolidation 作业可生成可审计的 merge 建议与 commit 记录。

---

### P2：单体 Kernel 演进为 Multi-Agent Memory Fabric
目标：让多个 agent 共享可治理的记忆层，而不是彼此隔离副本。

工作项：
- [x] 定义 agent 维度上下文规范（agent.id/role/session_id）。
- [x] 增加 shared/private memory lane 语义（默认隔离，可显式共享）。
- [x] 增加跨 agent 读写审计字段（producer_agent / consumer_agent）。
- [x] 增加跨 agent 规则作用域（global/team/agent）。
- [x] 规则执行入口接入 lane 可见性过滤（`/rules/evaluate` 与 `/tools/select` 的 `agent_visibility_summary` 输出过滤统计）。
- [x] 增加 private rule owner 硬约束 + 历史修复作业（防止无 owner 私有规则继续写入）。

验收标准：
- 至少两个 agent 在同 scope 下可按 lane 共享/隔离 recall。
- 审计链可还原“谁写入、谁消费、谁触发规则”。

## 推进顺序
1. 先完成 P0（规则冲突治理）并稳定上线。
2. 再做 P1（聚类语义化升级）。
3. 最后推进 P2（multi-agent fabric）。

## 回归清单
- `npm run build`
- `npm run test:contract`
- `npm run docs:check`
- `curl /v1/memory/rules/evaluate`（构造冲突规则，验证 winner/explain）
- `curl /v1/memory/tools/select`（验证 tool 冲突摘要和最终选择一致）

## 当前推进状态
- P0: done (MVP)
- P1: done (MVP)
- P2: done (MVP)
