import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryRecallRequest, PlanningContextRequest, ToolsFeedbackRequest, ToolsSelectRequest } from "../memory/schemas.js";
import { HttpError } from "../util/http.js";
import { requireAdminTokenHeader } from "../util/admin_auth.js";
import { resolveTenantScope } from "../memory/tenant.js";
import { loadEnv } from "../config.js";
import { CAPABILITY_CONTRACT, capabilityContract } from "../capability-contract.js";
import {
  createApiKeyPrincipalResolver,
  normalizeControlAlertRouteTarget,
  normalizeControlIncidentPublishSourceDir,
  normalizeControlIncidentPublishTarget,
} from "../control-plane.js";
import { memoryRecallParsed, type RecallAuth } from "../memory/recall.js";
import { ruleMatchesContext } from "../memory/rule-engine.js";
import { buildAppliedPolicy, parsePolicyPatch } from "../memory/rule-policy.js";
import { applyToolPolicy } from "../memory/tool-selector.js";
import { computeEffectiveToolPolicy } from "../memory/tool-policy.js";
import { listSessionEvents, writeSessionEvent } from "../memory/sessions.js";
import { applyMemoryWrite } from "../memory/write.js";
import {
  RECALL_STORE_ACCESS_CAPABILITY_VERSION,
  assertRecallStoreAccessContract,
  createPostgresRecallStoreAccess,
} from "../store/recall-access.js";
import {
  WRITE_STORE_ACCESS_CAPABILITY_VERSION,
  assertWriteStoreAccessContract,
  createPostgresWriteStoreAccess,
} from "../store/write-access.js";
import { asPostgresMemoryStore, createMemoryStore } from "../store/memory-store.js";
import { createEmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";

type QueryResult<T> = { rows: T[]; rowCount: number };

class FakePgClient {
  private readonly fixtures: {
    stage1: any[];
    edges: any[];
    nodeIds: { id: string }[];
    nodes: any[];
    ruleDefs: any[];
    debugEmbeddings: { id: string; embedding_text: string }[];
  };

  constructor(fixtures: FakePgClient["fixtures"]) {
    this.fixtures = fixtures;
  }

  async query<T>(sql: string): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("embedding::text AS embedding_text")) {
      return { rows: this.fixtures.debugEmbeddings as T[], rowCount: this.fixtures.debugEmbeddings.length };
    }

    if (s.includes("WITH knn AS") && s.includes("FROM memory_nodes n") && s.includes("embedding <=>")) {
      return { rows: this.fixtures.stage1 as T[], rowCount: this.fixtures.stage1.length };
    }

    if (s.includes("FROM hop2") && s.includes("FROM memory_edges")) {
      return { rows: this.fixtures.edges as T[], rowCount: this.fixtures.edges.length };
    }

    if (s.includes("SELECT DISTINCT id FROM")) {
      return { rows: this.fixtures.nodeIds as T[], rowCount: this.fixtures.nodeIds.length };
    }

    if (s.includes("FROM memory_nodes") && s.includes("id = ANY")) {
      return { rows: this.fixtures.nodes as T[], rowCount: this.fixtures.nodes.length };
    }

    if (s.includes("FROM memory_rule_defs d") || s.includes("FROM memory_rule_defs")) {
      return { rows: this.fixtures.ruleDefs as T[], rowCount: this.fixtures.ruleDefs.length };
    }

    throw new Error(`FakePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class SessionAccessPgClient {
  private readonly sessionId = "00000000-0000-0000-0000-000000000111";
  private readonly eventId = "00000000-0000-0000-0000-000000000222";

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM memory_nodes") && s.includes("client_id = $2") && s.includes("type = 'topic'::memory_node_type")) {
      if (!s.includes("memory_lane")) throw new Error("session lookup must enforce lane visibility");
      const consumerAgent = params?.[2] ?? null;
      if (consumerAgent === "agent_a") {
        return {
          rows: [
            {
              id: this.sessionId,
              title: "Private Session",
              text_summary: "session summary",
              memory_lane: "private",
              owner_agent_id: "agent_a",
              owner_team_id: null,
            } as any,
          ] as T[],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }
    if (s.includes("FROM memory_edges me") && s.includes("me.type = 'part_of'::memory_edge_type")) {
      return {
        rows: [
          {
            id: this.eventId,
            client_id: "session_event:s1:e1",
            type: "event",
            title: "E1",
            text_summary: "event one",
            slots: { event_id: "e1" },
            memory_lane: "private",
            producer_agent_id: "agent_a",
            owner_agent_id: "agent_a",
            owner_team_id: null,
            embedding_status: "ready",
            embedding_model: "fake",
            raw_ref: null,
            evidence_ref: null,
            salience: 0.5,
            importance: 0.5,
            confidence: 0.8,
            last_activated: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000333",
            edge_weight: 1,
            edge_confidence: 1,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }
    throw new Error(`SessionAccessPgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class SessionWriteGuardPgClient {
  async query<T>(sql: string): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM memory_nodes") && s.includes("client_id = $2") && s.includes("type = 'topic'::memory_node_type")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000511",
            title: "Private Session",
            text_summary: "session summary",
            memory_lane: "private",
            owner_agent_id: "agent_a",
            owner_team_id: null,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }
    throw new Error(`SessionWriteGuardPgClient: unexpected query after guard: ${s.slice(0, 200)}...`);
  }
}

class RecallAccessFixturePgClient {
  readonly queries: Array<{ sql: string; params: any[] | undefined }> = [];

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: s, params });

    if (s.includes("WITH knn AS") && s.includes("FROM memory_nodes n") && s.includes("embedding <=>")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000901",
            type: "event",
            title: "ann",
            text_summary: "ann",
            tier: "hot",
            salience: 0.5,
            confidence: 0.8,
            similarity: 0.91,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("WITH ranked AS") && s.includes("FROM memory_nodes n") && s.includes("distance")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000902",
            type: "event",
            title: "exact",
            text_summary: "exact",
            tier: "hot",
            salience: 0.5,
            confidence: 0.8,
            similarity: 0.89,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM hop1") || s.includes("FROM hop2")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-0000000009e1",
            scope: "default",
            type: "part_of",
            src_id: "00000000-0000-0000-0000-000000000901",
            dst_id: "00000000-0000-0000-0000-000000000902",
            weight: 1,
            confidence: 1,
            decay_rate: 0.01,
            last_activated: null,
            created_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-0000000009c1",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_nodes") && s.includes("embedding_status::text AS embedding_status")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000901",
            scope: "default",
            type: "event",
            tier: "hot",
            memory_lane: "private",
            producer_agent_id: "agent_a",
            owner_agent_id: "agent_a",
            owner_team_id: null,
            title: "n1",
            text_summary: "n1",
            slots: {},
            embedding_status: "ready",
            embedding_model: "fake",
            topic_state: null,
            member_count: null,
            raw_ref: null,
            evidence_ref: null,
            salience: 0.5,
            importance: 0.5,
            confidence: 0.8,
            last_activated: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-0000000009c2",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_rule_defs")) {
      return {
        rows: [
          {
            rule_node_id: "00000000-0000-0000-0000-0000000009r1",
            state: "draft",
            rule_scope: "global",
            target_agent_id: null,
            target_team_id: null,
            if_json: {},
            then_json: {},
            exceptions_json: [],
            positive_count: 0,
            negative_count: 0,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("embedding::text AS embedding_text")) {
      return {
        rows: [{ id: "00000000-0000-0000-0000-000000000901", embedding_text: "[0.1,0.2]" } as any] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("INSERT INTO memory_recall_audit")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    throw new Error(`RecallAccessFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class WriteAccessFixturePgClient {
  readonly queries: Array<{ sql: string; params: any[] | undefined }> = [];
  private readonly throwEnsureScope: boolean;

  constructor(opts?: { throwEnsureScope?: boolean }) {
    this.throwEnsureScope = !!opts?.throwEnsureScope;
  }

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: s, params });

    if (s.includes("SELECT id, scope FROM memory_nodes WHERE id = ANY($1::uuid[])")) {
      return {
        rows: [
          { id: "00000000-0000-0000-0000-000000000911", scope: "default" },
          { id: "00000000-0000-0000-0000-000000000912", scope: "default" },
        ] as any as T[],
        rowCount: 2,
      };
    }

    if (s.includes("SELECT commit_hash FROM memory_commits WHERE id = $1 AND scope = $2")) {
      const pid = params?.[0];
      if (pid === "missing") return { rows: [] as T[], rowCount: 0 };
      return { rows: [{ commit_hash: "parent-hash" } as any] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_commits") && s.includes("RETURNING id")) {
      return { rows: [{ id: "00000000-0000-0000-0000-0000000009c0" } as any] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_nodes") && s.includes("ON CONFLICT (id) DO NOTHING")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_rule_defs")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_edges") && s.includes("ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("SELECT id FROM memory_nodes") && s.includes("embedding_status = 'ready'")) {
      return { rows: [{ id: "00000000-0000-0000-0000-000000000911" } as any] as T[], rowCount: 1 };
    }

    if (s.includes("SELECT aionis_partition_ensure_scope($1)")) {
      if (this.throwEnsureScope) throw new Error("scope ensure unavailable");
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_commits_v2")) return { rows: [] as T[], rowCount: 1 };
    if (s.includes("INSERT INTO memory_nodes_v2")) return { rows: [] as T[], rowCount: 2 };
    if (s.includes("INSERT INTO memory_edges_v2")) return { rows: [] as T[], rowCount: 3 };
    if (s.includes("INSERT INTO memory_outbox_v2")) return { rows: [] as T[], rowCount: 4 };

    if (s.includes("INSERT INTO memory_outbox")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("UPDATE memory_outbox")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    throw new Error(`WriteAccessFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

function keys(o: any): string[] {
  return Object.keys(o).sort();
}

function assertSubset(actual: string[], expected: string[]) {
  for (const k of actual) assert.ok(expected.includes(k), `unexpected key: ${k} (allowed=${expected.join(",")})`);
}

async function withEnv<T>(patch: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(patch)) {
    previous.set(k, process.env[k]);
    process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of previous.entries()) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function run() {
  await withEnv(
    {
      APP_ENV: "dev",
      DATABASE_URL: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
      MEMORY_STORE_BACKEND: "postgres",
      MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED: "false",
      MEMORY_RECALL_PROFILE: "lite",
      MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: "lite",
      MEMORY_RECALL_PROFILE_POLICY_JSON: JSON.stringify({
        endpoint: { recall: "lite", recall_text: "strict_edges" },
        tenant_default: { tenant_lite: "lite" },
        tenant_endpoint: { tenant_lite: { recall: "lite" } },
      }),
    },
    async () => {
      const env = loadEnv();
      assert.equal(env.MEMORY_STORE_BACKEND, "postgres");
      assert.equal(env.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED, false);
      assert.equal(env.MEMORY_RECALL_PROFILE, "lite");
      assert.equal(env.MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE, "lite");
    },
  );
  await withEnv(
    {
      APP_ENV: "dev",
      DATABASE_URL: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
      MEMORY_STORE_BACKEND: "embedded",
      MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED: "false",
    },
    async () => {
      assert.throws(
        () => loadEnv(),
        /MEMORY_STORE_BACKEND=embedded requires MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true/,
      );
    },
  );
  await withEnv(
    {
      APP_ENV: "dev",
      DATABASE_URL: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
      MEMORY_STORE_BACKEND: "embedded",
      MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED: "true",
      MEMORY_SHADOW_DUAL_WRITE_ENABLED: "true",
      MEMORY_SHADOW_DUAL_WRITE_STRICT: "true",
      MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED: "false",
    },
    async () => {
      assert.throws(
        () => loadEnv(),
        /MEMORY_SHADOW_DUAL_WRITE_STRICT=true requires MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED=true/,
      );
    },
  );
  await withEnv(
    {
      APP_ENV: "dev",
      DATABASE_URL: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
      MEMORY_STORE_BACKEND: "embedded",
      MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED: "true",
      MEMORY_SHADOW_DUAL_WRITE_ENABLED: "true",
      MEMORY_SHADOW_DUAL_WRITE_STRICT: "true",
      MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED: "true",
      MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED: "true",
      MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED: "false",
      MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED: "false",
      MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED: "false",
      MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED: "false",
    },
    async () => {
      const env = loadEnv();
      assert.equal(env.MEMORY_STORE_BACKEND, "embedded");
      assert.equal(env.MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED, true);
      assert.equal(env.MEMORY_STORE_EMBEDDED_SHADOW_MIRROR_ENABLED, true);
      assert.equal(env.MEMORY_STORE_EMBEDDED_RECALL_DEBUG_EMBEDDINGS_ENABLED, true);
      assert.equal(env.MEMORY_STORE_EMBEDDED_RECALL_AUDIT_ENABLED, false);
      assert.equal(env.MEMORY_STORE_EMBEDDED_SESSION_GRAPH_ENABLED, false);
      assert.equal(env.MEMORY_STORE_EMBEDDED_PACK_EXPORT_ENABLED, false);
      assert.equal(env.MEMORY_STORE_EMBEDDED_PACK_IMPORT_ENABLED, false);
    },
  );
  await withEnv(
    {
      APP_ENV: "dev",
      DATABASE_URL: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
      MEMORY_RECALL_PROFILE: "strict_edges",
      MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: "strict_edges",
      MEMORY_RECALL_PROFILE_POLICY_JSON: JSON.stringify({ endpoint: { recall: "not_allowed" } }),
    },
    async () => {
      assert.throws(
        () => loadEnv(),
        /legacy\|strict_edges\|quality_first\|lite/,
      );
    },
  );

  const recallAccessOk = {
    capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION,
    capabilities: { debug_embeddings: true, audit_insert: true },
    stage1CandidatesAnn: async () => [],
    stage1CandidatesExactFallback: async () => [],
    stage2Edges: async () => [],
    stage2Nodes: async () => [],
    ruleDefs: async () => [],
    debugEmbeddings: async () => [],
    insertRecallAudit: async () => {},
  };
  assert.doesNotThrow(() => assertRecallStoreAccessContract(recallAccessOk as any));
  assert.throws(
    () =>
      assertRecallStoreAccessContract({
        ...recallAccessOk,
        capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION + 1,
      } as any),
    /capability version mismatch/,
  );
  assert.throws(
    () => assertRecallStoreAccessContract({ capability_version: RECALL_STORE_ACCESS_CAPABILITY_VERSION } as any),
    /missing required method/,
  );
  assert.throws(
    () =>
      assertRecallStoreAccessContract({
        ...recallAccessOk,
        capabilities: { debug_embeddings: true },
      } as any),
    /audit_insert must be boolean/,
  );

  const writeAccessOk = {
    capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
    capabilities: { shadow_mirror_v2: true },
    nodeScopesByIds: async () => new Map<string, string>(),
    parentCommitHash: async () => null,
    insertCommit: async () => "00000000-0000-0000-0000-000000000001",
    insertNode: async () => {},
    insertRuleDef: async () => {},
    upsertEdge: async () => {},
    readyEmbeddingNodeIds: async () => new Set<string>(),
    insertOutboxEvent: async () => {},
    appendAfterTopicClusterEventIds: async () => {},
    mirrorCommitArtifactsToShadowV2: async () => ({ commits: 0, nodes: 0, edges: 0, outbox: 0 }),
  };
  assert.doesNotThrow(() => assertWriteStoreAccessContract(writeAccessOk as any));
  assert.throws(
    () =>
      assertWriteStoreAccessContract({
        ...writeAccessOk,
        capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION + 1,
      } as any),
    /capability version mismatch/,
  );
  assert.throws(
    () => assertWriteStoreAccessContract({ capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION } as any),
    /missing required method/,
  );
  assert.throws(
    () =>
      assertWriteStoreAccessContract({
        ...writeAccessOk,
        capabilities: {},
      } as any),
    /shadow_mirror_v2 must be boolean/,
  );

  assert.throws(
    () =>
      createMemoryStore({
        backend: "embedded",
        databaseUrl: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
        embeddedExperimentalEnabled: false,
      }),
    /MEMORY_STORE_BACKEND=embedded requires MEMORY_STORE_EMBEDDED_EXPERIMENTAL_ENABLED=true/,
  );
  const embeddedStore = createMemoryStore({
    backend: "embedded",
    databaseUrl: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
    embeddedExperimentalEnabled: true,
  });
  assert.equal(embeddedStore.backend, "embedded");
  assert.equal((embeddedStore as any).mode, "postgres_delegated");
  assert.ok(asPostgresMemoryStore(embeddedStore).db.pool);
  await embeddedStore.close();

  const recallAccessFixture = new RecallAccessFixturePgClient();
  const recallAdapter = createPostgresRecallStoreAccess(recallAccessFixture as any);
  assert.doesNotThrow(() => assertRecallStoreAccessContract(recallAdapter));
  assert.equal(recallAdapter.capabilities.debug_embeddings, true);
  assert.equal(recallAdapter.capabilities.audit_insert, true);
  const recallAdapterNoDebug = createPostgresRecallStoreAccess(recallAccessFixture as any, {
    capabilities: { debug_embeddings: false },
  });
  assert.equal(recallAdapterNoDebug.capabilities.debug_embeddings, false);
  const recallAdapterNoAudit = createPostgresRecallStoreAccess(recallAccessFixture as any, {
    capabilities: { audit_insert: false },
  });
  assert.equal(recallAdapterNoAudit.capabilities.audit_insert, false);
  const annRows = await recallAdapter.stage1CandidatesAnn({
    queryEmbedding: [0.1, 0.2],
    scope: "default",
    oversample: 20,
    limit: 10,
    consumerAgentId: "agent_a",
    consumerTeamId: null,
  });
  assert.equal(annRows.length, 1);
  assert.equal(annRows[0].id, "00000000-0000-0000-0000-000000000901");
  const exactRows = await recallAdapter.stage1CandidatesExactFallback({
    queryEmbedding: [0.1, 0.2],
    scope: "default",
    oversample: 20,
    limit: 10,
    consumerAgentId: "agent_a",
    consumerTeamId: null,
  });
  assert.equal(exactRows.length, 1);
  const edgesRows = await recallAdapter.stage2Edges({
    seedIds: ["00000000-0000-0000-0000-000000000901"],
    scope: "default",
    neighborhoodHops: 2,
    minEdgeWeight: 0,
    minEdgeConfidence: 0,
    hop1Budget: 50,
    hop2Budget: 50,
    edgeFetchBudget: 100,
  });
  assert.equal(edgesRows.length, 1);
  const nodeRows = await recallAdapter.stage2Nodes({
    scope: "default",
    nodeIds: ["00000000-0000-0000-0000-000000000901"],
    consumerAgentId: "agent_a",
    consumerTeamId: null,
    includeSlots: true,
  });
  assert.equal(nodeRows.length, 1);
  const ruleRows = await recallAdapter.ruleDefs("default", ["00000000-0000-0000-0000-0000000009r1"]);
  assert.equal(ruleRows.length, 1);
  const debugRows = await recallAdapter.debugEmbeddings("default", ["00000000-0000-0000-0000-000000000901"]);
  assert.equal(debugRows.length, 1);
  await assert.rejects(
    () => recallAdapterNoDebug.debugEmbeddings("default", ["00000000-0000-0000-0000-000000000901"]),
    /recall capability unsupported: debug_embeddings/i,
  );
  await recallAdapter.insertRecallAudit({
    scope: "default",
    endpoint: "recall",
    consumerAgentId: "agent_a",
    consumerTeamId: null,
    querySha256: "abc",
    seedCount: 1,
    nodeCount: 1,
    edgeCount: 1,
  });
  await assert.rejects(
    () =>
      recallAdapterNoAudit.insertRecallAudit({
        scope: "default",
        endpoint: "recall",
        consumerAgentId: "agent_a",
        consumerTeamId: null,
        querySha256: "abc",
        seedCount: 1,
        nodeCount: 1,
        edgeCount: 1,
      }),
    /recall capability unsupported: audit_insert/i,
  );
  assert.ok(
    recallAccessFixture.queries.some((q) => q.sql.includes("INSERT INTO memory_recall_audit")),
    "recall adapter should execute audit insert query",
  );

  const writeAccessFixture = new WriteAccessFixturePgClient({ throwEnsureScope: true });
  const writeAdapter = createPostgresWriteStoreAccess(writeAccessFixture as any);
  assert.doesNotThrow(() => assertWriteStoreAccessContract(writeAdapter));
  assert.equal(writeAdapter.capabilities.shadow_mirror_v2, true);
  const writeAdapterNoMirror = createPostgresWriteStoreAccess(writeAccessFixture as any, {
    capabilities: { shadow_mirror_v2: false },
  });
  assert.equal(writeAdapterNoMirror.capabilities.shadow_mirror_v2, false);
  const nodeScopeMap = await writeAdapter.nodeScopesByIds([
    "00000000-0000-0000-0000-000000000911",
    "00000000-0000-0000-0000-000000000912",
  ]);
  assert.equal(nodeScopeMap.get("00000000-0000-0000-0000-000000000911"), "default");
  const parentHash = await writeAdapter.parentCommitHash("default", "parent");
  assert.equal(parentHash, "parent-hash");
  const parentMissing = await writeAdapter.parentCommitHash("default", "missing");
  assert.equal(parentMissing, null);
  const commitId = await writeAdapter.insertCommit({
    scope: "default",
    parentCommitId: null,
    inputSha256: "sha",
    diffJson: "{}",
    actor: "tester",
    modelVersion: null,
    promptVersion: null,
    commitHash: "commit-hash",
  });
  assert.equal(commitId, "00000000-0000-0000-0000-0000000009c0");
  await writeAdapter.insertNode({
    id: "00000000-0000-0000-0000-000000000911",
    scope: "default",
    clientId: "client-1",
    type: "event",
    tier: "hot",
    title: "title",
    textSummary: "summary",
    slotsJson: "{}",
    rawRef: null,
    evidenceRef: null,
    embeddingVector: null,
    embeddingModel: null,
    memoryLane: "private",
    producerAgentId: "agent_a",
    ownerAgentId: "agent_a",
    ownerTeamId: null,
    embeddingStatus: "pending",
    embeddingLastError: null,
    salience: 0.5,
    importance: 0.5,
    confidence: 0.8,
    redactionVersion: 1,
    commitId,
  });
  await writeAdapter.insertRuleDef({
    scope: "default",
    ruleNodeId: "00000000-0000-0000-0000-0000000009r1",
    ifJson: "{}",
    thenJson: "{}",
    exceptionsJson: "[]",
    ruleScope: "global",
    targetAgentId: null,
    targetTeamId: null,
    commitId,
  });
  await writeAdapter.upsertEdge({
    id: "00000000-0000-0000-0000-0000000009e1",
    scope: "default",
    type: "part_of",
    srcId: "00000000-0000-0000-0000-000000000911",
    dstId: "00000000-0000-0000-0000-000000000912",
    weight: 0.9,
    confidence: 0.9,
    decayRate: 0.01,
    commitId,
  });
  const readyIds = await writeAdapter.readyEmbeddingNodeIds("default", ["00000000-0000-0000-0000-000000000911"]);
  assert.equal(readyIds.has("00000000-0000-0000-0000-000000000911"), true);
  await writeAdapter.insertOutboxEvent({
    scope: "default",
    commitId,
    eventType: "embed_nodes",
    jobKey: "job-1",
    payloadSha256: "sha",
    payloadJson: "{}",
  });
  await writeAdapter.appendAfterTopicClusterEventIds("default", commitId, `["00000000-0000-0000-0000-000000000911"]`);
  const copied = await writeAdapter.mirrorCommitArtifactsToShadowV2("default", commitId);
  assert.deepEqual(copied, { commits: 1, nodes: 2, edges: 3, outbox: 4 });
  await assert.rejects(
    () => writeAdapterNoMirror.mirrorCommitArtifactsToShadowV2("default", commitId),
    /write capability unsupported: shadow_mirror_v2/i,
  );
  const preparedWriteMinimal = {
    tenant_id: "default",
    scope_public: "default",
    scope: "default",
    actor: "tester",
    memory_lane_default: "shared",
    parent_commit_id: null,
    input_sha256: "a".repeat(64),
    model_version: null,
    prompt_version: null,
    redaction_meta: {},
    auto_embed_effective: false,
    force_reembed: false,
    nodes: [
      {
        id: "00000000-0000-0000-0000-00000000aa11",
        scope: "default",
        type: "event",
        memory_lane: "shared",
        slots: {},
        text_summary: "event",
      },
    ],
    edges: [],
  };
  const writeOutNoMirror = await applyMemoryWrite({} as any, preparedWriteMinimal as any, {
    maxTextLen: 8000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
    shadowDualWriteEnabled: true,
    shadowDualWriteStrict: false,
    write_access: {
      capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
      capabilities: { shadow_mirror_v2: false },
      nodeScopesByIds: async () => new Map<string, string>(),
      parentCommitHash: async () => null,
      insertCommit: async () => "00000000-0000-0000-0000-00000000ac11",
      insertNode: async () => {},
      insertRuleDef: async () => {},
      upsertEdge: async () => {},
      readyEmbeddingNodeIds: async () => new Set<string>(),
      insertOutboxEvent: async () => {},
      appendAfterTopicClusterEventIds: async () => {},
      mirrorCommitArtifactsToShadowV2: async () => ({ commits: 0, nodes: 0, edges: 0, outbox: 0 }),
    } as any,
  });
  assert.equal(writeOutNoMirror.shadow_dual_write?.mirrored, false);
  assert.equal(writeOutNoMirror.shadow_dual_write?.capability, "shadow_mirror_v2");
  assert.equal(writeOutNoMirror.shadow_dual_write?.failure_mode, "soft_degrade");
  assert.equal(writeOutNoMirror.shadow_dual_write?.degraded_mode, "capability_unsupported");
  assert.equal(writeOutNoMirror.shadow_dual_write?.fallback_applied, true);
  await assert.rejects(
    () =>
      applyMemoryWrite({} as any, preparedWriteMinimal as any, {
        maxTextLen: 8000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: true,
        shadowDualWriteStrict: true,
        write_access: {
          capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
          capabilities: { shadow_mirror_v2: false },
          nodeScopesByIds: async () => new Map<string, string>(),
          parentCommitHash: async () => null,
          insertCommit: async () => "00000000-0000-0000-0000-00000000ac12",
          insertNode: async () => {},
          insertRuleDef: async () => {},
          upsertEdge: async () => {},
          readyEmbeddingNodeIds: async () => new Set<string>(),
          insertOutboxEvent: async () => {},
          appendAfterTopicClusterEventIds: async () => {},
          mirrorCommitArtifactsToShadowV2: async () => ({ commits: 0, nodes: 0, edges: 0, outbox: 0 }),
        } as any,
      }),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 500 &&
      err.code === "shadow_dual_write_strict_failure" &&
      (err.details as any)?.capability === "shadow_mirror_v2" &&
      (err.details as any)?.degraded_mode === "capability_unsupported" &&
      (err.details as any)?.fallback_applied === false &&
      (err.details as any)?.strict === true,
  );
  const writeOutMirrorFail = await applyMemoryWrite({} as any, preparedWriteMinimal as any, {
    maxTextLen: 8000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
    shadowDualWriteEnabled: true,
    shadowDualWriteStrict: false,
    write_access: {
      capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
      capabilities: { shadow_mirror_v2: true },
      nodeScopesByIds: async () => new Map<string, string>(),
      parentCommitHash: async () => null,
      insertCommit: async () => "00000000-0000-0000-0000-00000000ac13",
      insertNode: async () => {},
      insertRuleDef: async () => {},
      upsertEdge: async () => {},
      readyEmbeddingNodeIds: async () => new Set<string>(),
      insertOutboxEvent: async () => {},
      appendAfterTopicClusterEventIds: async () => {},
      mirrorCommitArtifactsToShadowV2: async () => {
        throw new Error("mirror unavailable");
      },
    } as any,
  });
  assert.equal(writeOutMirrorFail.shadow_dual_write?.mirrored, false);
  assert.equal(writeOutMirrorFail.shadow_dual_write?.capability, "shadow_mirror_v2");
  assert.equal(writeOutMirrorFail.shadow_dual_write?.failure_mode, "soft_degrade");
  assert.equal(writeOutMirrorFail.shadow_dual_write?.degraded_mode, "mirror_failed");
  assert.equal(writeOutMirrorFail.shadow_dual_write?.fallback_applied, true);
  await assert.rejects(
    () =>
      applyMemoryWrite({} as any, preparedWriteMinimal as any, {
        maxTextLen: 8000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: true,
        shadowDualWriteStrict: true,
        write_access: {
          capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
          capabilities: { shadow_mirror_v2: true },
          nodeScopesByIds: async () => new Map<string, string>(),
          parentCommitHash: async () => null,
          insertCommit: async () => "00000000-0000-0000-0000-00000000ac14",
          insertNode: async () => {},
          insertRuleDef: async () => {},
          upsertEdge: async () => {},
          readyEmbeddingNodeIds: async () => new Set<string>(),
          insertOutboxEvent: async () => {},
          appendAfterTopicClusterEventIds: async () => {},
          mirrorCommitArtifactsToShadowV2: async () => {
            throw new Error("mirror unavailable");
          },
        } as any,
      }),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 500 &&
      err.code === "shadow_dual_write_strict_failure" &&
      (err.details as any)?.capability === "shadow_mirror_v2" &&
      (err.details as any)?.degraded_mode === "mirror_failed" &&
      (err.details as any)?.fallback_applied === false &&
      (err.details as any)?.strict === true &&
      (err.details as any)?.mirrored === false,
  );
  assert.ok(
    writeAccessFixture.queries.some((q) => q.sql.includes("aionis_partition_ensure_scope")),
    "write adapter should attempt scope ensure before v2 mirror copy",
  );

  const embeddedRuntime = createEmbeddedMemoryRuntime();
  await embeddedRuntime.applyWrite(
    {
      scope: "tenant:parity::scope:embedded",
      auto_embed_effective: false,
      nodes: [
        {
          id: "00000000-0000-0000-0000-000000000e11",
          scope: "tenant:parity::scope:embedded",
          type: "event",
          tier: "hot",
          memory_lane: "shared",
          title: "embedded event",
          text_summary: "embedded event",
          slots: {},
          embedding: Array.from({ length: 8 }, () => 0),
          embedding_model: "client",
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec1",
      commit_hash: "embedded-commit",
    } as any,
  );
  const embeddedSeeds = await embeddedRuntime.createRecallAccess().stage1CandidatesAnn({
    queryEmbedding: Array.from({ length: 8 }, () => 0),
    scope: "tenant:parity::scope:embedded",
    oversample: 10,
    limit: 5,
    consumerAgentId: null,
    consumerTeamId: null,
  });
  assert.equal(embeddedSeeds.length, 1);
  assert.equal(embeddedSeeds[0].id, "00000000-0000-0000-0000-000000000e11");

  const embeddedRuleScope = "tenant:parity::scope:embedded_rules";
  const embeddedRuleNodeId = "00000000-0000-0000-0000-000000000e51";
  const embeddedRuleRuntime = createEmbeddedMemoryRuntime();
  await embeddedRuleRuntime.applyWrite(
    {
      scope: embeddedRuleScope,
      auto_embed_effective: false,
      nodes: [
        {
          id: embeddedRuleNodeId,
          scope: embeddedRuleScope,
          type: "rule",
          tier: "hot",
          memory_lane: "shared",
          text_summary: "embedded rule",
          slots: {
            if: { intent: "json" },
            then: { tool: { allow: ["psql"] } },
            exceptions: [],
          },
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec8",
      commit_hash: "embedded-commit-8",
    } as any,
  );
  assert.equal(embeddedRuleRuntime.listRuleCandidates({ scope: embeddedRuleScope, limit: 10 }).length, 0);

  const stateUpdatedAt = new Date().toISOString();
  await embeddedRuleRuntime.syncRuleDefs(
    [
      {
        scope: embeddedRuleScope,
        rule_node_id: embeddedRuleNodeId,
        state: "active",
        rule_scope: "global",
        target_agent_id: null,
        target_team_id: null,
        if_json: { intent: "json" },
        then_json: { tool: { allow: ["psql"] } },
        exceptions_json: [],
        positive_count: 0,
        negative_count: 0,
        commit_id: "00000000-0000-0000-0000-000000000ec9",
        updated_at: stateUpdatedAt,
      },
    ],
    { touchRuleNodes: true },
  );
  const activeRules = embeddedRuleRuntime.listRuleCandidates({ scope: embeddedRuleScope, limit: 10 });
  assert.equal(activeRules.length, 1);
  assert.equal(activeRules[0].state, "active");
  assert.equal(activeRules[0].rule_commit_id, "00000000-0000-0000-0000-000000000ec9");
  assert.equal(activeRules[0].updated_at, stateUpdatedAt);

  const feedbackUpdatedAt = new Date(Date.now() + 1_000).toISOString();
  await embeddedRuleRuntime.syncRuleDefs([
    {
      scope: embeddedRuleScope,
      rule_node_id: embeddedRuleNodeId,
      state: "active",
      rule_scope: "global",
      target_agent_id: null,
      target_team_id: null,
      if_json: { intent: "json" },
      then_json: { tool: { allow: ["psql"] } },
      exceptions_json: [],
      positive_count: 2,
      negative_count: 1,
      commit_id: "00000000-0000-0000-0000-000000000ec9",
      updated_at: feedbackUpdatedAt,
    },
  ]);
  const afterFeedback = embeddedRuleRuntime.listRuleCandidates({ scope: embeddedRuleScope, limit: 10 });
  assert.equal(afterFeedback.length, 1);
  assert.equal(afterFeedback[0].positive_count, 2);
  assert.equal(afterFeedback[0].negative_count, 1);
  assert.equal(afterFeedback[0].updated_at, feedbackUpdatedAt);

  await embeddedRuleRuntime.syncRuleDefs([
    {
      scope: embeddedRuleScope,
      rule_node_id: embeddedRuleNodeId,
      state: "disabled",
      rule_scope: "global",
      target_agent_id: null,
      target_team_id: null,
      if_json: { intent: "json" },
      then_json: { tool: { allow: ["psql"] } },
      exceptions_json: [],
      positive_count: 2,
      negative_count: 1,
      commit_id: "00000000-0000-0000-0000-000000000ec9",
      updated_at: new Date(Date.now() + 2_000).toISOString(),
    },
  ]);
  assert.equal(embeddedRuleRuntime.listRuleCandidates({ scope: embeddedRuleScope, limit: 10 }).length, 0);

  const embeddedSnapshotPath = path.join(
    os.tmpdir(),
    `aionis_embedded_runtime_${Date.now()}_${Math.random().toString(16).slice(2)}.json`,
  );
  await fs.rm(embeddedSnapshotPath, { force: true });
  const embeddedPersist = createEmbeddedMemoryRuntime({
    snapshotPath: embeddedSnapshotPath,
    autoPersist: true,
  });
  await embeddedPersist.loadSnapshot();
  await embeddedPersist.applyWrite(
    {
      scope: "tenant:parity::scope:embedded_snapshot",
      auto_embed_effective: false,
      nodes: [
        {
          id: "00000000-0000-0000-0000-000000000e21",
          scope: "tenant:parity::scope:embedded_snapshot",
          type: "event",
          tier: "hot",
          memory_lane: "shared",
          title: "embedded persisted event",
          text_summary: "embedded persisted event",
          slots: {},
          embedding: Array.from({ length: 8 }, () => 0),
          embedding_model: "client",
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec2",
      commit_hash: "embedded-commit-2",
    } as any,
  );

  const embeddedReloaded = createEmbeddedMemoryRuntime({
    snapshotPath: embeddedSnapshotPath,
    autoPersist: false,
  });
  await embeddedReloaded.loadSnapshot();
  const embeddedReloadedSeeds = await embeddedReloaded.createRecallAccess().stage1CandidatesAnn({
    queryEmbedding: Array.from({ length: 8 }, () => 0),
    scope: "tenant:parity::scope:embedded_snapshot",
    oversample: 10,
    limit: 5,
    consumerAgentId: null,
    consumerTeamId: null,
  });
  assert.equal(embeddedReloadedSeeds.length, 1);
  assert.equal(embeddedReloadedSeeds[0].id, "00000000-0000-0000-0000-000000000e21");
  await fs.rm(embeddedSnapshotPath, { force: true });

  const rotateSnapshotPath = path.join(
    os.tmpdir(),
    `aionis_embedded_runtime_rotate_${Date.now()}_${Math.random().toString(16).slice(2)}.json`,
  );
  const rotateRuntime = createEmbeddedMemoryRuntime({
    snapshotPath: rotateSnapshotPath,
    autoPersist: true,
    snapshotMaxBackups: 2,
  });
  await rotateRuntime.applyWrite(
    {
      scope: "tenant:parity::scope:embedded_rotate",
      auto_embed_effective: false,
      nodes: [
        {
          id: "00000000-0000-0000-0000-000000000e31",
          scope: "tenant:parity::scope:embedded_rotate",
          type: "event",
          memory_lane: "shared",
          slots: {},
          embedding: Array.from({ length: 8 }, () => 0),
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec3",
      commit_hash: "embedded-commit-3",
    } as any,
  );
  await rotateRuntime.applyWrite(
    {
      scope: "tenant:parity::scope:embedded_rotate",
      auto_embed_effective: false,
      nodes: [
        {
          id: "00000000-0000-0000-0000-000000000e32",
          scope: "tenant:parity::scope:embedded_rotate",
          type: "event",
          memory_lane: "shared",
          slots: {},
          embedding: Array.from({ length: 8 }, () => 0),
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec4",
      commit_hash: "embedded-commit-4",
    } as any,
  );
  await rotateRuntime.applyWrite(
    {
      scope: "tenant:parity::scope:embedded_rotate",
      auto_embed_effective: false,
      nodes: [
        {
          id: "00000000-0000-0000-0000-000000000e33",
          scope: "tenant:parity::scope:embedded_rotate",
          type: "event",
          memory_lane: "shared",
          slots: {},
          embedding: Array.from({ length: 8 }, () => 0),
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec5",
      commit_hash: "embedded-commit-5",
    } as any,
  );
  await fs.access(rotateSnapshotPath);
  await fs.access(`${rotateSnapshotPath}.1`);
  await fs.access(`${rotateSnapshotPath}.2`);
  await fs.rm(rotateSnapshotPath, { force: true });
  await fs.rm(`${rotateSnapshotPath}.1`, { force: true });
  await fs.rm(`${rotateSnapshotPath}.2`, { force: true });

  const corruptSnapshotPath = path.join(
    os.tmpdir(),
    `aionis_embedded_runtime_corrupt_${Date.now()}_${Math.random().toString(16).slice(2)}.json`,
  );
  await fs.writeFile(corruptSnapshotPath, "{not-json", "utf8");
  const corruptRuntime = createEmbeddedMemoryRuntime({
    snapshotPath: corruptSnapshotPath,
    autoPersist: false,
  });
  await corruptRuntime.loadSnapshot();
  const corruptDir = path.dirname(corruptSnapshotPath);
  const corruptBase = path.basename(corruptSnapshotPath);
  const corruptFiles = await fs.readdir(corruptDir);
  assert.ok(
    corruptFiles.some((f) => f.startsWith(`${corruptBase}.corrupt.`)),
    "invalid snapshot should be quarantined with .corrupt suffix",
  );
  await fs.rm(corruptSnapshotPath, { force: true });
  for (const f of corruptFiles.filter((x) => x.startsWith(`${corruptBase}.corrupt.`))) {
    await fs.rm(path.join(corruptDir, f), { force: true });
  }

  const strictSnapshotPath = path.join(
    os.tmpdir(),
    `aionis_embedded_runtime_strict_${Date.now()}_${Math.random().toString(16).slice(2)}.json`,
  );
  const strictRuntime = createEmbeddedMemoryRuntime({
    snapshotPath: strictSnapshotPath,
    autoPersist: true,
    snapshotMaxBytes: 64,
    snapshotStrictMaxBytes: true,
  });
  await assert.rejects(
    () =>
      strictRuntime.applyWrite(
        {
          scope: "tenant:parity::scope:embedded_strict",
          auto_embed_effective: false,
          nodes: [
            {
              id: "00000000-0000-0000-0000-000000000e41",
              scope: "tenant:parity::scope:embedded_strict",
              type: "event",
              memory_lane: "shared",
              slots: {},
              embedding: Array.from({ length: 256 }, () => 0.5),
            },
          ],
          edges: [],
        } as any,
        {
          commit_id: "00000000-0000-0000-0000-000000000ec6",
          commit_hash: "embedded-commit-6",
        } as any,
      ),
    /embedded snapshot exceeds max bytes/i,
  );
  await fs.rm(strictSnapshotPath, { force: true });

  const compactSnapshotPath = path.join(
    os.tmpdir(),
    `aionis_embedded_runtime_compact_${Date.now()}_${Math.random().toString(16).slice(2)}.json`,
  );
  const compactScope = "tenant:parity::scope:embedded_compact";
  const compactRuntime = createEmbeddedMemoryRuntime({
    snapshotPath: compactSnapshotPath,
    autoPersist: true,
    snapshotMaxBytes: 4500,
    snapshotCompactionEnabled: true,
    snapshotCompactionMaxRounds: 6,
  });
  await compactRuntime.applyWrite(
    {
      scope: compactScope,
      auto_embed_effective: false,
      nodes: Array.from({ length: 24 }, (_, i) => {
        const seq = String(600 + i).padStart(12, "0");
        return {
          id: `00000000-0000-0000-0000-${seq}`,
          scope: compactScope,
          type: "event",
          tier: i % 3 === 0 ? "archive" : i % 2 === 0 ? "cold" : "warm",
          memory_lane: "shared",
          text_summary: `compact-node-${i}-${"x".repeat(220)}`,
          slots: { payload: "y".repeat(320), idx: i },
          raw_ref: `raw://${"z".repeat(80)}`,
          evidence_ref: `evidence://${"w".repeat(80)}`,
          embedding: Array.from({ length: 8 }, () => 0.2),
        };
      }),
      edges: Array.from({ length: 23 }, (_, i) => {
        const seq = String(800 + i).padStart(12, "0");
        const src = String(600 + i).padStart(12, "0");
        const dst = String(600 + i + 1).padStart(12, "0");
        return {
          id: `00000000-0000-0000-0000-${seq}`,
          scope: compactScope,
          type: "related_to",
          src_id: `00000000-0000-0000-0000-${src}`,
          dst_id: `00000000-0000-0000-0000-${dst}`,
          weight: 0.2 + (i % 5) * 0.05,
          confidence: 0.2 + (i % 4) * 0.05,
        };
      }),
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000ec7",
      commit_hash: "embedded-commit-7",
    } as any,
  );
  const compactStat = await fs.stat(compactSnapshotPath);
  assert.ok(compactStat.size > 0);
  const compactMetrics = compactRuntime.getSnapshotMetrics();
  assert.equal(compactMetrics.persist_total, 1);
  assert.equal(compactMetrics.last_compaction.applied, true);
  assert.ok((compactMetrics.last_bytes_after_compaction ?? Number.POSITIVE_INFINITY) < (compactMetrics.last_bytes_before_compaction ?? 0));
  if (!compactMetrics.last_over_limit_after_compaction) {
    assert.ok(compactStat.size <= 4500);
  }
  assert.ok(
    compactMetrics.last_compaction.trimmed_payload_nodes > 0 ||
      compactMetrics.last_compaction.dropped_edges > 0 ||
      compactMetrics.last_compaction.dropped_nodes > 0,
    "compaction should reduce payload/graph when snapshot exceeds max bytes",
  );
  await fs.rm(compactSnapshotPath, { force: true });
  await fs.rm(`${compactSnapshotPath}.1`, { force: true });
  await fs.rm(`${compactSnapshotPath}.2`, { force: true });
  await fs.rm(`${compactSnapshotPath}.3`, { force: true });

  // Schema hard cap: max_edges <= 100
  assert.throws(
    () => MemoryRecallRequest.parse({ query_embedding: [0], max_edges: 101 }),
    /less than or equal to 100/i,
  );

  // Tenant/scope namespace safety: prevent default-tenant scope collisions with tenant-derived scope keys.
  assert.throws(
    () =>
      resolveTenantScope(
        { tenant_id: "default", scope: "tenant:evil::scope:default" },
        { defaultScope: "default", defaultTenantId: "default" },
      ),
    (err: any) => err instanceof HttpError && err.code === "invalid_scope",
  );

  assert.equal(
    ToolsSelectRequest.parse({ context: { x: 1 }, candidates: ["curl"], run_id: "run_demo_1" }).run_id,
    "run_demo_1",
  );
  const planningReq = PlanningContextRequest.parse({
    query_text: "memory graph",
    context: { run: { id: "run_1" }, agent: { id: "agent_a", team_id: "team_a" } },
    tool_candidates: ["psql", "curl", "psql"],
  });
  assert.equal(planningReq.include_shadow, false);
  assert.equal(planningReq.rules_limit, 50);
  assert.equal(planningReq.tool_strict, true);
  assert.equal(planningReq.limit, 30);
  assert.throws(
    () =>
      ToolsFeedbackRequest.parse({
        context: { x: 1 },
        candidates: ["curl"],
        selected_tool: "curl",
        outcome: "positive",
        input_text: "x",
        decision_id: "not-a-uuid",
      }),
    /Invalid uuid/i,
  );

  const seedEventId = "00000000-0000-0000-0000-000000000001";
  const seedTopicId = "00000000-0000-0000-0000-000000000002";

  const fake = new FakePgClient({
    stage1: [
      {
        id: seedEventId,
        type: "event",
        title: null,
        text_summary: "seed event",
        tier: "hot",
        salience: 0.5,
        confidence: 0.8,
        similarity: 0.9,
      },
    ],
    edges: [
      {
        id: "00000000-0000-0000-0000-0000000000e1",
        scope: "default",
        type: "part_of",
        src_id: seedEventId,
        dst_id: seedTopicId,
        weight: 0.9,
        confidence: 0.9,
        decay_rate: 0.01,
        last_activated: null,
        created_at: new Date().toISOString(),
        commit_id: "00000000-0000-0000-0000-0000000000c1",
      },
    ],
    nodeIds: [{ id: seedEventId }, { id: seedTopicId }],
    nodes: [
      {
        id: seedEventId,
        scope: "default",
        type: "event",
        tier: "hot",
        title: null,
        text_summary: "seed event",
        slots: null,
        embedding_status: "ready",
        embedding_model: "minimax:embo-01",
        topic_state: null,
        member_count: null,
        raw_ref: null,
        evidence_ref: null,
        salience: 0.5,
        importance: 0.5,
        confidence: 0.8,
        last_activated: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        commit_id: "00000000-0000-0000-0000-0000000000c2",
      },
      {
        id: seedTopicId,
        scope: "default",
        type: "topic",
        tier: "hot",
        title: "T",
        text_summary: "topic",
        slots: { topic_state: "draft", member_count: 1, b: 2, a: 1 },
        embedding_status: "ready",
        embedding_model: "minimax:embo-01",
        topic_state: "draft",
        member_count: 1,
        raw_ref: null,
        evidence_ref: null,
        salience: 0.4,
        importance: 0.4,
        confidence: 0.7,
        last_activated: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        commit_id: "00000000-0000-0000-0000-0000000000c3",
      },
    ],
    ruleDefs: [],
    debugEmbeddings: [{ id: seedEventId, embedding_text: "[0.1,0.2,0.3,0.4]" }],
  });

  const baseReq = MemoryRecallRequest.parse({
    scope: "default",
    query_embedding: Array.from({ length: 1536 }, () => 0),
    limit: 20,
    neighborhood_hops: 2,
  });

  // Empty-seed contract: return public scope + tenant_id (never internal scope key), and keep stable response shape.
  const empty = new FakePgClient({
    stage1: [],
    edges: [],
    nodeIds: [],
    nodes: [],
    ruleDefs: [],
    debugEmbeddings: [],
  });
  const emptyOut = await memoryRecallParsed(
    empty as any,
    MemoryRecallRequest.parse({
      scope: "project-alpha",
      tenant_id: "tenant-a",
      query_embedding: Array.from({ length: 1536 }, () => 0),
    }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  assert.equal(emptyOut.scope, "project-alpha");
  assert.equal((emptyOut as any).tenant_id, "tenant-a");
  assert.equal(emptyOut.subgraph.nodes.length, 0);
  assert.equal(emptyOut.subgraph.edges.length, 0);
  assert.equal(emptyOut.ranked.length, 0);
  assert.equal(emptyOut.context.text, "");

  // Default contract: no embeddings in subgraph node DTO.
  const out = await memoryRecallParsed(fake as any, baseReq, "default", "default", { allow_debug_embeddings: false });
  assert.equal(out.subgraph.edges.length, 1);
  assert.equal(out.subgraph.nodes.length, 2);
  for (const n of out.subgraph.nodes) {
    assert.ok(!("embedding" in (n as any)));
    assertSubset(keys(n), ["id", "type", "title", "text_summary", "topic_state", "member_count"].filter(Boolean));
  }
  assertSubset(keys(out.subgraph.edges[0]), ["from_id", "to_id", "type", "weight"]);

  // Recall should stay functional even when backend declares audit_insert capability unavailable.
  const outNoAudit = await memoryRecallParsed(
    fake as any,
    baseReq,
    "default",
    "default",
    { allow_debug_embeddings: false },
    undefined,
    "recall",
    {
      recall_access: createPostgresRecallStoreAccess(fake as any, {
        capabilities: { audit_insert: false },
      }),
    },
  );
  assert.equal(outNoAudit.subgraph.nodes.length, 2);
  assert.equal(outNoAudit.subgraph.edges.length, 1);

  // return_debug alone must NOT widen the response contract (meta still requires include_meta).
  const outDebugNoMeta = await memoryRecallParsed(
    fake as any,
    MemoryRecallRequest.parse({ ...baseReq, return_debug: true }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  for (const n of outDebugNoMeta.subgraph.nodes as any[]) {
    assert.ok(!("created_at" in n));
    assert.ok(!("commit_id" in n));
  }
  for (const e of outDebugNoMeta.subgraph.edges as any[]) {
    assert.ok(!("commit_id" in e));
  }

  // Slots preview: sorted keys, limited.
  const outSlotsPreview = await memoryRecallParsed(
    fake as any,
    MemoryRecallRequest.parse({ ...baseReq, include_slots_preview: true, slots_preview_keys: 2 }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  const t = outSlotsPreview.subgraph.nodes.find((n: any) => n.type === "topic") as any;
  assert.deepEqual(Object.keys(t.slots_preview), ["a", "b"]); // sorted + limited

  // Meta should be behind include_meta or return_debug.
  const outMeta = await memoryRecallParsed(
    fake as any,
    MemoryRecallRequest.parse({ ...baseReq, include_meta: true }),
    "default",
    "default",
    { allow_debug_embeddings: false },
  );
  const e = outMeta.subgraph.nodes.find((n: any) => n.type === "event") as any;
  assert.ok("created_at" in e);
  assert.ok("commit_id" in e);
  assert.ok("embedding_model" in e);

  // Debug embeddings must be privileged + bounded.
  const wantDbg = MemoryRecallRequest.parse({ ...baseReq, return_debug: true, include_embeddings: true });
  await assert.rejects(
    () => memoryRecallParsed(fake as any, wantDbg, "default", "default", { allow_debug_embeddings: false }),
    (err: any) => err instanceof HttpError && err.statusCode === 400,
  );

  const allow: RecallAuth = { allow_debug_embeddings: true };
  const outDbg = await memoryRecallParsed(fake as any, wantDbg, "default", "default", allow);
  const outDbgAny = outDbg as any;
  assert.ok(outDbgAny.debug);
  assert.ok(Array.isArray(outDbgAny.debug.embeddings));
  assert.ok(outDbgAny.debug.embeddings.length <= 5);
  assert.ok(outDbgAny.debug.embeddings[0].preview.length <= 16);
  await assert.rejects(
    () =>
      memoryRecallParsed(fake as any, wantDbg, "default", "default", allow, undefined, "recall", {
        recall_access: createPostgresRecallStoreAccess(fake as any, {
          capabilities: { debug_embeddings: false },
        }),
      }),
    (err: any) =>
      err instanceof HttpError &&
      err.code === "debug_embeddings_backend_unsupported" &&
      (err.details as any)?.capability === "debug_embeddings" &&
      (err.details as any)?.failure_mode === "hard_fail" &&
      (err.details as any)?.degraded_mode === "feature_disabled",
  );

  // Capability contract registry should stay explicit and machine-readable.
  assert.equal(capabilityContract("shadow_mirror_v2").failure_mode, "soft_degrade");
  assert.equal(capabilityContract("debug_embeddings").failure_mode, "hard_fail");
  assert.equal(Array.isArray(CAPABILITY_CONTRACT.packs_import.degraded_modes), true);

  // limit>20 should be rejected in debug embeddings mode.
  const badLimit = MemoryRecallRequest.parse({ ...baseReq, limit: 21, return_debug: true, include_embeddings: true });
  await assert.rejects(
    () => memoryRecallParsed(fake as any, badLimit, "default", "default", allow),
    (err: any) => err instanceof HttpError && err.code === "debug_embeddings_limit_too_high",
  );

  // Rule engine basics (no DB needed).
  assert.equal(ruleMatchesContext({ intent: "json" }, [], { intent: "json" }), true);
  assert.equal(ruleMatchesContext({ intent: "json" }, [], { intent: "text" }), false);
  assert.equal(ruleMatchesContext({ "tool.name": "psql" }, [], { tool: { name: "psql" } }), true);
  assert.equal(ruleMatchesContext({ provider: { $in: ["openai", "minimax"] } }, [], { provider: "minimax" }), true);
  assert.equal(ruleMatchesContext({ provider: { $in: ["openai"] } }, [], { provider: "minimax" }), false);
  assert.equal(ruleMatchesContext({ intent: "json" }, [{ user: "lucio" }], { intent: "json", user: "lucio" }), false);
  assert.equal(ruleMatchesContext({ intent: { $regex: "j.*n" } }, [], { intent: "json" }), true);
  assert.equal(ruleMatchesContext({ intent: { $regex: "(a+)+$" } }, [], { intent: "aaaaaaaaaaaa!" }), false);
  assert.equal(ruleMatchesContext({ intent: { $regex: "(?=json).*" } }, [], { intent: "json" }), false);
  assert.equal(ruleMatchesContext({ intent: { $regex: "(a)\\1" } }, [], { intent: "aa" }), false);

  // Admin token guard contract.
  assert.throws(
    () => requireAdminTokenHeader({}, ""),
    (err: any) => err instanceof HttpError && err.statusCode === 503 && err.code === "admin_not_configured",
  );
  assert.throws(
    () => requireAdminTokenHeader({}, "admin-secret"),
    (err: any) => err instanceof HttpError && err.statusCode === 401 && err.code === "unauthorized_admin",
  );
  assert.throws(
    () => requireAdminTokenHeader({ "x-admin-token": "wrong" }, "admin-secret"),
    (err: any) => err instanceof HttpError && err.statusCode === 401 && err.code === "unauthorized_admin",
  );
  assert.doesNotThrow(() => requireAdminTokenHeader({ "x-admin-token": "admin-secret" }, "admin-secret"));

  // Control alert route target hardening (HTTPS + SSRF guard + channel host constraints).
  assert.equal(
    normalizeControlAlertRouteTarget("webhook", "https://alerts.example.com/hooks/aionis"),
    "https://alerts.example.com/hooks/aionis",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("webhook", "http://alerts.example.com/hooks/aionis"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("webhook", "https://127.0.0.1:8443/hooks/aionis"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("webhook", "https://2130706433/hooks/aionis"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("webhook", "https://localhost/hooks/aionis"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("webhook", "https://user:pass@alerts.example.com/hooks/aionis"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );
  assert.equal(
    normalizeControlAlertRouteTarget("slack_webhook", "https://hooks.slack.com/services/T000/B000/XXXX"),
    "https://hooks.slack.com/services/T000/B000/XXXX",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("slack_webhook", "https://api.slack.com/services/T000/B000/XXXX"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );
  assert.equal(
    normalizeControlAlertRouteTarget("pagerduty_events", "https://events.pagerduty.com/v2/enqueue"),
    "https://events.pagerduty.com/v2/enqueue",
  );
  assert.throws(
    () => normalizeControlAlertRouteTarget("pagerduty_events", "https://pagerduty.com/v2/enqueue"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_alert_target",
  );

  // Incident publish job input hardening.
  assert.equal(
    normalizeControlIncidentPublishSourceDir("/var/lib/aionis/incidents/run-42/"),
    "/var/lib/aionis/incidents/run-42",
  );
  assert.throws(
    () => normalizeControlIncidentPublishSourceDir("var/lib/aionis/incidents/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_source_dir",
  );
  assert.throws(
    () => normalizeControlIncidentPublishSourceDir("/var/lib/aionis/../secrets"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_source_dir",
  );
  assert.throws(
    () => normalizeControlIncidentPublishSourceDir("https://example.com/incidents/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_source_dir",
  );
  assert.equal(
    normalizeControlIncidentPublishTarget("https://uploads.example.com/aionis/run-42"),
    "https://uploads.example.com/aionis/run-42",
  );
  assert.equal(
    normalizeControlIncidentPublishTarget("s3://aionis-artifacts/incidents/run-42"),
    "s3://aionis-artifacts/incidents/run-42",
  );
  assert.equal(
    normalizeControlIncidentPublishTarget("arn:aws:s3:::aionis-artifacts/incidents/run-42"),
    "arn:aws:s3:::aionis-artifacts/incidents/run-42",
  );
  assert.throws(
    () => normalizeControlIncidentPublishTarget("ftp://uploads.example.com/aionis/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_target",
  );
  assert.throws(
    () => normalizeControlIncidentPublishTarget("http://uploads.example.com/aionis/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_target",
  );
  assert.throws(
    () => normalizeControlIncidentPublishTarget("s3:///incidents/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_target",
  );
  assert.throws(
    () => normalizeControlIncidentPublishTarget("file:///tmp/aionis/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_target",
  );
  assert.throws(
    () => normalizeControlIncidentPublishTarget("/tmp/aionis/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_target",
  );
  assert.throws(
    () => normalizeControlIncidentPublishTarget("https://127.0.0.1/aionis/run-42"),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "invalid_incident_publish_target",
  );

  // Policy patch schema + merging.
  const p1 = parsePolicyPatch({ output: { format: "json", strict: true }, tool: { allow: ["psql"] } });
  const p2 = parsePolicyPatch({ tool: { deny: ["rm"], allow: ["psql"] } });
  const applied = buildAppliedPolicy([
    { rule_node_id: "r1", state: "active", commit_id: "c1", then_patch: p1 },
    { rule_node_id: "r2", state: "active", commit_id: "c2", then_patch: p2 },
  ]);
  assert.deepEqual(applied.policy.tool?.allow, ["psql"]);
  assert.deepEqual(applied.policy.tool?.deny, ["rm"]);

  // Tool selector: allow/deny/prefer should deterministically filter and order candidates.
  const sel = applyToolPolicy(
    ["rm", "curl", "psql", "psql"],
    parsePolicyPatch({ tool: { allow: ["psql", "curl"], deny: ["rm"], prefer: ["psql"] } }),
    { strict: true },
  );
  assert.deepEqual(sel.candidates, ["rm", "curl", "psql"]);
  assert.deepEqual(sel.allowed, ["curl", "psql"]);
  assert.deepEqual(sel.preferred, ["psql"]);
  assert.deepEqual(sel.ordered, ["psql", "curl"]);
  assert.equal(sel.selected, "psql");

  // Tool selector fallback: strict=false should fall back to deny-only when allowlist filters out everything.
  const selFb = applyToolPolicy(
    ["psql", "curl"],
    parsePolicyPatch({ tool: { allow: ["nonexistent"], deny: ["curl"], prefer: ["psql"] } }),
    { strict: false },
  );
  assert.deepEqual(selFb.allowed, ["psql"]); // allowlist ignored, deny still applied
  assert.equal(selFb.selected, "psql");
  assert.equal(selFb.fallback?.applied, true);
  assert.equal(selFb.fallback?.reason, "allowlist_filtered_all");

  // Tool policy semantics (score-aware): deny=union, allow=intersection, prefer=score-desc priority list.
  const toolPolicy = computeEffectiveToolPolicy([
    { rule_node_id: "r_low", score: 1, tool: { prefer: ["psql"], allow: ["psql", "curl"] } },
    { rule_node_id: "r_high", score: 10, tool: { prefer: ["curl"], allow: ["curl"], deny: ["rm"] } },
  ]);
  assert.deepEqual(toolPolicy.tool.allow, ["curl"]); // intersection
  assert.deepEqual(toolPolicy.tool.deny, ["rm"]);
  assert.deepEqual(toolPolicy.tool.prefer, ["curl", "psql"]); // high score first
  assert.ok(Array.isArray(toolPolicy.explain.conflicts));
  assert.equal(toolPolicy.explain.contributions[0].priority, 0);
  assert.equal(toolPolicy.explain.contributions[0].weight, 1);
  const preferConflict = toolPolicy.explain.conflicts.find((c: any) => c.code === "prefer_competing_top_choice");
  assert.equal(preferConflict?.winner_rule_node_id, "r_high");

  // Session events listing must apply lane visibility to the session envelope itself.
  const sessionReader = new SessionAccessPgClient();
  const visible = await listSessionEvents(
    sessionReader as any,
    { tenant_id: "default", scope: "default", session_id: "s1", consumer_agent_id: "agent_a", limit: 20, offset: 0 },
    { defaultScope: "default", defaultTenantId: "default" },
  );
  assert.equal(visible.session?.session_id, "s1");
  assert.equal(visible.events.length, 1);
  const hidden = await listSessionEvents(
    sessionReader as any,
    { tenant_id: "default", scope: "default", session_id: "s1", consumer_agent_id: "agent_b", limit: 20, offset: 0 },
    { defaultScope: "default", defaultTenantId: "default" },
  );
  assert.equal(hidden.session, null);
  assert.equal(hidden.events.length, 0);

  // Session event writes must reject cross-owner append into private sessions.
  const writeGuard = new SessionWriteGuardPgClient();
  await assert.rejects(
    () =>
      writeSessionEvent(
        writeGuard as any,
        {
          tenant_id: "default",
          scope: "default",
          session_id: "s1",
          event_id: "e1",
          input_text: "event one",
          owner_agent_id: "agent_b",
          producer_agent_id: "agent_b",
        },
        {
          defaultScope: "default",
          defaultTenantId: "default",
          maxTextLen: 8000,
          piiRedaction: false,
          allowCrossScopeEdges: false,
          shadowDualWriteEnabled: false,
          shadowDualWriteStrict: false,
          writeAccessShadowMirrorV2: true,
          embedder: null,
        },
      ),
    (err: any) => err instanceof HttpError && err.statusCode === 403 && err.code === "session_owner_mismatch",
  );

  // API key principal resolver cache must stay bounded and evict old entries.
  let apiKeyLookupQueries = 0;
  const resolver = createApiKeyPrincipalResolver(
    {
      pool: {
        connect: async () => ({
          query: async () => {
            apiKeyLookupQueries += 1;
            return {
              rows: [{ tenant_id: "default", agent_id: null, team_id: null, role: null, key_prefix: "ak_live_test" }],
              rowCount: 1,
            };
          },
          release: () => {},
        }),
      },
    } as any,
    { ttl_ms: 60_000, negative_ttl_ms: 60_000, max_entries: 2 },
  );
  await resolver("k1");
  await resolver("k2");
  await resolver("k3");
  assert.equal(apiKeyLookupQueries, 3);
  await resolver("k1"); // should be evicted when cache max_entries=2
  assert.equal(apiKeyLookupQueries, 4);
  await resolver("k3"); // latest key should still be cached
  assert.equal(apiKeyLookupQueries, 4);
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, suite: "contract-smoke" }));
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  });
