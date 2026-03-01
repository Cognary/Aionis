#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  npm run -s evidence:weekly -- [options]

Options:
  --scope <scope>                  Requested scope; when XMB runs, gate scope auto-binds to XMB-006 scope
  --window-hours <n>               Rolling window in hours (default: 168)
  --report-week <YYYY-Www>         Report week label (default: UTC ISO week)
  --run-id <id>                    Run id (default: UTC timestamp)
  --base-url <url>                 API base url for benchmark (default: AIONIS_BASE_URL or auto-detect)
  --out-dir <path>                 Output dir (default: artifacts/evidence/weekly/<report_week>_<run_id>)
  --bench-suites <csv>             Bench suites for bench:aionis:v01 (default: xmb)
  --strict                         Enforce strict exit on warning/error for gates
  --strict-warnings                Enforce strict exit on warnings
  --skip-bench                     Skip benchmark stage
  -h, --help                       Show help
EOF
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

iso_week_utc() {
  date -u '+%G-W%V'
}

timestamp_utc() {
  date -u '+%Y%m%d_%H%M%S'
}

detect_base_url() {
  if [[ -n "${AIONIS_BASE_URL:-}" ]]; then
    echo "${AIONIS_BASE_URL}"
    return
  fi
  local port_candidate="${PORT:-3001}"
  local primary="http://127.0.0.1:${port_candidate}"
  if curl -fsS "${primary}/health" >/dev/null 2>&1; then
    echo "${primary}"
    return
  fi
  local fallback="http://127.0.0.1:3021"
  if curl -fsS "${fallback}/health" >/dev/null 2>&1; then
    echo "${fallback}"
    return
  fi
  echo "${primary}"
}

SCOPE="${MEMORY_SCOPE:-default}"
WINDOW_HOURS=168
REPORT_WEEK="$(iso_week_utc)"
RUN_ID="$(timestamp_utc)"
BASE_URL="$(detect_base_url)"
BENCH_SUITES="xmb"
STRICT=false
STRICT_WARNINGS=false
SKIP_BENCH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --window-hours)
      WINDOW_HOURS="${2:-}"
      shift 2
      ;;
    --report-week)
      REPORT_WEEK="${2:-}"
      shift 2
      ;;
    --run-id)
      RUN_ID="${2:-}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --bench-suites)
      BENCH_SUITES="${2:-}"
      shift 2
      ;;
    --strict)
      STRICT=true
      shift
      ;;
    --strict-warnings)
      STRICT_WARNINGS=true
      shift
      ;;
    --skip-bench)
      SKIP_BENCH=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/evidence/weekly/${REPORT_WEEK}_${RUN_ID}}"
RAW_DIR="${OUT_DIR}/raw"
mkdir -p "${RAW_DIR}" "${OUT_DIR}/governance_weekly" "${OUT_DIR}/bench_xmb"

need jq
need npm
need python3
need curl

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

echo "[weekly-evidence] scope=${SCOPE} window_hours=${WINDOW_HOURS} report_week=${REPORT_WEEK} run_id=${RUN_ID}"
echo "[weekly-evidence] base_url=${BASE_URL}"
echo "[weekly-evidence] out_dir=${OUT_DIR}"

run_capture() {
  local name="$1"
  shift
  local out_file="${RAW_DIR}/${name}.out"
  local err_file="${RAW_DIR}/${name}.err"
  local rc_file="${RAW_DIR}/${name}.exit_code"
  set +e
  "$@" >"${out_file}" 2>"${err_file}"
  local ec=$?
  set -e
  echo "${ec}" > "${rc_file}"
  echo "[weekly-evidence] ${name} exit=${ec}"
  return 0
}

STRICT_FLAGS=()
if [[ "${STRICT}" == "true" ]]; then
  STRICT_FLAGS+=(--strict)
fi
if [[ "${STRICT_WARNINGS}" == "true" ]]; then
  STRICT_FLAGS+=(--strict-warnings)
fi

GATE_SCOPE="${SCOPE}"

if [[ "${SKIP_BENCH}" == "true" ]]; then
  echo "0" > "${RAW_DIR}/bench_xmb.exit_code"
  echo "{\"ok\":true,\"skipped\":true,\"reason\":\"skip_bench\"}" > "${RAW_DIR}/bench_xmb.out"
  : > "${RAW_DIR}/bench_xmb.err"
else
  run_capture "bench_xmb" \
    npm run -s bench:aionis:v01 -- \
      --base-url "${BASE_URL}" \
      --scope-prefix "weekly_evidence_${REPORT_WEEK}_${RUN_ID}" \
      --run-id "${RUN_ID}_bench_xmb" \
      --suites "${BENCH_SUITES}" \
      --out-dir "${OUT_DIR}/bench_xmb" \
      --allow-fail

  if [[ -f "${OUT_DIR}/bench_xmb/details.json" ]]; then
    XMB_SCOPE_FROM_BENCH="$(jq -r '.cases[]? | select(.case_id == "XMB-006") | .metrics.scope // empty' "${OUT_DIR}/bench_xmb/details.json" | head -n 1)"
    if [[ -n "${XMB_SCOPE_FROM_BENCH}" ]]; then
      GATE_SCOPE="${XMB_SCOPE_FROM_BENCH}"
      echo "[weekly-evidence] gate_scope auto-selected from XMB-006: ${GATE_SCOPE}"
    fi
  fi
fi

echo "[weekly-evidence] gate_scope=${GATE_SCOPE}"

run_capture "execution_loop_gate" \
  npm run -s job:execution-loop-gate -- \
    --scope "${GATE_SCOPE}" \
    --window-hours "${WINDOW_HOURS}" \
    "${STRICT_FLAGS[@]:-}"

run_capture "governance_weekly_report" \
  npm run -s job:governance-weekly-report -- \
    --scope "${GATE_SCOPE}" \
    --window-hours "${WINDOW_HOURS}" \
    --report-week "${REPORT_WEEK}" \
    --run-id "${RUN_ID}" \
    --out-dir "${OUT_DIR}/governance_weekly" \
    "${STRICT_FLAGS[@]:-}"

EXEC_JSON="${RAW_DIR}/execution_loop_gate.json"
GOV_JSON="${RAW_DIR}/governance_weekly_report.json"
GOV_SUMMARY_JSON="${OUT_DIR}/governance_weekly/summary.json"
BENCH_SUMMARY_JSON="${OUT_DIR}/bench_xmb/summary.json"
BENCH_DETAILS_JSON="${OUT_DIR}/bench_xmb/details.json"

if jq -e . "${RAW_DIR}/execution_loop_gate.out" >/dev/null 2>&1; then
  cp "${RAW_DIR}/execution_loop_gate.out" "${EXEC_JSON}"
else
  echo "{\"ok\":false,\"error\":\"invalid_execution_loop_gate_output\"}" > "${EXEC_JSON}"
fi

if jq -e . "${RAW_DIR}/governance_weekly_report.out" >/dev/null 2>&1; then
  cp "${RAW_DIR}/governance_weekly_report.out" "${GOV_JSON}"
else
  echo "{\"ok\":false,\"error\":\"invalid_governance_weekly_output\"}" > "${GOV_JSON}"
fi

if [[ ! -f "${GOV_SUMMARY_JSON}" ]]; then
  echo "{\"ok\":false,\"error\":\"missing_governance_weekly_summary\",\"summary\":{\"pass\":false}}" > "${GOV_SUMMARY_JSON}"
fi

if [[ ! -f "${BENCH_SUMMARY_JSON}" ]]; then
  echo "{\"ok\":false,\"error\":\"missing_bench_summary\"}" > "${BENCH_SUMMARY_JSON}"
fi
if [[ ! -f "${BENCH_DETAILS_JSON}" ]]; then
  echo "{\"ok\":false,\"error\":\"missing_bench_details\"}" > "${BENCH_DETAILS_JSON}"
fi

EXEC_EXIT="$(cat "${RAW_DIR}/execution_loop_gate.exit_code")"
GOV_EXIT="$(cat "${RAW_DIR}/governance_weekly_report.exit_code")"
BENCH_EXIT="$(cat "${RAW_DIR}/bench_xmb.exit_code")"

EXEC_PASS="$(jq -r '.summary.pass // false' "${EXEC_JSON}" 2>/dev/null || echo false)"
GOV_PASS="$(jq -r '.summary.pass // false' "${GOV_SUMMARY_JSON}" 2>/dev/null || echo false)"
BENCH_OK="$(jq -r '.ok // false' "${BENCH_SUMMARY_JSON}" 2>/dev/null || echo false)"

EVIDENCE_PASS=false
if [[ "${EXEC_PASS}" == "true" && "${GOV_PASS}" == "true" && "${BENCH_OK}" == "true" ]]; then
  EVIDENCE_PASS=true
fi

SUMMARY_JSON="${OUT_DIR}/EVIDENCE_SUMMARY.json"
SUMMARY_MD="${OUT_DIR}/EVIDENCE_WEEKLY.md"

jq -n \
  --arg report_week "${REPORT_WEEK}" \
  --arg run_id "${RUN_ID}" \
  --arg requested_scope "${SCOPE}" \
  --arg gate_scope "${GATE_SCOPE}" \
  --argjson window_hours "${WINDOW_HOURS}" \
  --arg base_url "${BASE_URL}" \
  --arg out_dir "${OUT_DIR}" \
  --argjson evidence_pass "${EVIDENCE_PASS}" \
  --argjson execution_loop_gate_exit_code "${EXEC_EXIT}" \
  --argjson governance_weekly_report_exit_code "${GOV_EXIT}" \
  --argjson bench_xmb_exit_code "${BENCH_EXIT}" \
  --slurpfile execution_loop_gate "${EXEC_JSON}" \
  --slurpfile governance_weekly "${GOV_SUMMARY_JSON}" \
  --slurpfile bench_summary "${BENCH_SUMMARY_JSON}" \
  --slurpfile bench_details "${BENCH_DETAILS_JSON}" \
  '{
    ok: true,
    kind: "weekly_differentiation_evidence_pack",
    report_week: $report_week,
    run_id: $run_id,
    requested_scope: $requested_scope,
    scope: $gate_scope,
    gate_scope: $gate_scope,
    window_hours: $window_hours,
    base_url: $base_url,
    out_dir: $out_dir,
    summary: {
      evidence_pass: $evidence_pass,
      execution_loop_pass: ($execution_loop_gate[0].summary.pass // false),
      governance_weekly_pass: ($governance_weekly[0].summary.pass // false),
      bench_pass: ($bench_summary[0].ok // false)
    },
    stages: {
      execution_loop_gate: {
        exit_code: $execution_loop_gate_exit_code,
        summary: ($execution_loop_gate[0].summary // null),
        key_metrics: ($execution_loop_gate[0].metrics // null)
      },
      governance_weekly_report: {
        exit_code: $governance_weekly_report_exit_code,
        summary: ($governance_weekly[0].summary // null),
        scope_snapshot: ($governance_weekly[0].scope_snapshot // null),
        recommendations: ($governance_weekly[0].recommendations // [])
      },
      bench_xmb: {
        exit_code: $bench_xmb_exit_code,
        summary: ($bench_summary[0] // null),
        xmb_ab: ($bench_summary[0].xmb_ab // null),
        cases: (($bench_details[0].cases // []) | map({
          case_id,
          ok,
          metrics
        }))
      }
    },
    artifacts: {
      execution_loop_gate_json: ($out_dir + "/raw/execution_loop_gate.json"),
      governance_weekly_summary_json: ($out_dir + "/governance_weekly/summary.json"),
      governance_weekly_md: ($out_dir + "/governance_weekly/WEEKLY_STATUS.md"),
      bench_summary_json: ($out_dir + "/bench_xmb/summary.json"),
      bench_report_md: ($out_dir + "/bench_xmb/report.md"),
      evidence_summary_json: ($out_dir + "/EVIDENCE_SUMMARY.json"),
      evidence_weekly_md: ($out_dir + "/EVIDENCE_WEEKLY.md")
    }
  }' > "${SUMMARY_JSON}"

XMB_BASELINE="$(jq -r '.stages.bench_xmb.xmb_ab.baseline_success_rate // "n/a"' "${SUMMARY_JSON}")"
XMB_POLICY="$(jq -r '.stages.bench_xmb.xmb_ab.policy_success_rate // "n/a"' "${SUMMARY_JSON}")"
XMB_GAIN="$(jq -r '.stages.bench_xmb.xmb_ab.success_rate_gain // "n/a"' "${SUMMARY_JSON}")"
XMB_FB_COV="$(jq -r '.stages.bench_xmb.xmb_ab.feedback_link_coverage // "n/a"' "${SUMMARY_JSON}")"
XMB_SRC_COV="$(jq -r '.stages.bench_xmb.xmb_ab.source_rule_coverage // "n/a"' "${SUMMARY_JSON}")"
EXEC_SUMMARY_PASS="$(jq -r '.summary.execution_loop_pass' "${SUMMARY_JSON}")"
GOV_SUMMARY_PASS="$(jq -r '.summary.governance_weekly_pass' "${SUMMARY_JSON}")"
BENCH_SUMMARY_PASS="$(jq -r '.summary.bench_pass' "${SUMMARY_JSON}")"
EVIDENCE_SUMMARY_PASS="$(jq -r '.summary.evidence_pass' "${SUMMARY_JSON}")"

cat > "${SUMMARY_MD}" <<EOF
# Weekly Differentiation Evidence

1. report_week: \`${REPORT_WEEK}\`
2. run_id: \`${RUN_ID}\`
3. requested_scope: \`${SCOPE}\`
4. gate_scope: \`${GATE_SCOPE}\`
5. window_hours: \`${WINDOW_HOURS}\`
6. base_url: \`${BASE_URL}\`
7. evidence_pass: \`${EVIDENCE_SUMMARY_PASS}\`

## Stage Status

1. execution_loop_gate: \`${EXEC_SUMMARY_PASS}\` (exit=\`${EXEC_EXIT}\`)
2. governance_weekly_report: \`${GOV_SUMMARY_PASS}\` (exit=\`${GOV_EXIT}\`)
3. bench_xmb: \`${BENCH_SUMMARY_PASS}\` (exit=\`${BENCH_EXIT}\`)

## Policy Loop A/B (XMB-006)

| metric | value |
|---|---:|
| baseline_success_rate | ${XMB_BASELINE} |
| policy_success_rate | ${XMB_POLICY} |
| success_rate_gain | ${XMB_GAIN} |
| feedback_link_coverage | ${XMB_FB_COV} |
| source_rule_coverage | ${XMB_SRC_COV} |

## Governance Recommendations

$(jq -r '.stages.governance_weekly_report.recommendations[]? | "1. " + .' "${SUMMARY_JSON}")

## Artifact Paths

1. execution loop json: \`${OUT_DIR}/raw/execution_loop_gate.json\`
2. governance weekly json: \`${OUT_DIR}/governance_weekly/summary.json\`
3. governance weekly markdown: \`${OUT_DIR}/governance_weekly/WEEKLY_STATUS.md\`
4. bench summary json: \`${OUT_DIR}/bench_xmb/summary.json\`
5. bench report markdown: \`${OUT_DIR}/bench_xmb/report.md\`
6. weekly evidence json: \`${OUT_DIR}/EVIDENCE_SUMMARY.json\`
7. weekly evidence markdown: \`${OUT_DIR}/EVIDENCE_WEEKLY.md\`
EOF

echo "[weekly-evidence] generated:"
echo "  - ${SUMMARY_JSON}"
echo "  - ${SUMMARY_MD}"

cat "${SUMMARY_JSON}"

if [[ "${STRICT}" == "true" && "${EVIDENCE_PASS}" != "true" ]]; then
  exit 2
fi
if [[ "${STRICT_WARNINGS}" == "true" && "${EVIDENCE_PASS}" != "true" ]]; then
  exit 2
fi
