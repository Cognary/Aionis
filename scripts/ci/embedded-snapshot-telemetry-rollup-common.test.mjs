import assert from "node:assert/strict";
import test from "node:test";

import { buildTelemetryRollup, isTelemetryRecord } from "./embedded-snapshot-telemetry-rollup-common.mjs";

function telemetrySample(overrides = {}) {
  return {
    ok: true,
    skipped: false,
    backend: "embedded",
    profile: "embedded_feature_enabled",
    generated_at: "2026-02-28T00:00:00.000Z",
    after: {
      last_compaction: {
        dropped_nodes: 7,
      },
    },
    delta: {
      persist_total: 3,
      persist_failures_total: 0,
      load_quarantined_total: 0,
      bytes_after_minus_before: -2000,
    },
    checks: [],
    failed_checks: [],
    ...overrides,
  };
}

test("isTelemetryRecord validates minimum shape", () => {
  assert.equal(isTelemetryRecord(null), false);
  assert.equal(isTelemetryRecord({ ok: true }), false);
  assert.equal(isTelemetryRecord({ ok: true, checks: [], delta: {} }), true);
  assert.equal(isTelemetryRecord({ ok: true, checks: [], skipped: true, reason: "backend_not_embedded" }), true);
  assert.equal(isTelemetryRecord({ ok: true, checks: [], skipped: false }), false);
});

test("buildTelemetryRollup summarizes passing telemetry records", () => {
  const records = [
    telemetrySample({
      profile: "embedded_capability_off",
      delta: {
        persist_total: 2,
        persist_failures_total: 0,
        load_quarantined_total: 0,
        bytes_after_minus_before: -1000,
      },
      after: { last_compaction: { dropped_nodes: 3 } },
    }),
    telemetrySample({
      profile: "embedded_feature_enabled",
      delta: {
        persist_total: 4,
        persist_failures_total: 0,
        load_quarantined_total: 0,
        bytes_after_minus_before: -1500,
      },
      after: { last_compaction: { dropped_nodes: 6 } },
    }),
  ];

  const out = buildTelemetryRollup(records);
  assert.equal(out.ok, true);
  assert.equal(out.totals.samples, 2);
  assert.equal(out.totals.failed_samples, 0);
  assert.equal(out.deltas.persist_total.min, 2);
  assert.equal(out.deltas.persist_total.max, 4);
  assert.equal(out.deltas.dropped_nodes.max, 6);
  assert.equal(Array.isArray(out.profiles), true);
  assert.equal(out.profiles.length, 2);
});

test("buildTelemetryRollup captures failures + skipped rows", () => {
  const records = [
    telemetrySample({
      ok: false,
      profile: "embedded_capability_off",
      failed_checks: ["dropped_nodes_guard"],
    }),
    telemetrySample({
      skipped: true,
      backend: "postgres",
      profile: "postgres",
      delta: {
        persist_total: null,
        persist_failures_total: null,
        load_quarantined_total: null,
        bytes_after_minus_before: null,
      },
    }),
  ];

  const out = buildTelemetryRollup(records);
  assert.equal(out.ok, false);
  assert.equal(out.totals.samples, 2);
  assert.equal(out.totals.failed_samples, 1);
  assert.equal(out.totals.skipped_samples, 1);
  assert.equal(out.failures.length, 1);
  assert.equal(out.failures[0].profile, "embedded_capability_off");
  assert.deepEqual(out.failures[0].failed_checks, ["dropped_nodes_guard"]);
});

test("buildTelemetryRollup deduplicates identical telemetry payloads", () => {
  const sample = telemetrySample({
    profile: "embedded_feature_enabled",
    generated_at: "2026-02-28T05:00:00.000Z",
  });
  const out = buildTelemetryRollup([sample, { ...sample }]);
  assert.equal(out.totals.samples, 1);
  assert.equal(out.profiles.length, 1);
  assert.equal(out.profiles[0].samples, 1);
});
