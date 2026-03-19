#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need node
need curl

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

pick_free_port() {
  node - <<'JS'
const net = require("net");
async function canListen(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}
(async () => {
  for (let port = 3321; port < 3400; port += 1) {
    if (await canListen(port)) {
      process.stdout.write(String(port));
      return;
    }
  }
  process.exit(1);
})();
JS
}

TMP_DIR="$(mktemp -d /tmp/aionis_lite_repo_smoke_XXXXXX)"
PORT="${PORT:-$(pick_free_port)}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="${TMP_DIR}/lite-smoke.log"

cleanup() {
  if [[ -n "${PID:-}" ]]; then
    kill "${PID}" >/dev/null 2>&1 || true
    wait "${PID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

LITE_WRITE_SQLITE_PATH="${TMP_DIR}/write.sqlite" \
LITE_REPLAY_SQLITE_PATH="${TMP_DIR}/replay.sqlite" \
PORT="${PORT}" \
bash apps/lite/scripts/start-lite-app.sh >"${LOG_FILE}" 2>&1 &
PID=$!

ok=0
for _ in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/health" > "${TMP_DIR}/health.json" 2>/dev/null; then
    ok=1
    break
  fi
  sleep 1
done

if [[ "${ok}" != "1" ]]; then
  echo "lite smoke health check failed" >&2
  cat "${LOG_FILE}" >&2 || true
  exit 1
fi

node - <<'JS' "${TMP_DIR}/health.json"
const fs = require("fs");
const health = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (health?.runtime?.edition !== "lite") {
  console.error(`expected lite edition, got ${health?.runtime?.edition}`);
  process.exit(1);
}
if (health?.storage?.backend !== "lite_sqlite") {
  console.error(`expected lite_sqlite backend, got ${health?.storage?.backend}`);
  process.exit(1);
}
if (health?.sandbox?.enabled !== true || health?.sandbox?.mode !== "mock") {
  console.error(`expected enabled mock sandbox, got ${JSON.stringify(health?.sandbox ?? null)}`);
  process.exit(1);
}
if (!health?.lite?.stores?.write || !health?.lite?.stores?.recall) {
  console.error("expected lite health stores for write and recall");
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  runtime: health.runtime,
  storage: { backend: health.storage.backend },
  sandbox: { enabled: health.sandbox.enabled, mode: health.sandbox.mode },
}, null, 2));
JS

curl -fsS -X POST "${BASE_URL}/v1/memory/sandbox/sessions" \
  -H 'content-type: application/json' \
  -d '{"actor":"lite-smoke"}' \
  > "${TMP_DIR}/sandbox-session.json"

SANDBOX_SESSION_ID="$(node - <<'JS' "${TMP_DIR}/sandbox-session.json"
const fs = require("fs");
const created = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const sessionId = created?.session?.session_id;
if (!sessionId) {
  console.error(JSON.stringify(created, null, 2));
  process.exit(1);
}
process.stdout.write(String(sessionId));
JS
)"

curl -fsS -X POST "${BASE_URL}/v1/memory/sandbox/execute" \
  -H 'content-type: application/json' \
  -d "{\"session_id\":\"${SANDBOX_SESSION_ID}\",\"actor\":\"lite-smoke\",\"mode\":\"sync\",\"action\":{\"kind\":\"command\",\"argv\":[\"echo\",\"lite-sandbox-smoke\"]}}" \
  > "${TMP_DIR}/sandbox-execute.json"

SANDBOX_RUN_ID="$(node - <<'JS' "${TMP_DIR}/sandbox-execute.json"
const fs = require("fs");
const run = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (run?.run?.status !== "succeeded" || run?.run?.result?.executor !== "mock") {
  console.error(JSON.stringify(run, null, 2));
  process.exit(1);
}
process.stdout.write(String(run.run.run_id));
JS
)"

curl -fsS -X POST "${BASE_URL}/v1/memory/sandbox/runs/logs" \
  -H 'content-type: application/json' \
  -d "{\"run_id\":\"${SANDBOX_RUN_ID}\"}" \
  > "${TMP_DIR}/sandbox-logs.json"

node - <<'JS' "${TMP_DIR}/sandbox-execute.json" "${TMP_DIR}/sandbox-logs.json"
const fs = require("fs");
const executed = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const logs = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
if (!String(executed?.run?.output?.stdout ?? "").includes("mock executor: echo lite-sandbox-smoke")) {
  console.error(JSON.stringify(executed, null, 2));
  process.exit(1);
}
if (!String(logs?.logs?.stdout ?? "").includes("mock executor: echo lite-sandbox-smoke")) {
  console.error(JSON.stringify(logs, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  sandbox_kernel_ok: true,
  session_id: executed.run.session_id,
  run_id: executed.run.run_id,
  status: executed.run.status,
}, null, 2));
JS

curl -fsS -X POST "${BASE_URL}/v1/automations/create" \
  -H 'content-type: application/json' \
  -d '{"automation_id":"approval_only","name":"Approval Only","status":"active","graph":{"nodes":[{"node_id":"gate_b","kind":"approval","approval_key":"local_gate","inputs":{}}],"edges":[]}}' \
  > "${TMP_DIR}/automation-create.json"

curl -fsS -X POST "${BASE_URL}/v1/automations/run" \
  -H 'content-type: application/json' \
  -d '{"automation_id":"approval_only","actor":"lite-smoke","options":{"execution_mode":"default"}}' \
  > "${TMP_DIR}/automation-run.json"

RUN_ID="$(node - <<'JS' "${TMP_DIR}/automation-run.json"
const fs = require("fs");
const run = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (run.lifecycle_state !== "paused" || run.pause_reason !== "approval_required") {
  console.error(JSON.stringify(run, null, 2));
  process.exit(1);
}
process.stdout.write(String(run.run_id));
JS
)"

curl -fsS -X POST "${BASE_URL}/v1/automations/runs/resume" \
  -H 'content-type: application/json' \
  -d "{\"run_id\":\"${RUN_ID}\",\"actor\":\"lite-smoke\",\"reason\":\"approved locally\"}" \
  > "${TMP_DIR}/automation-resume.json"

node - <<'JS' "${TMP_DIR}/automation-create.json" "${TMP_DIR}/automation-resume.json"
const fs = require("fs");
const created = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const resumed = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
if (created?.runtime?.edition !== "lite" || created?.runtime?.automation_kernel !== "local_playbook_v1") {
  console.error("automation create did not report the expected runtime contract");
  process.exit(1);
}
if (resumed.terminal_outcome !== "succeeded") {
  console.error(JSON.stringify(resumed, null, 2));
  process.exit(1);
}
const approvalNode = Array.isArray(resumed.nodes)
  ? resumed.nodes.find((node) => node.node_id === "gate_b")
  : null;
if (!approvalNode || approvalNode.terminal_outcome !== "succeeded") {
  console.error(JSON.stringify(resumed, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  automation_kernel_ok: true,
  automation_id: created.automation?.automation_id ?? null,
  resumed_run_id: resumed.run_id,
  resumed_status: resumed.terminal_outcome,
}, null, 2));
JS

node - <<'JS' "${BASE_URL}"
const base = process.argv[2];
const playbookId = "00000000-0000-0000-0000-000000000781";

async function post(path, body) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    console.error(`${path} ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  return json;
}

const runStart = await post("/v1/memory/replay/run/start", {
  goal: "lite replay smoke",
});
const stepBefore = await post("/v1/memory/replay/step/before", {
  run_id: runStart.run_id,
  step_index: 1,
  tool_name: "echo",
  tool_input: { text: "hello" },
  preconditions: [],
  safety_level: "auto_ok",
});
await post("/v1/memory/replay/step/after", {
  run_id: runStart.run_id,
  step_id: stepBefore.step_id,
  step_index: 1,
  status: "success",
  postconditions: [],
  artifact_refs: [],
  repair_applied: false,
});
await post("/v1/memory/replay/run/end", {
  run_id: runStart.run_id,
  status: "success",
  summary: "done",
  success_criteria: {},
  metrics: {},
});
const compile = await post("/v1/memory/replay/playbooks/compile_from_run", {
  run_id: runStart.run_id,
  playbook_id: playbookId,
  matchers: {},
  risk_profile: "medium",
  metadata: {},
});
const playbookGet = await post("/v1/memory/replay/playbooks/get", {
  playbook_id: playbookId,
});
const promote = await post("/v1/memory/replay/playbooks/promote", {
  playbook_id: playbookId,
  target_status: "shadow",
  note: "lite promote smoke",
});
await post("/v1/automations/create", {
  automation_id: "playbook_flow",
  name: "Playbook Flow",
  status: "active",
  graph: {
    nodes: [
      {
        node_id: "step_a",
        kind: "playbook",
        playbook_id: playbookId,
        version: promote.to_version,
        inputs: {},
      },
    ],
    edges: [],
  },
});
const automationRun = await post("/v1/automations/run", {
  automation_id: "playbook_flow",
  options: { execution_mode: "default" },
});
if (compile.version !== 1 || playbookGet.playbook?.version !== 1 || promote.to_version !== 2) {
  console.error(JSON.stringify({ compile, playbookGet, promote }, null, 2));
  process.exit(1);
}
if (automationRun.lifecycle_state !== "terminal" || automationRun.terminal_outcome !== "succeeded") {
  console.error(JSON.stringify(automationRun, null, 2));
  process.exit(1);
}
const playbookNode = Array.isArray(automationRun.nodes) ? automationRun.nodes[0] : null;
if (!playbookNode || playbookNode.terminal_outcome !== "succeeded" || !playbookNode.playbook_run_id) {
  console.error(JSON.stringify(automationRun, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  playbook_kernel_ok: true,
  playbook_id: playbookId,
  playbook_version: promote.to_version,
  replay_run_id: playbookNode.playbook_run_id,
}, null, 2));
JS
