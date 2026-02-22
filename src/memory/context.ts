type RankedItem = { id: string; activation: number; score: number };

type NodeRow = {
  id: string;
  type: string;
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
  | { kind: "topic" | "concept"; node_id: string; title?: string; summary?: string; commit_id?: string | null }
  | { kind: "entity"; node_id: string; title?: string; summary?: string; commit_id?: string | null }
  | {
      kind: "event" | "evidence";
      node_id: string;
      summary?: string;
      raw_ref?: string | null;
      evidence_ref?: string | null;
      commit_id?: string | null;
    }
  | {
      kind: "rule";
      node_id: string;
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
    };

export type ContextBuildOptions = {
  context_token_budget?: number | null;
  context_char_budget?: number | null;
  context_compaction_profile?: ContextCompactionProfile | null;
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

function pickTop(
  ranked: RankedItem[],
  nodes: Map<string, NodeRow>,
  types: Set<string>,
  limit: number,
): NodeRow[] {
  const out: NodeRow[] = [];
  for (const r of ranked) {
    const n = nodes.get(r.id);
    if (!n) continue;
    if (!types.has(n.type)) continue;
    if (n.type === "topic" && ((n.topic_state ?? n.slots?.topic_state) === "draft")) continue;
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
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

export function buildContext(
  ranked: RankedItem[],
  nodes: Map<string, NodeRow>,
  ruleDefs: Map<string, RuleDefRow>,
  options?: ContextBuildOptions,
): {
  text: string;
  items: ContextItem[];
  citations: Array<{ node_id: string; commit_id: string | null; raw_ref: string | null; evidence_ref: string | null }>;
  compaction: ContextCompactionDiagnostics;
} {
  const items: ContextItem[] = [];
  const citations: Array<{ node_id: string; commit_id: string | null; raw_ref: string | null; evidence_ref: string | null }> =
    [];
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
    citations.push({ node_id: n.id, commit_id: n.commit_id ?? null, raw_ref: n.raw_ref ?? null, evidence_ref: n.evidence_ref ?? null });
  };

  const topics = pickTop(ranked, nodes, new Set(["topic", "concept"]), 4);
  const hasCompressionConcept = topics.some(isCompressionConcept);
  for (const n of topics) {
    items.push({ kind: n.type as "topic" | "concept", node_id: n.id, title: n.title ?? undefined, summary: n.text_summary ?? undefined, commit_id: n.commit_id });
    pushCitation(n);
  }

  const entities = pickTop(ranked, nodes, new Set(["entity"]), 6);
  for (const n of entities) {
    items.push({ kind: "entity", node_id: n.id, title: n.title ?? undefined, summary: n.text_summary ?? undefined, commit_id: n.commit_id });
    pushCitation(n);
  }

  const rawEvents = pickTop(ranked, nodes, new Set(["event", "evidence"]), hasCompressionConcept ? 24 : 10);
  const compressionCited = new Set<string>();
  if (hasCompressionConcept) {
    for (const n of topics) {
      if (!isCompressionConcept(n)) continue;
      const refs = Array.isArray(n.slots?.citations) ? (n.slots.citations as any[]) : [];
      for (const c of refs) {
        if (!c || typeof c !== "object") continue;
        const id = typeof c.node_id === "string" ? c.node_id : null;
        if (!id) continue;
        compressionCited.add(id);
      }
    }
  }
  const eventBase = hasCompressionConcept ? rawEvents.filter((n) => !compressionCited.has(n.id)).slice(0, 5) : rawEvents.slice(0, 10);
  const events = compactMode ? eventBase.slice(0, policy.max_event_lines_compact) : eventBase;
  for (const n of events) {
    items.push({
      kind: n.type as "event" | "evidence",
      node_id: n.id,
      summary: n.text_summary ?? undefined,
      raw_ref: n.raw_ref,
      evidence_ref: n.evidence_ref,
      commit_id: n.commit_id,
    });
    pushCitation(n);
  }

  const rules = pickTop(ranked, nodes, new Set(["rule"]), 6);
  for (const n of rules) {
    const d = ruleDefs.get(n.id);
    items.push({
      kind: "rule",
      node_id: n.id,
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
    });
    pushCitation(n);
  }

  if (topics.length) {
    for (const n of topics) {
      const label = n.title ?? n.id;
      const summary = n.text_summary ? `: ${n.text_summary}` : "";
      if (isCompressionConcept(n)) {
        const covered = Number(n.slots?.source_event_count ?? 0);
        addLine("topics", `- ${label}${summary} (node:${n.id}, compression, covers=${covered})`, 10);
        const refs = Array.isArray(n.slots?.citations) ? (n.slots.citations as any[]) : [];
        for (const c of refs.slice(0, compactMode ? policy.max_topic_evidence_lines : 3)) {
          if (!c || typeof c !== "object") continue;
          const refNode = typeof c.node_id === "string" ? c.node_id : null;
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

  return { text, items, citations, compaction };
}
