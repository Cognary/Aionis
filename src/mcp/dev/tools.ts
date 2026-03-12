import { randomUUID } from "node:crypto";
import { z, type ZodTypeAny } from "zod";
import { type AionisDevEnv, HttpError, clipText, postJson } from "./client.js";
import { type ToolResultSummary } from "../../memory/tool-result-summary.js";
import {
  CodexGateArgsSchema,
  CodexLearnFromRunArgsSchema,
  CodexPlanningContextArgsSchema,
  evaluateCodexGate,
  submitCodexLearnFromRun,
} from "./profile.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolHandler = (env: AionisDevEnv, args: Record<string, unknown>) => Promise<ToolResult>;

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  path?: string;
  inputSchema: Record<string, unknown>;
  argsSchema: ZodTypeAny;
  summarize?: (result: unknown, env: AionisDevEnv) => string;
  handler?: ToolHandler;
};

const JsonRecord = z.record(z.unknown());
const Uuid = z.string().uuid();

function textResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

function invalidArgs(error: z.ZodError): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `invalid_args: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
      },
    ],
  };
}

function sanitizeToolArgs(rawArgs: unknown): Record<string, unknown> {
  if (!rawArgs || typeof rawArgs !== "object") return {};
  const args = { ...(rawArgs as Record<string, unknown>) };
  delete args._meta;
  return args;
}

function stringifyResult(toolName: string, result: unknown, env: AionisDevEnv): string {
  const summary = extractToolResultSummary(result);
  if (summary) {
    const lines = [
      `${toolName} result`,
      `summary_version: ${summary.summary_version}`,
      `signals: ${summary.signals.join(", ") || "none"}`,
      `stdout_preview: ${summary.stdout_preview || "<empty>"}`,
      summary.stderr_preview ? `stderr_preview: ${summary.stderr_preview}` : null,
      summary.result_preview ? `result_preview: ${summary.result_preview}` : null,
      `stdout_chars: ${summary.stdout_chars}`,
      `stderr_chars: ${summary.stderr_chars}`,
      `result_kind: ${summary.result_kind}`,
      summary.result_keys.length > 0 ? `result_keys: ${summary.result_keys.join(", ")}` : null,
      summary.exit_code !== null ? `exit_code: ${summary.exit_code}` : null,
      summary.error ? `error: ${summary.error}` : null,
      summary.truncated ? "truncated: true" : null,
    ].filter(Boolean);
    return clipText(lines.join("\n"), env.AIONIS_MAX_TOOL_TEXT_CHARS);
  }
  return clipText(`${toolName} result\n${JSON.stringify(result, null, 2)}`, env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function extractToolResultSummary(result: unknown): ToolResultSummary | null {
  const obj = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  if (!obj) return null;
  const candidates = [
    obj.result_summary,
    (obj.run as Record<string, unknown> | undefined)?.result_summary,
    (obj.logs as Record<string, unknown> | undefined)?.summary,
    (obj.artifact as Record<string, unknown> | undefined)?.summary,
    Array.isArray(obj.steps) ? (obj.steps[0] as Record<string, unknown> | undefined)?.result_summary : null,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).summary_version === "tool_result_summary_v1") {
      return candidate as ToolResultSummary;
    }
  }
  return null;
}

function summarizeRecallText(result: any, env: AionisDevEnv): string {
  const text = typeof result?.context?.text === "string" ? result.context.text : JSON.stringify(result, null, 2);
  return clipText(text, env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function summarizeMemoryFind(result: any, env: AionisDevEnv): string {
  const summary = result?.find_summary;
  if (summary && typeof summary === "object" && summary.summary_version === "find_summary_v1") {
    return clipText(
      [
        "memory_find result",
        Number.isFinite(Number(summary.returned_nodes)) ? `returned_nodes: ${Number(summary.returned_nodes)}` : null,
        summary.has_more === true ? "has_more: true" : "has_more: false",
        Array.isArray(summary.filters_applied) && summary.filters_applied.length > 0
          ? `filters_applied: ${summary.filters_applied.join(", ")}`
          : null,
        summary.type_counts && typeof summary.type_counts === "object"
          ? `type_counts: ${Object.entries(summary.type_counts).map(([k, v]) => `${k}=${v}`).join(", ")}`
          : null,
        Array.isArray(result?.nodes) && result.nodes.length > 0
          ? `top_nodes: ${result.nodes
              .slice(0, 3)
              .map((node: any) => node?.uri ?? node?.id ?? "<unknown>")
              .join(" | ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      env.AIONIS_MAX_TOOL_TEXT_CHARS,
    );
  }
  return clipText(`memory_find result\n${JSON.stringify(result, null, 2)}`, env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function summarizeMemoryResolve(result: any, env: AionisDevEnv): string {
  const summary = result?.resolve_summary;
  if (summary && typeof summary === "object" && summary.summary_version === "resolve_summary_v1") {
    return clipText(
      [
        "memory_resolve result",
        typeof summary.payload_kind === "string" ? `payload_kind: ${summary.payload_kind}` : null,
        typeof summary.resolved_type === "string" ? `resolved_type: ${summary.resolved_type}` : null,
        Number.isFinite(Number(summary.related_uri_count)) ? `related_uri_count: ${Number(summary.related_uri_count)}` : null,
        Array.isArray(summary.related_uris) && summary.related_uris.length > 0
          ? `related_uris: ${summary.related_uris.slice(0, 4).join(" | ")}`
          : null,
        Array.isArray(summary.object_keys) && summary.object_keys.length > 0
          ? `object_keys: ${summary.object_keys.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      env.AIONIS_MAX_TOOL_TEXT_CHARS,
    );
  }
  return clipText(`memory_resolve result\n${JSON.stringify(result, null, 2)}`, env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function summarizePlanningContext(result: any, env: AionisDevEnv): string {
  const planningSummary = result?.planning_summary;
  const selected =
    typeof planningSummary?.selected_tool === "string"
      ? planningSummary.selected_tool
      : result?.tools?.selection?.selected;
  const decisionId =
    typeof planningSummary?.decision_id === "string"
      ? planningSummary.decision_id
      : result?.tools?.decision?.decision_id;
  const merged = typeof result?.layered_context?.merged_text === "string" ? result.layered_context.merged_text : "";
  const recallText = typeof result?.recall?.context?.text === "string" ? result.recall.context.text : "";
  const text = merged || recallText || JSON.stringify(result, null, 2);

  return clipText(
    [
      selected ? `selected_tool: ${selected}` : null,
      decisionId ? `decision_id: ${decisionId}` : null,
      planningSummary && typeof planningSummary === "object"
        ? [
            Number.isFinite(Number(planningSummary.rules_matched))
              ? `rules_matched: ${Number(planningSummary.rules_matched)}`
              : null,
            Number.isFinite(Number(planningSummary.context_est_tokens))
              ? `context_est_tokens: ${Number(planningSummary.context_est_tokens)}`
              : null,
            Number.isFinite(Number(planningSummary.forgotten_items))
              ? `forgotten_items: ${Number(planningSummary.forgotten_items)}`
              : null,
            Number.isFinite(Number(planningSummary.static_blocks_selected))
              ? `static_blocks_selected: ${Number(planningSummary.static_blocks_selected)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n")
        : null,
      text,
    ]
      .filter(Boolean)
      .join("\n\n"),
    env.AIONIS_MAX_TOOL_TEXT_CHARS,
  );
}

function summarizeStoreHandoff(result: any, env: AionisDevEnv): string {
  const node = Array.isArray(result?.nodes) ? result.nodes[0] : null;
  return clipText(
    [
      "handoff_store result",
      typeof result?.commit_id === "string" ? `commit_id: ${result.commit_id}` : null,
      typeof result?.commit_uri === "string" ? `commit_uri: ${result.commit_uri}` : null,
      typeof node?.id === "string" ? `node_id: ${node.id}` : null,
      typeof node?.uri === "string" ? `node_uri: ${node.uri}` : null,
      typeof result?.scope === "string" ? `scope: ${result.scope}` : null,
      typeof result?.tenant_id === "string" ? `tenant_id: ${result.tenant_id}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    env.AIONIS_MAX_TOOL_TEXT_CHARS,
  );
}

function summarizeRecoveredHandoff(payload: {
  recall: unknown;
  find: any;
  resolve: any;
}, env: AionisDevEnv): string {
  const recallText = typeof (payload.recall as any)?.context?.text === "string"
    ? (payload.recall as any).context.text
    : null;
  const node = payload.resolve?.node ?? {};
  const slots = node?.slots && typeof node.slots === "object" ? node.slots : {};
  const acceptanceChecks = Array.isArray(slots.acceptance_checks) ? slots.acceptance_checks : [];

  return clipText(
    [
      "handoff_recover result",
      typeof slots.handoff_kind === "string" ? `handoff_kind: ${slots.handoff_kind}` : null,
      typeof slots.anchor === "string" ? `anchor: ${slots.anchor}` : null,
      typeof slots.file_path === "string" ? `file_path: ${slots.file_path}` : null,
      typeof slots.symbol === "string" ? `symbol: ${slots.symbol}` : null,
      typeof slots.risk === "string" ? `risk: ${slots.risk}` : null,
      typeof node?.text_summary === "string" ? `summary: ${node.text_summary}` : null,
      typeof slots.handoff_text === "string" ? `handoff_text: ${slots.handoff_text}` : null,
      acceptanceChecks.length > 0 ? `acceptance_checks: ${acceptanceChecks.join(" | ")}` : null,
      typeof node?.uri === "string" ? `source_uri: ${node.uri}` : null,
      typeof node?.commit_id === "string" ? `commit_id: ${node.commit_id}` : null,
      recallText ? `supporting_recall: ${recallText}` : null,
      payload.find?.find_summary && typeof payload.find.find_summary === "object"
        ? `matched_nodes: ${Number(payload.find.find_summary.returned_nodes ?? 0)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    env.AIONIS_MAX_TOOL_TEXT_CHARS,
  );
}

function formatToolsLifecycleSummary(summary: any, env: AionisDevEnv): string | null {
  if (!summary || typeof summary !== "object" || summary.summary_version !== "tools_lifecycle_summary_v1") {
    return null;
  }
  const lines =
    summary.kind === "decision"
      ? [
          "tools_decision result",
          typeof summary.selected_tool === "string" ? `selected_tool: ${summary.selected_tool}` : "selected_tool: <none>",
          typeof summary.decision_id === "string" ? `decision_id: ${summary.decision_id}` : null,
          typeof summary.run_id === "string" ? `run_id: ${summary.run_id}` : null,
          typeof summary.lookup_mode === "string" ? `lookup_mode: ${summary.lookup_mode}` : null,
          Number.isFinite(Number(summary.candidate_count)) ? `candidate_count: ${Number(summary.candidate_count)}` : null,
          Number.isFinite(Number(summary.source_rule_count)) ? `source_rule_count: ${Number(summary.source_rule_count)}` : null,
          typeof summary.metadata_source === "string" ? `metadata_source: ${summary.metadata_source}` : null,
          typeof summary.created_at === "string" ? `created_at: ${summary.created_at}` : null,
          Array.isArray(summary.tool_conflicts) && summary.tool_conflicts.length > 0
            ? `tool_conflicts: ${summary.tool_conflicts.slice(0, 3).join(" | ")}`
            : null,
        ]
      : [
          "tools_run result",
          typeof summary.status === "string" ? `status: ${summary.status}` : null,
          typeof summary.run_id === "string" ? `run_id: ${summary.run_id}` : null,
          Number.isFinite(Number(summary.decision_count)) ? `decision_count: ${Number(summary.decision_count)}` : null,
          typeof summary.latest_decision_at === "string" ? `latest_decision_at: ${summary.latest_decision_at}` : null,
          typeof summary.latest_feedback_at === "string" ? `latest_feedback_at: ${summary.latest_feedback_at}` : null,
          Array.isArray(summary.recent_decisions) && summary.recent_decisions.length > 0
            ? `recent_decisions: ${summary.recent_decisions.slice(0, 3).join(" | ")}`
            : null,
          Number.isFinite(Number(summary.feedback_total))
            ? `feedback_total: ${Number(summary.feedback_total)}`
            : null,
          Number.isFinite(Number(summary.tools_feedback_count))
            ? `tools_feedback_count: ${Number(summary.tools_feedback_count)}`
            : null,
        ];
  return clipText(lines.filter(Boolean).join("\n"), env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function summarizeToolsSelect(result: any, env: AionisDevEnv): string {
  const summary = result?.selection_summary;
  if (summary && typeof summary === "object" && summary.summary_version === "tools_selection_summary_v1") {
    return clipText(
      [
        "tools_select result",
        typeof summary.selected_tool === "string" ? `selected_tool: ${summary.selected_tool}` : "selected_tool: <none>",
        Number.isFinite(Number(summary.candidate_count)) ? `candidate_count: ${Number(summary.candidate_count)}` : null,
        Number.isFinite(Number(summary.allowed_count)) ? `allowed_count: ${Number(summary.allowed_count)}` : null,
        Number.isFinite(Number(summary.denied_count)) ? `denied_count: ${Number(summary.denied_count)}` : null,
        Number.isFinite(Number(summary.matched_rules)) ? `matched_rules: ${Number(summary.matched_rules)}` : null,
        Number.isFinite(Number(summary.source_rule_count))
          ? `source_rule_count: ${Number(summary.source_rule_count)}`
          : null,
        summary.fallback_applied ? `fallback_reason: ${summary.fallback_reason ?? "applied"}` : null,
        typeof summary.shadow_selected_tool === "string" ? `shadow_selected_tool: ${summary.shadow_selected_tool}` : null,
        Array.isArray(summary.tool_conflicts) && summary.tool_conflicts.length > 0
          ? `tool_conflicts: ${summary.tool_conflicts.slice(0, 3).join(" | ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      env.AIONIS_MAX_TOOL_TEXT_CHARS,
    );
  }
  const selection = result?.selection ?? {};
  const selected = typeof selection?.selected === "string" ? selection.selected : null;
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  const decisionId = typeof result?.decision?.decision_id === "string" ? result.decision.decision_id : null;
  const matchedRules = Number(result?.rules?.matched ?? 0);
  const conflicts = Array.isArray(result?.rules?.tool_conflicts_summary) ? result.rules.tool_conflicts_summary.slice(0, 2) : [];
  const shadowSelected =
    typeof result?.rules?.shadow_selection?.selected === "string" ? result.rules.shadow_selection.selected : null;
  return clipText(
    [
      "tools_select result",
      selected ? `selected_tool: ${selected}` : "selected_tool: <none>",
      `candidate_count: ${candidates.length}`,
      candidates.length > 0 ? `candidates: ${candidates.slice(0, 6).join(", ")}` : null,
      decisionId ? `decision_id: ${decisionId}` : null,
      Number.isFinite(matchedRules) ? `matched_rules: ${matchedRules}` : null,
      shadowSelected ? `shadow_selected_tool: ${shadowSelected}` : null,
      conflicts.length > 0 ? `tool_conflicts: ${conflicts.join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    env.AIONIS_MAX_TOOL_TEXT_CHARS,
  );
}

function summarizeToolsDecision(result: any, env: AionisDevEnv): string {
  const lifecycleSummary = formatToolsLifecycleSummary(result?.lifecycle_summary, env);
  if (lifecycleSummary) return lifecycleSummary;
  const decision = result?.decision ?? {};
  const selected = typeof decision?.selected_tool === "string" ? decision.selected_tool : null;
  const decisionId = typeof decision?.decision_id === "string" ? decision.decision_id : null;
  const runId = typeof decision?.run_id === "string" ? decision.run_id : null;
  const candidates = Array.isArray(decision?.candidates) ? decision.candidates : [];
  const sourceRuleIds = Array.isArray(decision?.source_rule_ids) ? decision.source_rule_ids : [];
  const createdAt = typeof decision?.created_at === "string" ? decision.created_at : null;
  const metadata = decision?.metadata && typeof decision.metadata === "object" ? decision.metadata : {};
  const source = typeof metadata?.source === "string" ? metadata.source : null;
  const conflicts = Array.isArray(metadata?.tool_conflicts_summary) ? metadata.tool_conflicts_summary.slice(0, 2) : [];

  return clipText(
    [
      "tools_decision result",
      selected ? `selected_tool: ${selected}` : "selected_tool: <none>",
      decisionId ? `decision_id: ${decisionId}` : null,
      runId ? `run_id: ${runId}` : null,
      typeof result?.lookup_mode === "string" ? `lookup_mode: ${result.lookup_mode}` : null,
      typeof decision?.decision_kind === "string" ? `decision_kind: ${decision.decision_kind}` : null,
      `candidate_count: ${candidates.length}`,
      candidates.length > 0 ? `candidates: ${candidates.slice(0, 6).join(", ")}` : null,
      `source_rule_count: ${sourceRuleIds.length}`,
      source ? `metadata_source: ${source}` : null,
      createdAt ? `created_at: ${createdAt}` : null,
      conflicts.length > 0 ? `tool_conflicts: ${conflicts.join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    env.AIONIS_MAX_TOOL_TEXT_CHARS,
  );
}

function summarizeToolsRun(result: any, env: AionisDevEnv): string {
  const lifecycleSummary = formatToolsLifecycleSummary(result?.lifecycle_summary, env);
  if (lifecycleSummary) return lifecycleSummary;
  const lifecycle = result?.lifecycle ?? {};
  const decisions = Array.isArray(result?.decisions) ? result.decisions : [];
  const feedback = result?.feedback ?? null;
  const recentDecisionSummary = decisions
    .slice(0, 3)
    .map((decision: any) => {
      const selected = typeof decision?.selected_tool === "string" ? decision.selected_tool : "<none>";
      const createdAt = typeof decision?.created_at === "string" ? decision.created_at : null;
      return createdAt ? `${selected} @ ${createdAt}` : selected;
    })
    .join(" | ");

  return clipText(
    [
      "tools_run result",
      typeof lifecycle?.status === "string" ? `status: ${lifecycle.status}` : null,
      typeof result?.run_id === "string" ? `run_id: ${result.run_id}` : null,
      `decision_count: ${Number(lifecycle?.decision_count ?? decisions.length ?? 0)}`,
      typeof lifecycle?.latest_decision_at === "string" ? `latest_decision_at: ${lifecycle.latest_decision_at}` : null,
      typeof lifecycle?.latest_feedback_at === "string" ? `latest_feedback_at: ${lifecycle.latest_feedback_at}` : null,
      recentDecisionSummary ? `recent_decisions: ${recentDecisionSummary}` : null,
      feedback
        ? `feedback_total: ${Number(feedback?.total ?? 0)} (positive=${Number(feedback?.by_outcome?.positive ?? 0)}, negative=${Number(feedback?.by_outcome?.negative ?? 0)}, neutral=${Number(feedback?.by_outcome?.neutral ?? 0)})`
        : null,
      feedback && Number.isFinite(Number(feedback?.tools_feedback_count ?? NaN))
        ? `tools_feedback_count: ${Number(feedback.tools_feedback_count ?? 0)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    env.AIONIS_MAX_TOOL_TEXT_CHARS,
  );
}

function schemaObject(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const MemoryRememberArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  input_text: z.string().min(1),
  memory_lane: z.enum(["private", "shared"]).optional(),
  producer_agent_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
  auto_embed: z.boolean().optional(),
  force_reembed: z.boolean().optional(),
  trigger_topic_cluster: z.boolean().optional(),
  topic_cluster_async: z.boolean().optional(),
  distill: z.object({
    enabled: z.boolean().optional(),
    sources: z.array(z.enum(["input_text", "event_nodes", "evidence_nodes"])).min(1).max(3).optional(),
    max_evidence_nodes: z.number().int().min(1).max(20).optional(),
    max_fact_nodes: z.number().int().min(1).max(20).optional(),
    min_sentence_chars: z.number().int().min(12).max(500).optional(),
    attach_edges: z.boolean().optional(),
  }).optional(),
  nodes: z.array(z.record(z.unknown())).min(1),
  edges: z.array(z.record(z.unknown())).optional(),
});

const MemoryRecallTextArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  query_text: z.string().min(1),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  neighborhood_hops: z.number().int().min(1).max(2).optional(),
  max_nodes: z.number().int().min(1).max(200).optional(),
  max_edges: z.number().int().min(0).max(100).optional(),
  min_edge_weight: z.number().min(0).max(1).optional(),
  min_edge_confidence: z.number().min(0).max(1).optional(),
  rules_context: z.unknown().optional(),
  rules_include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().min(1).max(200).optional(),
});

const MemoryFindArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  title_contains: z.string().min(1).optional(),
  text_contains: z.string().min(1).optional(),
  memory_lane: z.enum(["private", "shared"]).optional(),
  slots_contains: JsonRecord.optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(5000).optional(),
  include_meta: z.boolean().optional(),
  include_slots: z.boolean().optional(),
  include_slots_preview: z.boolean().optional(),
  slots_preview_keys: z.number().int().min(1).max(50).optional(),
});

const MemoryResolveArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  uri: z.string().min(1),
  include_meta: z.boolean().optional(),
  include_slots: z.boolean().optional(),
  include_slots_preview: z.boolean().optional(),
  slots_preview_keys: z.number().int().min(1).max(50).optional(),
});

const HandoffKind = z.enum(["patch_handoff", "review_handoff", "task_handoff"]);

const MemoryStoreHandoffArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  memory_lane: z.enum(["private", "shared"]).optional(),
  anchor: z.string().min(1),
  file_path: z.string().min(1),
  repo_root: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  handoff_kind: HandoffKind.default("patch_handoff"),
  title: z.string().min(1).optional(),
  summary: z.string().min(1),
  handoff_text: z.string().min(1),
  risk: z.string().min(1).optional(),
  acceptance_checks: z.array(z.string().min(1)).max(20).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
});

const MemoryRecoverHandoffArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  anchor: z.string().min(1),
  file_path: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  handoff_kind: HandoffKind.default("patch_handoff"),
  memory_lane: z.enum(["private", "shared"]).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  recall_limit: z.number().int().min(1).max(50).optional(),
});

const ToolsSelectArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  context: z.unknown(),
  candidates: z.array(z.string().min(1)).min(1).max(200),
  include_shadow: z.boolean().optional(),
  rules_limit: z.number().int().min(1).max(200).optional(),
  strict: z.boolean().optional(),
});

const ToolsDecisionArgs = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    decision_id: Uuid.optional(),
    decision_uri: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.decision_id || value.decision_uri || value.run_id), {
    message: "must set decision_id, decision_uri, or run_id",
  });

const ToolsRunArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: z.string().min(1),
  decision_limit: z.number().int().min(1).max(200).optional(),
  include_feedback: z.boolean().optional(),
  feedback_limit: z.number().int().min(1).max(200).optional(),
});

const ToolsFeedbackArgs = z
  .object({
    tenant_id: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
    run_id: z.string().min(1).optional(),
    decision_id: Uuid.optional(),
    decision_uri: z.string().min(1).optional(),
    outcome: z.enum(["positive", "negative", "neutral"]),
    context: z.unknown(),
    candidates: z.array(z.string().min(1)).min(1).max(200),
    selected_tool: z.string().min(1),
    include_shadow: z.boolean().optional(),
    rules_limit: z.number().int().min(1).max(200).optional(),
    target: z.enum(["tool", "all"]).optional(),
    note: z.string().min(1).optional(),
    input_text: z.string().min(1).optional(),
    input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .refine((value) => Boolean(value.input_text || value.input_sha256), {
    message: "must set input_text or input_sha256",
  });

const ReplayRunStartArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid.optional(),
  goal: z.string().min(1),
  context_snapshot_ref: z.string().min(1).optional(),
  context_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  metadata: JsonRecord.optional(),
});

const ReplayStepBeforeArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid,
  step_id: Uuid.optional(),
  decision_id: Uuid.optional(),
  step_index: z.number().int().positive(),
  tool_name: z.string().min(1),
  tool_input: z.unknown(),
  expected_output_signature: z.unknown().optional(),
  preconditions: z.array(JsonRecord).optional(),
  retry_policy: JsonRecord.optional(),
  safety_level: z.enum(["auto_ok", "needs_confirm", "manual_only"]).optional(),
  metadata: JsonRecord.optional(),
});

const ReplayStepAfterArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid,
  step_id: Uuid.optional(),
  step_index: z.number().int().positive().optional(),
  status: z.enum(["success", "failed", "skipped", "partial"]),
  output_signature: z.unknown().optional(),
  postconditions: z.array(JsonRecord).optional(),
  artifact_refs: z.array(z.string().min(1)).max(200).optional(),
  repair_applied: z.boolean().optional(),
  repair_note: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  metadata: JsonRecord.optional(),
});

const ReplayRunEndArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid,
  status: z.enum(["success", "failed", "partial"]),
  summary: z.string().min(1).optional(),
  success_criteria: JsonRecord.optional(),
  metrics: JsonRecord.optional(),
  metadata: JsonRecord.optional(),
});

const ReplayRunGetArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: Uuid,
  include_steps: z.boolean().optional(),
  include_artifacts: z.boolean().optional(),
});

const PlaybookCompileArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  run_id: Uuid,
  playbook_id: Uuid.optional(),
  name: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
  matchers: JsonRecord.optional(),
  success_criteria: JsonRecord.optional(),
  risk_profile: z.enum(["low", "medium", "high"]).optional(),
  allow_partial: z.boolean().optional(),
  metadata: JsonRecord.optional(),
});

const PlaybookGetArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  playbook_id: Uuid,
});

const DeterministicGateArgs = z.object({
  enabled: z.boolean().optional(),
  prefer_deterministic_execution: z.boolean().optional(),
  on_mismatch: z.enum(["fallback", "reject"]).optional(),
  required_statuses: z.array(z.enum(["draft", "shadow", "active", "disabled"])).min(1).max(4).optional(),
  matchers: JsonRecord.optional(),
  policy_constraints: JsonRecord.optional(),
});

const PlaybookCandidateArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  playbook_id: Uuid,
  version: z.number().int().positive().optional(),
  deterministic_gate: DeterministicGateArgs.optional(),
});

const PlaybookPromoteArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  playbook_id: Uuid,
  from_version: z.number().int().positive().optional(),
  target_status: z.enum(["draft", "shadow", "active", "disabled"]),
  note: z.string().min(1).max(1000).optional(),
  metadata: JsonRecord.optional(),
});

const PlaybookRunArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project_id: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).optional(),
  playbook_id: Uuid,
  mode: z.enum(["strict", "guided", "simulate"]).optional(),
  version: z.number().int().positive().optional(),
  deterministic_gate: DeterministicGateArgs.optional(),
  params: JsonRecord.optional(),
  max_steps: z.number().int().positive().max(500).optional(),
});

const PlaybookDispatchArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project_id: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).optional(),
  playbook_id: Uuid,
  version: z.number().int().positive().optional(),
  deterministic_gate: DeterministicGateArgs.optional(),
  fallback_mode: z.enum(["strict", "guided", "simulate"]).optional(),
  execute_fallback: z.boolean().optional(),
  params: JsonRecord.optional(),
  max_steps: z.number().int().positive().max(500).optional(),
});

const SandboxSessionArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  profile: z.enum(["default", "restricted"]).optional(),
  ttl_seconds: z.number().int().positive().max(7 * 24 * 3600).optional(),
  metadata: JsonRecord.optional(),
});

const SandboxExecuteArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project_id: z.string().min(1).max(128).optional(),
  actor: z.string().min(1).optional(),
  session_id: Uuid,
  planner_run_id: z.string().min(1).optional(),
  decision_id: Uuid.optional(),
  mode: z.enum(["async", "sync"]).optional(),
  timeout_ms: z.number().int().positive().max(600_000).optional(),
  action: z.object({
    kind: z.literal("command"),
    argv: z.array(z.string().min(1)).min(1).max(64),
  }),
  metadata: JsonRecord.optional(),
});

const SandboxRunGetArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: Uuid,
});

const SandboxRunLogsArgs = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  run_id: Uuid,
  tail_bytes: z.number().int().positive().max(512_000).optional(),
});

async function callToolEndpoint(
  env: AionisDevEnv,
  tool: ToolDefinition,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  if (!tool.path) {
    return { isError: true, content: [{ type: "text", text: `tool_missing_path: ${tool.name}` }] };
  }

  const result = await postJson(env, tool.path, args);
  const text = tool.summarize ? tool.summarize(result, env) : stringifyResult(tool.name, result, env);
  return textResult(text);
}

async function handleCodexPlanningContext(env: AionisDevEnv, args: Record<string, unknown>): Promise<ToolResult> {
  const result = await postJson(env, "/v1/memory/planning/context", {
    ...args,
    return_layered_context: args.return_layered_context ?? true,
  });
  return textResult(summarizePlanningContext(result, env));
}

async function handleCodexFeedbackGate(env: AionisDevEnv, args: Record<string, unknown>): Promise<ToolResult> {
  const evaluation = evaluateCodexGate(CodexGateArgsSchema.parse(args));
  return textResult(clipText(JSON.stringify(evaluation, null, 2), env.AIONIS_MAX_TOOL_TEXT_CHARS));
}

async function handleCodexLearnFromRun(env: AionisDevEnv, args: Record<string, unknown>): Promise<ToolResult> {
  const result = await submitCodexLearnFromRun(env, CodexLearnFromRunArgsSchema.parse(args));
  return textResult(clipText(JSON.stringify(result, null, 2), env.AIONIS_MAX_TOOL_TEXT_CHARS));
}

async function handleStoreHandoff(env: AionisDevEnv, args: Record<string, unknown>): Promise<ToolResult> {
  const parsed = MemoryStoreHandoffArgs.parse(args);
  const nodeId = randomUUID();
  const handoffText = [
    `anchor=${parsed.anchor}`,
    `file=${parsed.file_path}`,
    parsed.symbol ? `symbol=${parsed.symbol}` : null,
    `kind=${parsed.handoff_kind}`,
    parsed.risk ? `risk=${parsed.risk}` : null,
    `summary=${parsed.summary}`,
    `handoff=${parsed.handoff_text}`,
    parsed.acceptance_checks && parsed.acceptance_checks.length > 0
      ? `acceptance_checks=${parsed.acceptance_checks.join(" | ")}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  const result = await postJson(env, "/v1/memory/write", {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    memory_lane: parsed.memory_lane ?? "shared",
    input_text: handoffText,
    nodes: [
      {
        id: nodeId,
        type: "event",
        title: parsed.title ?? `Handoff ${parsed.anchor}`,
        text_summary: parsed.summary,
        slots: {
          summary_kind: "handoff",
          handoff_kind: parsed.handoff_kind,
          anchor: parsed.anchor,
          file_path: parsed.file_path,
          repo_root: parsed.repo_root,
          symbol: parsed.symbol,
          risk: parsed.risk,
          handoff_text: parsed.handoff_text,
          acceptance_checks: parsed.acceptance_checks ?? [],
          tags: parsed.tags ?? [],
        },
      },
    ],
  });
  return textResult(summarizeStoreHandoff(result, env));
}

function buildHandoffRecallQuery(args: z.infer<typeof MemoryRecoverHandoffArgs>): string {
  return [
    args.anchor,
    args.file_path,
    args.symbol,
    args.handoff_kind,
    "patch handoff",
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

async function handleRecoverHandoff(env: AionisDevEnv, args: Record<string, unknown>): Promise<ToolResult> {
  const parsed = MemoryRecoverHandoffArgs.parse(args);
  const recall = await postJson(env, "/v1/memory/recall_text", {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    query_text: buildHandoffRecallQuery(parsed),
    limit: parsed.recall_limit ?? 10,
  });

  const slotsContains: Record<string, unknown> = {
    summary_kind: "handoff",
    handoff_kind: parsed.handoff_kind,
    anchor: parsed.anchor,
  };
  if (parsed.file_path) slotsContains.file_path = parsed.file_path;
  if (parsed.symbol) slotsContains.symbol = parsed.symbol;

  const find = await postJson(env, "/v1/memory/find", {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    type: "event",
    memory_lane: parsed.memory_lane,
    slots_contains: slotsContains,
    limit: parsed.limit ?? 5,
    include_meta: true,
    include_slots_preview: true,
  });

  const nodes = Array.isArray((find as any)?.nodes) ? ((find as any).nodes as Array<Record<string, unknown>>) : [];
  if (nodes.length === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: "handoff_not_found: no matching handoff artifact was found in scope" }],
    };
  }

  const ranked = [...nodes].sort((a, b) => {
    const aTime = typeof a.updated_at === "string" ? Date.parse(a.updated_at) : 0;
    const bTime = typeof b.updated_at === "string" ? Date.parse(b.updated_at) : 0;
    return bTime - aTime;
  });
  const target = ranked[0];
  const uri = typeof target.uri === "string" ? target.uri : null;
  if (!uri) {
    return {
      isError: true,
      content: [{ type: "text", text: "handoff_not_found: matching handoff node was missing a resolvable URI" }],
    };
  }

  const resolve = await postJson(env, "/v1/memory/resolve", {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    uri,
    include_meta: true,
    include_slots: true,
  });

  return textResult(summarizeRecoveredHandoff({ recall, find, resolve }, env));
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "aionis_memory_remember",
    title: "Aionis Remember",
    description: "Write development memory, evidence, or durable coding facts into Aionis.",
    path: "/v1/memory/write",
    argsSchema: MemoryRememberArgs,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        actor: { type: "string" },
        input_text: { type: "string" },
        memory_lane: { type: "string", enum: ["private", "shared"] },
        producer_agent_id: { type: "string" },
        owner_agent_id: { type: "string" },
        owner_team_id: { type: "string" },
        auto_embed: { type: "boolean" },
        force_reembed: { type: "boolean" },
        trigger_topic_cluster: { type: "boolean" },
        topic_cluster_async: { type: "boolean" },
        distill: { type: "object" },
        nodes: { type: "array", items: { type: "object" } },
        edges: { type: "array", items: { type: "object" } },
      },
      ["input_text", "nodes"],
    ),
  },
  {
    name: "aionis_memory_recall_text",
    title: "Aionis Recall Text",
    description: "Recall compact text context for the current coding task.",
    path: "/v1/memory/recall_text",
    argsSchema: MemoryRecallTextArgs,
    summarize: summarizeRecallText,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        query_text: { type: "string" },
        consumer_agent_id: { type: "string" },
        consumer_team_id: { type: "string" },
        limit: { type: "integer" },
        neighborhood_hops: { type: "integer" },
        max_nodes: { type: "integer" },
        max_edges: { type: "integer" },
        min_edge_weight: { type: "number" },
        min_edge_confidence: { type: "number" },
        rules_context: {},
        rules_include_shadow: { type: "boolean" },
        rules_limit: { type: "integer" },
      },
      ["query_text"],
    ),
  },
  {
    name: "aionis_memory_find",
    title: "Aionis Memory Find",
    description: "Find matching memory graph nodes before reading full payloads.",
    path: "/v1/memory/find",
    argsSchema: MemoryFindArgs,
    summarize: summarizeMemoryFind,
    inputSchema: schemaObject({
      tenant_id: { type: "string" },
      scope: { type: "string" },
      uri: { type: "string" },
      type: { type: "string" },
      id: { type: "string" },
      client_id: { type: "string" },
      title_contains: { type: "string" },
      text_contains: { type: "string" },
      memory_lane: { type: "string", enum: ["private", "shared"] },
      slots_contains: { type: "object" },
      consumer_agent_id: { type: "string" },
      consumer_team_id: { type: "string" },
      limit: { type: "integer" },
      offset: { type: "integer" },
      include_meta: { type: "boolean" },
      include_slots: { type: "boolean" },
      include_slots_preview: { type: "boolean" },
      slots_preview_keys: { type: "integer" },
    }),
  },
  {
    name: "aionis_memory_resolve",
    title: "Aionis Memory Resolve",
    description: "Resolve a memory graph URI into a full node, edge, commit, or decision payload.",
    path: "/v1/memory/resolve",
    argsSchema: MemoryResolveArgs,
    summarize: summarizeMemoryResolve,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        uri: { type: "string" },
        include_meta: { type: "boolean" },
        include_slots: { type: "boolean" },
        include_slots_preview: { type: "boolean" },
        slots_preview_keys: { type: "integer" },
      },
      ["uri"],
    ),
  },
  {
    name: "aionis_store_handoff",
    title: "Aionis Store Handoff",
    description: "Store a standardized cross-session handoff artifact in Aionis.",
    argsSchema: MemoryStoreHandoffArgs,
    handler: handleStoreHandoff,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        actor: { type: "string" },
        memory_lane: { type: "string", enum: ["private", "shared"] },
        anchor: { type: "string" },
        file_path: { type: "string" },
        repo_root: { type: "string" },
        symbol: { type: "string" },
        handoff_kind: { type: "string", enum: ["patch_handoff", "review_handoff", "task_handoff"] },
        title: { type: "string" },
        summary: { type: "string" },
        handoff_text: { type: "string" },
        risk: { type: "string" },
        acceptance_checks: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
      ["anchor", "file_path", "summary", "handoff_text"],
    ),
  },
  {
    name: "aionis_recover_handoff",
    title: "Aionis Recover Handoff",
    description: "Recover a standardized handoff artifact using recall plus exact object resolve.",
    argsSchema: MemoryRecoverHandoffArgs,
    handler: handleRecoverHandoff,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        anchor: { type: "string" },
        file_path: { type: "string" },
        symbol: { type: "string" },
        handoff_kind: { type: "string", enum: ["patch_handoff", "review_handoff", "task_handoff"] },
        memory_lane: { type: "string", enum: ["private", "shared"] },
        limit: { type: "integer" },
        recall_limit: { type: "integer" },
      },
      ["anchor"],
    ),
  },
  {
    name: "aionis_codex_planning_context",
    title: "Aionis Codex Planning Context",
    description: "Assemble coding-task context, memory recall, rules, and tool selection into one response.",
    argsSchema: CodexPlanningContextArgsSchema,
    handler: handleCodexPlanningContext,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        run_id: { type: "string" },
        query_text: { type: "string" },
        context: { type: "object" },
        tool_candidates: { type: "array", items: { type: "string" } },
        include_shadow: { type: "boolean" },
        rules_limit: { type: "integer" },
        tool_strict: { type: "boolean" },
        limit: { type: "integer" },
        neighborhood_hops: { type: "integer" },
        max_nodes: { type: "integer" },
        max_edges: { type: "integer" },
        context_token_budget: { type: "integer" },
        context_char_budget: { type: "integer" },
        context_compaction_profile: { type: "string", enum: ["balanced", "aggressive"] },
        return_layered_context: { type: "boolean" },
        context_layers: { type: "object" },
        static_context_blocks: { type: "array", items: { type: "object" } },
        static_injection: { type: "object" },
      },
      ["query_text", "context", "tool_candidates"],
    ),
  },
  {
    name: "aionis_tools_select",
    title: "Aionis Tool Select",
    description: "Apply Aionis tool policy to a candidate tool list.",
    path: "/v1/memory/tools/select",
    argsSchema: ToolsSelectArgs,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        run_id: { type: "string" },
        context: {},
        candidates: { type: "array", items: { type: "string" } },
        include_shadow: { type: "boolean" },
        rules_limit: { type: "integer" },
        strict: { type: "boolean" },
      },
      ["context", "candidates"],
    ),
    summarize: summarizeToolsSelect,
  },
  {
    name: "aionis_tools_decision",
    title: "Aionis Tool Decision",
    description: "Fetch a recorded tool decision by id, uri, or run id.",
    path: "/v1/memory/tools/decision",
    argsSchema: ToolsDecisionArgs,
    inputSchema: schemaObject({
      tenant_id: { type: "string" },
      scope: { type: "string" },
      decision_id: { type: "string" },
      decision_uri: { type: "string" },
      run_id: { type: "string" },
    }),
    summarize: summarizeToolsDecision,
  },
  {
    name: "aionis_tools_run",
    title: "Aionis Tool Run Lifecycle",
    description: "Get tool-decision lifecycle details for a run.",
    path: "/v1/memory/tools/run",
    argsSchema: ToolsRunArgs,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        run_id: { type: "string" },
        decision_limit: { type: "integer" },
        include_feedback: { type: "boolean" },
        feedback_limit: { type: "integer" },
      },
      ["run_id"],
    ),
    summarize: summarizeToolsRun,
  },
  {
    name: "aionis_tools_feedback",
    title: "Aionis Tool Feedback",
    description: "Record tool-selection outcome feedback for future learning.",
    path: "/v1/memory/tools/feedback",
    argsSchema: ToolsFeedbackArgs,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        actor: { type: "string" },
        run_id: { type: "string" },
        decision_id: { type: "string" },
        decision_uri: { type: "string" },
        outcome: { type: "string", enum: ["positive", "negative", "neutral"] },
        context: {},
        candidates: { type: "array", items: { type: "string" } },
        selected_tool: { type: "string" },
        include_shadow: { type: "boolean" },
        rules_limit: { type: "integer" },
        target: { type: "string", enum: ["tool", "all"] },
        note: { type: "string" },
        input_text: { type: "string" },
        input_sha256: { type: "string" },
      },
      ["outcome", "context", "candidates", "selected_tool"],
    ),
  },
  {
    name: "aionis_codex_feedback_gate",
    title: "Aionis Codex Feedback Gate",
    description: "Evaluate whether a coding run is eligible for learning.",
    argsSchema: CodexGateArgsSchema,
    handler: handleCodexFeedbackGate,
    inputSchema: schemaObject(
      {
        task_completed: { type: "boolean" },
        tests_status: { type: "string", enum: ["pass", "fail", "not_run"] },
        lint_status: { type: "string", enum: ["pass", "fail", "not_run"] },
        build_status: { type: "string", enum: ["pass", "fail", "not_run"] },
        regression_detected: { type: "boolean" },
        sandbox_status: { type: "string", enum: ["succeeded", "failed", "not_used"] },
        review_findings_count: { type: "integer" },
        changed_files_count: { type: "integer" },
        risky_surface: { type: "boolean" },
        notes: { type: "array", items: { type: "string" } },
      },
      ["task_completed"],
    ),
  },
  {
    name: "aionis_codex_learn_from_run",
    title: "Aionis Codex Learn From Run",
    description: "Apply the quality gate, submit feedback, and optionally compile a playbook from a successful run.",
    argsSchema: CodexLearnFromRunArgsSchema,
    handler: handleCodexLearnFromRun,
    inputSchema: schemaObject(
      {
        tenant_id: { type: "string" },
        scope: { type: "string" },
        actor: { type: "string" },
        run_id: { type: "string" },
        quality_gate: { type: "object" },
        feedback: { type: "object" },
        compile: { type: "object" },
      },
      ["run_id", "quality_gate"],
    ),
  },
  {
    name: "aionis_replay_run_start",
    title: "Aionis Replay Run Start",
    description: "Open a replay-capture run envelope for a task.",
    path: "/v1/memory/replay/run/start",
    argsSchema: ReplayRunStartArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, run_id: { type: "string" }, goal: { type: "string" }, context_snapshot_ref: { type: "string" }, context_snapshot_hash: { type: "string" }, metadata: { type: "object" } }, ["goal"]),
  },
  {
    name: "aionis_replay_step_before",
    title: "Aionis Replay Step Before",
    description: "Record the intent and expected signature before a step runs.",
    path: "/v1/memory/replay/step/before",
    argsSchema: ReplayStepBeforeArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, run_id: { type: "string" }, step_id: { type: "string" }, decision_id: { type: "string" }, step_index: { type: "integer" }, tool_name: { type: "string" }, tool_input: {}, expected_output_signature: {}, preconditions: { type: "array", items: { type: "object" } }, retry_policy: { type: "object" }, safety_level: { type: "string", enum: ["auto_ok", "needs_confirm", "manual_only"] }, metadata: { type: "object" } }, ["run_id", "step_index", "tool_name", "tool_input"]),
  },
  {
    name: "aionis_replay_step_after",
    title: "Aionis Replay Step After",
    description: "Record a step result after the action finished.",
    path: "/v1/memory/replay/step/after",
    argsSchema: ReplayStepAfterArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, run_id: { type: "string" }, step_id: { type: "string" }, step_index: { type: "integer" }, status: { type: "string", enum: ["success", "failed", "skipped", "partial"] }, output_signature: {}, postconditions: { type: "array", items: { type: "object" } }, artifact_refs: { type: "array", items: { type: "string" } }, repair_applied: { type: "boolean" }, repair_note: { type: "string" }, error: { type: "string" }, metadata: { type: "object" } }, ["run_id", "status"]),
  },
  {
    name: "aionis_replay_run_end",
    title: "Aionis Replay Run End",
    description: "Close a replay run with final outcome metadata.",
    path: "/v1/memory/replay/run/end",
    argsSchema: ReplayRunEndArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, run_id: { type: "string" }, status: { type: "string", enum: ["success", "failed", "partial"] }, summary: { type: "string" }, success_criteria: { type: "object" }, metrics: { type: "object" }, metadata: { type: "object" } }, ["run_id", "status"]),
  },
  {
    name: "aionis_replay_run_get",
    title: "Aionis Replay Run Get",
    description: "Fetch a replay run and optionally its steps and artifacts.",
    path: "/v1/memory/replay/runs/get",
    argsSchema: ReplayRunGetArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, run_id: { type: "string" }, include_steps: { type: "boolean" }, include_artifacts: { type: "boolean" } }, ["run_id"]),
  },
  {
    name: "aionis_playbook_compile_from_run",
    title: "Aionis Playbook Compile From Run",
    description: "Compile a reusable playbook from a replay run.",
    path: "/v1/memory/replay/playbooks/compile_from_run",
    argsSchema: PlaybookCompileArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, run_id: { type: "string" }, playbook_id: { type: "string" }, name: { type: "string" }, version: { type: "integer" }, matchers: { type: "object" }, success_criteria: { type: "object" }, risk_profile: { type: "string", enum: ["low", "medium", "high"] }, allow_partial: { type: "boolean" }, metadata: { type: "object" } }, ["run_id"]),
  },
  {
    name: "aionis_playbook_get",
    title: "Aionis Playbook Get",
    description: "Fetch a playbook by id.",
    path: "/v1/memory/replay/playbooks/get",
    argsSchema: PlaybookGetArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, playbook_id: { type: "string" } }, ["playbook_id"]),
  },
  {
    name: "aionis_playbook_candidate",
    title: "Aionis Playbook Candidate",
    description: "Evaluate whether a playbook is eligible for deterministic replay before invoking the main planner path.",
    path: "/v1/memory/replay/playbooks/candidate",
    argsSchema: PlaybookCandidateArgs,
    inputSchema: schemaObject({
      tenant_id: { type: "string" },
      scope: { type: "string" },
      playbook_id: { type: "string" },
      version: { type: "integer" },
      deterministic_gate: { type: "object" },
    }, ["playbook_id"]),
  },
  {
    name: "aionis_playbook_promote",
    title: "Aionis Playbook Promote",
    description: "Promote or disable a compiled playbook version.",
    path: "/v1/memory/replay/playbooks/promote",
    argsSchema: PlaybookPromoteArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, playbook_id: { type: "string" }, from_version: { type: "integer" }, target_status: { type: "string", enum: ["draft", "shadow", "active", "disabled"] }, note: { type: "string" }, metadata: { type: "object" } }, ["playbook_id", "target_status"]),
  },
  {
    name: "aionis_playbook_run",
    title: "Aionis Playbook Run",
    description: "Execute a playbook in strict, guided, or simulate mode.",
    path: "/v1/memory/replay/playbooks/run",
    argsSchema: PlaybookRunArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, project_id: { type: "string" }, actor: { type: "string" }, playbook_id: { type: "string" }, mode: { type: "string", enum: ["strict", "guided", "simulate"] }, version: { type: "integer" }, deterministic_gate: { type: "object" }, params: { type: "object" }, max_steps: { type: "integer" } }, ["playbook_id"]),
  },
  {
    name: "aionis_playbook_dispatch",
    title: "Aionis Playbook Dispatch",
    description: "Run candidate lookup plus deterministic replay or fallback replay in one step.",
    path: "/v1/memory/replay/playbooks/dispatch",
    argsSchema: PlaybookDispatchArgs,
    inputSchema: schemaObject({
      tenant_id: { type: "string" },
      scope: { type: "string" },
      project_id: { type: "string" },
      actor: { type: "string" },
      playbook_id: { type: "string" },
      version: { type: "integer" },
      deterministic_gate: { type: "object" },
      fallback_mode: { type: "string", enum: ["strict", "guided", "simulate"] },
      execute_fallback: { type: "boolean" },
      params: { type: "object" },
      max_steps: { type: "integer" },
    }, ["playbook_id"]),
  },
  {
    name: "aionis_sandbox_create_session",
    title: "Aionis Sandbox Create Session",
    description: "Create a sandbox session for command execution.",
    path: "/v1/memory/sandbox/sessions",
    argsSchema: SandboxSessionArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, actor: { type: "string" }, profile: { type: "string", enum: ["default", "restricted"] }, ttl_seconds: { type: "integer" }, metadata: { type: "object" } }),
  },
  {
    name: "aionis_sandbox_execute",
    title: "Aionis Sandbox Execute",
    description: "Queue or synchronously execute one sandbox command.",
    path: "/v1/memory/sandbox/execute",
    argsSchema: SandboxExecuteArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, project_id: { type: "string" }, actor: { type: "string" }, session_id: { type: "string" }, planner_run_id: { type: "string" }, decision_id: { type: "string" }, mode: { type: "string", enum: ["async", "sync"] }, timeout_ms: { type: "integer" }, action: { type: "object" }, metadata: { type: "object" } }, ["session_id", "action"]),
  },
  {
    name: "aionis_sandbox_run_get",
    title: "Aionis Sandbox Run Get",
    description: "Fetch a sandbox run status.",
    path: "/v1/memory/sandbox/runs/get",
    argsSchema: SandboxRunGetArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, run_id: { type: "string" } }, ["run_id"]),
  },
  {
    name: "aionis_sandbox_run_logs",
    title: "Aionis Sandbox Run Logs",
    description: "Fetch tail logs for a sandbox run.",
    path: "/v1/memory/sandbox/runs/logs",
    argsSchema: SandboxRunLogsArgs,
    inputSchema: schemaObject({ tenant_id: { type: "string" }, scope: { type: "string" }, run_id: { type: "string" }, tail_bytes: { type: "integer" } }, ["run_id"]),
  },
];

export async function invokeTool(
  env: AionisDevEnv,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const tool = TOOL_DEFINITIONS.find((entry) => entry.name === name);
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `unknown_tool: ${name}` }] };
  }

  const args = sanitizeToolArgs(rawArgs);
  const parsed = tool.argsSchema.safeParse(args);
  if (!parsed.success) {
    return invalidArgs(parsed.error);
  }

  try {
    if (tool.handler) {
      return await tool.handler(env, parsed.data as Record<string, unknown>);
    }
    return await callToolEndpoint(env, tool, parsed.data as Record<string, unknown>);
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: clipText(
              `aionis_http_error: ${error.status}\n${JSON.stringify(error.body, null, 2)}`,
              env.AIONIS_MAX_TOOL_TEXT_CHARS,
            ),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: clipText(String((error as Error).message), env.AIONIS_MAX_TOOL_TEXT_CHARS) }],
    };
  }
}
