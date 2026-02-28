function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toSnapshotView(metrics) {
  const compaction = asObject(metrics.last_compaction);
  return {
    persist_total: numberOrNull(metrics.persist_total),
    persist_failures_total: numberOrNull(metrics.persist_failures_total),
    load_quarantined_total: numberOrNull(metrics.load_quarantined_total),
    last_bytes_before_compaction: numberOrNull(metrics.last_bytes_before_compaction),
    last_bytes_after_compaction: numberOrNull(metrics.last_bytes_after_compaction),
    last_over_limit_after_compaction: Boolean(metrics.last_over_limit_after_compaction),
    last_compaction: {
      applied: compaction.applied === true,
      rounds: numberOrNull(compaction.rounds),
      trimmed_payload_nodes: numberOrNull(compaction.trimmed_payload_nodes),
      dropped_audit: numberOrNull(compaction.dropped_audit),
      dropped_nodes: numberOrNull(compaction.dropped_nodes),
      dropped_edges: numberOrNull(compaction.dropped_edges),
      dropped_rule_defs: numberOrNull(compaction.dropped_rule_defs),
    },
    runtime_nodes: numberOrNull(metrics.runtime_nodes),
    runtime_edges: numberOrNull(metrics.runtime_edges),
    runtime_rule_defs: numberOrNull(metrics.runtime_rule_defs),
    runtime_audit_rows: numberOrNull(metrics.runtime_audit_rows),
    last_persist_at: typeof metrics.last_persist_at === "string" ? metrics.last_persist_at : null,
    last_error: typeof metrics.last_error === "string" ? metrics.last_error : null,
  };
}

function makeCheck(name, ok, detail) {
  return {
    name,
    ok,
    detail,
  };
}

function pushCheck(state, check) {
  state.checks.push(check);
  if (!check.ok) state.ok = false;
}

export function buildEmbeddedSnapshotTelemetry({
  beforeHealth,
  afterHealth,
  maxDroppedNodesGuard = 32,
  maxPersistFailuresDeltaGuard = 0,
  maxLoadQuarantinedDeltaGuard = 0,
}) {
  const before = asObject(beforeHealth);
  const after = asObject(afterHealth);
  const backend = String(after.memory_store_backend || before.memory_store_backend || "");
  const generatedAt = new Date().toISOString();

  if (backend !== "embedded") {
    return {
      ok: true,
      skipped: true,
      backend,
      generated_at: generatedAt,
      reason: "backend_not_embedded",
      checks: [],
    };
  }

  const beforeMetrics = toSnapshotView(asObject(before.memory_store_embedded_snapshot_metrics));
  const afterMetrics = toSnapshotView(asObject(after.memory_store_embedded_snapshot_metrics));
  const maxRounds = numberOrDefault(after.memory_store_embedded_snapshot_compaction_max_rounds, 8);
  const maxBytes = numberOrDefault(after.memory_store_embedded_snapshot_max_bytes, 0);

  const state = {
    ok: true,
    checks: [],
  };

  const beforePersist = beforeMetrics.persist_total;
  const afterPersist = afterMetrics.persist_total;
  pushCheck(
    state,
    makeCheck(
      "persist_total_advance",
      typeof beforePersist === "number" &&
        typeof afterPersist === "number" &&
        afterPersist >= beforePersist + 1,
      {
        before: beforePersist,
        after: afterPersist,
        min_expected_after: typeof beforePersist === "number" ? beforePersist + 1 : null,
      },
    ),
  );

  const beforeFailures = beforeMetrics.persist_failures_total;
  const afterFailures = afterMetrics.persist_failures_total;
  const persistFailureDelta =
    typeof beforeFailures === "number" && typeof afterFailures === "number" ? afterFailures - beforeFailures : null;
  pushCheck(
    state,
    makeCheck(
      "persist_failures_delta_guard",
      typeof persistFailureDelta === "number" && persistFailureDelta <= maxPersistFailuresDeltaGuard,
      {
        before: beforeFailures,
        after: afterFailures,
        delta: persistFailureDelta,
        max_allowed: maxPersistFailuresDeltaGuard,
      },
    ),
  );

  const beforeQuarantined = beforeMetrics.load_quarantined_total;
  const afterQuarantined = afterMetrics.load_quarantined_total;
  const quarantinedDelta =
    typeof beforeQuarantined === "number" && typeof afterQuarantined === "number"
      ? afterQuarantined - beforeQuarantined
      : null;
  pushCheck(
    state,
    makeCheck(
      "load_quarantined_delta_guard",
      typeof quarantinedDelta === "number" && quarantinedDelta <= maxLoadQuarantinedDeltaGuard,
      {
        before: beforeQuarantined,
        after: afterQuarantined,
        delta: quarantinedDelta,
        max_allowed: maxLoadQuarantinedDeltaGuard,
      },
    ),
  );

  const bytesBefore = afterMetrics.last_bytes_before_compaction;
  const bytesAfter = afterMetrics.last_bytes_after_compaction;
  pushCheck(
    state,
    makeCheck(
      "compaction_bytes_present",
      typeof bytesBefore === "number" && typeof bytesAfter === "number",
      {
        bytes_before: bytesBefore,
        bytes_after: bytesAfter,
      },
    ),
  );
  pushCheck(
    state,
    makeCheck(
      "compaction_non_growth",
      typeof bytesBefore === "number" && typeof bytesAfter === "number" && bytesAfter <= bytesBefore,
      {
        bytes_before: bytesBefore,
        bytes_after: bytesAfter,
      },
    ),
  );

  const rounds = afterMetrics.last_compaction.rounds;
  pushCheck(
    state,
    makeCheck(
      "compaction_rounds_guard",
      typeof rounds === "number" && rounds <= maxRounds,
      {
        rounds,
        max_allowed: maxRounds,
      },
    ),
  );

  const applied = afterMetrics.last_compaction.applied;
  pushCheck(
    state,
    makeCheck(
      "compaction_applied_when_over_limit",
      typeof bytesBefore === "number" && (bytesBefore <= maxBytes || applied === true),
      {
        bytes_before: bytesBefore,
        max_bytes: maxBytes,
        applied,
      },
    ),
  );

  const droppedNodes = afterMetrics.last_compaction.dropped_nodes;
  pushCheck(
    state,
    makeCheck(
      "dropped_nodes_guard",
      typeof droppedNodes === "number" && droppedNodes <= maxDroppedNodesGuard,
      {
        dropped_nodes: droppedNodes,
        max_allowed: maxDroppedNodesGuard,
      },
    ),
  );

  return {
    ok: state.ok,
    skipped: false,
    backend,
    generated_at: generatedAt,
    thresholds: {
      max_rounds: maxRounds,
      max_bytes: maxBytes,
      max_dropped_nodes: maxDroppedNodesGuard,
      max_persist_failures_delta: maxPersistFailuresDeltaGuard,
      max_load_quarantined_delta: maxLoadQuarantinedDeltaGuard,
    },
    before: beforeMetrics,
    after: afterMetrics,
    delta: {
      persist_total:
        typeof beforePersist === "number" && typeof afterPersist === "number" ? afterPersist - beforePersist : null,
      persist_failures_total: persistFailureDelta,
      load_quarantined_total: quarantinedDelta,
      bytes_after_minus_before:
        typeof bytesBefore === "number" && typeof bytesAfter === "number" ? bytesAfter - bytesBefore : null,
    },
    checks: state.checks,
    failed_checks: state.checks.filter((x) => !x.ok).map((x) => x.name),
  };
}
