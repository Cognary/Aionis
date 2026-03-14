import type { MemoryLayerId, MemoryLayerPolicy } from "./layer-policy.js";
import { AIONIS_URI_NODE_TYPES, buildAionisUri } from "./uri.js";

type RankedItem = { id: string; activation: number; score: number };

type NodeRow = {
  id: string;
  type: string;
  tier: string;
  title: string | null;
  text_summary: string | null;
  slots?: any;
  topic_state?: string | null;
  raw_ref: string | null;
  evidence_ref: string | null;
  commit_id: string | null;
  confidence: number;
  salience: number;
};

function resolveCompressionLayer(n: NodeRow): MemoryLayerId | null {
  if (n.type === "event") return "L0";
  if (n.type === "evidence") {
    if (n.slots?.summary_kind === "write_distillation_evidence") return "L1";
    return "L0";
  }
  if (n.type === "topic") return "L2";
  if (n.type === "concept") {
    if (typeof n.slots?.compression_layer === "string" && n.slots.compression_layer.trim()) {
      const layer = n.slots.compression_layer.trim();
      if (layer === "L0" || layer === "L1" || layer === "L2" || layer === "L3" || layer === "L4" || layer === "L5") {
        return layer;
      }
      return null;
    }
    if (n.slots?.summary_kind === "write_distillation_fact") return "L1";
    if (n.slots?.summary_kind === "compression_rollup") return "L3";
  }
  return null;
}

type RuleDefRow = {
  rule_node_id: string;
  state: string;
  rule_scope?: string;
  target_agent_id?: string | null;
  target_team_id?: string | null;
  if_json: any;
  then_json: any;
  exceptions_json: any;
  positive_count: number;
  negative_count: number;
};

export type ContextItem =
  | {
      kind: "topic" | "concept";
      node_id: string;
      uri?: string;
      title?: string;
      summary?: string;
      commit_id?: string | null;
      tier?: string;
      salience?: number;
      lifecycle_state?: string | null;
      compression_layer?: string | null;
    }
  | {
      kind: "entity";
      node_id: string;
      uri?: string;
      title?: string;
      summary?: string;
      commit_id?: string | null;
      tier?: string;
      salience?: number;
      lifecycle_state?: string | null;
      compression_layer?: string | null;
    }
  | {
      kind: "event" | "evidence";
      node_id: string;
      uri?: string;
      summary?: string;
      raw_ref?: string | null;
      evidence_ref?: string | null;
      commit_id?: string | null;
      tier?: string;
      salience?: number;
      lifecycle_state?: string | null;
      compression_layer?: string | null;
    }
  | {
      kind: "rule";
      node_id: string;
      uri?: string;
      state?: string;
      rule_scope?: string;
      target_agent_id?: string | null;
      target_team_id?: string | null;
      summary?: string;
      if_json?: any;
      then_json?: any;
      exceptions_json?: any;
      stats?: { positive: number; negative: number };
      commit_id?: string | null;
      tier?: string;
      salience?: number;
      lifecycle_state?: string | null;
      compression_layer?: string | null;
    };

export type ContextBuildOptions = {
  tenant_id?: string | null;
  scope?: string | null;
  context_token_budget?: number | null;
  context_char_budget?: number | null;
  context_compaction_profile?: ContextCompactionProfile | null;
  layer_policy?: MemoryLayerPolicy | null;
  internal_allow_l4_preview?: boolean | null;
};

type ContextCitation = {
  node_id: string;
  uri?: string;
  commit_id: string | null;
  commit_uri?: string;
  raw_ref: string | null;
  evidence_ref: string | null;
  tier?: string;
  salience?: number;
  lifecycle_state?: string | null;
};

type SectionId = "topics" | "entities" | "events" | "rules";

type SectionLine = {
  section: SectionId;
  text: string;
  importance: number;
  active: boolean;
};

export type ContextCompactionProfile = "balanced" | "aggressive";

type ContextCompactionPolicy = {
  section_importance_bias: Record<SectionId, number>;
  max_topic_evidence_lines: number;
  max_event_lines_compact: number;
  include_rule_json_lines: boolean;
};

const CONTEXT_COMPACTION_POLICY: Record<ContextCompactionProfile, ContextCompactionPolicy> = {
  balanced: {
    section_importance_bias: { topics: 0, entities: 10, events: 40, rules: 5 },
    max_topic_evidence_lines: 2,
    max_event_lines_compact: 5,
    include_rule_json_lines: true,
  },
  aggressive: {
    section_importance_bias: { topics: 0, entities: 20, events: 80, rules: 10 },
    max_topic_evidence_lines: 1,
    max_event_lines_compact: 2,
    include_rule_json_lines: false,
  },
};

export type ContextCompactionDiagnostics = {
  profile: ContextCompactionProfile;
  token_budget: number | null;
  char_budget: number | null;
  applied: boolean;
  before_chars: number;
  after_chars: number;
  before_est_tokens: number;
  after_est_tokens: number;
  dropped_lines: number;
  dropped_by_section: Record<SectionId, number>;
};

export type ContextSelectionStats = {
  retrieved_memory_layers: string[];
  retrieved_unlayered_count: number;
  selected_memory_layers: string[];
  selected_unlayered_count: number;
  retrieval_filtered_by_layer_policy_count: number;
  retrieval_filtered_by_layer: Record<string, number>;
  filtered_by_layer_policy_count: number;
  filtered_by_layer: Record<string, number>;
};

type PickTopSelectionCollector = {
  retrievedLayers: Set<string>;
  retrievedUnlayeredCount: number;
  filteredByLayer: Map<string, number>;
  filteredCount: number;
};

function createPickTopSelectionCollector(): PickTopSelectionCollector {
  return {
    retrievedLayers: new Set<string>(),
    retrievedUnlayeredCount: 0,
    filteredByLayer: new Map<string, number>(),
    filteredCount: 0,
  };
}

function selectionLayerKey(layer: MemoryLayerId | null): string {
  return layer ?? "unknown";
}

function pickTop(
  ranked: RankedItem[],
  nodes: Map<string, NodeRow>,
  types: Set<string>,
  limit: number,
  layerPolicy?: MemoryLayerPolicy | null,
  selectionCollector?: PickTopSelectionCollector | null,
): NodeRow[] {
  const allowedLayers =
    layerPolicy?.source === "request_override"
      ? new Set<MemoryLayerId>([...layerPolicy.preferred_layers, ...layerPolicy.fallback_layers, ...layerPolicy.trust_anchor_layers])
      : null;
  const out: Array<{ node: NodeRow; rank_index: number }> = [];
  let rankIndex = 0;
  for (const r of ranked) {
    rankIndex += 1;
    const n = nodes.get(r.id);
    if (!n) continue;
    if (!types.has(n.type)) continue;
    if (n.type === "topic" && ((n.topic_state ?? n.slots?.topic_state) === "draft")) continue;
    const layer = resolveCompressionLayer(n);
    if (selectionCollector) {
      if (layer) selectionCollector.retrievedLayers.add(layer);
      else selectionCollector.retrievedUnlayeredCount += 1;
    }
    if (allowedLayers && (!layer || !allowedLayers.has(layer))) {
      if (selectionCollector) {
        const key = selectionLayerKey(layer);
        selectionCollector.filteredCount += 1;
        selectionCollector.filteredByLayer.set(key, (selectionCollector.filteredByLayer.get(key) ?? 0) + 1);
      }
      continue;
    }
    out.push({ node: n, rank_index: rankIndex });
  }
  if (layerPolicy && out.length > 1) {
    const preferredOrder = new Map(layerPolicy.preferred_layers.map((layer, idx) => [layer, idx]));
    const fallbackOffset = layerPolicy.preferred_layers.length;
    const fallbackOrder = new Map(layerPolicy.fallback_layers.map((layer, idx) => [layer, fallbackOffset + idx]));
    const unknownLayerRank = fallbackOffset + layerPolicy.fallback_layers.length + 32;
    out.sort((a, b) => {
      const aLayer = resolveCompressionLayer(a.node);
      const bLayer = resolveCompressionLayer(b.node);
      const aPref = aLayer ? (preferredOrder.get(aLayer) ?? fallbackOrder.get(aLayer) ?? unknownLayerRank) : unknownLayerRank + 16;
      const bPref = bLayer ? (preferredOrder.get(bLayer) ?? fallbackOrder.get(bLayer) ?? unknownLayerRank) : unknownLayerRank + 16;
      if (aPref !== bPref) return aPref - bPref;
      return a.rank_index - b.rank_index;
    });
  }
  return out.slice(0, limit).map((entry) => entry.node);
}

function fmtJsonCompact(v: any): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function isCompressionConcept(n: NodeRow): boolean {
  return n.type === "concept" && n.slots?.summary_kind === "compression_rollup";
}

function isSemanticAbstractionConcept(n: NodeRow): boolean {
  return n.type === "concept" && n.slots?.summary_kind === "semantic_abstraction";
}

function isSummaryFirstConcept(n: NodeRow, options?: ContextBuildOptions): boolean {
  if (isCompressionConcept(n)) return true;
  return options?.internal_allow_l4_preview === true && isSemanticAbstractionConcept(n);
}

export function estimateTokenCountFromText(text: string): number {
  const chars = text.length;
  if (chars <= 0) return 0;
  // Conservative heuristic across mixed-language payloads.
  return Math.max(1, Math.ceil(chars / 4));
}

function resolveContextTokenBudget(opts?: ContextBuildOptions): number | null {
  const tokenBudgetRaw = Number(opts?.context_token_budget ?? 0);
  if (Number.isFinite(tokenBudgetRaw) && tokenBudgetRaw > 0) return Math.max(1, Math.trunc(tokenBudgetRaw));
  return null;
}

function resolveContextCharBudget(opts?: ContextBuildOptions): number | null {
  const charBudgetRaw = Number(opts?.context_char_budget ?? 0);
  if (Number.isFinite(charBudgetRaw) && charBudgetRaw > 0) return Math.max(160, Math.trunc(charBudgetRaw));
  const tokenBudget = resolveContextTokenBudget(opts);
  if (tokenBudget !== null) return Math.max(160, tokenBudget * 4);
  return null;
}

function resolveCompactionProfile(opts?: ContextBuildOptions): ContextCompactionProfile {
  return opts?.context_compaction_profile === "aggressive" ? "aggressive" : "balanced";
}

const URI_NODE_TYPES = new Set<string>(AIONIS_URI_NODE_TYPES);

function buildNodeUri(node: Pick<NodeRow, "id" | "type">, options?: ContextBuildOptions): string | undefined {
  const tenantId = String(options?.tenant_id ?? "").trim();
  const scope = String(options?.scope ?? "").trim();
  if (!tenantId || !scope) return undefined;
  if (!URI_NODE_TYPES.has(node.type)) return undefined;
  return buildAionisUri({ tenant_id: tenantId, scope, type: node.type, id: node.id });
}

function buildCommitUri(commitId: string | null | undefined, options?: ContextBuildOptions): string | undefined {
  const tenantId = String(options?.tenant_id ?? "").trim();
  const scope = String(options?.scope ?? "").trim();
  const id = String(commitId ?? "").trim();
  if (!tenantId || !scope || !id) return undefined;
  return buildAionisUri({ tenant_id: tenantId, scope, type: "commit", id });
}

export function buildContext(
  ranked: RankedItem[],
  nodes: Map<string, NodeRow>,
  ruleDefs: Map<string, RuleDefRow>,
  options?: ContextBuildOptions,
): {
  text: string;
  items: ContextItem[];
  citations: ContextCitation[];
  compaction: ContextCompactionDiagnostics;
  selection_stats: ContextSelectionStats;
} {
  const items: ContextItem[] = [];
  const citations: ContextCitation[] = [];
  const selectionCollector = createPickTopSelectionCollector();
  const compactionProfile = resolveCompactionProfile(options);
  const policy = CONTEXT_COMPACTION_POLICY[compactionProfile];
  const tokenBudget = resolveContextTokenBudget(options);
  const charBudget = resolveContextCharBudget(options);
  const compactMode = charBudget !== null || compactionProfile === "aggressive";
  const sections: Record<SectionId, { title: string; lines: SectionLine[] }> = {
    topics: { title: "Topics / Concepts", lines: [] },
    entities: { title: "Entities", lines: [] },
    events: { title: "Supporting Events / Evidence", lines: [] },
    rules: { title: "Applicable Rules (Shadow/Active)", lines: [] },
  };
  const sectionOrder: SectionId[] = ["topics", "entities", "events", "rules"];
  const addLine = (section: SectionId, text: string, importance: number) => {
    sections[section].lines.push({
      section,
      text,
      importance: importance + policy.section_importance_bias[section],
      active: true,
    });
  };

  const seen = new Set<string>();
  const pushCitation = (n: NodeRow) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const uri = buildNodeUri(n, options);
    const commitUri = buildCommitUri(n.commit_id, options);
    citations.push({
      node_id: n.id,
      ...(uri ? { uri } : {}),
      commit_id: n.commit_id ?? null,
      ...(commitUri ? { commit_uri: commitUri } : {}),
      raw_ref: n.raw_ref ?? null,
      evidence_ref: n.evidence_ref ?? null,
      tier: n.tier,
      salience: n.salience,
      lifecycle_state: String(n.slots?.lifecycle_state ?? "active"),
    });
  };

  const layerPolicy = options?.layer_policy ?? null;
  const topics = pickTop(ranked, nodes, new Set(["topic", "concept"]), 4, layerPolicy, selectionCollector);
  const hasSummaryFirstConcept = topics.some((n) => isSummaryFirstConcept(n, options));
  for (const n of topics) {
    const uri = buildNodeUri(n, options);
    items.push({
      kind: n.type as "topic" | "concept",
      node_id: n.id,
      ...(uri ? { uri } : {}),
      title: n.title ?? undefined,
      summary: n.text_summary ?? undefined,
      commit_id: n.commit_id,
      tier: n.tier,
      salience: n.salience,
      lifecycle_state: String(n.slots?.lifecycle_state ?? "active"),
      compression_layer: resolveCompressionLayer(n),
    });
    pushCitation(n);
  }

  const entities = pickTop(ranked, nodes, new Set(["entity"]), 6, layerPolicy, selectionCollector);
  for (const n of entities) {
    const uri = buildNodeUri(n, options);
    items.push({
      kind: "entity",
      node_id: n.id,
      ...(uri ? { uri } : {}),
      title: n.title ?? undefined,
      summary: n.text_summary ?? undefined,
      commit_id: n.commit_id,
      tier: n.tier,
      salience: n.salience,
      lifecycle_state: String(n.slots?.lifecycle_state ?? "active"),
      compression_layer: resolveCompressionLayer(n),
    });
    pushCitation(n);
  }

  const rawEvents = pickTop(ranked, nodes, new Set(["event", "evidence"]), hasSummaryFirstConcept ? 24 : 10, layerPolicy, selectionCollector);
  const compressionCited = new Set<string>();
  if (hasSummaryFirstConcept) {
    for (const n of topics) {
      if (!isSummaryFirstConcept(n, options)) continue;
      const refs = Array.isArray(n.slots?.citations) ? (n.slots.citations as any[]) : [];
      for (const c of refs) {
        const id =
          c && typeof c === "object"
            ? typeof c.node_id === "string"
              ? c.node_id
              : null
            : typeof c === "string"
              ? c
              : null;
        if (!id) continue;
        compressionCited.add(id);
      }
    }
  }
  const eventBase = hasSummaryFirstConcept ? rawEvents.filter((n) => !compressionCited.has(n.id)).slice(0, 5) : rawEvents.slice(0, 10);
  const events = compactMode ? eventBase.slice(0, policy.max_event_lines_compact) : eventBase;
  for (const n of events) {
    const uri = buildNodeUri(n, options);
    items.push({
      kind: n.type as "event" | "evidence",
      node_id: n.id,
      ...(uri ? { uri } : {}),
      summary: n.text_summary ?? undefined,
      raw_ref: n.raw_ref,
      evidence_ref: n.evidence_ref,
      commit_id: n.commit_id,
      tier: n.tier,
      salience: n.salience,
      lifecycle_state: String(n.slots?.lifecycle_state ?? "active"),
      compression_layer: resolveCompressionLayer(n),
    });
    pushCitation(n);
  }

  const rules = pickTop(ranked, nodes, new Set(["rule"]), 6, layerPolicy, selectionCollector);
  for (const n of rules) {
    const d = ruleDefs.get(n.id);
    const uri = buildNodeUri(n, options);
    items.push({
      kind: "rule",
      node_id: n.id,
      ...(uri ? { uri } : {}),
      state: d?.state,
      rule_scope: d?.rule_scope,
      target_agent_id: d?.target_agent_id,
      target_team_id: d?.target_team_id,
      summary: n.text_summary ?? undefined,
      if_json: d?.if_json ?? (n.slots?.if ?? undefined),
      then_json: d?.then_json ?? (n.slots?.then ?? undefined),
      exceptions_json: d?.exceptions_json ?? (n.slots?.exceptions ?? undefined),
      stats: d ? { positive: d.positive_count, negative: d.negative_count } : undefined,
      commit_id: n.commit_id,
      tier: n.tier,
      salience: n.salience,
      lifecycle_state: String(n.slots?.lifecycle_state ?? "active"),
      compression_layer: resolveCompressionLayer(n),
    });
    pushCitation(n);
  }

  if (topics.length) {
    for (const n of topics) {
      const label = n.title ?? n.id;
      const summary = n.text_summary ? `: ${n.text_summary}` : "";
      if (isSummaryFirstConcept(n, options)) {
        const covered = Number(n.slots?.source_event_count ?? 0);
        const summaryKind = typeof n.slots?.summary_kind === "string" ? n.slots.summary_kind : "summary";
        addLine("topics", `- ${label}${summary} (node:${n.id}, ${summaryKind}, covers=${covered})`, 10);
        const refs = Array.isArray(n.slots?.citations) ? (n.slots.citations as any[]) : [];
        for (const c of refs.slice(0, compactMode ? policy.max_topic_evidence_lines : 3)) {
          const refNode =
            c && typeof c === "object"
              ? typeof c.node_id === "string"
                ? c.node_id
                : null
              : typeof c === "string"
                ? c
                : null;
          if (!refNode) continue;
          addLine("topics", `  evidence_node=${refNode}`, 90);
        }
      } else {
        addLine("topics", `- ${label}${summary} (node:${n.id})`, 10);
      }
    }
  }

  if (entities.length) {
    for (const n of entities) {
      const label = n.title ?? n.id;
      const summary = n.text_summary ? `: ${n.text_summary}` : "";
      addLine("entities", `- ${label}${summary} (node:${n.id})`, 40);
    }
  }

  if (events.length) {
    for (const n of events) {
      const summary = n.text_summary ?? "(no summary)";
      const refs: string[] = [];
      if (n.raw_ref) refs.push(`raw_ref=${n.raw_ref}`);
      if (n.evidence_ref) refs.push(`evidence_ref=${n.evidence_ref}`);
      addLine("events", `- ${summary} (node:${n.id}${refs.length ? `, ${refs.join(", ")}` : ""})`, 70);
    }
  }

  if (rules.length) {
    for (const n of rules) {
      const d = ruleDefs.get(n.id);
      const state = d?.state ?? "unknown";
      const ifj = d?.if_json ?? n.slots?.if;
      const thenj = d?.then_json ?? n.slots?.then;
      const stats = d ? ` pos=${d.positive_count} neg=${d.negative_count}` : "";
      const scopeInfo = d?.rule_scope ? ` scope=${d.rule_scope}` : "";
      const targetInfo =
        d?.rule_scope === "agent" && d?.target_agent_id
          ? ` target_agent=${d.target_agent_id}`
          : d?.rule_scope === "team" && d?.target_team_id
          ? ` target_team=${d.target_team_id}`
            : "";
      addLine("rules", `- state=${state}${scopeInfo}${targetInfo}${stats} summary=${n.text_summary ?? "(none)"} (node:${n.id})`, 20);
      if (policy.include_rule_json_lines) {
        if (ifj) addLine("rules", `  if=${fmtJsonCompact(ifj)}`, 80);
        if (thenj) addLine("rules", `  then=${fmtJsonCompact(thenj)}`, 80);
      }
    }
  }

  const renderText = (): string => {
    const out: string[] = [];
    for (const section of sectionOrder) {
      const active = sections[section].lines.filter((l) => l.active);
      if (active.length === 0) continue;
      if (out.length > 0) out.push("");
      out.push(`# ${sections[section].title}`);
      for (const line of active) out.push(line.text);
    }
    return out.join("\n");
  };

  let text = renderText();
  const beforeChars = text.length;
  const beforeTokens = estimateTokenCountFromText(text);
  const droppedBySection: Record<SectionId, number> = { topics: 0, entities: 0, events: 0, rules: 0 };
  let droppedLines = 0;
  if (charBudget !== null && text.length > charBudget) {
    const removable: SectionLine[] = [];
    for (const section of sectionOrder) {
      for (const line of sections[section].lines) removable.push(line);
    }
    removable.sort((a, b) => b.importance - a.importance);
    let activeCount = removable.length;
    for (const line of removable) {
      if (text.length <= charBudget) break;
      if (!line.active) continue;
      if (activeCount <= 1) break;
      line.active = false;
      activeCount -= 1;
      droppedLines += 1;
      droppedBySection[line.section] += 1;
      text = renderText();
    }
  }
  const afterChars = text.length;
  const afterTokens = estimateTokenCountFromText(text);
  const compaction: ContextCompactionDiagnostics = {
    profile: compactionProfile,
    token_budget: tokenBudget,
    char_budget: charBudget,
    applied: afterChars < beforeChars,
    before_chars: beforeChars,
    after_chars: afterChars,
    before_est_tokens: beforeTokens,
    after_est_tokens: afterTokens,
    dropped_lines: droppedLines,
    dropped_by_section: droppedBySection,
  };

  const selectedLayers = new Set<string>();
  let selectedUnlayeredCount = 0;
  for (const item of items) {
    const layer = typeof item.compression_layer === "string" ? item.compression_layer.trim() : "";
    if (layer) selectedLayers.add(layer);
    else selectedUnlayeredCount += 1;
  }
  const filteredByLayer = Object.fromEntries(
    Array.from(selectionCollector.filteredByLayer.entries()).sort((a, b) => a[0].localeCompare(b[0])),
  );

  return {
    text,
    items,
    citations,
    compaction,
    selection_stats: {
      retrieved_memory_layers: Array.from(selectionCollector.retrievedLayers).sort(),
      retrieved_unlayered_count: selectionCollector.retrievedUnlayeredCount,
      selected_memory_layers: Array.from(selectedLayers).sort(),
      selected_unlayered_count: selectedUnlayeredCount,
      retrieval_filtered_by_layer_policy_count: 0,
      retrieval_filtered_by_layer: {},
      filtered_by_layer_policy_count: selectionCollector.filteredCount,
      filtered_by_layer: filteredByLayer,
    },
  };
}
