#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need docker
need curl
need node

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
IMAGE="${IMAGE:-aionis-standalone:local}"
STANDALONE_BUILD="${STANDALONE_BUILD:-true}"
CTR="aionis-standalone-lite-smoke-$RANDOM"
VOL="aionis-standalone-lite-smoke-data-$RANDOM"

TMP_DIR="$(mktemp -d /tmp/aionis_standalone_lite_smoke_XXXXXX)"
TMP_ENV="${TMP_DIR}/standalone_lite.env"
WRITE_JSON="${TMP_DIR}/write.json"
RECALL_JSON="${TMP_DIR}/recall.json"

cleanup() {
  docker rm -f "${CTR}" >/dev/null 2>&1 || true
  docker volume rm -f "${VOL}" >/dev/null 2>&1 || true
  rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ -f ".env" ]]; then
  cp ".env" "${TMP_ENV}"
else
  cp ".env.example" "${TMP_ENV}"
fi

{
  echo
  cat "${REPO_ROOT}/scripts/env/profiles/lite.env"
  echo "PORT=${PORT}"
} >> "${TMP_ENV}"

if [[ "${STANDALONE_BUILD}" == "true" ]]; then
  echo "[1/5] build standalone image (${IMAGE})"
  docker build -f Dockerfile.standalone -t "${IMAGE}" . >/dev/null
else
  echo "[1/5] skip build (STANDALONE_BUILD=${STANDALONE_BUILD})"
fi

echo "[2/5] start standalone container (${CTR})"
docker run -d \
  --name "${CTR}" \
  -p "${PORT}:${PORT}" \
  --env-file "${TMP_ENV}" \
  -e "PORT=${PORT}" \
  -v "${VOL}:/var/lib/postgresql/data" \
  "${IMAGE}" >/dev/null

echo "[3/5] wait for health"
ok=0
for _ in $(seq 1 120); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "${ok}" != "1" ]]; then
  echo "standalone health check failed" >&2
  docker logs "${CTR}" | tail -n 120 >&2 || true
  exit 1
fi

echo "[4/5] write shared event"
curl -fsS "${BASE_URL}/v1/memory/write" \
  -H 'content-type: application/json' \
  -d '{"input_text":"standalone lite smoke write","memory_lane":"shared","nodes":[{"type":"event","memory_lane":"shared","title":"Standalone Lite Smoke Event","text_summary":"verify standalone lite defaults"}]}' \
  > "${WRITE_JSON}"

echo "[5/5] recall_text + verify lite budgets"
found=0
for _ in $(seq 1 25); do
  curl -fsS "${BASE_URL}/v1/memory/recall_text" \
    -H 'content-type: application/json' \
    -d '{"query_text":"standalone lite defaults verify","return_debug":true}' \
    > "${RECALL_JSON}"

  seeds="$(node -e "const j=require('${RECALL_JSON}'); console.log(Array.isArray(j.seeds)?j.seeds.length:0)")"
  if [[ "${seeds}" -gt 0 ]]; then
    found=1
    break
  fi
  sleep 1
done
if [[ "${found}" != "1" ]]; then
  echo "recall_text returned no seeds in smoke window" >&2
  cat "${RECALL_JSON}" >&2
  exit 1
fi

node - <<'JS' "${RECALL_JSON}"
const fs = require("fs");
const path = process.argv[2];
const j = JSON.parse(fs.readFileSync(path, "utf8"));
const b = j?.trajectory?.budgets || {};
const expected = {
  limit: 12,
  neighborhood_hops: 1,
  max_nodes: 24,
  max_edges: 24,
  ranked_limit: 48,
  min_edge_weight: 0.25,
  min_edge_confidence: 0.25,
};
for (const [k, v] of Object.entries(expected)) {
  if (b[k] !== v) {
    console.error(`budget mismatch: ${k} expected=${v} actual=${b[k]}`);
    process.exit(1);
  }
}
const out = {
  ok: true,
  seeds: Array.isArray(j.seeds) ? j.seeds.length : null,
  nodes: j?.subgraph?.nodes?.length ?? null,
  edges: j?.subgraph?.edges?.length ?? null,
  trajectory_budgets: b,
  adaptive_profile: j?.observability?.adaptive?.profile ?? null,
};
console.log(JSON.stringify(out, null, 2));
JS

echo "ok: standalone lite smoke passed"
