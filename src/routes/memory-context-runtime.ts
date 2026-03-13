import { buildRecallObservability, collectRecallTrajectoryUriLinks } from "../app/recall-observability.js";
import { applyContextOptimizationProfile } from "../app/context-optimization-profile.js";
import { buildAssemblySummary, buildPlanningSummary } from "../app/planning-summary.js";
import { buildLayeredContextCostSignals } from "../memory/cost-signals.js";
import { memoryRecallParsed } from "../memory/recall.js";
import { ContextAssembleRequest, MemoryRecallRequest, MemoryRecallTextRequest, PlanningContextRequest } from "../memory/schemas.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { selectTools } from "../memory/tools-select.js";
import { estimateTokenCountFromText } from "../memory/context.js";
import { assembleLayeredContext } from "../memory/context-orchestrator.js";
import { HttpError } from "../util/http.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import type { Env } from "../config.js";

type StoreLike = {
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
  wait_ms: number;
};

export function registerMemoryContextRuntimeRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embedder: any;
  embeddedRuntime: any;
  liteWriteStore?: any;
  recallTextEmbedBatcher: any;
  recallAccessForClient: (client: any) => any;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "recall" | "debug_embeddings") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "recall" | "debug_embeddings", tenantId: string) => Promise<void>;
  enforceRecallTextEmbedQuota: (req: any, reply: any, tenantId: string) => Promise<void>;
  buildRecallAuth: (req: any, allowEmbeddings: boolean) => any;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "recall") => Promise<GateLike>;
  hasExplicitRecallKnobs: (body: unknown) => boolean;
  resolveRecallProfile: (endpoint: "recall_text", tenantId: string) => any;
  resolveExplicitRecallMode: (body: unknown, baseProfile: any, explicitRecallKnobs: boolean) => any;
  resolveClassAwareRecallProfile: (endpoint: "recall_text" | "planning_context" | "context_assemble", body: unknown, baseProfile: any, explicitRecallKnobs: boolean) => any;
  withRecallProfileDefaults: (body: unknown, defaults: any) => any;
  resolveRecallStrategy: (body: unknown, explicitRecallKnobs: boolean) => any;
  resolveAdaptiveRecallProfile: (profile: any, waitMs: number, explicitRecallKnobs: boolean) => any;
  resolveAdaptiveRecallHardCap: (knobs: any, waitMs: number, explicitRecallKnobs: boolean) => any;
  inferRecallStrategyFromKnobs: (knobs: any) => any;
  buildRecallTrajectory: (args: any) => any;
  embedRecallTextQuery: (provider: any, queryText: string) => Promise<{
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
    req: any;
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
    store,
    embedder,
    embeddedRuntime,
    liteWriteStore,
    recallTextEmbedBatcher,
    recallAccessForClient,
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
  const liteModeActive = env.AIONIS_EDITION === "lite" && !!liteWriteStore;

  app.post("/v1/memory/recall_text", async (req: any, reply: any) => {
    if (!embedder) {
      return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use recall_text." });
    }

    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall_text");
    const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
    const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
    const explicitMode = resolveExplicitRecallMode(bodyRaw, baseProfile.profile, explicitRecallKnobs);
    const classAwareProfile = resolveClassAwareRecallProfile("recall_text", bodyRaw, explicitMode.profile, explicitRecallKnobs);
    let body = withRecallProfileDefaults(bodyRaw, classAwareProfile.defaults);
    const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs || explicitMode.mode !== null);
    if (strategyResolution.applied) {
      body = {
        ...body,
        ...strategyResolution.defaults,
        recall_strategy: strategyResolution.strategy,
      };
    }
    let parsed = MemoryRecallTextRequest.parse(body);
    let contextBudgetDefaultApplied = false;
    if (
      parsed.context_token_budget === undefined &&
      parsed.context_char_budget === undefined &&
      env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT > 0
    ) {
      parsed = MemoryRecallTextRequest.parse({
        ...(parsed as any),
        context_token_budget: env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
      });
      contextBudgetDefaultApplied = true;
    }
    const wantDebugEmbeddingsText = parsed.return_debug && parsed.include_embeddings;
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    if (wantDebugEmbeddingsText) await enforceRateLimit(req, reply, "debug_embeddings");
    if (wantDebugEmbeddingsText) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    await enforceRecallTextEmbedQuota(req, reply, parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    const scope = parsed.scope ?? env.MEMORY_SCOPE;
    const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
    const q = env.PII_REDACTION ? redactPII(qNorm).text : qNorm;

    let vec: number[];
    let embedMs = 0;
    let embedCacheHit = false;
    let embedSingleflightJoin = false;
    let embedQueueWaitMs = 0;
    let embedBatchSize = 1;
    let recallParsed: any;
    const gate = await acquireInflightSlot("recall");
    const adaptiveProfile = resolveAdaptiveRecallProfile(classAwareProfile.profile, gate.wait_ms, explicitRecallKnobs || explicitMode.mode !== null);
    if (adaptiveProfile.applied) {
      parsed = MemoryRecallTextRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
    }
    const adaptiveHardCap = resolveAdaptiveRecallHardCap(
      {
        limit: parsed.limit,
        neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
        max_nodes: parsed.max_nodes,
        max_edges: parsed.max_edges,
        ranked_limit: parsed.ranked_limit,
        min_edge_weight: parsed.min_edge_weight,
        min_edge_confidence: parsed.min_edge_confidence,
      },
      gate.wait_ms,
      explicitRecallKnobs,
    );
    if (adaptiveHardCap.applied) {
      parsed = MemoryRecallTextRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
    }
    let out: any;
    try {
      try {
        const emb = await embedRecallTextQuery(embedder, q);
        vec = emb.vec;
        embedMs = emb.ms;
        embedCacheHit = emb.cache_hit;
        embedSingleflightJoin = emb.singleflight_join;
        embedQueueWaitMs = emb.queue_wait_ms;
        embedBatchSize = emb.batch_size;
      } catch (err: any) {
        const mapped = mapRecallTextEmbeddingError(err);
        if (mapped.retry_after_sec) reply.header("retry-after", mapped.retry_after_sec);
        req.log.warn(
          {
            recall_text: {
              scope,
              tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
              embedding_provider: embedder.name,
              query_len: q.length,
              mapped_error: mapped.code,
              mapped_status: mapped.statusCode,
              err_message: String(err?.message ?? err),
            },
          },
          "recall_text embedding failed",
        );
        throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
      }

      recallParsed = MemoryRecallRequest.parse({
        tenant_id: parsed.tenant_id,
        scope,
        recall_strategy: parsed.recall_strategy,
        query_embedding: vec,
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
        rules_context: parsed.rules_context,
        rules_include_shadow: parsed.rules_include_shadow,
        rules_limit: parsed.rules_limit,
      });
      const wantDebugEmbeddings = recallParsed.return_debug && recallParsed.include_embeddings;
      const auth = buildRecallAuth(req, wantDebugEmbeddings);
      if (liteModeActive) {
        const base = await memoryRecallParsed(
          {} as any,
          recallParsed,
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          auth,
          {
            timing: (stage, ms) => {
              timings[stage] = (timings[stage] ?? 0) + ms;
            },
          },
          "recall_text",
          {
            stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
            recall_access: recallAccessForClient({} as any),
          },
        );

        if (recallParsed.rules_context !== undefined && recallParsed.rules_context !== null) {
          const rulesRes = await evaluateRules(
            {} as any,
            {
              scope: recallParsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
              context: recallParsed.rules_context,
              include_shadow: recallParsed.rules_include_shadow,
              limit: recallParsed.rules_limit,
            },
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            {
              embeddedRuntime,
              liteWriteStore,
            },
          );
          (base as any).rules = {
            scope: rulesRes.scope,
            considered: rulesRes.considered,
            matched: rulesRes.matched,
            skipped_invalid_then: rulesRes.skipped_invalid_then,
            invalid_then_sample: rulesRes.invalid_then_sample,
            applied: rulesRes.applied,
          };
        }

        out = base as any;
      } else {
        out = await store.withClient(async (client) => {
          const base = await memoryRecallParsed(
            client,
            recallParsed,
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            auth,
            {
              timing: (stage, ms) => {
                timings[stage] = (timings[stage] ?? 0) + ms;
              },
            },
            "recall_text",
            {
              stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
              recall_access: recallAccessForClient(client),
            },
          );

          if (recallParsed.rules_context !== undefined && recallParsed.rules_context !== null) {
            const rulesRes = await evaluateRules(
              client,
              {
                scope: recallParsed.scope ?? env.MEMORY_SCOPE,
                tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
                context: recallParsed.rules_context,
                include_shadow: recallParsed.rules_include_shadow,
                limit: recallParsed.rules_limit,
              },
              env.MEMORY_SCOPE,
              env.MEMORY_TENANT_ID,
              { embeddedRuntime },
            );
            (base as any).rules = {
              scope: rulesRes.scope,
              considered: rulesRes.considered,
              matched: rulesRes.matched,
              skipped_invalid_then: rulesRes.skipped_invalid_then,
              invalid_then_sample: rulesRes.invalid_then_sample,
              applied: rulesRes.applied,
            };
          }

          return base as any;
        });
      }
    } finally {
      gate.release();
    }
    const ms = performance.now() - t0;
    const contextText = typeof out?.context?.text === "string" ? out.context.text : "";
    const contextChars = contextText.length;
    const contextEstTokens = estimateTokenCountFromText(contextText);
    req.log.info(
      {
        recall_text: {
          scope: out.scope,
          tenant_id: (out as any).tenant_id ?? recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
          limit: recallParsed.limit,
          hops: recallParsed.neighborhood_hops,
          embedding_provider: embedder.name,
          embed_ms: embedMs,
          embed_cache_hit: embedCacheHit,
          embed_singleflight_join: embedSingleflightJoin,
          embed_queue_wait_ms: embedQueueWaitMs,
          embed_batch_size: embedBatchSize,
          embed_batcher: recallTextEmbedBatcher ? recallTextEmbedBatcher.stats() : null,
          include_meta: !!recallParsed.include_meta,
          include_slots: !!recallParsed.include_slots,
          include_slots_preview: !!recallParsed.include_slots_preview,
          consumer_agent_id: recallParsed.consumer_agent_id ?? null,
          consumer_team_id: recallParsed.consumer_team_id ?? null,
          seeds: out.seeds.length,
          nodes: out.subgraph.nodes.length,
          edges: out.subgraph.edges.length,
          neighborhood_counts: (out as any).debug?.neighborhood_counts ?? null,
          rules: (out as any).rules ? { considered: (out as any).rules.considered, matched: (out as any).rules.matched } : null,
          context_chars: contextChars,
          context_est_tokens: contextEstTokens,
          context_token_budget: recallParsed.context_token_budget ?? null,
          context_char_budget: recallParsed.context_char_budget ?? null,
          context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
          context_budget_default_applied: contextBudgetDefaultApplied,
          stage1_exact_fallback_enabled: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
          stage1_exact_fallback_used: Number.isFinite(timings["stage1_candidates_exact_fallback"]),
          stage1_ann_seed_count: (out as any).debug?.stage1?.ann_seed_count ?? null,
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
    const trajectory = buildRecallTrajectory({
      strategy:
        recallParsed.recall_strategy ??
        inferRecallStrategyFromKnobs({
          limit: recallParsed.limit,
          neighborhood_hops: recallParsed.neighborhood_hops as 1 | 2,
          max_nodes: recallParsed.max_nodes,
          max_edges: recallParsed.max_edges,
          ranked_limit: recallParsed.ranked_limit,
          min_edge_weight: recallParsed.min_edge_weight,
          min_edge_confidence: recallParsed.min_edge_confidence,
        }),
      limit: recallParsed.limit,
      neighborhood_hops: recallParsed.neighborhood_hops,
      max_nodes: recallParsed.max_nodes,
      max_edges: recallParsed.max_edges,
      ranked_limit: recallParsed.ranked_limit,
      min_edge_weight: recallParsed.min_edge_weight,
      min_edge_confidence: recallParsed.min_edge_confidence,
      seeds: out.seeds.length,
      nodes: out.subgraph.nodes.length,
      edges: out.subgraph.edges.length,
      context_chars: contextChars,
      timings,
      neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
      stage1: (out as any)?.debug?.stage1 ?? null,
      uri_links: collectRecallTrajectoryUriLinks({ recall: out }),
    });
    const observability = buildRecallObservability({
      timings,
      inflight_wait_ms: gate.wait_ms,
      context_items: (out as any)?.context?.items ?? [],
      selection_policy: (out as any)?.context?.selection_policy ?? null,
      explicit_mode: {
        mode: explicitMode.mode,
        profile: explicitMode.profile,
        applied: explicitMode.applied,
        reason: explicitMode.reason,
        source: explicitMode.source,
      },
      adaptive_profile: {
        profile: adaptiveProfile.profile,
        applied: adaptiveProfile.applied,
        reason: adaptiveProfile.reason,
      },
      class_aware: {
        workload_class: classAwareProfile.workload_class,
        profile: classAwareProfile.profile,
        enabled: classAwareProfile.enabled,
        applied: classAwareProfile.applied,
        reason: classAwareProfile.reason,
        source: classAwareProfile.source,
        signals: classAwareProfile.signals,
      },
      adaptive_hard_cap: {
        applied: adaptiveHardCap.applied,
        reason: adaptiveHardCap.reason,
      },
      stage1: (out as any)?.debug?.stage1 ?? null,
      neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
    });
    return reply.code(200).send({ ...out, query: { text: q, embedding_provider: embedder.name }, trajectory, observability });
  });

  app.post("/v1/memory/planning/context", async (req: any, reply: any) => {
    if (!embedder) {
      return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use planning context." });
    }

    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, "planning_context");
    const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
    const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
    const explicitMode = resolveExplicitRecallMode(bodyRaw, baseProfile.profile, explicitRecallKnobs);
    const classAwareProfile = resolveClassAwareRecallProfile("planning_context", bodyRaw, explicitMode.profile, explicitRecallKnobs);
    let body = withRecallProfileDefaults(bodyRaw, classAwareProfile.defaults);
    const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs || explicitMode.mode !== null);
    if (strategyResolution.applied) {
      body = {
        ...body,
        ...strategyResolution.defaults,
        recall_strategy: strategyResolution.strategy,
      };
    }
    let parsed = PlanningContextRequest.parse(body);
    let contextBudgetDefaultApplied = false;
    if (
      parsed.context_token_budget === undefined &&
      parsed.context_char_budget === undefined &&
      env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT > 0
    ) {
      parsed = PlanningContextRequest.parse({
        ...(parsed as any),
        context_token_budget: env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
      });
      contextBudgetDefaultApplied = true;
    }

    const wantDebugEmbeddings = parsed.return_debug && parsed.include_embeddings;
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
    if (wantDebugEmbeddings) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    await enforceRecallTextEmbedQuota(req, reply, parsed.tenant_id ?? env.MEMORY_TENANT_ID);

    const scope = parsed.scope ?? env.MEMORY_SCOPE;
    const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
    const q = env.PII_REDACTION ? redactPII(qNorm).text : qNorm;

    let embedMs = 0;
    let embedCacheHit = false;
    let embedSingleflightJoin = false;
    let embedQueueWaitMs = 0;
    let embedBatchSize = 1;
    let recallParsed: any;
    const gate = await acquireInflightSlot("recall");
    const adaptiveProfile = resolveAdaptiveRecallProfile(classAwareProfile.profile, gate.wait_ms, explicitRecallKnobs || explicitMode.mode !== null);
    if (adaptiveProfile.applied) {
      parsed = PlanningContextRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
    }
    const adaptiveHardCap = resolveAdaptiveRecallHardCap(
      {
        limit: parsed.limit,
        neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
        max_nodes: parsed.max_nodes,
        max_edges: parsed.max_edges,
        ranked_limit: parsed.ranked_limit,
        min_edge_weight: parsed.min_edge_weight,
        min_edge_confidence: parsed.min_edge_confidence,
      },
      gate.wait_ms,
      explicitRecallKnobs,
    );
    if (adaptiveHardCap.applied) {
      parsed = PlanningContextRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
    }
    const planningOptimization = applyContextOptimizationProfile(
      parsed,
      env.MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT === "off"
        ? null
        : env.MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT,
    );
    parsed = PlanningContextRequest.parse(planningOptimization.parsed);

    let out: any;
    try {
      let vec: number[];
      try {
        const emb = await embedRecallTextQuery(embedder, q);
        vec = emb.vec;
        embedMs = emb.ms;
        embedCacheHit = emb.cache_hit;
        embedSingleflightJoin = emb.singleflight_join;
        embedQueueWaitMs = emb.queue_wait_ms;
        embedBatchSize = emb.batch_size;
      } catch (err: any) {
        const mapped = mapRecallTextEmbeddingError(err);
        if (mapped.retry_after_sec) reply.header("retry-after", mapped.retry_after_sec);
        req.log.warn(
          {
            planning_context: {
              scope,
              tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
              embedding_provider: embedder.name,
              query_len: q.length,
              mapped_error: mapped.code,
              mapped_status: mapped.statusCode,
              err_message: String(err?.message ?? err),
            },
          },
          "planning_context embedding failed",
        );
        throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
      }

      recallParsed = MemoryRecallRequest.parse({
        tenant_id: parsed.tenant_id,
        scope,
        recall_strategy: parsed.recall_strategy,
        query_embedding: vec,
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
      });
      const auth = buildRecallAuth(req, wantDebugEmbeddings);

      if (liteModeActive) {
        const recall = await memoryRecallParsed(
          {} as any,
          recallParsed,
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          auth,
          {
            timing: (stage, ms) => {
              timings[stage] = (timings[stage] ?? 0) + ms;
            },
          },
          "planning_context",
          {
            stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
            recall_access: recallAccessForClient({} as any),
          },
        );

        const rules = await evaluateRules(
          {} as any,
          {
            scope: recallParsed.scope ?? env.MEMORY_SCOPE,
            tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
            context: parsed.context,
            include_shadow: parsed.include_shadow,
            limit: parsed.rules_limit,
          },
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          {
            embeddedRuntime,
            liteWriteStore,
          },
        );

        let tools: any = null;
        if (Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0) {
          tools = await selectTools(
            null,
            {
              scope: recallParsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
              run_id: parsed.run_id,
              context: parsed.context,
              candidates: parsed.tool_candidates,
              include_shadow: parsed.include_shadow,
              rules_limit: parsed.rules_limit,
              strict: parsed.tool_strict,
            },
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            {
              embeddedRuntime,
              liteWriteStore,
            },
          );
        }

        out = { recall, rules, tools };
      } else {
        out = await store.withClient(async (client) => {
          const recall = await memoryRecallParsed(
            client,
            recallParsed,
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            auth,
            {
              timing: (stage, ms) => {
                timings[stage] = (timings[stage] ?? 0) + ms;
              },
            },
            "planning_context",
            {
              stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
              recall_access: recallAccessForClient(client),
            },
          );

          const rules = await evaluateRules(
            client,
            {
              scope: recallParsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
              context: parsed.context,
              include_shadow: parsed.include_shadow,
              limit: parsed.rules_limit,
            },
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            { embeddedRuntime },
          );

          let tools: any = null;
          if (Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0) {
            tools = await selectTools(
              client,
              {
                scope: recallParsed.scope ?? env.MEMORY_SCOPE,
                tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
                run_id: parsed.run_id,
                context: parsed.context,
                candidates: parsed.tool_candidates,
                include_shadow: parsed.include_shadow,
                rules_limit: parsed.rules_limit,
                strict: parsed.tool_strict,
              },
              env.MEMORY_SCOPE,
              env.MEMORY_TENANT_ID,
              { embeddedRuntime },
            );
          }

          return { recall, rules, tools };
        });
      }
    } finally {
      gate.release();
    }

    const ms = performance.now() - t0;
    const recallOut = out.recall as any;
    const contextText = typeof recallOut?.context?.text === "string" ? recallOut.context.text : "";
    const contextChars = contextText.length;
    const contextEstTokens = estimateTokenCountFromText(contextText);
    const trajectory = buildRecallTrajectory({
      strategy:
        recallParsed.recall_strategy ??
        inferRecallStrategyFromKnobs({
          limit: recallParsed.limit,
          neighborhood_hops: recallParsed.neighborhood_hops as 1 | 2,
          max_nodes: recallParsed.max_nodes,
          max_edges: recallParsed.max_edges,
          ranked_limit: recallParsed.ranked_limit,
          min_edge_weight: recallParsed.min_edge_weight,
          min_edge_confidence: recallParsed.min_edge_confidence,
        }),
      limit: recallParsed.limit,
      neighborhood_hops: recallParsed.neighborhood_hops,
      max_nodes: recallParsed.max_nodes,
      max_edges: recallParsed.max_edges,
      ranked_limit: recallParsed.ranked_limit,
      min_edge_weight: recallParsed.min_edge_weight,
      min_edge_confidence: recallParsed.min_edge_confidence,
      seeds: recallOut.seeds.length,
      nodes: recallOut.subgraph.nodes.length,
      edges: recallOut.subgraph.edges.length,
      context_chars: contextChars,
      timings,
      neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
      stage1: recallOut?.debug?.stage1 ?? null,
      uri_links: collectRecallTrajectoryUriLinks({ recall: recallOut, tools: out.tools }),
    });
    const observability = buildRecallObservability({
      timings,
      inflight_wait_ms: gate.wait_ms,
      context_items: recallOut?.context?.items ?? [],
      selection_policy: recallOut?.context?.selection_policy ?? null,
      explicit_mode: {
        mode: explicitMode.mode,
        profile: explicitMode.profile,
        applied: explicitMode.applied,
        reason: explicitMode.reason,
        source: explicitMode.source,
      },
      adaptive_profile: {
        profile: adaptiveProfile.profile,
        applied: adaptiveProfile.applied,
        reason: adaptiveProfile.reason,
      },
      class_aware: {
        workload_class: classAwareProfile.workload_class,
        profile: classAwareProfile.profile,
        applied: classAwareProfile.applied,
        reason: classAwareProfile.reason,
        signals: classAwareProfile.signals,
      },
      adaptive_hard_cap: {
        applied: adaptiveHardCap.applied,
        reason: adaptiveHardCap.reason,
      },
      stage1: recallOut?.debug?.stage1 ?? null,
      neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
    });

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
          ms,
          timings_ms: timings,
        },
      },
      "memory planning_context",
    );

    const layeredContext = parsed.return_layered_context
      ? assembleLayeredContext({
          recall: recallOut,
          rules: out.rules,
          tools: out.tools,
          query_text: parsed.query_text,
          execution_context: parsed.context,
          tool_candidates: parsed.tool_candidates,
          static_blocks: parsed.static_context_blocks ?? null,
          static_injection: parsed.static_injection ?? null,
          config: parsed.context_layers ?? null,
        })
      : undefined;
    if (layeredContext) {
      (layeredContext as any).optimization_profile = planningOptimization.optimization_profile;
    }
    const costSignals = buildLayeredContextCostSignals({
      layered_context: layeredContext,
      context_items: Array.isArray(recallOut?.context?.items) ? recallOut.context.items : [],
      context_est_tokens: contextEstTokens,
      context_token_budget: recallParsed.context_token_budget ?? null,
      context_char_budget: recallParsed.context_char_budget ?? null,
      context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
      context_optimization_profile: planningOptimization.optimization_profile.requested,
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
    try {
      await recordContextAssemblyTelemetryBestEffort({
        req,
        tenant_id: tenantIdOut,
        scope: recallOut.scope,
        endpoint: "planning_context",
        latency_ms: ms,
        layered_output: !!layeredContext,
        layered_context: layeredContext,
        selected_memory_layers: Array.isArray(costSignals?.selected_memory_layers) ? costSignals.selected_memory_layers : [],
        selection_policy:
          recallOut?.context?.selection_policy && typeof recallOut.context.selection_policy === "object"
            ? recallOut.context.selection_policy
            : null,
      });
    } catch (err) {
      req.log.warn({ err, tenant_id: tenantIdOut, scope: recallOut.scope }, "planning_context telemetry insert failed");
    }

    return reply.code(200).send({
      tenant_id: tenantIdOut,
      scope: recallOut.scope,
      query: { text: q, embedding_provider: embedder.name },
      recall: {
        ...recallOut,
        trajectory,
        observability,
      },
      rules: out.rules,
      tools: out.tools ?? undefined,
      planning_summary: planningSummary,
      layered_context: layeredContext,
      cost_signals: costSignals,
    });
  });

  app.post("/v1/memory/context/assemble", async (req: any, reply: any) => {
    if (!embedder) {
      return reply.code(400).send({ error: "no_embedding_provider", message: "Configure EMBEDDING_PROVIDER to use context assembly." });
    }

    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, "context_assemble");
    const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
    const baseProfile = resolveRecallProfile("recall_text", tenantFromBody(bodyRaw));
    const explicitMode = resolveExplicitRecallMode(bodyRaw, baseProfile.profile, explicitRecallKnobs);
    const classAwareProfile = resolveClassAwareRecallProfile("context_assemble", bodyRaw, explicitMode.profile, explicitRecallKnobs);
    let body = withRecallProfileDefaults(bodyRaw, classAwareProfile.defaults);
    const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs || explicitMode.mode !== null);
    if (strategyResolution.applied) {
      body = {
        ...body,
        ...strategyResolution.defaults,
        recall_strategy: strategyResolution.strategy,
      };
    }
    let parsed = ContextAssembleRequest.parse(body);
    let contextBudgetDefaultApplied = false;
    if (
      parsed.context_token_budget === undefined &&
      parsed.context_char_budget === undefined &&
      env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT > 0
    ) {
      parsed = ContextAssembleRequest.parse({
        ...(parsed as any),
        context_token_budget: env.MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT,
      });
      contextBudgetDefaultApplied = true;
    }

    const wantDebugEmbeddings = parsed.return_debug && parsed.include_embeddings;
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
    if (wantDebugEmbeddings) await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    await enforceRecallTextEmbedQuota(req, reply, parsed.tenant_id ?? env.MEMORY_TENANT_ID);

    const scope = parsed.scope ?? env.MEMORY_SCOPE;
    const qNorm = normalizeText(parsed.query_text, env.MAX_TEXT_LEN);
    const q = env.PII_REDACTION ? redactPII(qNorm).text : qNorm;

    let embedMs = 0;
    let embedCacheHit = false;
    let embedSingleflightJoin = false;
    let embedQueueWaitMs = 0;
    let embedBatchSize = 1;
    let recallParsed: any;
    const gate = await acquireInflightSlot("recall");
    const adaptiveProfile = resolveAdaptiveRecallProfile(classAwareProfile.profile, gate.wait_ms, explicitRecallKnobs || explicitMode.mode !== null);
    if (adaptiveProfile.applied) {
      parsed = ContextAssembleRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
    }
    const adaptiveHardCap = resolveAdaptiveRecallHardCap(
      {
        limit: parsed.limit,
        neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
        max_nodes: parsed.max_nodes,
        max_edges: parsed.max_edges,
        ranked_limit: parsed.ranked_limit,
        min_edge_weight: parsed.min_edge_weight,
        min_edge_confidence: parsed.min_edge_confidence,
      },
      gate.wait_ms,
      explicitRecallKnobs,
    );
    if (adaptiveHardCap.applied) {
      parsed = ContextAssembleRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
    }
    const assembleOptimization = applyContextOptimizationProfile(
      parsed,
      env.MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT === "off"
        ? null
        : env.MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT,
    );
    parsed = ContextAssembleRequest.parse(assembleOptimization.parsed);

    let out: any;
    try {
      let vec: number[];
      try {
        const emb = await embedRecallTextQuery(embedder, q);
        vec = emb.vec;
        embedMs = emb.ms;
        embedCacheHit = emb.cache_hit;
        embedSingleflightJoin = emb.singleflight_join;
        embedQueueWaitMs = emb.queue_wait_ms;
        embedBatchSize = emb.batch_size;
      } catch (err: any) {
        const mapped = mapRecallTextEmbeddingError(err);
        if (mapped.retry_after_sec) reply.header("retry-after", mapped.retry_after_sec);
        req.log.warn(
          {
            context_assemble: {
              scope,
              tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
              embedding_provider: embedder.name,
              query_len: q.length,
              mapped_error: mapped.code,
              mapped_status: mapped.statusCode,
              err_message: String(err?.message ?? err),
            },
          },
          "context_assemble embedding failed",
        );
        throw new HttpError(mapped.statusCode, mapped.code, mapped.message, mapped.details);
      }

      recallParsed = MemoryRecallRequest.parse({
        tenant_id: parsed.tenant_id,
        scope,
        recall_strategy: parsed.recall_strategy,
        query_embedding: vec,
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
      });
      const auth = buildRecallAuth(req, wantDebugEmbeddings);
      const executionContext =
        parsed.context && typeof parsed.context === "object" && !Array.isArray(parsed.context) ? parsed.context : {};

      if (liteModeActive) {
        const recall = await memoryRecallParsed(
          {} as any,
          recallParsed,
          env.MEMORY_SCOPE,
          env.MEMORY_TENANT_ID,
          auth,
          {
            timing: (stage, ms) => {
              timings[stage] = (timings[stage] ?? 0) + ms;
            },
          },
          "context_assemble",
          {
            stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
            recall_access: recallAccessForClient({} as any),
          },
        );

        let rules: any = null;
        if (parsed.include_rules) {
          rules = await evaluateRules(
            {} as any,
            {
              scope: recallParsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
              context: executionContext,
              include_shadow: parsed.include_shadow,
              limit: parsed.rules_limit,
            },
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            {
              embeddedRuntime,
              liteWriteStore,
            },
          );
        }

        let tools: any = null;
        if (Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0) {
          tools = await selectTools(
            null,
            {
              scope: recallParsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
              context: executionContext,
              candidates: parsed.tool_candidates,
              include_shadow: parsed.include_shadow,
              rules_limit: parsed.rules_limit,
              strict: parsed.tool_strict,
            },
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            {
              embeddedRuntime,
              liteWriteStore,
            },
          );
        }

        out = { recall, rules, tools };
      } else {
        out = await store.withClient(async (client) => {
          const recall = await memoryRecallParsed(
            client,
            recallParsed,
            env.MEMORY_SCOPE,
            env.MEMORY_TENANT_ID,
            auth,
            {
              timing: (stage, ms) => {
                timings[stage] = (timings[stage] ?? 0) + ms;
              },
            },
            "context_assemble",
            {
              stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
              recall_access: recallAccessForClient(client),
            },
          );

          let rules: any = null;
          if (parsed.include_rules) {
            rules = await evaluateRules(
              client,
              {
                scope: recallParsed.scope ?? env.MEMORY_SCOPE,
                tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
                context: executionContext,
                include_shadow: parsed.include_shadow,
                limit: parsed.rules_limit,
              },
              env.MEMORY_SCOPE,
              env.MEMORY_TENANT_ID,
              { embeddedRuntime },
            );
          }

          let tools: any = null;
          if (Array.isArray(parsed.tool_candidates) && parsed.tool_candidates.length > 0) {
            tools = await selectTools(
              client,
              {
                scope: recallParsed.scope ?? env.MEMORY_SCOPE,
                tenant_id: recallParsed.tenant_id ?? env.MEMORY_TENANT_ID,
                context: executionContext,
                candidates: parsed.tool_candidates,
                include_shadow: parsed.include_shadow,
                rules_limit: parsed.rules_limit,
                strict: parsed.tool_strict,
              },
              env.MEMORY_SCOPE,
              env.MEMORY_TENANT_ID,
              { embeddedRuntime },
            );
          }

          return { recall, rules, tools };
        });
      }
    } finally {
      gate.release();
    }

    const ms = performance.now() - t0;
    const recallOut = out.recall as any;
    const contextText = typeof recallOut?.context?.text === "string" ? recallOut.context.text : "";
    const contextChars = contextText.length;
    const contextEstTokens = estimateTokenCountFromText(contextText);
    const trajectory = buildRecallTrajectory({
      strategy:
        recallParsed.recall_strategy ??
        inferRecallStrategyFromKnobs({
          limit: recallParsed.limit,
          neighborhood_hops: recallParsed.neighborhood_hops as 1 | 2,
          max_nodes: recallParsed.max_nodes,
          max_edges: recallParsed.max_edges,
          ranked_limit: recallParsed.ranked_limit,
          min_edge_weight: recallParsed.min_edge_weight,
          min_edge_confidence: recallParsed.min_edge_confidence,
        }),
      limit: recallParsed.limit,
      neighborhood_hops: recallParsed.neighborhood_hops,
      max_nodes: recallParsed.max_nodes,
      max_edges: recallParsed.max_edges,
      ranked_limit: recallParsed.ranked_limit,
      min_edge_weight: recallParsed.min_edge_weight,
      min_edge_confidence: recallParsed.min_edge_confidence,
      seeds: recallOut.seeds.length,
      nodes: recallOut.subgraph.nodes.length,
      edges: recallOut.subgraph.edges.length,
      context_chars: contextChars,
      timings,
      neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
      stage1: recallOut?.debug?.stage1 ?? null,
      uri_links: collectRecallTrajectoryUriLinks({ recall: recallOut, tools: out.tools }),
    });
    const observability = buildRecallObservability({
      timings,
      inflight_wait_ms: gate.wait_ms,
      context_items: recallOut?.context?.items ?? [],
      selection_policy: recallOut?.context?.selection_policy ?? null,
      explicit_mode: {
        mode: explicitMode.mode,
        profile: explicitMode.profile,
        applied: explicitMode.applied,
        reason: explicitMode.reason,
        source: explicitMode.source,
      },
      adaptive_profile: {
        profile: adaptiveProfile.profile,
        applied: adaptiveProfile.applied,
        reason: adaptiveProfile.reason,
      },
      class_aware: {
        workload_class: classAwareProfile.workload_class,
        profile: classAwareProfile.profile,
        enabled: classAwareProfile.enabled,
        applied: classAwareProfile.applied,
        reason: classAwareProfile.reason,
        source: classAwareProfile.source,
        signals: classAwareProfile.signals,
      },
      adaptive_hard_cap: {
        applied: adaptiveHardCap.applied,
        reason: adaptiveHardCap.reason,
      },
      stage1: recallOut?.debug?.stage1 ?? null,
      neighborhood_counts: recallOut?.debug?.neighborhood_counts ?? null,
    });

    const layeredContext = parsed.return_layered_context
      ? assembleLayeredContext({
          recall: recallOut,
          rules: out.rules,
          tools: out.tools,
          query_text: parsed.query_text,
          execution_context: parsed.context,
          tool_candidates: parsed.tool_candidates,
          static_blocks: parsed.static_context_blocks ?? null,
          static_injection: parsed.static_injection ?? null,
          config: parsed.context_layers ?? null,
        })
      : undefined;
    if (layeredContext) {
      (layeredContext as any).optimization_profile = assembleOptimization.optimization_profile;
    }
    const costSignals = buildLayeredContextCostSignals({
      layered_context: layeredContext,
      context_items: Array.isArray(recallOut?.context?.items) ? recallOut.context.items : [],
      context_est_tokens: contextEstTokens,
      context_token_budget: recallParsed.context_token_budget ?? null,
      context_char_budget: recallParsed.context_char_budget ?? null,
      context_compaction_profile: recallParsed.context_compaction_profile ?? "balanced",
      context_optimization_profile: assembleOptimization.optimization_profile.requested,
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
    try {
      await recordContextAssemblyTelemetryBestEffort({
        req,
        tenant_id: tenantIdOut,
        scope: recallOut.scope,
        endpoint: "context_assemble",
        latency_ms: ms,
        layered_output: !!layeredContext,
        layered_context: layeredContext,
        selected_memory_layers: Array.isArray(costSignals?.selected_memory_layers) ? costSignals.selected_memory_layers : [],
        selection_policy:
          recallOut?.context?.selection_policy && typeof recallOut.context.selection_policy === "object"
            ? recallOut.context.selection_policy
            : null,
      });
    } catch (err) {
      req.log.warn({ err, tenant_id: tenantIdOut, scope: recallOut.scope }, "context_assemble telemetry insert failed");
    }

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
      query: { text: q, embedding_provider: embedder.name },
      recall: {
        ...recallOut,
        trajectory,
        observability,
      },
      rules: out.rules ?? undefined,
      tools: out.tools ?? undefined,
      assembly_summary: assemblySummary,
      layered_context: layeredContext,
      cost_signals: costSignals,
    });
  });
}
