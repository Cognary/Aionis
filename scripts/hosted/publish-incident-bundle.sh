#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

SOURCE_DIR=""
TARGET=""
RUN_ID=""

usage() {
  cat <<'USAGE'
Usage: scripts/hosted/publish-incident-bundle.sh --source-dir <dir> --target <uri> --run-id <id>

Target formats:
  s3://<bucket>/<prefix>                    AWS S3
  gs://<bucket>/<prefix>                    Google Cloud Storage
  az://<account>/<container>/<prefix>       Azure Blob (account mode)
  az://<container>/<prefix>                 Azure Blob (connection-string mode)
  file:///path/to/base                       Local filesystem
  /path/to/base                              Local filesystem

Azure auth:
  - account mode: az login (or auth-mode) + --account-name from target
  - connection-string mode: AZURE_STORAGE_CONNECTION_STRING must be set
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-dir) SOURCE_DIR="${2:-}"; shift 2 ;;
    --target) TARGET="${2:-}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "${SOURCE_DIR}" || -z "${TARGET}" || -z "${RUN_ID}" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "source dir does not exist: ${SOURCE_DIR}" >&2
  exit 1
fi

published_uri=""
adapter=""

publish_s3() {
  local target="$1"
  need aws
  local uri="${target%/}/${RUN_ID}"
  aws s3 cp "${SOURCE_DIR}/" "${uri}/" --recursive
  published_uri="${uri}"
  adapter="s3"
}

publish_gcs() {
  local target="$1"
  local uri="${target%/}/${RUN_ID}"
  if command -v gsutil >/dev/null 2>&1; then
    gsutil -m cp -r "${SOURCE_DIR}/"* "${uri}/"
  elif command -v gcloud >/dev/null 2>&1; then
    gcloud storage cp -r "${SOURCE_DIR}/"* "${uri}/"
  else
    echo "missing command: gsutil or gcloud" >&2
    exit 1
  fi
  published_uri="${uri}"
  adapter="gcs"
}

publish_azure() {
  local target="$1"
  need az
  local stripped="${target#az://}"
  local account=""
  local container=""
  local prefix=""

  IFS='/' read -r p1 p2 rest <<< "${stripped}"
  if [[ -z "${p1}" ]]; then
    echo "invalid azure target: ${target}" >&2
    exit 1
  fi

  if [[ -n "${p2:-}" && -n "${AZURE_STORAGE_CONNECTION_STRING:-}" ]]; then
    # az://<container>/<prefix> with connection string
    container="${p1}"
    prefix="${p2}"
    if [[ -n "${rest:-}" ]]; then
      prefix="${prefix}/${rest}"
    fi
    prefix="${prefix#/}"
    prefix="${prefix%/}"
    local dest_path="${prefix:+${prefix}/}${RUN_ID}"
    az storage blob upload-batch \
      --connection-string "${AZURE_STORAGE_CONNECTION_STRING}" \
      --source "${SOURCE_DIR}" \
      --destination "${container}" \
      --destination-path "${dest_path}" \
      --overwrite true
    published_uri="az://${container}/${dest_path}"
    adapter="azure_connection_string"
    return 0
  fi

  # az://<account>/<container>/<prefix> with account auth
  account="${p1}"
  container="${p2:-}"
  prefix="${rest:-}"
  if [[ -z "${account}" || -z "${container}" ]]; then
    echo "invalid azure account target: ${target} (expected az://<account>/<container>/<prefix>)" >&2
    exit 1
  fi
  prefix="${prefix#/}"
  prefix="${prefix%/}"
  local dest_path="${prefix:+${prefix}/}${RUN_ID}"
  az storage blob upload-batch \
    --account-name "${account}" \
    --source "${SOURCE_DIR}" \
    --destination "${container}" \
    --destination-path "${dest_path}" \
    --overwrite true \
    --auth-mode login
  published_uri="az://${account}/${container}/${dest_path}"
  adapter="azure_account"
}

publish_local() {
  local target="$1"
  local local_target="${target}"
  if [[ "${target}" == file://* ]]; then
    local_target="${target#file://}"
  fi
  local dest="${local_target%/}/${RUN_ID}"
  mkdir -p "${dest}"
  cp -R "${SOURCE_DIR}/." "${dest}/"
  published_uri="${dest}"
  adapter="local"
}

case "${TARGET}" in
  s3://*) publish_s3 "${TARGET}" ;;
  gs://*) publish_gcs "${TARGET}" ;;
  az://*) publish_azure "${TARGET}" ;;
  file://*) publish_local "${TARGET}" ;;
  *) publish_local "${TARGET}" ;;
esac

jq -n \
  --arg ok "true" \
  --arg adapter "${adapter}" \
  --arg target "${TARGET}" \
  --arg run_id "${RUN_ID}" \
  --arg published_uri "${published_uri}" \
  '{
    ok: ($ok == "true"),
    adapter: $adapter,
    target: $target,
    run_id: $run_id,
    published_uri: $published_uri
  }'
