#!/usr/bin/env bash
set -euo pipefail

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need gh
need jq
need npm

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

REPO="${REPO:-${GITHUB_REPOSITORY:-Cognary/Aionis}}"
WORKFLOW_NAME="${WORKFLOW_NAME:-Perf Lite vs Strict Compare}"
WINDOW_DAYS="${WINDOW_DAYS:-7}"
RUN_LIMIT="${RUN_LIMIT:-80}"
ARTIFACT_NAME="${ARTIFACT_NAME:-perf-lite-vs-strict-artifacts}"
TREND_OUT_DIR="${TREND_OUT_DIR:-${ROOT_DIR}/artifacts/perf/lite_vs_strict_trend}"

mkdir -p "${TREND_OUT_DIR}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

echo "[trend] repo=${REPO} workflow=${WORKFLOW_NAME} window_days=${WINDOW_DAYS} run_limit=${RUN_LIMIT}"

runs_json="${tmp_dir}/runs.json"
gh run list -R "${REPO}" --workflow "${WORKFLOW_NAME}" --limit "${RUN_LIMIT}" --json databaseId,status,createdAt,conclusion > "${runs_json}"

mapfile -t run_ids < <(
  jq -r --argjson days "${WINDOW_DAYS}" '
    .[]
    | select(.status == "completed")
    | select((now - (.createdAt | fromdateiso8601)) <= ($days * 86400))
    | .databaseId
  ' "${runs_json}"
)

if [[ "${#run_ids[@]}" -eq 0 ]]; then
  echo "[trend] no workflow runs in last ${WINDOW_DAYS} days"
  exit 2
fi

copied=0
for run_id in "${run_ids[@]}"; do
  run_dir="${tmp_dir}/run_${run_id}"
  mkdir -p "${run_dir}"
  if ! gh run download "${run_id}" -R "${REPO}" -n "${ARTIFACT_NAME}" -D "${run_dir}" >/dev/null 2>&1; then
    echo "[trend] skip run=${run_id}: artifact download failed"
    continue
  fi
  compare_json="$(find "${run_dir}" -type f -name 'LITE_VS_STRICT_COMPARE.json' | head -n 1 || true)"
  if [[ -z "${compare_json}" || ! -f "${compare_json}" ]]; then
    echo "[trend] skip run=${run_id}: compare json missing"
    continue
  fi
  cp "${compare_json}" "${TREND_OUT_DIR}/LITE_VS_STRICT_COMPARE_run${run_id}.json"
  copied=$((copied + 1))
done

if [[ "${copied}" -eq 0 ]]; then
  echo "[trend] no compare artifacts copied"
  exit 3
fi

trend_md="${TREND_OUT_DIR}/LITE_VS_STRICT_TREND_${WINDOW_DAYS}D.md"
trend_json="${TREND_OUT_DIR}/LITE_VS_STRICT_TREND_${WINDOW_DAYS}D.json"
npm run -s job:perf-profile-trend -- \
  --dir "${TREND_OUT_DIR}" \
  --window-days "${WINDOW_DAYS}" \
  --output "${trend_md}" \
  --output-json "${trend_json}"

echo "[trend] copied=${copied}"
echo "[trend] trend_md=${trend_md}"
echo "[trend] trend_json=${trend_json}"

