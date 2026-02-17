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

export function buildContext(
  ranked: RankedItem[],
  nodes: Map<string, NodeRow>,
  ruleDefs: Map<string, RuleDefRow>,
): { text: string; items: ContextItem[]; citations: Array<{ node_id: string; commit_id: string | null; raw_ref: string | null; evidence_ref: string | null }> } {
  const items: ContextItem[] = [];
  const citations: Array<{ node_id: string; commit_id: string | null; raw_ref: string | null; evidence_ref: string | null }> =
    [];

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
  const events = hasCompressionConcept ? rawEvents.filter((n) => !compressionCited.has(n.id)).slice(0, 5) : rawEvents.slice(0, 10);
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

  const lines: string[] = [];
  const section = (title: string) => {
    if (lines.length > 0) lines.push("");
    lines.push(`# ${title}`);
  };

  if (topics.length) {
    section("Topics / Concepts");
    for (const n of topics) {
      const label = n.title ?? n.id;
      const summary = n.text_summary ? `: ${n.text_summary}` : "";
      if (isCompressionConcept(n)) {
        const covered = Number(n.slots?.source_event_count ?? 0);
        lines.push(`- ${label}${summary} (node:${n.id}, compression, covers=${covered})`);
        const refs = Array.isArray(n.slots?.citations) ? (n.slots.citations as any[]) : [];
        for (const c of refs.slice(0, 3)) {
          if (!c || typeof c !== "object") continue;
          const refNode = typeof c.node_id === "string" ? c.node_id : null;
          if (!refNode) continue;
          lines.push(`  evidence_node=${refNode}`);
        }
      } else {
        lines.push(`- ${label}${summary} (node:${n.id})`);
      }
    }
  }

  if (entities.length) {
    section("Entities");
    for (const n of entities) {
      const label = n.title ?? n.id;
      const summary = n.text_summary ? `: ${n.text_summary}` : "";
      lines.push(`- ${label}${summary} (node:${n.id})`);
    }
  }

  if (events.length) {
    section("Supporting Events / Evidence");
    for (const n of events) {
      const summary = n.text_summary ?? "(no summary)";
      const refs: string[] = [];
      if (n.raw_ref) refs.push(`raw_ref=${n.raw_ref}`);
      if (n.evidence_ref) refs.push(`evidence_ref=${n.evidence_ref}`);
      lines.push(`- ${summary} (node:${n.id}${refs.length ? `, ${refs.join(", ")}` : ""})`);
    }
  }

  if (rules.length) {
    section("Applicable Rules (Shadow/Active)");
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
      lines.push(`- state=${state}${scopeInfo}${targetInfo}${stats} summary=${n.text_summary ?? "(none)"} (node:${n.id})`);
      if (ifj) lines.push(`  if=${fmtJsonCompact(ifj)}`);
      if (thenj) lines.push(`  then=${fmtJsonCompact(thenj)}`);
    }
  }

  return { text: lines.join("\n"), items, citations };
}
