#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TITLE=""
GOAL=""
QUERY=""
RUN_ID="${AIONIS_RUN_ID:-}"
LEARN_FILE=""
QUALITY_GATE_FILE=""
PLAN_ON_START="true"
declare -a SESSION_ARGS=()
declare -a COMMAND=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="$2"
      shift 2
      ;;
    --title)
      TITLE="$2"
      shift 2
      ;;
    --goal)
      GOAL="$2"
      shift 2
      ;;
    --query)
      QUERY="$2"
      shift 2
      ;;
    --run-id)
      RUN_ID="$2"
      shift 2
      ;;
    --learn-file)
      LEARN_FILE="$2"
      shift 2
      ;;
    --quality-gate-file)
      QUALITY_GATE_FILE="$2"
      shift 2
      ;;
    --plan-on-start)
      PLAN_ON_START="$2"
      shift 2
      ;;
    --acceptance|--tool-candidate|--target|--entrypoint|--must-pass|--forbidden-tool|--preferred-tool|--risk|--tests-status|--lint-status|--build-status|--failing-path|--tenant-id|--scope|--actor|--category|--user-request|--include-shadow|--rules-limit|--tool-strict)
      SESSION_ARGS+=("$1" "$2")
      shift 2
      ;;
    --)
      shift
      if [[ "${1:-}" == "--" ]]; then
        shift
      fi
      COMMAND=("$@")
      break
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TITLE" || -z "$GOAL" ]]; then
  echo "usage: scripts/run_agent_with_aionis.sh --title <title> --goal <goal> [--query <query>] [--learn-file <json>] -- <agent command...>" >&2
  exit 1
fi

if [[ -z "$RUN_ID" ]]; then
  if command -v uuidgen >/dev/null 2>&1; then
    RUN_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  else
    RUN_ID="$(node -e 'console.log(require(\"crypto\").randomUUID())')"
  fi
fi

if [[ ${#COMMAND[@]} -eq 0 ]]; then
  if command -v codex >/dev/null 2>&1; then
    COMMAND=(codex)
  else
    echo "no command provided and 'codex' not found in PATH" >&2
    exit 1
  fi
fi

cd "$ROOT"

echo "[aionis-wrap] run_id=$RUN_ID"

aionis_session_start() {
  local -a start_args=(
    --root "$ROOT"
    --run-id "$RUN_ID"
    --title "$TITLE"
    --goal "$GOAL"
    --query "${QUERY:-$GOAL}"
    --plan-on-start "$PLAN_ON_START"
  )
  if [[ ${#SESSION_ARGS[@]} -gt 0 ]]; then
    start_args+=("${SESSION_ARGS[@]}")
  fi
  npm run -s devloop:session -- start "${start_args[@]}"
}

aionis_session_end() {
  local status="$1"
  local summary="$2"
  local -a end_args=(
    --root "$ROOT"
    --run-id "$RUN_ID"
    --status "$status"
    --summary "$summary"
  )
  if [[ -n "$LEARN_FILE" ]]; then
    end_args+=(--learn-file "$LEARN_FILE")
  elif [[ -n "$QUALITY_GATE_FILE" ]]; then
    end_args+=(--quality-gate-file "$QUALITY_GATE_FILE")
  fi
  npm run -s devloop:session -- end "${end_args[@]}"
}

aionis_session_start

set +e
AIONIS_RUN_ID="$RUN_ID" AIONIS_SESSION_ROOT="$ROOT" "${COMMAND[@]}"
CMD_EXIT=$?
set -e

if [[ $CMD_EXIT -eq 0 ]]; then
  FINAL_STATUS="success"
else
  FINAL_STATUS="failed"
fi

SUMMARY="wrapped command '${COMMAND[0]}' exited with code $CMD_EXIT"
aionis_session_end "$FINAL_STATUS" "$SUMMARY"

exit $CMD_EXIT
