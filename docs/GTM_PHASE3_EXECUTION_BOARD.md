# GTM Phase 3 Execution Board (Day 61-90)

## 1) Objective

目标：把当前“可运行”推进为“可上线”，形成 Gate C（Day 90）可阻断验收链路。

## 2) Scope

1. 生产门禁：`health-gate` 严格模式稳定通过。
2. 性能规模：`perf:phase-d-matrix` 在目标规模产出可复现证据。
3. SLO 评估：用机器可解析规则判断 p95 与错误率是否达标。
4. 统一验收：Gate C 单命令输出 `summary.json`，可用于 CI/周报。

## 3) Commands

1. 快速快照（非阻断，复用已有服务）

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
START_SERVICES_IF_NEEDED=false \
GATEC_FAIL_ON_FAIL=false \
GATEC_PERF_PROFILE=recall_slo \
GATEC_SCALES=100000 \
GATEC_RESET_IMPL=scope_purge \
GATEC_RESET_PURGE_MODE=partition \
GATEC_RESET_PURGE_FAIL_ON_DELETE=true \
npm run gtm:phase3:gatec
```

2. 阻断模式（建议准生产）

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
START_SERVICES_IF_NEEDED=false \
GATEC_FAIL_ON_FAIL=true \
GATEC_PERF_PROFILE=balanced \
GATEC_SCALES=100000 \
GATEC_REQUIRE_WRITE_CASE=true \
GATEC_ENFORCE_PARTITION_FIRST_RESET=true \
GATEC_RESET_IMPL=scope_purge \
GATEC_RESET_PURGE_MODE=partition \
GATEC_RESET_PURGE_FAIL_ON_DELETE=true \
npm run gtm:phase3:gatec
```

3. Day-90 门槛（要求 1e6 证据）

```bash
cd /Users/lucio/Desktop/Aionis
set -a; source .env; set +a
START_SERVICES_IF_NEEDED=false \
GATEC_FAIL_ON_FAIL=true \
GATEC_PERF_PROFILE=balanced \
GATEC_SCALES=1000000 \
GATEC_REQUIRE_SCALE=1000000 \
GATEC_REQUIRE_WRITE_CASE=true \
GATEC_ENFORCE_PARTITION_FIRST_RESET=true \
GATEC_RESET_IMPL=scope_purge \
GATEC_RESET_PURGE_MODE=partition \
GATEC_RESET_PURGE_FAIL_ON_DELETE=true \
npm run gtm:phase3:gatec
```

## 4) SLO Defaults (Gate C)

1. `GATEC_SLO_RECALL_P95_MS=800`
2. `GATEC_SLO_WRITE_P95_MS=300`
3. `GATEC_SLO_MAX_ERROR_RATE=0.03`（稳态阻断预算；过程阶段超预算仅告警）
4. `GATEC_ENFORCE_PARTITION_FIRST_RESET=true`
5. `GATEC_AUTO_ADAPT_RATE_LIMIT=true`
6. `GATEC_MAX_RATE_LIMIT_RETRIES=10`（`recall_slo`/`write_slo` 默认）
7. `GATEC_BENCH_PACE_MS=50`（`recall_slo` 默认；`write_slo` 默认 `150`）
8. `GATEC_PACE_MAX_MS=2000`

可按环境调参：

1. `GATEC_REQUIRE_RECALL_CASE=true|false`
2. `GATEC_REQUIRE_WRITE_CASE=true|false`
3. `GATEC_REQUIRE_SCALE=<events>`
4. `GATEC_RESET_IMPL=scope_purge|perf_seed`
5. `GATEC_RESET_PURGE_MODE=partition|auto|delete`
6. `GATEC_RESET_PURGE_FAIL_ON_DELETE=true|false`
7. `GATEC_PARTITION_READ_SHADOW_CHECK=true|false`
8. `GATEC_PARTITION_READ_SHADOW_LIMIT=<top_k>`
9. `GATEC_PARTITION_READ_SHADOW_MIN_OVERLAP=0.95`
10. `GATEC_PARTITION_DUAL_WRITE_ENABLED=true|false`（用于 partition-shadow 子门禁临时覆盖）
11. `GATEC_MAX_RATE_LIMIT_RETRIES=<retries>`
12. `GATEC_BENCH_PACE_MS=<ms>`
13. `GATEC_PACE_STEP_MS=<ms>`
14. `GATEC_PACE_MAX_MS=<ms>`

## 5) Evidence Layout

1. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/summary.json`
2. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/01_health_gate.json`
3. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/02_perf_matrix.log`
4. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/perf/PERFORMANCE_REPORT_V1.md`
5. `/Users/lucio/Desktop/Aionis/artifacts/gtm/gate_c/<run_id>/perf/benchmark_adapt_<scale>.json`（记录每个 scale 的 429 自适应重试/降速过程）

## 6) CI Workflow

1. `/Users/lucio/Desktop/Aionis/.github/workflows/gtm-phase3-gate.yml`
2. 支持手动参数：`run_perf / perf_profile / scales / require_scale / require_write_case`
3. 默认每周定时运行并上传 Gate C artifacts。

## 7) Day-90 Gate C Criteria

1. `health-gate --strict-warnings` 通过。
2. perf matrix 成功并产出 benchmark + report。
3. required scale 证据存在（默认取 `GATEC_SCALES` 最大值）。
4. recall/write 覆盖满足要求（由 `GATEC_REQUIRE_*_CASE` 控制）。
5. p95 与错误率满足 SLO 阈值。
6. 分区优先 reset 策略生效（`reset_policy_ok=true`，且 `purge_delete_strategy_tables_total=0`）。

## 8) Current Owner Template

1. Owner: `TBD`
2. Next review: `Gate C readiness review`
3. Status: `in_progress`
