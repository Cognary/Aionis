import {
  RECALL_STORE_ACCESS_CAPABILITY_VERSION,
  type RecallCandidate,
  type RecallDebugEmbeddingRow,
  type RecallEdgeRow,
  type RecallNodeRow,
  type RecallRuleDefRow,
  type RecallStage1Params,
  type RecallStage2EdgesParams,
  type RecallStage2NodesParams,
  type RecallStoreAccess,
} from "./recall-access.js";
import { toVectorLiteral } from "../util/pgvector.js";

type EmbeddedNodeInput = {
  id: string;
  scope: string;
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
  embedding?: number[];
  embedding_model?: string;
  salience?: number;
  importance?: number;
  confidence?: number;
};

type EmbeddedEdgeInput = {
  id: string;
  scope: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight?: number;
  confidence?: number;
  decay_rate?: number;
};

type EmbeddedWritePrepared = {
  scope: string;
  auto_embed_effective: boolean;
  nodes: EmbeddedNodeInput[];
  edges: EmbeddedEdgeInput[];
};

type EmbeddedWriteResult = {
  commit_id: string;
  commit_hash: string;
};

type EmbeddedNodeRecord = {
  id: string;
  scope: string;
  type: string;
  tier: "hot" | "warm" | "cold" | "archive";
  memory_lane: "private" | "shared";
  producer_agent_id: string | null;
  owner_agent_id: string | null;
  owner_team_id: string | null;
  title: string | null;
  text_summary: string | null;
  slots: Record<string, unknown>;
  raw_ref: string | null;
  evidence_ref: string | null;
  embedding: number[] | null;
  embedding_model: string | null;
  embedding_status: "pending" | "ready" | "failed";
  salience: number;
  importance: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
};

type EmbeddedEdgeRecord = {
  id: string;
  scope: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight: number;
  confidence: number;
  decay_rate: number;
  created_at: string;
  commit_id: string | null;
};

type EmbeddedRuleDefRecord = {
  scope: string;
  rule_node_id: string;
  state: "draft" | "shadow" | "active";
  rule_scope: "global" | "agent" | "team";
  target_agent_id: string | null;
  target_team_id: string | null;
  if_json: any;
  then_json: any;
  exceptions_json: any;
  positive_count: number;
  negative_count: number;
};

type EmbeddedAuditRow = {
  scope: string;
  endpoint: "recall" | "recall_text";
  consumerAgentId: string | null;
  consumerTeamId: string | null;
  querySha256: string;
  seedCount: number;
  nodeCount: number;
  edgeCount: number;
  created_at: string;
};

function nodeKey(scope: string, id: string): string {
  return `${scope}::${id}`;
}

function edgeUpsertKey(scope: string, type: string, src: string, dst: string): string {
  return `${scope}::${type}::${src}::${dst}`;
}

function cosineDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na <= 0 || nb <= 0) return 1;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return 1 - Math.max(-1, Math.min(1, sim));
}

function candidateVisible(n: EmbeddedNodeRecord, consumerAgentId: string | null, consumerTeamId: string | null): boolean {
  if (n.memory_lane === "shared") return true;
  if (consumerAgentId && n.owner_agent_id === consumerAgentId) return true;
  if (consumerTeamId && n.owner_team_id === consumerTeamId) return true;
  return false;
}

function edgeSortDesc(a: EmbeddedEdgeRecord, b: EmbeddedEdgeRecord): number {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.id.localeCompare(b.id);
}

function edgeToRecallRow(e: EmbeddedEdgeRecord): RecallEdgeRow {
  return {
    id: e.id,
    scope: e.scope,
    type: e.type,
    src_id: e.src_id,
    dst_id: e.dst_id,
    weight: e.weight,
    confidence: e.confidence,
    decay_rate: e.decay_rate,
    last_activated: null,
    created_at: e.created_at,
    commit_id: e.commit_id,
  };
}

export class EmbeddedMemoryRuntime {
  private readonly nodes = new Map<string, EmbeddedNodeRecord>();
  private readonly edgesByUnique = new Map<string, EmbeddedEdgeRecord>();
  private readonly ruleDefs = new Map<string, EmbeddedRuleDefRecord>();
  private readonly audit: EmbeddedAuditRow[] = [];
  private readonly recallAccess: RecallStoreAccess;

  constructor() {
    this.recallAccess = {
      capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION,
      stage1CandidatesAnn: async (params) => this.stage1Candidates(params),
      stage1CandidatesExactFallback: async (params) => this.stage1Candidates(params),
      stage2Edges: async (params) => this.stage2Edges(params),
      stage2Nodes: async (params) => this.stage2Nodes(params),
      ruleDefs: async (scope, ruleIds) => this.getRuleDefs(scope, ruleIds),
      debugEmbeddings: async (scope, ids) => this.debugEmbeddings(scope, ids),
      insertRecallAudit: async (params) => {
        this.audit.push({
          ...params,
          created_at: new Date().toISOString(),
        });
        if (this.audit.length > 5000) this.audit.splice(0, this.audit.length - 5000);
      },
    };
  }

  createRecallAccess(): RecallStoreAccess {
    return this.recallAccess;
  }

  applyWrite(prepared: EmbeddedWritePrepared, out: EmbeddedWriteResult): void {
    const now = new Date().toISOString();

    for (const n of prepared.nodes) {
      const key = nodeKey(n.scope, n.id);
      if (this.nodes.has(key)) continue; // mirror INSERT ... ON CONFLICT DO NOTHING

      const embedPlanned = prepared.auto_embed_effective && !n.embedding;
      const embeddingStatus: "pending" | "ready" | "failed" = n.embedding ? "ready" : embedPlanned ? "pending" : "failed";
      const embeddingModel = n.embedding ? (n.embedding_model?.trim() ? n.embedding_model.trim() : "client") : null;

      const record: EmbeddedNodeRecord = {
        id: n.id,
        scope: n.scope,
        type: n.type,
        tier: n.tier ?? "hot",
        memory_lane: n.memory_lane,
        producer_agent_id: n.producer_agent_id ?? null,
        owner_agent_id: n.owner_agent_id ?? null,
        owner_team_id: n.owner_team_id ?? null,
        title: n.title ?? null,
        text_summary: n.text_summary ?? null,
        slots: (n.slots ?? {}) as Record<string, unknown>,
        raw_ref: n.raw_ref ?? null,
        evidence_ref: n.evidence_ref ?? null,
        embedding: n.embedding ? n.embedding.slice() : null,
        embedding_model: embeddingModel,
        embedding_status: embeddingStatus,
        salience: n.salience ?? 0.5,
        importance: n.importance ?? 0.5,
        confidence: n.confidence ?? 0.5,
        created_at: now,
        updated_at: now,
        commit_id: out.commit_id,
      };
      this.nodes.set(key, record);

      if (n.type === "rule") {
        const slots = (n.slots ?? {}) as Record<string, unknown>;
        const scopeRaw = typeof slots["rule_scope"] === "string" ? String(slots["rule_scope"]).trim().toLowerCase() : "";
        const ruleScope: "global" | "agent" | "team" = scopeRaw === "agent" || scopeRaw === "team" ? scopeRaw : "global";
        const ruleKey = nodeKey(n.scope, n.id);
        if (!this.ruleDefs.has(ruleKey)) {
          this.ruleDefs.set(ruleKey, {
            scope: n.scope,
            rule_node_id: n.id,
            state: "draft",
            rule_scope: ruleScope,
            target_agent_id: typeof slots["target_agent_id"] === "string" ? String(slots["target_agent_id"]) : null,
            target_team_id: typeof slots["target_team_id"] === "string" ? String(slots["target_team_id"]) : null,
            if_json: slots["if"] ?? {},
            then_json: slots["then"] ?? {},
            exceptions_json: slots["exceptions"] ?? [],
            positive_count: 0,
            negative_count: 0,
          });
        }
      }
    }

    for (const e of prepared.edges) {
      const upsertKey = edgeUpsertKey(e.scope, e.type, e.src_id, e.dst_id);
      const existing = this.edgesByUnique.get(upsertKey);
      const next: EmbeddedEdgeRecord = {
        id: e.id,
        scope: e.scope,
        type: e.type,
        src_id: e.src_id,
        dst_id: e.dst_id,
        weight: existing ? Math.max(existing.weight, e.weight ?? 0.5) : (e.weight ?? 0.5),
        confidence: existing ? Math.max(existing.confidence, e.confidence ?? 0.5) : (e.confidence ?? 0.5),
        decay_rate: e.decay_rate ?? 0.01,
        created_at: existing?.created_at ?? now,
        commit_id: out.commit_id,
      };
      this.edgesByUnique.set(upsertKey, next);
    }
  }

  private async stage1Candidates(params: RecallStage1Params): Promise<RecallCandidate[]> {
    const pre: Array<{ n: EmbeddedNodeRecord; distance: number }> = [];
    for (const n of this.nodes.values()) {
      if (n.scope !== params.scope) continue;
      if (n.tier !== "hot" && n.tier !== "warm") continue;
      if (!n.embedding || n.embedding_status !== "ready") continue;
      if (!candidateVisible(n, params.consumerAgentId, params.consumerTeamId)) continue;
      pre.push({ n, distance: cosineDistance(n.embedding, params.queryEmbedding) });
    }

    pre.sort((a, b) => a.distance - b.distance || a.n.id.localeCompare(b.n.id));
    const knn = pre.slice(0, Math.max(0, params.oversample));
    const out: RecallCandidate[] = [];
    for (const item of knn) {
      const n = item.n;
      if (!["event", "topic", "concept", "entity", "rule"].includes(n.type)) continue;
      if (n.type === "topic") {
        const topicState = typeof n.slots?.["topic_state"] === "string" ? String(n.slots["topic_state"]) : "active";
        if (topicState !== "active") continue;
      }
      if (n.type === "rule") {
        const def = this.ruleDefs.get(nodeKey(n.scope, n.id));
        if (!def || (def.state !== "shadow" && def.state !== "active")) continue;
      }
      out.push({
        id: n.id,
        type: n.type,
        title: n.title,
        text_summary: n.text_summary,
        tier: n.tier,
        salience: n.salience,
        confidence: n.confidence,
        similarity: 1 - item.distance,
      });
      if (out.length >= params.limit) break;
    }
    return out;
  }

  private async stage2Edges(params: RecallStage2EdgesParams): Promise<RecallEdgeRow[]> {
    const allScopeEdges = Array.from(this.edgesByUnique.values()).filter(
      (e) => e.scope === params.scope && e.weight >= params.minEdgeWeight && e.confidence >= params.minEdgeConfidence,
    );

    const selectHop = (ids: Set<string>, budget: number): EmbeddedEdgeRecord[] => {
      const fromSrc = allScopeEdges.filter((e) => ids.has(e.src_id)).sort(edgeSortDesc).slice(0, budget);
      const fromDst = allScopeEdges.filter((e) => ids.has(e.dst_id)).sort(edgeSortDesc).slice(0, budget);
      const merged = new Map<string, EmbeddedEdgeRecord>();
      for (const e of fromSrc.concat(fromDst)) merged.set(e.id, e);
      return Array.from(merged.values()).sort(edgeSortDesc);
    };

    const seedSet = new Set(params.seedIds);
    if (params.neighborhoodHops === 1) {
      return selectHop(seedSet, params.hop1Budget).slice(0, params.edgeFetchBudget).map(edgeToRecallRow);
    }

    const hop1 = selectHop(seedSet, params.hop1Budget);
    const hopNodes = new Set<string>(params.seedIds);
    for (const e of hop1) {
      hopNodes.add(e.src_id);
      hopNodes.add(e.dst_id);
    }
    const hop2 = selectHop(hopNodes, params.hop2Budget).slice(0, params.edgeFetchBudget);
    return hop2.map(edgeToRecallRow);
  }

  private async stage2Nodes(params: RecallStage2NodesParams): Promise<RecallNodeRow[]> {
    const ids = new Set(params.nodeIds);
    const out: RecallNodeRow[] = [];
    for (const n of this.nodes.values()) {
      if (n.scope !== params.scope) continue;
      if (!ids.has(n.id)) continue;
      if (!candidateVisible(n, params.consumerAgentId, params.consumerTeamId)) continue;

      const topicState = n.type === "topic" ? (typeof n.slots?.["topic_state"] === "string" ? String(n.slots["topic_state"]) : "active") : null;
      const memberCount =
        n.type === "topic" && n.slots?.["member_count"] !== undefined && n.slots?.["member_count"] !== null
          ? Number(n.slots["member_count"])
          : null;
      out.push({
        id: n.id,
        scope: n.scope,
        type: n.type,
        tier: n.tier,
        memory_lane: n.memory_lane,
        producer_agent_id: n.producer_agent_id,
        owner_agent_id: n.owner_agent_id,
        owner_team_id: n.owner_team_id,
        title: n.title,
        text_summary: n.text_summary,
        slots: params.includeSlots ? n.slots : null,
        embedding_status: n.embedding_status,
        embedding_model: n.embedding_model,
        topic_state: topicState,
        member_count: Number.isFinite(memberCount as number) ? (memberCount as number) : null,
        raw_ref: n.raw_ref,
        evidence_ref: n.evidence_ref,
        salience: n.salience,
        importance: n.importance,
        confidence: n.confidence,
        last_activated: null,
        created_at: n.created_at,
        updated_at: n.updated_at,
        commit_id: n.commit_id,
      });
    }
    return out;
  }

  private async getRuleDefs(scope: string, ruleIds: string[]): Promise<RecallRuleDefRow[]> {
    const ids = new Set(ruleIds);
    const out: RecallRuleDefRow[] = [];
    for (const def of this.ruleDefs.values()) {
      if (def.scope !== scope) continue;
      if (!ids.has(def.rule_node_id)) continue;
      out.push({
        rule_node_id: def.rule_node_id,
        state: def.state,
        rule_scope: def.rule_scope,
        target_agent_id: def.target_agent_id,
        target_team_id: def.target_team_id,
        if_json: def.if_json,
        then_json: def.then_json,
        exceptions_json: def.exceptions_json,
        positive_count: def.positive_count,
        negative_count: def.negative_count,
      });
    }
    return out;
  }

  private async debugEmbeddings(scope: string, ids: string[]): Promise<RecallDebugEmbeddingRow[]> {
    const idSet = new Set(ids);
    const out: RecallDebugEmbeddingRow[] = [];
    for (const n of this.nodes.values()) {
      if (n.scope !== scope) continue;
      if (!idSet.has(n.id)) continue;
      if (!n.embedding) continue;
      out.push({
        id: n.id,
        embedding_text: toVectorLiteral(n.embedding),
      });
    }
    return out;
  }
}

export function createEmbeddedMemoryRuntime(): EmbeddedMemoryRuntime {
  return new EmbeddedMemoryRuntime();
}
