import { z, type ZodTypeAny } from "zod";
import { type AionisDevEnv, HttpError, clipText, postJson } from "./client.js";
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

function stringifyResult(toolName: string, result: unknown, env: AionisDevEnv): string {
  return clipText(`${toolName} result\n${JSON.stringify(result, null, 2)}`, env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function summarizeRecallText(result: any, env: AionisDevEnv): string {
  const text = typeof result?.context?.text === "string" ? result.context.text : JSON.stringify(result, null, 2);
  return clipText(text, env.AIONIS_MAX_TOOL_TEXT_CHARS);
}

function summarizePlanningContext(result: any, env: AionisDevEnv): string {
  const selected = result?.tools?.selection?.selected;
  const decisionId = result?.tools?.decision?.decision_id;
  const merged = typeof result?.layered_context?.merged_text === "string" ? result.layered_context.merged_text : "";
  const recallText = typeof result?.recall?.context?.text === "string" ? result.recall.context.text : "";
  const text = merged || recallText || JSON.stringify(result, null, 2);

  return clipText(
    [selected ? `selected_tool: ${selected}` : null, decisionId ? `decision_id: ${decisionId}` : null, text]
      .filter(Boolean)
      .join("\n\n"),
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
    path: "/v1/memory/replay/run/get",
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

  const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
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
