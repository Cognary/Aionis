---
title: "API 参考"
---

# API 参考

本页给出 Aionis 对接时最实用的 API 路由地图。

## 基础路径

所有 Memory Kernel 路由都在：

`/v1/memory/*`

## 认证方式

Memory 路由使用以下任一方式：

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

仅在明确需要的管理面接口使用 `X-Admin-Token`。

## 路由分组

### 记忆写入与召回

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`

### 上下文编排

1. `POST /v1/memory/context/assemble`
2. `POST /v1/memory/planning/context`

说明：

1. 两条接口都支持 `return_layered_context=true`。
2. `context_layers.forgetting_policy` 控制的是“注入时遗忘”，不是删库：
   - `allowed_tiers` 默认是 `["hot", "warm"]`
   - `exclude_archived` 默认是 `true`
   - `min_salience` 可在注入前过滤低价值 recall 项
3. `static_context_blocks` 允许调用方传入可寻址的静态 bootstrap/config/instruction blocks，再由 `static_injection` 选择真正需要注入的那部分。
4. layered 响应会返回：
   - `layered_context.forgetting`
   - 每层 `forgotten_count`
   - `layered_context.static_injection`
   方便调用方知道哪些内容被主动排除、哪些静态块被选中。
5. `planning/context` 响应现在还会带 `planning_summary`，方便 planner 侧先看紧凑摘要，再决定是否读取完整 `recall / rules / tools / layered_context` 载荷。
6. `context/assemble` 响应现在还会带 `assembly_summary`，方便装配侧先看紧凑摘要，再决定是否读取完整 `recall / rules / tools / layered_context` 载荷。
7. `recall_text`、`planning/context` 和 `context/assemble` 还支持实验性 `recall_class_aware=true|false`，方便调用方按请求显式打开或关闭 class-aware recall selector，做策略评估时不必起两套服务。
8. `recall`、`recall_text`、`planning/context` 和 `context/assemble` 还支持 `recall_mode="dense_edge"`，作为显式 opt-in 的宽图召回模式。当前它会映射到 `quality_first` recall profile，适合愿意用更高延迟换取更宽关系覆盖的调用方。
9. `planning/context` 和 `context/assemble` 也可以继承服务端配置的默认 `context_optimization_profile` 预设；如果请求里显式传了字段，请求值仍然优先。

### 策略与执行闭环

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

说明：

1. `rules/evaluate` 响应现在会带紧凑的 `evaluation_summary`，方便先做 summary-first 判断，再决定是否读取完整命中规则载荷。
2. `tools/select` 响应现在会带紧凑的 `selection_summary`，方便先做 summary-first 判断，再决定是否读取完整 rule/policy 载荷。
3. `tools/decision` 和 `tools/run` 响应现在都会带紧凑的 `lifecycle_summary`，方便先做 summary-first 判断，再决定是否读取完整 decision / feedback 载荷。

### 会话与事件

1. `POST /v1/memory/sessions`
2. `POST /v1/memory/events`
3. `GET /v1/memory/sessions/:session_id/events`

### Sandbox（实验）

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`
7. sandbox run 响应现在会带有界的 `result_summary` 字段，便于先做紧凑结果判断。

### Replay Automation（实验）

1. `POST /v1/memory/replay/run/start`
2. `POST /v1/memory/replay/step/before`
3. `POST /v1/memory/replay/step/after`
4. `POST /v1/memory/replay/run/end`
5. `POST /v1/memory/replay/runs/get`
6. `POST /v1/memory/replay/playbooks/compile_from_run`
7. `POST /v1/memory/replay/playbooks/get`
8. `POST /v1/memory/replay/playbooks/promote`
9. `POST /v1/memory/replay/playbooks/repair`
10. `POST /v1/memory/replay/playbooks/repair/review`
11. `POST /v1/memory/replay/playbooks/run`
12. `POST /v1/memory/replay/playbooks/candidate`
13. `POST /v1/memory/replay/playbooks/dispatch`

### Automation（Public Beta）

1. `POST /v1/automations/create`
2. `POST /v1/automations/get`
3. `POST /v1/automations/list`
4. `POST /v1/automations/validate`
5. `POST /v1/automations/graph/validate`
6. `POST /v1/automations/run`
7. `POST /v1/automations/runs/get`
8. `POST /v1/automations/runs/list`
9. `POST /v1/automations/runs/cancel`
10. `POST /v1/automations/runs/resume`
11. `POST /v1/automations/runs/approve_repair`
12. `POST /v1/automations/runs/reject_repair`
13. `POST /v1/automations/runs/compensation/retry`
14. `POST /v1/automations/promote`
15. `POST /v1/automations/shadow/report`
16. `POST /v1/automations/shadow/validate`
17. `POST /v1/automations/shadow/validate/dispatch`
18. `POST /v1/automations/telemetry`

### 图与回放工具

1. `POST /v1/memory/find`
2. `POST /v1/memory/resolve`

说明：

1. `memory/find` 响应现在也会带紧凑的 `find_summary`，方便调用方先看结果规模、类型分布和实际生效的过滤条件，再决定是否读取完整节点列表。
2. `memory/resolve` 响应现在也会带紧凑的 `resolve_summary`，方便调用方先看解析出的对象类型、payload 形状和关联 URI，再决定是否读取完整 `node / edge / commit / decision` 载荷。

## 常见请求字段

1. `tenant_id`
2. `scope`
3. `run_id`（策略流程）
4. `context`（策略/规划输入）

## 常见响应字段

1. `request_id`
2. `tenant_id`
3. `scope`
4. `commit_id` / `commit_uri`（写入类接口）
5. `decision_id` / `decision_uri`（决策类接口）

## 写入防误用规则

1. `POST /v1/memory/write` 只会持久化 `nodes` / `edges` 图对象。
2. 当写入请求最终 `nodes=0` 时，响应可能带有：
   - `warnings: [{ code: "write_no_nodes", ... }]`
3. 仅提供 `input_text` 不会自动生成可召回节点。
4. 可选严格模式：
   - 设置 `MEMORY_WRITE_REQUIRE_NODES=true` 后，`nodes` 为空会直接返回 `400 write_nodes_required`。
5. 可选写前蒸馏：
   - `distill.enabled=true` 后，Aionis 会在 commit 前把 `input_text` 和可用的 event/evidence 文本蒸馏成结构化 `evidence` / `concept` 节点
   - 响应可能包含 `distillation.generated_evidence_nodes`、`distillation.generated_fact_nodes`、`distillation.generated_edges`

## Replay 执行说明（实验）

1. `playbooks/run` 支持 `simulate`、`strict`、`guided`。
2. `strict` 与 `guided` 需要显式 `params.allow_local_exec=true`。
3. `playbooks/candidate` 提供机器可读的 deterministic replay 候选判断：
   - `candidate.eligible_for_deterministic_replay`
   - `candidate.recommended_mode`
   - `candidate.next_action`
   - `candidate.mismatch_reasons`
4. `playbooks/run` 支持可选 `deterministic_gate`：
   - gate 命中时可把 `simulate` 安全提升成 `strict`
   - 响应会带 `deterministic_gate` 与 `execution.inference_skipped`
5. `playbooks/dispatch` 是推荐的自动分发表面：
   - `dispatch.decision=deterministic_replay_executed`
   - `dispatch.decision=fallback_replay_executed`
   - `dispatch.decision=candidate_only`
   - 可通过 `execute_fallback=false` 禁止回退执行
6. replay 的 `candidate / run / dispatch` 响应现在都会带机器可读的 `cost_signals`。
7. 执行后端支持：
   - `params.execution_backend=local_process`（默认）
   - `params.execution_backend=sandbox_sync`（沙箱同步执行并校验结果）
   - `params.execution_backend=sandbox_async`（沙箱排队执行，返回 pending 证据）
6. 命令执行受 allowlist 限制，当前仅支持命令类工具（`command|shell|exec|bash`）。
7. 可选执行参数：
   - 顶层 `project_id` 或 `params.project_id`（用于 sandbox budget 维度）
   - `params.sensitive_review_mode=block|warn`
   - `params.allow_sensitive_exec=true`（`block` 命中敏感命令时需要显式放行）
8. `guided` 支持可配置修复策略：
   - `deterministic_skip`（默认）：生成 remove-step 补丁作为回退。
   - `heuristic_patch`：优先给出命令替换/重试补丁，失败时回退 remove-step。
   - `http_synth`：调用外部修复合成端点（失败自动回退 heuristic）。
   - `builtin_llm`：内置 OpenAI 兼容修复合成（失败自动回退 heuristic）。
9. 可选 guided 运行参数：
   - `params.guided_repair_strategy`
   - `params.command_alias_map`
   - `params.guided_repair_max_error_chars`
   - 安全默认：请求侧切换到 `builtin_llm` 默认被禁止，除非服务端显式放开。
10. guided 修复服务端默认值：
   - `REPLAY_GUIDED_REPAIR_STRATEGY`
   - `REPLAY_GUIDED_REPAIR_ALLOW_REQUEST_BUILTIN_LLM`
   - `REPLAY_GUIDED_REPAIR_MAX_ERROR_CHARS`
   - `REPLAY_GUIDED_REPAIR_HTTP_ENDPOINT`
   - `REPLAY_GUIDED_REPAIR_HTTP_TIMEOUT_MS`
   - `REPLAY_GUIDED_REPAIR_HTTP_AUTH_TOKEN`
   - `REPLAY_GUIDED_REPAIR_LLM_BASE_URL`
   - `REPLAY_GUIDED_REPAIR_LLM_API_KEY`
   - `REPLAY_GUIDED_REPAIR_LLM_MODEL`
   - `REPLAY_GUIDED_REPAIR_LLM_TIMEOUT_MS`
   - `REPLAY_GUIDED_REPAIR_LLM_MAX_TOKENS`
   - `REPLAY_GUIDED_REPAIR_LLM_TEMPERATURE`
11. `playbooks/repair/review` 支持 `shadow_validation_mode=readiness|execute|execute_sandbox`。
12. `shadow_validation_mode=execute_sandbox` 支持更深策略控制（`shadow_validation_params`）：
   - `profile=fast|balanced|thorough`
   - `execution_mode=sync|async_queue`
   - `timeout_ms`、`stop_on_failure`
13. shadow validation 执行默认值可由环境变量控制：
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE`
14. `playbooks/repair/review` 可通过 `auto_promote_on_pass`、`auto_promote_target_status`、`auto_promote_gate` 做自动晋升。
15. `playbooks/compile_from_run` 会在 `compile_summary` 输出编译质量信息：
   - 重复步骤去重摘要（`steps_dedup_removed`、`dedup_removed_step_indexes`）
   - 参数化候选提取（`parameterization.variables`，以及每步 `template_variables`）
   - 每步质量分（`quality_score`、`quality_flags`）与汇总建议
   - compile 使用量遥测：
     - 响应顶层 `usage`（`prompt_tokens`、`completion_tokens`、`total_tokens`）
     - `compile_summary.usage_estimate` 同步返回同一组数值
     - 当前来源为 `estimated_char_based_v1`（基于字符估算，不是模型计费账单值）
16. 服务端可通过以下环境变量提供默认策略（请求显式参数优先）：
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_PROFILE`
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT`
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS`
   - `REPLAY_REPAIR_REVIEW_GATE_*`
   - `REPLAY_REPAIR_REVIEW_POLICY_JSON`（支持 `endpoint` / `tenant_default` / `tenant_endpoint` / `tenant_scope_default` / `tenant_scope_endpoint`）
17. `playbooks/repair/review` 响应包含 `auto_promote_policy_resolution`，用于查看命中来源与最终生效策略。
18. `GET /v1/admin/control/diagnostics/tenant/:tenant_id` 的 `diagnostics.replay_policy` 会汇总策略命中与覆盖统计。
19. `playbooks/repair/review` 支持可选闭环学习投影请求：
   - `learning_projection.enabled`
   - `learning_projection.mode=rule_and_episode|episode_only`
   - `learning_projection.delivery=async_outbox|sync_inline`
   - `learning_projection.target_rule_state=draft|shadow`
   - `learning_projection.min_total_steps`
   - `learning_projection.min_success_ratio`
20. `playbooks/repair/review` 响应可包含 `learning_projection_result`：
   - `status=queued|applied|skipped|failed`
   - 产物 URI（`generated_rule_uri`、`generated_episode_uri`）
   - warning 代码：
     - `overlapping_rules_detected`
     - `duplicate_rule_fingerprint_skipped`
     - `episode_gc_policy_attached`
21. 学习 episode 带有生命周期元数据并可被保留策略归档：
   - stage-1 recall 默认排除 archived 学习 episode
   - `find/resolve` 仍可查询 archived 对象用于审计/回放

## 错误结构

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

## 最小接入顺序

1. 先跑通一次 `write`。
2. 用 `recall_text` 验证召回质量。
3. 用 `context/assemble` 验证分层上下文。
4. 接入 `rules/evaluate` + `tools/select`。
5. 用 `tools/decision` 或 `tools/run` 做决策/运行轨迹核查。
6. 用 `resolve` + URI 做回放。

## 相关页面

1. [API 合约](/public/zh/api/01-api-contract)
2. [Automation API 参考](/public/zh/api-reference/01-automation-api-reference)
3. [SDK 指南](/public/zh/reference/05-sdk)
4. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
5. [Sandbox API（实验）](/public/zh/reference/08-sandbox-api)
