#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need curl
need jq
need psql
need npm
need node

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
DB_URL="${DATABASE_URL:-}"
SCOPE="${SCOPE:-fault_inject_$(date +%s)}"
AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
API_KEY="${API_KEY:-${PERF_API_KEY:-}}"
AUTH_BEARER="${AUTH_BEARER:-${PERF_AUTH_BEARER:-}}"
TENANT_ID="${MEMORY_TENANT_ID:-default}"

if [[ -z "$DB_URL" ]]; then
  echo "DATABASE_URL is empty; load .env first." >&2
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

AUTH_ARGS=()
if [[ -n "${AUTH_BEARER}" ]]; then
  AUTH_ARGS+=(-H "Authorization: Bearer ${AUTH_BEARER}")
fi
if [[ -z "${AUTH_BEARER}" ]]; then
  inferred_key="$(infer_api_key)"
  if [[ -n "${inferred_key}" ]]; then
    AUTH_ARGS+=(-H "X-Api-Key: ${inferred_key}")
  fi
fi

case "${AUTH_MODE}" in
  api_key)
    if [[ ${#AUTH_ARGS[@]} -eq 0 ]]; then
      echo "MEMORY_AUTH_MODE=api_key but no API key found." >&2
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

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "API is not reachable at ${BASE_URL}" >&2
  exit 1
fi

call_memory_post() {
  local endpoint="$1"
  local payload="$2"
  local curl_args=(
    -sS
    "${BASE_URL}${endpoint}"
    -H 'content-type: application/json'
  )
  if [[ ${#AUTH_ARGS[@]} -gt 0 ]]; then
    curl_args+=("${AUTH_ARGS[@]}")
  fi
  curl_args+=(--data-binary "$payload")
  curl "${curl_args[@]}"
}

seed_payload="$(
  jq -cn \
    --arg scope "$SCOPE" \
    '{
      scope: $scope,
      input_text: "replay learning fault-injection smoke seed",
      auto_embed: false,
      nodes: [
        {
          client_id: "fault-seed-event",
          type: "event",
          text_summary: "seed commit for replay learning outbox fault injection smoke"
        }
      ]
    }'
)"

seed_json="$(call_memory_post "/v1/memory/write" "$seed_payload")"
seed_commit_id="$(echo "$seed_json" | jq -r '.commit_id // empty')"
if [[ -z "$seed_commit_id" ]]; then
  echo "seed write failed:" >&2
  echo "$seed_json" | jq . >&2
  exit 1
fi

retry_job_key="replay_learning_retryable_${SCOPE}"
fatal_job_key="replay_learning_fatal_${SCOPE}"
retry_payload="$(
  jq -cn \
    --arg tenant_id "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg scope_key "$SCOPE" \
    --arg commit_id "$seed_commit_id" \
    '{
      tenant_id: $tenant_id,
      scope: $scope,
      scope_key: $scope_key,
      actor: "fault_injection_smoke",
      playbook_id: "00000000-0000-0000-0000-000000000001",
      playbook_version: 1,
      source_commit_id: $commit_id,
      config: {
        enabled: true,
        mode: "rule_and_episode",
        delivery: "async_outbox",
        target_rule_state: "draft",
        min_total_steps: 0,
        min_success_ratio: 0,
        max_matcher_bytes: 16384,
        max_tool_prefer: 8,
        episode_ttl_days: 30
      },
      fault_injection_mode: "retryable_error"
    }'
)"
fatal_payload="$(
  jq -cn \
    --arg tenant_id "$TENANT_ID" \
    --arg scope "$SCOPE" \
    --arg scope_key "$SCOPE" \
    --arg commit_id "$seed_commit_id" \
    '{
      tenant_id: $tenant_id,
      scope: $scope,
      scope_key: $scope_key,
      actor: "fault_injection_smoke",
      playbook_id: "00000000-0000-0000-0000-000000000002",
      playbook_version: 1,
      source_commit_id: $commit_id,
      config: {
        enabled: true,
        mode: "rule_and_episode",
        delivery: "async_outbox",
        target_rule_state: "draft",
        min_total_steps: 0,
        min_success_ratio: 0,
        max_matcher_bytes: 16384,
        max_tool_prefer: 8,
        episode_ttl_days: 30
      },
      fault_injection_mode: "fatal_error"
    }'
)"

psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO memory_outbox (scope, commit_id, event_type, job_key, payload, claimed_at)
VALUES
  (
    '${SCOPE}',
    '${seed_commit_id}'::uuid,
    'replay_learning_projection',
    '${retry_job_key}',
    '${retry_payload}'::jsonb,
    now() - interval '1 second'
  ),
  (
    '${SCOPE}',
    '${seed_commit_id}'::uuid,
    'replay_learning_projection',
    '${fatal_job_key}',
    '${fatal_payload}'::jsonb,
    now() - interval '1 second'
  )
ON CONFLICT (scope, event_type, job_key) DO NOTHING;
SQL

OUTBOX_CLAIM_TIMEOUT_MS=1 REPLAY_LEARNING_FAULT_INJECTION_ENABLED=true npm run -s job:outbox-worker -- --once >/dev/null

rows_json="$(
  psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "
    SELECT coalesce(
      json_agg(
        json_build_object(
          'job_key', job_key,
          'attempts', attempts,
          'published', (published_at IS NOT NULL),
          'failed', (failed_at IS NOT NULL),
          'failed_reason', coalesce(failed_reason, ''),
          'last_error', coalesce(last_error, '')
        )
        ORDER BY job_key
      ),
      '[]'::json
    )::text
    FROM memory_outbox
    WHERE scope='${SCOPE}'
      AND event_type='replay_learning_projection'
      AND job_key IN ('${retry_job_key}', '${fatal_job_key}');
  "
)"

node - "$rows_json" "$retry_job_key" "$fatal_job_key" <<'JS'
const rows = JSON.parse(process.argv[2] || "[]");
const retryKey = process.argv[3];
const fatalKey = process.argv[4];
const byKey = new Map(rows.map((r) => [String(r.job_key), r]));
const retry = byKey.get(retryKey);
const fatal = byKey.get(fatalKey);
if (!retry || !fatal) {
  console.error("missing outbox rows for retry/fatal checks");
  process.exit(1);
}
if (fatal.failed !== true || fatal.failed_reason !== "replay_learning_injected_fatal") {
  console.error("fatal classification assertion failed", fatal);
  process.exit(1);
}
if (retry.failed === true || retry.published === true || Number(retry.attempts ?? 0) < 1) {
  console.error("retryable classification assertion failed", retry);
  process.exit(1);
}
if (!String(retry.last_error || "").includes("replay_learning_injected_retryable")) {
  console.error("retryable last_error assertion failed", retry);
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      scope: rows[0]?.scope ?? null,
      fatal,
      retryable: retry,
    },
    null,
    2,
  ),
);
JS

echo "ok: replay learning fault-injection smoke passed"
