#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${AIONIS_CODEX_BIN_DIR:-${HOME}/.local/bin}"
MAIN_NAME="${AIONIS_CODEX_LAUNCHER_NAME:-codex-aionis}"
DOCTOR_NAME="${AIONIS_CODEX_DOCTOR_NAME:-codex-aionis-doctor}"
CONTAINER_NAME="${AIONIS_STANDALONE_CONTAINER:-aionis-standalone}"
BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:3001}"
SCOPE="${AIONIS_SCOPE:-default}"
FORCE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bin-dir)
      BIN_DIR="$2"
      shift 2
      ;;
    --name)
      MAIN_NAME="$2"
      shift 2
      ;;
    --doctor-name)
      DOCTOR_NAME="$2"
      shift 2
      ;;
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
    --force)
      FORCE="$2"
      shift 2
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${BIN_DIR}"

install_wrapper() {
  local mode="$1"
  local output_path="$2"

  if [[ -e "${output_path}" || -L "${output_path}" ]]; then
    if [[ "${FORCE}" != "true" ]]; then
      echo "launcher already exists: ${output_path}" >&2
      echo "re-run with --force true to replace it." >&2
      exit 1
    fi
    rm -f "${output_path}"
  fi

  if [[ "${mode}" == "main" ]]; then
    cat > "${output_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export AIONIS_STANDALONE_CONTAINER="\${AIONIS_STANDALONE_CONTAINER:-${CONTAINER_NAME}}"
export AIONIS_BASE_URL="\${AIONIS_BASE_URL:-${BASE_URL}}"
export AIONIS_SCOPE="\${AIONIS_SCOPE:-${SCOPE}}"
exec bash "${ROOT_DIR}/scripts/aionis-codex-local.sh" "\$@"
EOF
  else
    cat > "${output_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export AIONIS_STANDALONE_CONTAINER="\${AIONIS_STANDALONE_CONTAINER:-${CONTAINER_NAME}}"
export AIONIS_BASE_URL="\${AIONIS_BASE_URL:-${BASE_URL}}"
export AIONIS_SCOPE="\${AIONIS_SCOPE:-${SCOPE}}"
exec bash "${ROOT_DIR}/scripts/aionis-codex-doctor.sh" "\$@"
EOF
  fi

  chmod +x "${output_path}"
}

install_wrapper "main" "${BIN_DIR}/${MAIN_NAME}"
install_wrapper "doctor" "${BIN_DIR}/${DOCTOR_NAME}"

cat <<EOF
{
  "ok": true,
  "installed": {
    "main": "${BIN_DIR}/${MAIN_NAME}",
    "doctor": "${BIN_DIR}/${DOCTOR_NAME}"
  },
  "targets": {
    "main": "${ROOT_DIR}/scripts/aionis-codex-local.sh",
    "doctor": "${ROOT_DIR}/scripts/aionis-codex-doctor.sh"
  },
  "defaults": {
    "container": "${CONTAINER_NAME}",
    "base_url": "${BASE_URL}",
    "scope": "${SCOPE}"
  }
}
EOF
