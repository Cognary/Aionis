import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { buildRecallObservability, collectRecallTrajectoryUriLinks } from "../app/recall-observability.js";
import type { Env } from "../config.js";
import { estimateTokenCountFromText } from "../memory/context.js";
import { memoryRecallParsed, type RecallAuth } from "../memory/recall.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { MemoryRecallRequest, type MemoryRecallInput } from "../memory/schemas.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { RecallStoreAccess } from "../store/recall-access.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";
import type { AuthPrincipal } from "../util/auth.js";
import type { InflightGateToken } from "../util/inflight_gate.js";

type RecallProfileLike = {
  profile: string;
  source: string;
};

type ExplicitRecallModeLike = {
  mode: string | null;
  profile: string;
  defaults: Partial<MemoryRecallInput>;
  applied: boolean;
  reason: string;
  source: string;
};

type RecallStrategyResolutionLike = {
  strategy: string;
  defaults: Partial<MemoryRecallInput>;
  applied: boolean;
};

type RecallAdaptiveProfileLike = {
  profile: string;
  defaults: Partial<MemoryRecallInput>;
  applied: boolean;
  reason: string;
};

type RecallAdaptiveHardCapLike = {
  defaults: Partial<MemoryRecallInput>;
  applied: boolean;
  reason: string;
};

type ParsedRecallRequest = ReturnType<typeof MemoryRecallRequest.parse>;
type RecallKnobsLike = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

type RecallRouteOutput = Awaited<ReturnType<typeof memoryRecallParsed>> & {
  context?: {
    text?: string;
    items?: unknown[];
    selection_policy?: unknown;
    selection_stats?: unknown;
  };
  debug?: {
    neighborhood_counts?: unknown;
    stage1?: {
      ann_seed_count?: unknown;
    } & Record<string, unknown>;
  };
  rules?: {
    scope: unknown;
    considered: unknown;
    matched: unknown;
    skipped_invalid_then: unknown;
    invalid_then_sample: unknown;
    applied: unknown;
  };
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toRecallKnobs(parsed: ParsedRecallRequest): RecallKnobsLike {
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

function getRecallContextMetrics(out: RecallRouteOutput) {
  const contextText = typeof out.context?.text === "string" ? out.context.text : "";
  return {
    contextText,
    contextChars: contextText.length,
    contextEstTokens: estimateTokenCountFromText(contextText),
  };
}

type RegisterMemoryRecallRoutesArgs = {
  app: FastifyInstance;
  env: Env;
  embeddedRuntime: EmbeddedMemoryRuntime | null;
  liteRecallAccess: RecallStoreAccess;
  liteWriteStore: Pick<LiteWriteStore, "listRuleCandidates">;
  requireMemoryPrincipal: (req: FastifyRequest) => Promise<AuthPrincipal | null>;
  withIdentityFromRequest: (req: FastifyRequest, body: unknown, principal: AuthPrincipal | null, kind: "recall") => unknown;
  enforceRateLimit: (req: FastifyRequest, reply: FastifyReply, kind: "recall" | "debug_embeddings") => Promise<void>;
  enforceTenantQuota: (req: FastifyRequest, reply: FastifyReply, kind: "recall" | "debug_embeddings", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "recall") => Promise<InflightGateToken>;
  hasExplicitRecallKnobs: (body: unknown) => boolean;
  resolveRecallProfile: (endpoint: "recall", tenantId: string) => RecallProfileLike;
  resolveExplicitRecallMode: (body: unknown, baseProfile: string, explicitRecallKnobs: boolean) => ExplicitRecallModeLike;
  withRecallProfileDefaults: (body: unknown, defaults: Partial<MemoryRecallInput>) => Record<string, unknown>;
  resolveRecallStrategy: (body: unknown, explicitRecallKnobs: boolean) => RecallStrategyResolutionLike;
  resolveAdaptiveRecallProfile: (profile: string, waitMs: number, explicitRecallKnobs: boolean) => RecallAdaptiveProfileLike;
  resolveAdaptiveRecallHardCap: (knobs: {
    limit: number;
    neighborhood_hops: 1 | 2;
    max_nodes: number;
    max_edges: number;
    ranked_limit: number;
    min_edge_weight: number;
    min_edge_confidence: number;
  }, waitMs: number, explicitRecallKnobs: boolean) => RecallAdaptiveHardCapLike;
  inferRecallStrategyFromKnobs: (knobs: {
    limit: number;
    neighborhood_hops: 1 | 2;
    max_nodes: number;
    max_edges: number;
    ranked_limit: number;
    min_edge_weight: number;
    min_edge_confidence: number;
  }) => unknown;
  buildRecallTrajectory: (args: unknown) => unknown;
  buildRecallAuth: (req: FastifyRequest, allowEmbeddings: boolean) => RecallAuth;
};

export function registerMemoryRecallRoutes(args: RegisterMemoryRecallRoutesArgs) {
  const {
    app,
    env,
    embeddedRuntime,
    liteRecallAccess,
    liteWriteStore,
    requireMemoryPrincipal,
    withIdentityFromRequest,
    enforceRateLimit,
    enforceTenantQuota,
    tenantFromBody,
    acquireInflightSlot,
    hasExplicitRecallKnobs,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    withRecallProfileDefaults,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
    buildRecallAuth,
  } = args;
  if (env.AIONIS_EDITION !== "lite") {
    throw new Error("aionis-lite memory-recall routes only support AIONIS_EDITION=lite");
  }

  const runRecallWithOptionalRules = async (
    parsed: ParsedRecallRequest,
    auth: RecallAuth,
    timings: Record<string, number>,
  ): Promise<RecallRouteOutput> => {
    const base = await memoryRecallParsed(
      {} as pg.PoolClient,
      parsed,
      env.MEMORY_SCOPE,
      env.MEMORY_TENANT_ID,
      auth,
      {
        timing: (stage, ms) => {
          timings[stage] = (timings[stage] ?? 0) + ms;
        },
      },
      "recall",
      {
        stage1_exact_fallback_on_empty: env.MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY,
        recall_access: liteRecallAccess,
      },
    );

    if (parsed.rules_context === undefined || parsed.rules_context === null) {
      return base;
    }

    const rulesRes = await evaluateRules(
      {} as pg.PoolClient,
      {
        scope: parsed.scope ?? env.MEMORY_SCOPE,
        tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
        context: parsed.rules_context,
        include_shadow: parsed.rules_include_shadow,
        limit: parsed.rules_limit,
      },
      env.MEMORY_SCOPE,
      env.MEMORY_TENANT_ID,
      { embeddedRuntime, liteWriteStore },
    );

    return {
      ...base,
      scope: rulesRes.scope,
      rules: {
        scope: rulesRes.scope,
        considered: rulesRes.considered,
        matched: rulesRes.matched,
        skipped_invalid_then: rulesRes.skipped_invalid_then,
        invalid_then_sample: rulesRes.invalid_then_sample,
        applied: rulesRes.applied,
      },
    };
  };

  app.post("/v1/memory/recall", async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall");
    const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
    const baseProfile = resolveRecallProfile("recall", tenantFromBody(bodyRaw));
    const explicitMode = resolveExplicitRecallMode(bodyRaw, baseProfile.profile, explicitRecallKnobs);
    let body = asObject(withRecallProfileDefaults(bodyRaw, explicitMode.defaults));
    const strategyResolution = resolveRecallStrategy(bodyRaw, explicitRecallKnobs || explicitMode.mode !== null);
    if (strategyResolution.applied) {
      body = {
        ...body,
        ...strategyResolution.defaults,
        recall_strategy: strategyResolution.strategy,
      };
    }
    let parsed = MemoryRecallRequest.parse(body);
    const wantDebugEmbeddings = parsed.return_debug && parsed.include_embeddings;
    await enforceRateLimit(req, reply, "recall");
    await enforceTenantQuota(req, reply, "recall", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    if (wantDebugEmbeddings) await enforceRateLimit(req, reply, "debug_embeddings");
    if (wantDebugEmbeddings) {
      await enforceTenantQuota(req, reply, "debug_embeddings", parsed.tenant_id ?? env.MEMORY_TENANT_ID);
    }
    const gate = await acquireInflightSlot("recall");
    const adaptiveProfile = resolveAdaptiveRecallProfile(explicitMode.profile, gate.wait_ms, explicitRecallKnobs || explicitMode.mode !== null);
    if (adaptiveProfile.applied) {
      parsed = MemoryRecallRequest.parse({ ...parsed, ...adaptiveProfile.defaults });
    }
    const parsedKnobs = toRecallKnobs(parsed);
    const adaptiveHardCap = resolveAdaptiveRecallHardCap(parsedKnobs, gate.wait_ms, explicitRecallKnobs);
    if (adaptiveHardCap.applied) {
      parsed = MemoryRecallRequest.parse({ ...parsed, ...adaptiveHardCap.defaults });
    }
    const auth = buildRecallAuth(req, wantDebugEmbeddings);
    let out: RecallRouteOutput;
    try {
      out = await runRecallWithOptionalRules(parsed, auth, timings);
    } finally {
      gate.release();
    }
    const ms = performance.now() - t0;
    const { contextChars, contextEstTokens } = getRecallContextMetrics(out);
    req.log.info(
      {
        recall: {
          scope: out.scope,
          tenant_id: out.tenant_id ?? parsed.tenant_id ?? env.MEMORY_TENANT_ID,
          limit: parsed.limit,
          hops: parsed.neighborhood_hops,
          include_meta: !!parsed.include_meta,
          include_slots: !!parsed.include_slots,
          include_slots_preview: !!parsed.include_slots_preview,
          consumer_agent_id: parsed.consumer_agent_id ?? null,
          consumer_team_id: parsed.consumer_team_id ?? null,
          seeds: out.seeds.length,
          nodes: out.subgraph.nodes.length,
          edges: out.subgraph.edges.length,
          neighborhood_counts: out.debug?.neighborhood_counts ?? null,
          rules: out.rules ? { considered: out.rules.considered, matched: out.rules.matched } : null,
          context_chars: contextChars,
          context_est_tokens: contextEstTokens,
          context_token_budget: parsed.context_token_budget ?? null,
          context_char_budget: parsed.context_char_budget ?? null,
          context_compaction_profile: parsed.context_compaction_profile ?? "balanced",
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
      "memory recall",
    );
    const trajectory = buildRecallTrajectory({
      strategy:
        parsed.recall_strategy ??
        inferRecallStrategyFromKnobs(toRecallKnobs(parsed)),
      limit: parsed.limit,
      neighborhood_hops: parsed.neighborhood_hops,
      max_nodes: parsed.max_nodes,
      max_edges: parsed.max_edges,
      ranked_limit: parsed.ranked_limit,
      min_edge_weight: parsed.min_edge_weight,
      min_edge_confidence: parsed.min_edge_confidence,
      seeds: out.seeds.length,
      nodes: out.subgraph.nodes.length,
      edges: out.subgraph.edges.length,
      context_chars: contextChars,
      timings,
      neighborhood_counts: out.debug?.neighborhood_counts ?? null,
      stage1: out.debug?.stage1 ?? null,
      uri_links: collectRecallTrajectoryUriLinks({ recall: out }),
    });
    const observability = buildRecallObservability({
      timings,
      inflight_wait_ms: gate.wait_ms,
      context_items: out.context?.items ?? [],
      selection_policy: out.context?.selection_policy ?? null,
      selection_stats: out.context?.selection_stats ?? null,
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
      adaptive_hard_cap: {
        applied: adaptiveHardCap.applied,
        reason: adaptiveHardCap.reason,
      },
      stage1: out.debug?.stage1 ?? null,
      neighborhood_counts: out.debug?.neighborhood_counts ?? null,
    });
    return reply.code(200).send({ ...out, trajectory, observability });
  });
}
