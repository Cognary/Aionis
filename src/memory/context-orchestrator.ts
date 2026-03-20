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
  if (kind === "procedure") return "episodes";
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

function firstBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

type PatternSignal = {
  anchor_id: string;
  anchor_level: string | null;
  selected_tool: string | null;
  pattern_state: "provisional" | "stable";
  credibility_state: "candidate" | "trusted" | "contested";
  trusted: boolean;
  distinct_run_count: number | null;
  required_distinct_runs: number | null;
  counter_evidence_count: number | null;
  counter_evidence_open: boolean;
  last_transition: string | null;
  summary: string | null;
};

type PlannerPacketTextSurface = {
  packet_version: "planner_packet_v1";
  sections: {
    recommended_workflows: string[];
    candidate_workflows: string[];
    candidate_patterns: string[];
    trusted_patterns: string[];
    contested_patterns: string[];
    rehydration_candidates: string[];
    supporting_knowledge: string[];
  };
  merged_text: string;
};

export type PlannerPacketSurface = {
  planner_packet?: unknown;
  action_recall_packet?: unknown;
  recommended_workflows: unknown[];
  candidate_workflows: unknown[];
  candidate_patterns: unknown[];
  trusted_patterns: unknown[];
  contested_patterns: unknown[];
  rehydration_candidates: unknown[];
  supporting_knowledge: unknown[];
  pattern_signals: unknown[];
  workflow_signals: unknown[];
};

function collectPatternSignals(recall: any): PatternSignal[] {
  const runtimeToolHints = Array.isArray(recall?.runtime_tool_hints) ? recall.runtime_tool_hints : [];
  const out: PatternSignal[] = [];
  const seen = new Set<string>();
  for (const hint of runtimeToolHints.slice(0, 16)) {
    const anchorKind = String(hint?.anchor?.anchor_kind || "").trim();
    if (anchorKind !== "pattern") continue;
    const anchorId = String(hint?.anchor?.id || "").trim();
    if (!anchorId || seen.has(anchorId)) continue;
    seen.add(anchorId);
    const patternState = String(hint?.anchor?.pattern_state || "").trim() === "stable" ? "stable" : "provisional";
    const counterEvidenceOpen = firstBoolean(hint?.anchor?.counter_evidence_open) === true;
    const trusted = firstBoolean(hint?.anchor?.trusted) === true;
    const credibilityStateRaw = String(hint?.anchor?.credibility_state || "").trim();
    const credibilityState =
      credibilityStateRaw === "trusted" || credibilityStateRaw === "contested" || credibilityStateRaw === "candidate"
        ? credibilityStateRaw
        : counterEvidenceOpen
          ? "contested"
          : trusted
            ? "trusted"
            : "candidate";
    out.push({
      anchor_id: anchorId,
      anchor_level: String(hint?.anchor?.anchor_level || "").trim() || null,
      selected_tool: String(hint?.anchor?.selected_tool || "").trim() || null,
      pattern_state: patternState,
      credibility_state: credibilityState,
      trusted,
      distinct_run_count: firstFiniteNumber(hint?.anchor?.distinct_run_count),
      required_distinct_runs: firstFiniteNumber(hint?.anchor?.required_distinct_runs),
      counter_evidence_count: firstFiniteNumber(hint?.anchor?.counter_evidence_count),
      counter_evidence_open: counterEvidenceOpen,
      last_transition: String(hint?.anchor?.last_transition || "").trim() || null,
      summary: String(hint?.anchor?.summary || "").trim() || null,
    });
  }
  return out;
}

function collectWorkflowSignals(packet: ReturnType<typeof normalizeActionRecallPacket>) {
  const stable = packet.recommended_workflows
    .filter((entry: any) => !!entry && typeof entry === "object")
    .map((entry: any) => ({
      anchor_id: String(entry?.anchor_id || "").trim(),
      anchor_level: String(entry?.anchor_level || "").trim() || null,
      title: String(entry?.title || "").trim() || null,
      summary: String(entry?.summary || "").trim() || null,
      promotion_state: "stable" as const,
      promotion_ready: false,
      observed_count: null,
      required_observations: null,
      source_kind: String(entry?.source_kind || "").trim() || null,
      promotion_origin: String(entry?.promotion_origin || "").trim() || null,
      last_transition: String(entry?.last_transition || "").trim() || null,
      maintenance_state: String(entry?.maintenance_state || "").trim() || null,
      offline_priority: String(entry?.offline_priority || "").trim() || null,
      last_maintenance_at: String(entry?.last_maintenance_at || "").trim() || null,
    }))
    .filter((entry: any) => entry.anchor_id);
  const candidate = packet.candidate_workflows
    .filter((entry: any) => !!entry && typeof entry === "object")
    .map((entry: any) => {
      const observedCount = firstFiniteNumber(entry?.observed_count);
      const requiredObservations = firstFiniteNumber(entry?.required_observations);
      const promotionReady = (
        entry?.promotion_ready === true
        || (
          Number.isFinite(observedCount)
          && Number.isFinite(requiredObservations)
          && Number(requiredObservations) > 0
          && Number(observedCount) >= Number(requiredObservations)
        )
      );
      return {
        anchor_id: String(entry?.anchor_id || "").trim(),
        anchor_level: String(entry?.anchor_level || "").trim() || null,
        title: String(entry?.title || "").trim() || null,
        summary: String(entry?.summary || "").trim() || null,
        promotion_state: String(entry?.promotion_state || "").trim() || "candidate",
        promotion_ready: promotionReady,
        observed_count: observedCount,
        required_observations: requiredObservations,
        source_kind: String(entry?.source_kind || "").trim() || null,
        promotion_origin: String(entry?.promotion_origin || "").trim() || null,
        last_transition: String(entry?.last_transition || "").trim() || null,
        maintenance_state: String(entry?.maintenance_state || "").trim() || null,
        offline_priority: String(entry?.offline_priority || "").trim() || null,
        last_maintenance_at: String(entry?.last_maintenance_at || "").trim() || null,
      };
    })
    .filter((entry) => entry.anchor_id);
  return [...stable, ...candidate];
}

function normalizeActionRecallPacket(recall: any) {
  const packet =
    recall?.action_recall_packet && typeof recall.action_recall_packet === "object"
      ? (recall.action_recall_packet as Record<string, unknown>)
      : null;
  const runtimeToolHints = Array.isArray(recall?.runtime_tool_hints) ? recall.runtime_tool_hints : [];
  const recommendedWorkflows = Array.isArray(packet?.recommended_workflows) ? packet.recommended_workflows : [];
  const candidateWorkflows = Array.isArray(packet?.candidate_workflows) ? packet.candidate_workflows : [];
  const candidatePatterns = Array.isArray(packet?.candidate_patterns) ? packet.candidate_patterns : [];
  const trustedPatterns = Array.isArray(packet?.trusted_patterns) ? packet.trusted_patterns : [];
  const contestedPatterns = Array.isArray(packet?.contested_patterns) ? packet.contested_patterns : [];
  const rehydrationCandidates = Array.isArray(packet?.rehydration_candidates) ? packet.rehydration_candidates : [];
  const supportingKnowledge = Array.isArray(packet?.supporting_knowledge) ? packet.supporting_knowledge : [];
  const workflowHints = runtimeToolHints
    .filter((hint: any) => String(hint?.anchor?.anchor_kind || "").trim() === "workflow")
    .map((hint: any) => ({
      anchor_id: String(hint?.anchor?.id || "").trim(),
      uri: null,
      type: "procedure",
      title: null,
      summary: String(hint?.anchor?.summary || "").trim() || null,
      anchor_level: String(hint?.anchor?.anchor_level || "").trim() || null,
      tool_set: [],
      confidence: null,
    }))
    .filter((entry: any) => entry.anchor_id);
  const trustedPatternHints = runtimeToolHints
    .filter(
      (hint: any) =>
        String(hint?.anchor?.anchor_kind || "").trim() === "pattern"
        && String(hint?.anchor?.pattern_state || "").trim() === "stable",
    )
    .map((hint: any) => ({
      anchor_id: String(hint?.anchor?.id || "").trim(),
      uri: null,
      type: "concept",
      title: null,
      summary: String(hint?.anchor?.summary || "").trim() || null,
      anchor_level: String(hint?.anchor?.anchor_level || "").trim() || null,
      selected_tool: String(hint?.anchor?.selected_tool || "").trim() || null,
      pattern_state: "stable",
      credibility_state: "trusted",
      distinct_run_count: firstFiniteNumber(hint?.anchor?.distinct_run_count),
      required_distinct_runs: firstFiniteNumber(hint?.anchor?.required_distinct_runs),
      trusted: firstBoolean(hint?.anchor?.trusted) === true,
      last_transition: String(hint?.anchor?.last_transition || "").trim() || null,
      confidence: null,
    }))
    .filter((entry: any) => entry.anchor_id);
  const candidatePatternHints = runtimeToolHints
    .filter(
      (hint: any) =>
        String(hint?.anchor?.anchor_kind || "").trim() === "pattern"
        && String(hint?.anchor?.credibility_state || "").trim() === "candidate",
    )
    .map((hint: any) => ({
      anchor_id: String(hint?.anchor?.id || "").trim(),
      uri: null,
      type: "concept",
      title: null,
      summary: String(hint?.anchor?.summary || "").trim() || null,
      anchor_level: String(hint?.anchor?.anchor_level || "").trim() || null,
      selected_tool: String(hint?.anchor?.selected_tool || "").trim() || null,
      pattern_state: "provisional",
      credibility_state: firstBoolean(hint?.anchor?.counter_evidence_open) === true ? "contested" : "candidate",
      distinct_run_count: firstFiniteNumber(hint?.anchor?.distinct_run_count),
      required_distinct_runs: firstFiniteNumber(hint?.anchor?.required_distinct_runs),
      trusted: false,
      counter_evidence_open: firstBoolean(hint?.anchor?.counter_evidence_open) === true,
      last_transition: String(hint?.anchor?.last_transition || "").trim() || null,
      confidence: null,
    }))
    .filter((entry: any) => entry.anchor_id);
  const contestedPatternHints = runtimeToolHints
    .filter(
      (hint: any) =>
        String(hint?.anchor?.anchor_kind || "").trim() === "pattern"
        && (
          String(hint?.anchor?.credibility_state || "").trim() === "contested"
          || firstBoolean(hint?.anchor?.counter_evidence_open) === true
        ),
    )
    .map((hint: any) => ({
      anchor_id: String(hint?.anchor?.id || "").trim(),
      uri: null,
      type: "concept",
      title: null,
      summary: String(hint?.anchor?.summary || "").trim() || null,
      anchor_level: String(hint?.anchor?.anchor_level || "").trim() || null,
      selected_tool: String(hint?.anchor?.selected_tool || "").trim() || null,
      pattern_state: String(hint?.anchor?.pattern_state || "").trim() === "stable" ? "stable" : "provisional",
      credibility_state: "contested",
      distinct_run_count: firstFiniteNumber(hint?.anchor?.distinct_run_count),
      required_distinct_runs: firstFiniteNumber(hint?.anchor?.required_distinct_runs),
      trusted: false,
      counter_evidence_open: true,
      last_transition: String(hint?.anchor?.last_transition || "").trim() || null,
      confidence: null,
    }))
    .filter((entry: any) => entry.anchor_id);
  const rehydrationHintCandidates = runtimeToolHints
    .filter((hint: any) => String(hint?.tool_name || "").trim() === "rehydrate_payload")
    .map((hint: any) => ({
      anchor_id: String(hint?.anchor?.id || "").trim(),
      anchor_uri: null,
      anchor_kind: String(hint?.anchor?.anchor_kind || "").trim() || null,
      anchor_level: String(hint?.anchor?.anchor_level || "").trim() || null,
      title: null,
      summary: String(hint?.anchor?.summary || "").trim() || null,
      mode: String(hint?.invocation?.mode || "").trim() || null,
      payload_cost_hint: String(hint?.payload_cost_hint || "").trim() || null,
      recommended_when: [],
      trusted: firstBoolean(hint?.anchor?.trusted) === true,
      selected_tool: String(hint?.anchor?.selected_tool || "").trim() || null,
      example_call: String(hint?.invocation?.example_call || "").trim() || null,
    }))
    .filter((entry: any) => entry.anchor_id);
  return {
    packet_version: "action_recall_v1" as const,
    recommended_workflows: recommendedWorkflows.length > 0 ? recommendedWorkflows : workflowHints,
    candidate_workflows: candidateWorkflows,
    candidate_patterns: candidatePatterns.length > 0 ? candidatePatterns : candidatePatternHints,
    trusted_patterns: trustedPatterns.length > 0 ? trustedPatterns : trustedPatternHints,
    contested_patterns: contestedPatterns.length > 0 ? contestedPatterns : contestedPatternHints,
    rehydration_candidates: rehydrationCandidates.length > 0 ? rehydrationCandidates : rehydrationHintCandidates,
    supporting_knowledge: supportingKnowledge,
  };
}

export function extractPlannerPacketSurface(args: { layeredContext?: unknown; recall?: unknown }): PlannerPacketSurface {
  const layered = args.layeredContext && typeof args.layeredContext === "object"
    ? args.layeredContext as Record<string, unknown>
    : null;
  const recall = args.recall && typeof args.recall === "object"
    ? args.recall as Record<string, unknown>
    : null;
  const normalizedPacket = recall ? normalizeActionRecallPacket(recall) : null;
  const derivedPlannerPacket = normalizedPacket ? buildPlannerPacketText(normalizedPacket) : undefined;
  const derivedPatternSignals = recall ? collectPatternSignals(recall) : [];
  const derivedWorkflowSignals = normalizedPacket ? collectWorkflowSignals(normalizedPacket) : [];
  return {
    planner_packet:
      layered && "planner_packet" in layered
        ? layered.planner_packet
        : derivedPlannerPacket,
    action_recall_packet:
      recall?.action_recall_packet && typeof recall.action_recall_packet === "object"
        ? recall.action_recall_packet
        : layered?.action_recall_packet && typeof layered.action_recall_packet === "object"
          ? layered.action_recall_packet
          : undefined,
    recommended_workflows:
      Array.isArray(layered?.recommended_workflows)
        ? layered.recommended_workflows
        : normalizedPacket?.recommended_workflows ?? [],
    candidate_workflows:
      Array.isArray(layered?.candidate_workflows)
        ? layered.candidate_workflows
        : normalizedPacket?.candidate_workflows ?? [],
    candidate_patterns:
      Array.isArray(layered?.candidate_patterns)
        ? layered.candidate_patterns
        : normalizedPacket?.candidate_patterns ?? [],
    trusted_patterns:
      Array.isArray(layered?.trusted_patterns)
        ? layered.trusted_patterns
        : normalizedPacket?.trusted_patterns ?? [],
    contested_patterns:
      Array.isArray(layered?.contested_patterns)
        ? layered.contested_patterns
        : normalizedPacket?.contested_patterns ?? [],
    rehydration_candidates:
      Array.isArray(layered?.rehydration_candidates)
        ? layered.rehydration_candidates
        : normalizedPacket?.rehydration_candidates ?? [],
    supporting_knowledge:
      Array.isArray(layered?.supporting_knowledge)
        ? layered.supporting_knowledge
        : normalizedPacket?.supporting_knowledge ?? [],
    pattern_signals: Array.isArray(layered?.pattern_signals) ? layered.pattern_signals : derivedPatternSignals,
    workflow_signals: Array.isArray(layered?.workflow_signals) ? layered.workflow_signals : derivedWorkflowSignals,
  };
}

function plannerPacketLine(kind: string, parts: Array<string | null | undefined>) {
  const body = parts.filter(Boolean).join("; ");
  return trimLine(body ? `${kind}: ${body}` : kind, 260);
}

function buildPlannerPacketText(packet: ReturnType<typeof normalizeActionRecallPacket>): PlannerPacketTextSurface {
  const recommendedWorkflows = packet.recommended_workflows.slice(0, 6).map((entry: any) =>
    plannerPacketLine("recommended workflow", [
      String(entry?.title || "").trim() || String(entry?.summary || "").trim() || null,
      String(entry?.anchor_id || "").trim() ? `anchor=${String(entry.anchor_id).trim()}` : null,
      String(entry?.source_kind || "").trim() ? `source=${String(entry.source_kind).trim()}` : null,
      Array.isArray(entry?.tool_set) && entry.tool_set.length > 0 ? `tools=${entry.tool_set.join(", ")}` : null,
      String(entry?.anchor_level || "").trim() ? `level=${String(entry.anchor_level).trim()}` : null,
      String(entry?.last_transition || "").trim() ? `transition=${String(entry.last_transition).trim()}` : null,
      String(entry?.maintenance_state || "").trim() ? `maintenance=${String(entry.maintenance_state).trim()}` : null,
      String(entry?.offline_priority || "").trim() ? `priority=${String(entry.offline_priority).trim()}` : null,
    ])
  );
  const candidateWorkflows = packet.candidate_workflows.slice(0, 6).map((entry: any) =>
    plannerPacketLine("candidate workflow", [
      String(entry?.title || "").trim() || String(entry?.summary || "").trim() || null,
      String(entry?.anchor_id || "").trim() ? `anchor=${String(entry.anchor_id).trim()}` : null,
      String(entry?.source_kind || "").trim() ? `source=${String(entry.source_kind).trim()}` : null,
      Array.isArray(entry?.tool_set) && entry.tool_set.length > 0 ? `tools=${entry.tool_set.join(", ")}` : null,
      String(entry?.anchor_level || "").trim() ? `level=${String(entry.anchor_level).trim()}` : null,
      Number.isFinite(Number(entry?.observed_count)) && Number.isFinite(Number(entry?.required_observations))
        ? `observed=${Math.trunc(Number(entry.observed_count))}/${Math.trunc(Number(entry.required_observations))}`
        : null,
      entry?.promotion_ready === true ? "promotion=ready" : null,
      String(entry?.last_transition || "").trim() ? `transition=${String(entry.last_transition).trim()}` : null,
      String(entry?.maintenance_state || "").trim() ? `maintenance=${String(entry.maintenance_state).trim()}` : null,
      String(entry?.offline_priority || "").trim() ? `priority=${String(entry.offline_priority).trim()}` : null,
    ])
  );
  const candidatePatterns = packet.candidate_patterns.slice(0, 6).map((entry: any) =>
    plannerPacketLine("candidate pattern", [
      String(entry?.selected_tool || "").trim() ? `prefer ${String(entry.selected_tool).trim()}` : null,
      String(entry?.summary || "").trim() || String(entry?.title || "").trim() || null,
      String(entry?.anchor_id || "").trim() ? `anchor=${String(entry.anchor_id).trim()}` : null,
      String(entry?.pattern_state || "").trim() ? `state=${String(entry.pattern_state).trim()}` : null,
      String(entry?.credibility_state || "").trim() ? `credibility=${String(entry.credibility_state).trim()}` : null,
      String(entry?.last_transition || "").trim() ? `transition=${String(entry.last_transition).trim()}` : null,
    ])
  );
  const trustedPatterns = packet.trusted_patterns.slice(0, 6).map((entry: any) =>
    plannerPacketLine("trusted pattern", [
      String(entry?.selected_tool || "").trim() ? `prefer ${String(entry.selected_tool).trim()}` : null,
      String(entry?.summary || "").trim() || String(entry?.title || "").trim() || null,
      String(entry?.anchor_id || "").trim() ? `anchor=${String(entry.anchor_id).trim()}` : null,
      String(entry?.pattern_state || "").trim() ? `state=${String(entry.pattern_state).trim()}` : null,
      String(entry?.credibility_state || "").trim() ? `credibility=${String(entry.credibility_state).trim()}` : null,
      String(entry?.last_transition || "").trim() ? `transition=${String(entry.last_transition).trim()}` : null,
    ])
  );
  const contestedPatterns = packet.contested_patterns.slice(0, 6).map((entry: any) =>
    plannerPacketLine("contested pattern", [
      String(entry?.selected_tool || "").trim() ? `prefer ${String(entry.selected_tool).trim()}` : null,
      String(entry?.summary || "").trim() || String(entry?.title || "").trim() || null,
      String(entry?.anchor_id || "").trim() ? `anchor=${String(entry.anchor_id).trim()}` : null,
      String(entry?.pattern_state || "").trim() ? `state=${String(entry.pattern_state).trim()}` : null,
      String(entry?.credibility_state || "").trim() ? `credibility=${String(entry.credibility_state).trim()}` : null,
      String(entry?.last_transition || "").trim() ? `transition=${String(entry.last_transition).trim()}` : null,
      entry?.counter_evidence_open === true ? "counter_evidence_open=true" : null,
    ])
  );
  const rehydrationCandidates = packet.rehydration_candidates.slice(0, 6).map((entry: any) =>
    plannerPacketLine("rehydration candidate", [
      String(entry?.title || "").trim() || String(entry?.summary || "").trim() || null,
      String(entry?.anchor_id || "").trim() ? `anchor=${String(entry.anchor_id).trim()}` : null,
      String(entry?.mode || "").trim() ? `mode=${String(entry.mode).trim()}` : null,
      String(entry?.payload_cost_hint || "").trim() ? `cost=${String(entry.payload_cost_hint).trim()}` : null,
    ])
  );
  const supportingKnowledge = packet.supporting_knowledge.slice(0, 8).map((entry: any) =>
    plannerPacketLine("supporting knowledge", [
      String(entry?.title || "").trim() || String(entry?.summary || "").trim() || null,
      String(entry?.id || "").trim() ? `id=${String(entry.id).trim()}` : null,
      String(entry?.type || "").trim() ? `type=${String(entry.type).trim()}` : null,
    ])
  );

  const sections = {
    recommended_workflows: recommendedWorkflows,
    candidate_workflows: candidateWorkflows,
    candidate_patterns: candidatePatterns,
    trusted_patterns: trustedPatterns,
    contested_patterns: contestedPatterns,
    rehydration_candidates: rehydrationCandidates,
    supporting_knowledge: supportingKnowledge,
  };

  const mergedParts: string[] = [];
  const sectionOrder: Array<[string, string[]]> = [
    ["# Recommended Workflows", sections.recommended_workflows],
    ["# Candidate Workflows", sections.candidate_workflows],
    ["# Candidate Patterns", sections.candidate_patterns],
    ["# Trusted Patterns", sections.trusted_patterns],
    ["# Contested Patterns", sections.contested_patterns],
    ["# Rehydration Candidates", sections.rehydration_candidates],
    ["# Supporting Knowledge", sections.supporting_knowledge],
  ];
  for (const [header, items] of sectionOrder) {
    if (items.length === 0) continue;
    mergedParts.push(header);
    for (const item of items) mergedParts.push(`- ${item}`);
  }

  return {
    packet_version: "planner_packet_v1",
    sections,
    merged_text: mergedParts.join("\n"),
  };
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
  const runtimeToolHints = Array.isArray(recall?.runtime_tool_hints) ? recall.runtime_tool_hints : [];
  for (const hint of runtimeToolHints.slice(0, 6)) {
    const toolName = String(hint?.tool_name || "").trim();
    const anchorId = String(hint?.anchor?.id || "").trim();
    const anchorKind = String(hint?.anchor?.anchor_kind || "").trim();
    const anchorLevel = String(hint?.anchor?.anchor_level || "").trim();
    const patternState = String(hint?.anchor?.pattern_state || "").trim();
    const credibilityState = String(hint?.anchor?.credibility_state || "").trim();
    const selectedPatternTool = String(hint?.anchor?.selected_tool || "").trim();
    const mode = String(hint?.invocation?.mode || "").trim();
    const payloadCostHint = String(hint?.payload_cost_hint || "").trim();
    const summary = String(hint?.anchor?.summary || "").trim();
    const exampleCall = String(hint?.invocation?.example_call || "").trim();
    if (anchorKind === "pattern" && selectedPatternTool) {
      const patternPieces = [
        `${credibilityState === "trusted" ? "validated" : credibilityState === "contested" ? "contested" : "candidate"} tool pattern: prefer ${selectedPatternTool}`,
        anchorId ? `anchor=${anchorId}` : null,
        anchorLevel ? `level=${anchorLevel}` : null,
        patternState ? `state=${patternState}` : null,
        credibilityState ? `credibility=${credibilityState}` : null,
        summary ? `summary=${summary}` : null,
      ].filter(Boolean);
      pushCandidate(out.tools, patternPieces.join("; "));
    }
    const pieces = [
      toolName ? `${toolName} available` : "runtime tool available",
      anchorId ? `anchor=${anchorId}` : null,
      anchorKind ? `kind=${anchorKind}` : null,
      anchorLevel ? `level=${anchorLevel}` : null,
      mode ? `mode=${mode}` : null,
      payloadCostHint ? `cost=${payloadCostHint}` : null,
      summary ? `summary=${summary}` : null,
      exampleCall ? `call=${exampleCall}` : null,
    ].filter(Boolean);
    pushCandidate(out.tools, pieces.join("; "));
  }

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
  const patternSignals = collectPatternSignals(args.recall);
  const actionRecallPacket = normalizeActionRecallPacket(args.recall);
  const workflowSignals = collectWorkflowSignals(actionRecallPacket);
  const plannerPacket = buildPlannerPacketText(actionRecallPacket);

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
      ...(layer === "tools" && patternSignals.length > 0 ? { pattern_signals: patternSignals } : {}),
      ...(layer === "tools" && workflowSignals.length > 0 ? { workflow_signals: workflowSignals } : {}),
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
    planner_packet: plannerPacket,
    action_recall_packet: actionRecallPacket,
    recommended_workflows: actionRecallPacket.recommended_workflows,
    candidate_workflows: actionRecallPacket.candidate_workflows,
    candidate_patterns: actionRecallPacket.candidate_patterns,
    trusted_patterns: actionRecallPacket.trusted_patterns,
    contested_patterns: actionRecallPacket.contested_patterns,
    rehydration_candidates: actionRecallPacket.rehydration_candidates,
    supporting_knowledge: actionRecallPacket.supporting_knowledge,
    pattern_signals: patternSignals,
    workflow_signals: workflowSignals,
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
