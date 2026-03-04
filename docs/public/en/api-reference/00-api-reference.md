---
title: "API Reference"
---

# API Reference

This page is the practical API map for integrating Aionis into product workflows.

## Base Path

All memory-kernel routes are under:

`/v1/memory/*`

## Authentication

Use one of these for memory routes:

1. `X-Api-Key: <key>`
2. `Authorization: Bearer <token>`

Use `X-Admin-Token` only for admin/control surfaces that explicitly require it.

## Endpoint Groups

### Memory Write and Recall

1. `POST /v1/memory/write`
2. `POST /v1/memory/recall`
3. `POST /v1/memory/recall_text`

### Context Orchestration

1. `POST /v1/memory/context/assemble`
2. `POST /v1/memory/planning/context`

### Policy and Execution Loop

1. `POST /v1/memory/rules/evaluate`
2. `POST /v1/memory/tools/select`
3. `POST /v1/memory/tools/decision`
4. `POST /v1/memory/tools/run`
5. `POST /v1/memory/tools/feedback`

### Sessions and Events

1. `POST /v1/memory/sessions`
2. `POST /v1/memory/events`
3. `POST /v1/memory/sessions/events/list`

### Sandbox (Experimental)

1. `POST /v1/memory/sandbox/sessions`
2. `POST /v1/memory/sandbox/execute`
3. `POST /v1/memory/sandbox/runs/get`
4. `POST /v1/memory/sandbox/runs/logs`
5. `POST /v1/memory/sandbox/runs/cancel`

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

### Graph and Replay Utilities

1. `POST /v1/memory/find`
2. `POST /v1/memory/resolve`

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

## Replay Execution Notes

1. `playbooks/run` supports `simulate`, `strict`, and `guided`.
2. `strict` and `guided` require explicit `params.allow_local_exec=true`.
3. Local execution is allowlist-gated and currently supports command-style tools (`command|shell|exec|bash`).
4. `guided` supports repair synthesis strategies:
   - `deterministic_skip` (default): remove-step patch fallback.
   - `heuristic_patch`: command-replacement/retry patch when possible, else remove-step fallback.
   - `http_synth`: external repair synthesizer (`REPLAY_GUIDED_REPAIR_HTTP_ENDPOINT`) with heuristic fallback.
   - `builtin_llm`: built-in OpenAI-compatible repair synthesis with heuristic fallback.
5. Optional guided replay params:
   - `params.guided_repair_strategy` (`deterministic_skip|heuristic_patch|http_synth|builtin_llm`)
   - `params.command_alias_map` (for command substitution in heuristic/http fallback paths)
   - `params.guided_repair_max_error_chars`
   - Security default: request-side switch to `builtin_llm` is blocked unless explicitly enabled by server policy.
6. Guided repair server defaults:
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
7. Recommended repair workflow: `playbooks/repair` (pending review) -> `playbooks/repair/review` (approve/reject + auto shadow validation).
8. `playbooks/repair/review` supports `shadow_validation_mode=readiness|execute|execute_sandbox`:
   - `readiness`: precondition + allowlist gate checks only.
   - `execute`: strict local execution validation (`record_run=false`, no replay graph writes).
   - `execute_sandbox`: strict sandbox sync execution validation via sandbox session/run APIs.
9. Shadow-validation execution defaults can be controlled by env:
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_EXECUTE_STOP_ON_FAILURE`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_TIMEOUT_MS`
   - `REPLAY_SHADOW_VALIDATE_SANDBOX_STOP_ON_FAILURE`
10. `playbooks/repair/review` can auto-promote when validation passes:
   - `auto_promote_on_pass=true`
   - `auto_promote_target_status` (for example `active`)
   - `auto_promote_gate` thresholds (`max_failed_steps`, `max_blocked_steps`, `max_unknown_steps`, `min_success_ratio`, etc.)
11. `playbooks/compile_from_run` annotates compile quality metadata:
   - duplicate-step removal summary (`steps_dedup_removed`, `dedup_removed_step_indexes`)
   - template variable extraction (`parameterization.variables`, `template_variables` per step)
   - per-step quality score (`quality_score`, `quality_flags`) and aggregate recommendations
12. Server-side default policy can prefill review auto-promotion fields when callers omit them:
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
13. `playbooks/repair/review` response includes `auto_promote_policy_resolution` (resolved tenant/scope, base source, applied policy layers, request overrides, and final effective defaults).
14. `GET /v1/admin/control/diagnostics/tenant/:tenant_id` includes `diagnostics.replay_policy` rollups for replay review policy coverage and layer hit distribution.

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
2. [SDK Guide](/public/en/reference/05-sdk)
3. [SDK Compatibility Matrix](/public/en/reference/06-sdk-compatibility-matrix)
4. [Sandbox API (Experimental)](/public/en/reference/08-sandbox-api)
