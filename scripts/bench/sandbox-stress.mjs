import { randomUUID } from "node:crypto";
import { buildAuthHeaders, ensure, envString, postJson, toProbeFailure, writeJson } from "../ci/probe-common.mjs";

const label = "sandbox-stress";
const baseUrl = envString("AIONIS_BASE_URL", `http://127.0.0.1:${envString("PORT", "3001")}`);
const tenantId = envString("SANDBOX_STRESS_TENANT_ID", "default");
const scopePrefix = envString("SANDBOX_STRESS_SCOPE", "default");
const scope = `${scopePrefix}_sandbox_stress_${Date.now().toString(36)}`;
const totalRuns = Math.max(1, Math.min(2000, Number(envString("SANDBOX_STRESS_RUNS", "50")) || 50));
const concurrency = Math.max(1, Math.min(128, Number(envString("SANDBOX_STRESS_CONCURRENCY", "8")) || 8));
const pollIntervalMs = Math.max(20, Math.min(5000, Number(envString("SANDBOX_STRESS_POLL_INTERVAL_MS", "80")) || 80));
const pollTimeoutMs = Math.max(1000, Math.min(600000, Number(envString("SANDBOX_STRESS_POLL_TIMEOUT_MS", "120000")) || 120000));

const headers = buildAuthHeaders({ includeAdmin: true, requireAdmin: false });
const TERMINAL = new Set(["succeeded", "failed", "canceled", "timeout"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoMs(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function pct(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[idx] || 0);
}

async function createSession() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/sessions",
    {
      tenant_id: tenantId,
      scope,
      profile: "restricted",
      ttl_seconds: 3600,
      metadata: { source: label },
    },
    headers,
    label,
  );
  if (out.status === 400 && out.body?.error === "sandbox_disabled") {
    return { skipped: true, reason: "sandbox_disabled", status: out.status };
  }
  ensure(out.status === 200, `${label}: sandbox/sessions must return 200 (got ${out.status})`);
  ensure(typeof out.body?.session?.session_id === "string", `${label}: sandbox/sessions missing session_id`);
  return { skipped: false, session_id: String(out.body.session.session_id) };
}

async function executeAsync(sessionId, index) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/execute",
    {
      tenant_id: tenantId,
      scope,
      session_id: sessionId,
      mode: "async",
      planner_run_id: `${label}_${index}`,
      decision_id: randomUUID(),
      action: {
        kind: "command",
        argv: ["echo", `${label}-${index}`],
      },
      metadata: {
        source: label,
        index,
      },
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: sandbox/execute must return 200 (got ${out.status})`);
  ensure(typeof out.body?.run?.run_id === "string", `${label}: sandbox/execute missing run_id`);
  return String(out.body.run.run_id);
}

async function fetchRun(runId) {
  return await postJson(
    baseUrl,
    "/v1/memory/sandbox/runs/get",
    {
      tenant_id: tenantId,
      scope,
      run_id: runId,
    },
    headers,
    label,
  );
}

async function workerPool(count, limit, fn) {
  let cursor = 0;
  const out = new Array(count);
  async function worker() {
    for (;;) {
      const idx = cursor;
      cursor += 1;
      if (idx >= count) return;
      out[idx] = await fn(idx);
    }
  }
  const jobs = [];
  for (let i = 0; i < Math.min(limit, count); i += 1) jobs.push(worker());
  await Promise.all(jobs);
  return out;
}

try {
  const session = await createSession();
  if (session.skipped) {
    writeJson(process.stdout, {
      ok: true,
      skipped: true,
      reason: session.reason,
      status: session.status,
      base_url: baseUrl,
    });
    process.exit(0);
  }

  const startedAt = Date.now();
  const runIds = await workerPool(totalRuns, concurrency, async (index) => executeAsync(session.session_id, index));

  const pending = new Set(runIds);
  const finalRows = [];
  while (pending.size > 0) {
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(`${label}: timed out while polling run completion`);
    }

    const batch = Array.from(pending).slice(0, Math.max(concurrency * 2, 20));
    const statuses = await Promise.all(batch.map((runId) => fetchRun(runId)));
    for (const out of statuses) {
      ensure(out.status === 200, `${label}: sandbox/runs/get must return 200 (got ${out.status})`);
      const run = out.body?.run;
      const runId = String(run?.run_id ?? "");
      const status = String(run?.status ?? "");
      if (!runId || !status) continue;
      if (TERMINAL.has(status)) {
        pending.delete(runId);
        finalRows.push(run);
      }
    }
    if (pending.size > 0) await sleep(pollIntervalMs);
  }

  const totalMs = Date.now() - startedAt;
  const statusCounts = {};
  const executorCounts = {};
  const queueWait = [];
  const runtime = [];
  const totalLatency = [];
  const errors = {};

  for (const run of finalRows) {
    const status = String(run?.status ?? "unknown");
    statusCounts[status] = Number(statusCounts[status] || 0) + 1;
    const execName = String(run?.result?.executor ?? "unknown");
    executorCounts[execName] = Number(executorCounts[execName] || 0) + 1;

    const created = isoMs(run?.created_at);
    const started = isoMs(run?.started_at);
    const finished = isoMs(run?.finished_at);
    const qMs = created !== null && started !== null ? Math.max(0, started - created) : 0;
    const rMs = started !== null && finished !== null ? Math.max(0, finished - started) : 0;
    const tMs = created !== null && finished !== null ? Math.max(0, finished - created) : qMs + rMs;
    queueWait.push(qMs);
    runtime.push(rMs);
    totalLatency.push(tMs);

    const err = String(run?.error ?? "").trim();
    if (err) errors[err] = Number(errors[err] || 0) + 1;
  }

  writeJson(process.stdout, {
    ok: true,
    skipped: false,
    base_url: baseUrl,
    tenant_id: tenantId,
    scope,
    session_id: session.session_id,
    config: {
      total_runs: totalRuns,
      concurrency,
      poll_interval_ms: pollIntervalMs,
      poll_timeout_ms: pollTimeoutMs,
    },
    totals: {
      wall_time_ms: totalMs,
      runs_completed: finalRows.length,
      runs_per_sec: totalMs > 0 ? Number((finalRows.length / (totalMs / 1000)).toFixed(3)) : 0,
    },
    statuses: statusCounts,
    executors: executorCounts,
    latency_ms: {
      queue_wait_p50: Number(pct(queueWait, 0.5).toFixed(3)),
      queue_wait_p95: Number(pct(queueWait, 0.95).toFixed(3)),
      runtime_p50: Number(pct(runtime, 0.5).toFixed(3)),
      runtime_p95: Number(pct(runtime, 0.95).toFixed(3)),
      total_p50: Number(pct(totalLatency, 0.5).toFixed(3)),
      total_p95: Number(pct(totalLatency, 0.95).toFixed(3)),
    },
    errors,
  });
} catch (err) {
  writeJson(process.stderr, toProbeFailure(err));
  process.exit(1);
}
