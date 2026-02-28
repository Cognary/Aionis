import { randomUUID } from "node:crypto";
import { buildAuthHeaders, ensure, envString, postJson, toProbeFailure, writeJson } from "./probe-common.mjs";

const label = "policy-planner-api-probes";
const baseUrl = envString("AIONIS_BASE_URL", `http://127.0.0.1:${envString("PORT", "3001")}`);
const scopeSeed = Date.now().toString(36);
const scopePrefix = envString("POLICY_PLANNER_PROBE_SCOPE", "default");
const scope = `${scopePrefix}_policy_planner_probe_${scopeSeed}`;
const tenantId = envString("POLICY_PLANNER_PROBE_TENANT_ID", "default");
const headers = buildAuthHeaders({ includeAdmin: false, requireAdmin: false });

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

try {
  const setup = await setupProbeRule();
  const rules = await probeRulesEvaluate();
  const tools = await probeToolsSelect();
  ensure(typeof tools?.decision?.decision_id === "string", `${label}: tools/select missing decision.decision_id`);
  ensure(typeof tools.selection?.selected === "string", `${label}: tools/select must choose a selected tool`);

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
    },
  };
  writeJson(process.stdout, out);
} catch (err) {
  const out = toProbeFailure(err);
  writeJson(process.stderr, out);
  process.exit(1);
}
