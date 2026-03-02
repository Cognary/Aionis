export type ContextLayerName = "facts" | "episodes" | "rules" | "decisions" | "tools" | "citations";

export type ContextLayerConfig = {
  enabled?: ContextLayerName[];
  char_budget_total?: number;
  char_budget_by_layer?: Record<string, number>;
  max_items_by_layer?: Record<string, number>;
  include_merge_trace?: boolean;
};

const DEFAULT_LAYER_ORDER: ContextLayerName[] = ["facts", "episodes", "rules", "decisions", "tools", "citations"];

const DEFAULT_CHAR_BUDGET_BY_LAYER: Record<ContextLayerName, number> = {
  facts: 1200,
  episodes: 1600,
  rules: 1000,
  decisions: 700,
  tools: 700,
  citations: 1000,
};

const DEFAULT_MAX_ITEMS_BY_LAYER: Record<ContextLayerName, number> = {
  facts: 16,
  episodes: 20,
  rules: 16,
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

function addLine(bucket: string[], line: string) {
  const v = trimLine(line);
  if (!v) return;
  bucket.push(v);
}

function collectLayerCandidates(recall: any, rules: any, tools: any): Record<ContextLayerName, string[]> {
  const out: Record<ContextLayerName, string[]> = {
    facts: [],
    episodes: [],
    rules: [],
    decisions: [],
    tools: [],
    citations: [],
  };

  const recallItems = Array.isArray(recall?.context?.items) ? recall.context.items : [];
  for (const item of recallItems) {
    const kind = String((item as any)?.kind || "").trim().toLowerCase();
    const layer = classifyRecallItemKind(kind);
    const nodeId = String((item as any)?.node_id || "").trim();
    const summary = firstText(item);
    if (!summary) continue;
    addLine(out[layer], nodeId ? `${summary} (node:${nodeId})` : summary);
  }

  const activeRules = Array.isArray(rules?.active) ? rules.active : [];
  const shadowRules = Array.isArray(rules?.shadow) ? rules.shadow : [];
  for (const r of activeRules.slice(0, 24)) {
    const summary = firstText(r);
    const id = String((r as any)?.rule_node_id || "").trim();
    addLine(out.rules, id ? `[active] ${summary || id} (${id})` : `[active] ${summary}`);
  }
  for (const r of shadowRules.slice(0, 16)) {
    const summary = firstText(r);
    const id = String((r as any)?.rule_node_id || "").trim();
    addLine(out.rules, id ? `[shadow] ${summary || id} (${id})` : `[shadow] ${summary}`);
  }

  const selectedTool = String(tools?.selection?.selected || "").trim();
  const orderedTools = Array.isArray(tools?.selection?.ordered) ? tools.selection.ordered : [];
  if (selectedTool) addLine(out.tools, `selected tool: ${selectedTool}`);
  if (orderedTools.length > 0) addLine(out.tools, `tool ranking: ${orderedTools.join(", ")}`);

  const decisionId = String(tools?.decision?.decision_id || tools?.decision_id || "").trim();
  const runId = String(tools?.decision?.run_id || tools?.run_id || "").trim();
  if (decisionId) addLine(out.decisions, `decision_id: ${decisionId}`);
  if (runId) addLine(out.decisions, `run_id: ${runId}`);
  if (selectedTool) addLine(out.decisions, `decision selected_tool: ${selectedTool}`);

  const citations = Array.isArray(recall?.context?.citations) ? recall.context.citations : [];
  for (const c of citations.slice(0, 64)) {
    const nodeId = String((c as any)?.node_id || "").trim();
    const commitId = String((c as any)?.commit_id || "").trim();
    if (!nodeId && !commitId) continue;
    addLine(out.citations, `citation node=${nodeId || "-"} commit=${commitId || "-"}`);
  }

  return out;
}

function buildLayerHeader(layer: ContextLayerName): string {
  if (layer === "facts") return "# Facts";
  if (layer === "episodes") return "# Episodes";
  if (layer === "rules") return "# Rules";
  if (layer === "decisions") return "# Decisions";
  if (layer === "tools") return "# Tools";
  return "# Citations";
}

function parseBoundedInt(input: unknown, fallback: number, min: number, max: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function assembleLayeredContext(args: {
  recall: any;
  rules: any;
  tools: any;
  config?: ContextLayerConfig | null;
}) {
  const cfg = args.config ?? {};
  const order = normalizeLayerOrder(cfg.enabled);
  const raw = collectLayerCandidates(args.recall, args.rules, args.tools);
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

  for (const layer of order) {
    const charBudget = parseBoundedInt(cfg.char_budget_by_layer?.[layer], DEFAULT_CHAR_BUDGET_BY_LAYER[layer], 80, 200000);
    const maxItems = parseBoundedInt(cfg.max_items_by_layer?.[layer], DEFAULT_MAX_ITEMS_BY_LAYER[layer], 1, 500);
    const source = raw[layer] ?? [];
    totalItems += source.length;
    const kept: string[] = [];
    let used = 0;
    let droppedByLayer = 0;

    for (const line of source) {
      if (kept.length >= maxItems) {
        droppedByLayer += 1;
        droppedReasons.push(`${layer}: max_items limit reached`);
        continue;
      }
      const candidate = `- ${line}`;
      const projectedLayer = used + candidate.length + 1;
      const projectedTotal = totalUsedChars + candidate.length + 1;
      if (projectedLayer > charBudget) {
        droppedByLayer += 1;
        droppedReasons.push(`${layer}: layer char budget exceeded`);
        continue;
      }
      if (projectedTotal > totalBudget) {
        droppedByLayer += 1;
        droppedReasons.push(`${layer}: total char budget exceeded`);
        continue;
      }
      kept.push(line);
      used = projectedLayer;
      totalUsedChars = projectedTotal;
    }

    keptItems += kept.length;
    droppedItems += droppedByLayer;
    layers[layer] = {
      items: kept,
      source_count: source.length,
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
        kept_count: kept.length,
        dropped_count: droppedByLayer,
        budget_chars: charBudget,
        used_chars: used,
      });
    }
  }

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
      layers_with_content: order.filter((layer) => (layers[layer]?.kept_count ?? 0) > 0).length,
    },
    layers,
    merged_text: mergedParts.join("\n"),
    merge_trace: includeMergeTrace ? mergeTrace : undefined,
    dropped_reasons: droppedReasons.slice(0, 120),
  };
}
