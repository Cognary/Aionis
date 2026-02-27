#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:${PORT:-3001}}"
TMP_TABLE="memory_commits_v2_strict_smoke_tmp"
BODY_FILE="/tmp/aionis_strict_shadow_smoke_body.json"
STATUS_FILE="/tmp/aionis_strict_shadow_smoke_status.txt"

cleanup() {
  docker compose exec -T db psql -U aionis -d aionis_memory -c \
    "DO \$\$ BEGIN IF to_regclass('public.${TMP_TABLE}') IS NOT NULL THEN EXECUTE 'ALTER TABLE ${TMP_TABLE} RENAME TO memory_commits_v2'; END IF; END \$\$;" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! curl -fsS "${BASE_URL}/health" >/tmp/aionis_strict_shadow_smoke_health.json 2>/dev/null; then
  cat >&2 <<'EOF'
strict-shadow-failure-smoke: /health unavailable

Start local embedded strict mode first, for example:
  MEMORY_STORE_BACKEND=embedded \
  MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true \
  MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED=true \
  MEMORY_SHADOW_DUAL_WRITE_ENABLED=true \
  MEMORY_SHADOW_DUAL_WRITE_STRICT=true \
  make stack-up
EOF
  exit 1
fi

node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync("/tmp/aionis_strict_shadow_smoke_health.json", "utf8"));
  if (p.memory_store_backend !== "embedded") {
    throw new Error(`expected embedded backend, got ${String(p.memory_store_backend)}`);
  }
  const writeCaps = p.memory_store_write_capabilities || {};
  if (writeCaps.shadow_mirror_v2 !== true) {
    throw new Error("expected memory_store_write_capabilities.shadow_mirror_v2=true");
  }
'

table_exists="$(docker compose exec -T db psql -U aionis -d aionis_memory -Atc "SELECT to_regclass('public.memory_commits_v2') IS NOT NULL;")"
if [[ "${table_exists}" != "t" ]]; then
  echo "strict-shadow-failure-smoke: memory_commits_v2 table missing before probe" >&2
  exit 1
fi

docker compose exec -T db psql -U aionis -d aionis_memory -c \
  "ALTER TABLE memory_commits_v2 RENAME TO ${TMP_TABLE};" >/dev/null

curl -sS -o "${BODY_FILE}" -w "%{http_code}" \
  -X POST "${BASE_URL}/v1/memory/write" \
  -H "content-type: application/json" \
  --data-binary @- >"${STATUS_FILE}" <<'JSON'
{
  "scope": "default",
  "actor": "ci",
  "input_text": "strict runtime mirror failure smoke",
  "auto_embed": false,
  "nodes": [
    {
      "client_id": "strict_shadow_smoke_evt_1",
      "type": "event",
      "text_summary": "strict runtime mirror failure smoke"
    }
  ],
  "edges": []
}
JSON

node -e '
  const fs = require("fs");
  const status = Number(fs.readFileSync(process.argv[1], "utf8").trim());
  const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const fail = (msg) => {
    console.error(msg);
    process.exit(1);
  };
  if (status !== 500) fail(`expected HTTP 500, got ${status}`);
  if (body.error !== "shadow_dual_write_strict_failure") {
    fail(`expected error=shadow_dual_write_strict_failure, got ${String(body.error)}`);
  }
  const d = body.details || {};
  if (d.capability !== "shadow_mirror_v2") fail("expected details.capability=shadow_mirror_v2");
  if (d.degraded_mode !== "mirror_failed") fail(`expected details.degraded_mode=mirror_failed, got ${String(d.degraded_mode)}`);
  if (d.failure_mode !== "soft_degrade") fail(`expected details.failure_mode=soft_degrade, got ${String(d.failure_mode)}`);
  if (d.fallback_applied !== false) fail("expected details.fallback_applied=false");
  if (d.strict !== true) fail("expected details.strict=true");
  if (d.mirrored !== false) fail("expected details.mirrored=false");
  console.log("strict-shadow-failure-smoke: ok");
' "${STATUS_FILE}" "${BODY_FILE}"
