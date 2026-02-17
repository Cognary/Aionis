#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need npm

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ITERATIONS="${ITERATIONS:-3}"
MIN_PASS_RATE="${MIN_PASS_RATE:-0.8}"
MIN_EXECUTED="${MIN_EXECUTED:-${ITERATIONS}}"
LOOKBACK_DAYS="${LOOKBACK_DAYS:-7}"
OWNER="${OWNER:-ci}"
PHASE="${PHASE:-Phase 1}"
GENERATE_REVIEW_PACK="${GENERATE_REVIEW_PACK:-true}"
GENERATE_FIX_PLAN="${GENERATE_FIX_PLAN:-true}"
GENERATE_FIX_EXPORT="${GENERATE_FIX_EXPORT:-true}"

RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/ci_gate/${RUN_ID}}"
REHEARSAL_OUT="${OUT_DIR}/phase1_rehearsal"
mkdir -p "${OUT_DIR}"

echo "[gtm-ci-gate] run_id=${RUN_ID}"
echo "[gtm-ci-gate] iterations=${ITERATIONS} min_pass_rate=${MIN_PASS_RATE} min_executed=${MIN_EXECUTED}"

ITERATIONS="${ITERATIONS}" \
RUN_ID="${RUN_ID}" \
OUT_DIR="${REHEARSAL_OUT}" \
REHEARSAL_FAIL_ON_THRESHOLD=false \
npm run -s gtm:phase1:rehearsal | tee "${OUT_DIR}/01_rehearsal.log"

REHEARSAL_SUMMARY="${REHEARSAL_OUT}/summary.json"
if [[ ! -f "${REHEARSAL_SUMMARY}" ]]; then
  echo "missing rehearsal summary: ${REHEARSAL_SUMMARY}" >&2
  exit 2
fi

set +e
SUMMARY_FILE="${REHEARSAL_SUMMARY}" \
MIN_EXECUTED="${MIN_EXECUTED}" \
MIN_PASS_RATE="${MIN_PASS_RATE}" \
npm run -s gtm:phase1:threshold-check > "${OUT_DIR}/02_threshold_check.json"
threshold_rc=$?
set -e

LOOKBACK_DAYS="${LOOKBACK_DAYS}" \
OWNER="${OWNER}" \
PHASE="${PHASE}" \
RUN_ID="${RUN_ID}" \
OUT_DIR="${OUT_DIR}/weekly" \
npm run -s gtm:phase1:weekly-report > "${OUT_DIR}/03_weekly_report.json"

REVIEW_PACK_JSON='null'
if [[ "${GENERATE_REVIEW_PACK}" == "true" ]]; then
  # Keep CI gate review deterministic: scope KPI/weekly metrics to this rehearsal run.
  REVIEW_GATE_SUMMARY_ROOT="${REHEARSAL_OUT}/runs"
  REVIEW_REHEARSAL_SUMMARY_ROOT="${REHEARSAL_OUT}/runs"
  REVIEW_REGRESSION_SUMMARY_ROOT="${ROOT_DIR}/artifacts/regression"
  LOOKBACK_DAYS="${LOOKBACK_DAYS}" \
  GATE_SUMMARY_ROOT="${REVIEW_GATE_SUMMARY_ROOT}" \
  REHEARSAL_SUMMARY_ROOT="${REVIEW_REHEARSAL_SUMMARY_ROOT}" \
  REGRESSION_SUMMARY_ROOT="${REVIEW_REGRESSION_SUMMARY_ROOT}" \
  OWNER="${OWNER}" \
  PHASE="${PHASE}" \
  RUN_ID="${RUN_ID}" \
  OUT_DIR="${OUT_DIR}/review" \
  npm run -s gtm:phase1:review-pack > "${OUT_DIR}/04_review_pack.log"
  REVIEW_PACK_JSON="$(jq -c '.' "${OUT_DIR}/review/summary.json" 2>/dev/null || echo 'null')"
fi

FIX_PLAN_JSON='null'
if [[ "${GENERATE_FIX_PLAN}" == "true" && "${GENERATE_REVIEW_PACK}" == "true" ]]; then
  REVIEW_SUMMARY_FILE="${OUT_DIR}/review/summary.json" \
  OWNER="${OWNER}" \
  RUN_ID="${RUN_ID}" \
  OUT_DIR="${OUT_DIR}/fix_plan" \
  npm run -s gtm:phase1:fix-plan > "${OUT_DIR}/05_fix_plan.log"
  FIX_PLAN_JSON="$(jq -c '.' "${OUT_DIR}/fix_plan/summary.json" 2>/dev/null || echo 'null')"
fi

FIX_EXPORT_JSON='null'
if [[ "${GENERATE_FIX_EXPORT}" == "true" && "${GENERATE_FIX_PLAN}" == "true" && "${GENERATE_REVIEW_PACK}" == "true" ]]; then
  TASKS_JSON_FILE="${OUT_DIR}/fix_plan/tasks.json" \
  RUN_ID="${RUN_ID}" \
  OUT_DIR="${OUT_DIR}/fix_export" \
  npm run -s gtm:phase1:fix-export > "${OUT_DIR}/06_fix_export.log"
  FIX_EXPORT_JSON="$(jq -c '.' "${OUT_DIR}/fix_export/summary.json" 2>/dev/null || echo 'null')"
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg rehearsal_summary "${REHEARSAL_SUMMARY}" \
  --argjson generate_review_pack "$([[ "${GENERATE_REVIEW_PACK}" == "true" ]] && echo true || echo false)" \
  --argjson generate_fix_plan "$([[ "${GENERATE_FIX_PLAN}" == "true" ]] && echo true || echo false)" \
  --argjson generate_fix_export "$([[ "${GENERATE_FIX_EXPORT}" == "true" ]] && echo true || echo false)" \
  --argjson review_pack "${REVIEW_PACK_JSON}" \
  --argjson fix_plan "${FIX_PLAN_JSON}" \
  --argjson fix_export "${FIX_EXPORT_JSON}" \
  --argjson threshold_rc "${threshold_rc}" \
  --slurpfile threshold "${OUT_DIR}/02_threshold_check.json" \
  '{
    ok: ($threshold_rc == 0),
    run_id: $run_id,
    out_dir: $out_dir,
    rehearsal_summary: $rehearsal_summary,
    review_pack_enabled: $generate_review_pack,
    fix_plan_enabled: $generate_fix_plan,
    fix_export_enabled: $generate_fix_export,
    review_pack: (if $generate_review_pack then $review_pack else null end),
    fix_plan: (if ($generate_fix_plan and $generate_review_pack) then $fix_plan else null end),
    fix_export: (if ($generate_fix_export and $generate_fix_plan and $generate_review_pack) then $fix_export else null end),
    threshold: ($threshold[0] // null),
    threshold_exit_code: $threshold_rc
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}/summary.json"

if [[ "${threshold_rc}" -ne 0 ]]; then
  exit "${threshold_rc}"
fi
