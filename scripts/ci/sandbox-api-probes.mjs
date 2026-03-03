import { randomUUID } from "node:crypto";
import { buildAuthHeaders, ensure, envString, postJson, toProbeFailure, writeJson } from "./probe-common.mjs";

const label = "sandbox-api-probes";
const baseUrl = envString("AIONIS_BASE_URL", `http://127.0.0.1:${envString("PORT", "3001")}`);
const tenantId = envString("SANDBOX_PROBE_TENANT_ID", "default");
const scopePrefix = envString("SANDBOX_PROBE_SCOPE", "default");
const scope = `${scopePrefix}_sandbox_probe_${Date.now().toString(36)}`;
const headers = buildAuthHeaders({ includeAdmin: true, requireAdmin: false });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_STATUSES = new Set(["queued", "running", "succeeded", "failed", "canceled", "timeout"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled", "timeout"]);

function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

async function createSession() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/sessions",
    {
      tenant_id: tenantId,
      scope,
      profile: "restricted",
      ttl_seconds: 600,
      metadata: {
        source: label,
      },
    },
    headers,
    label,
  );
  if (out.status === 400 && out.body?.error === "sandbox_disabled") {
    return { skipped: true, reason: "sandbox_disabled", status: out.status, body: out.body };
  }
  if (out.status === 401 || out.status === 403) {
    return { skipped: true, reason: "sandbox_unauthorized", status: out.status, body: out.body };
  }

  ensure(out.status === 200, `${label}: sandbox/sessions must return 200 (got ${out.status})`);
  ensure(typeof out.body?.tenant_id === "string", `${label}: sandbox/sessions missing tenant_id`);
  ensure(typeof out.body?.scope === "string", `${label}: sandbox/sessions missing scope`);
  ensure(isUuid(out.body?.session?.session_id), `${label}: sandbox/sessions missing valid session_id`);

  return {
    skipped: false,
    session_id: String(out.body.session.session_id),
    tenant_id: String(out.body.tenant_id),
    scope: String(out.body.scope),
  };
}

async function executeOne(sessionId) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/execute",
    {
      tenant_id: tenantId,
      scope,
      project_id: "sandbox_probe_project",
      session_id: sessionId,
      mode: "sync",
      planner_run_id: `sandbox_probe_${Date.now().toString(36)}`,
      decision_id: randomUUID(),
      action: {
        kind: "command",
        argv: ["echo", "sandbox probe"],
      },
      metadata: {
        source: label,
      },
    },
    headers,
    label,
  );

  ensure(out.status === 200, `${label}: sandbox/execute must return 200 (got ${out.status})`);
  ensure(out.body?.run && typeof out.body.run === "object", `${label}: sandbox/execute missing run`);
  ensure(isUuid(out.body.run?.run_id), `${label}: sandbox/execute missing valid run_id`);
  ensure(isUuid(out.body.run?.session_id), `${label}: sandbox/execute missing valid run.session_id`);
  ensure(
    out.body.run?.project_id === "sandbox_probe_project" || out.body.run?.project_id === null,
    `${label}: sandbox/execute missing project_id`,
  );
  ensure(
    typeof out.body?.accepted === "boolean",
    `${label}: sandbox/execute missing accepted boolean`,
  );
  ensure(
    RUN_STATUSES.has(String(out.body.run?.status ?? "")),
    `${label}: sandbox/execute returned invalid status`,
  );

  return out.body;
}

async function getRun(runId) {
  const out = await postJson(
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
  ensure(out.status === 200, `${label}: sandbox/runs/get must return 200 (got ${out.status})`);
  ensure(out.body?.run && typeof out.body.run === "object", `${label}: sandbox/runs/get missing run`);
  ensure(
    RUN_STATUSES.has(String(out.body.run?.status ?? "")),
    `${label}: sandbox/runs/get returned invalid status`,
  );
  return out.body;
}

async function getLogs(runId) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/runs/logs",
    {
      tenant_id: tenantId,
      scope,
      run_id: runId,
      tail_bytes: 2048,
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: sandbox/runs/logs must return 200 (got ${out.status})`);
  ensure(out.body?.logs && typeof out.body.logs === "object", `${label}: sandbox/runs/logs missing logs`);
  ensure(typeof out.body.logs.stdout === "string", `${label}: sandbox/runs/logs missing logs.stdout`);
  ensure(typeof out.body.logs.stderr === "string", `${label}: sandbox/runs/logs missing logs.stderr`);
  ensure(typeof out.body.logs.truncated === "boolean", `${label}: sandbox/runs/logs missing logs.truncated`);
  return out.body;
}

async function getArtifact(runId) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/runs/artifact",
    {
      tenant_id: tenantId,
      scope,
      run_id: runId,
      tail_bytes: 2048,
      include_action: true,
      include_output: true,
      include_result: true,
      include_metadata: true,
      bundle_inline: false,
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: sandbox/runs/artifact must return 200 (got ${out.status})`);
  ensure(out.body?.artifact && typeof out.body.artifact === "object", `${label}: sandbox/runs/artifact missing artifact`);
  ensure(typeof out.body.artifact?.artifact_version === "string", `${label}: sandbox/runs/artifact missing artifact_version`);
  ensure(typeof out.body.artifact?.uri === "string", `${label}: sandbox/runs/artifact missing artifact uri`);
  ensure(
    typeof out.body.artifact?.bundle?.manifest_version === "string",
    `${label}: sandbox/runs/artifact missing bundle manifest`,
  );
  ensure(Array.isArray(out.body.artifact?.bundle?.objects), `${label}: sandbox/runs/artifact missing bundle objects`);
  return out.body;
}

async function cancelRun(runId) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sandbox/runs/cancel",
    {
      tenant_id: tenantId,
      scope,
      run_id: runId,
      reason: "probe_cleanup",
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: sandbox/runs/cancel must return 200 (got ${out.status})`);
  ensure(
    RUN_STATUSES.has(String(out.body?.status ?? "")),
    `${label}: sandbox/runs/cancel returned invalid status`,
  );
  ensure(typeof out.body?.cancel_requested === "boolean", `${label}: sandbox/runs/cancel missing cancel_requested`);
  return out.body;
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

  const execute = await executeOne(session.session_id);
  const runId = String(execute.run.run_id);

  const run = await getRun(runId);
  const logs = await getLogs(runId);
  const artifact = await getArtifact(runId);
  const cancel = await cancelRun(runId);

  writeJson(process.stdout, {
    ok: true,
    skipped: false,
    base_url: baseUrl,
    tenant_id: tenantId,
    scope,
    session_id: session.session_id,
    run_id: runId,
    run_status: run.run.status,
    run_terminal: TERMINAL_STATUSES.has(String(run.run.status ?? "")),
    cancel_status: cancel.status,
    logs_preview: {
      stdout_len: Number(logs.logs?.stdout?.length ?? 0),
      stderr_len: Number(logs.logs?.stderr?.length ?? 0),
      truncated: Boolean(logs.logs?.truncated),
    },
    artifact: {
      artifact_version: String(artifact.artifact?.artifact_version ?? ""),
      uri: String(artifact.artifact?.uri ?? ""),
      manifest_version: String(artifact.artifact?.bundle?.manifest_version ?? ""),
    },
  });
} catch (err) {
  writeJson(process.stderr, toProbeFailure(err));
  process.exit(1);
}
