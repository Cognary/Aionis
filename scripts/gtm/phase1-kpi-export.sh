#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need awk
need sort

LOOKBACK_DAYS="${LOOKBACK_DAYS:-30}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/kpi/${RUN_ID}}"
GATE_SUMMARY_ROOT="${GATE_SUMMARY_ROOT:-${ROOT_DIR}/artifacts/gtm/gate_a}"
mkdir -p "${OUT_DIR}"

find_cmd=(find "${GATE_SUMMARY_ROOT}" -type f -name summary.json)
if [[ "${LOOKBACK_DAYS}" =~ ^[0-9]+$ ]] && [[ "${LOOKBACK_DAYS}" -gt 0 ]]; then
  find_cmd+=(-mtime "-${LOOKBACK_DAYS}")
fi

gate_files=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && gate_files+=("${line}")
done < <("${find_cmd[@]}" | sort)

gate_runs=0
gate_passed=0
killer_demo_ok=0
memory_recall_improved=0
cross_session_ok=0
docs_check_ok=0

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
>"${tmp_dir}/gate_duration_ms.txt"
>"${tmp_dir}/killer_demo_duration_ms.txt"
>"${tmp_dir}/failed_checks.txt"

echo "run_id,started_at,pass,killer_demo_ok,memory_recall_improved,cross_session_recall_stable,docs_check_ok,gate_duration_ms,killer_demo_duration_ms" > "${OUT_DIR}/gate_timeseries.csv"

for f in "${gate_files[@]}"; do
  gate_runs=$((gate_runs + 1))

  run_id="$(jq -r '.run_id // "unknown"' "${f}")"
  started_at="$(jq -r '.started_at // ""' "${f}")"
  pass="$(jq -r '.gate.pass // false' "${f}")"
  k_ok="$(jq -r '.checks.killer_demo_ok // false' "${f}")"
  mr_ok="$(jq -r '.checks.memory_recall_improved // false' "${f}")"
  cs_ok="$(jq -r '.checks.cross_session_recall_stable // false' "${f}")"
  d_ok="$(jq -r '.checks.docs_check_ok // false' "${f}")"
  gate_ms="$(jq -r '.timings.gate_duration_ms // 0' "${f}")"
  demo_ms="$(jq -r '.timings.killer_demo_duration_ms // 0' "${f}")"

  [[ "${pass}" == "true" ]] && gate_passed=$((gate_passed + 1))
  [[ "${k_ok}" == "true" ]] && killer_demo_ok=$((killer_demo_ok + 1))
  [[ "${mr_ok}" == "true" ]] && memory_recall_improved=$((memory_recall_improved + 1))
  [[ "${cs_ok}" == "true" ]] && cross_session_ok=$((cross_session_ok + 1))
  [[ "${d_ok}" == "true" ]] && docs_check_ok=$((docs_check_ok + 1))

  echo "${gate_ms}" >> "${tmp_dir}/gate_duration_ms.txt"
  echo "${demo_ms}" >> "${tmp_dir}/killer_demo_duration_ms.txt"
  jq -r '.checks | to_entries[] | select(.value!=true) | .key' "${f}" >> "${tmp_dir}/failed_checks.txt" || true

  echo "${run_id},${started_at},${pass},${k_ok},${mr_ok},${cs_ok},${d_ok},${gate_ms},${demo_ms}" >> "${OUT_DIR}/gate_timeseries.csv"
done

pct() {
  local num="$1"
  local den="$2"
  awk -v n="${num}" -v d="${den}" 'BEGIN{ if (d==0) print "0.00"; else printf "%.2f", (n*100)/d }'
}

ratio4() {
  local num="$1"
  local den="$2"
  awk -v n="${num}" -v d="${den}" 'BEGIN{ if (d==0) print "0.0000"; else printf "%.4f", n/d }'
}

avg_gate_ms=0
if [[ -s "${tmp_dir}/gate_duration_ms.txt" ]]; then
  avg_gate_ms="$(awk '{sum+=$1; n+=1} END{if (n>0) printf "%.0f", sum/n; else print 0}' "${tmp_dir}/gate_duration_ms.txt")"
fi

ttfv_p50_ms=0
if [[ -s "${tmp_dir}/killer_demo_duration_ms.txt" ]]; then
  ttfv_p50_ms="$(sort -n "${tmp_dir}/killer_demo_duration_ms.txt" | awk '
    {a[NR]=$1}
    END{
      if (NR==0) { print 0; exit }
      idx = int((NR+1)/2)
      if (idx < 1) idx = 1
      print a[idx]
    }'
  )"
fi

if [[ -s "${tmp_dir}/failed_checks.txt" ]]; then
  sort "${tmp_dir}/failed_checks.txt" | uniq -c | awk '{print "{\"check\":\""$2"\",\"count\":"$1"}"}' | jq -s 'sort_by(-.count)' > "${OUT_DIR}/failed_checks_top.json"
else
  echo '[]' > "${OUT_DIR}/failed_checks_top.json"
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg gate_summary_root "${GATE_SUMMARY_ROOT}" \
  --argjson lookback_days "${LOOKBACK_DAYS}" \
  --argjson gate_runs "${gate_runs}" \
  --argjson gate_passed "${gate_passed}" \
  --arg gate_pass_rate "$(ratio4 "${gate_passed}" "${gate_runs}")" \
  --argjson gate_pass_rate_pct "$(pct "${gate_passed}" "${gate_runs}")" \
  --argjson killer_demo_ok_pct "$(pct "${killer_demo_ok}" "${gate_runs}")" \
  --argjson memory_recall_improved_pct "$(pct "${memory_recall_improved}" "${gate_runs}")" \
  --argjson cross_session_ok_pct "$(pct "${cross_session_ok}" "${gate_runs}")" \
  --argjson docs_check_ok_pct "$(pct "${docs_check_ok}" "${gate_runs}")" \
  --argjson avg_gate_duration_ms "${avg_gate_ms}" \
  --argjson ttfv_p50_ms "${ttfv_p50_ms}" \
  --slurpfile failed_checks "${OUT_DIR}/failed_checks_top.json" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    source: {
      gate_summary_root: $gate_summary_root
    },
    lookback_days: $lookback_days,
    gate: {
      runs: $gate_runs,
      passed: $gate_passed,
      pass_rate: ($gate_pass_rate|tonumber),
      pass_rate_pct: $gate_pass_rate_pct
    },
    activation: {
      ttfv_p50_ms: $ttfv_p50_ms,
      killer_demo_ok_pct: $killer_demo_ok_pct,
      memory_recall_improved_pct: $memory_recall_improved_pct,
      cross_session_recall_stable_pct: $cross_session_ok_pct
    },
    quality: {
      docs_check_ok_pct: $docs_check_ok_pct,
      avg_gate_duration_ms: $avg_gate_duration_ms
    },
    failed_checks_top: ($failed_checks[0] // []),
    files: {
      gate_timeseries_csv: "gate_timeseries.csv",
      failed_checks_top_json: "failed_checks_top.json"
    }
  }' | tee "${OUT_DIR}/kpi_snapshot.json"

echo "done: ${OUT_DIR}/kpi_snapshot.json"
