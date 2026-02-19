#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

PORT="${PORT:-3001}"
SCOPE="${MEMORY_SCOPE:-default}"
WAIT_SECONDS=40
RUN_WORKER_ONCE="auto"
REQUIRE_SUCCESS=false
RESULT_FILE=""
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --wait-seconds)
      WAIT_SECONDS="${2:-}"
      shift 2
      ;;
    --run-worker-once)
      RUN_WORKER_ONCE="${2:-auto}"
      shift 2
      ;;
    --require-success)
      REQUIRE_SUCCESS=true
      shift
      ;;
    --result-file)
      RESULT_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if ! [[ "$WAIT_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--wait-seconds must be an integer." >&2
  exit 1
fi

if [[ -n "${RESULT_FILE}" ]]; then
  mkdir -p "$(dirname "${RESULT_FILE}")"
fi

infer_api_key() {
  if [[ -n "${API_KEY}" ]]; then
    echo "${API_KEY}"
    return 0
  fi
  if [[ -n "${MEMORY_API_KEYS_JSON:-}" ]]; then
    echo "${MEMORY_API_KEYS_JSON}" | jq -r 'keys[0] // empty' 2>/dev/null || true
    return 0
  fi
  echo ""
}

if [[ -z "${AUTH_BEARER}" ]]; then
  API_KEY="$(infer_api_key)"
fi

AUTH_ARGS=()
if [[ -n "${API_KEY}" ]]; then
  AUTH_ARGS+=(-H "X-Api-Key: ${API_KEY}")
fi
if [[ -n "${AUTH_BEARER}" ]]; then
  AUTH_ARGS+=(-H "Authorization: Bearer ${AUTH_BEARER}")
fi

case "${AUTH_MODE}" in
  api_key)
    if [[ ${#AUTH_ARGS[@]} -eq 0 ]]; then
      echo "MEMORY_AUTH_MODE=api_key but no API key found (set API_KEY or MEMORY_API_KEYS_JSON)." >&2
      exit 1
    fi
    ;;
  jwt)
    if [[ -z "${AUTH_BEARER}" ]]; then
      echo "MEMORY_AUTH_MODE=jwt but AUTH_BEARER is empty." >&2
      exit 1
    fi
    ;;
  api_key_or_jwt)
    if [[ ${#AUTH_ARGS[@]} -eq 0 ]]; then
      echo "MEMORY_AUTH_MODE=api_key_or_jwt but neither key nor bearer provided." >&2
      exit 1
    fi
    ;;
esac

api_post_json() {
  local path="$1"
  local payload="$2"
  local tmp code
  tmp="$(mktemp /tmp/aionis_killer_api_XXXXXX.json)"
  code="$(
    curl -sS -o "${tmp}" -w "%{http_code}" "http://localhost:${PORT}${path}" \
      -H 'content-type: application/json' \
      ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} \
      --data-binary "${payload}"
  )"
  if [[ "${code}" != "200" ]]; then
    echo "request failed: ${path} http=${code}" >&2
    cat "${tmp}" >&2 || true
    rm -f "${tmp}" || true
    return 1
  fi
  cat "${tmp}"
  rm -f "${tmp}" || true
}

if ! curl -fsS "http://localhost:${PORT}/health" >/dev/null; then
  echo "API is not reachable at localhost:${PORT}." >&2
  exit 1
fi

stamp="$(date +%s)"
demo_id="killer_demo_${stamp}"
demo_tag="$(LC_ALL=C tr -dc 'a-z' </dev/urandom | head -c 8 || true)"
if [[ -z "$demo_tag" ]]; then
  demo_tag="alphakey"
fi
query_key="Aionis demo key ${demo_tag}"
run_id="run_${demo_tag}"

echo "== Killer demo id: ${demo_id} =="

baseline_json="$(
  api_post_json "/v1/memory/recall_text" \
    "$(jq -cn --arg scope "$SCOPE" --arg q "$query_key" '{scope:$scope, query_text:$q, limit:20}')"
)"

baseline_summary="$(echo "$baseline_json" | jq '{seeds:(.seeds|length), nodes:(.subgraph.nodes|length), edges:(.subgraph.edges|length), context_chars:(.context.text|length)}')"
baseline_summary="$(echo "$baseline_json" | jq --arg k "$query_key" '
  {
    seeds:(.seeds|length),
    nodes:(.subgraph.nodes|length),
    edges:(.subgraph.edges|length),
    context_chars:(.context.text|length),
    target_hits:(
      [.subgraph.nodes[]
        | select(((.title // "") | contains($k)) or ((.text_summary // "") | contains($k)))
      ] | length
    )
  }')"

echo
echo "== Baseline (before memory write) =="
echo "$baseline_summary"

write_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg eid "evt_${demo_id}_1" \
    --arg eid2 "evt_${demo_id}_2" \
    --arg ent "ent_${demo_id}" \
    --arg top "topic_${demo_id}" \
    --arg k "$query_key" \
    '{
      scope: $scope,
      input_text: "killer demo seed",
      auto_embed: true,
      memory_lane: "shared",
      trigger_topic_cluster: false,
      nodes: [
        {client_id:$ent, type:"entity", title:"Project Phoenix", text_summary:("Core project profile. "+$k)},
        {client_id:$top, type:"topic", title:"Release Readiness", text_summary:("Main release memory thread. "+$k)},
        {client_id:$eid, type:"event", text_summary:("Rollback policy requires canary + metric gate. "+$k)},
        {client_id:$eid2, type:"event", text_summary:("Production incident postmortem prioritized latency fixes. "+$k)}
      ],
      edges: [
        {type:"part_of", src:{client_id:$eid}, dst:{client_id:$top}, weight:0.9},
        {type:"part_of", src:{client_id:$eid2}, dst:{client_id:$top}, weight:0.9},
        {type:"related_to", src:{client_id:$ent}, dst:{client_id:$top}, weight:0.7}
      ]
    }'
)"

write_json="$(api_post_json "/v1/memory/write" "$write_payload")"

echo
echo "== Write result =="
echo "$write_json" | jq '{commit_id, nodes:(.nodes|length), edges:(.edges|length), embedding_backfill:(.embedding_backfill // null)}'

if [[ "$RUN_WORKER_ONCE" == "true" ]] || { [[ "$RUN_WORKER_ONCE" == "auto" ]] && command -v npm >/dev/null 2>&1; }; then
  echo
  echo "Running outbox worker once (to accelerate embedding readiness)..."
  npm run -s job:outbox-worker -- --once >/tmp/aionis_killer_worker.json || true
  cat /tmp/aionis_killer_worker.json 2>/dev/null || true
fi

after_json=""
for _ in $(seq 1 "$WAIT_SECONDS"); do
  after_json="$(
    api_post_json "/v1/memory/recall_text" \
      "$(jq -cn --arg scope "$SCOPE" --arg q "$query_key" '{scope:$scope, query_text:$q, limit:20}')"
  )"
  seeds="$(echo "$after_json" | jq -r '.seeds|length')"
  if [[ "$seeds" -gt 0 ]]; then
    break
  fi
  sleep 1
done

after_summary="$(echo "$after_json" | jq '{seeds:(.seeds|length), nodes:(.subgraph.nodes|length), edges:(.subgraph.edges|length), context_chars:(.context.text|length)}')"
after_summary="$(echo "$after_json" | jq --arg k "$query_key" '
  {
    seeds:(.seeds|length),
    nodes:(.subgraph.nodes|length),
    edges:(.subgraph.edges|length),
    context_chars:(.context.text|length),
    target_hits:(
      [.subgraph.nodes[]
        | select(((.title // "") | contains($k)) or ((.text_summary // "") | contains($k)))
      ] | length
    )
  }')"

tool_before="$(
  api_post_json "/v1/memory/tools/select" \
    "$(jq -cn --arg scope "$SCOPE" --arg run "$run_id" '{scope:$scope, context:{run:{id:$run}}, candidates:["bash","curl"], strict:true, include_shadow:false, rules_limit:50}')"
)"

rule_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    --arg cid "rule_${demo_id}" \
    --arg run "$run_id" \
    '{
      scope:$scope,
      input_text:"killer demo tool rule",
      memory_lane:"shared",
      nodes:[
        {
          client_id:$cid,
          type:"rule",
          text_summary:"When this demo run id matches, prefer curl and deny bash.",
          slots:{
            if:{"run.id":$run},
            then:{tool:{prefer:["curl"],deny:["bash"]}},
            rule_meta:{priority:50,weight:2}
          }
        }
      ]
    }'
)"

rule_write="$(api_post_json "/v1/memory/write" "$rule_payload")"
rule_id="$(echo "$rule_write" | jq -r '.nodes[0].id // empty')"
if [[ -z "$rule_id" ]]; then
  echo "failed to create tool rule" >&2
  exit 1
fi
api_post_json "/v1/memory/rules/state" \
  "$(jq -cn --arg scope "$SCOPE" --arg id "$rule_id" '{scope:$scope, rule_node_id:$id, state:"active", input_text:"activate killer demo rule"}')" \
  >/tmp/aionis_killer_rule_state.json

tool_after="$(
  api_post_json "/v1/memory/tools/select" \
    "$(jq -cn --arg scope "$SCOPE" --arg run "$run_id" '{scope:$scope, context:{run:{id:$run}}, candidates:["bash","curl"], strict:true, include_shadow:false, rules_limit:50}')"
)"

echo
echo "== After write (memory recall) =="
echo "$after_summary"

echo
echo "== Tool selection delta (before vs after rule) =="
jq -n --argjson b "$tool_before" --argjson a "$tool_after" \
  '{before:{selected:$b.selection.selected, ordered:$b.selection.ordered, denied:$b.selection.denied}, after:{selected:$a.selection.selected, ordered:$a.selection.ordered, denied:$a.selection.denied}}'

cross_session_json="$(
  api_post_json "/v1/memory/recall_text" \
    "$(jq -cn --arg scope "$SCOPE" --arg q "$query_key" '{scope:$scope, query_text:$q, limit:20}')"
)"

cross_session_summary="$(echo "$cross_session_json" | jq --arg k "$query_key" '
  {
    seeds:(.seeds|length),
    nodes:(.subgraph.nodes|length),
    edges:(.subgraph.edges|length),
    context_chars:(.context.text|length),
    target_hits:(
      [.subgraph.nodes[]
        | select(((.title // "") | contains($k)) or ((.text_summary // "") | contains($k)))
      ] | length
    )
  }')"

echo
echo "== Cross-session memory check (new request) =="
echo "$cross_session_summary"

echo
echo "== Value delta =="
value_delta_json="$(
  jq -n --argjson b "$baseline_summary" --argjson a "$after_summary" --argjson c "$cross_session_summary" \
    '{recall_gain:{seed_delta:($a.seeds-$b.seeds), node_delta:($a.nodes-$b.nodes), edge_delta:($a.edges-$b.edges), context_char_delta:($a.context_chars-$b.context_chars), target_hit_delta:($a.target_hits-$b.target_hits)}, success:{memory_recall_improved:(($a.target_hits-$b.target_hits)>0), cross_session_recall_stable:($c.target_hits>0)}}'
)"
echo "$value_delta_json"

if [[ -n "${RESULT_FILE}" ]]; then
  printf '%s\n' "$value_delta_json" > "${RESULT_FILE}"
fi

if [[ "${REQUIRE_SUCCESS}" == "true" ]]; then
  memory_ok="$(echo "$value_delta_json" | jq -r '.success.memory_recall_improved')"
  cross_ok="$(echo "$value_delta_json" | jq -r '.success.cross_session_recall_stable')"
  if [[ "${memory_ok}" != "true" || "${cross_ok}" != "true" ]]; then
    echo "killer demo failed strict success criteria (memory_recall_improved=true and cross_session_recall_stable=true required)." >&2
    exit 1
  fi
fi

echo
echo "Demo-specific matched nodes:"
echo "$after_json" | jq --arg k "$query_key" '[.subgraph.nodes[] | select(((.title // "") | contains($k)) or ((.text_summary // "") | contains($k))) | {id,type,title,text_summary}]'
