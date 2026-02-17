#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env. Create it from .env.example first." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/.env"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in .env" >&2
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  exec psql "$DATABASE_URL"
fi

if command -v docker >/dev/null 2>&1; then
  exec docker compose exec db psql -U aionis -d aionis_memory
fi

echo "psql not found and docker not available." >&2
exit 1
