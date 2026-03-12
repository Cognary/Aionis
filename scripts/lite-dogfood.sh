#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/lite-dogfood.sh

Runs a real-process internal Lite dogfood workflow:
1. build
2. start Lite on a local port
3. health
4. write
5. find
6. recall_text
7. planning/context
8. context/assemble
9. packs export/import
10. replay lifecycle

Environment:
  LITE_DOGFOOD_PORT           Port to use (default: 3321)
  LITE_DOGFOOD_ADMIN_TOKEN    Admin token for pack routes (default: dogfood-admin)
  LITE_DOGFOOD_SCOPE_PREFIX   Scope prefix (default: dogfood_lite_script)
  LITE_DOGFOOD_BUILD          Run npm build first (default: 1)
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${LITE_DOGFOOD_PORT:-3321}"
ADMIN_TOKEN="${LITE_DOGFOOD_ADMIN_TOKEN:-dogfood-admin}"
SCOPE_PREFIX="${LITE_DOGFOOD_SCOPE_PREFIX:-dogfood_lite_script}"
RUN_BUILD="${LITE_DOGFOOD_BUILD:-1}"

if [[ "$RUN_BUILD" == "1" ]]; then
  npm run -s build >/dev/null
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
SCOPE="${SCOPE_PREFIX}_${STAMP}"
ARTIFACT_DIR="$ROOT_DIR/artifacts/lite/dogfood_${STAMP}"
LOG_FILE="$ARTIFACT_DIR/server.log"
mkdir -p "$ARTIFACT_DIR"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

PORT="$PORT" DATABASE_URL= ADMIN_TOKEN="$ADMIN_TOKEN" npm run -s start:lite >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

BASE="http://127.0.0.1:${PORT}"
for _ in $(seq 1 60); do
  if curl -fsS "$BASE/health" >"$ARTIFACT_DIR/health.json" 2>/dev/null; then
    break
  fi
  sleep 0.5
done
if [[ ! -f "$ARTIFACT_DIR/health.json" ]]; then
  echo "Lite dogfood failed: server did not become healthy" >&2
  exit 1
fi

RUN_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
STEP_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

write_code=$(curl -sS -o "$ARTIFACT_DIR/write.json" -w '%{http_code}' -X POST "$BASE/v1/memory/write" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "input_text": "kubectl rollout undo deployment/api in prod if the newest deploy regresses. verify rollout status, check recent events, and capture the rollback decision.",
  "nodes": [
    {
      "type": "event",
      "client_id": "${SCOPE}-event-1",
      "title": "kubectl rollout undo deployment api",
      "summary": "Shared rollback runbook",
      "content": "Use kubectl rollout undo deployment/api, then verify rollout status and capture the decision in memory.",
      "tags": ["dogfood", "lite", "rollback"],
      "memory_lane": "shared"
    }
  ]
}
EOF
)

find_code=$(curl -sS -o "$ARTIFACT_DIR/find.json" -w '%{http_code}' -X POST "$BASE/v1/memory/find" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "title_contains": "kubectl rollout undo",
  "limit": 10
}
EOF
)

recall_code=$(curl -sS -o "$ARTIFACT_DIR/recall_text.json" -w '%{http_code}' -X POST "$BASE/v1/memory/recall_text" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "query_text": "how do i rollback the api deployment when prod deploy regresses",
  "limit": 8,
  "debug": true
}
EOF
)

planning_code=$(curl -sS -o "$ARTIFACT_DIR/planning_context.json" -w '%{http_code}' -X POST "$BASE/v1/memory/planning/context" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "query_text": "prepare rollback steps for the api deployment in prod",
  "include_rules": true,
  "include_tool_selection": true,
  "include_tool_decision": true,
  "context_token_budget": 800
}
EOF
)

assemble_code=$(curl -sS -o "$ARTIFACT_DIR/context_assemble.json" -w '%{http_code}' -X POST "$BASE/v1/memory/context/assemble" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "query_text": "prepare rollback steps for the api deployment in prod",
  "include_rules": true,
  "context_token_budget": 800
}
EOF
)

pack_export_code=$(curl -sS -o "$ARTIFACT_DIR/pack_export.json" -w '%{http_code}' -X POST "$BASE/v1/memory/packs/export" \
  -H 'content-type: application/json' \
  -H "x-admin-token: $ADMIN_TOKEN" \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE"
}
EOF
)

jq '{scope, pack}' "$ARTIFACT_DIR/pack_export.json" > "$ARTIFACT_DIR/pack_payload.json"

pack_import_code=$(curl -sS -o "$ARTIFACT_DIR/pack_import.json" -w '%{http_code}' -X POST "$BASE/v1/memory/packs/import" \
  -H 'content-type: application/json' \
  -H "x-admin-token: $ADMIN_TOKEN" \
  --data-binary @"$ARTIFACT_DIR/pack_payload.json")

replay_start_code=$(curl -sS -o "$ARTIFACT_DIR/replay_start.json" -w '%{http_code}' -X POST "$BASE/v1/memory/replay/run/start" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "run_id": "$RUN_ID",
  "playbook_id": "00000000-0000-0000-0000-000000000777",
  "goal": "rollback the api deployment safely after a failed prod deploy",
  "mode": "simulate",
  "started_at": "2026-03-12T10:50:00Z"
}
EOF
)

replay_before_code=$(curl -sS -o "$ARTIFACT_DIR/replay_before.json" -w '%{http_code}' -X POST "$BASE/v1/memory/replay/step/before" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "run_id": "$RUN_ID",
  "step_id": "$STEP_ID",
  "step_index": 1,
  "tool_name": "kubectl",
  "tool_input": {"cmd": "rollout status deployment/api"},
  "preconditions": [],
  "safety_level": "auto_ok"
}
EOF
)

replay_after_code=$(curl -sS -o "$ARTIFACT_DIR/replay_after.json" -w '%{http_code}' -X POST "$BASE/v1/memory/replay/step/after" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "run_id": "$RUN_ID",
  "step_id": "$STEP_ID",
  "step_index": 1,
  "status": "success",
  "postconditions": [],
  "artifact_refs": [],
  "repair_applied": false
}
EOF
)

replay_end_code=$(curl -sS -o "$ARTIFACT_DIR/replay_end.json" -w '%{http_code}' -X POST "$BASE/v1/memory/replay/run/end" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "run_id": "$RUN_ID",
  "status": "success",
  "summary": "rollback procedure captured",
  "success_criteria": {},
  "metrics": {}
}
EOF
)

replay_get_code=$(curl -sS -o "$ARTIFACT_DIR/replay_get.json" -w '%{http_code}' -X POST "$BASE/v1/memory/replay/runs/get" \
  -H 'content-type: application/json' \
  --data-binary @- <<EOF
{
  "scope": "$SCOPE",
  "run_id": "$RUN_ID",
  "include_steps": true
}
EOF
)

python3 - <<'PY' "$ARTIFACT_DIR" "$SCOPE" "$RUN_ID" \
  "$write_code" "$find_code" "$recall_code" "$planning_code" "$assemble_code" \
  "$pack_export_code" "$pack_import_code" "$replay_start_code" "$replay_before_code" \
  "$replay_after_code" "$replay_end_code" "$replay_get_code"
import json
import pathlib
import sys

artifact_dir = pathlib.Path(sys.argv[1])
scope = sys.argv[2]
run_id = sys.argv[3]
codes = {
    "write": int(sys.argv[4]),
    "find": int(sys.argv[5]),
    "recall_text": int(sys.argv[6]),
    "planning_context": int(sys.argv[7]),
    "context_assemble": int(sys.argv[8]),
    "pack_export": int(sys.argv[9]),
    "pack_import": int(sys.argv[10]),
    "replay_start": int(sys.argv[11]),
    "replay_before": int(sys.argv[12]),
    "replay_after": int(sys.argv[13]),
    "replay_end": int(sys.argv[14]),
    "replay_get": int(sys.argv[15]),
}

def load(name):
    return json.loads((artifact_dir / f"{name}.json").read_text())

health = load("health")
write = load("write")
find = load("find")
recall = load("recall_text")
planning = load("planning_context")
assemble = load("context_assemble")
pack_export = load("pack_export")
pack_import = load("pack_import")
replay_get = load("replay_get")

summary = {
    "scope": scope,
    "run_id": run_id,
    "health": {
        "aionis_edition": health.get("aionis_edition"),
        "memory_store_backend": health.get("memory_store_backend"),
    },
    "http_status": codes,
    "write": {
        "warnings": [w.get("code") for w in write.get("warnings", [])],
        "inline_backfill_completed": any(w.get("code") == "lite_embedding_backfill_completed_inline" for w in write.get("warnings", [])),
    },
    "find": {
        "returned_nodes": find.get("find_summary", {}).get("returned_nodes"),
        "titles": [node.get("title") for node in find.get("nodes", [])],
    },
    "recall_text": {
        "seed_count": len(recall.get("seeds", [])),
        "context_text": recall.get("context", {}).get("text"),
    },
    "planning_context": {
        "context_est_tokens": planning.get("planning_summary", {}).get("context_est_tokens"),
    },
    "context_assemble": {
        "context_est_tokens": assemble.get("assembly_summary", {}).get("context_est_tokens"),
    },
    "packs": {
        "exported_nodes": len(pack_export.get("pack", {}).get("nodes", [])),
        "imported": pack_import.get("imported"),
        "imported_nodes": pack_import.get("nodes"),
    },
    "replay": {
        "status": replay_get.get("run", {}).get("status"),
        "step_count": len(replay_get.get("steps", [])),
    },
}

checks = [
    summary["health"]["aionis_edition"] == "lite",
    summary["health"]["memory_store_backend"] == "lite_sqlite",
    all(code == 200 for code in codes.values()),
    summary["write"]["inline_backfill_completed"],
    summary["find"]["returned_nodes"] >= 1,
    summary["recall_text"]["seed_count"] >= 1,
    (summary["planning_context"]["context_est_tokens"] or 0) > 0,
    (summary["context_assemble"]["context_est_tokens"] or 0) > 0,
    (summary["packs"]["exported_nodes"] or 0) >= 1,
    summary["packs"]["imported"] is True,
    (summary["replay"]["step_count"] or 0) >= 1,
    summary["replay"]["status"] == "success",
]
summary["ok"] = all(checks)

(artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
PY
