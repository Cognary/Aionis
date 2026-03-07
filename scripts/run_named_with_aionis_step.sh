#!/usr/bin/env bash
set -euo pipefail

TASK_KIND="${1:-}"
if [[ -z "$TASK_KIND" ]]; then
  echo "usage: scripts/run_named_with_aionis_step.sh <build|test|lint> [--tool-name <name>] [--root <dir>] [-- <command...>]" >&2
  exit 1
fi
shift

ROOT="${AIONIS_SESSION_ROOT:-$(pwd)}"
RUN_ID="${AIONIS_RUN_ID:-}"
TOOL_NAME=""
declare -a EXTRA_ARGS=()
declare -a COMMAND=()

infer_default_command() {
  case "$TASK_KIND" in
    build)
      if [[ -f "$ROOT/package.json" ]]; then
        printf '%s\0' npm run build
        return
      fi
      if [[ -f "$ROOT/Cargo.toml" ]]; then
        printf '%s\0' cargo build
        return
      fi
      if [[ -f "$ROOT/pyproject.toml" ]]; then
        printf '%s\0' python3 -m build
        return
      fi
      ;;
    test)
      if [[ -f "$ROOT/package.json" ]]; then
        printf '%s\0' npm test
        return
      fi
      if [[ -f "$ROOT/Cargo.toml" ]]; then
        printf '%s\0' cargo test
        return
      fi
      if [[ -f "$ROOT/pyproject.toml" || -f "$ROOT/pytest.ini" ]]; then
        printf '%s\0' pytest
        return
      fi
      ;;
    lint)
      if [[ -f "$ROOT/package.json" ]]; then
        printf '%s\0' npm run lint
        return
      fi
      if [[ -f "$ROOT/Cargo.toml" ]]; then
        printf '%s\0' cargo clippy --all-targets --all-features -- -D warnings
        return
      fi
      if [[ -f "$ROOT/pyproject.toml" ]]; then
        printf '%s\0' ruff check .
        return
      fi
      ;;
  esac
  return 1
}

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

if [[ -z "$TOOL_NAME" ]]; then
  TOOL_NAME="$TASK_KIND"
fi

if [[ ${#COMMAND[@]} -eq 0 ]]; then
  mapfile -d '' -t COMMAND < <(infer_default_command) || {
    echo "could not infer a default command for task '$TASK_KIND'; pass one after --" >&2
    exit 1
  }
fi

declare -a FORWARD_ARGS=(
  --root "$ROOT"
  --run-id "$RUN_ID"
  --tool-name "$TOOL_NAME"
)

if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  FORWARD_ARGS+=("${EXTRA_ARGS[@]}")
fi

exec bash "$ROOT/scripts/run_command_with_aionis_step.sh" \
  "${FORWARD_ARGS[@]}" \
  -- "${COMMAND[@]}"
