#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3005}"
QUERY_TEXT="${1:-memory graph}"
shift || true

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CTX_FILE="${CTX_FILE:-$SCRIPT_DIR/planner_context.json}"

# Usage:
#   bash examples/planning_context.sh "query text" psql curl bash
# If no tool candidates are passed, tools selection is skipped.

payload="$(
  jq -c \
    --arg q "$QUERY_TEXT" \
    --argjson candidates "$(printf '%s\n' "$@" | jq -R . | jq -s .)" \
    '
      {
        query_text: $q,
        context: .,
        include_shadow: true,
        rules_limit: 50,
        limit: 20,
        tool_candidates: (if ($candidates | length) > 0 then $candidates else null end)
      }
      | if .tool_candidates == null then del(.tool_candidates) else . end
    ' "$CTX_FILE"
)"

curl -sS "localhost:${PORT}/v1/memory/planning/context" \
  -H 'content-type: application/json' \
  --data-binary "$payload"
