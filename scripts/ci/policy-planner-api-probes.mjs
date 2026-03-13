import { randomUUID } from "node:crypto";
import { buildAuthHeaders, ensure, envString, getJson, postJson, toProbeFailure, writeJson } from "./probe-common.mjs";

const label = "policy-planner-api-probes";
const baseUrl = envString("AIONIS_BASE_URL", `http://127.0.0.1:${envString("PORT", "3001")}`);
const scopeSeed = Date.now().toString(36);
const scopePrefix = envString("POLICY_PLANNER_PROBE_SCOPE", "default");
const scope = `${scopePrefix}_policy_planner_probe_${scopeSeed}`;
const tenantId = envString("POLICY_PLANNER_PROBE_TENANT_ID", "default");
const headers = buildAuthHeaders({ includeAdmin: false, requireAdmin: false });
const adminHeaders = buildAuthHeaders({ includeAdmin: true, requireAdmin: false });
const hasAdminToken = typeof adminHeaders["x-admin-token"] === "string" && adminHeaders["x-admin-token"].trim().length > 0;

const context = {
  intent: "json",
  provider: "minimax",
  tool: { name: "curl" },
  agent: { id: "ci-agent", team_id: "ci-team" },
};
const candidates = [`probe_psql_${scopeSeed}`, `probe_curl_${scopeSeed}`, `probe_bash_${scopeSeed}`];
const runId = `policy_planner_probe_${Date.now()}`;
const ruleNodeId = randomUUID();

async function setupProbeRule() {
  const write = await postJson(
    baseUrl,
    "/v1/memory/write",
    {
      tenant_id: tenantId,
      scope,
      actor: "policy_planner_probe",
      input_text: "seed policy planner probe rule",
      auto_embed: false,
      nodes: [
        {
          id: ruleNodeId,
          type: "rule",
          memory_lane: "shared",
          text_summary: "policy planner probe rule",
          slots: {
            if: { intent: "json" },
            then: { tool: { allow: candidates } },
            exceptions: [],
          },
        },
      ],
      edges: [],
    },
    headers,
    label,
  );
  ensure(write.status === 200, `${label}: write probe rule must return 200 (got ${write.status})`);
  ensure(Array.isArray(write.body?.nodes), `${label}: write probe rule missing nodes[]`);
  ensure(
    write.body.nodes.some((n) => String(n?.id ?? "") === ruleNodeId),
    `${label}: write probe rule response missing rule node id`,
  );

  const state = await postJson(
    baseUrl,
    "/v1/memory/rules/state",
    {
      tenant_id: tenantId,
      scope,
      actor: "policy_planner_probe",
      rule_node_id: ruleNodeId,
      state: "active",
      input_text: "activate policy planner probe rule",
    },
    headers,
    label,
  );
  ensure(state.status === 200, `${label}: rules/state must return 200 (got ${state.status})`);
  ensure(typeof state.body?.commit_id === "string", `${label}: rules/state missing commit_id`);

  return {
    rule_node_id: ruleNodeId,
    write_commit_id: write.body?.commit_id ?? null,
    state_commit_id: state.body?.commit_id ?? null,
  };
}

async function probeRulesEvaluate() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/rules/evaluate",
    {
      tenant_id: tenantId,
      scope,
      context,
      include_shadow: false,
      limit: 50,
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: rules/evaluate must return 200 (got ${out.status})`);
  ensure(typeof out.body?.considered === "number", `${label}: rules/evaluate missing considered`);
  ensure(typeof out.body?.matched === "number", `${label}: rules/evaluate missing matched`);
  ensure(Array.isArray(out.body?.active), `${label}: rules/evaluate missing active[]`);
  ensure(Array.isArray(out.body?.shadow), `${label}: rules/evaluate missing shadow[]`);
  ensure(out.body?.applied && typeof out.body.applied === "object", `${label}: rules/evaluate missing applied`);
  ensure(
    out.body?.agent_visibility_summary && typeof out.body.agent_visibility_summary === "object",
    `${label}: rules/evaluate missing agent_visibility_summary`,
  );
  return out.body;
}

async function probeToolsSelect() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/tools/select",
    {
      tenant_id: tenantId,
      scope,
      context,
      candidates,
      include_shadow: false,
      rules_limit: 50,
      strict: false,
      run_id: runId,
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: tools/select must return 200 (got ${out.status})`);
  ensure(out.body?.selection && typeof out.body.selection === "object", `${label}: tools/select missing selection`);
  ensure(Array.isArray(out.body.selection?.ordered), `${label}: tools/select missing selection.ordered[]`);
  ensure(out.body?.rules && typeof out.body.rules === "object", `${label}: tools/select missing rules`);
  ensure(typeof out.body?.decision?.decision_uri === "string", `${label}: tools/select missing decision.decision_uri`);
  if (out.body.selection?.selected != null) {
    ensure(
      candidates.includes(String(out.body.selection.selected)),
      `${label}: tools/select selected tool must be in candidates`,
    );
  }
  return out.body;
}

async function probeToolsFeedback({
  selectedTool,
  decisionId,
  feedbackRunId,
  expectedLinkMode,
  expectedDecisionId,
}) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/tools/feedback",
    {
      tenant_id: tenantId,
      scope,
      actor: "policy_planner_probe",
      run_id: feedbackRunId,
      ...(decisionId ? { decision_id: decisionId } : {}),
      outcome: "positive",
      context,
      candidates,
      selected_tool: selectedTool,
      include_shadow: false,
      rules_limit: 50,
      target: "tool",
      input_text: "policy planner decision provenance feedback",
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: tools/feedback must return 200 (got ${out.status})`);
  ensure(typeof out.body?.updated_rules === "number", `${label}: tools/feedback missing updated_rules`);
  ensure(out.body.updated_rules > 0, `${label}: tools/feedback must attribute at least one rule`);
  ensure(typeof out.body?.decision_id === "string", `${label}: tools/feedback missing decision_id`);
  ensure(typeof out.body?.decision_uri === "string", `${label}: tools/feedback missing decision_uri`);
  ensure(typeof out.body?.commit_uri === "string", `${label}: tools/feedback missing commit_uri`);
  ensure(
    out.body?.decision_link_mode === expectedLinkMode,
    `${label}: tools/feedback decision_link_mode expected=${expectedLinkMode} got=${String(out.body?.decision_link_mode)}`,
  );
  if (expectedDecisionId) {
    ensure(
      String(out.body?.decision_id ?? "") === String(expectedDecisionId),
      `${label}: tools/feedback decision_id mismatch for mode=${expectedLinkMode}`,
    );
  }
  return out.body;
}

async function probeToolsDecisionReadback({ decisionId, expectedRunId, expectedSelectedTool }) {
  const out = await postJson(
    baseUrl,
    "/v1/memory/tools/decision",
    {
      tenant_id: tenantId,
      scope,
      decision_id: decisionId,
    },
    headers,
    label,
  );
  ensure(out.status === 200, `${label}: tools/decision must return 200 (got ${out.status})`);
  ensure(out.body?.decision && typeof out.body.decision === "object", `${label}: tools/decision missing decision`);
  ensure(
    String(out.body?.decision?.decision_id ?? "") === String(decisionId),
    `${label}: tools/decision decision_id mismatch`,
  );
  ensure(
    String(out.body?.decision?.run_id ?? "") === String(expectedRunId),
    `${label}: tools/decision run_id mismatch`,
  );
  ensure(
    String(out.body?.decision?.selected_tool ?? "") === String(expectedSelectedTool),
    `${label}: tools/decision selected_tool mismatch`,
  );
  ensure(
    Array.isArray(out.body?.decision?.candidates),
    `${label}: tools/decision missing decision.candidates[]`,
  );
  ensure(
    String(out.body?.decision?.decision_kind ?? "") === "tools_select",
    `${label}: tools/decision decision_kind must be tools_select`,
  );
  ensure(typeof out.body?.decision?.decision_uri === "string", `${label}: tools/decision missing decision_uri`);
  return out.body;
}

async function probeResolveChain({ ruleNodeId, decisionUri, commitUri }) {
  const nodeUri = `aionis://${encodeURIComponent(tenantId)}/${encodeURIComponent(scope)}/rule/${encodeURIComponent(ruleNodeId)}`;

  const nodeOut = await postJson(
    baseUrl,
    "/v1/memory/resolve",
    {
      tenant_id: tenantId,
      scope,
      uri: nodeUri,
    },
    headers,
    label,
  );
  if (nodeOut.status === 404) {
    return { skipped: true, reason: "resolve_endpoint_or_payload_unavailable", status: nodeOut.status };
  }
  ensure(nodeOut.status === 200, `${label}: resolve node must return 200 (got ${nodeOut.status})`);
  ensure(nodeOut.body?.node && typeof nodeOut.body.node === "object", `${label}: resolve node missing node payload`);
  ensure(typeof nodeOut.body?.node?.uri === "string", `${label}: resolve node missing node.uri`);

  const decisionOut = await postJson(
    baseUrl,
    "/v1/memory/resolve",
    {
      tenant_id: tenantId,
      scope,
      uri: decisionUri,
    },
    headers,
    label,
  );
  ensure(decisionOut.status === 200, `${label}: resolve decision must return 200 (got ${decisionOut.status})`);
  ensure(decisionOut.body?.decision && typeof decisionOut.body.decision === "object", `${label}: resolve decision missing decision payload`);
  ensure(
    String(decisionOut.body?.decision?.decision_uri ?? "") === String(decisionUri),
    `${label}: resolve decision_uri mismatch`,
  );

  const commitOut = await postJson(
    baseUrl,
    "/v1/memory/resolve",
    {
      tenant_id: tenantId,
      scope,
      uri: commitUri,
    },
    headers,
    label,
  );
  ensure(commitOut.status === 200, `${label}: resolve commit must return 200 (got ${commitOut.status})`);
  ensure(commitOut.body?.commit && typeof commitOut.body.commit === "object", `${label}: resolve commit missing commit payload`);
  ensure(
    typeof commitOut.body?.commit?.linked_object_counts?.nodes === "number",
    `${label}: resolve commit missing linked_object_counts.nodes`,
  );
  ensure(
    typeof commitOut.body?.commit?.linked_object_counts?.edges === "number",
    `${label}: resolve commit missing linked_object_counts.edges`,
  );
  ensure(
    typeof commitOut.body?.commit?.linked_object_counts?.decisions === "number",
    `${label}: resolve commit missing linked_object_counts.decisions`,
  );
  ensure(
    typeof commitOut.body?.commit?.linked_object_counts?.total === "number",
    `${label}: resolve commit missing linked_object_counts.total`,
  );

  return {
    skipped: false,
    node_uri: nodeOut.body?.node?.uri ?? null,
    decision_uri: decisionOut.body?.decision?.decision_uri ?? null,
    commit_uri: commitOut.body?.commit?.uri ?? null,
    linked_object_counts: commitOut.body?.commit?.linked_object_counts ?? null,
  };
}

async function probePackExportDecisionUris() {
  if (!hasAdminToken) {
    return { skipped: true, reason: "admin_token_missing", status: 0 };
  }
  const out = await postJson(
    baseUrl,
    "/v1/memory/packs/export",
    {
      tenant_id: tenantId,
      scope,
      include_nodes: false,
      include_edges: false,
      include_commits: false,
      include_decisions: true,
      include_meta: false,
      max_rows: 20,
    },
    adminHeaders,
    label,
  );

  if (out.status === 401 || out.status === 403) {
    return { skipped: true, reason: "admin_unauthorized", status: out.status };
  }
  if (out.status === 404) {
    return { skipped: true, reason: "packs_export_unavailable", status: out.status };
  }
  if (out.status === 501 && out.body?.error === "backend_capability_unsupported") {
    return { skipped: true, reason: "packs_export_capability_disabled", status: out.status };
  }

  ensure(out.status === 200, `${label}: packs/export include_decisions must return 200 (got ${out.status})`);
  ensure(
    typeof out.body?.manifest?.counts?.decisions === "number",
    `${label}: packs/export manifest.counts.decisions missing`,
  );
  ensure(
    typeof out.body?.manifest?.truncated?.decisions === "boolean",
    `${label}: packs/export manifest.truncated.decisions missing`,
  );
  ensure(Array.isArray(out.body?.pack?.decisions), `${label}: packs/export pack.decisions must be array`);

  const first = out.body.pack.decisions[0];
  if (first) {
    ensure(typeof first.decision_uri === "string", `${label}: packs/export decision row missing decision_uri`);
  }

  return {
    skipped: false,
    decisions: out.body.pack.decisions.length,
    decisions_truncated: out.body.manifest.truncated.decisions,
    decisions_count: out.body.manifest.counts.decisions,
  };
}

async function probePlanningContext() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/planning/context",
    {
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
    },
    headers,
    label,
  );

  if (out.status === 400 && out.body?.error === "no_embedding_provider") {
    return { skipped: true, reason: "no_embedding_provider", status: out.status, body: out.body };
  }

  ensure(out.status === 200, `${label}: planning/context must return 200 (got ${out.status})`);
  ensure(out.body?.query && typeof out.body.query === "object", `${label}: planning/context missing query`);
  ensure(
    typeof out.body.query.embedding_provider === "string" && out.body.query.embedding_provider.length > 0,
    `${label}: planning/context missing query.embedding_provider`,
  );
  ensure(out.body?.recall && typeof out.body.recall === "object", `${label}: planning/context missing recall`);
  ensure(
    Array.isArray(out.body?.recall?.subgraph?.nodes),
    `${label}: planning/context missing recall.subgraph.nodes[]`,
  );
  ensure(out.body?.rules && typeof out.body.rules === "object", `${label}: planning/context missing rules`);
  ensure(out.body?.tools && typeof out.body.tools === "object", `${label}: planning/context missing tools`);
  ensure(
    out.body?.tools?.selection && typeof out.body.tools.selection === "object",
    `${label}: planning/context missing tools.selection`,
  );
  return { skipped: false, status: out.status, body: out.body };
}

async function probeContextAssemble() {
  const out = await postJson(
    baseUrl,
    "/v1/memory/context/assemble",
    {
      tenant_id: tenantId,
      scope,
      query_text: "policy planner parity probe",
      context,
      include_rules: true,
      include_shadow: false,
      rules_limit: 50,
      tool_candidates: candidates,
      tool_strict: false,
      return_layered_context: true,
      context_layers: {
        enabled: ["facts", "episodes", "rules", "tools", "citations"],
        char_budget_total: 2800,
      },
      return_debug: false,
      include_embeddings: false,
      include_meta: false,
      include_slots: false,
      include_slots_preview: false,
    },
    headers,
    label,
  );

  if (out.status === 400 && out.body?.error === "no_embedding_provider") {
    return { skipped: true, reason: "no_embedding_provider", status: out.status, body: out.body };
  }

  ensure(out.status === 200, `${label}: context/assemble must return 200 (got ${out.status})`);
  ensure(out.body?.query && typeof out.body.query === "object", `${label}: context/assemble missing query`);
  ensure(
    typeof out.body.query.embedding_provider === "string" && out.body.query.embedding_provider.length > 0,
    `${label}: context/assemble missing query.embedding_provider`,
  );
  ensure(out.body?.recall && typeof out.body.recall === "object", `${label}: context/assemble missing recall`);
  ensure(out.body?.rules && typeof out.body.rules === "object", `${label}: context/assemble missing rules`);
  ensure(out.body?.tools && typeof out.body.tools === "object", `${label}: context/assemble missing tools`);
  ensure(
    out.body?.layered_context && typeof out.body.layered_context === "object",
    `${label}: context/assemble missing layered_context`,
  );
  ensure(Array.isArray(out.body.layered_context?.order), `${label}: context/assemble layered_context.order must be array`);
  ensure(
    typeof out.body.layered_context?.merged_text === "string",
    `${label}: context/assemble layered_context.merged_text must be string`,
  );
  return { skipped: false, status: out.status, body: out.body };
}

async function probeDiagnostics() {
  if (!hasAdminToken) {
    return { skipped: true, reason: "admin_token_missing", status: 0, body: null };
  }
  const out = await getJson(
    baseUrl,
    `/v1/admin/control/diagnostics/tenant/${encodeURIComponent(tenantId)}?scope=${encodeURIComponent(scope)}&window_minutes=60`,
    adminHeaders,
    label,
  );

  if (out.status === 401 || out.status === 403) {
    return { skipped: true, reason: "admin_unauthorized", status: out.status, body: out.body };
  }

  ensure(out.status === 200, `${label}: diagnostics endpoint must return 200 (got ${out.status})`);
  ensure(out.body?.diagnostics && typeof out.body.diagnostics === "object", `${label}: diagnostics response missing diagnostics object`);
  ensure(
    out.body?.diagnostics?.context_assembly && typeof out.body.diagnostics.context_assembly === "object",
    `${label}: diagnostics response missing context_assembly`,
  );
  const contextAssembly = out.body.diagnostics.context_assembly;
  ensure(typeof contextAssembly.total === "number", `${label}: diagnostics.context_assembly.total must be number`);
  ensure(typeof contextAssembly.layered_total === "number", `${label}: diagnostics.context_assembly.layered_total must be number`);
  ensure(
    typeof contextAssembly.layered_adoption_rate === "number",
    `${label}: diagnostics.context_assembly.layered_adoption_rate must be number`,
  );
  ensure(Array.isArray(contextAssembly.endpoints), `${label}: diagnostics.context_assembly.endpoints must be array`);
  ensure(Array.isArray(contextAssembly.layers), `${label}: diagnostics.context_assembly.layers must be array`);
  ensure(Array.isArray(contextAssembly.selection_policies), `${label}: diagnostics.context_assembly.selection_policies must be array`);
  ensure(Array.isArray(contextAssembly.selection_policy_sources), `${label}: diagnostics.context_assembly.selection_policy_sources must be array`);
  ensure(Array.isArray(contextAssembly.selected_memory_layers), `${label}: diagnostics.context_assembly.selected_memory_layers must be array`);
  ensure(Array.isArray(contextAssembly.trust_anchor_layers), `${label}: diagnostics.context_assembly.trust_anchor_layers must be array`);
  ensure(Array.isArray(contextAssembly.requested_allowed_layers), `${label}: diagnostics.context_assembly.requested_allowed_layers must be array`);
  return { skipped: false, status: out.status, body: out.body };
}

try {
  const setup = await setupProbeRule();
  const rules = await probeRulesEvaluate();
  const tools = await probeToolsSelect();
  ensure(typeof tools?.decision?.decision_id === "string", `${label}: tools/select missing decision.decision_id`);
  ensure(typeof tools.selection?.selected === "string", `${label}: tools/select must choose a selected tool`);
  const decision = await probeToolsDecisionReadback({
    decisionId: String(tools.decision.decision_id),
    expectedRunId: runId,
    expectedSelectedTool: String(tools.selection.selected),
  });

  const feedbackProvided = await probeToolsFeedback({
    selectedTool: String(tools.selection.selected),
    decisionId: String(tools.decision.decision_id),
    feedbackRunId: runId,
    expectedLinkMode: "provided",
    expectedDecisionId: String(tools.decision.decision_id),
  });
  const feedbackInferred = await probeToolsFeedback({
    selectedTool: String(tools.selection.selected),
    decisionId: null,
    feedbackRunId: runId,
    expectedLinkMode: "inferred",
    expectedDecisionId: String(tools.decision.decision_id),
  });
  const feedbackCreated = await probeToolsFeedback({
    selectedTool: String(tools.selection.selected),
    decisionId: null,
    feedbackRunId: `${runId}_fresh`,
    expectedLinkMode: "created_from_feedback",
  });
  ensure(
    String(feedbackCreated.decision_id ?? "") !== String(tools.decision.decision_id),
    `${label}: created_from_feedback must create a distinct decision_id`,
  );

  const planning = await probePlanningContext();
  const assembled = await probeContextAssemble();
  const diagnostics = await probeDiagnostics();
  const resolve = await probeResolveChain({
    ruleNodeId: String(setup.rule_node_id),
    decisionUri: String(feedbackProvided.decision_uri),
    commitUri: String(feedbackProvided.commit_uri),
  });
  const packExportDecisions = await probePackExportDecisionUris();

  if (!planning.skipped) {
    ensure(
      Number(planning.body.rules?.considered ?? -1) === Number(rules.considered ?? -2),
      `${label}: planning.rules.considered must match rules/evaluate`,
    );
    ensure(
      Number(planning.body.rules?.matched ?? -1) === Number(rules.matched ?? -2),
      `${label}: planning.rules.matched must match rules/evaluate`,
    );
    const directSelected = tools.selection?.selected ?? null;
    const planningSelected = planning.body.tools?.selection?.selected ?? null;
    ensure(
      String(directSelected ?? "") === String(planningSelected ?? ""),
      `${label}: planning.tools.selection.selected must match tools/select`,
    );
  }

  if (!assembled.skipped) {
    ensure(
      Number(assembled.body.rules?.considered ?? -1) === Number(rules.considered ?? -2),
      `${label}: assemble.rules.considered must match rules/evaluate`,
    );
    ensure(
      Number(assembled.body.rules?.matched ?? -1) === Number(rules.matched ?? -2),
      `${label}: assemble.rules.matched must match rules/evaluate`,
    );
    ensure(
      Array.isArray(assembled.body.layered_context?.order) && assembled.body.layered_context.order.length > 0,
      `${label}: assemble.layered_context.order must be non-empty`,
    );
  }

  const out = {
    ok: true,
    base_url: baseUrl,
    tenant_id: tenantId,
    scope_prefix: scopePrefix,
    scope,
    requests: {
      rules_evaluate: { include_shadow: false, limit: 50 },
      tools_select: { include_shadow: false, rules_limit: 50, strict: false, candidates_count: candidates.length },
      tools_feedback: {
        include_shadow: false,
        rules_limit: 50,
        target: "tool",
        expected_modes: ["provided", "inferred", "created_from_feedback"],
      },
      planning_context: { include_shadow: false, rules_limit: 50, tool_candidates_count: candidates.length, tool_strict: false },
      context_assemble: {
        include_rules: true,
        include_shadow: false,
        rules_limit: 50,
        tool_candidates_count: candidates.length,
        tool_strict: false,
        return_layered_context: true,
      },
      diagnostics: {
        scope,
        window_minutes: 60,
      },
      resolve: {
        object_types: ["rule", "decision", "commit"],
      },
      pack_export_decisions: {
        include_nodes: false,
        include_edges: false,
        include_commits: false,
        include_decisions: true,
        include_meta: false,
      },
    },
    results: {
      setup,
      rules: {
        considered: Number(rules.considered ?? 0),
        matched: Number(rules.matched ?? 0),
      },
      tools: {
        selected: tools.selection?.selected ?? null,
        ordered_count: Array.isArray(tools.selection?.ordered) ? tools.selection.ordered.length : 0,
        decision_id: tools.decision?.decision_id ?? null,
      },
      decision_readback: {
        decision_id: decision.decision?.decision_id ?? null,
        decision_kind: decision.decision?.decision_kind ?? null,
        run_id: decision.decision?.run_id ?? null,
        selected_tool: decision.decision?.selected_tool ?? null,
      },
      provenance: {
        provided: {
          decision_id: feedbackProvided.decision_id ?? null,
          decision_link_mode: feedbackProvided.decision_link_mode ?? null,
          updated_rules: Number(feedbackProvided.updated_rules ?? 0),
        },
        inferred: {
          decision_id: feedbackInferred.decision_id ?? null,
          decision_link_mode: feedbackInferred.decision_link_mode ?? null,
          updated_rules: Number(feedbackInferred.updated_rules ?? 0),
        },
        created_from_feedback: {
          decision_id: feedbackCreated.decision_id ?? null,
          decision_link_mode: feedbackCreated.decision_link_mode ?? null,
          updated_rules: Number(feedbackCreated.updated_rules ?? 0),
        },
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
      assembled: assembled.skipped
        ? {
            skipped: true,
            reason: assembled.reason,
            status: assembled.status,
          }
        : {
            skipped: false,
            selected: assembled.body.tools?.selection?.selected ?? null,
            recall_nodes: Array.isArray(assembled.body.recall?.subgraph?.nodes)
              ? assembled.body.recall.subgraph.nodes.length
              : 0,
            rules_considered: Number(assembled.body.rules?.considered ?? 0),
            rules_matched: Number(assembled.body.rules?.matched ?? 0),
            layered_order: assembled.body.layered_context?.order ?? [],
          },
      diagnostics: diagnostics.skipped
        ? {
            skipped: true,
            reason: diagnostics.reason,
            status: diagnostics.status,
          }
        : {
            skipped: false,
            context_assembly: {
              total: Number(diagnostics.body?.diagnostics?.context_assembly?.total ?? 0),
              layered_total: Number(diagnostics.body?.diagnostics?.context_assembly?.layered_total ?? 0),
              layered_adoption_rate: Number(diagnostics.body?.diagnostics?.context_assembly?.layered_adoption_rate ?? 0),
              selection_policies: Array.isArray(diagnostics.body?.diagnostics?.context_assembly?.selection_policies)
                ? diagnostics.body.diagnostics.context_assembly.selection_policies
                : [],
              selection_policy_sources: Array.isArray(diagnostics.body?.diagnostics?.context_assembly?.selection_policy_sources)
                ? diagnostics.body.diagnostics.context_assembly.selection_policy_sources
                : [],
              selected_memory_layers: Array.isArray(diagnostics.body?.diagnostics?.context_assembly?.selected_memory_layers)
                ? diagnostics.body.diagnostics.context_assembly.selected_memory_layers
                : [],
              trust_anchor_layers: Array.isArray(diagnostics.body?.diagnostics?.context_assembly?.trust_anchor_layers)
                ? diagnostics.body.diagnostics.context_assembly.trust_anchor_layers
                : [],
              requested_allowed_layers: Array.isArray(diagnostics.body?.diagnostics?.context_assembly?.requested_allowed_layers)
                ? diagnostics.body.diagnostics.context_assembly.requested_allowed_layers
                : [],
            },
          },
      resolve: resolve.skipped
        ? {
            skipped: true,
            reason: resolve.reason,
            status: resolve.status,
          }
        : {
            skipped: false,
            node_uri: resolve.node_uri,
            decision_uri: resolve.decision_uri,
            commit_uri: resolve.commit_uri,
            linked_object_counts: resolve.linked_object_counts,
          },
      pack_export_decisions: packExportDecisions.skipped
        ? {
            skipped: true,
            reason: packExportDecisions.reason,
            status: packExportDecisions.status,
          }
        : {
            skipped: false,
            decisions: packExportDecisions.decisions,
            decisions_count: packExportDecisions.decisions_count,
            decisions_truncated: packExportDecisions.decisions_truncated,
          },
    },
  };
  writeJson(process.stdout, out);
} catch (err) {
  const out = toProbeFailure(err);
  writeJson(process.stderr, out);
  process.exit(1);
}
