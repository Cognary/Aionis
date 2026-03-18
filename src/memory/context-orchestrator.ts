export type ContextLayerName = "facts" | "episodes" | "rules" | "static" | "decisions" | "tools" | "citations";
type MemoryTier = "hot" | "warm" | "cold" | "archive";
type ForgetReason = "tier" | "lifecycle" | "salience";

export type ContextForgettingPolicyConfig = {
  enabled?: boolean;
  allowed_tiers?: MemoryTier[];
  exclude_archived?: boolean;
  min_salience?: number;
};

export type ContextLayerConfig = {
  enabled?: ContextLayerName[];
  char_budget_total?: number;
  char_budget_by_layer?: Record<string, number>;
  max_items_by_layer?: Record<string, number>;
  include_merge_trace?: boolean;
  forgetting_policy?: ContextForgettingPolicyConfig;
};

export type StaticContextBlockInput = {
  id: string;
  title?: string;
  content: string;
  tags?: string[];
  intents?: string[];
  tools?: string[];
  priority?: number;
  always_include?: boolean;
};

export type StaticInjectionPolicyConfig = {
  enabled?: boolean;
  max_blocks?: number;
  min_score?: number;
  include_selection_trace?: boolean;
};

const DEFAULT_LAYER_ORDER: ContextLayerName[] = ["facts", "episodes", "rules", "static", "decisions", "tools", "citations"];

const DEFAULT_CHAR_BUDGET_BY_LAYER: Record<ContextLayerName, number> = {
  facts: 1200,
  episodes: 1600,
  rules: 1000,
  static: 1200,
  decisions: 700,
  tools: 700,
  citations: 1000,
};

const DEFAULT_MAX_ITEMS_BY_LAYER: Record<ContextLayerName, number> = {
  facts: 16,
  episodes: 20,
  rules: 16,
  static: 6,
  decisions: 10,
  tools: 10,
  citations: 24,
};

function normalizeLayerOrder(enabled?: ContextLayerName[]): ContextLayerName[] {
  if (!Array.isArray(enabled) || enabled.length === 0) return [...DEFAULT_LAYER_ORDER];
  const seen = new Set<ContextLayerName>();
  const out: ContextLayerName[] = [];
  for (const layer of enabled) {
    if (!DEFAULT_LAYER_ORDER.includes(layer)) continue;
    if (seen.has(layer)) continue;
    seen.add(layer);
    out.push(layer);
  }
  return out.length > 0 ? out : [...DEFAULT_LAYER_ORDER];
}

function firstText(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const obj = v as Record<string, unknown>;
  const candidates = [obj.summary, obj.text, obj.content, obj.title, obj.raw_ref, obj.evidence_ref];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return "";
}

function classifyRecallItemKind(kind: string): ContextLayerName {
  if (kind === "rule" || kind === "policy") return "rules";
  if (kind === "decision") return "decisions";
  if (kind === "tool") return "tools";
  if (kind === "event" || kind === "evidence" || kind === "episode") return "episodes";
  if (kind === "entity" || kind === "topic" || kind === "concept" || kind === "fact") return "facts";
  return "episodes";
}

function trimLine(input: string, maxLen = 220): string {
  const s = String(input || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 3)}...`;
}

type LayerCandidateLine = {
  text: string;
  tier: string | null;
  salience: number | null;
  lifecycle_state: string | null;
  always_include?: boolean;
};

function pushCandidate(bucket: LayerCandidateLine[], text: string, meta?: Omit<LayerCandidateLine, "text">) {
  const v = trimLine(text);
  if (!v) return;
  bucket.push({
    text: v,
    tier: meta?.tier ?? null,
    salience: Number.isFinite(meta?.salience as number) ? Number(meta?.salience) : null,
    lifecycle_state: meta?.lifecycle_state ?? null,
    always_include: meta?.always_include === true,
  });
}

function firstFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function collectLayerCandidates(recall: any, rules: any, tools: any): Record<ContextLayerName, LayerCandidateLine[]> {
  const out: Record<ContextLayerName, LayerCandidateLine[]> = {
    facts: [],
    episodes: [],
    rules: [],
    static: [],
    decisions: [],
    tools: [],
    citations: [],
  };

  const recallItems = Array.isArray(recall?.context?.items) ? recall.context.items : [];
  for (const item of recallItems) {
    const kind = String((item as any)?.kind || "").trim().toLowerCase();
    const layer = classifyRecallItemKind(kind);
    const nodeId = String((item as any)?.node_id || "").trim();
    const uri = String((item as any)?.uri || "").trim();
    const summary = firstText(item);
    if (!summary) continue;
    const meta = {
      tier: String((item as any)?.tier || "").trim() || null,
      salience: firstFiniteNumber((item as any)?.salience),
      lifecycle_state: String((item as any)?.lifecycle_state || "").trim() || null,
    };
    if (uri) {
      pushCandidate(out[layer], `${summary} (uri:${uri})`, meta);
    } else {
      pushCandidate(out[layer], nodeId ? `${summary} (node:${nodeId})` : summary, meta);
    }
  }

  const activeRules = Array.isArray(rules?.active) ? rules.active : [];
  const shadowRules = Array.isArray(rules?.shadow) ? rules.shadow : [];
  for (const r of activeRules.slice(0, 24)) {
    const summary = firstText(r);
    const id = String((r as any)?.rule_node_id || "").trim();
    pushCandidate(out.rules, id ? `[active] ${summary || id} (${id})` : `[active] ${summary}`);
  }
  for (const r of shadowRules.slice(0, 16)) {
    const summary = firstText(r);
    const id = String((r as any)?.rule_node_id || "").trim();
    pushCandidate(out.rules, id ? `[shadow] ${summary || id} (${id})` : `[shadow] ${summary}`);
  }

  const selectedTool = String(tools?.selection?.selected || "").trim();
  const orderedTools = Array.isArray(tools?.selection?.ordered) ? tools.selection.ordered : [];
  if (selectedTool) pushCandidate(out.tools, `selected tool: ${selectedTool}`);
  if (orderedTools.length > 0) pushCandidate(out.tools, `tool ranking: ${orderedTools.join(", ")}`);

  const decisionId = String(tools?.decision?.decision_id || tools?.decision_id || "").trim();
  const runId = String(tools?.decision?.run_id || tools?.run_id || "").trim();
  if (decisionId) pushCandidate(out.decisions, `decision_id: ${decisionId}`);
  if (runId) pushCandidate(out.decisions, `run_id: ${runId}`);
  if (selectedTool) pushCandidate(out.decisions, `decision selected_tool: ${selectedTool}`);

  const citations = Array.isArray(recall?.context?.citations) ? recall.context.citations : [];
  for (const c of citations.slice(0, 64)) {
    const nodeId = String((c as any)?.node_id || "").trim();
    const uri = String((c as any)?.uri || "").trim();
    const commitUri = String((c as any)?.commit_uri || "").trim();
    const commitId = String((c as any)?.commit_id || "").trim();
    if (!nodeId && !uri && !commitUri && !commitId) continue;
    pushCandidate(
      out.citations,
      `citation uri=${uri || "-"} node=${nodeId || "-"} commit=${commitId || "-"} commit_uri=${commitUri || "-"}`,
      {
        tier: String((c as any)?.tier || "").trim() || null,
        salience: firstFiniteNumber((c as any)?.salience),
        lifecycle_state: String((c as any)?.lifecycle_state || "").trim() || null,
      },
    );
  }

  return out;
}

function buildLayerHeader(layer: ContextLayerName): string {
  if (layer === "facts") return "# Facts";
  if (layer === "episodes") return "# Episodes";
  if (layer === "rules") return "# Rules";
  if (layer === "static") return "# Static Context";
  if (layer === "decisions") return "# Decisions";
  if (layer === "tools") return "# Tools";
  return "# Citations";
}

function parseBoundedInt(input: unknown, fallback: number, min: number, max: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function resolveForgettingPolicy(config?: ContextLayerConfig | null) {
  const raw = config?.forgetting_policy ?? null;
  const enabled = raw?.enabled !== false;
  const allowedTiers = Array.isArray(raw?.allowed_tiers) && raw?.allowed_tiers.length > 0
    ? Array.from(new Set(raw.allowed_tiers.map((tier) => String(tier).trim()).filter(Boolean)))
    : ["hot", "warm"];
  const excludeArchived = raw?.exclude_archived !== false;
  const minSalience = firstFiniteNumber(raw?.min_salience);
  return {
    enabled,
    allowedTiers: new Set(allowedTiers),
    excludeArchived,
    minSalience,
  };
}

function evaluateForgetting(policy: ReturnType<typeof resolveForgettingPolicy>, line: LayerCandidateLine): ForgetReason | null {
  if (!policy.enabled) return null;
  const lifecycle = String(line.lifecycle_state ?? "").trim().toLowerCase();
  if (policy.excludeArchived && lifecycle === "archived") return "lifecycle";
  const tier = String(line.tier ?? "").trim().toLowerCase();
  if (tier && !policy.allowedTiers.has(tier)) return "tier";
  if (policy.minSalience !== null && line.salience !== null && line.salience < policy.minSalience) return "salience";
  return null;
}

function tokenize(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9_:/.-]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function collectContextStrings(input: unknown, limit = 32): string[] {
  const out: string[] = [];
  const queue: unknown[] = [input];
  while (queue.length > 0 && out.length < limit) {
    const next = queue.shift();
    if (typeof next === "string") {
      const v = next.trim();
      if (v) out.push(v);
      continue;
    }
    if (Array.isArray(next)) {
      for (const item of next.slice(0, limit - out.length)) queue.push(item);
      continue;
    }
    if (next && typeof next === "object") {
      for (const value of Object.values(next as Record<string, unknown>).slice(0, limit - out.length)) queue.push(value);
    }
  }
  return out;
}

function resolveStaticInjectionPolicy(policy?: StaticInjectionPolicyConfig | null) {
  return {
    enabled: policy?.enabled !== false,
    maxBlocks: parseBoundedInt(policy?.max_blocks, 4, 1, 32),
    minScore: parseBoundedInt(policy?.min_score, 50, 0, 500),
    includeSelectionTrace: policy?.include_selection_trace !== false,
  };
}

function scoreStaticContextBlock(args: {
  block: StaticContextBlockInput;
  signalTokens: Set<string>;
  queryTokens: Set<string>;
  toolNames: Set<string>;
}): { score: number; reasons: string[] } {
  const { block, signalTokens, queryTokens, toolNames } = args;
  let score = Math.max(0, Math.min(100, Math.trunc(Number(block.priority ?? 50))));
  const reasons: string[] = [];

  if (block.always_include) {
    score += 100;
    reasons.push("always_include");
  }

  const intents = Array.isArray(block.intents) ? block.intents : [];
  const intentHits = intents.filter((item) => signalTokens.has(String(item).trim().toLowerCase()));
  if (intentHits.length > 0) {
    score += Math.min(60, intentHits.length * 30);
    reasons.push(`intent_match:${intentHits.join(",")}`);
  }

  const tags = Array.isArray(block.tags) ? block.tags : [];
  const tagHits = tags.filter((item) => signalTokens.has(String(item).trim().toLowerCase()));
  if (tagHits.length > 0) {
    score += Math.min(45, tagHits.length * 15);
    reasons.push(`tag_match:${tagHits.join(",")}`);
  }

  const tools = Array.isArray(block.tools) ? block.tools : [];
  const toolHits = tools.filter((item) => toolNames.has(String(item).trim().toLowerCase()));
  if (toolHits.length > 0) {
    score += Math.min(80, toolHits.length * 40);
    reasons.push(`tool_match:${toolHits.join(",")}`);
  }

  const textTokens = new Set([
    ...tokenize(block.id),
    ...tokenize(block.title ?? ""),
    ...tokenize(block.content),
  ]);
  const lexicalHits = Array.from(queryTokens).filter((token) => textTokens.has(token));
  if (lexicalHits.length > 0) {
    score += Math.min(25, lexicalHits.length * 5);
    reasons.push(`lexical_match:${lexicalHits.slice(0, 5).join(",")}`);
  }

  return { score, reasons };
}

function collectStaticContextCandidates(args: {
  queryText?: string | null;
  executionContext?: unknown;
  toolCandidates?: string[] | null;
  staticBlocks?: StaticContextBlockInput[] | null;
  staticInjection?: StaticInjectionPolicyConfig | null;
}): {
  lines: LayerCandidateLine[];
  summary: {
    enabled: boolean;
    supplied_blocks: number;
    selected_blocks: number;
    rejected_blocks: number;
    max_blocks: number;
    min_score: number;
    selected_ids: string[];
    selection_trace?: Array<{ id: string; score: number; selected: boolean; reasons: string[] }>;
  };
} {
  const blocks = Array.isArray(args.staticBlocks) ? args.staticBlocks : [];
  const policy = resolveStaticInjectionPolicy(args.staticInjection);
  if (!policy.enabled || blocks.length === 0) {
    return {
      lines: [],
      summary: {
        enabled: policy.enabled,
        supplied_blocks: blocks.length,
        selected_blocks: 0,
        rejected_blocks: blocks.length,
        max_blocks: policy.maxBlocks,
        min_score: policy.minScore,
        selected_ids: [],
        ...(policy.includeSelectionTrace ? { selection_trace: [] } : {}),
      },
    };
  }

  const signalTokens = new Set<string>();
  for (const token of tokenize(args.queryText ?? "")) signalTokens.add(token);
  for (const value of collectContextStrings(args.executionContext)) {
    for (const token of tokenize(value)) signalTokens.add(token);
  }
  const toolNames = new Set((Array.isArray(args.toolCandidates) ? args.toolCandidates : []).map((tool) => String(tool).trim().toLowerCase()).filter(Boolean));
  for (const tool of toolNames) signalTokens.add(tool);
  const queryTokens = new Set(tokenize(args.queryText ?? ""));

  const ranked = blocks
    .map((block) => {
      const scored = scoreStaticContextBlock({ block, signalTokens, queryTokens, toolNames });
      const selected = block.always_include === true || scored.score >= policy.minScore;
      return {
        block,
        score: scored.score,
        reasons: scored.reasons,
        selected,
      };
    })
    .sort((a, b) => b.score - a.score || Number(b.block.priority ?? 50) - Number(a.block.priority ?? 50) || a.block.id.localeCompare(b.block.id));

  const alwaysIncluded = ranked.filter((entry) => entry.block.always_include === true && entry.selected);
  const remainingBudget = Math.max(0, policy.maxBlocks - alwaysIncluded.length);
  const selected = [
    ...alwaysIncluded,
    ...ranked
      .filter((entry) => entry.selected && entry.block.always_include !== true)
      .slice(0, remainingBudget),
  ];
  const selectedIds = new Set(selected.map((entry) => entry.block.id));
  return {
    lines: selected.map((entry) => ({
      text: `${entry.block.title?.trim() ? `${entry.block.title.trim()}: ` : ""}${entry.block.content} (block:${entry.block.id})`,
      tier: null,
      salience: null,
      lifecycle_state: null,
      always_include: entry.block.always_include === true,
    })),
    summary: {
      enabled: true,
      supplied_blocks: blocks.length,
      selected_blocks: selected.length,
      rejected_blocks: blocks.length - selected.length,
      max_blocks: policy.maxBlocks,
      min_score: policy.minScore,
      selected_ids: Array.from(selectedIds),
      ...(policy.includeSelectionTrace
        ? {
            selection_trace: ranked.map((entry) => ({
              id: entry.block.id,
              score: entry.score,
              selected: selectedIds.has(entry.block.id),
              reasons: entry.reasons,
            })),
          }
        : {}),
    },
  };
}

export function assembleLayeredContext(args: {
  recall: any;
  rules: any;
  tools: any;
  query_text?: string | null;
  execution_context?: unknown;
  tool_candidates?: string[] | null;
  static_blocks?: StaticContextBlockInput[] | null;
  static_injection?: StaticInjectionPolicyConfig | null;
  config?: ContextLayerConfig | null;
}) {
  const totalStartedAt = performance.now();
  const cfg = args.config ?? {};
  const order = normalizeLayerOrder(cfg.enabled);
  const candidateCollectionStartedAt = performance.now();
  const raw = collectLayerCandidates(args.recall, args.rules, args.tools);
  const forgetting = resolveForgettingPolicy(cfg);
  const candidateCollectionMs = performance.now() - candidateCollectionStartedAt;
  const staticSelectionStartedAt = performance.now();
  const staticCandidates = collectStaticContextCandidates({
    queryText: args.query_text ?? null,
    executionContext: args.execution_context,
    toolCandidates: args.tool_candidates ?? null,
    staticBlocks: args.static_blocks ?? null,
    staticInjection: args.static_injection ?? null,
  });
  const staticSelectionMs = performance.now() - staticSelectionStartedAt;
  raw.static = staticCandidates.lines;
  const totalBudget = parseBoundedInt(cfg.char_budget_total, 4000, 200, 200000);
  const includeMergeTrace = cfg.include_merge_trace !== false;

  const layers: Record<string, any> = {};
  const mergeTrace: Array<Record<string, unknown>> = [];
  const droppedReasons: string[] = [];
  const mergedParts: string[] = [];

  let totalUsedChars = 0;
  let totalItems = 0;
  let keptItems = 0;
  let droppedItems = 0;
  let forgottenItems = 0;
  const forgottenByReason: Record<ForgetReason, number> = {
    tier: 0,
    lifecycle: 0,
    salience: 0,
  };
  const assemblyLoopStartedAt = performance.now();

  for (const layer of order) {
    const charBudget = parseBoundedInt(cfg.char_budget_by_layer?.[layer], DEFAULT_CHAR_BUDGET_BY_LAYER[layer], 80, 200000);
    const maxItems = parseBoundedInt(cfg.max_items_by_layer?.[layer], DEFAULT_MAX_ITEMS_BY_LAYER[layer], 1, 500);
    const source = raw[layer] ?? [];
    totalItems += source.length;
    const eligible: LayerCandidateLine[] = [];
    let forgottenByLayer = 0;
    for (const candidate of source) {
      const forgetReason = evaluateForgetting(forgetting, candidate);
      if (forgetReason) {
        forgottenByLayer += 1;
        forgottenItems += 1;
        droppedItems += 1;
        forgottenByReason[forgetReason] += 1;
        droppedReasons.push(`${layer}: forgetting policy dropped item (${forgetReason})`);
        continue;
      }
      eligible.push(candidate);
    }
    const kept: string[] = [];
    let used = 0;
    let droppedByLayer = 0;

    for (const candidate of eligible) {
      if (candidate.always_include !== true && kept.length >= maxItems) {
        droppedByLayer += 1;
        droppedReasons.push(`${layer}: max_items limit reached`);
        continue;
      }
      const line = `- ${candidate.text}`;
      const projectedLayer = used + line.length + 1;
      const projectedTotal = totalUsedChars + line.length + 1;
      if (candidate.always_include !== true && projectedLayer > charBudget) {
        droppedByLayer += 1;
        droppedReasons.push(`${layer}: layer char budget exceeded`);
        continue;
      }
      if (candidate.always_include !== true && projectedTotal > totalBudget) {
        droppedByLayer += 1;
        droppedReasons.push(`${layer}: total char budget exceeded`);
        continue;
      }
      kept.push(candidate.text);
      used = projectedLayer;
      totalUsedChars = projectedTotal;
    }

    keptItems += kept.length;
    droppedItems += droppedByLayer;
    layers[layer] = {
      items: kept,
      source_count: source.length,
      forgotten_count: forgottenByLayer,
      kept_count: kept.length,
      dropped_count: droppedByLayer,
      budget_chars: charBudget,
      used_chars: used,
      max_items: maxItems,
    };

    if (kept.length > 0) {
      mergedParts.push(buildLayerHeader(layer));
      for (const line of kept) mergedParts.push(`- ${line}`);
    }

    if (includeMergeTrace) {
      mergeTrace.push({
        layer,
        source_count: source.length,
        forgotten_count: forgottenByLayer,
        kept_count: kept.length,
        dropped_count: droppedByLayer,
        budget_chars: charBudget,
        used_chars: used,
      });
    }
  }
  const assemblyLoopMs = performance.now() - assemblyLoopStartedAt;
  const totalMs = performance.now() - totalStartedAt;

  return {
    version: 1,
    mode: "experimental_context_orchestrator_v0",
    order,
    budget: {
      total_chars: totalBudget,
      used_chars: totalUsedChars,
      remaining_chars: Math.max(0, totalBudget - totalUsedChars),
    },
    stats: {
      source_items: totalItems,
      kept_items: keptItems,
      dropped_items: droppedItems,
      forgotten_items: forgottenItems,
      layers_with_content: order.filter((layer) => (layers[layer]?.kept_count ?? 0) > 0).length,
    },
    layers,
    merged_text: mergedParts.join("\n"),
    merge_trace: includeMergeTrace ? mergeTrace : undefined,
    dropped_reasons: droppedReasons.slice(0, 120),
    timings_ms: {
      layer_candidates_ms: candidateCollectionMs,
      static_selection_ms: staticSelectionMs,
      assembly_loop_ms: assemblyLoopMs,
      layered_total_ms: totalMs,
    },
    forgetting: {
      enabled: forgetting.enabled,
      allowed_tiers: Array.from(forgetting.allowedTiers),
      exclude_archived: forgetting.excludeArchived,
      min_salience: forgetting.minSalience,
      dropped_items: forgottenItems,
      dropped_by_reason: forgottenByReason,
    },
    static_injection: staticCandidates.summary,
  };
}
