#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${PORT:-3001}"
PG_PORT="${PGPORT:-5432}"
PG_HOST_LOCAL="127.0.0.1"

POSTGRES_USER="${POSTGRES_USER:-aionis}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-aionis}"
POSTGRES_DB="${POSTGRES_DB:-aionis_memory}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

if [[ ! "${POSTGRES_USER}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "invalid POSTGRES_USER: ${POSTGRES_USER}" >&2
  exit 1
fi

if [[ ! "${POSTGRES_DB}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo "invalid POSTGRES_DB: ${POSTGRES_DB}" >&2
  exit 1
fi

mkdir -p "${PGDATA}"
chown -R postgres:postgres "${PGDATA}"

if [[ ! -s "${PGDATA}/PG_VERSION" ]]; then
  echo "[standalone] initializing postgres data dir..."
  gosu postgres initdb -D "${PGDATA}" >/dev/null
fi

echo "[standalone] starting temporary postgres for bootstrap..."
gosu postgres pg_ctl -D "${PGDATA}" -o "-c listen_addresses='${PG_HOST_LOCAL}' -p ${PG_PORT}" -w start >/dev/null

role_exists="$(gosu postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}' LIMIT 1;")"
if [[ "${role_exists}" != "1" ]]; then
  echo "[standalone] creating role ${POSTGRES_USER}"
  gosu postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ${POSTGRES_USER} LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD}';" >/dev/null
else
  gosu postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE ${POSTGRES_USER} WITH LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD}';" >/dev/null
fi

db_exists="$(gosu postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}' LIMIT 1;")"
if [[ "${db_exists}" != "1" ]]; then
  echo "[standalone] creating database ${POSTGRES_DB}"
  gosu postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"
fi

gosu postgres pg_ctl -D "${PGDATA}" -m fast -w stop >/dev/null

echo "[standalone] starting postgres..."
gosu postgres postgres -D "${PGDATA}" -c "listen_addresses=*" -p "${PG_PORT}" >/tmp/aionis-standalone-postgres.log 2>&1 &
PG_PID=$!

echo "[standalone] waiting for postgres readiness..."
for _ in {1..60}; do
  if pg_isready -h "${PG_HOST_LOCAL}" -p "${PG_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

export PGHOST="${PG_HOST_LOCAL}"
export PGPORT="${PG_PORT}"
export PGUSER="${POSTGRES_USER}"
export PGPASSWORD="${POSTGRES_PASSWORD}"
export PGDATABASE="${POSTGRES_DB}"

echo "[standalone] running migrations..."
/docker-migrate.sh

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PG_HOST_LOCAL}:${PG_PORT}/${POSTGRES_DB}"
fi

export PORT="${APP_PORT}"
export APP_ENV="${APP_ENV:-dev}"
export MEMORY_AUTH_MODE="${MEMORY_AUTH_MODE:-off}"
export EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER:-fake}"
export MEMORY_SCOPE="${MEMORY_SCOPE:-default}"
export MEMORY_TENANT_ID="${MEMORY_TENANT_ID:-default}"
export RATE_LIMIT_BYPASS_LOOPBACK="${RATE_LIMIT_BYPASS_LOOPBACK:-false}"

echo "[standalone] starting outbox worker..."
node /app/dist/jobs/outbox-worker.js >/tmp/aionis-standalone-worker.log 2>&1 &
WORKER_PID=$!

cleanup() {
  set +e
  kill "${WORKER_PID}" >/dev/null 2>&1 || true
  kill "${PG_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[standalone] starting api on :${PORT}"
node /app/dist/index.js
