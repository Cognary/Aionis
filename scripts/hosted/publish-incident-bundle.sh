#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

SOURCE_DIR=""
TARGET=""
RUN_ID=""

published_uri=""
adapter=""
attestation='{}'

AZ_MODE=""
AZ_ACCOUNT=""
AZ_CONTAINER=""
AZ_DEST_PATH=""

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

list_rel_files() {
  (
    cd "${SOURCE_DIR}"
    find . -type f -print | sed 's#^\./##' | LC_ALL=C sort
  )
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
  else
    shasum -a 256 "${file}" | awk '{print $1}'
  fi
}

file_size_bytes() {
  local file="$1"
  if stat -f%z "${file}" >/dev/null 2>&1; then
    stat -f%z "${file}"
  else
    stat -c%s "${file}"
  fi
}

parse_bucket_prefix() {
  local uri="$1"
  local scheme="$2"
  local stripped="${uri#${scheme}://}"
  local bucket="${stripped%%/*}"
  local rest=""
  if [[ "${stripped}" != "${bucket}" ]]; then
    rest="${stripped#*/}"
  fi
  rest="${rest#/}"
  rest="${rest%/}"
  echo "${bucket}|${rest}"
}

publish_s3() {
  local target="$1"
  need aws
  local uri="${target%/}/${RUN_ID}"
  aws s3 cp "${SOURCE_DIR}/" "${uri}/" --recursive
  published_uri="${uri}"
  adapter="s3"
}

collect_s3_attestation() {
  local target="$1"
  local parsed
  parsed="$(parse_bucket_prefix "${target}" "s3")"
  local bucket="${parsed%%|*}"
  local base_prefix="${parsed#*|}"
  local run_prefix="${base_prefix:+${base_prefix}/}${RUN_ID}"
  local objects='[]'
  local warnings='[]'
  local count=0

  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    count=$((count + 1))
    local key="${run_prefix}/${rel}"
    set +e
    local head
    head="$(aws s3api head-object --bucket "${bucket}" --key "${key}" --output json 2>&1)"
    local ec=$?
    set -e
    if [[ "${ec}" -ne 0 ]]; then
      warnings="$(echo "${warnings}" | jq --arg key "${key}" --arg error "${head}" '. + [{key:$key,error:($error|.[0:300])}]')"
      continue
    fi
    local etag
    etag="$(echo "${head}" | jq -r '.ETag // ""')"
    local version_id
    version_id="$(echo "${head}" | jq -r '.VersionId // ""')"
    local size
    size="$(echo "${head}" | jq -r '.ContentLength // 0')"
    local last_modified
    last_modified="$(echo "${head}" | jq -r '.LastModified // ""')"
    objects="$(echo "${objects}" | jq \
      --arg key "${key}" \
      --arg etag "${etag}" \
      --arg version_id "${version_id}" \
      --argjson size "${size}" \
      --arg last_modified "${last_modified}" \
      '. + [{key:$key, etag:$etag, version_id:$version_id, size:$size, last_modified:$last_modified}]' )"
  done < <(list_rel_files)

  attestation="$(jq -n \
    --arg provider "s3" \
    --arg bucket "${bucket}" \
    --arg run_prefix "${run_prefix}" \
    --argjson object_count "${count}" \
    --argjson objects "${objects}" \
    --argjson warnings "${warnings}" \
    '{
      provider: $provider,
      bucket: $bucket,
      run_prefix: $run_prefix,
      object_count: $object_count,
      objects_sample: ($objects[0:500]),
      warnings: $warnings
    }')"
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

collect_gcs_attestation() {
  local target="$1"
  local parsed
  parsed="$(parse_bucket_prefix "${target}" "gs")"
  local bucket="${parsed%%|*}"
  local base_prefix="${parsed#*|}"
  local run_prefix="${base_prefix:+${base_prefix}/}${RUN_ID}"
  local objects='[]'
  local warnings='[]'
  local count=0
  local tool=""
  if command -v gsutil >/dev/null 2>&1; then
    tool="gsutil"
  elif command -v gcloud >/dev/null 2>&1; then
    tool="gcloud"
  fi

  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    count=$((count + 1))
    local key="${run_prefix}/${rel}"
    if [[ "${tool}" == "gsutil" ]]; then
      set +e
      local stat_out
      stat_out="$(gsutil stat "gs://${bucket}/${key}" 2>&1)"
      local ec=$?
      set -e
      if [[ "${ec}" -ne 0 ]]; then
        warnings="$(echo "${warnings}" | jq --arg key "${key}" --arg error "${stat_out}" '. + [{key:$key,error:($error|.[0:300])}]')"
        continue
      fi
      local generation
      generation="$(echo "${stat_out}" | awk -F': *' '/^Generation:/{print $2; exit}')"
      local metageneration
      metageneration="$(echo "${stat_out}" | awk -F': *' '/^Metageneration:/{print $2; exit}')"
      local etag
      etag="$(echo "${stat_out}" | awk -F': *' '/^ETag:/{print $2; exit}')"
      local content_length
      content_length="$(echo "${stat_out}" | awk -F': *' '/^Content-Length:/{print $2; exit}')"
      local update_time
      update_time="$(echo "${stat_out}" | awk -F': *' '/^Update time:/{print $2; exit}')"
      objects="$(echo "${objects}" | jq \
        --arg key "${key}" \
        --arg generation "${generation}" \
        --arg metageneration "${metageneration}" \
        --arg etag "${etag}" \
        --arg content_length "${content_length}" \
        --arg update_time "${update_time}" \
        '. + [{key:$key, generation:$generation, metageneration:$metageneration, etag:$etag, content_length:$content_length, update_time:$update_time}]')"
    else
      set +e
      local desc
      desc="$(gcloud storage objects describe "gs://${bucket}/${key}" --format=json 2>&1)"
      local ec=$?
      set -e
      if [[ "${ec}" -ne 0 ]]; then
        warnings="$(echo "${warnings}" | jq --arg key "${key}" --arg error "${desc}" '. + [{key:$key,error:($error|.[0:300])}]')"
        continue
      fi
      local generation
      generation="$(echo "${desc}" | jq -r '.generation // ""')"
      local metageneration
      metageneration="$(echo "${desc}" | jq -r '.metageneration // ""')"
      local etag
      etag="$(echo "${desc}" | jq -r '.etag // ""')"
      local size
      size="$(echo "${desc}" | jq -r '.size // ""')"
      local update_time
      update_time="$(echo "${desc}" | jq -r '.updateTime // ""')"
      objects="$(echo "${objects}" | jq \
        --arg key "${key}" \
        --arg generation "${generation}" \
        --arg metageneration "${metageneration}" \
        --arg etag "${etag}" \
        --arg size "${size}" \
        --arg update_time "${update_time}" \
        '. + [{key:$key, generation:$generation, metageneration:$metageneration, etag:$etag, size:$size, update_time:$update_time}]')"
    fi
  done < <(list_rel_files)

  attestation="$(jq -n \
    --arg provider "gcs" \
    --arg tool "${tool}" \
    --arg bucket "${bucket}" \
    --arg run_prefix "${run_prefix}" \
    --argjson object_count "${count}" \
    --argjson objects "${objects}" \
    --argjson warnings "${warnings}" \
    '{
      provider: $provider,
      tool: $tool,
      bucket: $bucket,
      run_prefix: $run_prefix,
      object_count: $object_count,
      objects_sample: ($objects[0:500]),
      warnings: $warnings
    }')"
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
    AZ_MODE="connection_string"
    AZ_CONTAINER="${container}"
    AZ_DEST_PATH="${dest_path}"
    return 0
  fi

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
  AZ_MODE="account"
  AZ_ACCOUNT="${account}"
  AZ_CONTAINER="${container}"
  AZ_DEST_PATH="${dest_path}"
}

collect_azure_attestation() {
  local objects='[]'
  local warnings='[]'
  local count=0

  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    count=$((count + 1))
    local blob="${AZ_DEST_PATH}/${rel}"
    local show_out=""
    local ec=0
    set +e
    if [[ "${AZ_MODE}" == "connection_string" ]]; then
      show_out="$(az storage blob show \
        --connection-string "${AZURE_STORAGE_CONNECTION_STRING}" \
        --container-name "${AZ_CONTAINER}" \
        --name "${blob}" \
        --output json 2>&1)"
      ec=$?
    else
      show_out="$(az storage blob show \
        --account-name "${AZ_ACCOUNT}" \
        --container-name "${AZ_CONTAINER}" \
        --name "${blob}" \
        --auth-mode login \
        --output json 2>&1)"
      ec=$?
    fi
    set -e
    if [[ "${ec}" -ne 0 ]]; then
      warnings="$(echo "${warnings}" | jq --arg blob "${blob}" --arg error "${show_out}" '. + [{blob:$blob,error:($error|.[0:300])}]')"
      continue
    fi
    local etag
    etag="$(echo "${show_out}" | jq -r '.properties.etag // .etag // ""')"
    local version_id
    version_id="$(echo "${show_out}" | jq -r '.versionId // .version_id // ""')"
    local last_modified
    last_modified="$(echo "${show_out}" | jq -r '.properties.lastModified // .properties.last_modified // ""')"
    local content_length
    content_length="$(echo "${show_out}" | jq -r '.properties.contentLength // .properties.content_length // ""')"
    objects="$(echo "${objects}" | jq \
      --arg blob "${blob}" \
      --arg etag "${etag}" \
      --arg version_id "${version_id}" \
      --arg last_modified "${last_modified}" \
      --arg content_length "${content_length}" \
      '. + [{blob:$blob, etag:$etag, version_id:$version_id, last_modified:$last_modified, content_length:$content_length}]')"
  done < <(list_rel_files)

  attestation="$(jq -n \
    --arg provider "azure_blob" \
    --arg mode "${AZ_MODE}" \
    --arg account "${AZ_ACCOUNT}" \
    --arg container "${AZ_CONTAINER}" \
    --arg dest_path "${AZ_DEST_PATH}" \
    --argjson object_count "${count}" \
    --argjson objects "${objects}" \
    --argjson warnings "${warnings}" \
    '{
      provider: $provider,
      mode: $mode,
      account: $account,
      container: $container,
      dest_path: $dest_path,
      object_count: $object_count,
      objects_sample: ($objects[0:500]),
      warnings: $warnings
    }')"
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

collect_local_attestation() {
  local files='[]'
  local count=0
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    count=$((count + 1))
    local src="${SOURCE_DIR}/${rel}"
    local digest
    digest="$(sha256_file "${src}")"
    local size
    size="$(file_size_bytes "${src}")"
    files="$(echo "${files}" | jq --arg path "${rel}" --arg sha256 "${digest}" --argjson size_bytes "${size}" '. + [{path:$path, sha256:$sha256, size_bytes:$size_bytes}]')"
  done < <(list_rel_files)
  attestation="$(jq -n \
    --arg provider "local_fs" \
    --arg published_uri "${published_uri}" \
    --argjson object_count "${count}" \
    --argjson files "${files}" \
    '{
      provider: $provider,
      published_uri: $published_uri,
      object_count: $object_count,
      files_sample: ($files[0:500])
    }')"
}

case "${TARGET}" in
  s3://*)
    publish_s3 "${TARGET}"
    collect_s3_attestation "${TARGET}"
    ;;
  gs://*)
    publish_gcs "${TARGET}"
    collect_gcs_attestation "${TARGET}"
    ;;
  az://*)
    publish_azure "${TARGET}"
    collect_azure_attestation
    ;;
  file://*)
    publish_local "${TARGET}"
    collect_local_attestation
    ;;
  *)
    publish_local "${TARGET}"
    collect_local_attestation
    ;;
esac

jq -n \
  --arg ok "true" \
  --arg adapter "${adapter}" \
  --arg target "${TARGET}" \
  --arg run_id "${RUN_ID}" \
  --arg published_uri "${published_uri}" \
  --argjson attestation "${attestation}" \
  '{
    ok: ($ok == "true"),
    adapter: $adapter,
    target: $target,
    run_id: $run_id,
    published_uri: $published_uri,
    attestation: $attestation
  }'
