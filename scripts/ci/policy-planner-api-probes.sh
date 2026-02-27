#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${AIONIS_BASE_URL:-http://127.0.0.1:${PORT:-3001}}"
SCOPE="${POLICY_PLANNER_PROBE_SCOPE:-default}"
TENANT_ID="${POLICY_PLANNER_PROBE_TENANT_ID:-default}"

node - "${BASE_URL}" "${SCOPE}" "${TENANT_ID}" <<'NODE'
const [baseUrl, scope, tenantId] = process.argv.slice(2);

const apiKey = String(process.env.API_KEY || process.env.PERF_API_KEY || "").trim();
const authBearer = String(process.env.AUTH_BEARER || process.env.PERF_AUTH_BEARER || "").trim();

const ensure = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function buildHeaders() {
  const headers = { "content-type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (authBearer) headers.authorization = `Bearer ${authBearer}`;
  return headers;
}

async function postJson(path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`policy-planner-api-probes: ${path} must return JSON`);
  }
  return { status: res.status, body };
}

const context = {
  intent: "json",
  provider: "minimax",
  tool: { name: "curl" },
  agent: { id: "ci-agent", team_id: "ci-team" },
};
const candidates = ["psql", "curl", "bash"];
const runId = `policy_planner_probe_${Date.now()}`;

async function probeRulesEvaluate() {
  const out = await postJson("/v1/memory/rules/evaluate", {
    tenant_id: tenantId,
    scope,
    context,
    include_shadow: false,
    limit: 50,
  });
  ensure(out.status === 200, `policy-planner-api-probes: rules/evaluate must return 200 (got ${out.status})`);
  ensure(typeof out.body?.considered === "number", "policy-planner-api-probes: rules/evaluate missing considered");
  ensure(typeof out.body?.matched === "number", "policy-planner-api-probes: rules/evaluate missing matched");
  ensure(Array.isArray(out.body?.active), "policy-planner-api-probes: rules/evaluate missing active[]");
  ensure(Array.isArray(out.body?.shadow), "policy-planner-api-probes: rules/evaluate missing shadow[]");
  ensure(out.body?.applied && typeof out.body.applied === "object", "policy-planner-api-probes: rules/evaluate missing applied");
  ensure(
    out.body?.agent_visibility_summary && typeof out.body.agent_visibility_summary === "object",
    "policy-planner-api-probes: rules/evaluate missing agent_visibility_summary",
  );
  return out.body;
}

async function probeToolsSelect() {
  const out = await postJson("/v1/memory/tools/select", {
    tenant_id: tenantId,
    scope,
    context,
    candidates,
    include_shadow: false,
    rules_limit: 50,
    strict: false,
    run_id: runId,
  });
  ensure(out.status === 200, `policy-planner-api-probes: tools/select must return 200 (got ${out.status})`);
  ensure(out.body?.selection && typeof out.body.selection === "object", "policy-planner-api-probes: tools/select missing selection");
  ensure(Array.isArray(out.body.selection?.ordered), "policy-planner-api-probes: tools/select missing selection.ordered[]");
  ensure(out.body?.rules && typeof out.body.rules === "object", "policy-planner-api-probes: tools/select missing rules");
  if (out.body.selection?.selected != null) {
    ensure(
      candidates.includes(String(out.body.selection.selected)),
      "policy-planner-api-probes: tools/select selected tool must be in candidates",
    );
  }
  return out.body;
}

async function probePlanningContext() {
  const out = await postJson("/v1/memory/planning/context", {
    tenant_id: tenantId,
    scope,
    query_text: "policy planner parity probe",
    context,
    include_shadow: false,
    rules_limit: 50,
    tool_candidates: candidates,
    tool_strict: false,
    run_id: runId,
    return_debug: false,
    include_embeddings: false,
    include_meta: false,
    include_slots: false,
    include_slots_preview: false,
  });

  if (out.status === 400 && out.body?.error === "no_embedding_provider") {
    return { skipped: true, reason: "no_embedding_provider", status: out.status, body: out.body };
  }

  ensure(out.status === 200, `policy-planner-api-probes: planning/context must return 200 (got ${out.status})`);
  ensure(out.body?.query && typeof out.body.query === "object", "policy-planner-api-probes: planning/context missing query");
  ensure(
    typeof out.body.query.embedding_provider === "string" && out.body.query.embedding_provider.length > 0,
    "policy-planner-api-probes: planning/context missing query.embedding_provider",
  );
  ensure(out.body?.recall && typeof out.body.recall === "object", "policy-planner-api-probes: planning/context missing recall");
  ensure(
    Array.isArray(out.body?.recall?.subgraph?.nodes),
    "policy-planner-api-probes: planning/context missing recall.subgraph.nodes[]",
  );
  ensure(out.body?.rules && typeof out.body.rules === "object", "policy-planner-api-probes: planning/context missing rules");
  ensure(out.body?.tools && typeof out.body.tools === "object", "policy-planner-api-probes: planning/context missing tools");
  ensure(
    out.body?.tools?.selection && typeof out.body.tools.selection === "object",
    "policy-planner-api-probes: planning/context missing tools.selection",
  );
  return { skipped: false, status: out.status, body: out.body };
}

(async () => {
  const rules = await probeRulesEvaluate();
  const tools = await probeToolsSelect();
  const planning = await probePlanningContext();

  if (!planning.skipped) {
    ensure(
      Number(planning.body.rules?.considered ?? -1) === Number(rules.considered ?? -2),
      "policy-planner-api-probes: planning.rules.considered must match rules/evaluate",
    );
    ensure(
      Number(planning.body.rules?.matched ?? -1) === Number(rules.matched ?? -2),
      "policy-planner-api-probes: planning.rules.matched must match rules/evaluate",
    );
    const directSelected = tools.selection?.selected ?? null;
    const planningSelected = planning.body.tools?.selection?.selected ?? null;
    ensure(
      String(directSelected ?? "") === String(planningSelected ?? ""),
      "policy-planner-api-probes: planning.tools.selection.selected must match tools/select",
    );
  }

  const out = {
    ok: true,
    base_url: baseUrl,
    tenant_id: tenantId,
    scope,
    requests: {
      rules_evaluate: { include_shadow: false, limit: 50 },
      tools_select: { include_shadow: false, rules_limit: 50, strict: false, candidates_count: candidates.length },
      planning_context: { include_shadow: false, rules_limit: 50, tool_candidates_count: candidates.length, tool_strict: false },
    },
    results: {
      rules: {
        considered: Number(rules.considered ?? 0),
        matched: Number(rules.matched ?? 0),
      },
      tools: {
        selected: tools.selection?.selected ?? null,
        ordered_count: Array.isArray(tools.selection?.ordered) ? tools.selection.ordered.length : 0,
      },
      planning: planning.skipped
        ? {
            skipped: true,
            reason: planning.reason,
            status: planning.status,
          }
        : {
            skipped: false,
            selected: planning.body.tools?.selection?.selected ?? null,
            recall_nodes: Array.isArray(planning.body.recall?.subgraph?.nodes)
              ? planning.body.recall.subgraph.nodes.length
              : 0,
            rules_considered: Number(planning.body.rules?.considered ?? 0),
            rules_matched: Number(planning.body.rules?.matched ?? 0),
          },
    },
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
