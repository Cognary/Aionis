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

exec bash "${ROOT_DIR}/scripts/run_agent_with_aionis.sh" "$@"
