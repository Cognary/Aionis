#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

UP_TO="${MIGRATE_UP_TO:-}"
if [[ "${1:-}" == "--up-to" ]]; then
  UP_TO="${2:-}"
  shift 2 || true
fi

if [[ -n "$UP_TO" ]]; then
  echo "Migration mode: apply up to (inclusive): $UP_TO" >&2
fi

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

if ! command -v psql >/dev/null 2>&1; then
  if command -v docker >/dev/null 2>&1; then
    echo "psql not found; running migrations inside docker container..." >&2

    # Ensure schema_migrations exists in container DB.
    docker compose exec -T db psql -U aionis -d aionis_memory -v ON_ERROR_STOP=1 -c \
      "CREATE TABLE IF NOT EXISTS schema_migrations (id BIGSERIAL PRIMARY KEY, filename TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());"

    for f in "$ROOT_DIR"/migrations/*.sql; do
      fname="$(basename "$f")"
      sha="$(shasum -a 256 "$f" | awk '{print $1}')"

      already="$(docker compose exec -T db psql -U aionis -d aionis_memory -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$fname' LIMIT 1;")"
      if [[ "$already" == "1" ]]; then
        continue
      fi

      echo "  -> $fname" >&2
      docker compose exec -T db psql -U aionis -d aionis_memory -v ON_ERROR_STOP=1 -f "/migrations/$fname"
      docker compose exec -T db psql -U aionis -d aionis_memory -v ON_ERROR_STOP=1 -c \
        "INSERT INTO schema_migrations (filename, sha256) VALUES ('$fname', '$sha');"

      if [[ -n "$UP_TO" && "$fname" == "$UP_TO" ]]; then
        echo "Stopping at $UP_TO (inclusive)." >&2
        break
      fi
    done

    echo "Migrations complete (docker)." >&2
    exit 0
  fi

  echo "psql not found on PATH and docker not available." >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/.tmp"

echo "Applying migrations to: $DATABASE_URL"

# Ensure schema_migrations exists (migration 0001 also creates it; this is safe either way).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (id BIGSERIAL PRIMARY KEY, filename TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());"

for f in "$ROOT_DIR"/migrations/*.sql; do
  fname="$(basename "$f")"
  sha="$(shasum -a 256 "$f" | awk '{print $1}')"

  already="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$fname' LIMIT 1;")"
  if [[ "$already" == "1" ]]; then
    continue
  fi

  echo "  -> $fname"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO schema_migrations (filename, sha256) VALUES ('$fname', '$sha');"

  if [[ -n "$UP_TO" && "$fname" == "$UP_TO" ]]; then
    echo "Stopping at $UP_TO (inclusive)."
    break
  fi
done

echo "Migrations complete."
