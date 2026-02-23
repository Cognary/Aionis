#!/usr/bin/env bash
set -euo pipefail

DEST_DIR="${HOME}/Library/LaunchAgents"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need launchctl

launchctl unload "${DEST_DIR}/com.aionis.memory.api.plist" 2>/dev/null || true
launchctl unload "${DEST_DIR}/com.aionis.memory.outbox-worker.plist" 2>/dev/null || true

rm -f "${DEST_DIR}/com.aionis.memory.api.plist"
rm -f "${DEST_DIR}/com.aionis.memory.outbox-worker.plist"

echo "launchd: uninstalled"
