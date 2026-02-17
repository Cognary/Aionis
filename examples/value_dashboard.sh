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

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 1
fi

PORT="${PORT:-3001}"
SCOPE="${MEMORY_SCOPE:-default}"
QUERY_TEXT="${1:-memory graph}"
DB_URL="${DATABASE_URL:-}"
RECALL_LIMIT=20
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is empty." >&2
  exit 1
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
  tmp="$(mktemp /tmp/aionis_value_api_XXXXXX.json)"
  code="$(
    curl -sS -o "${tmp}" -w "%{http_code}" "http://localhost:${PORT}${path}" \
      -H 'content-type: application/json' \
      "${AUTH_ARGS[@]}" \
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

nodes_total="$(psql "$DB_URL" -tAc "select count(*) from memory_nodes where scope='${SCOPE}';" | tr -d '[:space:]')"
edges_total="$(psql "$DB_URL" -tAc "select count(*) from memory_edges where scope='${SCOPE}';" | tr -d '[:space:]')"
ready_nodes="$(psql "$DB_URL" -tAc "select count(*) from memory_nodes where scope='${SCOPE}' and embedding_status='ready';" | tr -d '[:space:]')"
active_rules="$(psql "$DB_URL" -tAc "select count(*) from memory_rule_defs where scope='${SCOPE}' and state='active';" | tr -d '[:space:]')"
shadow_rules="$(psql "$DB_URL" -tAc "select count(*) from memory_rule_defs where scope='${SCOPE}' and state='shadow';" | tr -d '[:space:]')"
rule_positive="$(psql "$DB_URL" -tAc "select coalesce(sum(positive_count),0) from memory_rule_defs where scope='${SCOPE}';" | tr -d '[:space:]')"
rule_negative="$(psql "$DB_URL" -tAc "select coalesce(sum(negative_count),0) from memory_rule_defs where scope='${SCOPE}';" | tr -d '[:space:]')"
rules_with_feedback="$(psql "$DB_URL" -tAc "select count(*) from memory_rule_defs where scope='${SCOPE}' and state='active' and (positive_count + negative_count) > 0;" | tr -d '[:space:]')"

recall_json="$(
  api_post_json "/v1/memory/recall_text" \
    "$(jq -cn --arg scope "$SCOPE" --arg q "$QUERY_TEXT" --argjson limit "$RECALL_LIMIT" '{scope:$scope, query_text:$q, limit:$limit}')"
)"

recall_summary="$(echo "$recall_json" | jq --argjson limit "$RECALL_LIMIT" '
  . as $r
  | {
      seeds:(.seeds|length),
      nodes:(.subgraph.nodes|length),
      edges:(.subgraph.edges|length),
      context_chars:(.context.text|length),
      source_chars: (
        [(.subgraph.nodes[]? | ((.title // "") + " " + (.text_summary // "")) | length)] | add // 0
      ),
      recall_hit_rate: (if $limit > 0 then ((.seeds|length) / $limit) else 0 end),
      context_compression_ratio: (
        if (([.subgraph.nodes[]? | ((.title // "") + " " + (.text_summary // "")) | length] | add // 0) > 0)
        then ((.context.text|length) / ([.subgraph.nodes[]? | ((.title // "") + " " + (.text_summary // "")) | length] | add))
        else 0
        end
      )
    }')"

jq -n \
  --arg scope "$SCOPE" \
  --arg query "$QUERY_TEXT" \
  --argjson nodes_total "${nodes_total:-0}" \
  --argjson edges_total "${edges_total:-0}" \
  --argjson ready_nodes "${ready_nodes:-0}" \
  --argjson active_rules "${active_rules:-0}" \
  --argjson shadow_rules "${shadow_rules:-0}" \
  --argjson rule_positive "${rule_positive:-0}" \
  --argjson rule_negative "${rule_negative:-0}" \
  --argjson rules_with_feedback "${rules_with_feedback:-0}" \
  --argjson recall "$recall_summary" \
  '{
    snapshot_at: (now | todateiso8601),
    scope: $scope,
    query_probe: $query,
    storage: {
      nodes_total: $nodes_total,
      edges_total: $edges_total,
      ready_nodes: $ready_nodes,
      ready_ratio: (if $nodes_total > 0 then ($ready_nodes / $nodes_total) else 0 end)
    },
    rules: {
      active: $active_rules,
      shadow: $shadow_rules,
      positive_total: $rule_positive,
      negative_total: $rule_negative,
      net_score: ($rule_positive - $rule_negative),
      rules_hit_rate: (if $active_rules > 0 then ($rules_with_feedback / $active_rules) else 0 end),
      feedback_positive_negative_ratio: (if $rule_negative > 0 then ($rule_positive / $rule_negative) else null end)
    },
    recall_probe: $recall
  }'
