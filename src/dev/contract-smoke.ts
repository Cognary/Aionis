import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  ContextAssembleRequest,
  MemoryPackExportRequest,
  MemoryPackImportRequest,
  MemoryRecallRequest,
  MemoryRecallTextRequest,
  MemoryWriteRequest,
  ReplayPlaybookCandidateRequest,
  MemorySessionEventsListRequest,
  PlanningContextRequest,
  ReplayPlaybookCompileRequest,
  ReplayPlaybookDispatchRequest,
  ReplayPlaybookPromoteRequest,
  ReplayRunEndRequest,
  ReplayRunGetRequest,
  ReplayPlaybookRepairRequest,
  ReplayPlaybookRepairReviewRequest,
  ReplayPlaybookRunRequest,
  ReplayRunStartRequest,
  ReplayStepAfterRequest,
  ReplayStepBeforeRequest,
  ToolsFeedbackRequest,
  ToolsSelectRequest,
} from "../memory/schemas.js";
import { HttpError } from "../util/http.js";
import { requireAdminTokenHeader, secretTokensEqual } from "../util/admin_auth.js";
import { resolveTenantScope } from "../memory/tenant.js";
import { loadEnv } from "../config.js";
import { CAPABILITY_CONTRACT, capabilityContract } from "../capability-contract.js";
import { createAuthResolver } from "../util/auth.js";
import {
  createControlApiKey,
  createApiKeyPrincipalResolver,
  normalizeControlAlertRouteTarget,
  normalizeControlIncidentPublishSourceDir,
  normalizeControlIncidentPublishTarget,
  upsertControlProject,
} from "../control-plane.js";
import { memoryRecallParsed, type RecallAuth } from "../memory/recall.js";
import { assembleLayeredContext } from "../memory/context-orchestrator.js";
import { ruleMatchesContext } from "../memory/rule-engine.js";
import { buildAppliedPolicy, parsePolicyPatch } from "../memory/rule-policy.js";
import { evaluateRules, evaluateRulesAppliedOnly } from "../memory/rules-evaluate.js";
import { applyToolPolicy } from "../memory/tool-selector.js";
import { computeEffectiveToolPolicy } from "../memory/tool-policy.js";
import { toolSelectionFeedback } from "../memory/tools-feedback.js";
import { getToolsDecisionById } from "../memory/tools-decision.js";
import { getToolsRunLifecycle } from "../memory/tools-run.js";
import { selectTools } from "../memory/tools-select.js";
import { applyContextOptimizationProfile } from "../app/context-optimization-profile.js";
import { buildAssemblySummary, buildPlanningSummary } from "../app/planning-summary.js";
import { createRecallPolicy } from "../app/recall-policy.js";
import { validateAutomationGraph } from "../memory/automation.js";
import {
  replayPlaybookCandidate,
  replayPlaybookCompileFromRun,
  replayPlaybookDispatch,
  replayPlaybookGet,
  replayPlaybookPromote,
  replayPlaybookRepair,
  replayPlaybookRepairReview,
  replayPlaybookRun,
  replayRunEnd,
  replayRunGet,
  replayRunStart,
  replayStepAfter,
  replayStepBefore,
} from "../memory/replay.js";
import { memoryFind } from "../memory/find.js";
import { memoryResolve } from "../memory/resolve.js";
import { listSessionEvents, writeSessionEvent } from "../memory/sessions.js";
import { applyMemoryWrite, prepareMemoryWrite } from "../memory/write.js";
import {
  enqueueSandboxRun,
  getSandboxRun,
  getSandboxRunArtifact,
  getSandboxRunLogs,
  postJsonWithTls,
} from "../memory/sandbox.js";
import { buildLayeredContextCostSignals } from "../memory/cost-signals.js";
import {
  RECALL_STORE_ACCESS_CAPABILITY_VERSION,
  assertRecallStoreAccessContract,
  createPostgresRecallStoreAccess,
} from "../store/recall-access.js";
import {
  REPLAY_STORE_ACCESS_CAPABILITY_VERSION,
  assertReplayStoreAccessContract,
  createPostgresReplayStoreAccess,
} from "../store/replay-access.js";
import { createLiteReplayStore } from "../store/lite-replay-store.js";
import {
  WRITE_STORE_ACCESS_CAPABILITY_VERSION,
  assertWriteStoreAccessContract,
  createPostgresWriteStoreAccess,
} from "../store/write-access.js";
import { asPostgresMemoryStore, createMemoryStore } from "../store/memory-store.js";
import { createEmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import { applyReplayMemoryWrite } from "../memory/replay-write.js";

type QueryResult<T> = { rows: T[]; rowCount: number };

function createDbFixture(client: { query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> }) {
  return {
    pool: {
      connect: async () => ({
        query: client.query.bind(client),
        release: () => {},
      }),
    },
  } as any;
}

function encodeBase64UrlJson(v: unknown): string {
  return Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = encodeBase64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = encodeBase64UrlJson(payload);
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

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

class SandboxFixturePgClient {
  private readonly runRow = {
    id: "99999999-9999-9999-9999-999999999999",
    session_id: "99999999-9999-9999-9999-999999999998",
    tenant_id: "default",
    scope: "default",
    project_id: "project_alpha",
    planner_run_id: "planner_123",
    decision_id: "99999999-9999-9999-9999-999999999997",
    action_kind: "command",
    action_json: { argv: ["echo", "hello"] },
    mode: "sync",
    status: "succeeded",
    timeout_ms: 1500,
    stdout_text: "hello world from sandbox\nsecond line\n",
    stderr_text: "warning: trimmed sample\n",
    output_truncated: true,
    exit_code: 0,
    error: null,
    cancel_requested: false,
    cancel_reason: null,
    metadata: { trace_id: "trace_1" },
    result_json: { executor: "mock", files_written: 2, ok: true },
    started_at: "2026-03-10T10:00:01.000Z",
    finished_at: "2026-03-10T10:00:02.000Z",
    created_at: "2026-03-10T10:00:00.000Z",
    updated_at: "2026-03-10T10:00:02.000Z",
  };

  async query<T>(sql: string, _params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("FROM memory_sandbox_sessions")) {
      return {
        rows: [{ id: this.runRow.session_id, expires_at: null } as any] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("INSERT INTO memory_sandbox_runs")) {
      return {
        rows: [{ ...this.runRow } as any] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_sandbox_runs")) {
      return {
        rows: [{ ...this.runRow } as any] as T[],
        rowCount: 1,
      };
    }

    throw new Error(`SandboxFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
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

class ResolveFixturePgClient {
  async query<T>(sql: string, _params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("FROM memory_edges e") && s.includes("JOIN memory_nodes src") && s.includes("JOIN memory_nodes dst")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-00000000e101",
            type: "part_of",
            src_id: "00000000-0000-0000-0000-000000001101",
            src_type: "event",
            dst_id: "00000000-0000-0000-0000-000000001102",
            dst_type: "topic",
            weight: 0.9,
            confidence: 0.8,
            decay_rate: 0.01,
            last_activated: null,
            created_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-00000000c101",
            commit_scope: "default",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_commits") && s.includes("commit_hash")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-00000000c101",
            parent_id: "00000000-0000-0000-0000-00000000c100",
            input_sha256: "a".repeat(64),
            diff_json: { nodes: 1 },
            actor: "contract_smoke",
            model_version: "test",
            prompt_version: "test",
            commit_hash: "b".repeat(64),
            created_at: new Date().toISOString(),
            node_count: 2,
            edge_count: 1,
            decision_count: 1,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_execution_decisions")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-00000000d101",
            decision_kind: "tools_select",
            run_id: "run_contract",
            selected_tool: "psql",
            candidates_json: ["psql", "curl"],
            context_sha256: "c".repeat(64),
            policy_sha256: "d".repeat(64),
            source_rule_ids: ["00000000-0000-0000-0000-000000001201"],
            metadata_json: { strict: true },
            created_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-00000000c101",
            commit_scope: "default",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_nodes n") && s.includes("n.type::text = $3")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000001101",
            type: "event",
            client_id: "event:resolve",
            title: "Resolve Event",
            text_summary: "resolve fixture",
            slots: { k: "v" },
            tier: "hot",
            memory_lane: "shared",
            producer_agent_id: null,
            owner_agent_id: null,
            owner_team_id: null,
            embedding_status: "ready",
            embedding_model: "test",
            raw_ref: null,
            evidence_ref: null,
            salience: 0.5,
            importance: 0.5,
            confidence: 0.9,
            last_activated: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-00000000c101",
            commit_scope: "default",
            topic_state: null,
            member_count: null,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    throw new Error(`ResolveFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class FindFixturePgClient {
  async query<T>(sql: string, _params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM memory_nodes n") && s.includes("ORDER BY n.created_at DESC, n.id DESC")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-00000000f201",
            type: "event",
            client_id: "find:event:1",
            title: "Deploy started",
            text_summary: "deployment started",
            slots: { env: "prod", service: "api", trace_id: "trace-1" },
            tier: "hot",
            memory_lane: "shared",
            producer_agent_id: "agent_ops",
            owner_agent_id: null,
            owner_team_id: null,
            embedding_status: "ready",
            embedding_model: "test",
            raw_ref: null,
            evidence_ref: null,
            salience: 0.9,
            importance: 0.8,
            confidence: 0.95,
            last_activated: null,
            created_at: "2026-03-11T08:00:00.000Z",
            updated_at: "2026-03-11T08:00:00.000Z",
            commit_id: "00000000-0000-0000-0000-00000000c201",
            topic_state: null,
            member_count: null,
          },
          {
            id: "00000000-0000-0000-0000-00000000f202",
            type: "topic",
            client_id: "find:topic:1",
            title: "Deploy workflow",
            text_summary: "topic for deploy workflow",
            slots: { topic_state: "active", member_count: 4, owner: "platform" },
            tier: "warm",
            memory_lane: "private",
            producer_agent_id: "agent_ops",
            owner_agent_id: "agent_find",
            owner_team_id: "team_ops",
            embedding_status: "ready",
            embedding_model: "test",
            raw_ref: null,
            evidence_ref: null,
            salience: 0.6,
            importance: 0.7,
            confidence: 0.8,
            last_activated: null,
            created_at: "2026-03-11T07:00:00.000Z",
            updated_at: "2026-03-11T07:00:00.000Z",
            commit_id: "00000000-0000-0000-0000-00000000c202",
            topic_state: "active",
            member_count: 4,
          },
        ] as any as T[],
        rowCount: 2,
      };
    }
    throw new Error(`FindFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class ReplayPlaybookFixturePgClient {
  private readonly playbooks: any[];

  constructor(playbooks: any[]) {
    this.playbooks = playbooks;
  }

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.includes("FROM memory_nodes") && s.includes("slots->>'replay_kind' = 'playbook'")) {
      const playbookId = params?.[1];
      const version = params?.[2];
      const rows = this.playbooks
        .filter((row) => row.playbook_id === playbookId)
        .sort((a, b) => b.version_num - a.version_num);
      const filtered = version == null ? rows : rows.filter((row) => row.version_num === version).slice(0, 1);
      return { rows: filtered as T[], rowCount: filtered.length };
    }
    throw new Error(`ReplayPlaybookFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class ReplayLifecycleFixturePgClient {
  private commitCounter = 0;
  private readonly commits = new Map<string, { id: string; scope: string; commit_hash: string }>();
  private readonly nodes = new Map<
    string,
    {
      id: string;
      scope: string;
      client_id: string | null;
      type: string;
      title: string | null;
      text_summary: string | null;
      slots: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      commit_id: string | null;
      embedding_status: string | null;
      embedding_vector: string | null;
    }
  >();

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("SELECT id, scope FROM memory_nodes WHERE id = ANY($1::uuid[])")) {
      const ids = Array.isArray(params?.[0]) ? params?.[0] : [];
      const rows = ids
        .map((id) => this.nodes.get(String(id)))
        .filter((row): row is NonNullable<typeof row> => !!row)
        .map((row) => ({ id: row.id, scope: row.scope }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (s.includes("SELECT commit_hash FROM memory_commits WHERE id = $1 AND scope = $2")) {
      const commit = this.commits.get(String(params?.[0] ?? ""));
      const scope = String(params?.[1] ?? "");
      if (!commit || commit.scope !== scope) return { rows: [] as T[], rowCount: 0 };
      return { rows: [{ commit_hash: commit.commit_hash } as any] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_commits") && s.includes("RETURNING id")) {
      this.commitCounter += 1;
      const suffix = String(this.commitCounter).padStart(12, "0");
      const id = `77777777-7777-7777-7777-${suffix}`;
      this.commits.set(id, {
        id,
        scope: String(params?.[0] ?? ""),
        commit_hash: String(params?.[7] ?? ""),
      });
      return { rows: [{ id } as any] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_nodes") && s.includes("ON CONFLICT (id) DO NOTHING")) {
      const id = String(params?.[0] ?? "");
      if (!this.nodes.has(id)) {
        const nowIso = new Date(Date.now() + this.nodes.size).toISOString();
        this.nodes.set(id, {
          id,
          scope: String(params?.[1] ?? ""),
          client_id: params?.[2] == null ? null : String(params?.[2]),
          type: String(params?.[3] ?? ""),
          title: params?.[5] == null ? null : String(params?.[5]),
          text_summary: params?.[6] == null ? null : String(params?.[6]),
          slots: JSON.parse(String(params?.[7] ?? "{}")),
          created_at: nowIso,
          updated_at: nowIso,
          commit_id: params?.[22] == null ? null : String(params?.[22]),
          embedding_status: params?.[16] == null ? null : String(params?.[16]),
          embedding_vector: params?.[10] == null ? null : String(params?.[10]),
        });
      }
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_rule_defs")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_edges") && s.includes("ON CONFLICT (scope, type, src_id, dst_id) DO UPDATE")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("SELECT id FROM memory_nodes") && s.includes("embedding_status = 'ready'")) {
      const scope = String(params?.[0] ?? "");
      const ids = Array.isArray(params?.[1]) ? params?.[1].map((v) => String(v)) : [];
      const rows = ids
        .map((id) => this.nodes.get(id))
        .filter(
          (row): row is NonNullable<typeof row> =>
            !!row && row.scope === scope && row.embedding_status === "ready" && row.embedding_vector != null,
        )
        .map((row) => ({ id: row.id }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (s.includes("INSERT INTO memory_outbox")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("UPDATE memory_outbox")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("SELECT") && s.includes("FROM memory_nodes") && s.includes("slots->>'replay_kind' = 'run'")) {
      const scope = String(params?.[0] ?? "");
      const runId = String(params?.[1] ?? "");
      const rows = [...this.nodes.values()]
        .filter((row) => row.scope === scope && row.slots.replay_kind === "run" && row.slots.run_id === runId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 1)
        .map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          text_summary: row.text_summary,
          slots: row.slots,
          created_at: row.created_at,
          updated_at: row.updated_at,
          commit_id: row.commit_id,
        }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (s.includes("FROM memory_nodes") && s.includes("id = $2") && s.includes("slots->>'replay_kind' = 'step'")) {
      const scope = String(params?.[0] ?? "");
      const stepId = String(params?.[1] ?? "");
      const row = this.nodes.get(stepId);
      if (!row || row.scope !== scope || row.slots.replay_kind !== "step") return { rows: [] as T[], rowCount: 0 };
      return {
        rows: [
          {
            id: row.id,
            type: row.type,
            title: row.title,
            text_summary: row.text_summary,
            slots: row.slots,
            created_at: row.created_at,
            updated_at: row.updated_at,
            commit_id: row.commit_id,
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_nodes") && s.includes("slots->>'replay_kind' = 'step'") && s.includes("slots->>'step_index' = $3")) {
      const scope = String(params?.[0] ?? "");
      const runId = String(params?.[1] ?? "");
      const stepIndex = String(params?.[2] ?? "");
      const rows = [...this.nodes.values()]
        .filter(
          (row) =>
            row.scope === scope
            && row.slots.replay_kind === "step"
            && row.slots.run_id === runId
            && String(row.slots.step_index ?? "") === stepIndex,
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 1)
        .map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          text_summary: row.text_summary,
          slots: row.slots,
          created_at: row.created_at,
          updated_at: row.updated_at,
          commit_id: row.commit_id,
        }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (s.includes("FROM memory_nodes") && s.includes("slots ? 'replay_kind'") && s.includes("slots->>'run_id' = $2")) {
      const scope = String(params?.[0] ?? "");
      const runId = String(params?.[1] ?? "");
      const rows = [...this.nodes.values()]
        .filter((row) => row.scope === scope && row.slots.replay_kind != null && row.slots.run_id === runId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          text_summary: row.text_summary,
          slots: row.slots,
          created_at: row.created_at,
          updated_at: row.updated_at,
          commit_id: row.commit_id,
        }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (s.includes("FROM memory_nodes") && s.includes("slots->>'replay_kind' = 'playbook'")) {
      const scope = String(params?.[0] ?? "");
      const playbookId = String(params?.[1] ?? "");
      const version = params?.[2] == null ? null : Number(params?.[2]);
      const rows = [...this.nodes.values()]
        .filter(
          (row) =>
            row.scope === scope
            && row.slots.replay_kind === "playbook"
            && row.slots.playbook_id === playbookId
            && (version == null || Number(row.slots.version ?? 1) === version),
        )
        .sort((a, b) => {
          const versionCmp = Number(b.slots.version ?? 1) - Number(a.slots.version ?? 1);
          if (versionCmp !== 0) return versionCmp;
          return b.created_at.localeCompare(a.created_at);
        })
        .slice(0, version == null ? undefined : 1)
        .map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          text_summary: row.text_summary,
          slots: row.slots,
          created_at: row.created_at,
          updated_at: row.updated_at,
          commit_id: row.commit_id,
          version_num: Number(row.slots.version ?? 1),
          playbook_status: typeof row.slots.status === "string" ? row.slots.status : null,
          playbook_id: typeof row.slots.playbook_id === "string" ? row.slots.playbook_id : null,
        }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    throw new Error(`ReplayLifecycleFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class RulesEvaluateFixturePgClient {
  private readonly rows: any[];

  constructor(rows: any[]) {
    this.rows = rows;
  }

  async query<T>(sql: string, _params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("FROM memory_rule_defs d") && s.includes("JOIN memory_nodes n ON n.id = d.rule_node_id AND n.scope = d.scope")) {
      return {
        rows: this.rows as T[],
        rowCount: this.rows.length,
      };
    }

    throw new Error(`RulesEvaluateFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
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

class ReplayAccessFixturePgClient {
  readonly queries: Array<{ sql: string; params: any[] | undefined }> = [];

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();
    this.queries.push({ sql: s, params });

    if (s.includes("slots->>'replay_kind' = 'run'") && s.includes("slots->>'run_id' = $2")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000a01",
            type: "event",
            title: "run",
            text_summary: "run",
            slots: { replay_kind: "run", run_id: "run-1" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000ac1",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("AND id = $2") && s.includes("slots->>'replay_kind' = 'step'")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000a02",
            type: "procedure",
            title: "step",
            text_summary: "step",
            slots: { replay_kind: "step", step_id: "step-1" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000ac2",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("slots->>'run_id' = $2") && s.includes("slots->>'step_index' = $3")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000a03",
            type: "procedure",
            title: "step-index",
            text_summary: "step-index",
            slots: { replay_kind: "step", step_id: "step-2", step_index: 2 },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000ac3",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("slots ? 'replay_kind'") && s.includes("slots->>'run_id' = $2")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000a01",
            type: "event",
            title: "run",
            text_summary: "run",
            slots: { replay_kind: "run", run_id: "run-1" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000ac1",
          } as any,
          {
            id: "00000000-0000-0000-0000-000000000a02",
            type: "procedure",
            title: "step",
            text_summary: "step",
            slots: { replay_kind: "step", run_id: "run-1", step_id: "step-1" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000ac2",
          } as any,
        ] as T[],
        rowCount: 2,
      };
    }

    if (s.includes("slots->>'replay_kind' = 'playbook'") && s.includes("slots->>'playbook_id' = $2")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000a04",
            type: "procedure",
            title: "playbook",
            text_summary: "playbook",
            slots: { replay_kind: "playbook", playbook_id: "pb-1", version: 2, status: "active" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            commit_id: "00000000-0000-0000-0000-000000000ac4",
            version_num: 2,
            playbook_status: "active",
            playbook_id: "pb-1",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    throw new Error(`ReplayAccessFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
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

class ToolsFeedbackFixturePgClient {
  private readonly decisionsByLookup: Array<any | null>;
  private readonly adoptRunIdRowCount: number;
  private decisionLookupCount = 0;

  constructor(opts: { decisionsByLookup: Array<any | null>; adoptRunIdRowCount?: number }) {
    this.decisionsByLookup = Array.isArray(opts.decisionsByLookup) ? opts.decisionsByLookup : [];
    this.adoptRunIdRowCount = Math.max(0, Number(opts.adoptRunIdRowCount ?? 0));
  }

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("FROM memory_execution_decisions") && s.includes("WHERE scope = $1") && s.includes("AND id = $2")) {
      const idx = Math.min(this.decisionLookupCount, Math.max(0, this.decisionsByLookup.length - 1));
      this.decisionLookupCount += 1;
      const row = this.decisionsByLookup[idx] ?? null;
      if (!row) return { rows: [] as T[], rowCount: 0 };
      return { rows: [row as T], rowCount: 1 };
    }

    if (s.includes("UPDATE memory_execution_decisions") && s.includes("SET run_id = $1")) {
      if (this.adoptRunIdRowCount > 0) {
        const runId = typeof params?.[0] === "string" ? String(params[0]) : null;
        return { rows: [{ run_id: runId } as any] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    }

    if (s.includes("SELECT id, commit_hash FROM memory_commits")) {
      return { rows: [] as T[], rowCount: 0 };
    }

    if (s.includes("INSERT INTO memory_commits") && s.includes("RETURNING id")) {
      return { rows: [{ id: "00000000-0000-0000-0000-000000000ff1" } as any] as T[], rowCount: 1 };
    }

    if (s.includes("INSERT INTO memory_rule_feedback")) {
      return { rows: [] as T[], rowCount: 1 };
    }

    if (s.includes("UPDATE memory_rule_defs")) {
      return { rows: [] as T[], rowCount: 0 };
    }

    throw new Error(`ToolsFeedbackFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class ToolsLifecycleFixturePgClient {
  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("FROM memory_execution_decisions") && s.includes("AND id = $2") && s.includes("LIMIT 1")) {
      return {
        rows: [
          {
            id: String(params?.[1] ?? "00000000-0000-0000-0000-00000000f201"),
            scope: String(params?.[0] ?? "default"),
            decision_kind: "tools_select",
            run_id: "run_tools_contract_1",
            selected_tool: "kubectl",
            candidates_json: ["kubectl", "bash", "python3"],
            context_sha256: "ctx_tools_contract",
            policy_sha256: "policy_tools_contract",
            source_rule_ids: ["rule_alpha", "rule_beta"],
            metadata_json: {
              source: "contract_smoke",
              tool_conflicts_summary: ["[conflict] deny shell", "[conflict] prefer kubectl"],
            },
            created_at: "2026-03-11T08:00:00.000Z",
            commit_id: "00000000-0000-0000-0000-00000000f299",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("SELECT count(*)::text AS count") && s.includes("FROM memory_execution_decisions")) {
      return {
        rows: [{ count: "2", latest_decision_at: "2026-03-11T08:00:00.000Z" } as any] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_execution_decisions") && s.includes("ORDER BY created_at DESC") && s.includes("LIMIT $3")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-00000000f201",
            decision_kind: "tools_select",
            run_id: String(params?.[1] ?? "run_tools_contract_1"),
            selected_tool: "kubectl",
            candidates_json: ["kubectl", "bash", "python3"],
            context_sha256: "ctx_tools_contract",
            policy_sha256: "policy_tools_contract",
            source_rule_ids: ["rule_alpha", "rule_beta"],
            metadata_json: { source: "contract_smoke" },
            created_at: "2026-03-11T08:00:00.000Z",
            commit_id: "00000000-0000-0000-0000-00000000f299",
          } as any,
          {
            id: "00000000-0000-0000-0000-00000000f202",
            decision_kind: "tools_select",
            run_id: String(params?.[1] ?? "run_tools_contract_1"),
            selected_tool: "bash",
            candidates_json: ["bash", "python3"],
            context_sha256: "ctx_tools_contract_2",
            policy_sha256: "policy_tools_contract_2",
            source_rule_ids: ["rule_gamma"],
            metadata_json: { source: "contract_smoke" },
            created_at: "2026-03-11T07:59:00.000Z",
            commit_id: null,
          } as any,
        ] as T[],
        rowCount: 2,
      };
    }

    if (s.includes("FROM memory_rule_feedback") && s.includes("count(*) FILTER")) {
      return {
        rows: [
          {
            total: "3",
            positive: "2",
            negative: "1",
            neutral: "0",
            linked_decision_count: "2",
            tools_feedback_count: "2",
            latest_feedback_at: "2026-03-11T08:01:00.000Z",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    if (s.includes("FROM memory_rule_feedback") && s.includes("ORDER BY created_at DESC") && s.includes("LIMIT $3")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-00000000f301",
            rule_node_id: "rule_alpha",
            outcome: "positive",
            note: "works",
            source: "tools_feedback",
            decision_id: "00000000-0000-0000-0000-00000000f201",
            commit_id: null,
            created_at: "2026-03-11T08:01:00.000Z",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    throw new Error(`ToolsLifecycleFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
  }
}

class ToolsSelectFixturePgClient {
  private readonly rows: any[];

  constructor(rows: any[]) {
    this.rows = rows;
  }

  async query<T>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("FROM memory_rule_defs d") && s.includes("JOIN memory_nodes n ON n.id = d.rule_node_id AND n.scope = d.scope")) {
      return {
        rows: this.rows as T[],
        rowCount: this.rows.length,
      };
    }

    if (s.includes("INSERT INTO memory_execution_decisions") && s.includes("RETURNING id, created_at::text AS created_at")) {
      return {
        rows: [
          {
            id: String(params?.[0] ?? "00000000-0000-0000-0000-00000000f401"),
            created_at: "2026-03-11T09:00:00.000Z",
          } as any,
        ] as T[],
        rowCount: 1,
      };
    }

    throw new Error(`ToolsSelectFixturePgClient: unhandled query shape: ${s.slice(0, 200)}...`);
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
      MEMORY_RECALL_CLASS_AWARE_ENABLED: "true",
      MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: "lite",
      MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
      MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT: "aggressive",
      AIONIS_EDITION: "lite",
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
      assert.equal(env.MEMORY_RECALL_CLASS_AWARE_ENABLED, true);
      assert.equal(env.MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE, "lite");
      assert.equal(env.MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT, "balanced");
      assert.equal(env.MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT, "aggressive");
      assert.equal(env.AIONIS_EDITION, "lite");
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
      MEMORY_RECALL_CLASS_AWARE_ENABLED: "true",
      MEMORY_RECALL_PROFILE: "strict_edges",
      MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: "strict_edges",
    },
    async () => {
      const env = loadEnv();
      const recallPolicy = createRecallPolicy(env);

      const dense = recallPolicy.resolveClassAwareRecallProfile(
        "recall_text",
        { query_text: "dense edge relationship recall" },
        "strict_edges",
        false,
      );
      assert.equal(dense.workload_class, "dense_edge");
      assert.equal(dense.profile, "quality_first");
      assert.equal(dense.applied, true);

      const workflow = recallPolicy.resolveClassAwareRecallProfile(
        "planning_context",
        { query_text: "incident dependency graph chain", tool_candidates: ["kubectl", "pagerduty"] },
        "legacy",
        false,
      );
      assert.equal(workflow.workload_class, "workflow_path");
      assert.equal(workflow.profile, "strict_edges");
      assert.equal(workflow.applied, true);

      const broad = recallPolicy.resolveClassAwareRecallProfile(
        "context_assemble",
        { query_text: "prepare production deploy context" },
        "strict_edges",
        false,
      );
      assert.equal(broad.workload_class, "workflow_path");
      assert.equal(broad.profile, "strict_edges");
      assert.equal(broad.applied, false);

      const broadSemantic = recallPolicy.resolveClassAwareRecallProfile(
        "context_assemble",
        { query_text: "broad semantic memory context overview" },
        "strict_edges",
        false,
      );
      assert.equal(broadSemantic.workload_class, "broad_semantic");
      assert.equal(broadSemantic.profile, "strict_edges");
      assert.equal(broadSemantic.applied, false);

      const sparse = recallPolicy.resolveClassAwareRecallProfile(
        "recall_text",
        { query_text: "lookup exact uuid hash for sparse ticket" },
        "legacy",
        false,
      );
      assert.equal(sparse.workload_class, "sparse_hit");
      assert.equal(sparse.profile, "strict_edges");
      assert.equal(sparse.applied, true);

      const explicit = recallPolicy.resolveClassAwareRecallProfile(
        "recall_text",
        { query_text: "dense edge relationship recall", limit: 12 },
        "strict_edges",
        true,
      );
      assert.equal(explicit.reason, "explicit_knobs");
      assert.equal(explicit.applied, false);

      const requestDisabled = recallPolicy.resolveClassAwareRecallProfile(
        "recall_text",
        { query_text: "dense edge relationship recall", recall_class_aware: false },
        "strict_edges",
        false,
      );
      assert.equal(requestDisabled.reason, "request_disabled");
      assert.equal(requestDisabled.enabled, false);
      assert.equal(requestDisabled.source, "request_override");
      assert.equal(requestDisabled.applied, false);

      const explicitMode = recallPolicy.resolveExplicitRecallMode(
        { query_text: "dense edge relationship recall", recall_mode: "dense_edge" },
        "strict_edges",
        false,
      );
      assert.equal(explicitMode.mode, "dense_edge");
      assert.equal(explicitMode.profile, "quality_first");
      assert.equal(explicitMode.applied, true);

      const explicitModeWithKnobs = recallPolicy.resolveExplicitRecallMode(
        { query_text: "dense edge relationship recall", recall_mode: "dense_edge", limit: 12 },
        "strict_edges",
        true,
      );
      assert.equal(explicitModeWithKnobs.mode, "dense_edge");
      assert.equal(explicitModeWithKnobs.reason, "explicit_knobs");
      assert.equal(explicitModeWithKnobs.applied, false);

      const classAwareBlockedByMode = recallPolicy.resolveClassAwareRecallProfile(
        "recall_text",
        { query_text: "dense edge relationship recall", recall_mode: "dense_edge", recall_class_aware: true },
        "quality_first",
        false,
      );
      assert.equal(classAwareBlockedByMode.reason, "explicit_mode");
      assert.equal(classAwareBlockedByMode.applied, false);
    },
  );
  await withEnv(
    {
      APP_ENV: "dev",
      DATABASE_URL: "postgres://aionis:aionis@127.0.0.1:5432/aionis_memory",
      MEMORY_RECALL_CLASS_AWARE_ENABLED: "false",
      MEMORY_RECALL_PROFILE: "strict_edges",
      MEMORY_RECALL_ADAPTIVE_TARGET_PROFILE: "strict_edges",
    },
    async () => {
      const env = loadEnv();
      const recallPolicy = createRecallPolicy(env);

      const requestEnabled = recallPolicy.resolveClassAwareRecallProfile(
        "recall_text",
        { query_text: "dense edge relationship recall", recall_class_aware: true },
        "strict_edges",
        false,
      );
      assert.equal(requestEnabled.workload_class, "dense_edge");
      assert.equal(requestEnabled.profile, "quality_first");
      assert.equal(requestEnabled.enabled, true);
      assert.equal(requestEnabled.source, "request_override");
      assert.equal(requestEnabled.applied, true);
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

  const replayAccessOk = {
    capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION,
    findRunNodeByRunId: async () => null,
    findStepNodeById: async () => null,
    findLatestStepNodeByIndex: async () => null,
    listReplayNodesByRunId: async () => [],
    listReplayPlaybookVersions: async () => [],
    getReplayPlaybookVersion: async () => null,
  };
  assert.doesNotThrow(() => assertReplayStoreAccessContract(replayAccessOk as any));
  assert.throws(
    () =>
      assertReplayStoreAccessContract({
        ...replayAccessOk,
        capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION + 1,
      } as any),
    /capability version mismatch/,
  );
  assert.throws(
    () => assertReplayStoreAccessContract({ capability_version: REPLAY_STORE_ACCESS_CAPABILITY_VERSION } as any),
    /missing required method/,
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

  const replayAccessFixture = new ReplayAccessFixturePgClient();
  const replayAdapter = createPostgresReplayStoreAccess(replayAccessFixture as any);
  assert.doesNotThrow(() => assertReplayStoreAccessContract(replayAdapter));
  assert.equal((await replayAdapter.findRunNodeByRunId("default", "run-1"))?.id, "00000000-0000-0000-0000-000000000a01");
  assert.equal((await replayAdapter.findStepNodeById("default", "step-1"))?.id, "00000000-0000-0000-0000-000000000a02");
  assert.equal((await replayAdapter.findLatestStepNodeByIndex("default", "run-1", 2))?.id, "00000000-0000-0000-0000-000000000a03");
  assert.equal((await replayAdapter.listReplayNodesByRunId("default", "run-1")).length, 2);
  assert.equal((await replayAdapter.listReplayPlaybookVersions("default", "pb-1"))[0]?.version_num, 2);
  assert.equal((await replayAdapter.getReplayPlaybookVersion("default", "pb-1", 2))?.playbook_status, "active");

  const liteReplayDir = await fs.mkdtemp(path.join(os.tmpdir(), "aionis-lite-replay-"));
  const liteReplayPath = path.join(liteReplayDir, "replay.sqlite");
  const liteReplayStore = createLiteReplayStore(liteReplayPath);
  const liteReplayAccess = liteReplayStore.createReplayAccess();
  assert.doesNotThrow(() => assertReplayStoreAccessContract(liteReplayAccess));
  await liteReplayStore.upsertReplayNodes([
    {
      node_id: "00000000-0000-0000-0000-000000000b01",
      scope: "default",
      replay_kind: "run",
      run_id: "run-lite",
      step_id: null,
      step_index: null,
      playbook_id: null,
      version_num: null,
      playbook_status: null,
      node_type: "event",
      title: "lite run",
      text_summary: "lite run",
      slots_json: JSON.stringify({ replay_kind: "run", run_id: "run-lite", goal: "demo" }),
      created_at: "2026-03-11T00:00:00.000Z",
      updated_at: "2026-03-11T00:00:00.000Z",
      commit_id: "00000000-0000-0000-0000-000000000bc1",
    },
    {
      node_id: "00000000-0000-0000-0000-000000000b02",
      scope: "default",
      replay_kind: "playbook",
      run_id: null,
      step_id: null,
      step_index: null,
      playbook_id: "pb-lite",
      version_num: 3,
      playbook_status: "active",
      node_type: "procedure",
      title: "lite playbook",
      text_summary: "lite playbook",
      slots_json: JSON.stringify({ replay_kind: "playbook", playbook_id: "pb-lite", version: 3, status: "active" }),
      created_at: "2026-03-11T00:00:01.000Z",
      updated_at: "2026-03-11T00:00:01.000Z",
      commit_id: "00000000-0000-0000-0000-000000000bc2",
    },
  ]);
  assert.equal((await liteReplayAccess.findRunNodeByRunId("default", "run-lite"))?.title, "lite run");
  assert.equal((await liteReplayAccess.listReplayPlaybookVersions("default", "pb-lite"))[0]?.version_num, 3);

  const replayWriteFixture = new WriteAccessFixturePgClient();
  await applyReplayMemoryWrite(
    replayWriteFixture as any,
    {
      tenant_id: "default",
      scope: "default",
      actor: "tester",
      input_text: "start replay run",
      auto_embed: false,
      nodes: [
        {
          client_id: "replay:run:run-lite-helper",
          type: "event",
          title: "Replay Run",
          text_summary: "Replay run helper",
          slots: {
            replay_kind: "run",
            run_id: "run-lite-helper",
            goal: "helper",
            status: "started",
          },
        },
      ],
      edges: [],
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 4096,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: true,
      embedder: null,
      replayMirror: liteReplayStore,
    },
  );
  assert.equal((await liteReplayAccess.findRunNodeByRunId("default", "run-lite-helper"))?.text_summary, "Replay run helper");
  await liteReplayStore.close();
  await fs.rm(liteReplayDir, { recursive: true, force: true });

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
  await assert.rejects(
    () =>
      applyMemoryWrite(
        {} as any,
        {
          ...preparedWriteMinimal,
          nodes: [{ ...preparedWriteMinimal.nodes[0], scope: "other" }],
        } as any,
        {
          maxTextLen: 8000,
          piiRedaction: false,
          allowCrossScopeEdges: false,
          shadowDualWriteEnabled: false,
          shadowDualWriteStrict: false,
          write_access: {
            capability_version: WRITE_STORE_ACCESS_CAPABILITY_VERSION,
            capabilities: { shadow_mirror_v2: false },
            nodeScopesByIds: async () => new Map<string, string>(),
            parentCommitHash: async () => null,
            insertCommit: async () => "00000000-0000-0000-0000-00000000ac10",
            insertNode: async () => {},
            insertRuleDef: async () => {},
            upsertEdge: async () => {},
            readyEmbeddingNodeIds: async () => new Set<string>(),
            insertOutboxEvent: async () => {},
            appendAfterTopicClusterEventIds: async () => {},
            mirrorCommitArtifactsToShadowV2: async () => ({ commits: 0, nodes: 0, edges: 0, outbox: 0 }),
          } as any,
        },
      ),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 400 &&
      err.code === "cross_scope_node_not_allowed" &&
      (err.details as any)?.request_scope === "default" &&
      (err.details as any)?.node_scope_key === "other",
  );
  await assert.rejects(
    () =>
      prepareMemoryWrite(
        {
          tenant_id: "default",
          scope: "default",
          input_text: "duplicate client id test",
          nodes: [
            { client_id: "dup_client", type: "event", text_summary: "first node" },
            { client_id: "dup_client", type: "event", text_summary: "second node" },
          ],
        },
        "default",
        "default",
        { maxTextLen: 8000, piiRedaction: false, allowCrossScopeEdges: false },
        null,
      ),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 400 &&
      err.code === "duplicate_client_id_in_batch" &&
      (err.details as any)?.client_id === "dup_client" &&
      (err.details as any)?.first_index === 0 &&
      (err.details as any)?.duplicate_index === 1,
  );
  await assert.rejects(
    () =>
      prepareMemoryWrite(
        {
          tenant_id: "default",
          scope: "default",
          input_text: "duplicate node id test",
          nodes: [
            {
              id: "00000000-0000-0000-0000-00000000bb11",
              type: "event",
              text_summary: "first node",
            },
            {
              id: "00000000-0000-0000-0000-00000000bb11",
              type: "entity",
              text_summary: "second node",
            },
          ],
        },
        "default",
        "default",
        { maxTextLen: 8000, piiRedaction: false, allowCrossScopeEdges: false },
        null,
      ),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 400 &&
      err.code === "duplicate_node_id_in_batch" &&
      (err.details as any)?.node_id === "00000000-0000-0000-0000-00000000bb11" &&
      (err.details as any)?.first_index === 0 &&
      (err.details as any)?.duplicate_index === 1,
  );
  const preparedWriteDistilled = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      input_text: "Service: payments. Owner: platform team. payments requires approval before deploy.",
      distill: {
        enabled: true,
        max_evidence_nodes: 1,
        max_fact_nodes: 2,
        min_sentence_chars: 12,
        attach_edges: true,
      },
    },
    "default",
    "default",
    { maxTextLen: 8000, piiRedaction: false, allowCrossScopeEdges: false },
    null,
  );
  assert.equal(preparedWriteDistilled.distillation?.enabled, true);
  assert.equal(preparedWriteDistilled.distillation?.sources_considered, 1);
  assert.equal(preparedWriteDistilled.distillation?.generated_evidence_nodes, 1);
  assert.equal(preparedWriteDistilled.distillation?.generated_fact_nodes, 2);
  assert.equal(preparedWriteDistilled.distillation?.generated_edges, 2);
  assert.equal(preparedWriteDistilled.nodes.length, 3);
  assert.equal(preparedWriteDistilled.edges.length, 2);
  assert.ok(preparedWriteDistilled.nodes.some((node) => node.type === "evidence" && node.slots.summary_kind === "write_distillation_evidence"));
  assert.equal(
    preparedWriteDistilled.nodes.filter((node) => node.type === "concept" && node.slots.summary_kind === "write_distillation_fact").length,
    2,
  );
  assert.ok(preparedWriteDistilled.edges.every((edge) => edge.type === "derived_from"));
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

  const decisionScope = "tenant:parity::scope:embedded_decisions";
  const decisionId = "00000000-0000-0000-0000-000000000ed1";
  const decisionCreatedAt = new Date().toISOString();
  await embeddedRuleRuntime.syncExecutionDecisions([
    {
      id: decisionId,
      scope: decisionScope,
      decision_kind: "tools_select",
      run_id: "run_embedded_1",
      selected_tool: "psql",
      candidates_json: ["psql", "curl"],
      context_sha256: "ctx_sha_1",
      policy_sha256: "policy_sha_1",
      source_rule_ids: [embeddedRuleNodeId],
      metadata_json: { source: "contract_smoke" },
      created_at: decisionCreatedAt,
      commit_id: null,
    },
  ]);
  const byId = embeddedRuleRuntime.getExecutionDecision({ scope: decisionScope, decision_id: decisionId });
  assert.ok(byId);
  assert.equal(byId?.selected_tool, "psql");

  const inferredByRun = embeddedRuleRuntime.inferExecutionDecision({
    scope: decisionScope,
    run_id: "run_embedded_1",
    selected_tool: "psql",
    candidates_json: ["psql", "curl"],
    context_sha256: "ctx_sha_1",
  });
  assert.equal(inferredByRun?.id, decisionId);

  const inferredFallback = embeddedRuleRuntime.inferExecutionDecision({
    scope: decisionScope,
    run_id: null,
    selected_tool: "psql",
    candidates_json: ["psql", "curl"],
    context_sha256: "ctx_sha_1",
  });
  assert.equal(inferredFallback?.id, decisionId);

  await embeddedRuleRuntime.appendRuleFeedback([
    {
      id: "00000000-0000-0000-0000-000000000ef1",
      scope: decisionScope,
      rule_node_id: embeddedRuleNodeId,
      run_id: "run_embedded_1",
      outcome: "positive",
      note: "ok",
      source: "tools_feedback",
      decision_id: decisionId,
      commit_id: "00000000-0000-0000-0000-000000000ec9",
    },
  ]);
  const mirroredFeedback = embeddedRuleRuntime.listRuleFeedback({ scope: decisionScope, limit: 5 });
  assert.equal(mirroredFeedback.length, 1);
  assert.equal(mirroredFeedback[0].source, "tools_feedback");
  assert.equal(mirroredFeedback[0].decision_id, decisionId);

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
  const sessionFlagsFalse = MemorySessionEventsListRequest.parse({
    session_id: "s1",
    include_meta: "false",
    include_slots: "0",
    include_slots_preview: "off",
  });
  assert.equal(sessionFlagsFalse.include_meta, false);
  assert.equal(sessionFlagsFalse.include_slots, false);
  assert.equal(sessionFlagsFalse.include_slots_preview, false);
  const sessionFlagsTrue = MemorySessionEventsListRequest.parse({
    session_id: "s1",
    include_meta: "true",
    include_slots: "1",
    include_slots_preview: "on",
  });
  assert.equal(sessionFlagsTrue.include_meta, true);
  assert.equal(sessionFlagsTrue.include_slots, true);
  assert.equal(sessionFlagsTrue.include_slots_preview, true);
  assert.throws(
    () => MemorySessionEventsListRequest.parse({ session_id: "s1", include_meta: "not_bool" }),
    /Expected boolean/i,
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
  const recallTextDenseModeReq = MemoryRecallTextRequest.parse({
    query_text: "relationship topology",
    recall_mode: "dense_edge",
  });
  assert.equal(recallTextDenseModeReq.recall_mode, "dense_edge");
  const planningOptimizedReq = PlanningContextRequest.parse({
    query_text: "deploy api",
    context: { intent: "deploy" },
    tool_candidates: ["kubectl"],
    context_optimization_profile: "aggressive",
    recall_mode: "dense_edge",
  });
  assert.equal(planningOptimizedReq.context_optimization_profile, "aggressive");
  assert.equal(planningOptimizedReq.recall_mode, "dense_edge");
  const assembleReq = ContextAssembleRequest.parse({
    query_text: "memory graph",
    context: { run: { id: "run_2" }, agent: { id: "agent_b", team_id: "team_b" } },
    tool_candidates: ["psql", "curl"],
    context_layers: {
      enabled: ["facts", "episodes", "rules"],
      char_budget_total: 3200,
      char_budget_by_layer: { facts: 1200, episodes: 1200, rules: 800 },
      max_items_by_layer: { facts: 16, episodes: 16, rules: 12 },
      forgetting_policy: {
        allowed_tiers: ["hot", "warm"],
        exclude_archived: true,
        min_salience: 0.2,
      },
    },
    static_context_blocks: [
      {
        id: "deploy_bootstrap",
        title: "Deploy Bootstrap",
        content: "Require approval before prod deploy and collect rollback refs.",
        intents: ["deploy"],
        tools: ["kubectl"],
      },
    ],
    static_injection: {
      max_blocks: 2,
      min_score: 40,
    },
  });
  assert.equal(assembleReq.include_rules, true);
  assert.equal(assembleReq.include_shadow, false);
  assert.equal(assembleReq.return_layered_context, true);
  assert.equal(assembleReq.tool_strict, true);
  assert.deepEqual(assembleReq.context_layers?.forgetting_policy?.allowed_tiers, ["hot", "warm"]);
  assert.equal(assembleReq.context_layers?.forgetting_policy?.exclude_archived, true);
  assert.equal(assembleReq.context_layers?.forgetting_policy?.min_salience, 0.2);
  assert.equal(assembleReq.static_context_blocks?.[0]?.id, "deploy_bootstrap");
  assert.equal(assembleReq.static_injection?.max_blocks, 2);
  assert.equal(assembleReq.static_injection?.min_score, 40);
  const assembleOptimizedReq = ContextAssembleRequest.parse({
    query_text: "deploy production",
    context_optimization_profile: "balanced",
    recall_mode: "dense_edge",
  });
  assert.equal(assembleOptimizedReq.context_optimization_profile, "balanced");
  assert.equal(assembleOptimizedReq.recall_mode, "dense_edge");
  assert.throws(
    () =>
      ContextAssembleRequest.parse({
        query_text: "x",
        context_layers: { enabled: ["facts", "unknown_layer"] },
      }),
    /Invalid enum value/i,
  );
  const balancedOptimization = applyContextOptimizationProfile(assembleOptimizedReq as any);
  assert.equal(balancedOptimization.optimization_profile.requested, "balanced");
  assert.equal(balancedOptimization.optimization_profile.applied, true);
  assert.equal((balancedOptimization.parsed as any).context_compaction_profile, "balanced");
  assert.deepEqual((balancedOptimization.parsed as any).context_layers.forgetting_policy.allowed_tiers, ["hot", "warm"]);
  assert.equal((balancedOptimization.parsed as any).static_injection.max_blocks, 4);
  const aggressiveOptimization = applyContextOptimizationProfile(planningOptimizedReq as any);
  assert.equal((aggressiveOptimization.parsed as any).context_compaction_profile, "aggressive");
  assert.deepEqual((aggressiveOptimization.parsed as any).context_layers.forgetting_policy.allowed_tiers, ["hot"]);
  assert.equal((aggressiveOptimization.parsed as any).context_layers.forgetting_policy.min_salience, 0.35);
  assert.equal((aggressiveOptimization.parsed as any).static_injection.min_score, 80);
  const endpointDefaultOptimization = applyContextOptimizationProfile(
    ContextAssembleRequest.parse({
      query_text: "x",
    }) as any,
    "balanced",
  );
  assert.equal(endpointDefaultOptimization.optimization_profile.requested, "balanced");
  assert.equal(endpointDefaultOptimization.optimization_profile.source, "endpoint_default");
  assert.equal((endpointDefaultOptimization.parsed as any).context_compaction_profile, "balanced");
  const manualOptimization = applyContextOptimizationProfile(
    ContextAssembleRequest.parse({
      query_text: "x",
      context_optimization_profile: "balanced",
      context_compaction_profile: "aggressive",
      context_layers: { forgetting_policy: { allowed_tiers: ["hot"], exclude_archived: true } },
      static_injection: { max_blocks: 1, min_score: 95 },
    }) as any,
  );
  assert.equal(manualOptimization.optimization_profile.applied, false);
  assert.equal(manualOptimization.optimization_profile.source, "request_override");
  assert.equal(manualOptimization.optimization_profile.forgetting_policy_applied, false);
  assert.equal(manualOptimization.optimization_profile.static_injection_applied, false);
  assert.equal((manualOptimization.parsed as any).context_compaction_profile, "aggressive");
  const contextCostSignals = buildLayeredContextCostSignals({
    layered_context: {
      budget: { used_chars: 900 },
      forgetting: { dropped_items: 3, dropped_by_reason: { tier: 2, salience: 1 } },
      static_injection: { selected_blocks: 2, rejected_blocks: 1 },
    },
    context_est_tokens: 220,
    context_token_budget: 300,
    context_char_budget: 1200,
    context_compaction_profile: "aggressive",
    context_optimization_profile: "aggressive",
  });
  assert.equal(contextCostSignals.summary_version, "context_cost_signals_v1");
  assert.equal(contextCostSignals.within_token_budget, true);
  assert.equal(contextCostSignals.within_char_budget, true);
  assert.equal(contextCostSignals.forgotten_items, 3);
  assert.equal(contextCostSignals.static_blocks_selected, 2);
  assert.equal(contextCostSignals.primary_savings_levers.includes("optimization_profile:aggressive"), true);
  const planningSummary = buildPlanningSummary({
    rules: { considered: 6, matched: 2 },
    tools: {
      selection: { selected: "kubectl" },
      decision: { decision_id: "00000000-0000-0000-0000-00000000p101" },
    },
    layered_context: {
      stats: { forgotten_items: 3 },
      static_injection: { selected_blocks: 2 },
    },
    cost_signals: contextCostSignals,
    context_est_tokens: 220,
    context_compaction_profile: "aggressive",
    optimization_profile: "aggressive",
    recall_mode: "dense_edge",
  });
  assert.equal(planningSummary.summary_version, "planning_summary_v1");
  assert.equal(planningSummary.selected_tool, "kubectl");
  assert.equal(planningSummary.decision_id, "00000000-0000-0000-0000-00000000p101");
  assert.equal(planningSummary.rules_considered, 6);
  assert.equal(planningSummary.rules_matched, 2);
  assert.equal(planningSummary.context_est_tokens, 220);
  assert.equal(planningSummary.forgotten_items, 3);
  assert.equal(planningSummary.static_blocks_selected, 2);
  assert.equal(planningSummary.recall_mode, "dense_edge");
  const assemblySummary = buildAssemblySummary({
    rules: { considered: 4, matched: 1 },
    tools: {
      selection: { selected: "bash" },
      decision: { decision_id: "00000000-0000-0000-0000-00000000a101" },
    },
    layered_context: {
      stats: { forgotten_items: 2 },
      static_injection: { selected_blocks: 1 },
    },
    cost_signals: contextCostSignals,
    context_est_tokens: 180,
    context_compaction_profile: "balanced",
    optimization_profile: "aggressive",
    recall_mode: null,
    include_rules: true,
  });
  assert.equal(assemblySummary.summary_version, "assembly_summary_v1");
  assert.equal(assemblySummary.selected_tool, "bash");
  assert.equal(assemblySummary.decision_id, "00000000-0000-0000-0000-00000000a101");
  assert.equal(assemblySummary.rules_considered, 4);
  assert.equal(assemblySummary.rules_matched, 1);
  assert.equal(assemblySummary.include_rules, true);
  assert.equal(assemblySummary.context_est_tokens, 180);
  const layeredForgotten = assembleLayeredContext({
    recall: {
      context: {
        items: [
          { kind: "event", node_id: "evt_hot", summary: "hot event", tier: "hot", salience: 0.9, lifecycle_state: "active" },
          { kind: "event", node_id: "evt_cold", summary: "cold event", tier: "cold", salience: 0.9, lifecycle_state: "active" },
          { kind: "event", node_id: "evt_archived", summary: "archived event", tier: "warm", salience: 0.9, lifecycle_state: "archived" },
          { kind: "entity", node_id: "ent_low", summary: "low entity", tier: "warm", salience: 0.1, lifecycle_state: "active" },
        ],
        citations: [
          { node_id: "evt_hot", uri: "aionis://memory/event/evt_hot", tier: "hot", salience: 0.9, lifecycle_state: "active" },
          { node_id: "evt_cold", uri: "aionis://memory/event/evt_cold", tier: "cold", salience: 0.9, lifecycle_state: "active" },
        ],
      },
    },
    rules: {},
    tools: {},
    config: {
      enabled: ["facts", "episodes", "citations"],
      forgetting_policy: {
        allowed_tiers: ["hot", "warm"],
        exclude_archived: true,
        min_salience: 0.2,
      },
      include_merge_trace: true,
    },
  });
  assert.match(layeredForgotten.merged_text, /hot event/);
  assert.doesNotMatch(layeredForgotten.merged_text, /cold event/);
  assert.doesNotMatch(layeredForgotten.merged_text, /archived event/);
  assert.doesNotMatch(layeredForgotten.merged_text, /low entity/);
  assert.equal(layeredForgotten.stats?.forgotten_items, 4);
  assert.equal(layeredForgotten.forgetting?.dropped_by_reason?.tier, 2);
  assert.equal(layeredForgotten.forgetting?.dropped_by_reason?.lifecycle, 1);
  assert.equal(layeredForgotten.forgetting?.dropped_by_reason?.salience, 1);
  const layeredStatic = assembleLayeredContext({
    recall: { context: { items: [], citations: [] } },
    rules: {},
    tools: {},
    query_text: "prepare production deploy plan",
    execution_context: { intent: "deploy", environment: "prod" },
    tool_candidates: ["kubectl", "bash"],
    static_blocks: [
      {
        id: "deploy_bootstrap",
        title: "Deploy Bootstrap",
        content: "Require approval before prod deploy and collect rollback refs.",
        intents: ["deploy"],
        tools: ["kubectl"],
        priority: 70,
      },
      {
        id: "support_playbook",
        title: "Support Bootstrap",
        content: "Escalate severe tickets to support lead.",
        intents: ["support"],
        tools: ["jira"],
        priority: 60,
      },
    ],
    static_injection: {
      max_blocks: 1,
      min_score: 50,
      include_selection_trace: true,
    },
    config: {
      enabled: ["static"],
    },
  });
  assert.match(layeredStatic.merged_text, /Deploy Bootstrap/);
  assert.doesNotMatch(layeredStatic.merged_text, /Support Bootstrap/);
  assert.equal(layeredStatic.static_injection?.selected_blocks, 1);
  assert.equal(layeredStatic.static_injection?.rejected_blocks, 1);
  assert.deepEqual(layeredStatic.static_injection?.selected_ids, ["deploy_bootstrap"]);
  const writeDistillDefaults = MemoryWriteRequest.parse({
    input_text: "distill me",
    distill: {},
  });
  assert.equal(writeDistillDefaults.distill?.enabled, true);
  assert.deepEqual(writeDistillDefaults.distill?.sources, ["input_text", "event_nodes", "evidence_nodes"]);
  assert.equal(writeDistillDefaults.distill?.max_evidence_nodes, 4);
  assert.equal(writeDistillDefaults.distill?.max_fact_nodes, 6);
  const packExportDefaults = MemoryPackExportRequest.parse({});
  assert.equal(packExportDefaults.include_decisions, false);
  const packImportWithDecisions = MemoryPackImportRequest.parse({
    pack: {
      version: "aionis_pack_v1",
      tenant_id: "default",
      scope: "default",
      nodes: [],
      edges: [],
      commits: [],
      decisions: [
        {
          decision_id: "00000000-0000-0000-0000-00000000d201",
          decision_uri: "aionis://default/default/decision/00000000-0000-0000-0000-00000000d201",
          decision_kind: "tools_select",
          commit_id: "00000000-0000-0000-0000-00000000c201",
        },
      ],
    },
  });
  assert.equal(packImportWithDecisions.pack.decisions.length, 1);
  const replayRunDefaults = ReplayPlaybookRunRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
  });
  assert.equal(replayRunDefaults.mode, "simulate");
  assert.equal(replayRunDefaults.max_steps, 200);
  const replayRunDeterministicGateDefaults = ReplayPlaybookRunRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
    deterministic_gate: {},
  });
  assert.equal(replayRunDeterministicGateDefaults.deterministic_gate?.enabled, true);
  assert.equal(replayRunDeterministicGateDefaults.deterministic_gate?.prefer_deterministic_execution, true);
  assert.equal(replayRunDeterministicGateDefaults.deterministic_gate?.on_mismatch, "fallback");
  assert.deepEqual(replayRunDeterministicGateDefaults.deterministic_gate?.required_statuses, ["shadow", "active"]);
  const replayRunStartDefaults = ReplayRunStartRequest.parse({
    goal: "deploy service",
  });
  assert.equal(replayRunStartDefaults.goal, "deploy service");
  const replayStepBeforeDefaults = ReplayStepBeforeRequest.parse({
    run_id: "55555555-5555-5555-5555-555555555551",
    step_index: 1,
    tool_name: "command",
    tool_input: { argv: ["echo", "ok"] },
  });
  assert.equal(replayStepBeforeDefaults.preconditions.length, 0);
  assert.equal(replayStepBeforeDefaults.safety_level, "needs_confirm");
  const replayStepAfterDefaults = ReplayStepAfterRequest.parse({
    run_id: "55555555-5555-5555-5555-555555555551",
    status: "success",
  });
  assert.equal(replayStepAfterDefaults.postconditions.length, 0);
  assert.equal(replayStepAfterDefaults.repair_applied, false);
  const replayRunEndDefaults = ReplayRunEndRequest.parse({
    run_id: "55555555-5555-5555-5555-555555555551",
    status: "success",
  });
  assert.equal(replayRunEndDefaults.status, "success");
  const replayRunGetDefaults = ReplayRunGetRequest.parse({
    run_id: "55555555-5555-5555-5555-555555555551",
  });
  assert.equal(replayRunGetDefaults.include_steps, true);
  assert.equal(replayRunGetDefaults.include_artifacts, true);
  const replayCompileDefaults = ReplayPlaybookCompileRequest.parse({
    run_id: "55555555-5555-5555-5555-555555555551",
  });
  assert.equal(replayCompileDefaults.version, 1);
  assert.equal(replayCompileDefaults.risk_profile, "medium");
  assert.equal(replayCompileDefaults.allow_partial, false);
  const replayCandidateDefaults = ReplayPlaybookCandidateRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
  });
  assert.equal(replayCandidateDefaults.version, undefined);
  const replayDispatchDefaults = ReplayPlaybookDispatchRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
  });
  assert.equal(replayDispatchDefaults.fallback_mode, "simulate");
  assert.equal(replayDispatchDefaults.execute_fallback, true);
  const replayPromoteParsed = ReplayPlaybookPromoteRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
    target_status: "shadow",
  });
  assert.equal(replayPromoteParsed.target_status, "shadow");
  const replayRepairDefaults = ReplayPlaybookRepairRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
    patch: { remove_step_indices: [2] },
  });
  assert.equal(replayRepairDefaults.review_required, true);
  assert.equal(replayRepairDefaults.target_status, "draft");
  const replayRepairReviewDefaults = ReplayPlaybookRepairReviewRequest.parse({
    playbook_id: "55555555-5555-5555-5555-555555555555",
    action: "approve",
  });
  assert.equal(replayRepairReviewDefaults.auto_shadow_validate, true);
  assert.equal(replayRepairReviewDefaults.target_status_on_approve, "shadow");
  assert.equal(replayRepairReviewDefaults.auto_promote_on_pass, false);
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

  const toolsFeedbackScope = "default";
  const toolsFeedbackRuleNodeId = "00000000-0000-0000-0000-000000000fd1";
  const toolsFeedbackDecisionId = "00000000-0000-0000-0000-000000000fd2";
  const toolsFeedbackRuntime = createEmbeddedMemoryRuntime();
  await toolsFeedbackRuntime.applyWrite(
    {
      scope: toolsFeedbackScope,
      auto_embed_effective: false,
      nodes: [
        {
          id: toolsFeedbackRuleNodeId,
          scope: toolsFeedbackScope,
          type: "rule",
          tier: "hot",
          memory_lane: "shared",
          text_summary: "tools feedback contract rule",
          slots: { if: {}, then: { tool: { allow: ["curl"] } }, exceptions: [] },
          embedding: Array.from({ length: 8 }, () => 0.1),
          embedding_model: "client",
        },
      ],
      edges: [],
    } as any,
    {
      commit_id: "00000000-0000-0000-0000-000000000fd3",
      commit_hash: "tools-feedback-rule-commit",
    } as any,
  );
  await toolsFeedbackRuntime.syncRuleDefs([
    {
      scope: toolsFeedbackScope,
      rule_node_id: toolsFeedbackRuleNodeId,
      state: "active",
      rule_scope: "global",
      target_agent_id: null,
      target_team_id: null,
      if_json: {},
      then_json: { tool: { allow: ["curl"] } },
      exceptions_json: [],
      positive_count: 0,
      negative_count: 0,
      commit_id: "00000000-0000-0000-0000-000000000fd3",
      updated_at: new Date().toISOString(),
    },
  ]);
  const toolsFeedbackBaseRequest = {
    tenant_id: "default",
    scope: toolsFeedbackScope,
    decision_id: toolsFeedbackDecisionId,
    run_id: "run_feedback_request_1",
    outcome: "positive" as const,
    context: { agent: { id: "agent_a", team_id: "team_a" } },
    candidates: ["curl", "psql"],
    selected_tool: "curl",
    include_shadow: false,
    rules_limit: 50,
    target: "tool" as const,
    input_text: "tools feedback contract smoke",
  };

  // decision_id lookup must remain DB-authoritative even when embedded runtime has stale/missing rows.
  await assert.rejects(
    () =>
      toolSelectionFeedback(
        new ToolsFeedbackFixturePgClient({ decisionsByLookup: [null] }) as any,
        toolsFeedbackBaseRequest,
        "default",
        "default",
        { maxTextLen: 8000, piiRedaction: false, embeddedRuntime: toolsFeedbackRuntime },
      ),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "decision_not_found_in_scope",
  );

  // run_id adoption must re-check DB row when UPDATE ... run_id IS NULL affects 0 rows.
  const toolsFeedbackDecisionCreatedAt = new Date().toISOString();
  await assert.rejects(
    () =>
      toolSelectionFeedback(
        new ToolsFeedbackFixturePgClient({
          decisionsByLookup: [
            {
              id: toolsFeedbackDecisionId,
              scope: toolsFeedbackScope,
              run_id: null,
              selected_tool: "curl",
              candidates_json: ["curl", "psql"],
              context_sha256: "ctx_tools_feedback",
              policy_sha256: "policy_tools_feedback",
              created_at: toolsFeedbackDecisionCreatedAt,
            },
            {
              id: toolsFeedbackDecisionId,
              scope: toolsFeedbackScope,
              run_id: "run_feedback_db_other",
              selected_tool: "curl",
              candidates_json: ["curl", "psql"],
              context_sha256: "ctx_tools_feedback",
              policy_sha256: "policy_tools_feedback",
              created_at: toolsFeedbackDecisionCreatedAt,
            },
          ],
          adoptRunIdRowCount: 0,
        }) as any,
        toolsFeedbackBaseRequest,
        "default",
        "default",
        { maxTextLen: 8000, piiRedaction: false, embeddedRuntime: toolsFeedbackRuntime },
      ),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "decision_run_id_mismatch",
  );

  const toolsLifecycleClient = new ToolsLifecycleFixturePgClient();
  const toolsDecisionOut = await getToolsDecisionById(
    toolsLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      decision_id: "00000000-0000-0000-0000-00000000f201",
    },
    "default",
    "default",
  );
  assert.equal((toolsDecisionOut as any).lifecycle_summary.summary_version, "tools_lifecycle_summary_v1");
  assert.equal((toolsDecisionOut as any).lifecycle_summary.kind, "decision");
  assert.equal((toolsDecisionOut as any).lifecycle_summary.selected_tool, "kubectl");
  assert.equal((toolsDecisionOut as any).lifecycle_summary.candidate_count, 3);
  assert.equal((toolsDecisionOut as any).lifecycle_summary.source_rule_count, 2);
  assert.equal((toolsDecisionOut as any).lifecycle_summary.metadata_source, "contract_smoke");
  assert.equal((toolsDecisionOut as any).lifecycle_summary.tool_conflicts.length, 2);

  const toolsRunOut = await getToolsRunLifecycle(
    toolsLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: "run_tools_contract_1",
      include_feedback: true,
    },
    "default",
    "default",
  );
  assert.equal((toolsRunOut as any).lifecycle_summary.summary_version, "tools_lifecycle_summary_v1");
  assert.equal((toolsRunOut as any).lifecycle_summary.kind, "run_lifecycle");
  assert.equal((toolsRunOut as any).lifecycle_summary.status, "feedback_linked");
  assert.equal((toolsRunOut as any).lifecycle_summary.decision_count, 2);
  assert.equal((toolsRunOut as any).lifecycle_summary.feedback_total, 3);
  assert.equal((toolsRunOut as any).lifecycle_summary.tools_feedback_count, 2);
  assert.equal((toolsRunOut as any).lifecycle_summary.recent_decisions.length, 2);
  assert.match((toolsRunOut as any).lifecycle_summary.recent_decisions[0], /kubectl @ 2026-03-11T08:00:00.000Z/);

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
    assertSubset(keys(n), ["id", "uri", "type", "title", "text_summary", "topic_state", "member_count"].filter(Boolean));
    assert.ok(typeof (n as any).uri === "string" && String((n as any).uri).startsWith("aionis://"));
  }
  assertSubset(keys(out.subgraph.edges[0]), ["id", "uri", "from_id", "to_id", "type", "weight"]);
  assert.ok(typeof (out.subgraph.edges[0] as any).uri === "string" && String((out.subgraph.edges[0] as any).uri).startsWith("aionis://"));
  for (const s of out.seeds as any[]) {
    assert.ok(typeof s.uri === "string" && String(s.uri).startsWith("aionis://"));
  }
  for (const r of out.ranked as any[]) {
    assert.ok(typeof r.uri === "string" && String(r.uri).startsWith("aionis://"));
  }
  for (const item of out.context.items as any[]) {
    assert.ok(typeof item.uri === "string" && String(item.uri).startsWith("aionis://"));
  }
  for (const c of out.context.citations as any[]) {
    assert.ok(typeof c.uri === "string" && String(c.uri).startsWith("aionis://"));
  }

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
  assert.equal(secretTokensEqual("admin-secret", "admin-secret"), true);
  assert.equal(secretTokensEqual("admin-secret", "admin-secreu"), false);
  assert.equal(secretTokensEqual("short", "much-longer"), false);
  assert.equal(secretTokensEqual("", "admin-secret"), false);

  // Remote sandbox transport hardening:
  // 1) request can be pinned to an already-validated resolved IP (avoid DNS rebind window)
  // 2) oversized response bodies are rejected before unbounded buffering
  const remoteProbeServer = createServer((req, res) => {
    if (req.url === "/ok") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/huge") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end("x".repeat(4096));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    remoteProbeServer.once("error", reject);
    remoteProbeServer.listen(0, "127.0.0.1", () => {
      remoteProbeServer.off("error", reject);
      resolve();
    });
  });
  try {
    const address = remoteProbeServer.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    const tls = { certPem: "", keyPem: "", caPem: "", serverName: "" };
    const pinnedHost = `sandbox-contract.invalid:${port}`;

    const ok = await postJsonWithTls(
      new URL(`http://${pinnedHost}/ok`),
      JSON.stringify({ probe: true }),
      { "content-type": "application/json" },
      2_000,
      new AbortController().signal,
      tls,
      { resolvedAddress: "127.0.0.1", maxBodyBytes: 1024 },
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.bodyText, "{\"ok\":true}");

    await assert.rejects(
      () =>
        postJsonWithTls(
          new URL(`http://${pinnedHost}/huge`),
          JSON.stringify({ probe: true }),
          { "content-type": "application/json" },
          2_000,
          new AbortController().signal,
          tls,
          { resolvedAddress: "127.0.0.1", maxBodyBytes: 128 },
        ),
      (err: any) => String(err?.message ?? err) === "response_too_large",
    );
  } finally {
    await new Promise<void>((resolve) => {
      remoteProbeServer.close(() => resolve());
    });
  }

  // Sandbox responses should expose a bounded result summary so upper layers can avoid reading raw output first.
  const sandboxClient = new SandboxFixturePgClient();
  const sandboxDefaults = {
    defaultScope: "default",
    defaultTenantId: "default",
    defaultTimeoutMs: 2000,
  };
  const sandboxExecuteOut = await enqueueSandboxRun(
    sandboxClient as any,
    {
      tenant_id: "default",
      scope: "default",
      session_id: "99999999-9999-9999-9999-999999999998",
      mode: "sync",
      action: { kind: "command", argv: ["echo", "hello"] },
    },
    sandboxDefaults,
  );
  assert.equal((sandboxExecuteOut as any).run.result_summary.summary_version, "tool_result_summary_v1");
  assert.deepEqual((sandboxExecuteOut as any).run.result_summary.result_keys, ["executor", "files_written", "ok"]);
  assert.equal((sandboxExecuteOut as any).run.result_summary.truncated, true);
  assert.equal((sandboxExecuteOut as any).run.result_summary.stdout_preview, "hello world from sandbox second line");
  assert.equal((sandboxExecuteOut as any).run.result_summary.signals.includes("stderr_present"), true);

  const sandboxRunGetOut = await getSandboxRun(
    sandboxClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: "99999999-9999-9999-9999-999999999999",
    },
    sandboxDefaults,
  );
  assert.equal((sandboxRunGetOut as any).run.result_summary.result_kind, "object");
  assert.equal((sandboxRunGetOut as any).run.result_summary.result_preview.includes("\"files_written\":2"), true);

  const sandboxLogsOut = await getSandboxRunLogs(
    sandboxClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: "99999999-9999-9999-9999-999999999999",
      tail_bytes: 12,
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
    },
  );
  assert.equal((sandboxLogsOut as any).logs.summary.summary_version, "tool_result_summary_v1");
  assert.equal((sandboxLogsOut as any).logs.summary.stdout_chars > (sandboxLogsOut as any).logs.stdout.length, true);

  const sandboxArtifactOut = await getSandboxRunArtifact(
    sandboxClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: "99999999-9999-9999-9999-999999999999",
      include_action: true,
      include_output: true,
      include_result: true,
      include_metadata: true,
      bundle_inline: false,
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
      artifactObjectStoreBaseUri: "s3://aionis-artifacts",
    },
  );
  assert.equal((sandboxArtifactOut as any).artifact.summary.summary_version, "tool_result_summary_v1");
  assert.equal(
    (sandboxArtifactOut as any).artifact.bundle.objects.some((entry: any) => entry.name === "summary.json"),
    true,
  );

  // Hybrid auth mode semantics: invalid API key must not block a valid JWT fallback.
  const nowSec = Math.floor(Date.now() / 1000);
  const jwtSecret = "contract-smoke-secret";
  const validJwt = signHs256Jwt({ tenant_id: "tenant_jwt", sub: "agent_jwt", exp: nowSec + 300 }, jwtSecret);
  const authOr = createAuthResolver({
    mode: "api_key_or_jwt",
    apiKeysJson: JSON.stringify({
      api_valid: { tenant_id: "tenant_key", agent_id: "agent_key", team_id: null, role: "member" },
    }),
    jwtHs256Secret: jwtSecret,
    jwtClockSkewSec: 0,
    jwtRequireExp: true,
  });
  const viaApiKey = authOr.resolve({ "x-api-key": "api_valid" });
  assert.equal(viaApiKey?.source, "api_key");
  const viaJwtFallback = authOr.resolve({
    "x-api-key": "api_invalid",
    authorization: `Bearer ${validJwt}`,
  });
  assert.equal(viaJwtFallback?.source, "jwt");
  assert.equal(viaJwtFallback?.tenant_id, "tenant_jwt");
  assert.equal(authOr.resolve({ "x-api-key": "api_invalid" }), null);

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

  // Find should expose a compact inventory summary before callers inspect full node payloads.
  const findClient = new FindFixturePgClient();
  const findOut = await memoryFind(
    findClient as any,
    {
      tenant_id: "default",
      scope: "default",
      text_contains: "deploy",
      consumer_agent_id: "agent_find",
      consumer_team_id: "team_ops",
      include_meta: false,
      include_slots_preview: true,
      slots_preview_keys: 2,
      limit: 2,
      offset: 0,
    },
    "default",
    "default",
  );
  assert.equal((findOut as any).find_summary.summary_version, "find_summary_v1");
  assert.equal((findOut as any).find_summary.returned_nodes, 2);
  assert.equal((findOut as any).find_summary.has_more, false);
  assert.equal((findOut as any).find_summary.slots_mode, "preview");
  assert.equal((findOut as any).find_summary.meta_included, false);
  assert.deepEqual((findOut as any).find_summary.type_counts, { event: 1, topic: 1 });
  assert.deepEqual((findOut as any).find_summary.tier_counts, { hot: 1, warm: 1 });
  assert.deepEqual((findOut as any).find_summary.memory_lane_counts, { private: 1, shared: 1 });
  assert.deepEqual((findOut as any).find_summary.filters_applied, ["text_contains", "consumer_agent_id", "consumer_team_id"]);
  assert.equal((findOut as any).nodes.length, 2);
  assert.deepEqual(Object.keys((findOut as any).nodes[0].slots_preview), ["env", "service"]);

  // Unified URI resolver: node/edge/commit/decision should all resolve with typed payloads.
  const resolveClient = new ResolveFixturePgClient();
  const nodeUri = "aionis://default/default/event/00000000-0000-0000-0000-000000001101";
  const edgeUri = "aionis://default/default/edge/00000000-0000-0000-0000-00000000e101";
  const commitUri = "aionis://default/default/commit/00000000-0000-0000-0000-00000000c101";
  const decisionUri = "aionis://default/default/decision/00000000-0000-0000-0000-00000000d101";

  const resolvedNode = await memoryResolve(
    resolveClient as any,
    { tenant_id: "default", scope: "default", uri: nodeUri, include_meta: true, include_slots_preview: true },
    "default",
    "default",
  );
  assert.equal((resolvedNode as any).type, "event");
  assert.equal((resolvedNode as any).node?.uri, nodeUri);
  assert.equal((resolvedNode as any).node?.commit_uri, commitUri);
  assert.equal((resolvedNode as any).resolve_summary.summary_version, "resolve_summary_v1");
  assert.equal((resolvedNode as any).resolve_summary.payload_kind, "node");
  assert.equal((resolvedNode as any).resolve_summary.include_meta, true);
  assert.equal((resolvedNode as any).resolve_summary.slots_mode, "preview");
  assert.deepEqual((resolvedNode as any).resolve_summary.related_uris, [commitUri, nodeUri]);

  const resolvedEdge = await memoryResolve(
    resolveClient as any,
    { tenant_id: "default", scope: "default", uri: edgeUri },
    "default",
    "default",
  );
  assert.equal((resolvedEdge as any).type, "edge");
  assert.equal((resolvedEdge as any).edge?.uri, edgeUri);
  assert.equal((resolvedEdge as any).edge?.src_uri, nodeUri);
  assert.equal((resolvedEdge as any).edge?.commit_uri, commitUri);
  assert.equal((resolvedEdge as any).resolve_summary.payload_kind, "edge");
  assert.equal((resolvedEdge as any).resolve_summary.related_uri_count, 4);

  const resolvedCommit = await memoryResolve(
    resolveClient as any,
    { tenant_id: "default", scope: "default", uri: commitUri },
    "default",
    "default",
  );
  assert.equal((resolvedCommit as any).type, "commit");
  assert.equal((resolvedCommit as any).commit?.uri, commitUri);
  assert.equal((resolvedCommit as any).commit?.parent_uri, "aionis://default/default/commit/00000000-0000-0000-0000-00000000c100");
  assert.equal((resolvedCommit as any).resolve_summary.payload_kind, "commit");
  assert.deepEqual((resolvedCommit as any).commit?.linked_object_counts, {
    nodes: 2,
    edges: 1,
    decisions: 1,
    total: 4,
  });

  const resolvedDecision = await memoryResolve(
    resolveClient as any,
    { tenant_id: "default", scope: "default", uri: decisionUri },
    "default",
    "default",
  );
  assert.equal((resolvedDecision as any).type, "decision");
  assert.equal((resolvedDecision as any).decision?.decision_uri, decisionUri);
  assert.equal((resolvedDecision as any).decision?.commit_uri, commitUri);
  assert.equal((resolvedDecision as any).resolve_summary.payload_kind, "decision");
  assert.deepEqual((resolvedDecision as any).resolve_summary.object_keys, [
    "commit_id",
    "decision_id",
    "decision_kind",
    "run_id",
    "selected_tool",
  ]);

  await assert.rejects(
    () =>
      memoryResolve(
        resolveClient as any,
        { tenant_id: "other_tenant", scope: "default", uri: nodeUri },
        "default",
        "default",
      ),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "conflicting_filters",
  );

  const replayPlaybookId = "55555555-5555-5555-5555-555555555555";
  const replayCreatedAt = new Date().toISOString();
  const replayFixtureRows = [
    {
      id: "55555555-5555-5555-5555-555555555556",
      type: "procedure",
      title: "Deploy API",
      text_summary: "Replay playbook for deploy flow",
      slots: {
        replay_kind: "playbook",
        playbook_id: replayPlaybookId,
        version: 2,
        status: "draft",
        risk_profile: "medium",
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
        success_criteria: { must_exit_zero: true },
        steps_template: [
          {
            step_index: 1,
            tool_name: "command",
            tool_input_template: { argv: ["echo", "ok"] },
            preconditions: [{ kind: "always", value: true }],
            safety_level: "auto_ok",
          },
          {
            step_index: 2,
            tool_name: "command",
            tool_input_template: { argv: ["echo", "blocked"] },
            preconditions: [{ kind: "always", value: false }],
            safety_level: "needs_confirm",
          },
        ],
      },
      created_at: replayCreatedAt,
      updated_at: replayCreatedAt,
      commit_id: "55555555-5555-5555-5555-555555555557",
      version_num: 2,
      playbook_status: "draft",
      playbook_id: replayPlaybookId,
    },
    {
      id: "55555555-5555-5555-5555-555555555558",
      type: "procedure",
      title: "Deploy API",
      text_summary: "Older playbook version",
      slots: {
        replay_kind: "playbook",
        playbook_id: replayPlaybookId,
        version: 1,
        status: "shadow",
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
        steps_template: [
          {
            step_index: 1,
            tool_name: "command",
            tool_input_template: { argv: ["echo", "shadow-ok"] },
            preconditions: [{ kind: "always", value: true }],
            safety_level: "auto_ok",
          },
        ],
      },
      created_at: replayCreatedAt,
      updated_at: replayCreatedAt,
      commit_id: "55555555-5555-5555-5555-555555555559",
      version_num: 1,
      playbook_status: "shadow",
      playbook_id: replayPlaybookId,
    },
  ];
  const replayClient = new ReplayPlaybookFixturePgClient(replayFixtureRows);
  const replayGetOut = await replayPlaybookGet(
    replayClient as any,
    { tenant_id: "default", scope: "default", playbook_id: replayPlaybookId },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayGetOut as any).playbook.playbook_id, replayPlaybookId);
  assert.equal((replayGetOut as any).playbook.version, 2);
  assert.equal((replayGetOut as any).playbook.status, "draft");
  assert.equal(Array.isArray((replayGetOut as any).playbook.steps_template), true);
  assert.equal(
    (replayGetOut as any).playbook.uri,
    "aionis://default/default/procedure/55555555-5555-5555-5555-555555555556",
  );
  const replayCandidateOut = await replayPlaybookCandidate(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      version: 1,
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayCandidateOut as any).candidate.eligible_for_deterministic_replay, true);
  assert.equal((replayCandidateOut as any).candidate.recommended_mode, "strict");
  assert.equal((replayCandidateOut as any).candidate.next_action, "safe_to_skip_primary_inference");
  assert.deepEqual((replayCandidateOut as any).candidate.mismatch_reasons, []);
  assert.equal((replayCandidateOut as any).candidate.rejectable, false);
  assert.equal((replayCandidateOut as any).deterministic_gate.matched, true);
  assert.equal((replayCandidateOut as any).cost_signals.summary_version, "replay_cost_signals_v1");
  assert.equal((replayCandidateOut as any).cost_signals.deterministic_replay_eligible, true);
  assert.equal((replayCandidateOut as any).cost_signals.estimated_primary_model_calls_avoided, 1);
  const replayCandidateMismatchOut = await replayPlaybookCandidate(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayCandidateMismatchOut as any).candidate.eligible_for_deterministic_replay, false);
  assert.equal((replayCandidateMismatchOut as any).candidate.recommended_mode, "simulate");
  assert.equal((replayCandidateMismatchOut as any).candidate.next_action, "promote_or_select_a_replayable_playbook_version");
  assert.deepEqual((replayCandidateMismatchOut as any).candidate.mismatch_reasons, ["status_not_allowed_for_deterministic_replay"]);
  assert.equal((replayCandidateMismatchOut as any).candidate.rejectable, false);
  const replayDispatchCandidateOnlyOut = await replayPlaybookDispatch(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
      execute_fallback: false,
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayDispatchCandidateOnlyOut as any).dispatch.decision, "candidate_only");
  assert.equal((replayDispatchCandidateOnlyOut as any).dispatch.primary_inference_skipped, false);
  assert.equal((replayDispatchCandidateOnlyOut as any).replay, null);
  assert.equal((replayDispatchCandidateOnlyOut as any).cost_signals.fallback_executed, false);
  const replayDispatchDeterministicOut = await replayPlaybookDispatch(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      version: 1,
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
      params: {
        record_run: false,
        allow_local_exec: true,
        execution_backend: "sandbox_sync",
      },
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
      embeddedRuntime: null,
      writeOptions: {
        defaultScope: "default",
        defaultTenantId: "default",
        maxTextLen: 8000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        writeAccessShadowMirrorV2: true,
        embedder: null,
        embeddedRuntime: null,
      },
      localExecutor: {
        enabled: false,
        mode: "disabled",
        allowedCommands: new Set(["echo"]),
        workdir: process.cwd(),
        timeoutMs: 1000,
        stdioMaxBytes: 4096,
      },
      sandboxExecutor: async () => ({
        ok: true,
        status: "succeeded",
        stdout: "dispatch-ok\n",
        stderr: "",
        exit_code: 0,
        error: null,
        run_id: "88888888-8888-8888-8888-888888888888",
      }),
    },
  );
  assert.equal((replayDispatchDeterministicOut as any).dispatch.decision, "deterministic_replay_executed");
  assert.equal((replayDispatchDeterministicOut as any).dispatch.primary_inference_skipped, true);
  assert.equal((replayDispatchDeterministicOut as any).replay.mode, "strict");
  assert.equal((replayDispatchDeterministicOut as any).cost_signals.primary_inference_skipped, true);
  assert.equal((replayDispatchDeterministicOut as any).cost_signals.estimated_primary_model_calls_avoided, 1);
  const replayDispatchFallbackOut = await replayPlaybookDispatch(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
      fallback_mode: "simulate",
      params: { record_run: false },
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayDispatchFallbackOut as any).dispatch.decision, "fallback_replay_executed");
  assert.equal((replayDispatchFallbackOut as any).dispatch.primary_inference_skipped, false);
  assert.equal((replayDispatchFallbackOut as any).replay.mode, "simulate");
  assert.equal((replayDispatchFallbackOut as any).cost_signals.fallback_executed, true);

  const replayRunOut = await replayPlaybookRun(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      mode: "simulate",
      params: { record_run: false },
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayRunOut as any).mode, "simulate");
  assert.equal((replayRunOut as any).run, null);
  assert.equal((replayRunOut as any).summary.total_steps, 2);
  assert.equal((replayRunOut as any).summary.ready_steps, 1);
  assert.equal((replayRunOut as any).summary.blocked_steps, 1);
  assert.equal((replayRunOut as any).summary.replay_readiness, "blocked");
  assert.equal((replayRunOut as any).steps[1].readiness, "blocked");
  assert.equal((replayRunOut as any).deterministic_gate.matched, false);
  assert.equal((replayRunOut as any).deterministic_gate.decision, "disabled");
  assert.equal((replayRunOut as any).cost_signals.primary_inference_skipped, false);

  const replayDeterministicFallbackOut = await replayPlaybookRun(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      mode: "simulate",
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
      params: { record_run: false },
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((replayDeterministicFallbackOut as any).mode, "simulate");
  assert.equal((replayDeterministicFallbackOut as any).deterministic_gate.matched, false);
  assert.equal((replayDeterministicFallbackOut as any).deterministic_gate.decision, "fallback_to_requested_mode");
  assert.equal((replayDeterministicFallbackOut as any).execution.inference_skipped, false);
  assert.equal((replayDeterministicFallbackOut as any).cost_signals.deterministic_replay_eligible, false);

  const replayDeterministicRunOut = await replayPlaybookRun(
    replayClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: replayPlaybookId,
      version: 1,
      mode: "simulate",
      deterministic_gate: {
        matchers: { workflow: "deploy" },
        policy_constraints: { approval: "required" },
      },
      params: {
        record_run: false,
        allow_local_exec: true,
        execution_backend: "sandbox_sync",
      },
    },
    {
      defaultScope: "default",
      defaultTenantId: "default",
      embeddedRuntime: null,
      writeOptions: {
        defaultScope: "default",
        defaultTenantId: "default",
        maxTextLen: 8000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        writeAccessShadowMirrorV2: true,
        embedder: null,
        embeddedRuntime: null,
      },
      localExecutor: {
        enabled: false,
        mode: "disabled",
        allowedCommands: new Set(["echo"]),
        workdir: process.cwd(),
        timeoutMs: 1000,
        stdioMaxBytes: 4096,
      },
      sandboxExecutor: async () => ({
        ok: true,
        status: "succeeded",
        stdout: "shadow-ok\n",
        stderr: "",
        exit_code: 0,
        error: null,
        run_id: "77777777-7777-7777-7777-777777777777",
      }),
    },
  );
  assert.equal((replayDeterministicRunOut as any).mode, "strict");
  assert.equal((replayDeterministicRunOut as any).deterministic_gate.matched, true);
  assert.equal((replayDeterministicRunOut as any).deterministic_gate.decision, "promoted_to_strict");
  assert.equal((replayDeterministicRunOut as any).execution.inference_skipped, true);
  assert.equal((replayDeterministicRunOut as any).summary.failed_steps, 0);
  assert.equal((replayDeterministicRunOut as any).cost_signals.primary_inference_skipped, true);
  assert.equal((replayDeterministicRunOut as any).cost_signals.estimated_primary_model_calls_avoided, 1);
  assert.equal((replayDeterministicRunOut as any).steps[0].result_summary.summary_version, "tool_result_summary_v1");
  assert.equal((replayDeterministicRunOut as any).steps[0].result_summary.stdout_preview, "shadow-ok");
  assert.equal(
    (replayDeterministicRunOut as any).steps[0].result_summary.signals.includes("structured_result_object"),
    false,
  );

  await assert.rejects(
    () =>
      replayPlaybookRepairReview(
        replayClient as any,
        {
          tenant_id: "default",
          scope: "default",
          playbook_id: replayPlaybookId,
          action: "approve",
          auto_shadow_validate: false,
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
          embeddedRuntime: null,
        },
      ),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "replay_repair_patch_missing",
  );

  const replayReviewedClient = new ReplayPlaybookFixturePgClient([
    {
      ...replayFixtureRows[0],
      slots: {
        ...replayFixtureRows[0].slots,
        repair_patch: { remove_step_indices: [2] },
        repair_review: { state: "approved" },
      },
    },
  ]);
  await assert.rejects(
    () =>
      replayPlaybookRepairReview(
        replayReviewedClient as any,
        {
          tenant_id: "default",
          scope: "default",
          playbook_id: replayPlaybookId,
          action: "approve",
          auto_shadow_validate: false,
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
          embeddedRuntime: null,
        },
    ),
    (err: any) => err instanceof HttpError && err.statusCode === 409 && err.code === "replay_repair_not_pending_review",
  );

  const replayLifecycleClient = new ReplayLifecycleFixturePgClient();
  const replayLifecycleRunId = "66666666-6666-4666-8666-666666666661";
  const replayLifecycleStepId = "66666666-6666-4666-8666-666666666662";
  const replayWriteOpts = {
    defaultScope: "default",
    defaultTenantId: "default",
    maxTextLen: 8000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
    shadowDualWriteEnabled: false,
    shadowDualWriteStrict: false,
    writeAccessShadowMirrorV2: false,
    embedder: null,
    embeddedRuntime: null,
  };
  const runStartOut = await replayRunStart(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: replayLifecycleRunId,
      goal: "deploy api",
      metadata: { source: "contract_smoke" },
    },
    replayWriteOpts,
  );
  assert.equal((runStartOut as any).run_id, replayLifecycleRunId);
  assert.equal((runStartOut as any).status, "started");
  assert.equal(typeof (runStartOut as any).run_uri, "string");
  assert.equal(String((runStartOut as any).run_uri).startsWith("aionis://default/default/event/"), true);

  const stepBeforeOut = await replayStepBefore(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: replayLifecycleRunId,
      step_id: replayLifecycleStepId,
      step_index: 1,
      tool_name: "command",
      tool_input: { argv: ["echo", "ok"] },
      expected_output_signature: { stdout_contains: "ok" },
      preconditions: [{ kind: "always", value: true }],
      safety_level: "auto_ok",
    },
    replayWriteOpts,
  );
  assert.equal((stepBeforeOut as any).step_id, replayLifecycleStepId);
  assert.equal((stepBeforeOut as any).status, "pending");

  const stepAfterOut = await replayStepAfter(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: replayLifecycleRunId,
      step_id: replayLifecycleStepId,
      status: "success",
      output_signature: { stdout: "ok" },
      postconditions: [{ kind: "always", value: true }],
      artifact_refs: ["artifact://deploy/log"],
    },
    replayWriteOpts,
  );
  assert.equal((stepAfterOut as any).run_id, replayLifecycleRunId);
  assert.equal((stepAfterOut as any).status, "success");

  const runEndOut = await replayRunEnd(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: replayLifecycleRunId,
      status: "success",
      summary: "deploy replay finished",
      metrics: { total_steps: 1, succeeded_steps: 1 },
    },
    replayWriteOpts,
  );
  assert.equal((runEndOut as any).run_id, replayLifecycleRunId);
  assert.equal((runEndOut as any).status, "success");

  const runGetOut = await replayRunGet(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: replayLifecycleRunId,
      include_steps: true,
      include_artifacts: true,
    },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((runGetOut as any).run.run_id, replayLifecycleRunId);
  assert.equal((runGetOut as any).run.status, "success");
  assert.equal((runGetOut as any).run.goal, "deploy api");
  assert.equal((runGetOut as any).steps.length, 1);
  assert.equal((runGetOut as any).steps[0].step_id, replayLifecycleStepId);
  assert.equal((runGetOut as any).steps[0].status, "success");
  assert.deepEqual((runGetOut as any).artifacts, ["artifact://deploy/log"]);
  assert.equal((runGetOut as any).timeline.length, 4);

  const compiledPlaybookId = "66666666-6666-4666-8666-666666666663";
  const compileOut = await replayPlaybookCompileFromRun(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      run_id: replayLifecycleRunId,
      playbook_id: compiledPlaybookId,
      name: "deploy_api_compiled",
      metadata: { source: "contract_smoke" },
    },
    replayWriteOpts,
  );
  assert.equal((compileOut as any).playbook_id, compiledPlaybookId);
  assert.equal((compileOut as any).version, 1);
  assert.equal((compileOut as any).status, "draft");
  assert.equal((compileOut as any).source_run_id, replayLifecycleRunId);
  assert.equal((compileOut as any).compile_summary.source_run_status, "success");
  assert.equal((compileOut as any).compile_summary.steps_total, 1);

  const compiledGetOut = await replayPlaybookGet(
    replayLifecycleClient as any,
    { tenant_id: "default", scope: "default", playbook_id: compiledPlaybookId },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((compiledGetOut as any).playbook.version, 1);
  assert.equal((compiledGetOut as any).playbook.status, "draft");
  assert.equal((compiledGetOut as any).playbook.steps_template.length, 1);

  const promoteOut = await replayPlaybookPromote(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: compiledPlaybookId,
      target_status: "shadow",
      note: "promote for validation",
    },
    replayWriteOpts,
  );
  assert.equal((promoteOut as any).playbook_id, compiledPlaybookId);
  assert.equal((promoteOut as any).from_version, 1);
  assert.equal((promoteOut as any).to_version, 2);
  assert.equal((promoteOut as any).status, "shadow");

  const promoteUnchangedOut = await replayPlaybookPromote(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: compiledPlaybookId,
      target_status: "shadow",
    },
    replayWriteOpts,
  );
  assert.equal((promoteUnchangedOut as any).unchanged, true);
  assert.equal((promoteUnchangedOut as any).reason, "already_target_status_on_latest");

  const repairOut = await replayPlaybookRepair(
    replayLifecycleClient as any,
    {
      tenant_id: "default",
      scope: "default",
      playbook_id: compiledPlaybookId,
      patch: { remove_step_indices: [1] },
      note: "remove risky step",
    },
    replayWriteOpts,
  );
  assert.equal((repairOut as any).playbook_id, compiledPlaybookId);
  assert.equal((repairOut as any).from_version, 2);
  assert.equal((repairOut as any).to_version, 3);
  assert.equal((repairOut as any).status, "draft");
  assert.equal((repairOut as any).review_required, true);
  assert.equal((repairOut as any).review_state, "pending_review");

  const repairedGetOut = await replayPlaybookGet(
    replayLifecycleClient as any,
    { tenant_id: "default", scope: "default", playbook_id: compiledPlaybookId },
    { defaultScope: "default", defaultTenantId: "default", embeddedRuntime: null },
  );
  assert.equal((repairedGetOut as any).playbook.version, 3);
  assert.equal((repairedGetOut as any).playbook.status, "draft");
  assert.equal((repairedGetOut as any).playbook.steps_template.length, 0);

  const ruleVisibilityRows = [
    {
      rule_node_id: "00000000-0000-0000-0000-00000000r101",
      state: "active",
      rule_scope: "global",
      target_agent_id: null,
      target_team_id: null,
      rule_memory_lane: "shared",
      rule_owner_agent_id: null,
      rule_owner_team_id: null,
      if_json: {},
      then_json: { tool: { allow: ["bash"] } },
      exceptions_json: [],
      positive_count: 0,
      negative_count: 0,
      rule_commit_id: "00000000-0000-0000-0000-00000000c201",
      rule_summary: "shared rule",
      rule_slots: {},
      updated_at: new Date().toISOString(),
    },
    {
      rule_node_id: "00000000-0000-0000-0000-00000000r102",
      state: "active",
      rule_scope: "global",
      target_agent_id: null,
      target_team_id: null,
      rule_memory_lane: "private",
      rule_owner_agent_id: "agent_a",
      rule_owner_team_id: null,
      if_json: {},
      then_json: { tool: { deny: ["rm"] } },
      exceptions_json: [],
      positive_count: 0,
      negative_count: 0,
      rule_commit_id: "00000000-0000-0000-0000-00000000c202",
      rule_summary: "private rule",
      rule_slots: {},
      updated_at: new Date().toISOString(),
    },
  ];

  const rulesNoContext = await evaluateRules(
    new RulesEvaluateFixturePgClient(ruleVisibilityRows) as any,
    { tenant_id: "default", scope: "default", context: {}, include_shadow: false, limit: 10 },
    "default",
    "default",
  );
  assert.equal((rulesNoContext as any).matched, 1);
  assert.deepEqual(
    ((rulesNoContext as any).active ?? []).map((r: any) => r.rule_node_id).sort(),
    ["00000000-0000-0000-0000-00000000r101"],
  );
  assert.equal((rulesNoContext as any).agent_visibility_summary?.rule_scope?.filtered_by_lane, 1);
  assert.equal((rulesNoContext as any).agent_visibility_summary?.lane?.applied, true);
  assert.equal((rulesNoContext as any).agent_visibility_summary?.lane?.reason, "missing_agent_context_fail_closed");
  assert.equal((rulesNoContext as any).evaluation_summary.summary_version, "rules_evaluation_summary_v1");
  assert.equal((rulesNoContext as any).evaluation_summary.considered, 2);
  assert.equal((rulesNoContext as any).evaluation_summary.matched, 1);
  assert.equal((rulesNoContext as any).evaluation_summary.active_count, 1);
  assert.equal((rulesNoContext as any).evaluation_summary.filtered_by_lane, 1);
  assert.equal((rulesNoContext as any).evaluation_summary.selected_tool, "bash");
  assert.equal((rulesNoContext as any).evaluation_summary.allowed_tool_count, 1);

  const rulesWithAgent = await evaluateRules(
    new RulesEvaluateFixturePgClient(ruleVisibilityRows) as any,
    { tenant_id: "default", scope: "default", context: { agent: { id: "agent_a" } }, include_shadow: false, limit: 10 },
    "default",
    "default",
  );
  assert.equal((rulesWithAgent as any).matched, 2);
  assert.deepEqual(
    ((rulesWithAgent as any).active ?? []).map((r: any) => r.rule_node_id).sort(),
    ["00000000-0000-0000-0000-00000000r101", "00000000-0000-0000-0000-00000000r102"],
  );
  assert.equal((rulesWithAgent as any).evaluation_summary.summary_version, "rules_evaluation_summary_v1");
  assert.equal((rulesWithAgent as any).evaluation_summary.matched, 2);
  assert.equal((rulesWithAgent as any).evaluation_summary.active_count, 2);
  assert.equal((rulesWithAgent as any).evaluation_summary.filtered_by_lane, 0);
  assert.equal((rulesWithAgent as any).evaluation_summary.denied_tool_count, 1);
  assert.equal((rulesWithAgent as any).evaluation_summary.selected_tool, "bash");

  const appliedOnlyNoContext = await evaluateRulesAppliedOnly(
    new RulesEvaluateFixturePgClient(ruleVisibilityRows) as any,
    {
      scope: "default",
      tenant_id: "default",
      default_tenant_id: "default",
      context: {},
      include_shadow: false,
      limit: 10,
    },
  );
  assert.deepEqual(
    (((appliedOnlyNoContext as any).applied?.sources as any[]) ?? []).map((s: any) => s.rule_node_id).sort(),
    ["00000000-0000-0000-0000-00000000r101"],
  );
  assert.equal((appliedOnlyNoContext as any).agent_visibility_summary?.rule_scope?.filtered_by_lane, 1);

  const toolsSelectOut = await selectTools(
    new ToolsSelectFixturePgClient(ruleVisibilityRows) as any,
    {
      tenant_id: "default",
      scope: "default",
      context: { agent: { id: "agent_a" } },
      candidates: ["bash", "rm", "curl"],
      include_shadow: true,
      strict: false,
      rules_limit: 10,
      run_id: "run_tools_select_contract_1",
    },
    "default",
    "default",
  );
  assert.equal((toolsSelectOut as any).selection_summary.summary_version, "tools_selection_summary_v1");
  assert.equal((toolsSelectOut as any).selection_summary.selected_tool, "bash");
  assert.equal((toolsSelectOut as any).selection_summary.candidate_count, 3);
  assert.equal((toolsSelectOut as any).selection_summary.allowed_count, 1);
  assert.equal((toolsSelectOut as any).selection_summary.denied_count, 2);
  assert.equal((toolsSelectOut as any).selection_summary.matched_rules, 2);
  assert.equal((toolsSelectOut as any).selection_summary.source_rule_count, 2);
  assert.equal((toolsSelectOut as any).selection_summary.shadow_selected_tool, "bash");

  await assert.rejects(
    () =>
      upsertControlProject(
        createDbFixture({
          async query<T>(sql: string): Promise<QueryResult<T>> {
            const s = sql.replace(/\s+/g, " ").trim();
            if (s.includes("INSERT INTO control_projects") && s.includes("ON CONFLICT (project_id)")) {
              return { rows: [] as T[], rowCount: 0 };
            }
            if (s.includes("SELECT tenant_id FROM control_projects") && s.includes("WHERE project_id = $1")) {
              return { rows: [{ tenant_id: "tenant_b" } as any] as T[], rowCount: 1 };
            }
            throw new Error(`unexpected control project query: ${s}`);
          },
        }),
        { project_id: "proj_1", tenant_id: "tenant_a" },
      ),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 409 &&
      err.code === "project_tenant_mismatch" &&
      (err.details as any)?.project_tenant_id === "tenant_b",
  );

  await assert.rejects(
    () =>
      createControlApiKey(
        createDbFixture({
          async query<T>(sql: string): Promise<QueryResult<T>> {
            const s = sql.replace(/\s+/g, " ").trim();
            if (s.includes("SELECT tenant_id FROM control_projects") && s.includes("WHERE project_id = $1")) {
              return { rows: [{ tenant_id: "tenant_b" } as any] as T[], rowCount: 1 };
            }
            throw new Error(`unexpected control api key query: ${s}`);
          },
        }),
        { tenant_id: "tenant_a", project_id: "proj_1" },
      ),
    (err: any) =>
      err instanceof HttpError &&
      err.statusCode === 409 &&
      err.code === "project_tenant_mismatch" &&
      (err.details as any)?.project_tenant_id === "tenant_b",
  );

  // API key principal resolver must not cache successful lookups by default.
  let uncachedPositiveQueries = 0;
  const uncachedResolver = createApiKeyPrincipalResolver(
    createDbFixture({
      async query<T>(): Promise<QueryResult<T>> {
        uncachedPositiveQueries += 1;
        return {
          rows: [{ tenant_id: "default", agent_id: null, team_id: null, role: null, key_prefix: "ak_live_test" }] as any as T[],
          rowCount: 1,
        };
      },
    }),
    { negative_ttl_ms: 60_000, max_entries: 2 },
  );
  await uncachedResolver("k1");
  await uncachedResolver("k1");
  assert.equal(uncachedPositiveQueries, 2);

  // Negative cache should still suppress repeated misses.
  let negativeQueries = 0;
  const negativeResolver = createApiKeyPrincipalResolver(
    createDbFixture({
      async query<T>(): Promise<QueryResult<T>> {
        negativeQueries += 1;
        return { rows: [] as T[], rowCount: 0 };
      },
    }),
    { negative_ttl_ms: 60_000, max_entries: 2 },
  );
  await negativeResolver("missing");
  await negativeResolver("missing");
  assert.equal(negativeQueries, 1);

  // Optional positive cache remains bounded when explicitly enabled.
  let cachedPositiveQueries = 0;
  const cachedResolver = createApiKeyPrincipalResolver(
    createDbFixture({
      async query<T>(): Promise<QueryResult<T>> {
        cachedPositiveQueries += 1;
        return {
          rows: [{ tenant_id: "default", agent_id: null, team_id: null, role: null, key_prefix: "ak_live_test" }] as any as T[],
          rowCount: 1,
        };
      },
    }),
    { ttl_ms: 60_000, negative_ttl_ms: 60_000, max_entries: 2, cache_positive: true },
  );
  await cachedResolver("k1");
  await cachedResolver("k2");
  await cachedResolver("k3");
  assert.equal(cachedPositiveQueries, 3);
  await cachedResolver("k1"); // should be evicted when cache max_entries=2
  assert.equal(cachedPositiveQueries, 4);
  await cachedResolver("k3"); // latest key should still be cached
  assert.equal(cachedPositiveQueries, 4);

  // Automation graph validation: valid DAG accepted, cycle rejected.
  const validAutomation = {
    nodes: [
      { node_id: "install_env", kind: "playbook", playbook_id: "11111111-1111-1111-1111-111111111111" },
      { node_id: "approval", kind: "approval" },
      { node_id: "deploy", kind: "playbook", playbook_id: "22222222-2222-2222-2222-222222222222" },
    ],
    edges: [
      { from: "install_env", to: "approval", type: "on_success" },
      { from: "approval", to: "deploy", type: "on_success" },
    ],
  };
  const validatedAutomation = validateAutomationGraph(validAutomation as any);
  assert.deepEqual(validatedAutomation.start_node_ids, ["install_env"]);
  assert.deepEqual(validatedAutomation.topological_order, ["install_env", "approval", "deploy"]);

  await assert.rejects(
    async () =>
      validateAutomationGraph({
        nodes: [
          { node_id: "a", kind: "approval" },
          { node_id: "b", kind: "approval" },
        ],
        edges: [
          { from: "a", to: "b", type: "on_success" },
          { from: "b", to: "a", type: "on_success" },
        ],
      } as any),
    (err: any) => err instanceof HttpError && err.statusCode === 400 && err.code === "automation_graph_invalid",
  );

  await assert.rejects(
    async () =>
      validateAutomationGraph({
        nodes: [
          { node_id: "a", kind: "approval" },
          { node_id: "b", kind: "approval" },
        ],
        edges: [
          { from: "a", to: "b", type: "on_failure" },
        ],
      } as any),
    (err: any) => {
      const details = err && typeof err === "object" ? (err.details as Record<string, unknown> | undefined) : undefined;
      const issues = Array.isArray(details?.issues) ? details.issues : [];
      return (
        err instanceof HttpError
        && err.statusCode === 400
        && err.code === "automation_graph_invalid"
        && issues.some((issue: any) => issue.code === "unsupported_edge_type")
      );
    },
  );

  await assert.rejects(
    async () =>
      validateAutomationGraph({
        nodes: [
          { node_id: "producer", kind: "approval" },
          { node_id: "consumer", kind: "condition", expression: { exists: "$nodes.producer.output.value" } },
        ],
        edges: [],
      } as any),
    (err: any) => {
      const details = err && typeof err === "object" ? (err.details as Record<string, unknown> | undefined) : undefined;
      const issues = Array.isArray(details?.issues) ? details.issues : [];
      return (
        err instanceof HttpError
        && err.statusCode === 400
        && err.code === "automation_graph_invalid"
        && issues.some((issue: any) => issue.code === "binding_dependency_missing")
      );
    },
  );

  await assert.rejects(
    async () =>
      validateAutomationGraph({
        nodes: [
          { node_id: "producer", kind: "approval" },
          {
            node_id: "consumer",
            kind: "playbook",
            playbook_id: "33333333-3333-3333-3333-333333333333",
            inputs: { from_producer: "$nodes.producer.output.value" },
          },
        ],
        edges: [],
      } as any),
    (err: any) => {
      const details = err && typeof err === "object" ? (err.details as Record<string, unknown> | undefined) : undefined;
      const issues = Array.isArray(details?.issues) ? details.issues : [];
      return (
        err instanceof HttpError
        && err.statusCode === 400
        && err.code === "automation_graph_invalid"
        && issues.some((issue: any) => issue.code === "binding_dependency_missing")
      );
    },
  );

  await assert.rejects(
    async () =>
      validateAutomationGraph({
        nodes: [
          { node_id: "producer", kind: "playbook", playbook_id: "44444444-4444-4444-4444-444444444444" },
          {
            node_id: "gate",
            kind: "artifact_gate",
            required_artifacts: ["$nodes.producer.output.artifacts.bundle"],
          },
        ],
        edges: [],
      } as any),
    (err: any) => {
      const details = err && typeof err === "object" ? (err.details as Record<string, unknown> | undefined) : undefined;
      const issues = Array.isArray(details?.issues) ? details.issues : [];
      return (
        err instanceof HttpError
        && err.statusCode === 400
        && err.code === "automation_graph_invalid"
        && issues.some((issue: any) => issue.code === "binding_dependency_missing")
      );
    },
  );

  const transitiveBindingAutomation = validateAutomationGraph({
    nodes: [
      { node_id: "producer", kind: "approval" },
      { node_id: "intermediate", kind: "approval" },
      {
        node_id: "consumer",
        kind: "condition",
        expression: { exists: "$nodes.producer.output.value" },
      },
    ],
    edges: [
      { from: "producer", to: "intermediate", type: "on_success" },
      { from: "intermediate", to: "consumer", type: "on_success" },
    ],
  } as any);
  assert.deepEqual(transitiveBindingAutomation.topological_order, ["producer", "intermediate", "consumer"]);
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
