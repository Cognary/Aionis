#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SOURCE}" ]]; do
  DIR="$(cd -P "$(dirname "${SOURCE}")" && pwd)"
  TARGET="$(readlink "${SOURCE}")"
  if [[ "${TARGET}" != /* ]]; then
    SOURCE="${DIR}/${TARGET}"
  else
    SOURCE="${TARGET}"
  fi
done
ROOT_DIR="$(cd -P "$(dirname "${SOURCE}")/.." && pwd)"
CONTAINER_NAME="${AIONIS_STANDALONE_CONTAINER:-aionis-standalone}"
BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:3001}"
SCOPE="${AIONIS_SCOPE:-default}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container)
      CONTAINER_NAME="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

need bash
need curl
need docker
need jq
need npm
need node

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not available" >&2
  exit 1
fi

if ! docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  echo "standalone container not found: ${CONTAINER_NAME}" >&2
  exit 1
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}")" != "true" ]]; then
  echo "standalone container is not running: ${CONTAINER_NAME}" >&2
  exit 1
fi

curl -fsS "${BASE_URL%/}/health" >/dev/null

AIONIS_STANDALONE_CONTAINER="${CONTAINER_NAME}" \
AIONIS_BASE_URL="${BASE_URL}" \
AIONIS_SCOPE="${SCOPE}" \
  bash "${ROOT_DIR}/examples/mcp_dev_standalone_smoke.sh" >/dev/null

RUN_ID="$(node -e "console.log(require('crypto').randomUUID())")"
TITLE="Codex doctor smoke"
GOAL="Verify the Aionis Codex Local Profile end-to-end."
QUERY="Run a short product integration smoke for the Aionis Codex Local Profile."

SESSION_START_RAW="$(
  AIONIS_BASE_URL="${BASE_URL}" \
  AIONIS_SCOPE="${SCOPE}" \
    npm run -s devloop:session -- start \
      --root "${ROOT_DIR}" \
      --run-id "${RUN_ID}" \
      --title "${TITLE}" \
      --goal "${GOAL}" \
      --query "${QUERY}"
)"

AIONIS_BASE_URL="${BASE_URL}" \
AIONIS_SCOPE="${SCOPE}" \
AIONIS_RUN_ID="${RUN_ID}" \
AIONIS_SESSION_ROOT="${ROOT_DIR}" \
  bash "${ROOT_DIR}/scripts/aionis-build" -- -- node -e "console.log('doctor-build-ok')" >/dev/null

SESSION_SHOW_RAW="$(
  AIONIS_BASE_URL="${BASE_URL}" \
  AIONIS_SCOPE="${SCOPE}" \
    npm run -s devloop:session -- show \
      --root "${ROOT_DIR}" \
      --run-id "${RUN_ID}"
)"

SESSION_END_RAW="$(
  AIONIS_BASE_URL="${BASE_URL}" \
  AIONIS_SCOPE="${SCOPE}" \
    npm run -s devloop:session -- end \
      --root "${ROOT_DIR}" \
      --run-id "${RUN_ID}" \
      --status success \
      --summary "Codex doctor smoke passed."
)"

SESSION_START_RAW_ENV="${SESSION_START_RAW}" \
SESSION_SHOW_RAW_ENV="${SESSION_SHOW_RAW}" \
SESSION_END_RAW_ENV="${SESSION_END_RAW}" \
CONTAINER_NAME_ENV="${CONTAINER_NAME}" \
BASE_URL_ENV="${BASE_URL}" \
SCOPE_ENV="${SCOPE}" \
RUN_ID_ENV="${RUN_ID}" \
python3 - <<'PY'
import json
import os
session_start = json.loads(os.environ["SESSION_START_RAW_ENV"])
session_show = json.loads(os.environ["SESSION_SHOW_RAW_ENV"])
session_end = json.loads(os.environ["SESSION_END_RAW_ENV"])
payload = {
  "ok": True,
  "profile": "aionis_codex_local",
  "container": os.environ["CONTAINER_NAME_ENV"],
  "base_url": os.environ["BASE_URL_ENV"],
  "scope": os.environ["SCOPE_ENV"],
  "checks": {
    "health": True,
    "standalone_launcher_smoke": True,
    "session_start": True,
    "command_step_recording": session_show.get("next_step_index") == 2,
    "session_end": session_end.get("session", {}).get("session_status") == "ended",
  },
  "artifacts": {
    "run_id": os.environ["RUN_ID_ENV"],
    "state_path": session_start.get("session", {}).get("state_path"),
  },
}
print(json.dumps(payload, indent=2))
PY
