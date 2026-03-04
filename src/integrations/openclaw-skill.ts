import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AionisClient } from "../sdk/client.js";
import type {
  AionisClientOptions,
  ContextAssembleInput,
  ContextAssembleResponse,
  RequestOptions,
  RulesEvaluateInput,
  RulesEvaluateResponse,
  ToolsFeedbackInput,
  ToolsSelectInput,
  ToolsSelectResponse,
} from "../sdk/types.js";

type MemoryAction = "memory.write" | "memory.context" | "memory.policy" | "memory.feedback";

type BudgetPresetConfig = {
  char_budget_total: number;
  max_items_by_layer: Record<string, number>;
};

const BUDGET_PRESETS: Record<OpenClawBudgetPreset, BudgetPresetConfig> = {
  tiny: {
    char_budget_total: 1600,
    max_items_by_layer: {
      facts: 6,
      episodes: 4,
      rules: 4,
      decisions: 3,
      tools: 3,
      citations: 6,
    },
  },
  normal: {
    char_budget_total: 3200,
    max_items_by_layer: {
      facts: 10,
      episodes: 8,
      rules: 6,
      decisions: 5,
      tools: 5,
      citations: 10,
    },
  },
  large: {
    char_budget_total: 6400,
    max_items_by_layer: {
      facts: 18,
      episodes: 14,
      rules: 10,
      decisions: 8,
      tools: 8,
      citations: 18,
    },
  },
};

const ACTION_SCHEMA = z.enum(["memory.write", "memory.context", "memory.policy", "memory.feedback"]);

const WRITE_INPUT_SCHEMA = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project: z.string().min(1),
  run_id: z.string().min(1).optional(),
  kind: z.enum(["event", "tool_result", "decision"]).default("event"),
  node_type: z
    .enum(["event", "entity", "topic", "rule", "evidence", "concept", "procedure", "self_model"])
    .default("event"),
  text: z.string().min(1),
  title: z.string().min(1).optional(),
  tool_name: z.string().min(1).optional(),
  memory_lane: z.enum(["private", "shared"]).default("shared"),
  producer_agent_id: z.string().min(1).optional(),
  owner_agent_id: z.string().min(1).optional(),
  owner_team_id: z.string().min(1).optional(),
  auto_embed: z.boolean().default(true),
  force_reembed: z.boolean().optional(),
  trigger_topic_cluster: z.boolean().optional(),
  topic_cluster_async: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  request: z.custom<RequestOptions>().optional(),
});

const CONTEXT_INPUT_SCHEMA = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project: z.string().min(1),
  run_id: z.string().min(1).optional(),
  query_text: z.string().min(1),
  budget: z.enum(["tiny", "normal", "large"]).default("normal"),
  recall_strategy: z.enum(["local", "balanced", "global"]).optional(),
  consumer_agent_id: z.string().min(1).optional(),
  consumer_team_id: z.string().min(1).optional(),
  context: z.unknown().optional(),
  include_shadow: z.boolean().default(false),
  include_rules: z.boolean().default(true),
  rules_limit: z.number().int().positive().max(200).optional(),
  tool_candidates: z.array(z.string().min(1)).max(200).optional(),
  tool_strict: z.boolean().optional(),
  request: z.custom<RequestOptions>().optional(),
});

const POLICY_INPUT_SCHEMA = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project: z.string().min(1),
  run_id: z.string().min(1).optional(),
  mode: z.enum(["tools_select", "rules_evaluate"]).default("tools_select"),
  context: z.unknown(),
  candidate_tools: z.array(z.string().min(1)).max(200).optional(),
  include_shadow: z.boolean().default(false),
  rules_limit: z.number().int().positive().max(200).optional(),
  strict: z.boolean().default(false),
  request: z.custom<RequestOptions>().optional(),
});

const FEEDBACK_INPUT_SCHEMA = z.object({
  tenant_id: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  project: z.string().min(1),
  run_id: z.string().min(1).optional(),
  decision_id: z.string().uuid().optional(),
  decision_uri: z.string().min(1).optional(),
  outcome: z.enum(["positive", "negative", "neutral"]),
  context: z.unknown(),
  candidate_tools: z.array(z.string().min(1)).min(1).max(200),
  selected_tool: z.string().min(1),
  include_shadow: z.boolean().default(false),
  rules_limit: z.number().int().positive().max(200).optional(),
  target: z.enum(["tool", "all"]).default("tool"),
  note: z.string().min(1).optional(),
  input_text: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  request: z.custom<RequestOptions>().optional(),
});

export type OpenClawBudgetPreset = "tiny" | "normal" | "large";
export type OpenClawPolicyMode = "tools_select" | "rules_evaluate";

export type OpenClawSkillOptions = {
  client: AionisClient;
  default_tenant_id?: string;
  default_scope?: string;
  scope_prefix?: string;
  include_shadow?: boolean;
  rules_limit?: number;
};

export type OpenClawMemoryWriteInput = z.input<typeof WRITE_INPUT_SCHEMA>;
export type OpenClawMemoryContextInput = z.input<typeof CONTEXT_INPUT_SCHEMA>;
export type OpenClawMemoryPolicyInput = z.input<typeof POLICY_INPUT_SCHEMA>;
export type OpenClawMemoryFeedbackInput = z.input<typeof FEEDBACK_INPUT_SCHEMA>;

export type OpenClawWriteOutput = {
  action: "memory.write";
  tenant_id: string | null;
  scope: string;
  project: string;
  kind: "event" | "tool_result" | "decision";
  run_id: string | null;
  node: {
    id: string | null;
    uri: string | null;
    client_id: string;
    type: string;
  };
  commit: {
    id: string;
    uri: string | null;
    hash: string;
  };
  request_id: string | null;
};

export type OpenClawContextOutput = {
  action: "memory.context";
  tenant_id: string | null;
  scope: string;
  project: string;
  budget: OpenClawBudgetPreset;
  query_text: string;
  merged_text: string;
  layer_order: string[];
  layers: ContextAssembleResponse["layered_context"];
  citations: Array<Record<string, unknown>>;
  policy_patch: Record<string, unknown> | null;
  selected_tool: string | null;
  decision_id: string | null;
  decision_uri: string | null;
  request_id: string | null;
};

export type OpenClawPolicyOutput = {
  action: "memory.policy";
  mode: OpenClawPolicyMode;
  tenant_id: string | null;
  scope: string;
  project: string;
  selected_tool: string | null;
  ordered_tools: string[];
  denied_tools: Array<{ name: string; reason: string }>;
  policy_patch: Record<string, unknown>;
  decision_id: string | null;
  decision_uri: string | null;
  considered_rules: number | null;
  matched_rules: number | null;
  request_id: string | null;
};

export type OpenClawFeedbackOutput = {
  action: "memory.feedback";
  tenant_id: string | null;
  scope: string;
  project: string;
  run_id: string | null;
  updated_rules: number;
  decision_id: string | null;
  decision_uri: string | null;
  decision_link_mode: string | null;
  commit_id: string | null;
  commit_uri: string | null;
  request_id: string | null;
};

export type OpenClawDispatchOutput = OpenClawWriteOutput | OpenClawContextOutput | OpenClawPolicyOutput | OpenClawFeedbackOutput;

function normalizeScopeSegment(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return normalized.length > 0 ? normalized : "default";
}

function parseMemoryApiKeyFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const direct = (env.AIONIS_API_KEY ?? env.API_KEY ?? env.PERF_API_KEY ?? "").trim();
  if (direct.length > 0) return direct;

  const raw = env.MEMORY_API_KEYS_JSON;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const first = Object.keys(parsed as Record<string, unknown>).find((k) => k.trim().length > 0);
    return first ? first.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function createOpenClawSkillFromEnv(env: NodeJS.ProcessEnv = process.env): OpenClawMemorySkill {
  const client = new AionisClient(createOpenClawClientOptionsFromEnv(env));

  return new OpenClawMemorySkill({
    client,
    default_tenant_id: (env.AIONIS_TENANT_ID ?? env.TENANT_ID ?? "").trim() || undefined,
    default_scope: (env.AIONIS_SCOPE ?? env.MEMORY_SCOPE ?? "").trim() || undefined,
    scope_prefix: (env.OPENCLAW_SCOPE_PREFIX ?? "clawbot").trim() || undefined,
    include_shadow: ["1", "true", "yes", "on"].includes(String(env.OPENCLAW_INCLUDE_SHADOW ?? "").toLowerCase()),
    rules_limit: Number(env.OPENCLAW_RULES_LIMIT ?? 50),
  });
}

export class OpenClawMemorySkill {
  private readonly client: AionisClient;
  private readonly defaultTenantId: string | undefined;
  private readonly defaultScope: string | undefined;
  private readonly scopePrefix: string;
  private readonly includeShadow: boolean;
  private readonly rulesLimit: number;

  constructor(opts: OpenClawSkillOptions) {
    this.client = opts.client;
    this.defaultTenantId = opts.default_tenant_id?.trim() || undefined;
    this.defaultScope = opts.default_scope?.trim() || undefined;
    this.scopePrefix = opts.scope_prefix?.trim() || "clawbot";
    this.includeShadow = typeof opts.include_shadow === "boolean" ? opts.include_shadow : false;
    this.rulesLimit = Number.isFinite(opts.rules_limit) ? Math.max(1, Math.min(200, Math.trunc(opts.rules_limit!))) : 50;
  }

  async invoke(action: MemoryAction | string, input: unknown): Promise<OpenClawDispatchOutput> {
    const parsedAction = ACTION_SCHEMA.parse(action);
    switch (parsedAction) {
      case "memory.write":
        return this.write(input);
      case "memory.context":
        return this.context(input);
      case "memory.policy":
        return this.policy(input);
      case "memory.feedback":
        return this.feedback(input);
      default:
        throw new Error(`Unsupported action: ${parsedAction}`);
    }
  }

  async write(input: unknown): Promise<OpenClawWriteOutput> {
    const parsed = WRITE_INPUT_SCHEMA.parse(input);
    const scope = this.resolveScope(parsed.project, parsed.scope);
    const tenantId = this.resolveTenant(parsed.tenant_id);

    const clientId = `oc_${parsed.kind}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const slots: Record<string, unknown> = {
      integration: "openclaw",
      kind: parsed.kind,
      project: parsed.project,
    };
    if (parsed.run_id) slots.run_id = parsed.run_id;
    if (parsed.tool_name) slots.tool_name = parsed.tool_name;
    if (parsed.metadata) slots.metadata = parsed.metadata;

    const out = await this.client.write(
      {
        tenant_id: tenantId ?? undefined,
        scope,
        input_text: parsed.text,
        auto_embed: parsed.auto_embed,
        force_reembed: parsed.force_reembed,
        trigger_topic_cluster: parsed.trigger_topic_cluster,
        topic_cluster_async: parsed.topic_cluster_async,
        memory_lane: parsed.memory_lane,
        producer_agent_id: parsed.producer_agent_id,
        owner_agent_id: parsed.owner_agent_id,
        owner_team_id: parsed.owner_team_id,
        nodes: [
          {
            client_id: clientId,
            type: parsed.node_type,
            title: parsed.title,
            text_summary: parsed.text,
            memory_lane: parsed.memory_lane,
            producer_agent_id: parsed.producer_agent_id,
            owner_agent_id: parsed.owner_agent_id,
            owner_team_id: parsed.owner_team_id,
            slots,
          },
        ],
        edges: [],
      },
      parsed.request,
    );

    const node = out.data.nodes[0];
    return {
      action: "memory.write",
      tenant_id: tenantId,
      scope,
      project: parsed.project,
      kind: parsed.kind,
      run_id: parsed.run_id ?? null,
      node: {
        id: node?.id ?? null,
        uri: typeof node?.uri === "string" ? node.uri : null,
        client_id: node?.client_id ?? clientId,
        type: node?.type ?? parsed.node_type,
      },
      commit: {
        id: out.data.commit_id,
        uri: out.data.commit_uri ?? null,
        hash: out.data.commit_hash,
      },
      request_id: out.request_id,
    };
  }

  async context(input: unknown): Promise<OpenClawContextOutput> {
    const parsed = CONTEXT_INPUT_SCHEMA.parse(input);
    const scope = this.resolveScope(parsed.project, parsed.scope);
    const tenantId = this.resolveTenant(parsed.tenant_id);
    const budget = BUDGET_PRESETS[parsed.budget];

    const assembleInput: ContextAssembleInput = {
      tenant_id: tenantId ?? undefined,
      scope,
      query_text: parsed.query_text,
      context: parsed.context,
      recall_strategy: parsed.recall_strategy,
      consumer_agent_id: parsed.consumer_agent_id,
      consumer_team_id: parsed.consumer_team_id,
      include_rules: parsed.include_rules,
      include_shadow: parsed.include_shadow ?? this.includeShadow,
      rules_limit: parsed.rules_limit ?? this.rulesLimit,
      tool_candidates: parsed.tool_candidates,
      tool_strict: parsed.tool_strict ?? false,
      limit: 30,
      neighborhood_hops: 2,
      return_debug: false,
      include_embeddings: false,
      include_meta: false,
      include_slots: false,
      include_slots_preview: false,
      slots_preview_keys: 10,
      max_nodes: 50,
      max_edges: 100,
      ranked_limit: 100,
      min_edge_weight: 0,
      min_edge_confidence: 0,
      return_layered_context: true,
      context_layers: {
        enabled: ["facts", "episodes", "rules", "decisions", "tools", "citations"],
        char_budget_total: budget.char_budget_total,
        max_items_by_layer: budget.max_items_by_layer,
        include_merge_trace: true,
      },
    };

    const out = await this.client.contextAssemble(assembleInput, parsed.request);
    const citations = Array.isArray(out.data.recall?.context?.citations)
      ? (out.data.recall.context.citations as Array<Record<string, unknown>>)
      : [];
    const policyPatch = this.extractPolicyPatch(out.data.rules, out.data.tools);

    return {
      action: "memory.context",
      tenant_id: tenantId,
      scope,
      project: parsed.project,
      budget: parsed.budget,
      query_text: parsed.query_text,
      merged_text: out.data.layered_context?.merged_text ?? out.data.recall?.context?.text ?? "",
      layer_order: out.data.layered_context?.order ?? [],
      layers: out.data.layered_context,
      citations,
      policy_patch: policyPatch,
      selected_tool: this.extractSelectedTool(out.data.tools),
      decision_id: this.extractDecisionId(out.data.tools),
      decision_uri: this.extractDecisionUri(out.data.tools),
      request_id: out.request_id,
    };
  }

  async policy(input: unknown): Promise<OpenClawPolicyOutput> {
    const parsed = POLICY_INPUT_SCHEMA.parse(input);
    const scope = this.resolveScope(parsed.project, parsed.scope);
    const tenantId = this.resolveTenant(parsed.tenant_id);

    if (parsed.mode === "rules_evaluate") {
      const req: RulesEvaluateInput = {
        tenant_id: tenantId ?? undefined,
        scope,
        context: parsed.context,
        include_shadow: parsed.include_shadow ?? this.includeShadow,
        limit: parsed.rules_limit ?? this.rulesLimit,
      };
      const out = await this.client.rulesEvaluate(req, parsed.request);
      return {
        action: "memory.policy",
        mode: "rules_evaluate",
        tenant_id: tenantId,
        scope,
        project: parsed.project,
        selected_tool: null,
        ordered_tools: [],
        denied_tools: [],
        policy_patch: out.data.applied ?? {},
        decision_id: null,
        decision_uri: null,
        considered_rules: out.data.considered ?? null,
        matched_rules: out.data.matched ?? null,
        request_id: out.request_id,
      };
    }

    const candidates = parsed.candidate_tools ?? [];
    if (candidates.length === 0) {
      throw new Error("candidate_tools is required when mode=tools_select");
    }

    const req: ToolsSelectInput = {
      tenant_id: tenantId ?? undefined,
      scope,
      run_id: parsed.run_id,
      context: parsed.context,
      candidates,
      include_shadow: parsed.include_shadow ?? this.includeShadow,
      rules_limit: parsed.rules_limit ?? this.rulesLimit,
      strict: parsed.strict,
    };

    const out = await this.client.toolsSelect(req, parsed.request);
    const policyPatch = this.extractPolicyPatch(undefined, out.data) ?? {};

    return {
      action: "memory.policy",
      mode: "tools_select",
      tenant_id: tenantId,
      scope,
      project: parsed.project,
      selected_tool: out.data.selection?.selected ?? null,
      ordered_tools: out.data.selection?.ordered ?? [],
      denied_tools: Array.isArray(out.data.selection?.denied)
        ? (out.data.selection.denied as Array<{ name: string; reason: string }>)
        : [],
      policy_patch: policyPatch,
      decision_id: out.data.decision?.decision_id ?? null,
      decision_uri: out.data.decision?.decision_uri ?? null,
      considered_rules: this.extractConsideredRules(out.data.rules),
      matched_rules: this.extractMatchedRules(out.data.rules),
      request_id: out.request_id,
    };
  }

  async feedback(input: unknown): Promise<OpenClawFeedbackOutput> {
    const parsed = FEEDBACK_INPUT_SCHEMA.parse(input);
    const scope = this.resolveScope(parsed.project, parsed.scope);
    const tenantId = this.resolveTenant(parsed.tenant_id);
    const baseInputText = parsed.input_text ?? `openclaw feedback: outcome=${parsed.outcome} selected=${parsed.selected_tool}`;

    const req: ToolsFeedbackInput = {
      tenant_id: tenantId ?? undefined,
      scope,
      actor: parsed.actor,
      run_id: parsed.run_id,
      decision_id: parsed.decision_id,
      decision_uri: parsed.decision_uri,
      outcome: parsed.outcome,
      context: parsed.context,
      candidates: parsed.candidate_tools,
      selected_tool: parsed.selected_tool,
      include_shadow: parsed.include_shadow ?? this.includeShadow,
      rules_limit: parsed.rules_limit ?? this.rulesLimit,
      target: parsed.target,
      note: parsed.note,
      input_text: baseInputText,
    };

    const out = await this.client.toolsFeedback(req, parsed.request);
    return {
      action: "memory.feedback",
      tenant_id: tenantId,
      scope,
      project: parsed.project,
      run_id: parsed.run_id ?? null,
      updated_rules: out.data.updated_rules,
      decision_id: out.data.decision_id ?? null,
      decision_uri: out.data.decision_uri ?? null,
      decision_link_mode: out.data.decision_link_mode ?? null,
      commit_id: out.data.commit_id ?? null,
      commit_uri: out.data.commit_uri ?? null,
      request_id: out.request_id,
    };
  }

  private resolveTenant(tenantId: string | undefined): string | null {
    const t = tenantId?.trim() || this.defaultTenantId;
    return t && t.length > 0 ? t : null;
  }

  private resolveScope(project: string, scope: string | undefined): string {
    const explicit = scope?.trim();
    if (explicit) return explicit;
    if (this.defaultScope) return this.defaultScope;
    const normalizedProject = normalizeScopeSegment(project);
    return `${this.scopePrefix}:${normalizedProject}`;
  }

  private extractPolicyPatch(
    rules: RulesEvaluateResponse | undefined,
    tools: ToolsSelectResponse | undefined,
  ): Record<string, unknown> | null {
    if (rules && rules.applied && typeof rules.applied === "object") {
      return rules.applied as Record<string, unknown>;
    }

    if (!tools || !tools.rules || typeof tools.rules !== "object") return null;
    const maybeApplied = (tools.rules as Record<string, unknown>).applied;
    if (maybeApplied && typeof maybeApplied === "object") {
      return maybeApplied as Record<string, unknown>;
    }

    return null;
  }

  private extractSelectedTool(tools: ToolsSelectResponse | undefined): string | null {
    if (!tools || !tools.selection || typeof tools.selection !== "object") return null;
    return typeof tools.selection.selected === "string" ? tools.selection.selected : null;
  }

  private extractDecisionId(tools: ToolsSelectResponse | undefined): string | null {
    if (!tools || !tools.decision || typeof tools.decision !== "object") return null;
    return typeof tools.decision.decision_id === "string" ? tools.decision.decision_id : null;
  }

  private extractDecisionUri(tools: ToolsSelectResponse | undefined): string | null {
    if (!tools || !tools.decision || typeof tools.decision !== "object") return null;
    return typeof tools.decision.decision_uri === "string" ? tools.decision.decision_uri : null;
  }

  private extractConsideredRules(rulesObj: unknown): number | null {
    if (!rulesObj || typeof rulesObj !== "object") return null;
    const raw = (rulesObj as Record<string, unknown>).considered;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }

  private extractMatchedRules(rulesObj: unknown): number | null {
    if (!rulesObj || typeof rulesObj !== "object") return null;
    const raw = (rulesObj as Record<string, unknown>).matched;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
}

export function createOpenClawClientOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AionisClientOptions {
  const port = (env.PORT ?? "3001").trim() || "3001";
  const baseUrl = (env.AIONIS_BASE_URL ?? `http://localhost:${port}`).trim();
  const timeoutMs = Number(env.AIONIS_TIMEOUT_MS ?? 10_000);

  return {
    base_url: baseUrl,
    timeout_ms: Number.isFinite(timeoutMs) ? Math.max(1000, Math.trunc(timeoutMs)) : 10_000,
    api_key: parseMemoryApiKeyFromEnv(env),
    auth_bearer: (env.AIONIS_AUTH_BEARER ?? env.AUTH_BEARER ?? env.PERF_AUTH_BEARER ?? "").trim() || undefined,
    admin_token: (env.AIONIS_ADMIN_TOKEN ?? env.ADMIN_TOKEN ?? "").trim() || undefined,
  };
}
