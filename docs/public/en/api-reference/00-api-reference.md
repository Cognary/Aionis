---
title: "API Reference"
---

# API Reference

This page is the practical API map for integrating Aionis into product workflows.

## Base Path

Core memory-kernel routes are under:

`/v1/memory/*`

Continuity routes are under:

`/v1/handoff/*`

## Authentication

Use one of these for memory and handoff routes:

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

Use `X-Admin-Token` only for admin/control surfaces that explicitly require it.

## Endpoint Groups

### Memory Write and Recall

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`

Notes:

1. `recall` and `recall_text` may echo `recall.context.selection_policy` so callers can inspect which memory-layer preference and trust-anchor policy was applied.

### Handoff Continuity

1. `POST /v1/handoff/store`
2. `POST /v1/handoff/recover`

Notes:

1. Use `handoff/store` when you want a structured, exact continuity artifact instead of relying on free-form summaries.
2. `handoff/recover` returns the matched artifact, including `handoff_text`, `summary`, `risk`, and `acceptance_checks`.
3. `memory_lane="private"` is supported; authenticated ownership still applies during recovery.

### Context Orchestration

1. `POST /v1/memory/context/assemble`
2. `POST /v1/memory/planning/context`

Notes:

1. Both endpoints support `return_layered_context=true`.
2. `context_layers.forgetting_policy` controls injection-time forgetting, not store deletion:
   - `allowed_tiers` defaults to `["hot", "warm"]`
   - `exclude_archived` defaults to `true`
   - `min_salience` can drop low-value recall items before they enter merged context
3. `static_context_blocks` lets callers pass addressable static bootstrap/config/instruction blocks, and `static_injection` lets Aionis select only the relevant subset.
4. Layered responses include:
   - `layered_context.forgetting`
   - per-layer `forgotten_count`
   - `layered_context.static_injection`
   so callers can see what was intentionally excluded or selected.
5. `planning/context` responses now also include `planning_summary` for compact planner-facing inspection before reading the full `recall / rules / tools / layered_context` payload.
6. `context/assemble` responses now also include `assembly_summary` for compact assembly-side inspection before reading the full `recall / rules / tools / layered_context` payload.
7. `recall_text`, `planning/context`, and `context/assemble` also accept experimental `recall_class_aware=true|false` so callers can explicitly enable or disable the class-aware recall selector per request while evaluating policy changes.
8. `recall`, `recall_text`, `planning/context`, and `context/assemble` also accept `recall_mode="dense_edge"` as an explicit opt-in for wider graph recall. This mode currently maps to the `quality_first` recall profile and is intended for callers that prefer broader relationship coverage over lower latency.
9. `planning/context` and `context/assemble` can also inherit server-side default `context_optimization_profile` presets when operators enable them; explicit request fields still win.

### Policy and Execution Loop

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

Notes:

1. `rules/evaluate` responses now include compact `evaluation_summary` objects for summary-first inspection before reading the full matched-rule payload.
2. `tools/select` responses now include compact `selection_summary` objects for summary-first inspection before reading the full rule/policy payload.
3. `tools/decision` and `tools/run` responses now include compact `lifecycle_summary` objects for summary-first inspection before reading the full decision or feedback payloads.

### Sessions and Events

1. `POST /v1/memory/sessions`
2. `POST /v1/memory/events`
3. `GET /v1/memory/sessions/:session_id/events`

### Sandbox (Experimental)

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/artifact`
6. `POST /v1/memory/sandbox/runs/cancel`
7. Sandbox run responses now include bounded `result_summary` fields for compact tool-output inspection.

### Replay Automation (Experimental)

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

### Automation (Public Beta)

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

### Graph and Replay Utilities

1. `POST /v1/memory/find`
2. `POST /v1/memory/resolve`

Notes:

1. `memory/find` responses now also include compact `find_summary` objects so callers can inspect result breadth, type mix, and applied filters before reading the full node list.
2. `memory/resolve` responses now also include compact `resolve_summary` objects so callers can inspect the resolved object kind, payload shape, and related URIs before reading the full `node / edge / commit / decision` payload.

## Common Request Fields

1. `tenant_id`
2. `scope`
3. `run_id` (policy flows)
4. `context` (policy/planning inputs)

## Common Response Fields

1. `request_id`
2. `tenant_id`
3. `scope`
4. `commit_id` / `commit_uri` (write flows)
5. `decision_id` / `decision_uri` (tool-decision flows)

## Write Guardrails

1. `POST /v1/memory/write` persists graph objects from `nodes` and `edges`.
2. If a write request commits with `nodes=0`, response may include:
   - `warnings: [{ code: "write_no_nodes", ... }]`
3. `input_text` alone does not create recallable nodes.
4. Optional strict mode:
   - `MEMORY_WRITE_REQUIRE_NODES=true` makes `/v1/memory/write` fail with `400 write_nodes_required` when `nodes` is empty.
5. Optional write-time distillation:
   - `distill.enabled=true` lets Aionis synthesize structured `evidence` / `concept` nodes from `input_text` and eligible event/evidence nodes before commit
   - response may include `distillation.generated_evidence_nodes`, `distillation.generated_fact_nodes`, and `distillation.generated_edges`

## Replay Execution Notes

1. `playbooks/run` supports `simulate`, `strict`, and `guided`.
2. `strict` and `guided` require explicit `params.allow_local_exec=true`.
3. `playbooks/candidate` returns a machine-readable deterministic replay recommendation surface:
   - `candidate.eligible_for_deterministic_replay`
   - `candidate.recommended_mode`
   - `candidate.next_action`
   - `candidate.mismatch_reasons`
4. `playbooks/run` accepts optional `deterministic_gate`:
   - if the gate matches the selected playbook version, `simulate` may be promoted to `strict`
   - response includes `deterministic_gate` and `execution.inference_skipped`
5. `playbooks/dispatch` is the top-level auto-dispatch surface:
   - `dispatch.decision=deterministic_replay_executed`
   - `dispatch.decision=fallback_replay_executed`
   - `dispatch.decision=candidate_only`
   - callers can disable fallback with `execute_fallback=false`
6. replay `candidate / run / dispatch` responses now include machine-readable `cost_signals`.
7. `planning/context` and `context/assemble` expose `cost_signals.selected_memory_layers`, and `recall / recall_text / planning/context / context/assemble` can all echo `recall.context.selection_policy`, so operators can inspect the applied layer policy.
8. `recall`, `recall_text`, `planning/context`, and `context/assemble` accept `memory_layer_preference.allowed_layers` for caller-side tightening; the server still enforces `L3/L0` trust anchors.
9. Execution backends:
   - `params.execution_backend=local_process` (default)
   - `params.execution_backend=sandbox_sync` (sandbox run sync, with command result validation)
   - `params.execution_backend=sandbox_async` (sandbox queue mode, pending execution evidence)
10. Command execution is allowlist-gated and currently supports command-style tools (`command|shell|exec|bash`).
11. Optional replay run execution params:
   - `project_id` (top-level) or `params.project_id` for sandbox budget scoping
   - `params.sensitive_review_mode=block|warn`
   - `params.allow_sensitive_exec=true` (required when `block` mode hits a sensitive command)
12. `guided` supports repair synthesis strategies:
   - `deterministic_skip` (default): remove-step patch fallback.
   - `heuristic_patch`: command-replacement/retry patch when possible, else remove-step fallback.
   - `http_synth`: external repair synthesizer (`REPLAY_GUIDED_REPAIR_HTTP_ENDPOINT`) with heuristic fallback.
   - `builtin_llm`: built-in OpenAI-compatible repair synthesis with heuristic fallback.
13. Optional guided replay params:
   - `params.guided_repair_strategy` (`deterministic_skip|heuristic_patch|http_synth|builtin_llm`)
   - `params.command_alias_map` (for command substitution in heuristic/http fallback paths)
   - `params.guided_repair_max_error_chars`
   - Security default: request-side switch to `builtin_llm` is blocked unless explicitly enabled by server policy.
14. Guided repair server defaults:
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
15. Recommended repair workflow: `playbooks/repair` (pending review) -> `playbooks/repair/review` (approve/reject + auto shadow validation).
16. `playbooks/repair/review` supports `shadow_validation_mode=readiness|execute|execute_sandbox`:
   - `readiness`: precondition + allowlist gate checks only.
   - `execute`: strict local execution validation (`record_run=false`, no replay graph writes).
   - `execute_sandbox`: strict sandbox sync execution validation via sandbox session/run APIs.
17. `shadow_validation_mode=execute_sandbox` supports deeper policy controls via `shadow_validation_params`:
   - `profile=fast|balanced|thorough`
   - `execution_mode=sync|async_queue`
   - `timeout_ms`, `stop_on_failure`
18. Shadow-validation execution defaults can be controlled by env:
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE`
19. `playbooks/repair/review` can auto-promote when validation passes:
   - `auto_promote_on_pass=true`
   - `auto_promote_target_status` (for example `active`)
   - `auto_promote_gate` thresholds (`max_failed_steps`, `max_blocked_steps`, `max_unknown_steps`, `min_success_ratio`, etc.)
20. `playbooks/compile_from_run` annotates compile quality metadata:
   - duplicate-step removal summary (`steps_dedup_removed`, `dedup_removed_step_indexes`)
   - template variable extraction (`parameterization.variables`, `template_variables` per step)
   - per-step quality score (`quality_score`, `quality_flags`) and aggregate recommendations
   - usage telemetry for compile payload size:
     - top-level `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`)
     - `compile_summary.usage_estimate` mirrors the same numbers
     - current source is `estimated_char_based_v1` (char-based estimate, not provider-billed usage)
21. Server-side default policy can prefill review auto-promotion fields when callers omit them:
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_PROFILE` (`custom|strict|staged|aggressive`)
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_DEFAULT`
   - `REPLAY_REPAIR_REVIEW_AUTO_PROMOTE_TARGET_STATUS`
   - `REPLAY_REPAIR_REVIEW_GATE_REQUIRE_SHADOW_PASS`
   - `REPLAY_REPAIR_REVIEW_GATE_MIN_TOTAL_STEPS`
   - `REPLAY_REPAIR_REVIEW_GATE_MAX_FAILED_STEPS`
   - `REPLAY_REPAIR_REVIEW_GATE_MAX_BLOCKED_STEPS`
   - `REPLAY_REPAIR_REVIEW_GATE_MAX_UNKNOWN_STEPS`
   - `REPLAY_REPAIR_REVIEW_GATE_MIN_SUCCESS_RATIO`
   - `REPLAY_REPAIR_REVIEW_POLICY_JSON` (`endpoint` / `tenant_default` / `tenant_endpoint` / `tenant_scope_default` / `tenant_scope_endpoint` override maps)
   - When profile is not `custom`, profile defaults are applied first and request fields still take precedence.
   - Resolution order: global defaults -> endpoint -> tenant_default -> tenant_endpoint -> tenant_scope_default -> tenant_scope_endpoint -> request payload fields.
22. `playbooks/repair/review` response includes `auto_promote_policy_resolution` (resolved tenant/scope, base source, applied policy layers, request overrides, and final effective defaults).
23. `GET /v1/admin/control/diagnostics/tenant/:tenant_id` includes `diagnostics.replay_policy` rollups for replay review policy coverage and layer hit distribution.
24. `playbooks/repair/review` supports optional closed-loop learning projection request:
   - `learning_projection.enabled`
   - `learning_projection.mode=rule_and_episode|episode_only`
   - `learning_projection.delivery=async_outbox|sync_inline`
   - `learning_projection.target_rule_state=draft|shadow`
   - `learning_projection.min_total_steps`
   - `learning_projection.min_success_ratio`
25. `playbooks/repair/review` response may include `learning_projection_result`:
   - `status=queued|applied|skipped|failed`
   - generated URIs (`generated_rule_uri`, `generated_episode_uri`)
   - warning codes:
     - `overlapping_rules_detected`
     - `duplicate_rule_fingerprint_skipped`
     - `episode_gc_policy_attached`
22. Learning episodes include lifecycle metadata and are archived by retention policy:
   - archived episodes are excluded from stage-1 recall candidates by default
   - `find/resolve` still returns archived objects for audit/replay workflows

Example (trimmed):

```json
{
  "status": "shadow",
  "auto_promotion": {
    "attempted": true,
    "promoted": true
  },
  "auto_promote_policy_resolution": {
    "endpoint": "replay_playbook_repair_review",
    "tenant_id": "acme",
    "scope": "sales-prod",
    "base_source": "global_profile",
    "base_profile": "staged",
    "sources_applied": [
      {
        "layer": "tenant_scope_endpoint",
        "key": "acme.sales-prod.replay_playbook_repair_review",
        "patch": { "auto_promote_target_status": "active" }
      }
    ],
    "request_overrides": {
      "auto_promote_on_pass": false,
      "auto_promote_target_status": false,
      "gate": {
        "require_shadow_pass": false,
        "min_total_steps": false,
        "max_failed_steps": false,
        "max_blocked_steps": false,
        "max_unknown_steps": false,
        "min_success_ratio": false
      }
    },
    "effective": {
      "auto_promote_on_pass": true,
      "auto_promote_target_status": "active",
      "auto_promote_gate": {
        "require_shadow_pass": true,
        "min_total_steps": 1,
        "max_failed_steps": 0,
        "max_blocked_steps": 0,
        "max_unknown_steps": 0,
        "min_success_ratio": 1
      }
    }
  }
}
```

## Error Shape

```json
{
  "error": "string_code",
  "message": "human_readable_message",
  "details": {}
}
```

## Minimal Integration Sequence

1. `write` one memory item.
2. `recall_text` to verify retrieval quality.
3. `context/assemble` for layered context.
4. `rules/evaluate` and `tools/select` for governed routing.
5. `tools/decision` or `tools/run` for decision/run replay checks.
6. `resolve` using `commit_uri` or `decision_uri` for replay.

## Contract and SDK

1. [API Contract](/public/en/api/01-api-contract)
2. [Automation API Reference](/public/en/api-reference/01-automation-api-reference)
3. [SDK Guide](/public/en/reference/05-sdk)
4. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
5. [Sandbox API (Experimental)](/public/en/reference/08-sandbox-api)
