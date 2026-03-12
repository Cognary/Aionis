#!/usr/bin/env bash
set -euo pipefail

PRINT_ONLY="false"
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --print)
      PRINT_ONLY="true"
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "${PRINT_ONLY}" == "true" ]]; then
  if (( ${#ARGS[@]} > 0 )); then
    printf 'command=codex %s\n' "${ARGS[*]}"
  else
    printf 'command=codex\n'
  fi
  printf 'override=mcp_servers.aionis-dev.enabled=false\n'
  exit 0
fi

if (( ${#ARGS[@]} > 0 )); then
  exec codex -c 'mcp_servers.aionis-dev.enabled=false' "${ARGS[@]}"
else
  exec codex -c 'mcp_servers.aionis-dev.enabled=false'
fi
