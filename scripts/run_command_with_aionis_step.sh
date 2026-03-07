#!/usr/bin/env bash
set -euo pipefail

ROOT="${AIONIS_SESSION_ROOT:-$(pwd)}"
RUN_ID="${AIONIS_RUN_ID:-}"
TOOL_NAME=""
CWD=""
declare -a EXTRA_ARGS=()
declare -a COMMAND=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="$2"
      shift 2
      ;;
    --run-id)
      RUN_ID="$2"
      shift 2
      ;;
    --tool-name)
      TOOL_NAME="$2"
      shift 2
      ;;
    --cwd)
      CWD="$2"
      shift 2
      ;;
    --timeout-ms|--tenant-id|--scope|--actor|--decision-id|--step-id|--metadata-file|--expected-file|--safety-level)
      EXTRA_ARGS+=("$1" "$2")
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

if [[ -z "$RUN_ID" ]]; then
  echo "AIONIS_RUN_ID is required, or pass --run-id" >&2
  exit 1
fi

if [[ ${#COMMAND[@]} -eq 0 ]]; then
  echo "usage: scripts/run_command_with_aionis_step.sh [--tool-name <name>] [--run-id <uuid>] -- <command...>" >&2
  exit 1
fi

if [[ -z "$TOOL_NAME" ]]; then
  TOOL_NAME="$(basename "${COMMAND[0]}")"
fi

if [[ -z "$CWD" ]]; then
  CWD="$ROOT"
fi

cd "$ROOT"

declare -a STEP_ARGS=(
  --root "$ROOT"
  --run-id "$RUN_ID"
  --tool-name "$TOOL_NAME"
  --cwd "$CWD"
)

if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  STEP_ARGS+=("${EXTRA_ARGS[@]}")
fi

npm run -s devloop:step:auto -- \
  "${STEP_ARGS[@]}" \
  -- "${COMMAND[@]}"
