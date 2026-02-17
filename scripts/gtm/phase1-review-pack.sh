#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need npm
need jq

LOOKBACK_DAYS="${LOOKBACK_DAYS:-30}"
OWNER="${OWNER:-TBD}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/review/${RUN_ID}}"
PHASE="${PHASE:-Phase 1}"
GATE_SUMMARY_ROOT="${GATE_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/gtm/gate_a}"
REHEARSAL_SUMMARY_ROOT="${REHEARSAL_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/gtm/phase1_rehearsal}"
REGRESSION_SUMMARY_ROOT="${REGRESSION_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/regression}"

mkdir -p "${OUT_DIR}"

KPI_OUT="${OUT_DIR}/kpi"
WEEKLY_OUT="${OUT_DIR}/weekly"
mkdir -p "${KPI_OUT}" "${WEEKLY_OUT}"

echo "[review-pack] generate kpi snapshot"
LOOKBACK_DAYS="${LOOKBACK_DAYS}" \
GATE_SUMMARY_ROOT="${GATE_SUMMARY_ROOT}" \
RUN_ID="${RUN_ID}" \
OUT_DIR="${KPI_OUT}" \
npm run -s gtm:phase1:kpi-export > "${OUT_DIR}/01_kpi_export.log"

echo "[review-pack] generate weekly status"
LOOKBACK_DAYS="${LOOKBACK_DAYS}" \
GATE_SUMMARY_ROOT="${GATE_SUMMARY_ROOT}" \
REHEARSAL_SUMMARY_ROOT="${REHEARSAL_SUMMARY_ROOT}" \
REGRESSION_SUMMARY_ROOT="${REGRESSION_SUMMARY_ROOT}" \
OWNER="${OWNER}" \
PHASE="${PHASE}" \
RUN_ID="${RUN_ID}" \
OUT_DIR="${WEEKLY_OUT}" \
npm run -s gtm:phase1:weekly-report > "${OUT_DIR}/02_weekly_report.log"

KPI_JSON="${KPI_OUT}/kpi_snapshot.json"
WEEKLY_JSON="${WEEKLY_OUT}/summary.json"

if [[ ! -f "${KPI_JSON}" ]]; then
  echo "missing KPI snapshot: ${KPI_JSON}" >&2
  exit 1
fi
if [[ ! -f "${WEEKLY_JSON}" ]]; then
  echo "missing weekly summary: ${WEEKLY_JSON}" >&2
  exit 1
fi

gate_runs="$(jq -r '.gate.runs // 0' "${KPI_JSON}")"
gate_passed="$(jq -r '.gate.passed // 0' "${KPI_JSON}")"
gate_pass_rate="$(jq -r '.gate.pass_rate // 0' "${KPI_JSON}")"
ttfv_p50_ms="$(jq -r '.activation.ttfv_p50_ms // 0' "${KPI_JSON}")"
killer_demo_ok_pct="$(jq -r '.activation.killer_demo_ok_pct // 0' "${KPI_JSON}")"
memory_recall_improved_pct="$(jq -r '.activation.memory_recall_improved_pct // 0' "${KPI_JSON}")"
cross_session_pct="$(jq -r '.activation.cross_session_recall_stable_pct // 0' "${KPI_JSON}")"
docs_ok_pct="$(jq -r '.quality.docs_check_ok_pct // 0' "${KPI_JSON}")"
avg_gate_duration_ms="$(jq -r '.quality.avg_gate_duration_ms // 0' "${KPI_JSON}")"
overall_status="$(jq -r '.executive.overall_status // "unknown"' "${WEEKLY_JSON}")"
headline="$(jq -r '.executive.headline // ""' "${WEEKLY_JSON}")"
critical_blocker="$(jq -r '.executive.critical_blocker // ""' "${WEEKLY_JSON}")"
rehearsal_avg_pass="$(jq -r '.rehearsal.avg_pass_rate // 0' "${WEEKLY_JSON}")"
latest_rehearsal="$(jq -r '.rehearsal.latest_summary // ""' "${WEEKLY_JSON}")"

TARGET_GATE_PASS_RATE="${TARGET_GATE_PASS_RATE:-0.8}"
TARGET_TTFV_MS="${TARGET_TTFV_MS:-1800000}"
TARGET_MIN_GATE_RUNS="${TARGET_MIN_GATE_RUNS:-3}"
REQUIRE_TTFV_SIGNAL="${REQUIRE_TTFV_SIGNAL:-true}"

gate_target_ok="false"
if awk -v p="${gate_pass_rate}" -v t="${TARGET_GATE_PASS_RATE}" 'BEGIN{exit !(p>=t)}'; then
  gate_target_ok="true"
fi
ttfv_target_ok="false"
if awk -v v="${ttfv_p50_ms}" -v t="${TARGET_TTFV_MS}" 'BEGIN{exit !(v>0 && v<=t)}'; then
  ttfv_target_ok="true"
fi

enough_gate_runs="false"
if awk -v r="${gate_runs}" -v t="${TARGET_MIN_GATE_RUNS}" 'BEGIN{exit !(r>=t)}'; then
  enough_gate_runs="true"
fi

ttfv_signal_present="false"
if awk -v v="${ttfv_p50_ms}" 'BEGIN{exit !(v>0)}'; then
  ttfv_signal_present="true"
fi

go_no_go="false"
if [[ "${gate_target_ok}" == "true" && "${enough_gate_runs}" == "true" ]]; then
  if [[ "${REQUIRE_TTFV_SIGNAL}" == "true" ]]; then
    if [[ "${ttfv_target_ok}" == "true" ]]; then
      go_no_go="true"
    fi
  else
    go_no_go="true"
  fi
fi

go_no_go_reasons=()
if [[ "${gate_target_ok}" != "true" ]]; then
  go_no_go_reasons+=("gate_pass_rate_below_target")
fi
if [[ "${enough_gate_runs}" != "true" ]]; then
  go_no_go_reasons+=("insufficient_gate_runs")
fi
if [[ "${REQUIRE_TTFV_SIGNAL}" == "true" && "${ttfv_signal_present}" != "true" ]]; then
  go_no_go_reasons+=("missing_ttfv_signal")
fi
if [[ "${REQUIRE_TTFV_SIGNAL}" == "true" && "${ttfv_signal_present}" == "true" && "${ttfv_target_ok}" != "true" ]]; then
  go_no_go_reasons+=("ttfv_p50_above_target")
fi

latest_gate_summary="$(find "${ROOT_DIR}/artifacts/gtm/gate_a" -mindepth 2 -maxdepth 2 -type f -name summary.json | sort | tail -n 1 || true)"
latest_ci_gate_summary="$(find "${ROOT_DIR}/artifacts/gtm/ci_gate" -mindepth 2 -maxdepth 2 -type f -name summary.json | sort | tail -n 1 || true)"

REVIEW_MD="${OUT_DIR}/REVIEW_PACKAGE.md"
{
  echo "# Phase 1 Gate A Review Package"
  echo
  echo "Generated at: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
  echo "Owner: \`${OWNER}\`"
  echo "Lookback days: \`${LOOKBACK_DAYS}\`"
  echo "Phase: \`${PHASE}\`"
  echo
  echo "## Executive"
  echo
  echo "1. Overall status: \`${overall_status}\`"
  echo "2. Headline: ${headline}"
  echo "3. Critical blocker: ${critical_blocker}"
  echo
  echo "## KPI Summary"
  echo
  echo "| Metric | Value | Target | Status |"
  echo "| --- | ---: | ---: | --- |"
  echo "| Gate pass rate | ${gate_pass_rate} (${gate_passed}/${gate_runs}) | >= ${TARGET_GATE_PASS_RATE} | ${gate_target_ok} |"
  echo "| Gate runs | ${gate_runs} | >= ${TARGET_MIN_GATE_RUNS} | ${enough_gate_runs} |"
  echo "| TTFV P50 (ms) | ${ttfv_p50_ms} | <= ${TARGET_TTFV_MS} | ${ttfv_target_ok} |"
  echo "| Killer demo ok (%) | ${killer_demo_ok_pct} | n/a | n/a |"
  echo "| Memory recall improved (%) | ${memory_recall_improved_pct} | n/a | n/a |"
  echo "| Cross-session stable (%) | ${cross_session_pct} | n/a | n/a |"
  echo "| Docs check ok (%) | ${docs_ok_pct} | 100 | n/a |"
  echo "| Avg gate duration (ms) | ${avg_gate_duration_ms} | n/a | n/a |"
  echo "| Rehearsal avg pass rate | ${rehearsal_avg_pass} | >= ${TARGET_GATE_PASS_RATE} | n/a |"
  echo
  echo "## Top Failed Checks"
  echo
  failed_top_len="$(jq -r '.failed_checks_top | length' "${KPI_JSON}")"
  if [[ "${failed_top_len}" -eq 0 ]]; then
    echo "- none"
  else
    jq -r '.failed_checks_top[] | "- \(.check): \(.count)"' "${KPI_JSON}"
  fi
  echo
  echo "## Evidence Paths"
  echo
  echo "1. KPI snapshot: \`${KPI_JSON}\`"
  echo "2. Weekly summary: \`${WEEKLY_JSON}\`"
  echo "3. Weekly markdown: \`${WEEKLY_OUT}/WEEKLY_STATUS.md\`"
  echo "4. Latest gate summary: \`${latest_gate_summary}\`"
  echo "5. Latest rehearsal summary: \`${latest_rehearsal}\`"
  echo "6. Latest CI gate summary: \`${latest_ci_gate_summary}\`"
  echo
  echo "## Suggested Next Actions"
  echo
  if [[ "${go_no_go}" == "true" ]]; then
    echo "1. **Go**: proceed to Gate A sign-off and Phase 2 kickoff."
  else
    echo "1. **No-Go**: keep Phase 1 open and fix blockers listed below."
  fi
  if [[ "${gate_target_ok}" != "true" ]]; then
    echo "1. Increase Gate A rehearsal pass rate to >= ${TARGET_GATE_PASS_RATE} before Gate A sign-off."
    echo "2. Prioritize fixes for top failed checks listed above."
  fi
  if [[ "${ttfv_target_ok}" != "true" ]]; then
    echo "3. Reduce onboarding friction to push TTFV P50 below ${TARGET_TTFV_MS} ms."
  fi
  if [[ "${enough_gate_runs}" != "true" ]]; then
    echo "4. Increase rehearsal sample size to >= ${TARGET_MIN_GATE_RUNS} runs."
  fi
  if [[ "${REQUIRE_TTFV_SIGNAL}" == "true" && "${ttfv_signal_present}" != "true" ]]; then
    echo "5. Ensure at least one valid TTFV signal is captured (non-zero killer demo duration)."
  fi
} > "${REVIEW_MD}"

go_no_go_reasons_json="[]"
if ((${#go_no_go_reasons[@]} > 0)); then
  go_no_go_reasons_json="$(printf '%s\n' "${go_no_go_reasons[@]}" | jq -R . | jq -s .)"
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg review_md "${REVIEW_MD}" \
  --arg kpi_json "${KPI_JSON}" \
  --arg weekly_json "${WEEKLY_JSON}" \
  --argjson gate_pass_rate "${gate_pass_rate}" \
  --argjson ttfv_p50_ms "${ttfv_p50_ms}" \
  --argjson target_gate_pass_rate "${TARGET_GATE_PASS_RATE}" \
  --argjson target_ttfv_ms "${TARGET_TTFV_MS}" \
  --argjson target_min_gate_runs "${TARGET_MIN_GATE_RUNS}" \
  --argjson require_ttfv_signal "$([[ "${REQUIRE_TTFV_SIGNAL}" == "true" ]] && echo true || echo false)" \
  --argjson gate_target_ok "${gate_target_ok}" \
  --argjson ttfv_target_ok "${ttfv_target_ok}" \
  --argjson enough_gate_runs "${enough_gate_runs}" \
  --argjson ttfv_signal_present "${ttfv_signal_present}" \
  --argjson go_no_go "${go_no_go}" \
  --argjson go_no_go_reasons "${go_no_go_reasons_json}" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    files: {
      review_markdown: $review_md,
      kpi_snapshot: $kpi_json,
      weekly_summary: $weekly_json
    },
    targets: {
      gate_pass_rate: $target_gate_pass_rate,
      ttfv_p50_ms: $target_ttfv_ms,
      min_gate_runs: $target_min_gate_runs,
      require_ttfv_signal: $require_ttfv_signal
    },
    actual: {
      gate_pass_rate: $gate_pass_rate,
      ttfv_p50_ms: $ttfv_p50_ms
    },
    status: {
      gate_target_ok: $gate_target_ok,
      ttfv_target_ok: $ttfv_target_ok,
      enough_gate_runs: $enough_gate_runs,
      ttfv_signal_present: $ttfv_signal_present,
      go_no_go: $go_no_go,
      go_no_go_reasons: $go_no_go_reasons
    }
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}/summary.json"
