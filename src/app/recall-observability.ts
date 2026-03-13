function normalizeAionisUri(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.startsWith("aionis://")) return null;
  return s;
}

function selectedMemoryLayers(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const layer = String((item as Record<string, unknown>).compression_layer ?? "").trim();
    if (!layer) continue;
    out.add(layer);
  }
  return Array.from(out).sort();
}

function normalizeSelectionPolicy(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const preferredLayers = Array.isArray(raw.preferred_layers)
    ? raw.preferred_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const fallbackLayers = Array.isArray(raw.fallback_layers)
    ? raw.fallback_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const trustAnchorLayers = Array.isArray(raw.trust_anchor_layers)
    ? raw.trust_anchor_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const requestedAllowedLayers = Array.isArray(raw.requested_allowed_layers)
    ? raw.requested_allowed_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  return {
    name: typeof raw.name === "string" ? raw.name : null,
    preferred_layers: preferredLayers,
    fallback_layers: fallbackLayers,
    trust_anchor_layers: trustAnchorLayers,
    source: typeof raw.source === "string" ? raw.source : "unknown",
    requested_allowed_layers: requestedAllowedLayers,
  };
}

function normalizeSelectionStats(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const retrievedMemoryLayers = Array.isArray(raw.retrieved_memory_layers)
    ? raw.retrieved_memory_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const selectedMemoryLayers = Array.isArray(raw.selected_memory_layers)
    ? raw.selected_memory_layers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
  const filteredByLayer =
    raw.filtered_by_layer && typeof raw.filtered_by_layer === "object" && !Array.isArray(raw.filtered_by_layer)
      ? Object.fromEntries(
          Object.entries(raw.filtered_by_layer as Record<string, unknown>)
            .map(([key, value]) => [String(key), Number(value)])
            .filter(([, value]) => Number.isFinite(value) && Number(value) > 0),
        )
      : {};
  const retrievalFilteredByLayer =
    raw.retrieval_filtered_by_layer &&
    typeof raw.retrieval_filtered_by_layer === "object" &&
    !Array.isArray(raw.retrieval_filtered_by_layer)
      ? Object.fromEntries(
          Object.entries(raw.retrieval_filtered_by_layer as Record<string, unknown>)
            .map(([key, value]) => [String(key), Number(value)])
            .filter(([, value]) => Number.isFinite(value) && Number(value) > 0),
        )
      : {};
  const retrievedUnlayeredCount = Number(raw.retrieved_unlayered_count ?? 0);
  const selectedUnlayeredCount = Number(raw.selected_unlayered_count ?? 0);
  const retrievalFilteredByLayerPolicyCount = Number(raw.retrieval_filtered_by_layer_policy_count ?? 0);
  const filteredByLayerPolicyCount = Number(raw.filtered_by_layer_policy_count ?? 0);
  return {
    retrieved_memory_layers: retrievedMemoryLayers,
    retrieved_unlayered_count: Number.isFinite(retrievedUnlayeredCount) ? Math.max(0, Math.trunc(retrievedUnlayeredCount)) : 0,
    selected_memory_layers: selectedMemoryLayers,
    selected_unlayered_count: Number.isFinite(selectedUnlayeredCount) ? Math.max(0, Math.trunc(selectedUnlayeredCount)) : 0,
    retrieval_filtered_by_layer_policy_count: Number.isFinite(retrievalFilteredByLayerPolicyCount)
      ? Math.max(0, Math.trunc(retrievalFilteredByLayerPolicyCount))
      : 0,
    retrieval_filtered_by_layer: retrievalFilteredByLayer,
    filtered_by_layer_policy_count: Number.isFinite(filteredByLayerPolicyCount)
      ? Math.max(0, Math.trunc(filteredByLayerPolicyCount))
      : 0,
    filtered_by_layer: filteredByLayer,
  };
}

export function collectRecallTrajectoryUriLinks(args: { recall: any; tools?: any; max_per_type?: number }) {
  const cap = Math.max(1, Math.min(200, Number(args.max_per_type ?? 32)));
  const out = {
    nodes: [] as string[],
    edges: [] as string[],
    commits: [] as string[],
    decisions: [] as string[],
  };
  const seen = {
    nodes: new Set<string>(),
    edges: new Set<string>(),
    commits: new Set<string>(),
    decisions: new Set<string>(),
  };
  const totals = {
    nodes: new Set<string>(),
    edges: new Set<string>(),
    commits: new Set<string>(),
    decisions: new Set<string>(),
  };

  const add = (kind: keyof typeof out, raw: unknown) => {
    const uri = normalizeAionisUri(raw);
    if (!uri) return;
    totals[kind].add(uri);
    if (out[kind].length >= cap) return;
    if (seen[kind].has(uri)) return;
    seen[kind].add(uri);
    out[kind].push(uri);
  };

  const recall = args.recall ?? {};
  const seeds = Array.isArray(recall?.seeds) ? recall.seeds : [];
  for (const seed of seeds) add("nodes", (seed as any)?.uri);

  const ranked = Array.isArray(recall?.ranked) ? recall.ranked : [];
  for (const node of ranked) add("nodes", (node as any)?.uri);

  const subgraphNodes = Array.isArray(recall?.subgraph?.nodes) ? recall.subgraph.nodes : [];
  for (const node of subgraphNodes) add("nodes", (node as any)?.uri);

  const subgraphEdges = Array.isArray(recall?.subgraph?.edges) ? recall.subgraph.edges : [];
  for (const edge of subgraphEdges) {
    add("edges", (edge as any)?.uri);
    add("commits", (edge as any)?.commit_uri);
  }

  const contextItems = Array.isArray(recall?.context?.items) ? recall.context.items : [];
  for (const item of contextItems) add("nodes", (item as any)?.uri);

  const citations = Array.isArray(recall?.context?.citations) ? recall.context.citations : [];
  for (const citation of citations) {
    add("nodes", (citation as any)?.uri);
    add("commits", (citation as any)?.commit_uri);
  }

  const tools = args.tools ?? {};
  add("decisions", tools?.decision?.decision_uri);
  add("decisions", tools?.decision_uri);
  add("commits", tools?.decision?.commit_uri);
  add("commits", tools?.commit_uri);

  const chainDecision = out.decisions[0];
  const chainCommit = out.commits[0];
  const chainNode = out.nodes[0];
  const chainEdge = out.edges[0];

  return {
    ...out,
    counts: {
      nodes: totals.nodes.size,
      edges: totals.edges.size,
      commits: totals.commits.size,
      decisions: totals.decisions.size,
    },
    ...(chainDecision
      ? {
          chain: {
            decision_uri: chainDecision,
            ...(chainCommit ? { commit_uri: chainCommit } : {}),
            ...(chainNode ? { node_uri: chainNode } : {}),
            ...(chainEdge ? { edge_uri: chainEdge } : {}),
          },
        }
      : {}),
  };
}

export function buildRecallObservability(args: {
  timings: Record<string, number>;
  inflight_wait_ms: number;
  context_items?: unknown;
  selection_policy?: unknown;
  selection_stats?: unknown;
  explicit_mode?: {
    mode?: string | null;
    profile?: string;
    applied?: boolean;
    reason?: string;
    source?: string;
  } | null;
  adaptive_profile: { profile: string; applied: boolean; reason: string };
  adaptive_hard_cap: { applied: boolean; reason: string };
  class_aware?: {
    workload_class?: string | null;
    profile?: string;
    applied?: boolean;
    reason?: string;
    signals?: string[];
    enabled?: boolean;
    source?: string;
  } | null;
  stage1?: {
    mode?: "ann" | "exact_fallback";
    ann_seed_count?: number;
    final_seed_count?: number;
    exact_fallback_enabled?: boolean;
    exact_fallback_attempted?: boolean;
  } | null;
  neighborhood_counts?: { nodes?: number; edges?: number } | null;
}) {
  const stageTimings = {
    stage1_candidates_ann_ms: args.timings["stage1_candidates_ann"] ?? 0,
    stage1_candidates_exact_fallback_ms: args.timings["stage1_candidates_exact_fallback"] ?? 0,
    stage2_edges_ms: args.timings["stage2_edges"] ?? 0,
    stage2_nodes_ms: args.timings["stage2_nodes"] ?? 0,
    stage2_spread_ms: args.timings["stage2_spread"] ?? 0,
    stage3_context_ms: args.timings["stage3_context"] ?? 0,
    rule_defs_ms: args.timings["rule_defs"] ?? 0,
    audit_insert_ms: args.timings["audit_insert"] ?? 0,
    debug_embeddings_ms: args.timings["debug_embeddings"] ?? 0,
  };
  const memoryLayers = selectedMemoryLayers(args.context_items);
  const selectionPolicy = normalizeSelectionPolicy(args.selection_policy);
  const selectionStats = normalizeSelectionStats(args.selection_stats);
  return {
    stage_timings_ms: stageTimings,
    inflight_wait_ms: args.inflight_wait_ms,
    adaptive: {
      explicit_mode: args.explicit_mode
        ? {
            mode: args.explicit_mode.mode ?? null,
            profile: args.explicit_mode.profile ?? null,
            applied: args.explicit_mode.applied ?? false,
            reason: args.explicit_mode.reason ?? "unknown",
            source: args.explicit_mode.source ?? "unknown",
          }
        : null,
      class_aware: args.class_aware
        ? {
            workload_class: args.class_aware.workload_class ?? null,
            profile: args.class_aware.profile ?? null,
            applied: args.class_aware.applied ?? false,
            reason: args.class_aware.reason ?? "unknown",
            signals: Array.isArray(args.class_aware.signals) ? args.class_aware.signals : [],
            enabled: args.class_aware.enabled ?? false,
            source: args.class_aware.source ?? "unknown",
          }
        : null,
      profile: {
        profile: args.adaptive_profile.profile,
        applied: args.adaptive_profile.applied,
        reason: args.adaptive_profile.reason,
      },
      hard_cap: {
        applied: args.adaptive_hard_cap.applied,
        reason: args.adaptive_hard_cap.reason,
      },
    },
    stage1: args.stage1 ?? null,
    neighborhood_counts: args.neighborhood_counts ?? null,
    memory_layers: {
      retrieved_layers: selectionStats?.retrieved_memory_layers ?? [],
      selected_layers: selectionStats?.selected_memory_layers ?? memoryLayers,
      retrieved_unlayered_count: selectionStats?.retrieved_unlayered_count ?? 0,
      selected_unlayered_count: selectionStats?.selected_unlayered_count ?? 0,
      retrieval_filtered_by_layer_policy_count: selectionStats?.retrieval_filtered_by_layer_policy_count ?? 0,
      retrieval_filtered_by_layer: selectionStats?.retrieval_filtered_by_layer ?? {},
      filtered_by_layer_policy_count: selectionStats?.filtered_by_layer_policy_count ?? 0,
      filtered_by_layer: selectionStats?.filtered_by_layer ?? {},
      selection_policy: selectionPolicy,
    },
  };
}
