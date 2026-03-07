#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE="${AIONIS_STANDALONE_IMAGE:-aionis-standalone:local}"
CONTAINER_NAME="${AIONIS_STANDALONE_CONTAINER:-aionis-standalone}"
VOLUME_NAME="${AIONIS_STANDALONE_VOLUME:-aionis-standalone-data}"
HOST_PORT="${AIONIS_STANDALONE_HOST_PORT:-3001}"
CONTAINER_PORT="${AIONIS_STANDALONE_CONTAINER_PORT:-3001}"
HOST_HEALTH_URL="${AIONIS_STANDALONE_HEALTH_URL:-http://127.0.0.1:${HOST_PORT}/health}"
BUILD_IF_MISSING="${AIONIS_STANDALONE_BUILD_IF_MISSING:-true}"
FORCE_REBUILD="${AIONIS_STANDALONE_FORCE_REBUILD:-false}"
WAIT_SECONDS="${AIONIS_STANDALONE_WAIT_SECONDS:-120}"
RUN_SMOKE="${AIONIS_STANDALONE_RUN_SMOKE:-true}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

need docker
need curl
need bash

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not available." >&2
  echo "start Docker Desktop or the Docker daemon, then retry." >&2
  exit 1
fi

have_image() {
  docker image inspect "${IMAGE}" >/dev/null 2>&1
}

container_exists() {
  docker inspect "${CONTAINER_NAME}" >/dev/null 2>&1
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)" == "true" ]]
}

build_image_if_needed() {
  if [[ "${FORCE_REBUILD}" == "true" ]]; then
    echo "[1/4] rebuilding standalone image ${IMAGE}"
    docker build -f Dockerfile.standalone -t "${IMAGE}" .
    return
  fi

  if have_image; then
    echo "[1/4] standalone image already present: ${IMAGE}"
    return
  fi

  if [[ "${BUILD_IF_MISSING}" != "true" ]]; then
    echo "standalone image missing: ${IMAGE}" >&2
    echo "set AIONIS_STANDALONE_BUILD_IF_MISSING=true or build it first." >&2
    exit 1
  fi

  echo "[1/4] building standalone image ${IMAGE}"
  docker build -f Dockerfile.standalone -t "${IMAGE}" .
}

ensure_container_running() {
  if container_running; then
    echo "[2/4] reusing running container ${CONTAINER_NAME}"
    return
  fi

  if container_exists; then
    echo "[2/4] starting existing container ${CONTAINER_NAME}"
    docker start "${CONTAINER_NAME}" >/dev/null
    return
  fi

  echo "[2/4] creating standalone container ${CONTAINER_NAME}"
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    -v "${VOLUME_NAME}:/var/lib/postgresql/data" \
    "${IMAGE}" >/dev/null
}

wait_for_health() {
  echo "[3/4] waiting for health at ${HOST_HEALTH_URL}"
  local ok=0
  local attempt=0
  while [[ "${attempt}" -lt "${WAIT_SECONDS}" ]]; do
    if curl -fsS "${HOST_HEALTH_URL}" >/dev/null 2>&1; then
      ok=1
      break
    fi
    attempt="$((attempt + 1))"
    sleep 1
  done

  if [[ "${ok}" != "1" ]]; then
    echo "standalone health check failed: ${HOST_HEALTH_URL}" >&2
    docker logs "${CONTAINER_NAME}" | tail -n 120 >&2 || true
    exit 1
  fi
}

run_launcher_smoke() {
  if [[ "${RUN_SMOKE}" != "true" ]]; then
    echo "[4/4] skip launcher smoke (AIONIS_STANDALONE_RUN_SMOKE=${RUN_SMOKE})"
    return
  fi

  echo "[4/4] running launcher smoke"
  AIONIS_STANDALONE_CONTAINER="${CONTAINER_NAME}" \
  AIONIS_BASE_URL="${HOST_HEALTH_URL%/health}" \
    bash "${ROOT_DIR}/examples/mcp_dev_standalone_smoke.sh"
}

build_image_if_needed
ensure_container_running
wait_for_health
run_launcher_smoke

cat <<EOF
ok: Aionis standalone + Dev MCP launcher path is ready
- image: ${IMAGE}
- container: ${CONTAINER_NAME}
- volume: ${VOLUME_NAME}
- health: ${HOST_HEALTH_URL}
- launcher: ${ROOT_DIR}/scripts/mcp-aionis-dev-standalone.sh
EOF
