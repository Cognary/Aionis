import type { Env } from "../config.js";

export type RecallProfileDefaults = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

export type RecallProfileName = "legacy" | "strict_edges" | "quality_first" | "lite";
export type RecallEndpoint = "recall" | "recall_text";
export type RecallTextEndpoint = "recall_text" | "planning_context" | "context_assemble";
export type RecallStrategyName = "local" | "balanced" | "global";
export type RecallWorkloadClass = "dense_edge" | "workflow_path" | "broad_semantic" | "sparse_hit";
export type RecallModeName = "dense_edge";

type RecallProfilePolicy = {
  endpoint: Partial<Record<RecallEndpoint, RecallProfileName>>;
  tenant_default: Record<string, RecallProfileName>;
  tenant_endpoint: Record<string, Partial<Record<RecallEndpoint, RecallProfileName>>>;
};

type RecallProfileResolution = {
  profile: RecallProfileName;
  defaults: RecallProfileDefaults;
  source: "global_default" | "endpoint_override" | "tenant_default" | "tenant_endpoint_override";
};

type RecallAdaptiveResolution = {
  profile: RecallProfileName;
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "disabled" | "explicit_knobs" | "wait_below_threshold" | "already_target_profile" | "queue_pressure";
};

type RecallStrategyResolution = {
  strategy: RecallStrategyName;
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "no_strategy" | "explicit_knobs" | "applied";
};

type RecallHardCapResolution = {
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "disabled" | "explicit_knobs" | "wait_below_threshold" | "already_capped" | "queue_pressure_hard_cap";
};

type ExplicitRecallModeResolution = {
  mode: RecallModeName | null;
  profile: RecallProfileName;
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason: "no_mode" | "explicit_knobs" | "already_target_profile" | "applied";
  source: "request_override" | "none";
};

type RecallClassAwareResolution = {
  profile: RecallProfileName;
  defaults: RecallProfileDefaults;
  applied: boolean;
  reason:
    | "disabled"
    | "request_disabled"
    | "explicit_mode"
    | "explicit_knobs"
    | "explicit_strategy"
    | "no_query_text"
    | "no_match"
    | "already_target_profile"
    | "classified_v1";
  workload_class: RecallWorkloadClass | null;
  signals: string[];
  enabled: boolean;
  source: "env_default" | "request_override";
};

const RECALL_PROFILE_DEFAULTS: Record<RecallProfileName, RecallProfileDefaults> = {
  legacy: {
    limit: 30,
    neighborhood_hops: 2,
    max_nodes: 50,
    max_edges: 100,
    ranked_limit: 100,
    min_edge_weight: 0,
    min_edge_confidence: 0,
  },
  strict_edges: {
    limit: 24,
    neighborhood_hops: 2,
    max_nodes: 60,
    max_edges: 80,
    ranked_limit: 140,
    min_edge_weight: 0.2,
    min_edge_confidence: 0.2,
  },
  quality_first: {
    limit: 30,
    neighborhood_hops: 2,
    max_nodes: 80,
    max_edges: 100,
    ranked_limit: 180,
    min_edge_weight: 0.05,
    min_edge_confidence: 0.05,
  },
  lite: {
    limit: 12,
    neighborhood_hops: 1,
    max_nodes: 24,
    max_edges: 24,
    ranked_limit: 48,
    min_edge_weight: 0.25,
    min_edge_confidence: 0.25,
  },
};

const RECALL_STRATEGY_DEFAULTS: Record<RecallStrategyName, RecallProfileDefaults> = {
  local: {
    limit: 16,
    neighborhood_hops: 1,
    max_nodes: 32,
    max_edges: 40,
    ranked_limit: 80,
    min_edge_weight: 0.2,
    min_edge_confidence: 0.2,
  },
  balanced: RECALL_PROFILE_DEFAULTS.strict_edges,
  global: RECALL_PROFILE_DEFAULTS.quality_first,
};

const RECALL_KNOB_KEYS: Array<keyof RecallProfileDefaults> = [
  "limit",
  "neighborhood_hops",
  "max_nodes",
  "max_edges",
  "ranked_limit",
  "min_edge_weight",
  "min_edge_confidence",
];

const RECALL_CLASS_PROFILE_DEFAULTS: Record<RecallWorkloadClass, RecallProfileName> = {
  dense_edge: "quality_first",
  workflow_path: "strict_edges",
  broad_semantic: "strict_edges",
  sparse_hit: "strict_edges",
};

const RECALL_MODE_PROFILE_DEFAULTS: Record<RecallModeName, RecallProfileName> = {
  dense_edge: "quality_first",
};

const WORKFLOW_KEYWORDS = [
  "deploy",
  "rollback",
  "runbook",
  "workflow",
  "playbook",
  "procedure",
  "incident",
  "step",
  "steps",
  "kubectl",
];
const DENSE_EDGE_KEYWORDS = ["graph", "relationship", "relationships", "dependency", "dependencies", "cluster", "clusters", "lineage", "topology"];
const SPARSE_HIT_KEYWORDS = ["one-off", "one off", "unique phrase", "exact", "sparse", "unrelated", "lookup", "uuid", "ticket", "hash"];
const BROAD_SEMANTIC_KEYWORDS = ["overview", "background", "prepare", "semantic", "memory context", "what should i know", "what do i need to know"];

function hasSubstringAny(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

function hasExplicitRecallStrategy(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const raw = (body as Record<string, unknown>).recall_strategy;
  return raw === "local" || raw === "balanced" || raw === "global";
}

function readRecallClassAwareOverride(body: unknown): boolean | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).recall_class_aware;
  return typeof raw === "boolean" ? raw : null;
}

function readRecallMode(body: unknown): RecallModeName | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).recall_mode;
  return raw === "dense_edge" ? raw : null;
}

function parseRecallProfilePolicy(raw: string): RecallProfilePolicy {
  const out: RecallProfilePolicy = {
    endpoint: {},
    tenant_default: {},
    tenant_endpoint: {},
  };
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === "{}") return out;

  const parsed = JSON.parse(trimmed) as Record<string, unknown>;

  const endpoint = parsed.endpoint;
  if (endpoint && typeof endpoint === "object" && !Array.isArray(endpoint)) {
    for (const [key, value] of Object.entries(endpoint)) {
      if ((key === "recall" || key === "recall_text") && typeof value === "string") {
        out.endpoint[key] = value as RecallProfileName;
      }
    }
  }

  const tenantDefault = parsed.tenant_default;
  if (tenantDefault && typeof tenantDefault === "object" && !Array.isArray(tenantDefault)) {
    for (const [key, value] of Object.entries(tenantDefault)) {
      if (typeof value === "string" && key.trim().length > 0) {
        out.tenant_default[key.trim()] = value as RecallProfileName;
      }
    }
  }

  const tenantEndpoint = parsed.tenant_endpoint;
  if (tenantEndpoint && typeof tenantEndpoint === "object" && !Array.isArray(tenantEndpoint)) {
    for (const [tenant, value] of Object.entries(tenantEndpoint)) {
      if (!value || typeof value !== "object" || Array.isArray(value) || tenant.trim().length === 0) continue;
      const map: Partial<Record<RecallEndpoint, RecallProfileName>> = {};
      for (const [key, endpointValue] of Object.entries(value)) {
        if ((key === "recall" || key === "recall_text") && typeof endpointValue === "string") {
          map[key] = endpointValue as RecallProfileName;
        }
      }
      if (Object.keys(map).length > 0) out.tenant_endpoint[tenant.trim()] = map;
    }
  }

  return out;
}

export function createRecallPolicy(env: Env) {
  const globalRecallProfileDefaults = RECALL_PROFILE_DEFAULTS[env.MEMORY_RECALL_PROFILE];
  const recallProfilePolicy = parseRecallProfilePolicy(env.MEMORY_RECALL_PROFILE_POLICY_JSON);

  const withRecallProfileDefaults = (body: unknown, defaults: RecallProfileDefaults) => {
    const out: Record<string, unknown> = body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
    const entries = Object.entries(defaults) as Array<[keyof RecallProfileDefaults, number]>;
    for (const [key, value] of entries) {
      if (out[key] === undefined || out[key] === null) out[key] = value;
    }
    return out;
  };

  const resolveRecallProfile = (endpoint: RecallEndpoint, tenantId: string | null | undefined): RecallProfileResolution => {
    const tenant = (tenantId ?? "").trim();
    const tenantEndpoint = tenant ? recallProfilePolicy.tenant_endpoint[tenant]?.[endpoint] : undefined;
    if (tenantEndpoint) {
      return {
        profile: tenantEndpoint,
        defaults: RECALL_PROFILE_DEFAULTS[tenantEndpoint],
        source: "tenant_endpoint_override",
      };
    }
    const tenantDefault = tenant ? recallProfilePolicy.tenant_default[tenant] : undefined;
    if (tenantDefault) {
      return {
        profile: tenantDefault,
        defaults: RECALL_PROFILE_DEFAULTS[tenantDefault],
        source: "tenant_default",
      };
    }
    const endpointDefault = recallProfilePolicy.endpoint[endpoint];
    if (endpointDefault) {
      return {
        profile: endpointDefault,
        defaults: RECALL_PROFILE_DEFAULTS[endpointDefault],
        source: "endpoint_override",
      };
    }
    return {
      profile: env.MEMORY_RECALL_PROFILE,
      defaults: globalRecallProfileDefaults,
      source: "global_default",
    };
  };

  const hasExplicitRecallKnobs = (body: unknown): boolean => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    const obj = body as Record<string, unknown>;
    for (const key of RECALL_KNOB_KEYS) {
      if (obj[key] !== undefined && obj[key] !== null) return true;
    }
    return false;
  };

  const resolveRecallStrategy = (body: unknown, hasExplicitKnobs: boolean): RecallStrategyResolution => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { strategy: "balanced", defaults: RECALL_STRATEGY_DEFAULTS.balanced, applied: false, reason: "no_strategy" };
    }
    const raw = (body as Record<string, unknown>).recall_strategy;
    if (raw !== "local" && raw !== "balanced" && raw !== "global") {
      return { strategy: "balanced", defaults: RECALL_STRATEGY_DEFAULTS.balanced, applied: false, reason: "no_strategy" };
    }
    const strategy = raw as RecallStrategyName;
    if (hasExplicitKnobs) {
      return { strategy, defaults: RECALL_STRATEGY_DEFAULTS[strategy], applied: false, reason: "explicit_knobs" };
    }
    return { strategy, defaults: RECALL_STRATEGY_DEFAULTS[strategy], applied: true, reason: "applied" };
  };

  const resolveClassAwareRecallProfile = (
    endpoint: RecallTextEndpoint,
    body: unknown,
    baseProfile: RecallProfileName,
    hasExplicitKnobs: boolean,
  ): RecallClassAwareResolution => {
    const explicitMode = readRecallMode(body);
    const classAwareOverride = readRecallClassAwareOverride(body);
    const classAwareEnabled = classAwareOverride ?? env.MEMORY_RECALL_CLASS_AWARE_ENABLED;
    const classAwareSource = classAwareOverride === null ? "env_default" : "request_override";
    if (!classAwareEnabled) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: classAwareOverride === false ? "request_disabled" : "disabled",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }
    if (hasExplicitKnobs) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "explicit_knobs",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }
    if (explicitMode) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "explicit_mode",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }
    if (hasExplicitRecallStrategy(body)) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "explicit_strategy",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "no_query_text",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }
    const obj = body as Record<string, unknown>;
    const queryText = typeof obj.query_text === "string" ? obj.query_text.trim().toLowerCase() : "";
    if (!queryText) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "no_query_text",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }

    const signals: string[] = [];
    const toolCandidates =
      Array.isArray(obj.tool_candidates) ? obj.tool_candidates.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
    if (toolCandidates.length > 0) signals.push(`tool_candidates:${toolCandidates.length}`);
    if (typeof obj.run_id === "string" && obj.run_id.trim().length > 0) signals.push("run_id");

    const workflowMatches = hasSubstringAny(queryText, WORKFLOW_KEYWORDS);
    const denseMatches = hasSubstringAny(queryText, DENSE_EDGE_KEYWORDS);
    const sparseMatches = hasSubstringAny(queryText, SPARSE_HIT_KEYWORDS);
    const broadMatches = hasSubstringAny(queryText, BROAD_SEMANTIC_KEYWORDS);

    let workloadClass: RecallWorkloadClass | null = null;
    if (toolCandidates.length > 0 || typeof obj.run_id === "string" || workflowMatches.length > 0 || endpoint === "planning_context") {
      workloadClass = "workflow_path";
      signals.push(...workflowMatches.map((item) => `keyword:${item}`));
    } else if (denseMatches.length > 0) {
      workloadClass = "dense_edge";
      signals.push(...denseMatches.map((item) => `keyword:${item}`));
    } else if (sparseMatches.length > 0) {
      workloadClass = "sparse_hit";
      signals.push(...sparseMatches.map((item) => `keyword:${item}`));
    } else if (broadMatches.length > 0 || endpoint === "context_assemble") {
      workloadClass = "broad_semantic";
      signals.push(...broadMatches.map((item) => `keyword:${item}`));
    }

    if (!workloadClass) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "no_match",
        workload_class: null,
        signals: [],
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }

    const targetProfile = RECALL_CLASS_PROFILE_DEFAULTS[workloadClass];
    if (targetProfile === baseProfile) {
      return {
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "already_target_profile",
        workload_class: workloadClass,
        signals,
        enabled: classAwareEnabled,
        source: classAwareSource,
      };
    }
    return {
      profile: targetProfile,
      defaults: RECALL_PROFILE_DEFAULTS[targetProfile],
      applied: true,
      reason: "classified_v1",
      workload_class: workloadClass,
      signals,
      enabled: classAwareEnabled,
      source: classAwareSource,
    };
  };

  const resolveAdaptiveRecallProfile = (
    baseProfile: RecallProfileName,
    gateWaitMs: number,
    hasExplicitKnobs: boolean,
  ): RecallAdaptiveResolution => {
    if (!env.MEMORY_RECALL_ADAPTIVE_DOWNGRADE_ENABLED) {
      return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "disabled" };
    }
    if (hasExplicitKnobs) {
      return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "explicit_knobs" };
    }
    if (gateWaitMs < env.MEMORY_RECALL_ADAPTIVE_WAIT_MS) {
      return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "wait_below_threshold" };
    }
    const target = env.MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE;
    if (target === baseProfile) {
      return { profile: baseProfile, defaults: RECALL_PROFILE_DEFAULTS[baseProfile], applied: false, reason: "already_target_profile" };
    }
    return { profile: target, defaults: RECALL_PROFILE_DEFAULTS[target], applied: true, reason: "queue_pressure" };
  };

  const resolveExplicitRecallMode = (
    body: unknown,
    baseProfile: RecallProfileName,
    hasExplicitKnobs: boolean,
  ): ExplicitRecallModeResolution => {
    const mode = readRecallMode(body);
    if (!mode) {
      return {
        mode: null,
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "no_mode",
        source: "none",
      };
    }
    if (hasExplicitKnobs) {
      return {
        mode,
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "explicit_knobs",
        source: "request_override",
      };
    }
    const targetProfile = RECALL_MODE_PROFILE_DEFAULTS[mode];
    if (targetProfile === baseProfile) {
      return {
        mode,
        profile: baseProfile,
        defaults: RECALL_PROFILE_DEFAULTS[baseProfile],
        applied: false,
        reason: "already_target_profile",
        source: "request_override",
      };
    }
    return {
      mode,
      profile: targetProfile,
      defaults: RECALL_PROFILE_DEFAULTS[targetProfile],
      applied: true,
      reason: "applied",
      source: "request_override",
    };
  };

  const resolveAdaptiveRecallHardCap = (
    current: RecallProfileDefaults,
    gateWaitMs: number,
    hasExplicitKnobs: boolean,
  ): RecallHardCapResolution => {
    if (!env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_ENABLED) {
      return { defaults: current, applied: false, reason: "disabled" };
    }
    if (hasExplicitKnobs) {
      return { defaults: current, applied: false, reason: "explicit_knobs" };
    }
    if (gateWaitMs < env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS) {
      return { defaults: current, applied: false, reason: "wait_below_threshold" };
    }
    const capped: RecallProfileDefaults = {
      limit: Math.min(current.limit, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_LIMIT),
      neighborhood_hops: Math.min(current.neighborhood_hops, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_NEIGHBORHOOD_HOPS) as 1 | 2,
      max_nodes: Math.min(current.max_nodes, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_NODES),
      max_edges: Math.min(current.max_edges, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MAX_EDGES),
      ranked_limit: Math.min(current.ranked_limit, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_RANKED_LIMIT),
      min_edge_weight: Math.max(current.min_edge_weight, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_WEIGHT),
      min_edge_confidence: Math.max(current.min_edge_confidence, env.MEMORY_RECALL_ADAPTIVE_HARD_CAP_MIN_EDGE_CONFIDENCE),
    };
    const changed =
      capped.limit !== current.limit ||
      capped.neighborhood_hops !== current.neighborhood_hops ||
      capped.max_nodes !== current.max_nodes ||
      capped.max_edges !== current.max_edges ||
      capped.ranked_limit !== current.ranked_limit ||
      capped.min_edge_weight !== current.min_edge_weight ||
      capped.min_edge_confidence !== current.min_edge_confidence;
    if (!changed) {
      return { defaults: current, applied: false, reason: "already_capped" };
    }
    return { defaults: capped, applied: true, reason: "queue_pressure_hard_cap" };
  };

  const inferRecallStrategyFromKnobs = (knobs: RecallProfileDefaults): RecallStrategyName => {
    const isSame = (a: RecallProfileDefaults, b: RecallProfileDefaults) =>
      a.limit === b.limit &&
      a.neighborhood_hops === b.neighborhood_hops &&
      a.max_nodes === b.max_nodes &&
      a.max_edges === b.max_edges &&
      a.ranked_limit === b.ranked_limit &&
      a.min_edge_weight === b.min_edge_weight &&
      a.min_edge_confidence === b.min_edge_confidence;
    if (isSame(knobs, RECALL_STRATEGY_DEFAULTS.local)) return "local";
    if (isSame(knobs, RECALL_STRATEGY_DEFAULTS.global)) return "global";
    return "balanced";
  };

  const buildRecallTrajectory = (args: {
    strategy: RecallStrategyName;
    limit: number;
    neighborhood_hops: number;
    max_nodes: number;
    max_edges: number;
    ranked_limit: number;
    min_edge_weight: number;
    min_edge_confidence: number;
    seeds: number;
    nodes: number;
    edges: number;
    context_chars: number;
    timings: Record<string, number>;
    neighborhood_counts?: { nodes?: number; edges?: number } | null;
    stage1?: {
      mode?: "ann" | "exact_fallback";
      ann_seed_count?: number;
      final_seed_count?: number;
      exact_fallback_enabled?: boolean;
      exact_fallback_attempted?: boolean;
    } | null;
    uri_links?: {
      nodes: string[];
      edges: string[];
      commits: string[];
      decisions: string[];
      counts: {
        nodes: number;
        edges: number;
        commits: number;
        decisions: number;
      };
      chain?: {
        decision_uri: string;
        commit_uri?: string;
        node_uri?: string;
        edge_uri?: string;
      };
    } | null;
  }) => {
    const stage1Ms = (args.timings["stage1_candidates_ann"] ?? 0) + (args.timings["stage1_candidates_exact_fallback"] ?? 0);
    const stage2Ms = (args.timings["stage2_edges"] ?? 0) + (args.timings["stage2_nodes"] ?? 0) + (args.timings["stage2_spread"] ?? 0);
    const stage3Ms = args.timings["stage3_context"] ?? 0;
    const stage1AnnSeeds = Number.isFinite(args.stage1?.ann_seed_count) ? Number(args.stage1?.ann_seed_count) : args.seeds;
    const stage1FinalSeeds = Number.isFinite(args.stage1?.final_seed_count) ? Number(args.stage1?.final_seed_count) : args.seeds;
    const neighborhoodNodeCandidates = Number.isFinite(args.neighborhood_counts?.nodes)
      ? Number(args.neighborhood_counts?.nodes)
      : args.nodes;
    const neighborhoodEdgeCandidates = Number.isFinite(args.neighborhood_counts?.edges)
      ? Number(args.neighborhood_counts?.edges)
      : args.edges;
    const droppedNodes = Math.max(0, neighborhoodNodeCandidates - args.nodes);
    const droppedEdges = Math.max(0, neighborhoodEdgeCandidates - args.edges);

    const stage0Reasons: string[] = [];
    if (stage1FinalSeeds === 0) stage0Reasons.push("seed_empty");
    if (args.stage1?.exact_fallback_attempted && stage1FinalSeeds === 0) stage0Reasons.push("exact_fallback_empty");
    if (args.stage1?.mode === "exact_fallback" && stage1AnnSeeds === 0 && stage1FinalSeeds > 0) {
      stage0Reasons.push("ann_empty_recovered_by_exact_fallback");
    }

    const stage1Reasons: string[] = [];
    if (droppedNodes > 0 && args.nodes >= args.max_nodes) stage1Reasons.push("max_nodes_cap");
    if (droppedEdges > 0 && args.edges >= args.max_edges) stage1Reasons.push("max_edges_cap");
    if (args.min_edge_weight > 0 || args.min_edge_confidence > 0) stage1Reasons.push("edge_quality_thresholds_active");
    if (args.nodes === 0 && stage1FinalSeeds > 0) stage1Reasons.push("seed_visibility_or_state_filtered");

    const stage2Reasons: string[] = [];
    if (args.context_chars === 0 && args.nodes === 0) stage2Reasons.push("context_empty_no_nodes");
    if (args.context_chars === 0 && args.nodes > 0) stage2Reasons.push("context_empty_after_compaction_or_missing_text");

    const pruned_reasons = Array.from(new Set([...stage0Reasons, ...stage1Reasons, ...stage2Reasons]));

    return {
      strategy: args.strategy,
      layers: [
        {
          level: "L0",
          name: "seed_candidates",
          hits: stage1FinalSeeds,
          ann_seed_candidates: stage1AnnSeeds,
          mode: args.stage1?.mode ?? "ann",
          exact_fallback_attempted: args.stage1?.exact_fallback_attempted ?? false,
          duration_ms: stage1Ms,
          pruned_reasons: stage0Reasons,
        },
        {
          level: "L1",
          name: "graph_expansion",
          hits: args.nodes,
          edges: args.edges,
          candidate_nodes: neighborhoodNodeCandidates,
          candidate_edges: neighborhoodEdgeCandidates,
          dropped_nodes: droppedNodes,
          dropped_edges: droppedEdges,
          duration_ms: stage2Ms,
          pruned_reasons: stage1Reasons,
        },
        {
          level: "L2",
          name: "context_assembly",
          context_chars: args.context_chars,
          duration_ms: stage3Ms,
          pruned_reasons: stage2Reasons,
        },
      ],
      budgets: {
        limit: args.limit,
        neighborhood_hops: args.neighborhood_hops,
        max_nodes: args.max_nodes,
        max_edges: args.max_edges,
        ranked_limit: args.ranked_limit,
        min_edge_weight: args.min_edge_weight,
        min_edge_confidence: args.min_edge_confidence,
      },
      pruned_reasons,
      ...(args.uri_links ? { uri_links: args.uri_links } : {}),
    };
  };

  return {
    globalRecallProfileDefaults,
    recallProfilePolicy,
    withRecallProfileDefaults,
    resolveRecallProfile,
    resolveExplicitRecallMode,
    resolveClassAwareRecallProfile,
    hasExplicitRecallKnobs,
    resolveRecallStrategy,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
    inferRecallStrategyFromKnobs,
    buildRecallTrajectory,
  };
}
