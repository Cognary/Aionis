import assert from "node:assert/strict";
import test from "node:test";

import { buildTelemetryHistory, isRollupSummary } from "./embedded-snapshot-telemetry-history-common.mjs";

function rollupPayload(overrides = {}) {
  return {
    ok: true,
    generated_at: "2026-02-28T00:00:00.000Z",
    run: {
      github_run_id: "1001",
      github_run_attempt: "1",
      github_sha: "abc",
    },
    totals: {
      samples: 3,
      embedded_samples: 2,
      skipped_samples: 1,
      failed_samples: 0,
    },
    deltas: {
      persist_total: { avg: 2.5 },
      dropped_nodes: { max: 8 },
    },
    ...overrides,
  };
}

test("isRollupSummary validates payload shape", () => {
  assert.equal(isRollupSummary(null), false);
  assert.equal(isRollupSummary({ ok: true }), false);
  assert.equal(isRollupSummary(rollupPayload()), true);
});

test("buildTelemetryHistory summarizes run series", () => {
  const records = [
    {
      payload: rollupPayload({
        generated_at: "2026-02-28T00:00:00.000Z",
        run: { github_run_id: "1001" },
        totals: { samples: 3, embedded_samples: 2, skipped_samples: 1, failed_samples: 0 },
        deltas: { persist_total: { avg: 2 }, dropped_nodes: { max: 6 } },
      }),
      source_path: "/tmp/run_1001/summary.json",
      run_id_hint: "1001",
    },
    {
      payload: rollupPayload({
        generated_at: "2026-02-28T01:00:00.000Z",
        run: { github_run_id: "1002" },
        totals: { samples: 3, embedded_samples: 2, skipped_samples: 1, failed_samples: 1 },
        deltas: { persist_total: { avg: 3 }, dropped_nodes: { max: 10 } },
      }),
      source_path: "/tmp/run_1002/summary.json",
      run_id_hint: "1002",
    },
  ];

  const out = buildTelemetryHistory(records);
  assert.equal(out.runs_total, 2);
  assert.equal(out.runs_with_failures, 1);
  assert.equal(out.ok, false);
  assert.equal(out.latest?.run_id, "1002");
  assert.equal(out.stats.failed_samples.max, 1);
  assert.equal(out.stats.dropped_nodes_max.max, 10);
});

test("buildTelemetryHistory deduplicates same run id", () => {
  const payload = rollupPayload({
    run: { github_run_id: "2001" },
  });
  const out = buildTelemetryHistory([
    { payload, source_path: "/tmp/a/summary.json", run_id_hint: "2001" },
    { payload: { ...payload }, source_path: "/tmp/b/summary.json", run_id_hint: "2001" },
  ]);
  assert.equal(out.runs_total, 1);
  assert.equal(out.series.length, 1);
});
