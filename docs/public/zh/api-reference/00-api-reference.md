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

### 策略与执行闭环

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

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

### 图与回放工具

1. `POST /v1/memory/find`
2. `POST /v1/memory/resolve`

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

## Replay 执行说明（实验）

1. `playbooks/run` 支持 `simulate`、`strict`、`guided`。
2. `strict` 与 `guided` 需要显式 `params.allow_local_exec=true`。
3. 执行后端支持：
   - `params.execution_backend=local_process`（默认）
   - `params.execution_backend=sandbox_sync`（沙箱同步执行并校验结果）
   - `params.execution_backend=sandbox_async`（沙箱排队执行，返回 pending 证据）
4. 命令执行受 allowlist 限制，当前仅支持命令类工具（`command|shell|exec|bash`）。
5. 可选执行参数：
   - 顶层 `project_id` 或 `params.project_id`（用于 sandbox budget 维度）
   - `params.sensitive_review_mode=block|warn`
   - `params.allow_sensitive_exec=true`（`block` 命中敏感命令时需要显式放行）
6. `guided` 支持可配置修复策略：
   - `deterministic_skip`（默认）：生成 remove-step 补丁作为回退。
   - `heuristic_patch`：优先给出命令替换/重试补丁，失败时回退 remove-step。
   - `http_synth`：调用外部修复合成端点（失败自动回退 heuristic）。
   - `builtin_llm`：内置 OpenAI 兼容修复合成（失败自动回退 heuristic）。
7. 可选 guided 运行参数：
   - `params.guided_repair_strategy`
   - `params.command_alias_map`
   - `params.guided_repair_max_error_chars`
   - 安全默认：请求侧切换到 `builtin_llm` 默认被禁止，除非服务端显式放开。
8. guided 修复服务端默认值：
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
9. `playbooks/repair/review` 支持 `shadow_validation_mode=readiness|execute|execute_sandbox`。
10. `shadow_validation_mode=execute_sandbox` 支持更深策略控制（`shadow_validation_params`）：
   - `profile=fast|balanced|thorough`
   - `execution_mode=sync|async_queue`
   - `timeout_ms`、`stop_on_failure`
11. shadow validation 执行默认值可由环境变量控制：
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE`
12. `playbooks/repair/review` 可通过 `auto_promote_on_pass`、`auto_promote_target_status`、`auto_promote_gate` 做自动晋升。
13. `playbooks/compile_from_run` 会在 `compile_summary` 输出编译质量信息：
   - 重复步骤去重摘要（`steps_dedup_removed`、`dedup_removed_step_indexes`）
   - 参数化候选提取（`parameterization.variables`，以及每步 `template_variables`）
   - 每步质量分（`quality_score`、`quality_flags`）与汇总建议
   - compile 使用量遥测：
     - 响应顶层 `usage`（`prompt_tokens`、`completion_tokens`、`total_tokens`）
     - `compile_summary.usage_estimate` 同步返回同一组数值
     - 当前来源为 `estimated_char_based_v1`（基于字符估算，不是模型计费账单值）
14. 服务端可通过以下环境变量提供默认策略（请求显式参数优先）：
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_PROFILE`
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT`
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS`
   - `REPLAY_REPAIR_REVIEW_GATE_*`
   - `REPLAY_REPAIR_REVIEW_POLICY_JSON`（支持 `endpoint` / `tenant_default` / `tenant_endpoint` / `tenant_scope_default` / `tenant_scope_endpoint`）
15. `playbooks/repair/review` 响应包含 `auto_promote_policy_resolution`，用于查看命中来源与最终生效策略。
16. `GET /v1/admin/control/diagnostics/tenant/:tenant_id` 的 `diagnostics.replay_policy` 会汇总策略命中与覆盖统计。
17. `playbooks/repair/review` 支持可选闭环学习投影请求：
   - `learning_projection.enabled`
   - `learning_projection.mode=rule_and_episode|episode_only`
   - `learning_projection.delivery=async_outbox|sync_inline`
   - `learning_projection.target_rule_state=draft|shadow`
   - `learning_projection.min_total_steps`
   - `learning_projection.min_success_ratio`
18. `playbooks/repair/review` 响应可包含 `learning_projection_result`：
   - `status=queued|applied|skipped|failed`
   - 产物 URI（`generated_rule_uri`、`generated_episode_uri`）
   - warning 代码：
     - `overlapping_rules_detected`
     - `duplicate_rule_fingerprint_skipped`
     - `episode_gc_policy_attached`
19. 学习 episode 带有生命周期元数据并可被保留策略归档：
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
2. [SDK 指南](/public/zh/reference/05-sdk)
3. [SDK 兼容矩阵](/public/zh/reference/06-sdk-compatibility-matrix)
4. [Sandbox API（实验）](/public/zh/reference/08-sandbox-api)
