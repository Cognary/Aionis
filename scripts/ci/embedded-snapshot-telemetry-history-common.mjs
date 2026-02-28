function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeNumbers(values) {
  const nums = values.map(numberOrNull).filter((v) => typeof v === "number");
  if (nums.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      avg: null,
    };
  }
  const sorted = nums.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, x) => acc + x, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Number((sum / sorted.length).toFixed(6)),
  };
}

export function isRollupSummary(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.ok !== "boolean") return false;
  const totals = payload.totals;
  if (!totals || typeof totals !== "object") return false;
  if (typeof totals.samples !== "number") return false;
  if (typeof totals.failed_samples !== "number") return false;
  return true;
}

export function buildTelemetryHistory(records) {
  const list = (Array.isArray(records) ? records : []).filter((r) => isRollupSummary(r.payload));
  const dedup = new Map();
  for (const item of list) {
    const runId = String(item.payload?.run?.github_run_id || item.run_id_hint || "");
    const generatedAt = String(item.payload?.generated_at || "");
    const key = runId.length > 0 ? `run:${runId}` : `gen:${generatedAt}:${item.source_path || ""}`;
    if (dedup.has(key)) continue;
    dedup.set(key, item);
  }

  const rows = Array.from(dedup.values())
    .map((item) => {
      const payload = item.payload;
      const totals = payload.totals || {};
      const deltas = payload.deltas || {};
      return {
        run_id: String(payload?.run?.github_run_id || item.run_id_hint || ""),
        generated_at: String(payload.generated_at || ""),
        ok: payload.ok === true,
        samples: numberOrNull(totals.samples),
        embedded_samples: numberOrNull(totals.embedded_samples),
        skipped_samples: numberOrNull(totals.skipped_samples),
        failed_samples: numberOrNull(totals.failed_samples),
        persist_total_avg: numberOrNull(deltas.persist_total?.avg),
        dropped_nodes_max: numberOrNull(deltas.dropped_nodes?.max),
      };
    })
    .sort((a, b) => String(a.generated_at).localeCompare(String(b.generated_at)));

  const failedRuns = rows.filter((r) => Number(r.failed_samples || 0) > 0);
  const latest = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    ok: failedRuns.length === 0,
    generated_at: new Date().toISOString(),
    runs_total: rows.length,
    runs_with_failures: failedRuns.length,
    latest,
    stats: {
      failed_samples: summarizeNumbers(rows.map((r) => r.failed_samples)),
      embedded_samples: summarizeNumbers(rows.map((r) => r.embedded_samples)),
      persist_total_avg: summarizeNumbers(rows.map((r) => r.persist_total_avg)),
      dropped_nodes_max: summarizeNumbers(rows.map((r) => r.dropped_nodes_max)),
    },
    failed_runs: failedRuns.map((r) => ({
      run_id: r.run_id,
      generated_at: r.generated_at,
      failed_samples: r.failed_samples,
    })),
    series: rows,
  };
}
