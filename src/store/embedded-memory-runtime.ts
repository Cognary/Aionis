import { promises as fs } from "node:fs";
import { dirname } from "node:path";
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
  type RecallStoreCapabilities,
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

type EmbeddedSnapshotV1 = {
  version: 1;
  nodes: EmbeddedNodeRecord[];
  edges: EmbeddedEdgeRecord[];
  rule_defs: EmbeddedRuleDefRecord[];
  audit: EmbeddedAuditRow[];
};

type EmbeddedRuntimeOptions = {
  snapshotPath?: string | null;
  autoPersist?: boolean;
  snapshotMaxBytes?: number;
  snapshotMaxBackups?: number;
  snapshotStrictMaxBytes?: boolean;
  snapshotCompactionEnabled?: boolean;
  snapshotCompactionMaxRounds?: number;
  recallDebugEmbeddingsEnabled?: boolean;
  recallAuditInsertEnabled?: boolean;
};

type EmbeddedSnapshotCompactionReport = {
  applied: boolean;
  rounds: number;
  trimmed_payload_nodes: number;
  dropped_audit: number;
  dropped_nodes: number;
  dropped_edges: number;
  dropped_rule_defs: number;
};

export type EmbeddedSnapshotMetrics = {
  persist_total: number;
  persist_failures_total: number;
  load_quarantined_total: number;
  last_persist_at: string | null;
  last_error: string | null;
  last_bytes_before_compaction: number | null;
  last_bytes_after_compaction: number | null;
  last_over_limit_after_compaction: boolean;
  last_compaction: EmbeddedSnapshotCompactionReport;
  runtime_nodes: number;
  runtime_edges: number;
  runtime_rule_defs: number;
  runtime_audit_rows: number;
};

type EmbeddedSnapshotMetricsState = Omit<
  EmbeddedSnapshotMetrics,
  "runtime_nodes" | "runtime_edges" | "runtime_rule_defs" | "runtime_audit_rows"
>;

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

function compactionTierWeight(tier: EmbeddedNodeRecord["tier"]): number {
  if (tier === "hot") return 3;
  if (tier === "warm") return 2;
  if (tier === "cold") return 1;
  return 0;
}

function nodeCompactionScore(node: EmbeddedNodeRecord): number {
  const tier = compactionTierWeight(node.tier) * 10;
  const typeBias = node.type === "rule" ? 8 : 0;
  const quality = Number(node.salience ?? 0) + Number(node.importance ?? 0) + Number(node.confidence ?? 0);
  const updated = Date.parse(node.updated_at);
  const recency = Number.isFinite(updated) ? updated / 8.64e10 : 0; // days scale
  return tier + typeBias + quality + recency;
}

function edgeCompactionScore(edge: EmbeddedEdgeRecord): number {
  const quality = Number(edge.weight ?? 0) + Number(edge.confidence ?? 0);
  const created = Date.parse(edge.created_at);
  const recency = Number.isFinite(created) ? created / 8.64e10 : 0;
  return quality + recency;
}

export class EmbeddedMemoryRuntime {
  private readonly nodes = new Map<string, EmbeddedNodeRecord>();
  private readonly edgesByUnique = new Map<string, EmbeddedEdgeRecord>();
  private readonly ruleDefs = new Map<string, EmbeddedRuleDefRecord>();
  private readonly audit: EmbeddedAuditRow[] = [];
  private readonly recallAccess: RecallStoreAccess;
  private readonly snapshotPath: string | null;
  private readonly autoPersist: boolean;
  private readonly snapshotMaxBytes: number;
  private readonly snapshotMaxBackups: number;
  private readonly snapshotStrictMaxBytes: boolean;
  private readonly snapshotCompactionEnabled: boolean;
  private readonly snapshotCompactionMaxRounds: number;
  private readonly recallCapabilities: RecallStoreCapabilities;
  private readonly snapshotMetrics: EmbeddedSnapshotMetricsState;

  constructor(opts: EmbeddedRuntimeOptions = {}) {
    this.snapshotPath = opts.snapshotPath?.trim() ? opts.snapshotPath.trim() : null;
    this.autoPersist = opts.autoPersist ?? true;
    this.snapshotMaxBytes = Number.isFinite(opts.snapshotMaxBytes as number) ? Math.max(1, Math.trunc(opts.snapshotMaxBytes as number)) : 50 * 1024 * 1024;
    this.snapshotMaxBackups = Number.isFinite(opts.snapshotMaxBackups as number) ? Math.max(0, Math.trunc(opts.snapshotMaxBackups as number)) : 3;
    this.snapshotStrictMaxBytes = opts.snapshotStrictMaxBytes ?? false;
    this.snapshotCompactionEnabled = opts.snapshotCompactionEnabled ?? true;
    this.snapshotCompactionMaxRounds = Number.isFinite(opts.snapshotCompactionMaxRounds as number)
      ? Math.max(1, Math.trunc(opts.snapshotCompactionMaxRounds as number))
      : 8;
    this.recallCapabilities = {
      debug_embeddings: opts.recallDebugEmbeddingsEnabled ?? false,
      audit_insert: opts.recallAuditInsertEnabled ?? true,
    };
    this.snapshotMetrics = {
      persist_total: 0,
      persist_failures_total: 0,
      load_quarantined_total: 0,
      last_persist_at: null,
      last_error: null,
      last_bytes_before_compaction: null,
      last_bytes_after_compaction: null,
      last_over_limit_after_compaction: false,
      last_compaction: {
        applied: false,
        rounds: 0,
        trimmed_payload_nodes: 0,
        dropped_audit: 0,
        dropped_nodes: 0,
        dropped_edges: 0,
        dropped_rule_defs: 0,
      },
    };
    this.recallAccess = {
      capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION,
      capabilities: this.recallCapabilities,
      stage1CandidatesAnn: async (params) => this.stage1Candidates(params),
      stage1CandidatesExactFallback: async (params) => this.stage1Candidates(params),
      stage2Edges: async (params) => this.stage2Edges(params),
      stage2Nodes: async (params) => this.stage2Nodes(params),
      ruleDefs: async (scope, ruleIds) => this.getRuleDefs(scope, ruleIds),
      debugEmbeddings: async (scope, ids) => this.debugEmbeddings(scope, ids),
      insertRecallAudit: async (params) => {
        if (!this.recallCapabilities.audit_insert) {
          throw new Error("recall capability unsupported: audit_insert");
        }
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

  getSnapshotMetrics(): EmbeddedSnapshotMetrics {
    return {
      ...this.snapshotMetrics,
      last_compaction: { ...this.snapshotMetrics.last_compaction },
      runtime_nodes: this.nodes.size,
      runtime_edges: this.edgesByUnique.size,
      runtime_rule_defs: this.ruleDefs.size,
      runtime_audit_rows: this.audit.length,
    };
  }

  async applyWrite(prepared: EmbeddedWritePrepared, out: EmbeddedWriteResult): Promise<void> {
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
    if (this.autoPersist) await this.persistSnapshot();
  }

  async loadSnapshot(): Promise<void> {
    if (!this.snapshotPath) return;
    let raw: string;
    try {
      raw = await fs.readFile(this.snapshotPath, "utf8");
    } catch (err: any) {
      if (err?.code === "ENOENT") return;
      throw err;
    }

    let parsed: EmbeddedSnapshotV1;
    try {
      parsed = JSON.parse(raw) as EmbeddedSnapshotV1;
    } catch {
      await this.quarantineCorruptSnapshot();
      return;
    }
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges) || !Array.isArray(parsed.rule_defs)) {
      await this.quarantineCorruptSnapshot();
      return;
    }

    this.nodes.clear();
    this.edgesByUnique.clear();
    this.ruleDefs.clear();
    this.audit.splice(0, this.audit.length);

    for (const n of parsed.nodes) this.nodes.set(nodeKey(n.scope, n.id), n);
    for (const e of parsed.edges) this.edgesByUnique.set(edgeUpsertKey(e.scope, e.type, e.src_id, e.dst_id), e);
    for (const r of parsed.rule_defs) this.ruleDefs.set(nodeKey(r.scope, r.rule_node_id), r);
    if (Array.isArray(parsed.audit)) {
      for (const a of parsed.audit.slice(-5000)) this.audit.push(a);
    }
  }

  async persistSnapshot(): Promise<void> {
    if (!this.snapshotPath) return;
    this.snapshotMetrics.persist_total += 1;
    let bytesBefore = 0;
    let bytesAfter = 0;
    let report: EmbeddedSnapshotCompactionReport = {
      applied: false,
      rounds: 0,
      trimmed_payload_nodes: 0,
      dropped_audit: 0,
      dropped_nodes: 0,
      dropped_edges: 0,
      dropped_rule_defs: 0,
    };

    try {
      const snapshot = this.buildSnapshot();
      bytesBefore = this.snapshotByteSize(snapshot);
      const compacted = this.compactSnapshot(snapshot, bytesBefore);
      bytesAfter = compacted.bytes;
      report = compacted.report;

      this.snapshotMetrics.last_bytes_before_compaction = bytesBefore;
      this.snapshotMetrics.last_bytes_after_compaction = bytesAfter;
      this.snapshotMetrics.last_over_limit_after_compaction = bytesAfter > this.snapshotMaxBytes;
      this.snapshotMetrics.last_compaction = { ...report };

      if (bytesAfter > this.snapshotMaxBytes && this.snapshotStrictMaxBytes) {
        throw new Error(`embedded snapshot exceeds max bytes: size=${bytesAfter} max=${this.snapshotMaxBytes}`);
      }

      const dir = dirname(this.snapshotPath);
      await fs.mkdir(dir, { recursive: true });
      await this.rotateSnapshotBackups();
      const tmp = `${this.snapshotPath}.tmp`;
      await fs.writeFile(tmp, compacted.body, "utf8");
      await fs.rename(tmp, this.snapshotPath);
      this.snapshotMetrics.last_persist_at = new Date().toISOString();
      this.snapshotMetrics.last_error = null;
    } catch (err: any) {
      this.snapshotMetrics.persist_failures_total += 1;
      this.snapshotMetrics.last_error = err?.message ? String(err.message) : String(err);
      if (bytesBefore > 0) this.snapshotMetrics.last_bytes_before_compaction = bytesBefore;
      if (bytesAfter > 0) this.snapshotMetrics.last_bytes_after_compaction = bytesAfter;
      this.snapshotMetrics.last_compaction = { ...report };
      throw err;
    }
  }

  private async quarantineCorruptSnapshot(): Promise<void> {
    if (!this.snapshotPath) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const out = `${this.snapshotPath}.corrupt.${ts}`;
    try {
      await fs.rename(this.snapshotPath, out);
      this.snapshotMetrics.load_quarantined_total += 1;
    } catch {
      // ignore quarantine failures; caller can still proceed with empty runtime state.
    }
  }

  private buildSnapshot(): EmbeddedSnapshotV1 {
    return {
      version: 1,
      nodes: Array.from(this.nodes.values()).map((n) => ({ ...n })),
      edges: Array.from(this.edgesByUnique.values()).map((e) => ({ ...e })),
      rule_defs: Array.from(this.ruleDefs.values()).map((r) => ({ ...r })),
      audit: this.audit.slice(-5000),
    };
  }

  private snapshotByteSize(snapshot: EmbeddedSnapshotV1): number {
    return Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  }

  private compactSnapshot(
    snapshot: EmbeddedSnapshotV1,
    bytesBefore: number,
  ): { body: string; bytes: number; report: EmbeddedSnapshotCompactionReport } {
    const report: EmbeddedSnapshotCompactionReport = {
      applied: false,
      rounds: 0,
      trimmed_payload_nodes: 0,
      dropped_audit: 0,
      dropped_nodes: 0,
      dropped_edges: 0,
      dropped_rule_defs: 0,
    };

    let bytes = bytesBefore;
    if (bytes <= this.snapshotMaxBytes) {
      return { body: JSON.stringify(snapshot), bytes, report };
    }

    report.applied = true;

    if (snapshot.audit.length > 200) {
      const nextAudit = snapshot.audit.slice(-200);
      report.dropped_audit += snapshot.audit.length - nextAudit.length;
      snapshot.audit = nextAudit;
      bytes = this.snapshotByteSize(snapshot);
    }
    if (bytes <= this.snapshotMaxBytes || !this.snapshotCompactionEnabled) {
      return { body: JSON.stringify(snapshot), bytes, report };
    }

    const payloadPasses: Array<Set<EmbeddedNodeRecord["tier"]>> = [new Set(["archive", "cold"]), new Set(["warm"]), new Set(["hot"])];
    for (const tiers of payloadPasses) {
      if (bytes <= this.snapshotMaxBytes) break;
      const changed = this.trimNodePayload(snapshot, tiers);
      if (changed > 0) {
        report.trimmed_payload_nodes += changed;
        bytes = this.snapshotByteSize(snapshot);
      }
    }
    if (bytes <= this.snapshotMaxBytes || this.snapshotStrictMaxBytes) {
      return { body: JSON.stringify(snapshot), bytes, report };
    }

    for (let i = 0; i < this.snapshotCompactionMaxRounds && bytes > this.snapshotMaxBytes; i++) {
      report.rounds += 1;
      const droppedEdges = this.pruneLowestValueEdges(snapshot, 0.2);
      report.dropped_edges += droppedEdges;
      bytes = this.snapshotByteSize(snapshot);
      if (bytes <= this.snapshotMaxBytes) break;

      const dropped = this.pruneLowestValueNodes(snapshot, 0.1);
      report.dropped_nodes += dropped.nodes;
      report.dropped_edges += dropped.edges;
      report.dropped_rule_defs += dropped.rule_defs;
      bytes = this.snapshotByteSize(snapshot);

      if (droppedEdges === 0 && dropped.nodes === 0) break;
    }

    return { body: JSON.stringify(snapshot), bytes, report };
  }

  private trimNodePayload(snapshot: EmbeddedSnapshotV1, tiers: Set<EmbeddedNodeRecord["tier"]>): number {
    let changed = 0;
    snapshot.nodes = snapshot.nodes.map((node) => {
      if (!tiers.has(node.tier)) return node;
      if (node.type === "rule") return node;
      const nextSummary =
        typeof node.text_summary === "string" && node.text_summary.length > 384 ? `${node.text_summary.slice(0, 381)}...` : node.text_summary;
      const hasSlots = node.slots && Object.keys(node.slots).length > 0;
      const willChange = hasSlots || !!node.raw_ref || !!node.evidence_ref || nextSummary !== node.text_summary;
      if (!willChange) return node;
      changed += 1;
      return {
        ...node,
        slots: {},
        raw_ref: null,
        evidence_ref: null,
        text_summary: nextSummary ?? null,
      };
    });
    return changed;
  }

  private pruneLowestValueEdges(snapshot: EmbeddedSnapshotV1, ratio: number): number {
    if (snapshot.edges.length === 0) return 0;
    const drop = Math.max(1, Math.ceil(snapshot.edges.length * ratio));
    const ranked = [...snapshot.edges].sort((a, b) => edgeCompactionScore(a) - edgeCompactionScore(b) || a.id.localeCompare(b.id));
    const dropKeys = new Set(
      ranked.slice(0, drop).map((e) => edgeUpsertKey(e.scope, e.type, e.src_id, e.dst_id)),
    );
    const before = snapshot.edges.length;
    snapshot.edges = snapshot.edges.filter((e) => !dropKeys.has(edgeUpsertKey(e.scope, e.type, e.src_id, e.dst_id)));
    return before - snapshot.edges.length;
  }

  private pruneLowestValueNodes(snapshot: EmbeddedSnapshotV1, ratio: number): { nodes: number; edges: number; rule_defs: number } {
    if (snapshot.nodes.length === 0) return { nodes: 0, edges: 0, rule_defs: 0 };
    const drop = Math.max(1, Math.ceil(snapshot.nodes.length * ratio));
    const ranked = [...snapshot.nodes].sort((a, b) => nodeCompactionScore(a) - nodeCompactionScore(b) || a.id.localeCompare(b.id));
    const dropNodeKeys = new Set(ranked.slice(0, drop).map((n) => nodeKey(n.scope, n.id)));

    const beforeNodes = snapshot.nodes.length;
    const beforeEdges = snapshot.edges.length;
    const beforeRuleDefs = snapshot.rule_defs.length;

    snapshot.nodes = snapshot.nodes.filter((n) => !dropNodeKeys.has(nodeKey(n.scope, n.id)));
    snapshot.edges = snapshot.edges.filter(
      (e) => !dropNodeKeys.has(nodeKey(e.scope, e.src_id)) && !dropNodeKeys.has(nodeKey(e.scope, e.dst_id)),
    );
    snapshot.rule_defs = snapshot.rule_defs.filter((r) => !dropNodeKeys.has(nodeKey(r.scope, r.rule_node_id)));

    return {
      nodes: beforeNodes - snapshot.nodes.length,
      edges: beforeEdges - snapshot.edges.length,
      rule_defs: beforeRuleDefs - snapshot.rule_defs.length,
    };
  }

  private async rotateSnapshotBackups(): Promise<void> {
    if (!this.snapshotPath || this.snapshotMaxBackups <= 0) return;
    for (let i = this.snapshotMaxBackups; i >= 1; i--) {
      const src = i === 1 ? this.snapshotPath : `${this.snapshotPath}.${i - 1}`;
      const dst = `${this.snapshotPath}.${i}`;
      try {
        await fs.access(src);
      } catch {
        continue;
      }
      try {
        await fs.rm(dst, { force: true });
      } catch {
        // best effort
      }
      try {
        await fs.rename(src, dst);
      } catch {
        // ignore rotation errors; persistence will still try to write latest snapshot.
      }
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
    if (!this.recallCapabilities.debug_embeddings) {
      throw new Error("recall capability unsupported: debug_embeddings");
    }
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

export function createEmbeddedMemoryRuntime(opts: EmbeddedRuntimeOptions = {}): EmbeddedMemoryRuntime {
  return new EmbeddedMemoryRuntime(opts);
}
