function normalizeAionisUri(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.startsWith("aionis://")) return null;
  return s;
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
  adaptive_profile: { profile: string; applied: boolean; reason: string };
  adaptive_hard_cap: { applied: boolean; reason: string };
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
  return {
    stage_timings_ms: stageTimings,
    inflight_wait_ms: args.inflight_wait_ms,
    adaptive: {
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
  };
}
