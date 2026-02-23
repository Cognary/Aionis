#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEST_DIR="${HOME}/Library/LaunchAgents"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need launchctl
need sed

escape_sed_replacement() {
  # Escape \, /, and & for sed replacement context.
  printf '%s' "$1" | sed -e 's/[\\/&]/\\&/g'
}

ROOT_ESCAPED="$(escape_sed_replacement "${ROOT_DIR}")"

mkdir -p "${DEST_DIR}"

install_plist() {
  local src="$1"
  local dst="$2"
  sed "s/__AIONIS_ROOT__/${ROOT_ESCAPED}/g" "${src}" > "${dst}"
}

install_plist "${SCRIPT_DIR}/com.aionis.memory.api.plist" "${DEST_DIR}/com.aionis.memory.api.plist"
install_plist "${SCRIPT_DIR}/com.aionis.memory.outbox-worker.plist" "${DEST_DIR}/com.aionis.memory.outbox-worker.plist"

launchctl unload "${DEST_DIR}/com.aionis.memory.api.plist" 2>/dev/null || true
launchctl unload "${DEST_DIR}/com.aionis.memory.outbox-worker.plist" 2>/dev/null || true

launchctl load "${DEST_DIR}/com.aionis.memory.api.plist"
launchctl load "${DEST_DIR}/com.aionis.memory.outbox-worker.plist"

echo "launchd: installed"
echo "  root: ${ROOT_DIR}"
echo "  agents: ${DEST_DIR}/com.aionis.memory.{api,outbox-worker}.plist"
