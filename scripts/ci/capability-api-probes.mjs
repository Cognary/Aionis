import fs from "node:fs";
import { buildAuthHeaders, ensure, envString, getJson, parseTriState, postJson, toProbeFailure, writeJson } from "./probe-common.mjs";

const label = "capability-api-probes";
const baseUrl = envString("AIONIS_BASE_URL", `http://127.0.0.1:${envString("PORT", "3001")}`);
const scope = envString("CAPABILITY_PROBE_SCOPE", "default");
const tenantId = envString("CAPABILITY_PROBE_TENANT_ID", "default");
const includeShadowMode = parseTriState(envString("CAPABILITY_PROBE_INCLUDE_SHADOW_SOFT_DEGRADE", "auto"));
const healthFile = envString("CAPABILITY_PROBE_HEALTH_FILE", "/tmp/aionis_capability_probe_health.json");

const headers = buildAuthHeaders({ includeAdmin: true, requireAdmin: true });

async function fetchHealth() {
  const out = await getJson(baseUrl, "/health", headers, label);
  ensure(out.status === 200, `${label}: /health must return 200 (got ${out.status})`);
  fs.writeFileSync(healthFile, JSON.stringify(out.body, null, 2));
  return out.body;
}

function assertCapabilityUnsupported(capability, status, body, contract) {
  ensure(status === 501, `${label}: ${capability} disabled path must return 501`);
  ensure(body && body.error === "backend_capability_unsupported", `${label}: ${capability} disabled path must return backend_capability_unsupported`);
  ensure(body.details && body.details.capability === capability, `${label}: ${capability} disabled path must include details.capability`);
  const expectedFailureMode = contract?.[capability]?.failure_mode;
  ensure(
    typeof expectedFailureMode === "string" && body.details.failure_mode === expectedFailureMode,
    `${label}: ${capability} disabled path must include details.failure_mode from capability contract`,
  );
  ensure(body.details.degraded_mode === "feature_disabled", `${label}: ${capability} disabled path must include degraded_mode=feature_disabled`);
  ensure(body.details.fallback_applied === false, `${label}: ${capability} disabled path must include fallback_applied=false`);
}

async function probeSessionsGraph(featureCaps, contract) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/sessions",
    {
      scope,
      actor: "ci",
      session_id: `capability_probe_session_${Date.now()}`,
      input_text: "capability probe session",
      auto_embed: false,
      memory_lane: "shared",
    },
    headers,
    label,
  );

  if (featureCaps.sessions_graph === true) {
    ensure(out.status === 200, `${label}: sessions_graph enabled path must return 200 (got ${out.status})`);
    ensure(typeof out.body?.session_id === "string", `${label}: sessions_graph enabled path must include session_id`);
    return;
  }
  assertCapabilityUnsupported("sessions_graph", out.status, out.body, contract);
}

async function probePacksExport(featureCaps, contract) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/packs/export",
    {
      scope,
      include_nodes: false,
      include_edges: false,
      include_commits: false,
      include_meta: false,
      max_rows: 1,
    },
    headers,
    label,
  );
  if (featureCaps.packs_export === true) {
    ensure(out.status === 200, `${label}: packs_export enabled path must return 200 (got ${out.status})`);
    ensure(
      typeof out.body?.manifest?.sha256 === "string" && out.body.manifest.sha256.length > 0,
      `${label}: packs_export enabled path must include manifest.sha256`,
    );
    return;
  }
  assertCapabilityUnsupported("packs_export", out.status, out.body, contract);
}

async function probePacksImport(featureCaps, contract) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/packs/import",
    {
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
    },
    headers,
    label,
  );
  if (featureCaps.packs_import === true) {
    ensure(out.status === 200, `${label}: packs_import enabled path must return 200 (got ${out.status})`);
    ensure(out.body?.verified === true, `${label}: packs_import enabled path must include verified=true`);
    ensure(out.body?.imported === false, `${label}: packs_import enabled verify_only path must include imported=false`);
    return;
  }
  assertCapabilityUnsupported("packs_import", out.status, out.body, contract);
}

async function probeShadowSoftDegrade() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/write",
    {
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
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: shadow soft-degrade probe must return 200 (got ${out.status})`);
  const sdw = out.body?.shadow_dual_write;
  ensure(sdw && typeof sdw === "object", `${label}: shadow soft-degrade must include shadow_dual_write`);
  ensure(sdw.enabled === true, `${label}: shadow soft-degrade enabled must be true`);
  ensure(sdw.strict === false, `${label}: shadow soft-degrade strict must be false`);
  ensure(sdw.mirrored === false, `${label}: shadow soft-degrade mirrored must be false`);
  ensure(sdw.capability === "shadow_mirror_v2", `${label}: shadow soft-degrade capability must be shadow_mirror_v2`);
  ensure(sdw.failure_mode === "soft_degrade", `${label}: shadow soft-degrade failure_mode must be soft_degrade`);
  ensure(sdw.degraded_mode === "capability_unsupported", `${label}: shadow soft-degrade degraded_mode must be capability_unsupported`);
  ensure(sdw.fallback_applied === true, `${label}: shadow soft-degrade fallback_applied must be true`);
}

try {
  const health = await fetchHealth();
  const backend = String(health.memory_store_backend || "");
  const featureCaps = health.memory_store_feature_capabilities || {};
  const writeCaps = health.memory_store_write_capabilities || {};
  const contract = health.memory_store_capability_contract || {};

  for (const key of ["sessions_graph", "packs_export", "packs_import"]) {
    ensure(typeof featureCaps[key] === "boolean", `${label}: /health missing feature capability ${key}`);
  }
  ensure(typeof writeCaps.shadow_mirror_v2 === "boolean", `${label}: /health missing write capability shadow_mirror_v2`);

  await probeSessionsGraph(featureCaps, contract);
  await probePacksExport(featureCaps, contract);
  await probePacksImport(featureCaps, contract);

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
  writeJson(process.stdout, out);
} catch (err) {
  const out = toProbeFailure(err);
  writeJson(process.stderr, out);
  process.exit(1);
}
