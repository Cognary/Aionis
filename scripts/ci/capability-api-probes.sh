#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:${PORT:-3001}}"
SCOPE="${CAPABILITY_PROBE_SCOPE:-default}"
TENANT_ID="${CAPABILITY_PROBE_TENANT_ID:-default}"
INCLUDE_SHADOW_SOFT_DEGRADE="${CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE:-auto}"
HEALTH_FILE="${CAPABILITY_PROBE_HEALTH_FILE:-/tmp/aionis_capability_probe_health.json}"

curl -fsS "${BASE_URL}/health" >"${HEALTH_FILE}"

node - "${BASE_URL}" "${SCOPE}" "${TENANT_ID}" "${INCLUDE_SHADOW_SOFT_DEGRADE}" "${HEALTH_FILE}" <<'NODE'
const fs = require("fs");

const [baseUrl, scope, tenantId, includeShadowModeRaw, healthFile] = process.argv.slice(2);
const adminToken = String(process.env.ADMIN_TOKEN || "").trim();

const ensure = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

if (!adminToken) {
  throw new Error("capability-api-probes: ADMIN_TOKEN is required");
}

const health = JSON.parse(fs.readFileSync(healthFile, "utf8"));
const backend = String(health.memory_store_backend || "");
const featureCaps = health.memory_store_feature_capabilities || {};
const writeCaps = health.memory_store_write_capabilities || {};
const contract = health.memory_store_capability_contract || {};

for (const key of ["sessions_graph", "packs_export", "packs_import"]) {
  ensure(typeof featureCaps[key] === "boolean", `capability-api-probes: /health missing feature capability ${key}`);
}
ensure(typeof writeCaps.shadow_mirror_v2 === "boolean", "capability-api-probes: /health missing write capability shadow_mirror_v2");

function parseIncludeShadowMode(raw) {
  const normalized = String(raw || "auto").trim().toLowerCase();
  if (normalized === "true") return "true";
  if (normalized === "false") return "false";
  return "auto";
}

const includeShadowMode = parseIncludeShadowMode(includeShadowModeRaw);

async function postJson(path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`capability-api-probes: ${path} must return JSON`);
  }
  return { status: res.status, body };
}

function assertCapabilityUnsupported(capability, status, body) {
  ensure(status === 501, `capability-api-probes: ${capability} disabled path must return 501`);
  ensure(body && body.error === "backend_capability_unsupported", `capability-api-probes: ${capability} disabled path must return backend_capability_unsupported`);
  ensure(body.details && body.details.capability === capability, `capability-api-probes: ${capability} disabled path must include details.capability`);
  const expectedFailureMode = contract?.[capability]?.failure_mode;
  ensure(
    typeof expectedFailureMode === "string" && body.details.failure_mode === expectedFailureMode,
    `capability-api-probes: ${capability} disabled path must include details.failure_mode from capability contract`,
  );
  ensure(body.details.degraded_mode === "feature_disabled", `capability-api-probes: ${capability} disabled path must include degraded_mode=feature_disabled`);
  ensure(body.details.fallback_applied === false, `capability-api-probes: ${capability} disabled path must include fallback_applied=false`);
}

async function probeSessionsGraph() {
  const out = await postJson("/v1/memory/sessions", {
    scope,
    actor: "ci",
    session_id: `capability_probe_session_${Date.now()}`,
    input_text: "capability probe session",
    auto_embed: false,
    memory_lane: "shared",
  });
  if (featureCaps.sessions_graph === true) {
    ensure(out.status === 200, `capability-api-probes: sessions_graph enabled path must return 200 (got ${out.status})`);
    ensure(typeof out.body?.session_id === "string", "capability-api-probes: sessions_graph enabled path must include session_id");
    return;
  }
  assertCapabilityUnsupported("sessions_graph", out.status, out.body);
}

async function probePacksExport() {
  const out = await postJson("/v1/memory/packs/export", {
    scope,
    include_nodes: false,
    include_edges: false,
    include_commits: false,
    include_meta: false,
    max_rows: 1,
  });
  if (featureCaps.packs_export === true) {
    ensure(out.status === 200, `capability-api-probes: packs_export enabled path must return 200 (got ${out.status})`);
    ensure(
      typeof out.body?.manifest?.sha256 === "string" && out.body.manifest.sha256.length > 0,
      "capability-api-probes: packs_export enabled path must include manifest.sha256",
    );
    return;
  }
  assertCapabilityUnsupported("packs_export", out.status, out.body);
}

async function probePacksImport() {
  const out = await postJson("/v1/memory/packs/import", {
    scope,
    actor: "ci",
    verify_only: true,
    auto_embed: false,
    pack: {
      version: "aionis_pack_v1",
      tenant_id: tenantId,
      scope,
      nodes: [],
      edges: [],
      commits: [],
    },
  });
  if (featureCaps.packs_import === true) {
    ensure(out.status === 200, `capability-api-probes: packs_import enabled path must return 200 (got ${out.status})`);
    ensure(out.body?.verified === true, "capability-api-probes: packs_import enabled path must include verified=true");
    ensure(out.body?.imported === false, "capability-api-probes: packs_import enabled verify_only path must include imported=false");
    return;
  }
  assertCapabilityUnsupported("packs_import", out.status, out.body);
}

async function probeShadowSoftDegrade() {
  const out = await postJson("/v1/memory/write", {
    scope,
    actor: "ci",
    input_text: "capability probe shadow soft-degrade",
    auto_embed: false,
    nodes: [
      {
        client_id: `capability_probe_shadow_${Date.now()}`,
        type: "event",
        text_summary: "capability probe shadow soft-degrade",
      },
    ],
    edges: [],
  });
  ensure(out.status === 200, `capability-api-probes: shadow soft-degrade probe must return 200 (got ${out.status})`);
  const sdw = out.body?.shadow_dual_write;
  ensure(sdw && typeof sdw === "object", "capability-api-probes: shadow soft-degrade must include shadow_dual_write");
  ensure(sdw.enabled === true, "capability-api-probes: shadow soft-degrade enabled must be true");
  ensure(sdw.strict === false, "capability-api-probes: shadow soft-degrade strict must be false");
  ensure(sdw.mirrored === false, "capability-api-probes: shadow soft-degrade mirrored must be false");
  ensure(sdw.capability === "shadow_mirror_v2", "capability-api-probes: shadow soft-degrade capability must be shadow_mirror_v2");
  ensure(sdw.failure_mode === "soft_degrade", "capability-api-probes: shadow soft-degrade failure_mode must be soft_degrade");
  ensure(sdw.degraded_mode === "capability_unsupported", "capability-api-probes: shadow soft-degrade degraded_mode must be capability_unsupported");
  ensure(sdw.fallback_applied === true, "capability-api-probes: shadow soft-degrade fallback_applied must be true");
}

(async () => {
  await probeSessionsGraph();
  await probePacksExport();
  await probePacksImport();

  const shouldProbeShadow =
    includeShadowMode === "true" ||
    (includeShadowMode === "auto" && backend === "embedded" && writeCaps.shadow_mirror_v2 === false);

  if (shouldProbeShadow) {
    await probeShadowSoftDegrade();
  }

  const out = {
    ok: true,
    backend,
    scope,
    tenant_id: tenantId,
    include_shadow_soft_degrade: shouldProbeShadow,
    feature_capabilities: featureCaps,
    write_capabilities: writeCaps,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
})().catch((err) => {
  const out = {
    ok: false,
    error: String((err && err.name) || "Error"),
    message: String((err && err.message) || err),
  };
  process.stderr.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(1);
});
NODE
