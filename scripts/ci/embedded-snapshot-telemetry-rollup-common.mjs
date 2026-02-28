function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function percentile(sortedValues, p) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * p)));
  return sortedValues[idx];
}

function summarizeNumbers(values) {
  const nums = values.map(numberOrNull).filter((v) => typeof v === "number");
  if (nums.length === 0) {
    return {
      count: 0,
      min: null,
      p50: null,
      p95: null,
      max: null,
      avg: null,
    };
  }
  const sorted = nums.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, x) => acc + x, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    avg: Number((sum / sorted.length).toFixed(6)),
  };
}

export function isTelemetryRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (typeof record.ok !== "boolean") return false;
  if (!Object.prototype.hasOwnProperty.call(record, "checks")) return false;
  if (Object.prototype.hasOwnProperty.call(record, "delta")) return true;
  if (record.skipped === true) return true;
  return false;
}

export function buildTelemetryRollup(records) {
  const telemetryRecords = (Array.isArray(records) ? records : []).filter(isTelemetryRecord);
  const dedupedRecords = [];
  const seen = new Set();
  for (const rec of telemetryRecords) {
    const key = JSON.stringify({
      profile: rec.profile ?? null,
      backend: rec.backend ?? null,
      generated_at: rec.generated_at ?? null,
      ok: rec.ok,
      skipped: rec.skipped === true,
      failed_checks: Array.isArray(rec.failed_checks) ? rec.failed_checks.slice().sort() : [],
      delta: rec.delta ?? null,
      checks_count: Array.isArray(rec.checks) ? rec.checks.length : 0,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRecords.push(rec);
  }
  const byProfile = new Map();
  const failures = [];
  const persistDelta = [];
  const bytesAfterMinusBefore = [];
  const droppedNodes = [];
  const persistFailuresDelta = [];
  const loadQuarantinedDelta = [];

  let skippedCount = 0;
  let embeddedCount = 0;
  let failedCount = 0;

  for (const rec of dedupedRecords) {
    const profile = typeof rec.profile === "string" && rec.profile.length > 0 ? rec.profile : "unknown";
    if (!byProfile.has(profile)) {
      byProfile.set(profile, {
        profile,
        samples: 0,
        skipped: 0,
        failed: 0,
        latest_generated_at: null,
      });
    }
    const row = byProfile.get(profile);
    row.samples += 1;
    if (typeof rec.generated_at === "string") {
      if (!row.latest_generated_at || rec.generated_at > row.latest_generated_at) {
        row.latest_generated_at = rec.generated_at;
      }
    }

    if (rec.skipped === true) {
      skippedCount += 1;
      row.skipped += 1;
      continue;
    }

    embeddedCount += 1;
    if (rec.ok === false) {
      failedCount += 1;
      row.failed += 1;
      failures.push({
        profile,
        backend: rec.backend ?? null,
        failed_checks: Array.isArray(rec.failed_checks) ? rec.failed_checks.slice() : [],
      });
    }

    if (rec.delta && typeof rec.delta === "object") {
      persistDelta.push(rec.delta.persist_total);
      bytesAfterMinusBefore.push(rec.delta.bytes_after_minus_before);
      persistFailuresDelta.push(rec.delta.persist_failures_total);
      loadQuarantinedDelta.push(rec.delta.load_quarantined_total);
    }

    if (rec.after?.last_compaction && typeof rec.after.last_compaction === "object") {
      droppedNodes.push(rec.after.last_compaction.dropped_nodes);
    }
  }

  const profiles = Array.from(byProfile.values()).sort((a, b) => a.profile.localeCompare(b.profile));
  const ok = failedCount === 0;

  return {
    ok,
    generated_at: new Date().toISOString(),
    totals: {
      samples: dedupedRecords.length,
      embedded_samples: embeddedCount,
      skipped_samples: skippedCount,
      failed_samples: failedCount,
    },
    profiles,
    deltas: {
      persist_total: summarizeNumbers(persistDelta),
      bytes_after_minus_before: summarizeNumbers(bytesAfterMinusBefore),
      persist_failures_total: summarizeNumbers(persistFailuresDelta),
      load_quarantined_total: summarizeNumbers(loadQuarantinedDelta),
      dropped_nodes: summarizeNumbers(droppedNodes),
    },
    failures,
  };
}
