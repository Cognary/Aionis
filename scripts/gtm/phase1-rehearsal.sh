#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

need jq
need npm
need node

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ITERATIONS="${ITERATIONS:-3}"
STOP_ON_FAIL="${STOP_ON_FAIL:-false}"
GATEA_WAIT_SECONDS="${GATEA_WAIT_SECONDS:-25}"
QUERY_TEXT="${QUERY_TEXT:-memory graph}"
REHEARSAL_FAIL_ON_THRESHOLD="${REHEARSAL_FAIL_ON_THRESHOLD:-false}"
MIN_PASS_RATE="${MIN_PASS_RATE:-1.0}"

if ! [[ "${ITERATIONS}" =~ ^[0-9]+$ ]] || [[ "${ITERATIONS}" -lt 1 ]]; then
  echo "ITERATIONS must be a positive integer" >&2
  exit 1
fi

RUN_ID="${RUN_ID:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/gtm/phase1_rehearsal/${RUN_ID}}"
RUNS_DIR="${OUT_DIR}/runs"
mkdir -p "${RUNS_DIR}"

started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
started_epoch_ms="$(now_ms)"

touch "${OUT_DIR}/durations_ms.txt" "${OUT_DIR}/failed_checks.txt" "${OUT_DIR}/runs.jsonl"

passed=0
failed=0
executed=0

for i in $(seq 1 "${ITERATIONS}"); do
  run_tag="$(printf "iter_%02d" "${i}")"
  run_id="${RUN_ID}_${run_tag}"
  run_out="${RUNS_DIR}/${run_id}"
  run_stdout="${RUNS_DIR}/${run_id}.stdout.log"
  run_stderr="${RUNS_DIR}/${run_id}.stderr.log"
  mkdir -p "${run_out}"

  iter_start_ms="$(now_ms)"
  set +e
  RUN_ID="${run_id}" \
  OUT_DIR="${run_out}" \
  GATEA_WAIT_SECONDS="${GATEA_WAIT_SECONDS}" \
  QUERY_TEXT="${QUERY_TEXT}" \
  GATEA_FAIL_ON_FAIL=false \
  npm run -s gtm:phase1:gatea >"${run_stdout}" 2>"${run_stderr}"
  rc=$?
  set -e
  iter_end_ms="$(now_ms)"
  iter_duration_ms="$((iter_end_ms - iter_start_ms))"
  echo "${iter_duration_ms}" >> "${OUT_DIR}/durations_ms.txt"
  executed=$((executed + 1))

  summary_file="${run_out}/summary.json"
  gate_pass=false
  if [[ -f "${summary_file}" ]]; then
    gate_pass="$(jq -r '.gate.pass // false' "${summary_file}")"
    jq -c --arg run_id "${run_id}" --argjson rc "${rc}" --argjson duration_ms "${iter_duration_ms}" \
      '. + {run_id:$run_id, rc:$rc, duration_ms:$duration_ms}' "${summary_file}" >> "${OUT_DIR}/runs.jsonl"
    jq -r '.checks | to_entries[] | select(.value!=true) | .key' "${summary_file}" >> "${OUT_DIR}/failed_checks.txt" || true
  else
    jq -n --arg run_id "${run_id}" --argjson rc "${rc}" --argjson duration_ms "${iter_duration_ms}" \
      '{run_id:$run_id, rc:$rc, duration_ms:$duration_ms, gate:{pass:false}, error:"missing_gate_summary"}' >> "${OUT_DIR}/runs.jsonl"
    echo "missing_gate_summary" >> "${OUT_DIR}/failed_checks.txt"
  fi

  if [[ "${gate_pass}" == "true" ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    if [[ "${STOP_ON_FAIL}" == "true" ]]; then
      break
    fi
  fi
done

ended_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
ended_epoch_ms="$(now_ms)"
rehearsal_duration_ms="$((ended_epoch_ms - started_epoch_ms))"

avg_duration_ms=0
if [[ -s "${OUT_DIR}/durations_ms.txt" ]]; then
  avg_duration_ms="$(awk '{sum+=$1; n+=1} END{if (n>0) printf "%.0f", sum/n; else print 0}' "${OUT_DIR}/durations_ms.txt")"
fi

pass_rate="$(awk -v p="${passed}" -v e="${executed}" 'BEGIN{ if (e==0) print "0"; else printf "%.4f", p/e }')"
pass_rate_pct="$(awk -v p="${passed}" -v e="${executed}" 'BEGIN{ if (e==0) print "0"; else printf "%.2f", (p*100)/e }')"

if [[ -s "${OUT_DIR}/failed_checks.txt" ]]; then
  sort "${OUT_DIR}/failed_checks.txt" | uniq -c | awk '{print "{\"check\":\""$2"\",\"count\":"$1"}"}' | jq -s 'sort_by(-.count)' > "${OUT_DIR}/failed_checks_summary.json"
else
  echo '[]' > "${OUT_DIR}/failed_checks_summary.json"
fi

jq -n \
  --arg run_id "${RUN_ID}" \
  --arg out_dir "${OUT_DIR}" \
  --arg started_at "${started_at}" \
  --arg ended_at "${ended_at}" \
  --argjson planned_iterations "${ITERATIONS}" \
  --argjson executed "${executed}" \
  --argjson passed "${passed}" \
  --argjson failed "${failed}" \
  --arg pass_rate "${pass_rate}" \
  --argjson pass_rate_pct "${pass_rate_pct}" \
  --argjson avg_duration_ms "${avg_duration_ms}" \
  --argjson rehearsal_duration_ms "${rehearsal_duration_ms}" \
  --argjson min_pass_rate "${MIN_PASS_RATE}" \
  --argjson threshold_fail_on "${REHEARSAL_FAIL_ON_THRESHOLD}" \
  --slurpfile failed_checks "${OUT_DIR}/failed_checks_summary.json" \
  '{
    ok: true,
    run_id: $run_id,
    out_dir: $out_dir,
    started_at: $started_at,
    ended_at: $ended_at,
    planned_iterations: $planned_iterations,
    executed: $executed,
    passed: $passed,
    failed: $failed,
    pass_rate: ($pass_rate | tonumber),
    pass_rate_pct: $pass_rate_pct,
    durations: {
      avg_duration_ms: $avg_duration_ms,
      rehearsal_duration_ms: $rehearsal_duration_ms
    },
    threshold: {
      min_pass_rate: $min_pass_rate,
      fail_on_threshold: $threshold_fail_on
    },
    failed_checks: ($failed_checks[0] // []),
    files: {
      runs_jsonl: "runs.jsonl",
      failed_checks: "failed_checks_summary.json"
    }
  }' | tee "${OUT_DIR}/summary.json"

echo "done: ${OUT_DIR}/summary.json"

if [[ "${REHEARSAL_FAIL_ON_THRESHOLD}" == "true" ]]; then
  below="$(awk -v p="${pass_rate}" -v m="${MIN_PASS_RATE}" 'BEGIN{if (p < m) print "true"; else print "false"}')"
  if [[ "${below}" == "true" ]]; then
    echo "Rehearsal pass_rate ${pass_rate} is below MIN_PASS_RATE ${MIN_PASS_RATE}" >&2
    exit 3
  fi
fi
