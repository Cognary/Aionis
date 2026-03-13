import { buildRecallObservability, collectRecallTrajectoryUriLinks } from "../app/recall-observability.js";
import type { Env } from "../config.js";
import { estimateTokenCountFromText } from "../memory/context.js";
import { memoryRecallParsed } from "../memory/recall.js";
import { evaluateRules } from "../memory/rules-evaluate.js";
import { MemoryRecallRequest } from "../memory/schemas.js";

type StoreLike = {
  withClient: <T>(fn: (client: any) => Promise<T>) => Promise<T>;
};

type GateLike = {
  release: () => void;
  wait_ms: number;
};

export function registerMemoryRecallRoutes(args: {
  app: any;
  env: Env;
  store: StoreLike;
  embeddedRuntime: any;
  recallAccessForClient: (client: any) => any;
  requireMemoryPrincipal: (req: any) => Promise<any>;
  withIdentityFromRequest: (req: any, body: unknown, principal: any, kind: any) => any;
  enforceRateLimit: (req: any, reply: any, kind: "recall" | "debug_embeddings") => Promise<void>;
  enforceTenantQuota: (req: any, reply: any, kind: "recall" | "debug_embeddings", tenantId: string) => Promise<void>;
  tenantFromBody: (body: unknown) => string;
  acquireInflightSlot: (kind: "recall") => Promise<GateLike>;
  hasExplicitRecallKnobs: (body: unknown) => boolean;
  resolveRecallProfile: (endpoint: "recall", tenantId: string) => any;
  resolveExplicitRecallMode: (body: unknown, baseProfile: any, explicitRecallKnobs: boolean) => any;
  withRecallProfileDefaults: (body: unknown, defaults: any) => any;
  resolveRecallStrategy: (body: unknown, explicitRecallKnobs: boolean) => any;
  resolveAdaptiveRecallProfile: (profile: any, waitMs: number, explicitRecallKnobs: boolean) => any;
  resolveAdaptiveRecallHardCap: (knobs: any, waitMs: number, explicitRecallKnobs: boolean) => any;
  inferRecallStrategyFromKnobs: (knobs: any) => any;
  buildRecallTrajectory: (args: any) => any;
  buildRecallAuth: (req: any, allowEmbeddings: boolean) => any;
}) {
  const {
    app,
    env,
    store,
    embeddedRuntime,
    recallAccessForClient,
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

  app.post("/v1/memory/recall", async (req: any, reply: any) => {
    const t0 = performance.now();
    const timings: Record<string, number> = {};
    const principal = await requireMemoryPrincipal(req);
    const bodyRaw = withIdentityFromRequest(req, req.body, principal, "recall");
    const explicitRecallKnobs = hasExplicitRecallKnobs(bodyRaw);
    const baseProfile = resolveRecallProfile("recall", tenantFromBody(bodyRaw));
    const explicitMode = resolveExplicitRecallMode(bodyRaw, baseProfile.profile, explicitRecallKnobs);
    let body = withRecallProfileDefaults(bodyRaw, explicitMode.defaults);
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
      parsed = MemoryRecallRequest.parse({ ...(parsed as any), ...adaptiveProfile.defaults });
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
      parsed = MemoryRecallRequest.parse({ ...(parsed as any), ...adaptiveHardCap.defaults });
    }
    const auth = buildRecallAuth(req, wantDebugEmbeddings);
    let out: any;
    try {
      out = await store.withClient(async (client) => {
        const base = await memoryRecallParsed(
          client,
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
            recall_access: recallAccessForClient(client),
          },
        );

        if (parsed.rules_context !== undefined && parsed.rules_context !== null) {
          const rulesRes = await evaluateRules(
            client,
            {
              scope: parsed.scope ?? env.MEMORY_SCOPE,
              tenant_id: parsed.tenant_id ?? env.MEMORY_TENANT_ID,
              context: parsed.rules_context,
              include_shadow: parsed.rules_include_shadow,
              limit: parsed.rules_limit,
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
    } finally {
      gate.release();
    }
    const ms = performance.now() - t0;
    const contextText = typeof out?.context?.text === "string" ? out.context.text : "";
    const contextChars = contextText.length;
    const contextEstTokens = estimateTokenCountFromText(contextText);
    req.log.info(
      {
        recall: {
          scope: out.scope,
          tenant_id: (out as any).tenant_id ?? parsed.tenant_id ?? env.MEMORY_TENANT_ID,
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
          neighborhood_counts: (out as any).debug?.neighborhood_counts ?? null,
          rules: (out as any).rules ? { considered: (out as any).rules.considered, matched: (out as any).rules.matched } : null,
          context_chars: contextChars,
          context_est_tokens: contextEstTokens,
          context_token_budget: parsed.context_token_budget ?? null,
          context_char_budget: parsed.context_char_budget ?? null,
          context_compaction_profile: parsed.context_compaction_profile ?? "balanced",
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
        inferRecallStrategyFromKnobs({
          limit: parsed.limit,
          neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
          max_nodes: parsed.max_nodes,
          max_edges: parsed.max_edges,
          ranked_limit: parsed.ranked_limit,
          min_edge_weight: parsed.min_edge_weight,
          min_edge_confidence: parsed.min_edge_confidence,
        }),
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
      adaptive_hard_cap: {
        applied: adaptiveHardCap.applied,
        reason: adaptiveHardCap.reason,
      },
      stage1: (out as any)?.debug?.stage1 ?? null,
      neighborhood_counts: (out as any)?.debug?.neighborhood_counts ?? null,
    });
    return reply.code(200).send({ ...out, trajectory, observability });
  });
}
