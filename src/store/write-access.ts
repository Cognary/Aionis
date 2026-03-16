import type pg from "pg";
import type {
  AssociationCandidateRecord,
  AssociativeCandidateStoreAccess,
  ListAssociationCandidatesForSourceArgs,
  MarkAssociationCandidatePromotedArgs,
  UpdateAssociationCandidateStatusArgs,
  UpsertAssociationCandidateArgs,
} from "../memory/associative-candidate-store.js";

export const WRITE_STORE_ACCESS_CAPABILITY_VERSION = 4 as const;

export type WriteCommitInsertArgs = {
  scope: string;
  parentCommitId: string | null;
  inputSha256: string;
  diffJson: string;
  actor: string;
  modelVersion: string | null;
  promptVersion: string | null;
  commitHash: string;
};

export type WriteNodeInsertArgs = {
  id: string;
  scope: string;
  clientId: string | null;
  type: string;
  tier: string;
  title: string | null;
  textSummary: string | null;
  slotsJson: string;
  rawRef: string | null;
  evidenceRef: string | null;
  embeddingVector: string | null;
  embeddingModel: string | null;
  memoryLane: "private" | "shared";
  producerAgentId: string | null;
  ownerAgentId: string | null;
  ownerTeamId: string | null;
  embeddingStatus: "pending" | "ready" | "failed";
  embeddingLastError: string | null;
  salience: number;
  importance: number;
  confidence: number;
  redactionVersion: number;
  commitId: string;
};

export type WriteRuleDefInsertArgs = {
  scope: string;
  ruleNodeId: string;
  ifJson: string;
  thenJson: string;
  exceptionsJson: string;
  ruleScope: "global" | "agent" | "team";
  targetAgentId: string | null;
  targetTeamId: string | null;
  commitId: string;
};

export type WriteEdgeUpsertArgs = {
  id: string;
  scope: string;
  type: string;
  srcId: string;
  dstId: string;
  weight: number;
  confidence: number;
  decayRate: number;
  commitId: string;
};

export type WriteOutboxInsertArgs = {
  scope: string;
  commitId: string;
  eventType: WriteOutboxEventType;
  jobKey: string;
  payloadSha256: string;
  payloadJson: string;
};

export type WriteOutboxEventType =
  | "embed_nodes"
  | "topic_cluster"
  | "replay_learning_projection"
  | "associative_link";

export type WriteShadowMirrorCopied = {
  commits: number;
  nodes: number;
  edges: number;
  outbox: number;
};

export type WriteStoreCapabilities = {
  shadow_mirror_v2: boolean;
};

type CreatePostgresWriteStoreAccessOptions = {
  capabilities?: Partial<WriteStoreCapabilities>;
};

export interface WriteStoreAccess extends AssociativeCandidateStoreAccess {
  readonly capability_version: typeof WRITE_STORE_ACCESS_CAPABILITY_VERSION;
  readonly capabilities: WriteStoreCapabilities;
  nodeScopesByIds(ids: string[]): Promise<Map<string, string>>;
  parentCommitHash(scope: string, parentCommitId: string): Promise<string | null>;
  insertCommit(args: WriteCommitInsertArgs): Promise<string>;
  insertNode(args: WriteNodeInsertArgs): Promise<void>;
  insertRuleDef(args: WriteRuleDefInsertArgs): Promise<void>;
  upsertEdge(args: WriteEdgeUpsertArgs): Promise<void>;
  readyEmbeddingNodeIds(scope: string, ids: string[]): Promise<Set<string>>;
  insertOutboxEvent(args: WriteOutboxInsertArgs): Promise<void>;
  appendAfterTopicClusterEventIds(scope: string, commitId: string, eventIdsJson: string): Promise<void>;
  mirrorCommitArtifactsToShadowV2(scope: string, commitId: string): Promise<WriteShadowMirrorCopied>;
}

function resolveWriteStoreCapabilities(partial?: Partial<WriteStoreCapabilities>): WriteStoreCapabilities {
  return {
    shadow_mirror_v2: partial?.shadow_mirror_v2 ?? true,
  };
}

export function createPostgresWriteStoreAccess(
  client: pg.PoolClient,
  opts: CreatePostgresWriteStoreAccessOptions = {},
): WriteStoreAccess {
  const capabilities = resolveWriteStoreCapabilities(opts.capabilities);
  return {
    capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
    capabilities,
    async nodeScopesByIds(ids: string[]): Promise<Map<string, string>> {
      if (ids.length === 0) return new Map();
      const out = await client.query<{ id: string; scope: string }>(
        "SELECT id, scope FROM memory_nodes WHERE id = ANY($1::uuid[])",
        [ids],
      );
      const scopes = new Map<string, string>();
      for (const row of out.rows) scopes.set(row.id, row.scope);
      return scopes;
    },

    async parentCommitHash(scope: string, parentCommitId: string): Promise<string | null> {
      const out = await client.query<{ commit_hash: string }>(
        "SELECT commit_hash FROM memory_commits WHERE id = $1 AND scope = $2",
        [parentCommitId, scope],
      );
      if (out.rowCount !== 1) return null;
      return out.rows[0].commit_hash;
    },

    async insertCommit(args: WriteCommitInsertArgs): Promise<string> {
      const out = await client.query<{ id: string }>(
        `INSERT INTO memory_commits
          (scope, parent_id, input_sha256, diff_json, actor, model_version, prompt_version, commit_hash)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
         RETURNING id`,
        [
          args.scope,
          args.parentCommitId,
          args.inputSha256,
          args.diffJson,
          args.actor,
          args.modelVersion,
          args.promptVersion,
          args.commitHash,
        ],
      );
      return out.rows[0].id;
    },

    async insertNode(args: WriteNodeInsertArgs): Promise<void> {
      await client.query(
        `INSERT INTO memory_nodes
          (id, scope, client_id, type, tier, title, text_summary, slots, raw_ref, evidence_ref, embedding, embedding_model,
           memory_lane, producer_agent_id, owner_agent_id, owner_team_id,
           embedding_status, embedding_attempts, embedding_last_error, embedding_last_attempt_at, embedding_ready_at,
           salience, importance, confidence, redaction_version, commit_id)
         VALUES
          ($1, $2, $3, $4::memory_node_type, $5::memory_tier, $6, $7, $8::jsonb, $9, $10, $11::vector(1536), $12,
           $13::memory_lane, $14, $15, $16,
           $17::memory_embedding_status, 0, $18, NULL, CASE WHEN $11 IS NOT NULL THEN now() ELSE NULL END,
           $19, $20, $21, $22, $23)
         ON CONFLICT (id) DO NOTHING`,
        [
          args.id,
          args.scope,
          args.clientId,
          args.type,
          args.tier,
          args.title,
          args.textSummary,
          args.slotsJson,
          args.rawRef,
          args.evidenceRef,
          args.embeddingVector,
          args.embeddingModel,
          args.memoryLane,
          args.producerAgentId,
          args.ownerAgentId,
          args.ownerTeamId,
          args.embeddingStatus,
          args.embeddingLastError,
          args.salience,
          args.importance,
          args.confidence,
          args.redactionVersion,
          args.commitId,
        ],
      );
    },

    async insertRuleDef(args: WriteRuleDefInsertArgs): Promise<void> {
      await client.query(
        `INSERT INTO memory_rule_defs
          (scope, rule_node_id, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, commit_id)
         VALUES ($1, $2, 'draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::memory_rule_scope, $7, $8, $9)
         ON CONFLICT (rule_node_id) DO NOTHING`,
        [
          args.scope,
          args.ruleNodeId,
          args.ifJson,
          args.thenJson,
          args.exceptionsJson,
          args.ruleScope,
          args.targetAgentId,
          args.targetTeamId,
          args.commitId,
        ],
      );
    },

    async upsertEdge(args: WriteEdgeUpsertArgs): Promise<void> {
      await client.query(
        `INSERT INTO memory_edges
          (id, scope, type, src_id, dst_id, weight, confidence, decay_rate, commit_id)
         VALUES
          ($1, $2, $3::memory_edge_type, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE SET
           weight = GREATEST(memory_edges.weight, EXCLUDED.weight),
           confidence = GREATEST(memory_edges.confidence, EXCLUDED.confidence),
           commit_id = EXCLUDED.commit_id,
           last_activated = now()`,
        [args.id, args.scope, args.type, args.srcId, args.dstId, args.weight, args.confidence, args.decayRate, args.commitId],
      );
    },

    async readyEmbeddingNodeIds(scope: string, ids: string[]): Promise<Set<string>> {
      if (ids.length === 0) return new Set();
      const out = await client.query<{ id: string }>(
        `
        SELECT id
        FROM memory_nodes
        WHERE scope = $1
          AND id = ANY($2::uuid[])
          AND embedding_status = 'ready'
          AND embedding IS NOT NULL
        `,
        [scope, ids],
      );
      return new Set(out.rows.map((row) => row.id));
    },

    async insertOutboxEvent(args: WriteOutboxInsertArgs): Promise<void> {
      await client.query(
        `INSERT INTO memory_outbox (scope, commit_id, event_type, job_key, payload_sha256, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (scope, event_type, job_key) DO NOTHING`,
        [args.scope, args.commitId, args.eventType, args.jobKey, args.payloadSha256, args.payloadJson],
      );
    },

    async upsertAssociationCandidates(args: UpsertAssociationCandidateArgs[]): Promise<void> {
      if (args.length === 0) return;
      for (const candidate of args) {
        await client.query(
          `INSERT INTO memory_association_candidates
            (scope, src_id, dst_id, relation_kind, status, score, confidence,
             feature_summary_json, evidence_json, source_commit_id, worker_run_id, promoted_edge_id)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
           ON CONFLICT (scope, src_id, dst_id, relation_kind) DO UPDATE SET
             status = CASE
               WHEN memory_association_candidates.status = 'promoted' AND EXCLUDED.status = 'shadow'
                 THEN memory_association_candidates.status
               ELSE EXCLUDED.status
             END,
             score = EXCLUDED.score,
             confidence = EXCLUDED.confidence,
             feature_summary_json = EXCLUDED.feature_summary_json,
             evidence_json = EXCLUDED.evidence_json,
             source_commit_id = EXCLUDED.source_commit_id,
             worker_run_id = EXCLUDED.worker_run_id,
             promoted_edge_id = CASE
               WHEN memory_association_candidates.status = 'promoted' AND EXCLUDED.status = 'shadow'
                 THEN memory_association_candidates.promoted_edge_id
               ELSE EXCLUDED.promoted_edge_id
             END,
             updated_at = now()`,
          [
            candidate.scope,
            candidate.src_id,
            candidate.dst_id,
            candidate.relation_kind,
            candidate.status,
            candidate.score,
            candidate.confidence,
            candidate.feature_summary_json,
            candidate.evidence_json,
            candidate.source_commit_id,
            candidate.worker_run_id,
            candidate.promoted_edge_id,
          ],
        );
      }
    },

    async listAssociationCandidatesForSource(
      args: ListAssociationCandidatesForSourceArgs,
    ): Promise<AssociationCandidateRecord[]> {
      const limit = Math.max(1, Math.min(200, Math.trunc(args.limit ?? 50)));
      const statusFilter = Array.isArray(args.statuses) && args.statuses.length > 0;
      const params: unknown[] = [args.scope, args.src_id];
      let sql = `
        SELECT
          id::text,
          scope,
          src_id::text,
          dst_id::text,
          relation_kind,
          status,
          score,
          confidence,
          feature_summary_json,
          evidence_json,
          source_commit_id::text,
          worker_run_id,
          promoted_edge_id::text,
          created_at::text,
          updated_at::text
        FROM memory_association_candidates
        WHERE scope = $1
          AND src_id = $2
      `;
      if (statusFilter) {
        params.push(args.statuses);
        sql += ` AND status = ANY($${params.length}::text[])`;
      }
      params.push(limit);
      sql += ` ORDER BY score DESC, confidence DESC, updated_at DESC LIMIT $${params.length}`;
      const out = await client.query<{
        id: string;
        scope: string;
        src_id: string;
        dst_id: string;
        relation_kind: AssociationCandidateRecord["relation_kind"];
        status: AssociationCandidateRecord["status"];
        score: number;
        confidence: number;
        feature_summary_json: Record<string, unknown> | null;
        evidence_json: Record<string, unknown> | null;
        source_commit_id: string | null;
        worker_run_id: string | null;
        promoted_edge_id: string | null;
        created_at: string;
        updated_at: string;
      }>(sql, params);
      return out.rows.map((row) => ({
        ...row,
        feature_summary_json: row.feature_summary_json ?? {},
        evidence_json: row.evidence_json ?? {},
      }));
    },

    async markAssociationCandidatePromoted(args: MarkAssociationCandidatePromotedArgs): Promise<void> {
      await client.query(
        `UPDATE memory_association_candidates
         SET status = 'promoted',
             promoted_edge_id = $5,
             updated_at = now()
         WHERE scope = $1
           AND src_id = $2
           AND dst_id = $3
           AND relation_kind = $4`,
        [args.scope, args.src_id, args.dst_id, args.relation_kind, args.promoted_edge_id],
      );
    },

    async updateAssociationCandidateStatus(args: UpdateAssociationCandidateStatusArgs): Promise<void> {
      await client.query(
        `UPDATE memory_association_candidates
         SET status = $5,
             promoted_edge_id = CASE
               WHEN $6::text IS NULL THEN promoted_edge_id
               ELSE $6::uuid
             END,
             updated_at = now()
         WHERE scope = $1
           AND src_id = $2
           AND dst_id = $3
           AND relation_kind = $4`,
        [args.scope, args.src_id, args.dst_id, args.relation_kind, args.status, args.promoted_edge_id ?? null],
      );
    },

    async appendAfterTopicClusterEventIds(scope: string, commitId: string, eventIdsJson: string): Promise<void> {
      await client.query(
        `UPDATE memory_outbox
         SET payload = payload || jsonb_build_object('after_topic_cluster_event_ids', $3::jsonb)
         WHERE scope=$1 AND commit_id=$2 AND event_type='embed_nodes'`,
        [scope, commitId, eventIdsJson],
      );
    },

    async mirrorCommitArtifactsToShadowV2(scope: string, commitId: string): Promise<WriteShadowMirrorCopied> {
      if (!capabilities.shadow_mirror_v2) {
        throw new Error("write capability unsupported: shadow_mirror_v2");
      }
      // Best effort: create scope partitions if scaffold function exists.
      try {
        await client.query("SELECT aionis_partition_ensure_scope($1)", [scope]);
      } catch {
        // noop: fall back to default partitions if available
      }

      const commitsRes = await client.query(
        `
        INSERT INTO memory_commits_v2
        SELECT *
        FROM memory_commits
        WHERE scope = $1
          AND id = $2
        ON CONFLICT DO NOTHING
        `,
        [scope, commitId],
      );

      const nodesRes = await client.query(
        `
        INSERT INTO memory_nodes_v2
        SELECT *
        FROM memory_nodes
        WHERE scope = $1
          AND commit_id = $2
        ON CONFLICT DO NOTHING
        `,
        [scope, commitId],
      );

      const edgesRes = await client.query(
        `
        INSERT INTO memory_edges_v2
        SELECT *
        FROM memory_edges
        WHERE scope = $1
          AND commit_id = $2
        ON CONFLICT DO NOTHING
        `,
        [scope, commitId],
      );

      const outboxRes = await client.query(
        `
        INSERT INTO memory_outbox_v2
        SELECT *
        FROM memory_outbox
        WHERE scope = $1
          AND commit_id = $2
        ON CONFLICT DO NOTHING
        `,
        [scope, commitId],
      );

      return {
        commits: commitsRes.rowCount ?? 0,
        nodes: nodesRes.rowCount ?? 0,
        edges: edgesRes.rowCount ?? 0,
        outbox: outboxRes.rowCount ?? 0,
      };
    },
  };
}

export function assertWriteStoreAccessContract(access: WriteStoreAccess): void {
  if (access.capability_version !== WRITE_STORE_ACCESS_CAPABILITY_VERSION) {
    throw new Error(
      `write access capability version mismatch: expected=${WRITE_STORE_ACCESS_CAPABILITY_VERSION} got=${String(
        (access as any).capability_version,
      )}`,
    );
  }
  const requiredMethods = [
    "nodeScopesByIds",
    "parentCommitHash",
    "insertCommit",
    "insertNode",
    "insertRuleDef",
    "upsertEdge",
    "readyEmbeddingNodeIds",
    "insertOutboxEvent",
    "upsertAssociationCandidates",
    "listAssociationCandidatesForSource",
    "markAssociationCandidatePromoted",
    "updateAssociationCandidateStatus",
    "appendAfterTopicClusterEventIds",
    "mirrorCommitArtifactsToShadowV2",
  ] as const;
  for (const method of requiredMethods) {
    if (typeof (access as any)[method] !== "function") {
      throw new Error(`write access missing required method: ${method}`);
    }
  }
  const capabilities = (access as any).capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    throw new Error("write access missing required capabilities object");
  }
  if (typeof capabilities.shadow_mirror_v2 !== "boolean") {
    throw new Error("write access capabilities.shadow_mirror_v2 must be boolean");
  }
}
