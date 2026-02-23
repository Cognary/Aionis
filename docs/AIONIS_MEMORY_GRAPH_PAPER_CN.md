---
title: "Aionis Memory Graph：面向智能体执行的可验证、自组织长期记忆系统（系统论文稿）"
---

# Aionis Memory Graph：面向智能体执行的可验证、自组织长期记忆系统（系统论文稿）

> 版本：v0.1（与当前仓库实现对齐的“系统论文级”说明文稿）  
> 适用：内部技术白皮书 / 论文式系统稿（可进一步改写为 arXiv/会议投稿格式）  
> 代码对应：本仓库（TypeScript + Fastify + Postgres/pgvector）

## 摘要

大模型智能体在复杂任务中面临“上下文短期性”与“可追溯性不足”的结构性矛盾：一方面，模型需要跨会话的长期偏好、策略、证据与项目状态；另一方面，常见“向量库 + RAG”方案往往缺乏可解释的组织结构、可演化的记忆治理、以及面向生产运营的硬约束（输出边界、幂等、重放、审计链）。本文提出并实现 **Aionis Memory Graph**：一种以 **Postgres/pgvector 为主存**、以 **应用层图扩散**完成联想式召回、并通过 **Commit Hash 链**提供可验证写入溯源的长期记忆系统。系统将“写入成功”定义为事实记录（System of Record, SoR）与提交链落库成功，**embedding 被视为可延迟的派生物（derived artifact）**，通过 Outbox/Worker 进行异步回填，从而在 embedding provider 不可用时仍保证写入高可用。系统进一步实现了 **规则生命周期（DRAFT → SHADOW → ACTIVE）**，使记忆不仅可被检索，还能以可审计的方式注入执行决策（planner/tool selector），并通过反馈闭环持续校准规则有效性。本文给出数据模型、写入与召回算法、工程约束、可靠性机制与性能基线方法，并讨论其相对传统上下文系统的优势与未来演进方向。

## 关键词

长期记忆；记忆图；pgvector；HNSW；Outbox；幂等；可验证写入；联想式召回；规则注入；反馈学习

---

## 1. 引言

当智能体从“单轮问答”演进为“可执行系统”（调用工具、修改环境、跨天/跨周持续推进任务），其能力上限不再由单次上下文窗口决定，而由 **记忆系统**的质量决定。一个可用的记忆系统必须同时满足：

1. **持久性**：跨会话保留关键事实与偏好。
2. **可组织性**：记忆不是平铺文本，而是可被分类、聚合、关联与演化的结构。
3. **可运营性**：面对失败、重试、并发与滥用时仍可控。
4. **可验证性**：每条关键记忆可回答“从哪来、谁生成、是否被篡改”。
5. **可执行性**：记忆不仅用于回答，还应影响规划、策略与工具选择。

传统“向量检索 + 片段拼接”可以提供近似相似度检索，但难以表达因果、归属、证据支持/冲突等关系，也不天然具备可追溯与可运营的硬约束。Aionis Memory Graph 的目标不是替代向量检索，而是将其作为 **候选生成**的一环，并以图结构与规则系统将“长期智能（Persistent Intelligence）”工程化落地。

---

## 2. 设计目标与硬约束

本文系统以如下工程目标驱动：

### 2.1 语义目标：三类长期记忆

- **情节记忆（Episodic）**：发生过什么（事件、执行、决策）。
- **语义记忆（Semantic）**：从多次经历抽象出的概念/主题（Topic/Concept）。
- **程序记忆（Procedural）**：以后应该怎么做（规则、偏好、流程）。

### 2.2 工程目标：可靠性与可控输出

- **写入高可用**：embedding/外部服务失败不阻塞 SoR 写入。
- **幂等**：重复写入/重复执行 job 不会产生重复数据。
- **可回放**：异步任务可 dead-letter 与 replay。
- **无隐性数据出口**：embedding 默认永不返回；debug 仅在强约束下允许。
- **预算化召回**：图扩散与邻域扩张严格限额，避免规模增长导致爆炸。

### 2.3 兼容性目标：VEL（可验证执行）对齐

系统将每次写入视为“类似 Git commit”的变更，生成 `commit_id` 与 `commit_hash`，使记忆链可与执行系统（Execution OS / VEL）对齐：执行 trace 与工具证据可作为 `raw_ref/evidence_ref` 指针被引用，形成从执行到记忆的可审计闭环。

---

## 3. 系统概览

### 3.1 组件与数据流

系统由 API、主存（Postgres）、异步 worker 与外部 embedding provider 组成：

```mermaid
flowchart LR
  Client["Client / Execution OS"] -->|/v1/memory/write| API["Memory API (Fastify)"]
  API -->|insert commits/nodes/edges| PG["Postgres (pgvector)"]
  API -->|enqueue derived jobs| Outbox["memory_outbox"]
  Worker["Outbox Worker (daemon)"] -->|claim+process| Outbox
  Worker -->|backfill embeddings / topic cluster| PG
  Worker --> Provider["Embedding Provider (MiniMax/OpenAI/etc)"]
  API -->|/v1/memory/recall(_text)| PG
  API -->|/v1/memory/rules/evaluate| PG
  API -->|/v1/memory/tools/select| PG
```

### 3.2 “写入成功”的语义

系统将写入拆为两类结果：

- **事实记录（SoR）**：`memory_commits` 与核心节点/边落库成功（强一致）。
- **派生物（Derived artifacts）**：embedding、聚类结果、统计计数等（最终一致）。

因此 `/write` 的成功不依赖 embedding 成功；embedding 失败仅影响短时间内的“向量召回可见性”，不会破坏事实记录与审计链。

---

## 4. 数据模型

### 4.1 节点（Nodes）

节点存储于 `memory_nodes`，最小必要字段：

- `id`: UUID
- `scope`: 文本域隔离（单用户/单域 MVP 仍保留该字段）
- `type`: `event/entity/topic/rule/...`
- `tier`: `hot/warm/cold/archive`
- `title`, `text_summary`
- `slots`: JSONB（结构化属性）
- `embedding`: `vector(1536)`（可空）
- 动态评分：`salience/importance/confidence/last_activated`
- 派生状态：`embedding_status`, `embedding_attempts`, `embedding_last_error`, `embedding_ready_at`, `embedding_model`
- 审计：`commit_id`（DB 级硬约束 NOT NULL）

**幂等写入**：`client_id` 作为外部幂等键落库，并通过 `UNIQUE(scope, client_id)` 防止重复插入（适用于携带 `client_id` 的节点）。

### 4.2 边（Edges）

边存储于 `memory_edges`，最小必要字段：

- `src_id`, `dst_id`, `type`
- `weight/confidence/decay_rate/last_activated`
- `commit_id`（DB 级硬约束 NOT NULL）

派生边（如 topic 聚类产生的 `part_of/derived_from`）采用稳定 ID 或唯一约束，确保重复 job 不会产生重复边。

### 4.3 Commit 链（可验证写入）

`memory_commits` 记录每次写入的“变更提交”：

- `input_sha256`: 输入来源摘要（可来自执行 digest）
- `diff_json`: 变更描述（节点/边 id 与关键快照）
- `commit_hash`: hash 链（可审计）
- `parent_id`: 链接父提交（可选）

通过强制 `nodes/edges.commit_id NOT NULL`，系统保证任何外部可见的图数据都能追溯到一次提交。

### 4.4 Outbox（派生任务）

`memory_outbox` 记录异步任务（至少一次投递）：

- `event_type`: `embed_nodes`, `topic_cluster` 等
- `payload`, `job_key`, `payload_sha256`
- `attempts`, `claimed_at`, `published_at`, `failed_at`, `last_error`

`job_key` + 唯一索引用于去重（同 scope、同类型、同逻辑 job 不重复入队），并支持 replay。

---

## 5. 写入机制：从输入到记忆（Write Path）

### 5.1 写入管道

API 写入可理解为简化的四段式：

1. Capture：接收结构化输入（节点/边、原始文本、执行信息）。
2. Normalize：PII 脱敏（可配置）、长度限制、字段校验。
3. Commit：生成 `commit_id/commit_hash`，落库节点/边（SoR）。
4. Derive：若 `auto_embed=true` 或需要聚类，则 enqueue outbox（最终一致）。

### 5.2 Embedding 的状态机（派生物）

系统显式记录 embedding 状态：

- `READY`：embedding 存在且可用
- `PENDING`：等待回填（或被 `force_reembed` 置为待回填）
- `FAILED`：多次失败后进入失败态（可 replay）

**语义约束**：

- `/recall_*` 默认仅使用 `READY` 节点进入向量候选与排序。
- `/write` 在节点已 `READY` 且未 `force_reembed` 时，不再 enqueue `embed_nodes`（降噪与降负载）。
- 允许 `force_reembed=true` 触发模型升级或回填策略变更。

### 5.3 幂等与审计

- 节点写入：`UNIQUE(scope, client_id)` + 服务器端稳定 ID 生成，确保重复写入不重复插入。
- 派生任务：`job_key/payload_sha256` 去重，worker 可重复执行。
- 审计：每次写入与派生变更均生成 commit 记录，便于审计与回放。

---

## 6. 自组织机制：在线近邻聚类（Topic Clustering）

### 6.1 目标与约束

在线聚类旨在让“文件夹点（Topic/Folder）”自然长出，但必须避免：

- 早期数据稀疏导致大量碎片 topic；
- 关联不可解释；
- 重复运行产生重复边。

因此系统采用：

- `min_events_per_topic`（如 5）：topic 初期为 `draft` 候选态，达到阈值才可晋升。
- `topic_commit_hash`：每次聚类写入均记录可验证提交。

### 6.2 算法（实现版）

对每个新 event：

1. 在 pgvector 上做 kNN，获取相似候选集合。
2. 判断候选是否集中到已有 topic；若集中，则 `event -> topic (part_of)`。
3. 若形成稳定新簇，则创建 `topic(draft)`，并建立：
   - `topic -> event (derived_from)`
   - `event -> topic (part_of)`
4. 更新 topic 的 `member_count` 等 slots，并在达到阈值时将 `draft -> active`。

派生边使用稳定 ID/唯一约束，确保重复运行无重复数据。

### 6.3 离线增强（未来工作）

在线 kNN 聚类强调“可运行与可解释”，当出现碎片化后再引入离线 HDBSCAN 或聚合合并（consolidation），一次性提升聚类质量与主题稳定性。

---

## 7. 召回机制：候选生成 + 图扩散（Recall）

### 7.1 两阶段召回

**Stage 1（fast）**：pgvector 近邻种子

- 使用 `embedding <=> query_embedding` 取 Top-K seeds
- 过滤不可用内容（如 `topic_state=draft` 或规则未发布）

**Stage 2（smart）**：邻域扩张与激活传播

- 从 seeds 出发抓取 1-2 hop 边（双向）
- 以边类型/权重/置信度做加权扩散（Activation Spreading）
- 预算化控制：`max_edges/max_nodes` + hop budget + `min_edge_weight/min_edge_confidence`

输出为子图（nodes+edges）与可读 context（`recall_text`）。

### 7.2 强约束：输出契约与 debug 通道

为避免“embedding 浮点数污染上下文并造成隐性数据出口”，系统采用硬契约：

- 默认永不返回 `embedding`。
- 仅当 `return_debug=true && include_embeddings=true` 且满足 admin gate 时，返回 debug embeddings（dims/sha256/preview），并强制：
  - `limit <= 20`
  - 仅对 Top-K seeds 返回（如 5 个）
  - preview 长度固定且有 `max_debug_bytes` 上限
- meta 字段（`created_at/updated_at/commit_id` 等）需 `include_meta=true` 才返回。

### 7.3 召回与一致性

当节点处于 `embedding_status=PENDING/FAILED`：

- 它不会成为向量 seed，也不会在排序中被相似度拉高；
- 但如果它通过图边被邻域拉入子图，可由应用层决定是否展示（当前实现以“预算与白名单字段”为主，避免爆炸；更严格的“只激活 READY 内容源”可作为增强策略）。

---

## 8. 规则系统：从记忆到执行（Rule → Planner/Tool Selector）

### 8.1 生命周期

规则节点存于 `memory_nodes(type=rule)`，其可执行定义落在 `memory_rule_defs`（stateful）：

- `DRAFT`：仅记录，不影响执行
- `SHADOW`：评估但不生效（用于观测与 A/B）
- `ACTIVE`：生效并注入策略

### 8.2 规则表示与评估

规则通过 `slots.if/then/exceptions` 表示条件与策略 patch：

- `if`: context 匹配（如 `intent=json`, `provider=minimax`）
- `then`: 产生 policy patch（如 `output.strict=true` 或 `tool.prefer/deny/allow`）

`/v1/memory/rules/evaluate` 返回：

- matched rules（active/shadow）
- `applied.policy`（最终生效 patch）
- sources/conflicts（可读解释、赢家与冲突路径）

### 8.3 Tool Selector 注入

`/v1/memory/tools/select` 结合候选工具列表与规则 policy：

- `tool.deny`: union
- `tool.allow`: intersection（多条 allow 同时存在时更严格）
- `tool.prefer`: 评分排序（支持冲突解释与 winner）
- `strict=false`: 若 allowlist 过滤后为空，则退化为 deny-only 模式并返回 fallback 说明（利于生产推广与可用性）

### 8.4 Feedback 闭环

`/v1/memory/tools/feedback` 对选择结果打分（positive/negative），回写到规则统计：

- 用于衡量规则对执行质量的影响
- 支持后续 “promotion suggest” job：扫描 SHADOW 达到阈值的规则并输出建议（不自动变更 state）

---

## 9. 安全、隐私与滥用防护

### 9.1 PII 脱敏与可见域（Day-1 hooks）

系统从 Day-1 预留：

- PII redaction 开关与策略入口
- scope/ACL hooks（未来多用户/多域可扩展）
- 默认禁止跨 scope 边（防止数据串域）

### 9.2 Debug 通道是“隐性数据出口”的高风险点

系统将 debug embedding 视为受控出口，采用硬约束：

- 必须双开关 + admin token/loopback gate
- limit、preview、bytes 上限
- rate-limit 对 debug embeddings 更严格

### 9.3 基础限流与可运营错误码

对 recall 与 debug embeddings 采用 token bucket 限流，返回 `429` 并携带 `Retry-After` 与结构化错误码，方便 UI/SDK 重试与日志聚合。

---

## 10. 可靠性工程：Outbox、重试与一致性检查

### 10.1 At-least-once + 幂等

worker 的语义是 at-least-once：同一任务可能被重复执行，因此必须：

- 所有派生写入幂等（稳定 id / unique + upsert）
- outbox 入队去重（job_key）

### 10.2 Dead-letter 与 replay

当任务超过最大重试次数：

- 标记 `failed_at`，停止 claim（避免毒丸循环）
- 运维可通过 replay job 重新入队或选择性重放

### 10.3 离线一致性检查

提供 offline job 扫描：

- embedding 维度一致性
- `READY` 与向量存在一致性
- commit_id 缺失（在强约束后应不可能发生）
- cross-scope edges 等

---

## 11. 性能与可复现基线

### 11.1 索引与查询形状

系统使用 pgvector HNSW 作为向量检索主索引，并补充更贴合 recall 条件的部分索引（`READY + hot` 子集），以提高 planner 选择 ANN 的概率并降低不必要扫描：

- `memory_nodes_embedding_hnsw_idx`（embedding 非空）
- `memory_nodes_embedding_ready_hot_warm_hnsw_idx`（embedding 非空且 `tier IN (hot,warm) AND embedding_status=ready`）

### 11.2 预算化邻域扩张

Stage 2 的边与节点抓取设置 hard cap 与 hop budget，并支持 `min_edge_weight/min_edge_confidence`，在图规模增长时避免无界扩张。

### 11.3 基线脚本与可读 EXPLAIN

- `sql/explain_baseline.sql`：通过 PREPARE/EXECUTE 模拟 API 的参数化查询，并默认启用 `plan_cache_mode=force_generic_plan`，避免 EXPLAIN 打印 1536 维向量导致输出不可读。
- `sql/seed_perf_dataset.sql`：在隔离 scope 下写入大规模数据用于观察 ANN/HNSW 行为（仅用于本地性能测试）。

> 注：在极小数据集（几十行）上，Postgres 选择 Seq Scan 或 btree+sort 并不异常；应在代表性规模下评估。

---

## 12. 讨论：相对传统“上下文产品”的优势与局限

### 12.1 相对“向量库 + RAG”的优势

- **可验证**：commit 链与 commit_id 强约束使“记忆来源”可审计。
- **可运营**：outbox、dead-letter、replay、幂等等可靠性设施是生产级而非 demo。
- **可控输出**：embedding 默认永不返回，debug 通道强约束，避免隐性数据出口与上下文污染。
- **可执行**：规则系统能真实影响 planner/tool selector，并具备 SHADOW 观测与反馈闭环。
- **可演化**：在线聚类先跑通闭环，后续可插拔离线增强（HDBSCAN、合并、遗忘）。

### 12.2 当前局限

- 单用户单域为主（但已预留 scope/脱敏 hooks）。
- 聚类与概念抽象仍偏工程启发式，需在真实数据上迭代。
- 更强的冲突治理（版本化、争议节点）与遗忘/冷存策略尚待完善。
- 性能与 ANN 计划选择需在 10^5~10^6 规模实测验证，并可能需要更精细的索引/分区策略。

---

## 13. 结论

Aionis Memory Graph 将长期记忆系统工程化为一个可审计、可运营且可扩展的基础设施内核。其关键选择是将 SoR 写入与派生物生成解耦，以 outbox/worker 提供最终一致性，同时以硬契约约束输出边界与 debug 通道，避免系统在规模增长后出现不可控的性能与安全风险。通过规则生命周期与工具选择注入，系统将“记忆”从被动检索提升为可执行的策略输入，并通过反馈闭环实现持续贴合用户偏好。本文给出的设计与实现为“持久智能（Persistent Intelligence Memory）”提供了一条可落地的工程路径。

---

## 附录 A：建议的可复现实验（不虚构结果）

1. Outbox 可靠性：模拟 embedding provider 失败，验证 `/write` 仍成功，worker 重试与 dead-letter 生效。
2. 幂等：重复写入相同 `client_id`，验证 `UNIQUE(scope, client_id)` 与 job_key 去重无重复记录。
3. Debug 出口防护：验证 include_embeddings 必须 admin gate，且限制 limit/preview/max_debug_bytes。
4. 性能：在 `perf` scope 下插入 5w/10w 节点，运行 `sql/explain_baseline.sql` 观察是否使用 HNSW 及延迟变化。
