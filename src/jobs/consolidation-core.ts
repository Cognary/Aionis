import type pg from "pg";
import { normalizeText } from "../util/normalize.js";
import { toVectorLiteral } from "../util/pgvector.js";

export type ConsolidationNodeType = "topic" | "concept" | "entity" | "procedure" | "self_model";

type NodeRow = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  salience: number;
  confidence: number;
  commit_id: string | null;
  created_at: string;
  updated_at: string;
  embedding_text: string;
};

type NeighborRow = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  salience: number;
  confidence: number;
  commit_id: string | null;
  created_at: string;
  updated_at: string;
  vector_similarity: number;
};

export type ConsolidationSuggestion = {
  pair_key: string;
  type: string;
  score: number;
  vector_similarity: number;
  lexical_similarity: number;
  canonical_id: string;
  duplicate_id: string;
  canonical: {
    id: string;
    title: string | null;
    summary: string | null;
    salience: number;
    confidence: number;
    created_at: string;
    commit_id: string | null;
  };
  duplicate: {
    id: string;
    title: string | null;
    summary: string | null;
    salience: number;
    confidence: number;
    created_at: string;
    commit_id: string | null;
  };
  evidence: {
    shared_tokens: string[];
    reasons: string[];
  };
  conflict: {
    detected: boolean;
    kind: "none" | "polarity_opposition" | "negation_mismatch";
    score: number;
    reasons: string[];
    shared_content_tokens: string[];
  };
};

export type ConsolidationMergeCandidateV1 = {
  protocol_version: "consolidation_candidate_v1";
  pair_key: string;
  node_type: string;
  pair: {
    canonical_id: string;
    duplicate_id: string;
  };
  evidence: {
    score: number;
    vector_similarity: number;
    lexical_similarity: number;
    shared_tokens: string[];
    reasons: string[];
    conflict: {
      detected: boolean;
      kind: "none" | "polarity_opposition" | "negation_mismatch";
      score: number;
      reasons: string[];
      shared_content_tokens: string[];
    };
  };
};

export type ConsolidationScanParams = {
  scope: string;
  types: ConsolidationNodeType[];
  max_anchors: number;
  neighbors_per_node: number;
  min_vector_similarity: number;
  min_score: number;
  max_pairs: number;
  include_summary: boolean;
  conflict_min_shared_tokens?: number;
  conflict_negation_lexical_min?: number;
};

export type ConsolidationScanResult = {
  anchors_scanned: number;
  neighbors_examined: number;
  pair_candidates: number;
  suggestions: ConsolidationSuggestion[];
};

export function toMergeCandidateV1(s: ConsolidationSuggestion): ConsolidationMergeCandidateV1 {
  return {
    protocol_version: "consolidation_candidate_v1",
    pair_key: s.pair_key,
    node_type: s.type,
    pair: {
      canonical_id: s.canonical_id,
      duplicate_id: s.duplicate_id,
    },
    evidence: {
      score: s.score,
      vector_similarity: s.vector_similarity,
      lexical_similarity: s.lexical_similarity,
      shared_tokens: s.evidence.shared_tokens,
      reasons: s.evidence.reasons,
      conflict: {
        detected: s.conflict.detected,
        kind: s.conflict.kind,
        score: s.conflict.score,
        reasons: s.conflict.reasons,
        shared_content_tokens: s.conflict.shared_content_tokens,
      },
    },
  };
}

export function parseTypes(input: string | null): ConsolidationNodeType[] {
  const allowed = new Set<ConsolidationNodeType>(["topic", "concept", "entity", "procedure", "self_model"]);
  const raw = (input ?? "topic,concept,entity")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const out = Array.from(new Set(raw.filter((x): x is ConsolidationNodeType => allowed.has(x as ConsolidationNodeType))));
  if (out.length === 0) return ["topic", "concept", "entity"];
  return out;
}

function parseVectorText(v: string): number[] {
  const s = v.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) throw new Error("unexpected vector text");
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return body.split(",").map((x) => Number(x));
}

function textForTokens(n: { title: string | null; text_summary: string | null }): string {
  const t = normalizeText([n.title ?? "", n.text_summary ?? ""].join(" "), 1200).toLowerCase();
  return t;
}

function tokensOf(text: string): Set<string> {
  const parts = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (const p of parts) {
    if (p.length < 2) continue;
    out.add(p);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function sharedTokens(a: Set<string>, b: Set<string>, max = 8): string[] {
  const out: string[] = [];
  for (const t of a) {
    if (!b.has(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

const POSITIVE_POLARITY = new Set([
  "allow",
  "allowed",
  "enable",
  "enabled",
  "include",
  "included",
  "with",
  "required",
  "must",
  "always",
  "true",
  "public",
  "sync",
  "accept",
  "accepted",
  "open",
]);

const NEGATIVE_POLARITY = new Set([
  "deny",
  "denied",
  "disable",
  "disabled",
  "exclude",
  "excluded",
  "without",
  "optional",
  "never",
  "false",
  "private",
  "async",
  "reject",
  "rejected",
  "close",
  "closed",
  "ban",
  "blocked",
  "forbid",
  "forbidden",
]);

const NEGATION_TOKENS = new Set([
  "no",
  "not",
  "never",
  "without",
  "none",
  "cannot",
  "cant",
  "wont",
  "dont",
  "isnt",
  "arent",
  "disable",
  "disabled",
  "deny",
  "denied",
  "exclude",
  "excluded",
]);

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "and",
  "or",
  "is",
  "are",
  "be",
  "this",
  "that",
  "these",
  "those",
  "it",
  "as",
  "from",
]);

function intersectSorted(a: Set<string>, b: Set<string>, max = 8): string[] {
  const out: string[] = [];
  const arr = Array.from(a).sort();
  for (const t of arr) {
    if (!b.has(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function filterContentTokens(tokens: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    if (POSITIVE_POLARITY.has(t)) continue;
    if (NEGATIVE_POLARITY.has(t)) continue;
    if (NEGATION_TOKENS.has(t)) continue;
    out.add(t);
  }
  return out;
}

function hasAny(tokens: Set<string>, lex: Set<string>): boolean {
  for (const t of lex) {
    if (tokens.has(t)) return true;
  }
  return false;
}

function assessConflict(
  aTokens: Set<string>,
  bTokens: Set<string>,
  lexicalSimilarity: number,
  minSharedTokens: number,
  negationLexicalMin: number,
) {
  const contentA = filterContentTokens(aTokens);
  const contentB = filterContentTokens(bTokens);
  const sharedContent = intersectSorted(contentA, contentB, 8);
  const hasPosA = hasAny(aTokens, POSITIVE_POLARITY);
  const hasPosB = hasAny(bTokens, POSITIVE_POLARITY);
  const hasNegA = hasAny(aTokens, NEGATIVE_POLARITY);
  const hasNegB = hasAny(bTokens, NEGATIVE_POLARITY);
  const hasNegationA = hasAny(aTokens, NEGATION_TOKENS);
  const hasNegationB = hasAny(bTokens, NEGATION_TOKENS);

  const polarityOpposition = (hasPosA && (hasNegB || hasNegationB)) || (hasPosB && (hasNegA || hasNegationA));
  if (polarityOpposition && sharedContent.length >= minSharedTokens) {
    return {
      detected: true,
      kind: "polarity_opposition" as const,
      score: 1,
      reasons: [
        "polarity opposition detected across overlapping content tokens",
        `shared_content_tokens >= ${minSharedTokens}`,
      ],
      shared_content_tokens: sharedContent,
    };
  }

  const negationMismatch = hasNegationA !== hasNegationB;
  if (negationMismatch && sharedContent.length >= minSharedTokens && lexicalSimilarity >= negationLexicalMin) {
    return {
      detected: true,
      kind: "negation_mismatch" as const,
      score: 0.85,
      reasons: [
        "negation mismatch detected across overlapping content tokens",
        `lexical_similarity >= ${negationLexicalMin.toFixed(2)}`,
      ],
      shared_content_tokens: sharedContent,
    };
  }

  return {
    detected: false,
    kind: "none" as const,
    score: 0,
    reasons: [],
    shared_content_tokens: sharedContent,
  };
}

function canonicalOf(a: NodeRow | NeighborRow, b: NodeRow | NeighborRow): "a" | "b" {
  if (a.salience > b.salience) return "a";
  if (b.salience > a.salience) return "b";
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta < tb ? "a" : "b";
  return a.id < b.id ? "a" : "b";
}

export async function collectConsolidationCandidates(
  client: pg.PoolClient,
  params: ConsolidationScanParams,
): Promise<ConsolidationScanResult> {
  const conflictMinSharedTokens = Math.max(1, Math.trunc(params.conflict_min_shared_tokens ?? 1));
  const conflictNegationLexicalMin = Math.max(0, Math.min(1, params.conflict_negation_lexical_min ?? 0.5));
  const anchorsRes = await client.query<NodeRow>(
    `
    SELECT
      id,
      type::text AS type,
      title,
      text_summary,
      salience,
      confidence,
      commit_id::text AS commit_id,
      created_at::text AS created_at,
      updated_at::text AS updated_at,
      embedding::text AS embedding_text
    FROM memory_nodes
    WHERE scope = $1
      AND type::text = ANY($2::text[])
      AND tier IN ('hot', 'warm')
      AND embedding IS NOT NULL
      AND embedding_status = 'ready'
    ORDER BY updated_at DESC, id ASC
    LIMIT $3
    `,
    [params.scope, params.types, params.max_anchors],
  );

  const pairMap = new Map<string, ConsolidationSuggestion>();
  let neighborsExamined = 0;

  for (const anchor of anchorsRes.rows) {
    const vector = parseVectorText(anchor.embedding_text);
    const vectorLiteral = toVectorLiteral(vector);
    const aTokens = tokensOf(textForTokens(anchor));

    const nearRes = await client.query<NeighborRow>(
      `
      SELECT
        id,
        type::text AS type,
        title,
        text_summary,
        salience,
        confidence,
        commit_id::text AS commit_id,
        created_at::text AS created_at,
        updated_at::text AS updated_at,
        (1 - (embedding <=> $1::vector(1536))) AS vector_similarity
      FROM memory_nodes
      WHERE scope = $2
        AND type::text = $3
        AND id <> $4
        AND tier IN ('hot', 'warm')
        AND embedding IS NOT NULL
        AND embedding_status = 'ready'
      ORDER BY embedding <=> $1::vector(1536)
      LIMIT $5
      `,
      [vectorLiteral, params.scope, anchor.type, anchor.id, params.neighbors_per_node + 1],
    );

    for (const n of nearRes.rows) {
      neighborsExamined += 1;
      const vecSim = Number(n.vector_similarity ?? 0);
      if (vecSim < params.min_vector_similarity) continue;

      const bTokens = tokensOf(textForTokens(n));
      const lexSim = jaccard(aTokens, bTokens);
      const score = 0.8 * vecSim + 0.2 * lexSim;
      if (score < params.min_score) continue;
      const conflict = assessConflict(aTokens, bTokens, lexSim, conflictMinSharedTokens, conflictNegationLexicalMin);

      const lo = anchor.id < n.id ? anchor.id : n.id;
      const hi = anchor.id < n.id ? n.id : anchor.id;
      const key = `${lo}|${hi}|${anchor.type}`;
      const pick = canonicalOf(anchor, n);
      const canonical = pick === "a" ? anchor : n;
      const duplicate = pick === "a" ? n : anchor;

      const candidate: ConsolidationSuggestion = {
        pair_key: key,
        type: anchor.type,
        score: Number(score.toFixed(6)),
        vector_similarity: Number(vecSim.toFixed(6)),
        lexical_similarity: Number(lexSim.toFixed(6)),
        canonical_id: canonical.id,
        duplicate_id: duplicate.id,
        canonical: {
          id: canonical.id,
          title: canonical.title,
          summary: params.include_summary ? canonical.text_summary : null,
          salience: canonical.salience,
          confidence: canonical.confidence,
          created_at: canonical.created_at,
          commit_id: canonical.commit_id,
        },
        duplicate: {
          id: duplicate.id,
          title: duplicate.title,
          summary: params.include_summary ? duplicate.text_summary : null,
          salience: duplicate.salience,
          confidence: duplicate.confidence,
          created_at: duplicate.created_at,
          commit_id: duplicate.commit_id,
        },
        evidence: {
          shared_tokens: sharedTokens(aTokens, bTokens, 8),
          reasons: [
            `vector_similarity=${vecSim.toFixed(4)} >= ${params.min_vector_similarity.toFixed(4)}`,
            `score=${score.toFixed(4)} >= ${params.min_score.toFixed(4)}`,
            ...(conflict.detected ? [`conflict_detected=${conflict.kind}`] : []),
            "shadow_mode_only",
          ],
        },
        conflict,
      };

      const prev = pairMap.get(key);
      if (
        !prev ||
        candidate.score > prev.score ||
        (candidate.score === prev.score && prev.conflict.detected && !candidate.conflict.detected)
      ) {
        pairMap.set(key, candidate);
      }
    }
  }

  const suggestions = Array.from(pairMap.values())
    .sort((a, b) => b.score - a.score || b.vector_similarity - a.vector_similarity || a.pair_key.localeCompare(b.pair_key))
    .slice(0, params.max_pairs);

  return {
    anchors_scanned: Number(anchorsRes.rowCount ?? 0),
    neighbors_examined: neighborsExamined,
    pair_candidates: pairMap.size,
    suggestions,
  };
}
