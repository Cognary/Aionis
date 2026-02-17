# Aionis 生产编排与分区治理推进计划（可落地）

## 0. 结论先行

你提的两点是对的，而且目前都属于“部分到位、未收口”状态：

1. 生产编排与默认策略：已有 worker/限流/scope 实践，但缺少统一的生产默认配置与强制门禁。
2. 物理层治理：尚未完整落地“分区 + DROP/TRUNCATE PARTITION 替代大表 DELETE”。

本计划目标是把这两项在一个可执行窗口内收口为可上线标准。

---

## 1. 目标与范围

## 1.1 目标（45 天）

1. 形成“生产模式默认安全”配置，不依赖人工记忆开关。
2. 完成核心高体量表分区治理，支持按租户/范围快速清理，不再依赖全表大 DELETE。
3. 将治理结果纳入回归与 preflight/gate，变成持续约束。

## 1.2 非目标（本期不做）

1. 跨地域多主分布式数据库。
2. 全自动冷热分层到外部对象存储。
3. 全量在线无感迁移（本期接受维护窗口切换）。

---

## 2. 里程碑与阶段

## Phase A（D1-D10）生产编排硬化

目标：先把“误配置风险”压下去。

交付：

1. 运行模式显式化：`APP_ENV=dev|ci|prod`，并将关键开关绑定模式默认值。
2. 生产默认策略：
   - `START_SERVICES_IF_NEEDED=false`
   - perf/gate 的 destructive 选项默认关闭
   - 强制 API/worker 独立进程健康检查
3. 配置校验升级：高风险组合在 `prod` 直接启动失败（fail-fast）。
4. 预检增强：`preflight:prod` 增加“配置合规检查”与“后台进程依赖检查”。

验收（DoD）：

1. 在 `APP_ENV=prod` 下，危险配置组合被拒绝启动（有明确报错）。
2. `npm run preflight:prod` 输出含“编排合规”检查项且可机器判定。
3. 文档与 `.env.example` 完整对齐。

---

## Phase B（D11-D25）分区模型与迁移脚手架

目标：先把“分区能力”建出来，再做切流。

交付：

1. 分区设计定稿（建议）：
   - `memory_nodes`、`memory_edges`、`memory_commits`：按 `scope_key` 哈希分区（例如 32 分区）。
   - `memory_outbox`：按时间 RANGE（月）分区，必要时再按 scope_key 子分区。
2. 新分区表与索引迁移脚本（`migrations/`）。
3. 迁移脚手架：
   - shadow 表
   - 批量回填脚本（可断点续跑）
   - 行数/校验和比对脚本

验收（DoD）：

1. 测试库可完成“建分区表 -> 回填 -> 校验一致”全流程。
2. 回填脚本支持批次控制与失败重试。
3. 分区表 explain 计划可用，核心查询无明显回退。

---

## Phase C（D26-D35）切换与清理路径替换

目标：把线上运维动作从 DELETE 切到 PARTITION 操作。

交付：

1. 写路径切换到分区表（维护窗口内执行）。
2. 清理脚本替换：
   - `scripts/admin/scope-reset.sh` 改为“分区优先”
   - 支持 `TRUNCATE PARTITION` / `DROP PARTITION`（按策略）
3. perf/reset 默认使用独立 tenant/scope，并禁止活跃 scope destructive reset。

验收（DoD）：

1. `perf` 清理不再触发大表 DELETE。
2. 同规模 reset/cleanup 耗时显著下降（目标 >70%）。
3. 无跨租户误删风险（带显式 tenant/scope 双重确认）。

---

## Phase D（D36-D45）门禁化与运营化

目标：让治理可持续，而不是一次性改造。

交付：

1. Gate 增加硬检查：
   - 检查是否仍走大 DELETE 路径
   - 检查分区健康（缺分区、膨胀、索引失配）
2. 运维 runbook 增补：
   - 分区创建/滚动/归档/清理 SOP
   - 故障回滚 SOP（切回旧表或只读模式）
3. 报告化：
   - 周报输出分区命中、清理耗时、表膨胀趋势。

验收（DoD）：

1. `regression:oneclick` 和 `preflight:prod` 均包含分区治理检查项。
2. 连续 7 天无“清理阻塞/锁等待异常”。
3. 运维人员可按 runbook 独立执行一次完整清理与回滚演练。

---

## 3. 任务分解（按代码落点）

## 3.1 编排与默认策略

1. `src/config.ts`
   - 增加 `APP_ENV` 与 prod fail-fast 校验矩阵。
2. `.env.example`
   - 增加“prod 推荐值”分组与高风险注释。
3. `scripts/prod-preflight.sh`
   - 增加配置合规检查、worker/api 依赖检查。
4. `scripts/regression-oneclick.sh`
   - 在 `prod`/`gate` 模式下拒绝危险参数组合。

## 3.2 分区与迁移

1. `migrations/00xx_partition_*.sql`
   - 新建分区父表、分区、索引、约束。
2. `src/jobs/partition-backfill.ts`
   - 批量回填、进度、重试、校验统计。
3. `src/jobs/partition-maintenance.ts` + `src/jobs/partition-verify.ts`
   - 创建未来分区、清理旧分区、健康检查。

## 3.3 清理路径替换

1. `scripts/perf/phase-d-matrix.sh`
   - reset 流程优先走分区清理策略。
2. `scripts/admin/scope-purge.sh` + `src/jobs/scope-purge.ts`（新增）
   - `--mode partition|delete`
   - `partition` 作为默认。

## 3.4 文档

1. `docs/OPERATOR_RUNBOOK.md`
2. `docs/PERFORMANCE_BASELINE.md`
3. `docs/E2E_REGRESSION.md`
4. `README.md`（新增“生产清理策略说明”短节）

---

## 4. 风险与回滚

## 4.1 主要风险

1. 分区迁移期间索引/约束不一致导致查询退化。
2. 切换窗口过长影响写入。
3. 脚本误删非目标 scope/tenant。

## 4.2 回滚策略

1. 保留旧表只读快照直到新链路稳定 7 天。
2. 切换脚本支持一键回退（rename swap rollback）。
3. 所有 destructive 命令强制 `--tenant-id` + `--scope` + `--confirm`。

---

## 5. 度量指标（每周复盘）

1. 清理耗时（按 scope/tenant）
2. 清理期间锁等待与死锁次数
3. `memory_nodes` / `memory_edges` 膨胀率
4. 回归/预检通过率
5. perf 场景下 429 占比与 transport error 占比

---

## 6. 首周可执行清单（马上开工）

1. 在 `src/config.ts` 增加 `APP_ENV` 与 prod fail-fast 校验。
2. 在 `scripts/prod-preflight.sh` 增加“配置合规”检查输出。
3. 输出分区 DDL 草案（父表、32 分区、索引模板）。
4. 先在测试库跑一次 shadow 分区 + 小样本回填。
5. 把回填校验脚本接入 `npm run job:consistency-check` 的扩展检查项。

---

## 7. 完成定义（最终）

只有同时满足以下条件，才算“这两项治理完成”：

1. 生产默认策略可防误操作（配置不合规直接拒绝启动）。
2. 清理主路径不再依赖大表 DELETE。
3. 分区治理有脚本、有门禁、有 runbook、有回滚演练证据。
4. Gate C 阻断模式在目标规模下连续稳定通过（含 error_rate 与 required_scale）。
