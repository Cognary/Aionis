#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

LIMIT="${1:-10}"
MODE="${2:-dry-run}" # dry-run | apply

if [[ "$MODE" == "apply" ]]; then
  npm run -s job:consolidation-apply -- --apply --limit-apply "$LIMIT" \
  | jq '{ok,scope,kind,dry_run,commit_id,applied_pairs,planned_apply,safety,plans:(.plans|.[0:20]),applied:(.applied|.[0:20])}'
else
  npm run -s job:consolidation-apply -- --limit-apply "$LIMIT" \
  | jq '{ok,scope,kind,dry_run,planned_apply,safety,plans:(.plans|.[0:20])}'
fi

