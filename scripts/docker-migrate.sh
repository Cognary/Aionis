#!/bin/sh
set -eu

echo "Waiting for Postgres..."
until pg_isready -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" >/dev/null 2>&1; do
  sleep 1
done

echo "Ensuring schema_migrations..."
psql -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (id BIGSERIAL PRIMARY KEY, filename TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());"

for f in /migrations/*.sql; do
  fname="$(basename "$f")"
  sha="$(sha256sum "$f" | awk '{print $1}')"

  already="$(psql -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$fname' LIMIT 1;")"
  if [ "$already" = "1" ]; then
    continue
  fi

  echo "Applying $fname"
  psql -v ON_ERROR_STOP=1 -f "$f"
  psql -v ON_ERROR_STOP=1 -c \
    "INSERT INTO schema_migrations (filename, sha256) VALUES ('$fname', '$sha');"
done

echo "Migrations complete."

