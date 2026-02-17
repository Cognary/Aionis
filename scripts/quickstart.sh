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
bash "$ROOT_DIR/examples/killer_demo.sh" --wait-seconds 45 --run-worker-once auto

echo
echo "Quickstart complete."
echo "- API: http://localhost:${PORT}"
echo "- Stop stack: make stack-down"
