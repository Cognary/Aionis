import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { buildRecallObservability, collectRecallTrajectoryUriLinks } from "../app/recall-observability.js";
import { applyContextOptimizationProfile } from "../app/context-optimization-profile.js";
import { buildAssemblySummary, buildPlanningSummary } from "../app/planning-summary.js";
import { createEmbeddingSurfacePolicy, type EmbeddingSurfacePolicy } from "../embeddings/surface-policy.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { buildLayeredContextCostSignals } from "../memory/cost-signals.js";
import { memoryRecallParsed, type RecallAuth } from "../memory/recall.js";
import { ContextAssembleRequest, MemoryRecallRequest, MemoryRecallTextRequest, PlanningContextRequest } from "../memory/schemas.js";
import {
  resolveExecutionPacketAssembly,
  type ExecutionPacketAssemblyMode,
  type ExecutionPacketV1,
  type ExecutionStateV1,
} from "../execution/index.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { selectTools } from "../memory/tools-select.js";
import { estimateTokenCountFromText } from "../memory/context.js";
import { assembleLayeredContext } from "../memory/context-orchestrator.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { RecallStoreAccess } from "../store/recall-access.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";
import { HttpError } from "../util/http.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import type { Env } from "../config.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type ContextRuntimeRequest = FastifyRequest<{ Body: unknown }>;
type ContextRuntimeSurface = "recall_text" | "planning_context" | "context_assemble";
type ContextRuntimeRequestKind = ContextRuntimeSurface;
type ContextRuntimeRecallKnobs = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

type RecallProfileLike = {
  profile: string;
  source: string;
};

type ExplicitRecallModeLike = {
  mode: string | null;
  profile: string;
  defaults: Record<string, unknown>;
  applied: boolean;
  reason: string;
  source: string;
};

type ClassAwareRecallProfileLike = {
  profile: string;
  defaults: Record<string, unknown>;
  enabled: boolean;
  applied: boolean;
  reason: string;
  source: string;
  workload_class: string | null;
  signals: string[];
};

type RecallStrategyResolutionLike = {
  strategy: string;
  defaults: Record<string, unknown>;
  applied: boolean;
};

type RecallAdaptiveProfileLike = {
  profile: string;
  defaults: Record<string, unknown>;
  applied: boolean;
  reason: string;
};

type RecallAdaptiveHardCapLike = {
  defaults: Record<string, unknown>;
  applied: boolean;
  reason: string;
};

type RecallTextEmbedBatcherLike = {
  stats: () => unknown;
};
type StaticContextBlock = {
  id: string;
  title?: string;
  content: string;
  tags?: string[];
  intents?: string[];
  priority: number;
  always_include: boolean;
};

type ParsedMemoryRecall = ReturnType<typeof MemoryRecallRequest.parse>;
type ParsedMemoryRecallText = ReturnType<typeof MemoryRecallTextRequest.parse>;
type ParsedPlanningContext = ReturnType<typeof PlanningContextRequest.parse>;
type ParsedContextAssemble = ReturnType<typeof ContextAssembleRequest.parse>;
type ParsedContextRuntimeQuery = ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble;
type MemoryRecallOutput = Awaited<ReturnType<typeof memoryRecallParsed>>;
type RulesEvaluationLike = Awaited<ReturnType<typeof evaluateRules>>;
type ToolSelectionLike = Awaited<ReturnType<typeof selectTools>>;
type RecallRouteRules = Pick<
  RulesEvaluationLike,
  "scope" | "considered" | "matched" | "skipped_invalid_then" | "invalid_then_sample" | "applied"
>;
type RecallTextRouteOutput = MemoryRecallOutput & {
  rules?: RecallRouteRules;
};
type PlanningContextRouteOutput = {
  recall: MemoryRecallOutput;
  rules: RulesEvaluationLike;
  tools: ToolSelectionLike | null;
};
type ContextAssembleRouteOutput = {
  recall: MemoryRecallOutput;
  rules: RulesEvaluationLike | null;
  tools: ToolSelectionLike | null;
};
type ContextRuntimeLiteStoreLike =
  NonNullable<NonNullable<Parameters<typeof evaluateRules>[4]>["liteWriteStore"]>
  & NonNullable<NonNullable<Parameters<typeof selectTools>[4]>["liteWriteStore"]>;
type MemoryRecallRuntimeOptions = NonNullable<Parameters<typeof memoryRecallParsed>[7]>;
type RecallEmbedResult = Awaited<
  ReturnType<
    (provider: EmbeddingProvider, queryText: string) => Promise<{
      vec: number[];
      ms: number;
      cache_hit: boolean;
      singleflight_join: boolean;
      queue_wait_ms: number;
      batch_size: number;
    }>
  >
>;

function toStaticContextBlock(id: string, title: string, content: string) {
  return {
    id,
    title,
    content,
    tags: ["execution-packet", "continuity"],
    intents: ["resume", "review", "continuity"],
    priority: 95,
    always_include: true,
  };
}

function executionPacketToStaticBlocks(packet: ExecutionPacketV1): Array<{
  id: string;
  title: string;
  content: string;
  tags: string[];
  intents: string[];
  priority: number;
  always_include: boolean;
}> {
  const blocks = [
    toStaticContextBlock(
      `execution-packet-${packet.state_id}-brief`,
      "Execution Brief",
      [
        `current_stage=${packet.current_stage}`,
        `active_role=${packet.active_role}`,
        `task_brief=${packet.task_brief}`,
        packet.target_files.length > 0 ? `target_files=${packet.target_files.join(" | ")}` : null,
        packet.next_action ? `next_action=${packet.next_action}` : null,
        packet.hard_constraints.length > 0 ? `hard_constraints=${packet.hard_constraints.join(" | ")}` : null,
        packet.pending_validations.length > 0 ? `pending_validations=${packet.pending_validations.join(" | ")}` : null,
      ].filter(Boolean).join("; "),
    ),
    toStaticContextBlock(
      `execution-packet-${packet.state_id}-state`,
      "Execution State",
      [
        packet.accepted_facts.length > 0 ? `accepted_facts=${packet.accepted_facts.join(" | ")}` : null,
        packet.rejected_paths.length > 0 ? `rejected_paths=${packet.rejected_paths.join(" | ")}` : null,
        packet.unresolved_blockers.length > 0 ? `unresolved_blockers=${packet.unresolved_blockers.join(" | ")}` : null,
        packet.rollback_notes.length > 0 ? `rollback_notes=${packet.rollback_notes.join(" | ")}` : null,
        packet.evidence_refs.length > 0 ? `evidence_refs=${packet.evidence_refs.join(" | ")}` : null,
      ].filter(Boolean).join("; "),
    ),
  ].filter((block) => block.content.trim().length > 0);

  if (packet.review_contract) {
    blocks.push(
      toStaticContextBlock(
        `execution-packet-${packet.state_id}-review`,
        "Reviewer Contract",
        [
          `standard=${packet.review_contract.standard}`,
          packet.review_contract.required_outputs.length > 0 ? `required_outputs=${packet.review_contract.required_outputs.join(" | ")}` : null,
          packet.review_contract.acceptance_checks.length > 0 ? `acceptance_checks=${packet.review_contract.acceptance_checks.join(" | ")}` : null,
          `rollback_required=${packet.review_contract.rollback_required ? "true" : "false"}`,
        ].filter(Boolean).join("; "),
      ),
    );
  }

  if (packet.resume_anchor) {
    blocks.push(
      toStaticContextBlock(
        `execution-packet-${packet.state_id}-resume`,
        "Resume Anchor",
        [
          `anchor=${packet.resume_anchor.anchor}`,
          packet.resume_anchor.file_path ? `file_path=${packet.resume_anchor.file_path}` : null,
          packet.resume_anchor.symbol ? `symbol=${packet.resume_anchor.symbol}` : null,
          packet.resume_anchor.repo_root ? `repo_root=${packet.resume_anchor.repo_root}` : null,
        ].filter(Boolean).join("; "),
      ),
    );
  }

  return blocks;
}

function normalizeExecutionContinuitySideOutputs(parsed: {
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const executionResultSummary =
    parsed.execution_result_summary && typeof parsed.execution_result_summary === "object" && !Array.isArray(parsed.execution_result_summary)
      ? (parsed.execution_result_summary as Record<string, unknown>)
      : null;
  const executionArtifacts = Array.isArray(parsed.execution_artifacts)
    ? parsed.execution_artifacts.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  const executionEvidence = Array.isArray(parsed.execution_evidence)
    ? parsed.execution_evidence.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  return {
    executionResultSummary,
    executionArtifacts,
    executionEvidence,
  };
}

function sideOutputToLine(prefix: string, value: Record<string, unknown>) {
  const fields = ["ref", "uri", "claim", "kind", "type", "label"]
    .map((key) => (typeof value[key] === "string" && value[key].length > 0 ? `${key}=${String(value[key])}` : null))
    .filter(Boolean);
  return `${prefix}${fields.length > 0 ? ` ${fields.join("; ")}` : ""}`.trim();
}

function executionContinuityToStaticBlocks(parsed: {
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const sideOutputs = normalizeExecutionContinuitySideOutputs(parsed);
  const blocks: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    intents: string[];
    priority: number;
    always_include: boolean;
  }> = [];

  const contentLines: string[] = [];
  if (sideOutputs.executionResultSummary) {
    const summaryLine = Object.entries(sideOutputs.executionResultSummary)
      .slice(0, 8)
      .map(([key, value]) => `${key}=${typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}`)
      .join("; ");
    if (summaryLine) contentLines.push(`summary: ${summaryLine}`);
  }
  if (sideOutputs.executionArtifacts.length > 0) {
    contentLines.push(...sideOutputs.executionArtifacts.slice(0, 5).map((artifact, index) => sideOutputToLine(`artifact_${index + 1}:`, artifact)));
  }
  if (sideOutputs.executionEvidence.length > 0) {
    contentLines.push(...sideOutputs.executionEvidence.slice(0, 5).map((evidence, index) => sideOutputToLine(`evidence_${index + 1}:`, evidence)));
  }

  if (contentLines.length > 0) {
    blocks.push(
      toStaticContextBlock(
        "execution-side-outputs",
        "Execution Side Outputs",
        contentLines.join("\n"),
      ),
    );
  }

  return { blocks, sideOutputs };
}

function buildExecutionContinuityContext(parsed: {
  context?: unknown;
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const base =
    parsed.context && typeof parsed.context === "object" && !Array.isArray(parsed.context) ? { ...(parsed.context as Record<string, unknown>) } : {};
  const { sideOutputs } = executionContinuityToStaticBlocks(parsed);
  if (sideOutputs.executionResultSummary && !("execution_result_summary" in base)) {
    base.execution_result_summary = sideOutputs.executionResultSummary;
  }
  if (sideOutputs.executionArtifacts.length > 0 && !("execution_artifacts" in base)) {
    base.execution_artifacts = sideOutputs.executionArtifacts;
  }
  if (sideOutputs.executionEvidence.length > 0 && !("execution_evidence" in base)) {
    base.execution_evidence = sideOutputs.executionEvidence;
  }
  return base;
}

export function mergeExecutionPacketStaticBlocks(parsed: {
  static_context_blocks?: StaticContextBlock[];
  execution_packet_v1?: ExecutionPacketV1;
  execution_state_v1?: ExecutionStateV1;
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const base = Array.isArray(parsed.static_context_blocks) ? parsed.static_context_blocks : [];
  const continuityBlocks = executionContinuityToStaticBlocks(parsed).blocks;
  const { packet } = resolveExecutionPacketAssembly(parsed);
  if (!packet) return [...continuityBlocks, ...base];
  return [...executionPacketToStaticBlocks(packet), ...continuityBlocks, ...base];
}

function resolveExecutionKernelContext(parsed: {
  execution_packet_v1?: ExecutionPacketV1;
  execution_state_v1?: ExecutionStateV1;
}) {
  const { packet, source_mode } = resolveExecutionPacketAssembly(parsed);
  return {
    packet,
    source_mode,
    state_first_assembly: source_mode === "state_first",
  };
}

function buildExecutionKernelResponse(
  sourceMode: ExecutionPacketAssemblyMode,
  parsed: {
    execution_packet_v1?: ExecutionPacketV1;
    execution_state_v1?: ExecutionStateV1;
  },
) {
  return {
    packet_source_mode: sourceMode,
    state_first_assembly: sourceMode === "state_first",
    execution_packet_v1_present: !!parsed.execution_packet_v1,
    execution_state_v1_present: !!parsed.execution_state_v1,
  };
}

function attachRecallRules(base: MemoryRecallOutput, rulesRes: RulesEvaluationLike): RecallTextRouteOutput {
  return {
    ...base,
    rules: {
      scope: rulesRes.scope,
      considered: rulesRes.considered,
      matched: rulesRes.matched,
      skipped_invalid_then: rulesRes.skipped_invalid_then,
      invalid_then_sample: rulesRes.invalid_then_sample,
      applied: rulesRes.applied,
    },
  };
}

function toRecallKnobs(
  parsed: ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble | ParsedMemoryRecall,
): ContextRuntimeRecallKnobs {
  return {
    limit: parsed.limit,
    neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
    max_nodes: parsed.max_nodes,
    max_edges: parsed.max_edges,
    ranked_limit: parsed.ranked_limit,
    min_edge_weight: parsed.min_edge_weight,
    min_edge_confidence: parsed.min_edge_confidence,
  };
}

function applyDefaultContextBudget<T extends { context_token_budget?: number; context_char_budget?: number }>(
  parsed: T,
  defaultTokenBudget: number,
  parse: (input: unknown) => T,
): { parsed: T; contextBudgetDefaultApplied: boolean } {
  if (
    parsed.context_token_budget === undefined
    && parsed.context_char_budget === undefined
    && defaultTokenBudget > 0
  ) {
    return {
      parsed: parse({
        ...parsed,
        context_token_budget: defaultTokenBudget,
      }),
      contextBudgetDefaultApplied: true,
    };
  }
  return {
    parsed,
    contextBudgetDefaultApplied: false,
  };
}

function applyAdaptiveRecallTuning<
  T extends ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble | ParsedMemoryRecall,
>(args: {
  parsed: T;
  parse: (input: unknown) => T;
  profile: string;
  waitMs: number;
  explicitRecallKnobs: boolean;
  resolveAdaptiveRecallProfile: (profile: string, waitMs: number, explicitRecallKnobs: boolean) => RecallAdaptiveProfileLike;
  resolveAdaptiveRecallHardCap: (
    knobs: ContextRuntimeRecallKnobs,
    waitMs: number,
    explicitRecallKnobs: boolean,
  ) => RecallAdaptiveHardCapLike;
}): {
  parsed: T;
  adaptiveProfile: RecallAdaptiveProfileLike;
  adaptiveHardCap: RecallAdaptiveHardCapLike;
} {
  const {
    parsed: initialParsed,
    parse,
    profile,
    waitMs,
    explicitRecallKnobs,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
  } = args;
  const adaptiveProfile = resolveAdaptiveRecallProfile(profile, waitMs, explicitRecallKnobs);
  let parsed = initialParsed;
  if (adaptiveProfile.applied) {
    parsed = parse({ ...parsed, ...adaptiveProfile.defaults });
  }
  const adaptiveHardCap = resolveAdaptiveRecallHardCap(
    toRecallKnobs(parsed),
    waitMs,
    explicitRecallKnobs,
  );
  if (adaptiveHardCap.applied) {
    parsed = parse({ ...parsed, ...adaptiveHardCap.defaults });
  }
  return {
    parsed,
    adaptiveProfile,
    adaptiveHardCap,
  };
}

function buildRecallRequestFromQuery(args: {
  scope: string;
  queryEmbedding: number[];
  parsed: ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble;
  extras?: Partial<Pick<ParsedMemoryRecall, "rules_context" | "rules_include_shadow" | "rules_limit">>;
}): ParsedMemoryRecall {
  const { scope, queryEmbedding, parsed, extras } = args;
  return MemoryRecallRequest.parse({
    tenant_id: parsed.tenant_id,
    scope,
    recall_strategy: parsed.recall_strategy,
    query_embedding: queryEmbedding,
    consumer_agent_id: parsed.consumer_agent_id,
    consumer_team_id: parsed.consumer_team_id,
    limit: parsed.limit,
    neighborhood_hops: parsed.neighborhood_hops,
    return_debug: parsed.return_debug,
    include_embeddings: parsed.include_embeddings,
    include_meta: parsed.include_meta,
    include_slots: parsed.include_slots,
    include_slots_preview: parsed.include_slots_preview,
    slots_preview_keys: parsed.slots_preview_keys,
    max_nodes: parsed.max_nodes,
    max_edges: parsed.max_edges,
    ranked_limit: parsed.ranked_limit,
    min_edge_weight: parsed.min_edge_weight,
    min_edge_confidence: parsed.min_edge_confidence,
    context_token_budget: parsed.context_token_budget,
    context_char_budget: parsed.context_char_budget,
    context_compaction_profile: parsed.context_compaction_profile,
    memory_layer_preference: parsed.memory_layer_preference,
    ...extras,
  });
}

export function registerMemoryContextRuntimeRoutes(args: {
  app: FastifyInstance;
  env: Env;
  embedder: EmbeddingProvider | null;
  embeddingSurfacePolicy?: EmbeddingSurfacePolicy;
  embeddedRuntime: EmbeddedMemoryRuntime | null;
  liteWriteStore: ContextRuntimeLiteStoreLike;
  liteRecallAccess: RecallStoreAccess;
  recallTextEmbedBatcher: unknown;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (
    req: FastifyRequest,
    body: unknown,
    principal: AuthPrincipal | null,
    kind: ContextRuntimeRequestKind,
  ) => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: "recall" | "debug_embeddings") => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: "recall" | "debug_embeddings", tenantId: string) => Promise<void>;
  enforceRecallTextEmbedQuota: (req: FastifyRequest, reply: FastifyReply, tenantId: string) => Promise<void>;
  buildRecallAuth: (req: FastifyRequest, allowEmbeddings: boolean) => RecallAuth;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "recall") => Promise<InflightGateToken>;
  hasExplicitRecallKnobs: (body: unknown) => boolean;
  resolveRecallProfile: (endpoint: "recall_text", tenantId: string) => RecallProfileLike;
  resolveExplicitRecallMode: (body: unknown, baseProfile: string, explicitRecallKnobs: boolean) => ExplicitRecallModeLike;
  resolveClassAwareRecallProfile: (
    endpoint: ContextRuntimeSurface,
    body: unknown,
    baseProfile: string,
    explicitRecallKnobs: boolean,
  ) => ClassAwareRecallProfileLike;
  withRecallProfileDefaults: (body: unknown, defaults: Record<string, unknown>) => Record<string, unknown>;
  resolveRecallStrategy: (body: unknown, explicitRecallKnobs: boolean) => RecallStrategyResolutionLike;
  resolveAdaptiveRecallProfile: (profile: string, waitMs: number, explicitRecallKnobs: boolean) => RecallAdaptiveProfileLike;
  resolveAdaptiveRecallHardCap: (
    knobs: ContextRuntimeRecallKnobs,
    waitMs: number,
    explicitRecallKnobs: boolean,
  ) => RecallAdaptiveHardCapLike;
  inferRecallStrategyFromKnobs: (knobs: ContextRuntimeRecallKnobs) => unknown;
  buildRecallTrajectory: (args: unknown) => unknown;
  embedRecallTextQuery: (provider: EmbeddingProvider, queryText: string) => Promise<{
    vec: number[];
    ms: number;
    cache_hit: boolean;
    singleflight_join: boolean;
    queue_wait_ms: number;
    batch_size: number;
  }>;
  mapRecallTextEmbeddingError: (err: unknown) => {
    statusCode: number;
    code: string;
    message: string;
    retry_after_sec?: number;
    details?: Record<string, unknown>;
  };
  recordContextAssemblyTelemetryBestEffort: (args: {
    req: FastifyRequest;
    tenant_id: string;
    scope: string;
    endpoint: "planning_context" | "context_assemble";
    latency_ms: number;
    layered_output: boolean;
    layered_context: unknown;
    selected_memory_layers?: string[];
    selection_policy?: {
      name?: string | null;
      source?: string | null;
      trust_anchor_layers?: string[];
      requested_allowed_layers?: string[];
    } | null;
  }) => Promise<void>;
}) {
  const {
    app,
    env,
    embedder,
    embeddingSurfacePolicy: embeddingSurfacePolicyArg,
    embeddedRuntime,
    liteWriteStore,
    liteRecallAccess,
    recallTextEmbedBatcher,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    enforceRecallTextEmbedQuota,
    buildRecallAuth,
    tenantFromBody,
    acquireInflightSlot,
    hasExplicitRecallKnobs,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    resolveClassAwareRecallProfile,
    withRecallProfileDefaults,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
    embedRecallTextQuery,
    mapRecallTextEmbeddingError,
    recordContextAssemblyTelemetryBestEffort,
  } = args;
  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite memory-context-runtime routes only support AIONIS_EDITION=lite");
  }
  const embeddingSurfacePolicy =
    embeddingSurfacePolicyArg ?? createEmbeddingSurfacePolicy({ providerConfigured: !!embedder });
  const recallTextEmbedBatcherStats = () =>
    recallTextEmbedBatcher && typeof recallTextEmbedBatcher === "object" && "stats" in recallTextEmbedBatcher
    && typeof recallTextEmbedBatcher.stats === "function"
      ? (recallTextEmbedBatcher as RecallTextEmbedBatcherLike).stats()
      : null;
  const resolveSurfaceEmbedder = (
    surface: ContextRuntimeSurface,
    reply: FastifyReply,
  ) => {
    if (!embeddingSurfacePolicy.isEnabled(surface)) {
      reply.code(409).send({
        error: "embedding_surface_disabled",
        message: `embedding surface disabled: ${surface}`,
        details: { surface },
      });
      return null;
    }
    if (!embedder) {
      reply.code(400).send({
        error: "no_embedding_provider",
        message: `Configure EMBEDDING_PROVIDER to use ${surface}.`,
      });
      return null;
    }
    return embedder;
  };
  const allowUnsafeDropTrustAnchors = (req: FastifyRequest): boolean => {
    if (env.APP_ENV === "prod") return false;
    const raw = String(req.headers["x-aionis-internal-allow-drop-trust-anchors"] ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  };
  const allowInternalL4Serving = (req: FastifyRequest): boolean => {
    if (env.APP_ENV === "prod") return false;
    const raw = String(req.headers["x-aionis-internal-allow-l4-serving"] ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  };
  const allowLayerPolicyRetrievalFiltering = (req: FastifyRequest): boolean => {
    if (env.APP_ENV === "prod") return false;
    const raw = String(req.headers["x-aionis-internal-apply-layer-policy-to-retrieval"] ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  };
  const runRecallEmbedding = async (args: {
    endpoint: ContextRuntimeSurface;
    req: ContextRuntimeRequest;
    reply: FastifyReply;
    provider: EmbeddingProvider;
    scope: string;
    tenantId: string;
    queryText: string;
  }): Promise<RecallEmbedResult> => {
    const { endpoint, req, reply, provider, scope, tenantId, queryText } = args;
    try {
      return await embedRecallTextQuery(provider, queryText);
    } catch (err: unknown) {
      const mapped = mapRecallTextEmbeddingError(err);
      if (mapped.retry_after_sec) reply.header("retry-after", mapped.retry_after_sec);
      req.log.warn(
        {
          [endpoint]: {
            scope,
            tenant_id: tenantId,
            embedding_provider: provider.name,
            query_len: queryText.length,
            mapped_error: mapped.code,
            mapped_status: mapped.statusCode,
            err_message: err instanceof Error ? err.message : String(err),
          },
        },
        `${endpoint} embedding failed`,
      );
      throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
    }
  };
  const prepareSurfaceRequest = async <TParsed extends ParsedContextRuntimeQuery>(args: {
    req: ContextRuntimeRequest;
    requestKind: ContextRuntimeRequestKind;
    surface: ContextRuntimeSurface;
    parse: (input: unknown) => TParsed;
  }): Promise<{
    parsed: TParsed;
    explicitRecallKnobs: boolean;
    baseProfile: RecallProfileLike;
    explicitMode: ExplicitRecallModeLike;
    classAwareProfile: ClassAwareRecallProfileLike;
    contextBudgetDefaultApplied: boolean;
    wantDebugEmbeddings: boolean;
    scope: string;
    q: string;
  }> => {
    const { req, requestKind, surface, parse } = args;
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, requestKind);
    const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
    const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
    const explicitMode = resolveExplicitRecallMode(bodyRaw, baseProfile.profile, explicitRecallKnobs);
    const classAwareProfile = resolveClassAwareRecallProfile(surface, bodyRaw, explicitMode.profile, explicitRecallKnobs);
    let body = withRecallProfileDefaults(bodyRaw, classAwareProfile.defaults);
    const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs || explicitMode.mode !== null);
    if (strategyResolution.applied) {
      body = {
        ...body,
        ...strategyResolution.defaults,
        recall_strategy: strategyResolution.strategy,
      };
    }
    let parsed = parse(body);
    const budgetDefaulted = applyDefaultContextBudget(
      parsed,
      env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
      parse,
    );
    parsed = budgetDefaulted.parsed;
    const scope = parsed.scope ?? env.MEMORY_SCOPE;
    const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
    return {
      parsed,
      explicitRecallKnobs,
      baseProfile,
      explicitMode,
      classAwareProfile,
      contextBudgetDefaultApplied: budgetDefaulted.contextBudgetDefaultApplied,
      wantDebugEmbeddings: parsed.return_debug && parsed.include_embeddings,
      scope,
      q: env.PII_REDACTION ? redactPII(qNorm).text : qNorm,
    };
  };
  const buildRulesTimingObserver = (timings: Record<string, number>) => ({
    timing: (stage: string, ms: number) => {
      timings[stage] = (timings[stage] ?? 0) + ms;
    },
  });
  const runRecallWithStore = async <T>(args: {
    endpoint: ContextRuntimeSurface;
    recallParsed: ParsedMemoryRecall;
    auth: RecallAuth;
    timings: Record<string, number>;
    buildRuntimeOptions: () => MemoryRecallRuntimeOptions;
    finalize: (recall: MemoryRecallOutput) => Promise<T>;
  }): Promise<T> => {
    const recall = await memoryRecallParsed(
      {} as pg.PoolClient,
      args.recallParsed,
      env.MEMORY_SCOPE,
      env.MEMORY_TENANT_ID,
      args.auth,
      buildRulesTimingObserver(args.timings),
      args.endpoint,
      args.buildRuntimeOptions(),
    );
    return args.finalize(recall);
  };
  const buildRecallRuntimeOptions = (args: {
    internalAllowL4Selection: boolean;
    unsafeDropTrustAnchors?: boolean;
    applyLayerPolicyToRetrieval?: boolean;
  }): MemoryRecallRuntimeOptions => ({
    stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
    recall_access: liteRecallAccess,
    internal_allow_l4_selection: args.internalAllowL4Selection,
    ...(args.unsafeDropTrustAnchors !== undefined
      ? { unsafe_allow_drop_trust_anchors: args.unsafeDropTrustAnchors }
      : {}),
    ...(args.applyLayerPolicyToRetrieval !== undefined
      ? { unsafe_apply_layer_policy_to_retrieval: args.applyLayerPolicyToRetrieval }
      : {}),
  });
  const toRecallEmbedMetrics = (embedding: RecallEmbedResult) => ({
    embedMs: embedding.ms,
    embedCacheHit: embedding.cache_hit,
    embedSingleflightJoin: embedding.singleflight_join,
    embedQueueWaitMs: embedding.queue_wait_ms,
    embedBatchSize: embedding.batch_size,
  });
  const enforceRecallSurfaceQuotas = async (args: {
    req: ContextRuntimeRequest;
    reply: FastifyReply;
    tenantId: string;
    wantDebugEmbeddings: boolean;
  }) => {
    const { req, reply, tenantId, wantDebugEmbeddings } = args;
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", tenantId);
    if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
    if (wantDebugEmbeddings) await enforceTenantQuota(req, reply, "debug_embeddings", tenantId);
    await enforceRecallTextEmbedQuota(req, reply, tenantId);
  };
  const prepareAdaptiveRecallExecution = async <
    TParsed extends ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble | ParsedMemoryRecall,
  >(args: {
    parsed: TParsed;
    parse: (input: unknown) => TParsed;
    profile: string;
    explicitRecallKnobs: boolean;
    explicitMode: ExplicitRecallModeLike;
  }) => {
    const gate = await acquireInflightSlot("recall");
    const adaptiveTuning = applyAdaptiveRecallTuning({
      parsed: args.parsed,
      parse: args.parse,
      profile: args.profile,
      waitMs: gate.wait_ms,
      explicitRecallKnobs: args.explicitRecallKnobs || args.explicitMode.mode !== null,
      resolveAdaptiveRecallProfile,
      resolveAdaptiveRecallHardCap,
    });
    return {
      gate,
      parsed: adaptiveTuning.parsed,
      adaptiveProfile: adaptiveTuning.adaptiveProfile,
      adaptiveHardCap: adaptiveTuning.adaptiveHardCap,
    };
  };
  const buildContextRulesRequest = (args: {
    recallParsed: ParsedMemoryRecall;
    context: unknown;
    includeShadow: boolean | undefined;
    rulesLimit: number | undefined;
  }) => ({
    scope: args.recallParsed.scope ?? env.MEMORY_SCOPE,
    tenant_id: args.recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
    context: args.context,
    include_shadow: args.includeShadow,
    limit: args.rulesLimit,
  });
  const buildContextToolsRequest = (args: {
    recallParsed: ParsedMemoryRecall;
    parsed: ParsedPlanningContext | ParsedContextAssemble;
    context: unknown;
  }) => ({
    scope: args.recallParsed.scope ?? env.MEMORY_SCOPE,
    tenant_id: args.recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
    ...("run_id" in args.parsed && typeof args.parsed.run_id === "string" ? { run_id: args.parsed.run_id } : {}),
    context: args.context,
    execution_result_summary: args.parsed.execution_result_summary,
    execution_artifacts: args.parsed.execution_artifacts,
    execution_evidence: args.parsed.execution_evidence,
    candidates: args.parsed.tool_candidates,
    include_shadow: args.parsed.include_shadow,
    rules_limit: args.parsed.rules_limit,
    strict: args.parsed.tool_strict,
  });
  const maybeEvaluateContextRules = async (args: {
    recallParsed: ParsedMemoryRecall;
    context: unknown;
    includeShadow: boolean | undefined;
    rulesLimit: number | undefined;
    includeRules?: boolean;
  }): Promise<RulesEvaluationLike | null> => {
    if (args.includeRules === false) return null;
    return evaluateRules(
      {} as pg.PoolClient,
      buildContextRulesRequest({
        recallParsed: args.recallParsed,
        context: args.context,
        includeShadow: args.includeShadow,
        rulesLimit: args.rulesLimit,
      }),
      env.MEMORY_SCOPE,
      env.MEMORY_TENANT_ID,
      {
        embeddedRuntime,
        liteWriteStore,
      },
    );
  };
  const evaluateContextRules = async (args: {
    recallParsed: ParsedMemoryRecall;
    context: unknown;
    includeShadow: boolean | undefined;
    rulesLimit: number | undefined;
  }): Promise<RulesEvaluationLike> => {
    const rules = await maybeEvaluateContextRules({
      ...args,
      includeRules: true,
    });
    if (!rules) {
      throw new Error("rules evaluation unexpectedly returned null");
    }
    return rules;
  };
  const maybeSelectContextTools = async (args: {
    recallParsed: ParsedMemoryRecall;
    parsed: ParsedPlanningContext | ParsedContextAssemble;
    context: unknown;
  }): Promise<ToolSelectionLike | null> => {
    if (!Array.isArray(args.parsed.tool_candidates) || args.parsed.tool_candidates.length === 0) {
      return null;
    }
    return selectTools(
      null,
      buildContextToolsRequest({
        recallParsed: args.recallParsed,
        parsed: args.parsed,
        context: args.context,
      }),
      env.MEMORY_SCOPE,
      env.MEMORY_TENANT_ID,
      {
        embeddedRuntime,
        liteWriteStore,
      },
    );
  };
  const buildRecallRouteDiagnostics = (args: {
    recallParsed: ParsedMemoryRecall;
    recallOut: MemoryRecallOutput;
    tools?: ToolSelectionLike | null;
    timings: Record<string, number>;
    inflightWaitMs: number;
    explicitMode: ExplicitRecallModeLike;
    adaptiveProfile: RecallAdaptiveProfileLike;
    adaptiveHardCap: RecallAdaptiveHardCapLike;
    classAwareObservability: Record<string, unknown>;
  }) => {
    const contextText = typeof args.recallOut?.context?.text === "string" ? args.recallOut.context.text : "";
    const contextChars = contextText.length;
    const contextEstTokens = estimateTokenCountFromText(contextText);
    const trajectory = buildRecallTrajectory({
      strategy:
        args.recallParsed.recall_strategy ??
        inferRecallStrategyFromKnobs(toRecallKnobs(args.recallParsed)),
      limit: args.recallParsed.limit,
      neighborhood_hops: args.recallParsed.neighborhood_hops,
      max_nodes: args.recallParsed.max_nodes,
      max_edges: args.recallParsed.max_edges,
      ranked_limit: args.recallParsed.ranked_limit,
      min_edge_weight: args.recallParsed.min_edge_weight,
      min_edge_confidence: args.recallParsed.min_edge_confidence,
      seeds: args.recallOut.seeds.length,
      nodes: args.recallOut.subgraph.nodes.length,
      edges: args.recallOut.subgraph.edges.length,
      context_chars: contextChars,
      timings: args.timings,
      neighborhood_counts: args.recallOut?.debug?.neighborhood_counts ?? null,
      stage1: args.recallOut?.debug?.stage1 ?? null,
      uri_links: collectRecallTrajectoryUriLinks({ recall: args.recallOut, tools: args.tools ?? undefined }),
    });
    const observability = buildRecallObservability({
      timings: args.timings,
      inflight_wait_ms: args.inflightWaitMs,
      context_items: args.recallOut?.context?.items ?? [],
      selection_policy: args.recallOut?.context?.selection_policy ?? null,
      selection_stats: args.recallOut?.context?.selection_stats ?? null,
      explicit_mode: {
        mode: args.explicitMode.mode,
        profile: args.explicitMode.profile,
        applied: args.explicitMode.applied,
        reason: args.explicitMode.reason,
        source: args.explicitMode.source,
      },
      adaptive_profile: {
        profile: args.adaptiveProfile.profile,
        applied: args.adaptiveProfile.applied,
        reason: args.adaptiveProfile.reason,
      },
      class_aware: args.classAwareObservability,
      adaptive_hard_cap: {
        applied: args.adaptiveHardCap.applied,
        reason: args.adaptiveHardCap.reason,
      },
      stage1: args.recallOut?.debug?.stage1 ?? null,
      neighborhood_counts: args.recallOut?.debug?.neighborhood_counts ?? null,
    });
    return {
      contextText,
      contextChars,
      contextEstTokens,
      trajectory,
      observability,
    };
  };
  const buildEffectiveStaticBlocks = (args: {
    parsed: ParsedPlanningContext | ParsedContextAssemble;
    executionKernel: ReturnType<typeof resolveExecutionKernelContext>;
  }) =>
    args.executionKernel.packet
      ? [
          ...executionPacketToStaticBlocks(args.executionKernel.packet),
          ...executionContinuityToStaticBlocks(args.parsed).blocks,
          ...(Array.isArray(args.parsed.static_context_blocks) ? args.parsed.static_context_blocks : []),
        ]
      : mergeExecutionPacketStaticBlocks(args.parsed);
  const recordContextAssemblyTelemetrySafe = async (args: {
    req: ContextRuntimeRequest;
    tenantId: string;
    scope: string;
    endpoint: "planning_context" | "context_assemble";
    latencyMs: number;
    layeredContext: unknown;
    costSignals: ReturnType<typeof buildLayeredContextCostSignals>;
    selectionPolicy: unknown;
  }) => {
    try {
      await recordContextAssemblyTelemetryBestEffort({
        req: args.req,
        tenant_id: args.tenantId,
        scope: args.scope,
        endpoint: args.endpoint,
        latency_ms: args.latencyMs,
        layered_output: !!args.layeredContext,
        layered_context: args.layeredContext,
        selected_memory_layers: Array.isArray(args.costSignals?.selected_memory_layers) ? args.costSignals.selected_memory_layers : [],
        selection_policy:
          args.selectionPolicy && typeof args.selectionPolicy === "object"
            ? (args.selectionPolicy as {
                name?: string | null;
                source?: string | null;
                trust_anchor_layers?: string[];
                requested_allowed_layers?: string[];
              })
            : null,
      });
    } catch (err) {
      args.req.log.warn({ err, tenant_id: args.tenantId, scope: args.scope }, `${args.endpoint} telemetry insert failed`);
    }
  };
  const buildLayeredContextArtifacts = (args: {
    parsed: ParsedPlanningContext | ParsedContextAssemble;
    recallParsed: ParsedMemoryRecall;
    recallOut: MemoryRecallOutput;
    rules: RulesEvaluationLike | null;
    tools: ToolSelectionLike | null;
    executionContext: unknown;
    effectiveStaticBlocks: ReturnType<typeof mergeExecutionPacketStaticBlocks>;
    contextEstTokens: number;
    optimizationProfile: {
      requested: string | null;
      source: string | null;
    };
  }) => {
    const layeredContext = args.parsed.return_layered_context
      ? assembleLayeredContext({
          recall: args.recallOut,
          rules: args.rules,
          tools: args.tools,
          query_text: args.parsed.query_text,
          execution_context: args.executionContext,
          tool_candidates: args.parsed.tool_candidates,
          static_blocks: args.effectiveStaticBlocks ?? null,
          static_injection: args.parsed.static_injection ?? null,
          config: args.parsed.context_layers ?? null,
        })
      : undefined;
    if (layeredContext && typeof layeredContext === "object") {
      (layeredContext as Record<string, unknown>).optimization_profile = args.optimizationProfile;
    }
    const costSignals = buildLayeredContextCostSignals({
      layered_context: layeredContext,
      context_items: Array.isArray(args.recallOut?.context?.items) ? args.recallOut.context.items : [],
      context_selection_stats: args.recallOut?.context?.selection_stats ?? null,
      context_est_tokens: args.contextEstTokens,
      context_token_budget: args.recallParsed.context_token_budget ?? null,
      context_char_budget: args.recallParsed.context_char_budget ?? null,
      context_compaction_profile: args.recallParsed.context_compaction_profile ?? "balanced",
      context_optimization_profile: args.optimizationProfile.requested,
    });
    return {
      layeredContext,
      costSignals,
    };
  };

  app.post("/v1/memory/recall_text", async (req: ContextRuntimeRequest, reply: FastifyReply) => {
    const surfaceEmbedder = resolveSurfaceEmbedder("recall_text", reply);
    if (!surfaceEmbedder) return;

    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const preparedRequest = await prepareSurfaceRequest({
      req,
      requestKind: "recall_text",
      surface: "recall_text",
      parse: MemoryRecallTextRequest.parse,
    });
    let parsed = preparedRequest.parsed;
    const explicitRecallKnobs = preparedRequest.explicitRecallKnobs;
    const baseProfile = preparedRequest.baseProfile;
    const explicitMode = preparedRequest.explicitMode;
    const classAwareProfile = preparedRequest.classAwareProfile;
    const contextBudgetDefaultApplied = preparedRequest.contextBudgetDefaultApplied;
    const wantDebugEmbeddingsText = preparedRequest.wantDebugEmbeddings;
    await enforceRecallSurfaceQuotas({
      req,
      reply,
      tenantId: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
      wantDebugEmbeddings: wantDebugEmbeddingsText,
    });
    const scope = preparedRequest.scope;
    const q = preparedRequest.q;
    const internalAllowL4Selection = allowInternalL4Serving(req);

    let vec: number[];
    let embedMs = 0;
    let embedCacheHit = false;
    let embedSingleflightJoin = false;
    let embedQueueWaitMs = 0;
    let embedBatchSize = 1;
    let recallParsed: ParsedMemoryRecall;
    const adaptiveExecution = await prepareAdaptiveRecallExecution({
      parsed,
      parse: MemoryRecallTextRequest.parse,
      profile: classAwareProfile.profile,
      explicitRecallKnobs,
      explicitMode,
    });
    const gate = adaptiveExecution.gate;
    parsed = adaptiveExecution.parsed;
    const adaptiveProfile = adaptiveExecution.adaptiveProfile;
    const adaptiveHardCap = adaptiveExecution.adaptiveHardCap;
    let out: RecallTextRouteOutput;
    try {
      const emb = await runRecallEmbedding({
        endpoint: "recall_text",
        req,
        reply,
        provider: surfaceEmbedder,
        scope,
        tenantId: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
        queryText: q,
      });
      vec = emb.vec;
      ({ embedMs, embedCacheHit, embedSingleflightJoin, embedQueueWaitMs, embedBatchSize } = toRecallEmbedMetrics(emb));

      recallParsed = buildRecallRequestFromQuery({
        scope,
        queryEmbedding: vec,
        parsed,
        extras: {
          rules_context: parsed.rules_context,
          rules_include_shadow: parsed.rules_include_shadow,
          rules_limit: parsed.rules_limit,
        },
      });
      const wantDebugEmbeddings = recallParsed.return_debug && recallParsed.include_embeddings;
      const auth = buildRecallAuth(req, wantDebugEmbeddings);
      out = await runRecallWithStore({
        endpoint: "recall_text",
        recallParsed,
        auth,
        timings,
        buildRuntimeOptions: () =>
          buildRecallRuntimeOptions({
            internalAllowL4Selection,
          }),
        finalize: async (base) => {
          if (recallParsed.rules_context === undefined || recallParsed.rules_context === null) {
            return base;
          }
          const rulesRes = await evaluateRules(
            {} as pg.PoolClient,
            {
              scope: recallParsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
              context: recallParsed.rules_context,
              include_shadow: recallParsed.rules_include_shadow,
              limit: recallParsed.rules_limit,
            },
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            { embeddedRuntime, liteWriteStore },
          );
          return attachRecallRules(base, rulesRes);
        },
      });
    } finally {
      gate.release();
    }
    const ms = performance.now() - t0;
    const diagnostics = buildRecallRouteDiagnostics({
      recallParsed,
      recallOut: out,
      timings,
      inflightWaitMs: gate.wait_ms,
      explicitMode,
      adaptiveProfile,
      adaptiveHardCap,
      classAwareObservability: {
        workload_class: classAwareProfile.workload_class,
        profile: classAwareProfile.profile,
        enabled: classAwareProfile.enabled,
        applied: classAwareProfile.applied,
        reason: classAwareProfile.reason,
        source: classAwareProfile.source,
        signals: classAwareProfile.signals,
      },
    });
    const contextChars = diagnostics.contextChars;
    const contextEstTokens = diagnostics.contextEstTokens;
    req.log.info(
      {
        recall_text: {
          scope: out.scope,
          tenant_id: out.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
          limit: recallParsed.limit,
          hops: recallParsed.neighborhood_hops,
          embedding_provider: surfaceEmbedder.name,
          embed_ms: embedMs,
          embed_cache_hit: embedCacheHit,
          embed_singleflight_join: embedSingleflightJoin,
          embed_queue_wait_ms: embedQueueWaitMs,
          embed_batch_size: embedBatchSize,
          embed_batcher: recallTextEmbedBatcherStats(),
          include_meta: !!recallParsed.include_meta,
          include_slots: !!recallParsed.include_slots,
          include_slots_preview: !!recallParsed.include_slots_preview,
          consumer_agent_id: recallParsed.consumer_agent_id ?? null,
          consumer_team_id: recallParsed.consumer_team_id ?? null,
          seeds: out.seeds.length,
          nodes: out.subgraph.nodes.length,
          edges: out.subgraph.edges.length,
          neighborhood_counts: out.debug?.neighborhood_counts ?? null,
          rules: out.rules ? { considered: out.rules.considered, matched: out.rules.matched } : null,
          context_chars: contextChars,
          context_est_tokens: contextEstTokens,
          context_token_budget: recallParsed.context_token_budget ?? null,
          context_char_budget: recallParsed.context_char_budget ?? null,
          context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
          context_budget_default_applied: contextBudgetDefaultApplied,
          stage1_exact_fallback_enabled: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
          stage1_exact_fallback_used: Number.isFinite(timings["stage1_candidates_exact_fallback"]),
          stage1_ann_seed_count: out.debug?.stage1?.ann_seed_count ?? null,
          stage1_ann_ms: timings["stage1_candidates_ann"] ?? null,
          stage1_exact_fallback_ms: timings["stage1_candidates_exact_fallback"] ?? null,
          profile: adaptiveProfile.profile,
          profile_source: baseProfile.source,
          recall_mode: explicitMode.mode,
          recall_mode_profile: explicitMode.profile,
          recall_mode_applied: explicitMode.applied,
          recall_mode_reason: explicitMode.reason,
          recall_mode_source: explicitMode.source,
          class_aware_profile: classAwareProfile.profile,
          class_aware_enabled: classAwareProfile.enabled,
          class_aware_applied: classAwareProfile.applied,
          class_aware_reason: classAwareProfile.reason,
          class_aware_source: classAwareProfile.source,
          class_aware_workload_class: classAwareProfile.workload_class,
          class_aware_signals: classAwareProfile.signals,
          adaptive_profile_applied: adaptiveProfile.applied,
          adaptive_profile_reason: adaptiveProfile.reason,
          adaptive_hard_cap_applied: adaptiveHardCap.applied,
          adaptive_hard_cap_reason: adaptiveHardCap.reason,
          adaptive_hard_cap_wait_ms: env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS,
          inflight_wait_ms: gate.wait_ms,
          ms,
          timings_ms: timings,
        },
      },
      "memory recall_text",
    );
    return reply.code(200).send({
      ...out,
      query: { text: q, embedding_provider: surfaceEmbedder.name },
      trajectory: diagnostics.trajectory,
      observability: diagnostics.observability,
    });
  });

  app.post("/v1/memory/planning/context", async (req: ContextRuntimeRequest, reply: FastifyReply) => {
    const surfaceEmbedder = resolveSurfaceEmbedder("planning_context", reply);
    if (!surfaceEmbedder) return;

    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const preparedRequest = await prepareSurfaceRequest({
      req,
      requestKind: "planning_context",
      surface: "planning_context",
      parse: PlanningContextRequest.parse,
    });
    let parsed = preparedRequest.parsed;
    const explicitRecallKnobs = preparedRequest.explicitRecallKnobs;
    const baseProfile = preparedRequest.baseProfile;
    const explicitMode = preparedRequest.explicitMode;
    const classAwareProfile = preparedRequest.classAwareProfile;
    const contextBudgetDefaultApplied = preparedRequest.contextBudgetDefaultApplied;
    const wantDebugEmbeddings = preparedRequest.wantDebugEmbeddings;
    await enforceRecallSurfaceQuotas({
      req,
      reply,
      tenantId: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
      wantDebugEmbeddings,
    });

    const scope = preparedRequest.scope;
    const q = preparedRequest.q;

    let embedMs = 0;
    let embedCacheHit = false;
    let embedSingleflightJoin = false;
    let embedQueueWaitMs = 0;
    let embedBatchSize = 1;
    let recallParsed: ParsedMemoryRecall;
    const adaptiveExecution = await prepareAdaptiveRecallExecution({
      parsed,
      parse: PlanningContextRequest.parse,
      profile: classAwareProfile.profile,
      explicitRecallKnobs,
      explicitMode,
    });
    const gate = adaptiveExecution.gate;
    parsed = adaptiveExecution.parsed;
    const adaptiveProfile = adaptiveExecution.adaptiveProfile;
    const adaptiveHardCap = adaptiveExecution.adaptiveHardCap;
    const planningOptimization = applyContextOptimizationProfile(
      parsed,
      env.MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT === "off"
        ? null
        : env.MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT,
    );
    parsed = PlanningContextRequest.parse(planningOptimization.parsed);
    const planningExecutionContext = buildExecutionContinuityContext(parsed);

    let out: PlanningContextRouteOutput;
    try {
      let vec: number[];
      const emb = await runRecallEmbedding({
        endpoint: "planning_context",
        req,
        reply,
        provider: surfaceEmbedder,
        scope,
        tenantId: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
        queryText: q,
      });
      vec = emb.vec;
      ({ embedMs, embedCacheHit, embedSingleflightJoin, embedQueueWaitMs, embedBatchSize } = toRecallEmbedMetrics(emb));

      recallParsed = buildRecallRequestFromQuery({
        scope,
        queryEmbedding: vec,
        parsed,
      });
      const auth = buildRecallAuth(req, wantDebugEmbeddings);
      const unsafeDropTrustAnchors = allowUnsafeDropTrustAnchors(req);
      const applyLayerPolicyToRetrieval = allowLayerPolicyRetrievalFiltering(req);
      const internalAllowL4Selection = allowInternalL4Serving(req);
      out = await runRecallWithStore({
        endpoint: "planning_context",
        recallParsed,
        auth,
        timings,
        buildRuntimeOptions: () =>
          buildRecallRuntimeOptions({
            internalAllowL4Selection,
            unsafeDropTrustAnchors,
            applyLayerPolicyToRetrieval,
          }),
        finalize: async (recall) => {
          const rules = await evaluateContextRules({
            recallParsed,
            context: planningExecutionContext,
            includeShadow: parsed.include_shadow,
            rulesLimit: parsed.rules_limit,
          });
          const tools = await maybeSelectContextTools({
            recallParsed,
            parsed,
            context: planningExecutionContext,
          });
          return { recall, rules, tools };
        },
      });
    } finally {
      gate.release();
    }

    const ms = performance.now() - t0;
    const recallOut = out.recall;
    const diagnostics = buildRecallRouteDiagnostics({
      recallParsed,
      recallOut,
      tools: out.tools,
      timings,
      inflightWaitMs: gate.wait_ms,
      explicitMode,
      adaptiveProfile,
      adaptiveHardCap,
      classAwareObservability: {
        workload_class: classAwareProfile.workload_class,
        profile: classAwareProfile.profile,
        applied: classAwareProfile.applied,
        reason: classAwareProfile.reason,
        signals: classAwareProfile.signals,
      },
    });
    const contextChars = diagnostics.contextChars;
    const contextEstTokens = diagnostics.contextEstTokens;

    const executionKernel = resolveExecutionKernelContext(parsed);

    req.log.info(
      {
        planning_context: {
          scope: recallOut.scope,
          tenant_id: recallOut.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
          has_tool_candidates: Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0,
          tool_candidates: parsed.tool_candidates?.length ?? 0,
          include_shadow: parsed.include_shadow,
          rules_limit: parsed.rules_limit,
          embed_ms: embedMs,
          embed_cache_hit: embedCacheHit,
          embed_singleflight_join: embedSingleflightJoin,
          embed_queue_wait_ms: embedQueueWaitMs,
          embed_batch_size: embedBatchSize,
          context_chars: contextChars,
          context_est_tokens: contextEstTokens,
          context_token_budget: recallParsed.context_token_budget ?? null,
          context_char_budget: recallParsed.context_char_budget ?? null,
          context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
          context_optimization_profile: planningOptimization.optimization_profile.requested,
          context_optimization_profile_source: planningOptimization.optimization_profile.source,
          context_budget_default_applied: contextBudgetDefaultApplied,
          profile: adaptiveProfile.profile,
          profile_source: baseProfile.source,
          recall_mode: explicitMode.mode,
          recall_mode_profile: explicitMode.profile,
          recall_mode_applied: explicitMode.applied,
          recall_mode_reason: explicitMode.reason,
          recall_mode_source: explicitMode.source,
          class_aware_profile: classAwareProfile.profile,
          class_aware_enabled: classAwareProfile.enabled,
          class_aware_applied: classAwareProfile.applied,
          class_aware_reason: classAwareProfile.reason,
          class_aware_source: classAwareProfile.source,
          class_aware_workload_class: classAwareProfile.workload_class,
          class_aware_signals: classAwareProfile.signals,
          rules_considered: out.rules?.considered ?? 0,
          rules_matched: out.rules?.matched ?? 0,
          tools_selected: out.tools?.selection?.selected ?? null,
          return_layered_context: parsed.return_layered_context,
          execution_kernel_packet_source_mode: executionKernel.source_mode,
          execution_packet_v1_present: !!parsed.execution_packet_v1,
          execution_state_v1_present: !!parsed.execution_state_v1,
          ms,
          timings_ms: timings,
        },
      },
      "memory planning_context",
    );

    const effectiveStaticBlocks = buildEffectiveStaticBlocks({
      parsed,
      executionKernel,
    });
    const { layeredContext, costSignals } = buildLayeredContextArtifacts({
      parsed,
      recallParsed,
      recallOut,
      rules: out.rules,
      tools: out.tools,
      executionContext: planningExecutionContext,
      effectiveStaticBlocks,
      contextEstTokens,
      optimizationProfile: planningOptimization.optimization_profile,
    });
    const planningSummary = buildPlanningSummary({
      rules: out.rules,
      tools: out.tools,
      layered_context: layeredContext,
      cost_signals: costSignals,
      context_est_tokens: contextEstTokens,
      context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
      optimization_profile: planningOptimization.optimization_profile.requested,
      recall_mode: explicitMode.mode,
    });
    const tenantIdOut = recallOut.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID;
    await recordContextAssemblyTelemetrySafe({
      req,
      tenantId: tenantIdOut,
      scope: recallOut.scope,
      endpoint: "planning_context",
      latencyMs: ms,
      layeredContext,
      costSignals,
      selectionPolicy: recallOut?.context?.selection_policy ?? null,
    });

    return reply.code(200).send({
      tenant_id: tenantIdOut,
      scope: recallOut.scope,
      execution_kernel: buildExecutionKernelResponse(executionKernel.source_mode, parsed),
      query: { text: q, embedding_provider: surfaceEmbedder.name },
      recall: {
        ...recallOut,
        trajectory: diagnostics.trajectory,
        observability: diagnostics.observability,
      },
      rules: out.rules,
      tools: out.tools ?? undefined,
      planning_summary: planningSummary,
      layered_context: layeredContext,
      cost_signals: costSignals,
    });
  });

  app.post("/v1/memory/context/assemble", async (req: ContextRuntimeRequest, reply: FastifyReply) => {
    const surfaceEmbedder = resolveSurfaceEmbedder("context_assemble", reply);
    if (!surfaceEmbedder) return;

    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const preparedRequest = await prepareSurfaceRequest({
      req,
      requestKind: "context_assemble",
      surface: "context_assemble",
      parse: ContextAssembleRequest.parse,
    });
    let parsed = preparedRequest.parsed;
    const explicitRecallKnobs = preparedRequest.explicitRecallKnobs;
    const baseProfile = preparedRequest.baseProfile;
    const explicitMode = preparedRequest.explicitMode;
    const classAwareProfile = preparedRequest.classAwareProfile;
    const contextBudgetDefaultApplied = preparedRequest.contextBudgetDefaultApplied;
    const wantDebugEmbeddings = preparedRequest.wantDebugEmbeddings;
    await enforceRecallSurfaceQuotas({
      req,
      reply,
      tenantId: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
      wantDebugEmbeddings,
    });

    const scope = preparedRequest.scope;
    const q = preparedRequest.q;

    let embedMs = 0;
    let embedCacheHit = false;
    let embedSingleflightJoin = false;
    let embedQueueWaitMs = 0;
    let embedBatchSize = 1;
    let recallParsed: ParsedMemoryRecall;
    const adaptiveExecution = await prepareAdaptiveRecallExecution({
      parsed,
      parse: ContextAssembleRequest.parse,
      profile: classAwareProfile.profile,
      explicitRecallKnobs,
      explicitMode,
    });
    const gate = adaptiveExecution.gate;
    parsed = adaptiveExecution.parsed;
    const adaptiveProfile = adaptiveExecution.adaptiveProfile;
    const adaptiveHardCap = adaptiveExecution.adaptiveHardCap;
    const assembleOptimization = applyContextOptimizationProfile(
      parsed,
      env.MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT === "off"
        ? null
        : env.MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT,
    );
    parsed = ContextAssembleRequest.parse(assembleOptimization.parsed);
    const executionContext = buildExecutionContinuityContext(parsed);

    let out: ContextAssembleRouteOutput;
    try {
      let vec: number[];
      const emb = await runRecallEmbedding({
        endpoint: "context_assemble",
        req,
        reply,
        provider: surfaceEmbedder,
        scope,
        tenantId: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
        queryText: q,
      });
      vec = emb.vec;
      ({ embedMs, embedCacheHit, embedSingleflightJoin, embedQueueWaitMs, embedBatchSize } = toRecallEmbedMetrics(emb));

      recallParsed = buildRecallRequestFromQuery({
        scope,
        queryEmbedding: vec,
        parsed,
      });
      const auth = buildRecallAuth(req, wantDebugEmbeddings);
      const unsafeDropTrustAnchors = allowUnsafeDropTrustAnchors(req);
      const applyLayerPolicyToRetrieval = allowLayerPolicyRetrievalFiltering(req);
      const internalAllowL4Selection = allowInternalL4Serving(req);
      out = await runRecallWithStore({
        endpoint: "context_assemble",
        recallParsed,
        auth,
        timings,
        buildRuntimeOptions: () =>
          buildRecallRuntimeOptions({
            internalAllowL4Selection,
            unsafeDropTrustAnchors,
            applyLayerPolicyToRetrieval,
          }),
        finalize: async (recall) => {
          const rules = await maybeEvaluateContextRules({
            recallParsed,
            context: executionContext,
            includeShadow: parsed.include_shadow,
            rulesLimit: parsed.rules_limit,
            includeRules: parsed.include_rules,
          });
          const tools = await maybeSelectContextTools({
            recallParsed,
            parsed,
            context: executionContext,
          });
          return { recall, rules, tools };
        },
      });
    } finally {
      gate.release();
    }

    const ms = performance.now() - t0;
    const recallOut = out.recall;
    const diagnostics = buildRecallRouteDiagnostics({
      recallParsed,
      recallOut,
      tools: out.tools,
      timings,
      inflightWaitMs: gate.wait_ms,
      explicitMode,
      adaptiveProfile,
      adaptiveHardCap,
      classAwareObservability: {
        workload_class: classAwareProfile.workload_class,
        profile: classAwareProfile.profile,
        enabled: classAwareProfile.enabled,
        applied: classAwareProfile.applied,
        reason: classAwareProfile.reason,
        source: classAwareProfile.source,
        signals: classAwareProfile.signals,
      },
    });
    const contextChars = diagnostics.contextChars;
    const contextEstTokens = diagnostics.contextEstTokens;

    const executionKernel = resolveExecutionKernelContext(parsed);
    const effectiveStaticBlocks = buildEffectiveStaticBlocks({
      parsed,
      executionKernel,
    });
    const { layeredContext, costSignals } = buildLayeredContextArtifacts({
      parsed,
      recallParsed,
      recallOut,
      rules: out.rules,
      tools: out.tools,
      executionContext: parsed.context,
      effectiveStaticBlocks,
      contextEstTokens,
      optimizationProfile: assembleOptimization.optimization_profile,
    });
    const assemblySummary = buildAssemblySummary({
      rules: out.rules,
      tools: out.tools,
      layered_context: layeredContext,
      cost_signals: costSignals,
      context_est_tokens: contextEstTokens,
      context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
      optimization_profile: assembleOptimization.optimization_profile.requested,
      recall_mode: explicitMode.mode,
      include_rules: parsed.include_rules,
    });
    const tenantIdOut = recallOut.tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID;
    await recordContextAssemblyTelemetrySafe({
      req,
      tenantId: tenantIdOut,
      scope: recallOut.scope,
      endpoint: "context_assemble",
      latencyMs: ms,
      layeredContext,
      costSignals,
      selectionPolicy: recallOut?.context?.selection_policy ?? null,
    });

    req.log.info(
      {
        context_assemble: {
          scope: recallOut.scope,
          tenant_id: tenantIdOut,
          include_rules: parsed.include_rules,
          include_shadow: parsed.include_shadow,
          rules_limit: parsed.rules_limit,
          has_tool_candidates: Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0,
          tool_candidates: parsed.tool_candidates?.length ?? 0,
          return_layered_context: parsed.return_layered_context,
          execution_kernel_packet_source_mode: executionKernel.source_mode,
          execution_packet_v1_present: !!parsed.execution_packet_v1,
          execution_state_v1_present: !!parsed.execution_state_v1,
          embed_ms: embedMs,
          embed_cache_hit: embedCacheHit,
          embed_singleflight_join: embedSingleflightJoin,
          embed_queue_wait_ms: embedQueueWaitMs,
          embed_batch_size: embedBatchSize,
          context_chars: contextChars,
          context_est_tokens: contextEstTokens,
          context_token_budget: recallParsed.context_token_budget ?? null,
          context_char_budget: recallParsed.context_char_budget ?? null,
          context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
          context_optimization_profile: assembleOptimization.optimization_profile.requested,
          context_optimization_profile_source: assembleOptimization.optimization_profile.source,
          context_budget_default_applied: contextBudgetDefaultApplied,
          profile: adaptiveProfile.profile,
          profile_source: baseProfile.source,
          recall_mode: explicitMode.mode,
          recall_mode_profile: explicitMode.profile,
          recall_mode_applied: explicitMode.applied,
          recall_mode_reason: explicitMode.reason,
          recall_mode_source: explicitMode.source,
          class_aware_profile: classAwareProfile.profile,
          class_aware_enabled: classAwareProfile.enabled,
          class_aware_applied: classAwareProfile.applied,
          class_aware_reason: classAwareProfile.reason,
          class_aware_source: classAwareProfile.source,
          class_aware_workload_class: classAwareProfile.workload_class,
          class_aware_signals: classAwareProfile.signals,
          rules_considered: out.rules?.considered ?? 0,
          rules_matched: out.rules?.matched ?? 0,
          tools_selected: out.tools?.selection?.selected ?? null,
          ms,
          timings_ms: timings,
        },
      },
      "memory context_assemble",
    );

    return reply.code(200).send({
      tenant_id: tenantIdOut,
      scope: recallOut.scope,
      execution_kernel: buildExecutionKernelResponse(executionKernel.source_mode, parsed),
      query: { text: q, embedding_provider: surfaceEmbedder.name },
      recall: {
        ...recallOut,
        trajectory: diagnostics.trajectory,
        observability: diagnostics.observability,
      },
      rules: out.rules ?? undefined,
      tools: out.tools ?? undefined,
      assembly_summary: assemblySummary,
      layered_context: layeredContext,
      cost_signals: costSignals,
    });
  });
}
