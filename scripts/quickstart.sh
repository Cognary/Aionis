#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for quickstart." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for quickstart." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

PORT="${PORT:-3001}"
AUTO_PORT_ON_CONFLICT="${QUICKSTART_AUTO_PORT_ON_CONFLICT:-true}"

is_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z localhost "${port}" >/dev/null 2>&1
    return $?
  fi
  return 1
}

find_next_free_port() {
  local start_port="$1"
  local candidate=$((start_port + 1))
  local attempts=50
  while (( attempts > 0 )); do
    if ! is_port_in_use "${candidate}"; then
      echo "${candidate}"
      return 0
    fi
    candidate=$((candidate + 1))
    attempts=$((attempts - 1))
  done
  return 1
}

if is_port_in_use "${PORT}"; then
  if [[ "${AUTO_PORT_ON_CONFLICT}" == "true" ]]; then
    NEXT_PORT="$(find_next_free_port "${PORT}" || true)"
    if [[ -z "${NEXT_PORT}" ]]; then
      echo "Port ${PORT} is in use and no free fallback port was found." >&2
      echo "Set PORT manually, for example: PORT=3011 make quickstart" >&2
      exit 1
    fi
    echo "Port ${PORT} is in use. Switching quickstart to PORT=${NEXT_PORT} for this run."
    PORT="${NEXT_PORT}"
  else
    echo "Port ${PORT} is in use." >&2
    echo "Stop the process on ${PORT} or run with a different port, e.g. PORT=3011 make quickstart" >&2
    exit 1
  fi
fi

export PORT

echo "Starting stack (db + migrate + api + worker)..."
docker compose up -d

echo "Waiting for API health on localhost:${PORT} ..."
ok=0
for _ in {1..90}; do
  if curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done

if [[ "$ok" -ne 1 ]]; then
  echo "API did not become healthy on localhost:${PORT}." >&2
  exit 1
fi

echo "Running killer demo..."
DEMO_SCOPE="quickstart_$(date +%s)"
bash "$ROOT_DIR/examples/killer_demo.sh" \
  --port "$PORT" \
  --scope "$DEMO_SCOPE" \
  --wait-seconds 45 \
  --run-worker-once auto \
  --require-success

echo
echo "Quickstart complete."
echo "- API: http://localhost:${PORT}"
echo "- Demo scope: ${DEMO_SCOPE}"
echo "- Stop stack: make stack-down"
