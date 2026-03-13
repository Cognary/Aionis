import { sha256Hex } from "../util/crypto.js";
import { stableUuid } from "../util/uuid.js";

export type WriteDistillationSource = "input_text" | "event_nodes" | "evidence_nodes";

export type WriteDistillationConfig = {
  enabled: boolean;
  sources: WriteDistillationSource[];
  max_evidence_nodes: number;
  max_fact_nodes: number;
  min_sentence_chars: number;
  attach_edges: boolean;
};

export type DistillablePreparedNode = {
  id: string;
  client_id?: string;
  type: string;
  tier?: "hot" | "warm" | "cold" | "archive";
  memory_lane: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  title?: string;
  text_summary?: string;
  slots: Record<string, unknown>;
  raw_ref?: string;
  evidence_ref?: string;
  salience?: number;
  importance?: number;
  confidence?: number;
};

export type DistilledPreparedNode = DistillablePreparedNode & {
  scope: string;
};

export type DistilledPreparedEdge = {
  id: string;
  scope: string;
  type: "derived_from";
  src_id: string;
  dst_id: string;
  weight?: number;
  confidence?: number;
  decay_rate?: number;
};

export type WriteDistillationSummary = {
  enabled: boolean;
  sources_considered: number;
  source_kinds: WriteDistillationSource[];
  generated_evidence_nodes: number;
  generated_fact_nodes: number;
  generated_edges: number;
};

type DistillationSourceRecord = {
  kind: "input_text" | "node";
  source_kind: WriteDistillationSource;
  source_key: string;
  text: string;
  title?: string;
  node?: DistillablePreparedNode;
};

type FactCandidate = {
  title: string;
  summary: string;
  source_excerpt: string;
  extraction_pattern: "colon" | "relation";
};

function normalizeSnippet(input: string, maxLen = 280): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function firstNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeSnippet(value, 4000);
  return normalized || null;
}

function sourceTextFromNode(node: DistillablePreparedNode): string | null {
  const slotCandidates = ["raw_text", "content", "body", "message", "details", "excerpt", "observation", "text"];
  for (const key of slotCandidates) {
    const picked = firstNonEmptyString(node.slots?.[key]);
    if (picked) return picked;
  }
  return firstNonEmptyString(node.text_summary) ?? firstNonEmptyString(node.title);
}

function splitSentences(input: string): string[] {
  return String(input || "")
    .split(/(?:\r?\n+|(?<=[.!?;])\s+)/)
    .map((part) => normalizeSnippet(part, 400))
    .filter(Boolean);
}

function summarizeEvidenceText(input: string, minChars: number): string | null {
  const parts = splitSentences(input).filter((part) => part.length >= minChars);
  if (parts.length === 0) return null;
  const selected: string[] = [];
  let used = 0;
  for (const part of parts) {
    if (selected.length >= 2) break;
    if (used + part.length + 1 > 240) break;
    selected.push(part);
    used += part.length + 1;
  }
  if (selected.length === 0) selected.push(parts[0].slice(0, 240));
  return normalizeSnippet(selected.join(" "), 240);
}

function extractFactCandidates(input: string, minChars: number, limit: number): FactCandidate[] {
  const out: FactCandidate[] = [];
  const seen = new Set<string>();
  const lines = splitSentences(input);
  for (const line of lines) {
    if (line.length < minChars) continue;
    let candidate: FactCandidate | null = null;
    const colon = line.match(/^([A-Za-z0-9][A-Za-z0-9 _./:-]{1,48}):\s+(.{2,180})$/);
    if (colon) {
      candidate = {
        title: normalizeSnippet(colon[1], 72),
        summary: normalizeSnippet(colon[2], 180),
        source_excerpt: normalizeSnippet(line, 180),
        extraction_pattern: "colon",
      };
    }
    if (!candidate) {
      const relation = line.match(
        /^([A-Za-z0-9][A-Za-z0-9 _./-]{1,48})\s+(is|has|requires|prefers|needs|uses|supports|owns|depends on|belongs to)\s+(.{2,180})$/i,
      );
      if (relation) {
        candidate = {
          title: normalizeSnippet(relation[1], 72),
          summary: normalizeSnippet(`${relation[2]} ${relation[3]}`, 180),
          source_excerpt: normalizeSnippet(line, 180),
          extraction_pattern: "relation",
        };
      }
    }
    if (!candidate) continue;
    const key = `${candidate.title.toLowerCase()}::${candidate.summary.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}

function collectSources(args: {
  input_text?: string | null;
  nodes: DistillablePreparedNode[];
  config: WriteDistillationConfig;
}): DistillationSourceRecord[] {
  const out: DistillationSourceRecord[] = [];
  if (args.config.sources.includes("input_text")) {
    const text = firstNonEmptyString(args.input_text);
    if (text) {
      out.push({
        kind: "input_text",
        source_kind: "input_text",
        source_key: sha256Hex(text),
        text,
      });
    }
  }

  for (const node of args.nodes) {
    const sourceKind =
      node.type === "event" && args.config.sources.includes("event_nodes")
        ? "event_nodes"
        : node.type === "evidence" && args.config.sources.includes("evidence_nodes")
          ? "evidence_nodes"
          : null;
    if (!sourceKind) continue;
    const text = sourceTextFromNode(node);
    if (!text) continue;
    out.push({
      kind: "node",
      source_kind: sourceKind,
      source_key: `${node.id}:${sha256Hex(text)}`,
      text,
      title: node.title ?? node.text_summary ?? undefined,
      node,
    });
  }

  return out;
}

export function distillWriteArtifacts(args: {
  scope: string;
  input_text?: string | null;
  nodes: DistillablePreparedNode[];
  config: WriteDistillationConfig;
  fallback_memory_lane: "private" | "shared";
  fallback_producer_agent_id?: string;
  fallback_owner_agent_id?: string;
  fallback_owner_team_id?: string;
}): {
  nodes: DistilledPreparedNode[];
  edges: DistilledPreparedEdge[];
  summary: WriteDistillationSummary;
} {
  if (!args.config.enabled) {
    return {
      nodes: [],
      edges: [],
      summary: {
        enabled: false,
        sources_considered: 0,
        source_kinds: args.config.sources,
        generated_evidence_nodes: 0,
        generated_fact_nodes: 0,
        generated_edges: 0,
      },
    };
  }

  const sources = collectSources({
    input_text: args.input_text,
    nodes: args.nodes,
    config: args.config,
  });
  const distilledNodes: DistilledPreparedNode[] = [];
  const distilledEdges: DistilledPreparedEdge[] = [];
  let evidenceCount = 0;
  let factCount = 0;

  for (const source of sources) {
    if (evidenceCount >= args.config.max_evidence_nodes && factCount >= args.config.max_fact_nodes) break;

    const evidenceSummary = summarizeEvidenceText(source.text, args.config.min_sentence_chars);
    let evidenceNodeId: string | null = null;
    if (evidenceSummary && evidenceCount < args.config.max_evidence_nodes) {
      evidenceNodeId = stableUuid(`${args.scope}:distill:evidence:${source.source_key}`);
      const baseNode = source.node;
      distilledNodes.push({
        id: evidenceNodeId,
        scope: args.scope,
        type: "evidence",
        tier: baseNode?.tier ?? "hot",
        memory_lane: baseNode?.memory_lane ?? args.fallback_memory_lane,
        producer_agent_id: baseNode?.producer_agent_id ?? args.fallback_producer_agent_id,
        owner_agent_id: baseNode?.owner_agent_id ?? args.fallback_owner_agent_id,
        owner_team_id: baseNode?.owner_team_id ?? args.fallback_owner_team_id,
        title: source.title ? `Distilled: ${normalizeSnippet(source.title, 72)}` : "Distilled evidence",
        text_summary: evidenceSummary,
        slots: {
          compression_layer: "L1",
          summary_kind: "write_distillation_evidence",
          distillation_kind: "write_distilled_evidence",
          source_kind: source.source_kind,
          source_sha256: sha256Hex(source.text),
          source_node_id: source.node?.id ?? null,
          source_client_id: source.node?.client_id ?? null,
          source_excerpt: normalizeSnippet(source.text, 180),
        },
        raw_ref: source.node?.raw_ref,
        evidence_ref: source.node?.evidence_ref,
        salience: Math.max(0.6, Number(source.node?.salience ?? 0.7)),
        importance: Math.max(0.55, Number(source.node?.importance ?? 0.6)),
        confidence: Math.max(0.65, Number(source.node?.confidence ?? 0.75)),
      });
      evidenceCount += 1;

      if (args.config.attach_edges && source.node?.id) {
        distilledEdges.push({
          id: stableUuid(`${args.scope}:distill:edge:evidence:${evidenceNodeId}:${source.node.id}`),
          scope: args.scope,
          type: "derived_from",
          src_id: evidenceNodeId,
          dst_id: source.node.id,
          weight: 0.95,
          confidence: 0.8,
          decay_rate: 0.01,
        });
      }
    }

    const remainingFacts = Math.max(0, args.config.max_fact_nodes - factCount);
    if (remainingFacts <= 0) continue;
    const facts = extractFactCandidates(source.text, args.config.min_sentence_chars, remainingFacts);
    for (const fact of facts) {
      const factNodeId = stableUuid(`${args.scope}:distill:fact:${source.source_key}:${fact.title}:${fact.summary}`);
      const baseNode = source.node;
      distilledNodes.push({
        id: factNodeId,
        scope: args.scope,
        type: "concept",
        tier: "warm",
        memory_lane: baseNode?.memory_lane ?? args.fallback_memory_lane,
        producer_agent_id: baseNode?.producer_agent_id ?? args.fallback_producer_agent_id,
        owner_agent_id: baseNode?.owner_agent_id ?? args.fallback_owner_agent_id,
        owner_team_id: baseNode?.owner_team_id ?? args.fallback_owner_team_id,
        title: fact.title,
        text_summary: fact.summary,
        slots: {
          compression_layer: "L1",
          summary_kind: "write_distillation_fact",
          distillation_kind: "write_distilled_fact",
          extraction_pattern: fact.extraction_pattern,
          source_kind: source.source_kind,
          source_sha256: sha256Hex(source.text),
          source_node_id: source.node?.id ?? null,
          source_client_id: source.node?.client_id ?? null,
          source_excerpt: fact.source_excerpt,
          source_evidence_node_id: evidenceNodeId,
        },
        salience: Math.max(0.55, Number(baseNode?.salience ?? 0.65)),
        importance: Math.max(0.55, Number(baseNode?.importance ?? 0.65)),
        confidence: Math.max(0.65, Number(baseNode?.confidence ?? 0.7)),
      });
      factCount += 1;

      if (args.config.attach_edges) {
        const targetId = evidenceNodeId ?? source.node?.id ?? null;
        if (targetId) {
          distilledEdges.push({
            id: stableUuid(`${args.scope}:distill:edge:fact:${factNodeId}:${targetId}`),
            scope: args.scope,
            type: "derived_from",
            src_id: factNodeId,
            dst_id: targetId,
            weight: 0.9,
            confidence: 0.75,
            decay_rate: 0.01,
          });
        }
      }
      if (factCount >= args.config.max_fact_nodes) break;
    }
  }

  return {
    nodes: distilledNodes,
    edges: distilledEdges,
    summary: {
      enabled: true,
      sources_considered: sources.length,
      source_kinds: args.config.sources,
      generated_evidence_nodes: evidenceCount,
      generated_fact_nodes: factCount,
      generated_edges: distilledEdges.length,
    },
  };
}
