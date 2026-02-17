#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

MODE="${1:-dry-run}" # dry-run | apply

if [[ "$MODE" == "apply" ]]; then
  npm run -s job:consolidation-redirect-edges -- --apply \
  | jq '{ok,scope,kind,dry_run,commit_id,scanned_aliases,touched_edges,redirected_edges,dropped_self_loops,deleted_alias_edges,upsert_edges,aliases}'
else
  npm run -s job:consolidation-redirect-edges \
  | jq '{ok,scope,kind,dry_run,scanned_aliases,touched_edges,redirected_edges,dropped_self_loops,deleted_alias_edges,upsert_edges,aliases}'
fi

