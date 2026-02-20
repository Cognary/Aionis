#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Load .env for consistent scope/provider inference (same behavior as other repo scripts/jobs).
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SCOPE="${MEMORY_SCOPE:-default}"
STRICT_WARNINGS=false
CONSISTENCY_SAMPLE=20
CONSISTENCY_CHECK_SET="${HEALTH_GATE_CONSISTENCY_CHECK_SET:-all}"
QUALITY_ARGS=()
AUTO_BACKFILL=true
BACKFILL_LIMIT=5000
BACKFILL_MODEL=""
AUTO_PRIVATE_LANE_BACKFILL=true
PRIVATE_LANE_BACKFILL_LIMIT=5000
PRIVATE_LANE_DEFAULT_OWNER_AGENT=""
PRIVATE_LANE_DEFAULT_OWNER_TEAM=""
PRIVATE_LANE_SHARED_FALLBACK=true
RUN_EXECUTION_LOOP_GATE="${HEALTH_GATE_RUN_EXECUTION_LOOP_GATE:-false}"
EXECUTION_LOOP_ARGS=()
RUN_POLICY_ADAPTATION_GATE="${HEALTH_GATE_RUN_POLICY_ADAPTATION_GATE:-false}"
POLICY_ADAPTATION_ARGS=()

usage() {
  cat <<USAGE
Usage: scripts/health-gate.sh [options]

Options:
  --scope <scope>              Scope to evaluate (default: MEMORY_SCOPE or "default")
  --strict-warnings            Treat consistency warnings as gate failures
  --consistency-sample <n>     Sample size for consistency-check (default: 20)
  --consistency-check-set <set>
                               Check set: all|scope|cross_tenant (default: HEALTH_GATE_CONSISTENCY_CHECK_SET or all)
  --skip-backfill              Skip pre-gate embedding_model backfill
  --backfill-limit <n>         Max rows for embedding_model backfill (default: 5000)
  --backfill-model <model>     Force model label for embedding_model backfill
  --skip-private-lane-backfill Skip pre-gate private-lane owner backfill
  --private-lane-backfill-limit <n>
                               Max rows for private-lane owner backfill (default: 5000)
  --private-lane-default-owner-agent <id>
                               Optional fallback owner_agent_id when producer owner is missing
  --private-lane-default-owner-team <id>
                               Optional fallback owner_team_id when producer owner is missing
  --private-lane-no-shared-fallback
                               Keep unresolved private rows as-is (default is move_shared fallback)
  --quality-arg <arg>          Extra arg forwarded to job:quality-eval (repeatable)
  --run-execution-loop-gate    Run execution-loop gate (feedback/rule freshness checks)
  --execution-loop-arg <arg>   Extra arg forwarded to job:execution-loop-gate (repeatable)
  --run-policy-adaptation-gate Run policy adaptation gate (promote/disable suggestions + risk checks)
  --policy-adaptation-arg <arg>
                               Extra arg forwarded to job:policy-adaptation-gate (repeatable)
  -h, --help                   Show help

Exit codes:
  0  gate passed
  2  gate failed (data quality/integrity conditions not met)
  1  usage/runtime error
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --strict-warnings)
      STRICT_WARNINGS=true
      shift
      ;;
    --consistency-sample)
      CONSISTENCY_SAMPLE="${2:-}"
      shift 2
      ;;
    --consistency-check-set)
      CONSISTENCY_CHECK_SET="${2:-}"
      shift 2
      ;;
    --skip-backfill)
      AUTO_BACKFILL=false
      shift
      ;;
    --backfill-limit)
      BACKFILL_LIMIT="${2:-}"
      shift 2
      ;;
    --backfill-model)
      BACKFILL_MODEL="${2:-}"
      shift 2
      ;;
    --skip-private-lane-backfill)
      AUTO_PRIVATE_LANE_BACKFILL=false
      shift
      ;;
    --private-lane-backfill-limit)
      PRIVATE_LANE_BACKFILL_LIMIT="${2:-}"
      shift 2
      ;;
    --private-lane-default-owner-agent)
      PRIVATE_LANE_DEFAULT_OWNER_AGENT="${2:-}"
      shift 2
      ;;
    --private-lane-default-owner-team)
      PRIVATE_LANE_DEFAULT_OWNER_TEAM="${2:-}"
      shift 2
      ;;
    --private-lane-no-shared-fallback)
      PRIVATE_LANE_SHARED_FALLBACK=false
      shift
      ;;
    --quality-arg)
      QUALITY_ARGS+=("${2:-}")
      shift 2
      ;;
    --run-execution-loop-gate)
      RUN_EXECUTION_LOOP_GATE=true
      shift
      ;;
    --execution-loop-arg)
      EXECUTION_LOOP_ARGS+=("${2:-}")
      shift 2
      ;;
    --run-policy-adaptation-gate)
      RUN_POLICY_ADAPTATION_GATE=true
      shift
      ;;
    --policy-adaptation-arg)
      POLICY_ADAPTATION_ARGS+=("${2:-}")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "$CONSISTENCY_SAMPLE" =~ ^[0-9]+$ ]]; then
  echo "--consistency-sample must be an integer" >&2
  exit 1
fi
if [[ "$CONSISTENCY_CHECK_SET" != "all" && "$CONSISTENCY_CHECK_SET" != "scope" && "$CONSISTENCY_CHECK_SET" != "cross_tenant" ]]; then
  echo "--consistency-check-set must be one of: all|scope|cross_tenant" >&2
  exit 1
fi
if ! [[ "$BACKFILL_LIMIT" =~ ^[0-9]+$ ]]; then
  echo "--backfill-limit must be an integer" >&2
  exit 1
fi
if ! [[ "$PRIVATE_LANE_BACKFILL_LIMIT" =~ ^[0-9]+$ ]]; then
  echo "--private-lane-backfill-limit must be an integer" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

infer_backfill_model() {
  local provider="${EMBEDDING_PROVIDER:-}"
  case "$provider" in
    minimax)
      if [[ -n "${MINIMAX_EMBED_MODEL:-}" ]]; then
        echo "minimax:${MINIMAX_EMBED_MODEL}"
      else
        echo ""
      fi
      ;;
    openai)
      if [[ -n "${OPENAI_EMBEDDING_MODEL:-}" ]]; then
        echo "openai:${OPENAI_EMBEDDING_MODEL}"
      else
        echo ""
      fi
      ;;
    fake)
      echo "fake:deterministic"
      ;;
    "")
      echo ""
      ;;
    *)
      echo ""
      ;;
  esac
}

backfill_json='{"ok":true,"skipped":true}'
backfill_ok=true
if [[ "$AUTO_BACKFILL" == "true" ]]; then
  model="$BACKFILL_MODEL"
  if [[ -z "$model" ]]; then
    model="$(infer_backfill_model)"
  fi

  if [[ -z "$model" ]]; then
    backfill_json='{"ok":true,"skipped":true,"reason":"cannot_infer_embedding_model"}'
  else
    backfill_cmd=(npm run -s job:embedding-model-backfill -- --scope "$SCOPE" --limit "$BACKFILL_LIMIT" --model "$model")
    set +e
    backfill_raw="$("${backfill_cmd[@]}" 2>&1)"
    backfill_ec=$?
    set -e
    if [[ $backfill_ec -ne 0 ]]; then
      backfill_ok=false
      backfill_json="$(jq -n --arg error "$backfill_raw" --arg model "$model" --argjson exit_code "$backfill_ec" '{ok:false, error:$error, model:$model, exit_code:$exit_code}')"
    else
      if echo "$backfill_raw" | jq -e . >/dev/null 2>&1; then
        backfill_json="$backfill_raw"
      else
        backfill_ok=false
        backfill_json="$(jq -n --arg error "$backfill_raw" --arg model "$model" '{ok:false, error:"non_json_backfill_output", raw:$error, model:$model}')"
      fi
    fi
  fi
fi

private_lane_backfill_json='{"ok":true,"skipped":true}'
private_lane_backfill_ok=true
if [[ "$AUTO_PRIVATE_LANE_BACKFILL" == "true" ]]; then
  lane_cmd=(npm run -s job:private-lane-owner-backfill -- --scope "$SCOPE" --limit "$PRIVATE_LANE_BACKFILL_LIMIT")
  if [[ -n "$PRIVATE_LANE_DEFAULT_OWNER_AGENT" ]]; then
    lane_cmd+=(--default-owner-agent "$PRIVATE_LANE_DEFAULT_OWNER_AGENT")
  fi
  if [[ -n "$PRIVATE_LANE_DEFAULT_OWNER_TEAM" ]]; then
    lane_cmd+=(--default-owner-team "$PRIVATE_LANE_DEFAULT_OWNER_TEAM")
  fi
  if [[ "$PRIVATE_LANE_SHARED_FALLBACK" != "true" ]]; then
    lane_cmd+=(--no-shared-fallback)
  fi
  set +e
  lane_raw="$("${lane_cmd[@]}" 2>&1)"
  lane_ec=$?
  set -e
  if [[ $lane_ec -ne 0 ]]; then
    private_lane_backfill_ok=false
    private_lane_backfill_json="$(jq -n --arg error "$lane_raw" --argjson exit_code "$lane_ec" '{ok:false, error:$error, exit_code:$exit_code}')"
  else
    if echo "$lane_raw" | jq -e . >/dev/null 2>&1; then
      private_lane_backfill_json="$lane_raw"
    else
      private_lane_backfill_ok=false
      private_lane_backfill_json="$(jq -n --arg error "$lane_raw" '{ok:false, error:"non_json_private_lane_backfill_output", raw:$error}')"
    fi
  fi
fi

consistency_cmd=(npm run -s job:consistency-check -- --scope "$SCOPE" --sample "$CONSISTENCY_SAMPLE" --check-set "$CONSISTENCY_CHECK_SET")
consistency_json="$("${consistency_cmd[@]}")"
quality_cmd=(npm run -s job:quality-eval -- --scope "$SCOPE")
if [[ ${#QUALITY_ARGS[@]} -gt 0 ]]; then
  quality_cmd+=("${QUALITY_ARGS[@]}")
fi
quality_json="$("${quality_cmd[@]}")"

execution_loop_json='{"ok":true,"skipped":true}'
execution_loop_ok=true
if [[ "$RUN_EXECUTION_LOOP_GATE" == "true" ]]; then
  execution_loop_cmd=(npm run -s job:execution-loop-gate -- --scope "$SCOPE")
  if [[ "$STRICT_WARNINGS" == "true" ]]; then
    execution_loop_cmd+=(--strict-warnings)
  fi
  if [[ ${#EXECUTION_LOOP_ARGS[@]} -gt 0 ]]; then
    execution_loop_cmd+=("${EXECUTION_LOOP_ARGS[@]}")
  fi

  set +e
  execution_loop_raw="$("${execution_loop_cmd[@]}" 2>&1)"
  execution_loop_ec=$?
  set -e

  if echo "$execution_loop_raw" | jq -e . >/dev/null 2>&1; then
    execution_loop_json="$execution_loop_raw"
  else
    execution_loop_ok=false
    execution_loop_json="$(jq -n --arg error "$execution_loop_raw" --argjson exit_code "$execution_loop_ec" '{ok:false, error:"non_json_execution_loop_output", raw:$error, exit_code:$exit_code}')"
  fi

  if [[ $execution_loop_ec -ne 0 ]]; then
    execution_loop_ok=false
  fi
fi

policy_adaptation_json='{"ok":true,"skipped":true}'
policy_adaptation_ok=true
if [[ "$RUN_POLICY_ADAPTATION_GATE" == "true" ]]; then
  policy_adaptation_cmd=(npm run -s job:policy-adaptation-gate -- --scope "$SCOPE")
  if [[ "$STRICT_WARNINGS" == "true" ]]; then
    policy_adaptation_cmd+=(--strict-warnings)
  fi
  if [[ ${#POLICY_ADAPTATION_ARGS[@]} -gt 0 ]]; then
    policy_adaptation_cmd+=("${POLICY_ADAPTATION_ARGS[@]}")
  fi

  set +e
  policy_adaptation_raw="$("${policy_adaptation_cmd[@]}" 2>&1)"
  policy_adaptation_ec=$?
  set -e

  if echo "$policy_adaptation_raw" | jq -e . >/dev/null 2>&1; then
    policy_adaptation_json="$policy_adaptation_raw"
  else
    policy_adaptation_ok=false
    policy_adaptation_json="$(jq -n --arg error "$policy_adaptation_raw" --argjson exit_code "$policy_adaptation_ec" '{ok:false, error:"non_json_policy_adaptation_output", raw:$error, exit_code:$exit_code}')"
  fi

  if [[ $policy_adaptation_ec -ne 0 ]]; then
    policy_adaptation_ok=false
  fi
fi

consistency_errors="$(echo "$consistency_json" | jq -r '.summary.errors // 0')"
consistency_warnings="$(echo "$consistency_json" | jq -r '.summary.warnings // 0')"
quality_pass="$(echo "$quality_json" | jq -r '.summary.pass // false')"

fail_reasons='[]'
if [[ "$backfill_ok" != "true" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["backfill_failed"]')"
fi
if [[ "$private_lane_backfill_ok" != "true" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["private_lane_backfill_failed"]')"
fi
if [[ "$consistency_errors" != "0" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["consistency_errors"]')"
fi
if [[ "$STRICT_WARNINGS" == "true" && "$consistency_warnings" != "0" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["consistency_warnings"]')"
fi
if [[ "$quality_pass" != "true" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["quality_eval_failed"]')"
fi
if [[ "$execution_loop_ok" != "true" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["execution_loop_gate_failed"]')"
fi
if [[ "$policy_adaptation_ok" != "true" ]]; then
  fail_reasons="$(echo "$fail_reasons" | jq '. + ["policy_adaptation_gate_failed"]')"
fi

ok="true"
if [[ "$(echo "$fail_reasons" | jq 'length')" != "0" ]]; then
  ok="false"
fi

jq -n \
  --arg scope "$SCOPE" \
  --arg consistency_check_set "$CONSISTENCY_CHECK_SET" \
  --argjson strict_warnings "$([[ "$STRICT_WARNINGS" == "true" ]] && echo true || echo false)" \
  --argjson consistency_errors "$consistency_errors" \
  --argjson consistency_warnings "$consistency_warnings" \
  --argjson quality_pass "$([[ "$quality_pass" == "true" ]] && echo true || echo false)" \
  --argjson fail_reasons "$fail_reasons" \
  --argjson backfill "$(echo "$backfill_json" | jq '.')" \
  --argjson private_lane_backfill "$(echo "$private_lane_backfill_json" | jq '.')" \
  --argjson consistency "$(echo "$consistency_json" | jq '.')" \
  --argjson quality "$(echo "$quality_json" | jq '.')" \
  --argjson execution_loop "$(echo "$execution_loop_json" | jq '.')" \
  --argjson policy_adaptation "$(echo "$policy_adaptation_json" | jq '.')" \
  --argjson ok "$([[ "$ok" == "true" ]] && echo true || echo false)" \
  '{
    ok: $ok,
    scope: $scope,
    consistency_check_set: $consistency_check_set,
    gate: {
      strict_warnings: $strict_warnings,
      fail_reasons: $fail_reasons
    },
    backfill: $backfill,
    private_lane_backfill: $private_lane_backfill,
    consistency: {
      errors: $consistency_errors,
      warnings: $consistency_warnings,
      summary: ($consistency.summary // {}),
      checks: ($consistency.checks // [])
    },
    quality: {
      pass: $quality_pass,
      summary: ($quality.summary // {}),
      failed_checks: ($quality.failed_checks // $quality.summary.failed // [])
    },
    execution_loop: $execution_loop,
    policy_adaptation: $policy_adaptation
  }'

if [[ "$ok" != "true" ]]; then
  exit 2
fi
