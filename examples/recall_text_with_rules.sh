#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3005}"
QUERY_TEXT="${1:-memory graph}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CTX_FILE="${CTX_FILE:-$SCRIPT_DIR/planner_context.json}"

# This calls /v1/memory/recall_text and injects rules evaluation using the same normalized planner context.
# Response includes `.rules.applied.policy` (ACTIVE rules), plus `.rules.applied.shadow_policy` if include_shadow=true.
payload="$(
  jq -c --arg q "$QUERY_TEXT" '
    {
      query_text: $q,
      limit: 20,
      rules_context: .,
      rules_include_shadow: true,
      rules_limit: 50
    }
  ' "$CTX_FILE"
)"

curl -sS "localhost:${PORT}/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  --data-binary "$payload"

