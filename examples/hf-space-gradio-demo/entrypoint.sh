#!/usr/bin/env bash
set -euo pipefail

AIONIS_INTERNAL_BASE_URL="${AIONIS_INTERNAL_BASE_URL:-http://127.0.0.1:3001}"

# Demo-friendly defaults; can be overridden via Space Variables.
export APP_ENV="${APP_ENV:-dev}"
export MEMORY_AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
export EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER:-fake}"
export MEMORY_SCOPE="${MEMORY_SCOPE:-demo}"
export MEMORY_TENANT_ID="${MEMORY_TENANT_ID:-default}"
export CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-*}"
export RATE_LIMIT_BYPASS_LOOPBACK="${RATE_LIMIT_BYPASS_LOOPBACK:-false}"
export PORT="${PORT:-3001}"

echo "[hf-space] starting Aionis standalone on :${PORT}..."
/docker-standalone-entrypoint.sh > /tmp/aionis-space.log 2>&1 &
AIONIS_PID=$!

cleanup() {
  set +e
  kill "${AIONIS_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[hf-space] waiting for Aionis health..."
for _ in $(seq 1 120); do
  if curl -fsS "${AIONIS_INTERNAL_BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${AIONIS_INTERNAL_BASE_URL}/health" >/dev/null 2>&1; then
  echo "[hf-space] Aionis failed to become healthy."
  echo "----- /tmp/aionis-space.log -----"
  tail -n 200 /tmp/aionis-space.log || true
  exit 1
fi

echo "[hf-space] Aionis healthy. starting Gradio on :${GRADIO_SERVER_PORT:-7860}..."
exec python3 /space/app.py
