import assert from "node:assert/strict";
import test from "node:test";

import { buildEmbeddedSnapshotTelemetry } from "./embedded-snapshot-telemetry-common.mjs";

function makeMetrics(overrides = {}) {
  return {
    persist_total: 10,
    persist_failures_total: 0,
    load_quarantined_total: 0,
    last_persist_at: "2026-02-28T00:00:00.000Z",
    last_error: null,
    last_bytes_before_compaction: 14000,
    last_bytes_after_compaction: 10000,
    last_over_limit_after_compaction: false,
    last_compaction: {
      applied: true,
      rounds: 3,
      trimmed_payload_nodes: 2,
      dropped_audit: 0,
      dropped_nodes: 8,
      dropped_edges: 4,
      dropped_rule_defs: 0,
    },
    runtime_nodes: 40,
    runtime_edges: 20,
    runtime_rule_defs: 2,
    runtime_audit_rows: 10,
    ...overrides,
  };
}

function makeEmbeddedHealth(metrics, overrides = {}) {
  return {
    memory_store_backend: "embedded",
    memory_store_embedded_snapshot_compaction_max_rounds: 8,
    memory_store_embedded_snapshot_max_bytes: 12000,
    memory_store_embedded_snapshot_metrics: metrics,
    ...overrides,
  };
}

test("buildEmbeddedSnapshotTelemetry skips non-embedded backends", () => {
  const out = buildEmbeddedSnapshotTelemetry({
    beforeHealth: { memory_store_backend: "postgres" },
    afterHealth: { memory_store_backend: "postgres" },
  });
  assert.equal(out.ok, true);
  assert.equal(out.skipped, true);
  assert.equal(out.reason, "backend_not_embedded");
});

test("buildEmbeddedSnapshotTelemetry passes healthy embedded delta", () => {
  const before = makeEmbeddedHealth(
    makeMetrics({
      persist_total: 20,
      last_bytes_before_compaction: 15000,
      last_bytes_after_compaction: 12000,
    }),
  );
  const after = makeEmbeddedHealth(
    makeMetrics({
      persist_total: 21,
      last_bytes_before_compaction: 16000,
      last_bytes_after_compaction: 11000,
      last_compaction: {
        applied: true,
        rounds: 4,
        trimmed_payload_nodes: 3,
        dropped_audit: 0,
        dropped_nodes: 12,
        dropped_edges: 5,
        dropped_rule_defs: 0,
      },
    }),
  );
  const out = buildEmbeddedSnapshotTelemetry({
    beforeHealth: before,
    afterHealth: after,
    maxDroppedNodesGuard: 32,
    maxPersistFailuresDeltaGuard: 0,
    maxLoadQuarantinedDeltaGuard: 0,
  });

  assert.equal(out.ok, true);
  assert.equal(out.skipped, false);
  assert.deepEqual(out.failed_checks, []);
});

test("buildEmbeddedSnapshotTelemetry fails dropped-nodes guard", () => {
  const before = makeEmbeddedHealth(makeMetrics({ persist_total: 1 }));
  const after = makeEmbeddedHealth(
    makeMetrics({
      persist_total: 2,
      last_compaction: {
        applied: true,
        rounds: 2,
        trimmed_payload_nodes: 1,
        dropped_audit: 0,
        dropped_nodes: 50,
        dropped_edges: 1,
        dropped_rule_defs: 0,
      },
    }),
  );
  const out = buildEmbeddedSnapshotTelemetry({
    beforeHealth: before,
    afterHealth: after,
    maxDroppedNodesGuard: 32,
  });

  assert.equal(out.ok, false);
  assert.equal(out.failed_checks.includes("dropped_nodes_guard"), true);
});

test("buildEmbeddedSnapshotTelemetry fails persist-failure delta guard", () => {
  const before = makeEmbeddedHealth(makeMetrics({ persist_total: 4, persist_failures_total: 0 }));
  const after = makeEmbeddedHealth(makeMetrics({ persist_total: 5, persist_failures_total: 2 }));
  const out = buildEmbeddedSnapshotTelemetry({
    beforeHealth: before,
    afterHealth: after,
    maxPersistFailuresDeltaGuard: 0,
  });

  assert.equal(out.ok, false);
  assert.equal(out.failed_checks.includes("persist_failures_delta_guard"), true);
});
