#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3005}"
OUTCOME="${OUTCOME:-positive}"
RUN_ID="${RUN_ID:-run_demo_0001}"
INCLUDE_SHADOW="${INCLUDE_SHADOW:-false}"
TARGET="${TARGET:-tool}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CTX_FILE="${CTX_FILE:-$SCRIPT_DIR/planner_context.json}"

# Candidates can be passed as args, otherwise use a small default set.
if [[ "$#" -gt 0 ]]; then
  CANDIDATES_JSON="$(printf '%s\n' "$@" | jq -R . | jq -cs .)"
else
  CANDIDATES_JSON='["psql","curl","bash","rm"]'
fi

# First, ask the selector what it would choose (so feedback can carry the selected tool).
sel_payload="$(
  jq -c --argjson candidates "$CANDIDATES_JSON" --arg run_id "$RUN_ID" '
    { scope: (.scope // null), run_id: $run_id, context: ., candidates: $candidates, include_shadow: false, rules_limit: 50, strict: true }
    | if .scope == null then del(.scope) else . end
  ' "$CTX_FILE"
)"

sel_json="$(curl -sS "localhost:${PORT}/v1/memory/tools/select" -H 'content-type: application/json' --data-binary "$sel_payload")"
selected="$(echo "$sel_json" | jq -r '.selection.selected')"
decision_id="$(echo "$sel_json" | jq -r '.decision.decision_id // empty')"

fb_payload="$(
  jq -c --argjson candidates "$CANDIDATES_JSON" --arg outcome "$OUTCOME" --arg selected "$selected" --arg run_id "$RUN_ID" --arg decision_id "$decision_id" '
    {
      scope: (.scope // null),
      context: .,
      candidates: $candidates,
      selected_tool: $selected,
      outcome: $outcome,
      run_id: $run_id,
      decision_id: (if ($decision_id | length) > 0 then $decision_id else null end),
      target: $ENV.TARGET,
      include_shadow: ($ENV.INCLUDE_SHADOW | ascii_downcase == "true"),
      rules_limit: 50,
      input_text: ("tool feedback: selected=" + $selected + " outcome=" + $outcome)
    }
    | if .decision_id == null then del(.decision_id) else . end
    | if .scope == null then del(.scope) else . end
  ' "$CTX_FILE"
)"

curl -sS "localhost:${PORT}/v1/memory/tools/feedback" \
  -H 'content-type: application/json' \
  --data-binary "$fb_payload"
