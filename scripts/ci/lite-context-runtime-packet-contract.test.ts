import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { FakeEmbeddingProvider } from "../../src/embeddings/fake.ts";
import { createRequestGuards } from "../../src/app/request-guards.ts";
import { registerHostErrorHandler } from "../../src/host/http-host.ts";
import { registerMemoryContextRuntimeRoutes } from "../../src/routes/memory-context-runtime.ts";
import {
  ContextAssembleRouteContractSchema,
  MemoryAnchorV1Schema,
  PlanningContextRouteContractSchema,
} from "../../src/memory/schemas.ts";
import { buildExecutionMemorySummaryBundle } from "../../src/app/planning-summary.ts";
import { updateRuleState } from "../../src/memory/rules.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../../src/memory/write.ts";
import { createLiteRecallStore } from "../../src/store/lite-recall-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function packetEntryIdentity(entry: any): string | null {
  if (typeof entry?.anchor_id === "string" && entry.anchor_id.trim().length > 0) return entry.anchor_id;
  if (typeof entry?.id === "string" && entry.id.trim().length > 0) return entry.id;
  if (typeof entry?.node_id === "string" && entry.node_id.trim().length > 0) return entry.node_id;
  return null;
}

function packetEntryLabels(entry: any): string[] {
  const labels = [
    typeof entry?.title === "string" ? entry.title.trim() : "",
    typeof entry?.summary === "string" ? entry.summary.trim() : "",
  ].filter((value) => value.length > 0);
  return [...new Set(labels)];
}

function assertPacketSectionMirrors(body: {
  planner_packet: {
    sections: Record<string, string[]>;
  };
  recommended_workflows: any[];
  candidate_workflows: any[];
  candidate_patterns: any[];
  trusted_patterns: any[];
  contested_patterns: any[];
  rehydration_candidates: any[];
  supporting_knowledge: any[];
}) {
  const sectionChecks: Array<{ section: string; entries: any[] }> = [
    { section: "recommended_workflows", entries: body.recommended_workflows },
    { section: "candidate_workflows", entries: body.candidate_workflows },
    { section: "candidate_patterns", entries: body.candidate_patterns },
    { section: "trusted_patterns", entries: body.trusted_patterns },
    { section: "contested_patterns", entries: body.contested_patterns },
    { section: "rehydration_candidates", entries: body.rehydration_candidates },
    { section: "supporting_knowledge", entries: body.supporting_knowledge },
  ];
  for (const check of sectionChecks) {
    const sectionLines = body.planner_packet.sections[check.section] ?? [];
    assert.equal(sectionLines.length, check.entries.length, `${check.section} mirror length mismatch`);
    check.entries.forEach((entry, index) => {
      const line = sectionLines[index] ?? "";
      const id = packetEntryIdentity(entry);
      const labels = packetEntryLabels(entry);
      if (id && check.section !== "supporting_knowledge") {
        assert.match(
          line,
          new RegExp(`(?:anchor|id)=${id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`),
          `${check.section}[${index}] missing canonical identity`,
        );
      }
      if (labels.length > 0) {
        assert.ok(
          labels.some((label) => new RegExp(label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).test(line)),
          `${check.section}[${index}] missing canonical label`,
        );
      }
    });
  }
}

function assertActionPacketSummaryMirrors(summary: {
  recommended_workflow_count: number;
  candidate_workflow_count: number;
  candidate_pattern_count: number;
  trusted_pattern_count: number;
  contested_pattern_count: number;
  rehydration_candidate_count: number;
  supporting_knowledge_count: number;
  workflow_anchor_ids: string[];
  candidate_workflow_anchor_ids: string[];
  candidate_pattern_anchor_ids: string[];
  trusted_pattern_anchor_ids: string[];
  contested_pattern_anchor_ids: string[];
  rehydration_anchor_ids: string[];
}, body: {
  recommended_workflows: any[];
  candidate_workflows: any[];
  candidate_patterns: any[];
  trusted_patterns: any[];
  contested_patterns: any[];
  rehydration_candidates: any[];
  supporting_knowledge: any[];
}) {
  assert.equal(summary.recommended_workflow_count, body.recommended_workflows.length);
  assert.equal(summary.candidate_workflow_count, body.candidate_workflows.length);
  assert.equal(summary.candidate_pattern_count, body.candidate_patterns.length);
  assert.equal(summary.trusted_pattern_count, body.trusted_patterns.length);
  assert.equal(summary.contested_pattern_count, body.contested_patterns.length);
  assert.equal(summary.rehydration_candidate_count, body.rehydration_candidates.length);
  assert.equal(summary.supporting_knowledge_count, body.supporting_knowledge.length);
  assert.deepEqual(summary.workflow_anchor_ids, body.recommended_workflows.map((entry) => packetEntryIdentity(entry)).filter(Boolean));
  assert.deepEqual(summary.candidate_workflow_anchor_ids, body.candidate_workflows.map((entry) => packetEntryIdentity(entry)).filter(Boolean));
  assert.deepEqual(summary.candidate_pattern_anchor_ids, body.candidate_patterns.map((entry) => packetEntryIdentity(entry)).filter(Boolean));
  assert.deepEqual(summary.trusted_pattern_anchor_ids, body.trusted_patterns.map((entry) => packetEntryIdentity(entry)).filter(Boolean));
  assert.deepEqual(summary.contested_pattern_anchor_ids, body.contested_patterns.map((entry) => packetEntryIdentity(entry)).filter(Boolean));
  assert.deepEqual(summary.rehydration_anchor_ids, body.rehydration_candidates.map((entry) => packetEntryIdentity(entry)).filter(Boolean));
}

function assertExecutionKernelBundle(body: {
  recommended_workflows: any[];
  candidate_workflows: any[];
  candidate_patterns: any[];
  trusted_patterns: any[];
  contested_patterns: any[];
  rehydration_candidates: any[];
  supporting_knowledge: any[];
  pattern_signals: any[];
  workflow_signals: any[];
  execution_kernel: {
    action_packet_summary: unknown;
    pattern_signal_summary: unknown;
    workflow_signal_summary: unknown;
    workflow_lifecycle_summary: unknown;
    workflow_maintenance_summary: unknown;
    pattern_lifecycle_summary: unknown;
    pattern_maintenance_summary: unknown;
  };
}) {
  const expected = buildExecutionMemorySummaryBundle({
    recommended_workflows: body.recommended_workflows,
    candidate_workflows: body.candidate_workflows,
    candidate_patterns: body.candidate_patterns,
    trusted_patterns: body.trusted_patterns,
    contested_patterns: body.contested_patterns,
    rehydration_candidates: body.rehydration_candidates,
    supporting_knowledge: body.supporting_knowledge,
    pattern_signals: body.pattern_signals,
    workflow_signals: body.workflow_signals,
  });
  assert.deepEqual(body.execution_kernel.action_packet_summary, expected.action_packet_summary);
  assert.deepEqual(body.execution_kernel.pattern_signal_summary, expected.pattern_signal_summary);
  assert.deepEqual(body.execution_kernel.workflow_signal_summary, expected.workflow_signal_summary);
  assert.deepEqual(body.execution_kernel.workflow_lifecycle_summary, expected.workflow_lifecycle_summary);
  assert.deepEqual(body.execution_kernel.workflow_maintenance_summary, expected.workflow_maintenance_summary);
  assert.deepEqual(body.execution_kernel.pattern_lifecycle_summary, expected.pattern_lifecycle_summary);
  assert.deepEqual(body.execution_kernel.pattern_maintenance_summary, expected.pattern_maintenance_summary);
}

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-context-runtime-"));
  return path.join(dir, `${name}.sqlite`);
}

function buildRequestGuards() {
  return createRequestGuards({
    env: {
      AIONIS_EDITION: "lite",
      MEMORY_AUTH_MODE: "off",
      TENANT_QUOTA_ENABLED: false,
      LITE_LOCAL_ACTOR_ID: "local-user",
      MEMORY_TENANT_ID: "default",
      MEMORY_SCOPE: "default",
      APP_ENV: "test",
      ADMIN_TOKEN: "",
      TRUST_PROXY: false,
      TRUSTED_PROXY_CIDRS: [],
      RATE_LIMIT_ENABLED: false,
      RATE_LIMIT_BYPASS_LOOPBACK: false,
      WRITE_RATE_LIMIT_MAX_WAIT_MS: 0,
      RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS: 0,
    } as any,
    embedder: FakeEmbeddingProvider,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });
}

async function seedContextRuntimeFixture(dbPath: string) {
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const queryText = "repair export failure in node tests";
  const [sharedEmbedding] = await FakeEmbeddingProvider.embed([queryText]);
  const workflowAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "workflow",
    anchor_level: "L2",
    task_signature: "repair-export-node-tests",
    workflow_signature: "fix-export-failure-workflow",
    summary: "Inspect failing test and patch export",
    tool_set: ["edit", "test"],
    outcome: {
      status: "success",
      result_class: "workflow_reuse",
      success_score: 0.91,
    },
    source: {
      source_kind: "playbook",
      node_id: randomUUID(),
      run_id: randomUUID(),
      playbook_id: randomUUID(),
    },
    payload_refs: {
      node_ids: [],
      decision_ids: [],
      run_ids: [],
      step_ids: [],
      commit_ids: [],
    },
    rehydration: {
      default_mode: "partial",
      payload_cost_hint: "medium",
      recommended_when: ["missing_log_detail"],
    },
    maintenance: {
      model: "lazy_online_v1",
      maintenance_state: "retain",
      offline_priority: "retain_workflow",
      lazy_update_fields: ["usage_count", "last_used_at"],
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
    workflow_promotion: {
      promotion_state: "stable",
      promotion_origin: "replay_promote",
      last_transition: "promoted_to_stable",
      last_transition_at: "2026-03-20T00:00:00Z",
      source_status: "active",
    },
    schema_version: "anchor_v1",
  });
  const patternAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: "stable",
    task_signature: "tools_select:repair-export:edit",
    task_class: "tools_select_pattern",
    workflow_signature: "stable-edit-pattern",
    summary: "Stable pattern: prefer edit for export repair after repeated successful runs.",
    tool_set: ["bash", "edit", "test"],
    selected_tool: "edit",
    outcome: {
      status: "success",
      result_class: "tool_selection_pattern_stable",
      success_score: 0.93,
    },
    source: {
      source_kind: "tool_decision",
      decision_id: randomUUID(),
    },
    payload_refs: {
      node_ids: [],
      decision_ids: [],
      run_ids: [randomUUID(), randomUUID()],
      step_ids: [],
      commit_ids: [],
    },
    metrics: {
      usage_count: 0,
      reuse_success_count: 2,
      reuse_failure_count: 0,
      distinct_run_count: 2,
      last_used_at: null,
    },
    promotion: {
      required_distinct_runs: 2,
      distinct_run_count: 2,
      observed_run_ids: [randomUUID(), randomUUID()],
      counter_evidence_count: 0,
      counter_evidence_open: false,
      stable_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      last_counter_evidence_at: null,
    },
    schema_version: "anchor_v1",
  });

  const prepared = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: "seed context runtime planner packet contract fixture",
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
        {
          id: randomUUID(),
          type: "procedure",
          title: "Fix export failure",
          text_summary: workflowAnchor.summary,
          slots: {
            summary_kind: "workflow_anchor",
            compression_layer: "L2",
            anchor_v1: workflowAnchor,
          },
          embedding: sharedEmbedding,
          embedding_model: FakeEmbeddingProvider.name,
          salience: 0.9,
          importance: 0.9,
          confidence: 0.9,
        },
        {
          id: randomUUID(),
          type: "event",
          title: "Replay Episode: Fix export failure",
          text_summary: "Replay repair learning episode for export failure",
          slots: {
            summary_kind: "workflow_candidate",
            compression_layer: "L1",
            execution_native_v1: {
              schema_version: "execution_native_v1",
              execution_kind: "workflow_candidate",
              summary_kind: "workflow_candidate",
              compression_layer: "L1",
              task_signature: "repair-export-node-tests",
              workflow_signature: "replay-learning-candidate-export-fix",
              anchor_kind: "workflow",
              anchor_level: "L1",
              workflow_promotion: {
                promotion_state: "candidate",
                promotion_origin: "replay_learning_episode",
                required_observations: 2,
                observed_count: 1,
                last_transition: "candidate_observed",
                last_transition_at: "2026-03-20T00:00:00Z",
                source_status: null,
              },
              maintenance: {
                model: "lazy_online_v1",
                maintenance_state: "observe",
                offline_priority: "promote_candidate",
                lazy_update_fields: ["usage_count", "last_used_at"],
                last_maintenance_at: "2026-03-20T00:00:00Z",
              },
            },
          },
          embedding: sharedEmbedding,
          embedding_model: FakeEmbeddingProvider.name,
          salience: 0.82,
          importance: 0.81,
          confidence: 0.78,
        },
        {
          id: randomUUID(),
          type: "concept",
          title: "Stable edit pattern",
          text_summary: patternAnchor.summary,
          slots: {
            summary_kind: "pattern_anchor",
            compression_layer: "L3",
            anchor_v1: patternAnchor,
          },
          embedding: sharedEmbedding,
          embedding_model: FakeEmbeddingProvider.name,
          salience: 0.85,
          importance: 0.88,
          confidence: 0.88,
        },
        {
          client_id: "rule:prefer-edit:repair-export",
          type: "rule",
          title: "Prefer edit for export repair",
          text_summary: "For repair_export tasks, prefer edit over the other tools.",
          slots: {
            if: {
              task_kind: { $eq: "repair_export" },
            },
            then: {
              tool: {
                prefer: ["edit"],
              },
            },
            exceptions: [],
            rule_scope: "global",
          },
        },
        {
          id: randomUUID(),
          type: "concept",
          title: "Exports often break on stale default export wiring",
          text_summary: "Generic export debugging note",
          embedding: sharedEmbedding,
          embedding_model: FakeEmbeddingProvider.name,
          salience: 0.4,
          importance: 0.35,
          confidence: 0.42,
        },
      ],
      edges: [],
    },
    "default",
    "default",
    {
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
    },
    null,
  );

  const out = await liteWriteStore.withTx(() =>
    applyMemoryWrite({} as any, prepared, {
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      associativeLinkOrigin: "memory_write",
      write_access: liteWriteStore,
    }),
  );
  const ruleNodeId = out.nodes.find((node) => node.type === "rule")?.id;
  assert.ok(ruleNodeId);

  await liteWriteStore.withTx(() =>
    updateRuleState({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      rule_node_id: ruleNodeId,
      state: "active",
      input_text: "activate prefer edit rule",
    }, "default", "default", {
      liteWriteStore,
    }),
  );

  return { liteWriteStore, liteRecallStore };
}

function registerContextRuntimeApp(args: {
  app: ReturnType<typeof Fastify>;
  liteWriteStore: ReturnType<typeof createLiteWriteStore>;
  liteRecallStore: ReturnType<typeof createLiteRecallStore>;
}) {
  const guards = buildRequestGuards();
  registerHostErrorHandler(args.app);
  registerMemoryContextRuntimeRoutes({
    app: args.app,
    env: {
      AIONIS_EDITION: "lite",
      APP_ENV: "test",
      MEMORY_SCOPE: "default",
      MEMORY_TENANT_ID: "default",
      LITE_LOCAL_ACTOR_ID: "local-user",
      MAX_TEXT_LEN: 10_000,
      PII_REDACTION: false,
      MEMORY_RECALL_TEXT_CONTEXT_TOKEN_BUDGET_DEFAULT: 4096,
      MEMORY_RECALL_STAGE1_EXACT_FALLBACK_ON_EMPTY: true,
      MEMORY_RECALL_ADAPTIVE_HARD_CAP_WAIT_MS: 0,
      MEMORY_PLANNING_CONTEXT_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
      MEMORY_CONTEXT_ASSEMBLE_OPTIMIZATION_PROFILE_DEFAULT: "balanced",
    } as any,
    embedder: FakeEmbeddingProvider,
    embeddedRuntime: null,
    liteWriteStore: args.liteWriteStore,
    liteRecallAccess: args.liteRecallStore.createRecallAccess(),
    recallTextEmbedBatcher: { stats: () => null },
    requireMemoryPrincipal: guards.requireMemoryPrincipal,
    withIdentityFromRequest: guards.withIdentityFromRequest,
    enforceRateLimit: guards.enforceRateLimit,
    enforceTenantQuota: guards.enforceTenantQuota,
    enforceRecallTextEmbedQuota: guards.enforceRecallTextEmbedQuota,
    buildRecallAuth: guards.buildRecallAuth,
    tenantFromBody: guards.tenantFromBody,
    acquireInflightSlot: guards.acquireInflightSlot,
    hasExplicitRecallKnobs: () => false,
    resolveRecallProfile: () => ({ profile: "balanced", source: "test" }),
    resolveExplicitRecallMode: () => ({
      mode: null,
      profile: "balanced",
      defaults: {},
      applied: false,
      reason: "test_default",
      source: "test",
    }),
    resolveClassAwareRecallProfile: (_endpoint, _body, baseProfile) => ({
      profile: baseProfile,
      defaults: {},
      enabled: false,
      applied: false,
      reason: "test_default",
      source: "test",
      workload_class: null,
      signals: [],
    }),
    withRecallProfileDefaults: (body) => ({ ...(body as Record<string, unknown>) }),
    resolveRecallStrategy: () => ({
      strategy: "local",
      defaults: {},
      applied: false,
    }),
    resolveAdaptiveRecallProfile: (profile) => ({
      profile,
      defaults: {},
      applied: false,
      reason: "test_default",
    }),
    resolveAdaptiveRecallHardCap: () => ({
      defaults: {},
      applied: false,
      reason: "test_default",
    }),
    inferRecallStrategyFromKnobs: () => "local",
    buildRecallTrajectory: () => ({ strategy: "local" }),
    embedRecallTextQuery: async (provider, queryText) => {
      const [vec] = await provider.embed([queryText]);
      return {
        vec,
        ms: 0,
        cache_hit: false,
        singleflight_join: false,
        queue_wait_ms: 0,
        batch_size: 1,
      };
    },
    mapRecallTextEmbeddingError: () => ({
      statusCode: 500,
      code: "embed_failed",
      message: "embedding failed",
    }),
    recordContextAssemblyTelemetryBestEffort: async () => {},
  });
}

test("planning_context returns aligned planner packet, action packet summary, and planner explanation", async () => {
  const dbPath = tmpDbPath("planning-context");
  const app = Fastify();
  const { liteWriteStore, liteRecallStore } = await seedContextRuntimeFixture(dbPath);
  try {
    registerContextRuntimeApp({ app, liteWriteStore, liteRecallStore });
    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/planning/context",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "repair export failure in node tests",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        tool_candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        return_layered_context: true,
      },
    });
    assert.equal(response.statusCode, 200);
    const body = PlanningContextRouteContractSchema.parse(response.json());
    assertPacketSectionMirrors(body);
    assertActionPacketSummaryMirrors(body.planning_summary.action_packet_summary, body);
    assertActionPacketSummaryMirrors(body.execution_kernel.action_packet_summary, body);
    assertExecutionKernelBundle(body);
    assert.equal(body.planner_packet.packet_version, "planner_packet_v1");
    assert.equal(body.recommended_workflows.length, 1);
    assert.equal(body.candidate_workflows.length, 1);
    assert.equal(body.workflow_signals.length, 2);
    assert.equal(body.workflow_signals.length, body.layered_context.workflow_signals.length);
    assert.equal(body.planner_packet.sections.candidate_workflows.length, 1);
    assert.equal(body.planning_summary.action_packet_summary.candidate_workflow_count, 1);
    assert.equal(body.execution_kernel.action_packet_summary.candidate_workflow_count, 1);
    assert.equal(body.candidate_patterns.length, body.planning_summary.action_packet_summary.candidate_pattern_count);
    assert.equal(body.trusted_patterns.length, 1);
    assert.equal(body.contested_patterns.length, body.planning_summary.action_packet_summary.contested_pattern_count);
    assert.equal(body.pattern_signals.length, body.layered_context.pattern_signals.length);
    assert.ok(body.rehydration_candidates.length >= 1);
    assert.equal(body.planner_packet.sections.rehydration_candidates.length, body.rehydration_candidates.length);
    assert.ok(body.supporting_knowledge.length >= 1);
    assert.equal(body.planning_summary.action_packet_summary.recommended_workflow_count, 1);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.stable_count, body.recommended_workflows.length);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.candidate_count, body.candidate_workflows.length);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.replay_source_count, 2);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.rehydration_ready_count, 1);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.promotion_ready_count, 0);
    assert.equal(body.planning_summary.workflow_signal_summary.stable_workflow_count, body.recommended_workflows.length);
    assert.equal(body.planning_summary.workflow_signal_summary.observing_workflow_count, body.candidate_workflows.length);
    assert.equal(body.planning_summary.workflow_signal_summary.promotion_ready_workflow_count, 0);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.transition_counts.candidate_observed, 1);
    assert.equal(body.planning_summary.workflow_lifecycle_summary.transition_counts.promoted_to_stable, 1);
    assert.equal(body.planning_summary.workflow_maintenance_summary.observe_count, 1);
    assert.equal(body.planning_summary.workflow_maintenance_summary.retain_count, 1);
    assert.equal(body.planning_summary.workflow_maintenance_summary.promote_candidate_count, 1);
    assert.equal(body.planning_summary.workflow_maintenance_summary.retain_workflow_count, 1);
    assert.equal(body.planning_summary.action_packet_summary.candidate_pattern_count, body.candidate_patterns.length);
    assert.equal(body.planning_summary.action_packet_summary.trusted_pattern_count, 1);
    assert.equal(body.planning_summary.action_packet_summary.rehydration_candidate_count, body.rehydration_candidates.length);
    assert.equal(body.planning_summary.action_packet_summary.supporting_knowledge_count, body.supporting_knowledge.length);
    assert.equal(body.execution_kernel.action_packet_summary.recommended_workflow_count, 1);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.stable_count, body.recommended_workflows.length);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.candidate_count, body.candidate_workflows.length);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.promotion_ready_count, 0);
    assert.equal(body.execution_kernel.workflow_signal_summary.stable_workflow_count, body.recommended_workflows.length);
    assert.equal(body.execution_kernel.workflow_signal_summary.observing_workflow_count, body.candidate_workflows.length);
    assert.equal(body.execution_kernel.workflow_signal_summary.promotion_ready_workflow_count, 0);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.transition_counts.candidate_observed, 1);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.transition_counts.promoted_to_stable, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.observe_count, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.retain_count, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.promote_candidate_count, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.retain_workflow_count, 1);
    assert.equal(body.execution_kernel.action_packet_summary.candidate_pattern_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.action_packet_summary.trusted_pattern_count, 1);
    assert.equal(body.execution_kernel.action_packet_summary.rehydration_candidate_count, body.rehydration_candidates.length);
    assert.equal(body.execution_kernel.action_packet_summary.supporting_knowledge_count, body.supporting_knowledge.length);
    assert.equal(body.execution_kernel.pattern_signal_summary.trusted_pattern_count, 1);
    assert.equal(body.execution_kernel.pattern_signal_summary.candidate_pattern_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.pattern_signal_summary.contested_pattern_count, body.contested_patterns.length);
    assert.equal(body.planning_summary.pattern_lifecycle_summary.trusted_count, body.trusted_patterns.length);
    assert.equal(body.planning_summary.pattern_lifecycle_summary.candidate_count, body.candidate_patterns.length);
    assert.equal(body.planning_summary.pattern_lifecycle_summary.contested_count, body.contested_patterns.length);
    assert.equal(body.planning_summary.pattern_maintenance_summary.retain_count, body.trusted_patterns.length);
    assert.equal(body.planning_summary.pattern_maintenance_summary.observe_count, body.candidate_patterns.length);
    assert.equal(body.planning_summary.pattern_maintenance_summary.review_count, body.contested_patterns.length);
    assert.equal(body.execution_kernel.pattern_lifecycle_summary.trusted_count, body.trusted_patterns.length);
    assert.equal(body.execution_kernel.pattern_lifecycle_summary.candidate_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.pattern_lifecycle_summary.contested_count, body.contested_patterns.length);
    assert.equal(body.execution_kernel.pattern_maintenance_summary.retain_count, body.trusted_patterns.length);
    assert.equal(body.execution_kernel.pattern_maintenance_summary.observe_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.pattern_maintenance_summary.review_count, body.contested_patterns.length);
    assert.match(body.planning_summary.planner_explanation, /workflow guidance: Fix export failure/);
    assert.match(body.planning_summary.planner_explanation, /candidate workflows visible but not yet promoted: Replay Episode: Fix export failure/);
    assert.match(body.planning_summary.planner_explanation, /selected tool: edit/);
    assert.match(body.planning_summary.planner_explanation, /trusted patterns available but not used: edit/);
    assert.match(body.planning_summary.planner_explanation, /rehydration available: Fix export failure/);
    assert.match(body.planning_summary.planner_explanation, new RegExp(`supporting knowledge appended: ${body.supporting_knowledge.length}`));
    assert.equal(body.tools.selection_summary.provenance_explanation, "selected tool: edit; candidate patterns visible but not yet trusted: edit");
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("context_assemble returns aligned planner packet, assembly summary, and execution kernel packet summary", async () => {
  const dbPath = tmpDbPath("context-assemble");
  const app = Fastify();
  const { liteWriteStore, liteRecallStore } = await seedContextRuntimeFixture(dbPath);
  try {
    registerContextRuntimeApp({ app, liteWriteStore, liteRecallStore });
    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/context/assemble",
      payload: {
        tenant_id: "default",
        scope: "default",
        query_text: "repair export failure in node tests",
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        include_rules: true,
        include_shadow: false,
        rules_limit: 20,
        tool_candidates: ["bash", "edit", "test"],
      },
    });
    assert.equal(response.statusCode, 200);
    const body = ContextAssembleRouteContractSchema.parse(response.json());
    assertPacketSectionMirrors(body);
    assertActionPacketSummaryMirrors(body.assembly_summary.action_packet_summary, body);
    assertActionPacketSummaryMirrors(body.execution_kernel.action_packet_summary, body);
    assertExecutionKernelBundle(body);
    assert.equal(body.planner_packet.packet_version, "planner_packet_v1");
    assert.deepEqual(body.planner_packet.sections.recommended_workflows.length, 1);
    assert.deepEqual(body.planner_packet.sections.candidate_workflows.length, 1);
    assert.equal(body.candidate_workflows.length, 1);
    assert.equal(body.workflow_signals.length, 2);
    assert.equal(body.workflow_signals.length, body.layered_context.workflow_signals.length);
    assert.equal(body.planner_packet.sections.candidate_patterns.length, body.candidate_patterns.length);
    assert.deepEqual(body.planner_packet.sections.trusted_patterns.length, 1);
    assert.equal(body.pattern_signals.length, body.layered_context.pattern_signals.length);
    assert.equal(body.planner_packet.sections.rehydration_candidates.length, body.rehydration_candidates.length);
    assert.equal(body.planner_packet.sections.supporting_knowledge.length, body.supporting_knowledge.length);
    assert.equal(body.assembly_summary.action_packet_summary.recommended_workflow_count, 1);
    assert.equal(body.assembly_summary.action_packet_summary.candidate_workflow_count, 1);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.stable_count, body.recommended_workflows.length);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.candidate_count, body.candidate_workflows.length);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.replay_source_count, 2);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.rehydration_ready_count, 1);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.promotion_ready_count, 0);
    assert.equal(body.assembly_summary.workflow_signal_summary.stable_workflow_count, body.recommended_workflows.length);
    assert.equal(body.assembly_summary.workflow_signal_summary.observing_workflow_count, body.candidate_workflows.length);
    assert.equal(body.assembly_summary.workflow_signal_summary.promotion_ready_workflow_count, 0);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.transition_counts.candidate_observed, 1);
    assert.equal(body.assembly_summary.workflow_lifecycle_summary.transition_counts.promoted_to_stable, 1);
    assert.equal(body.assembly_summary.workflow_maintenance_summary.observe_count, 1);
    assert.equal(body.assembly_summary.workflow_maintenance_summary.retain_count, 1);
    assert.equal(body.assembly_summary.workflow_maintenance_summary.promote_candidate_count, 1);
    assert.equal(body.assembly_summary.workflow_maintenance_summary.retain_workflow_count, 1);
    assert.equal(body.assembly_summary.action_packet_summary.candidate_pattern_count, body.candidate_patterns.length);
    assert.equal(body.assembly_summary.action_packet_summary.trusted_pattern_count, 1);
    assert.equal(body.assembly_summary.action_packet_summary.rehydration_candidate_count, body.rehydration_candidates.length);
    assert.equal(body.assembly_summary.action_packet_summary.supporting_knowledge_count, body.supporting_knowledge.length);
    assert.equal(body.execution_kernel.action_packet_summary.candidate_pattern_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.stable_count, body.recommended_workflows.length);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.candidate_count, body.candidate_workflows.length);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.promotion_ready_count, 0);
    assert.equal(body.execution_kernel.workflow_signal_summary.stable_workflow_count, body.recommended_workflows.length);
    assert.equal(body.execution_kernel.workflow_signal_summary.observing_workflow_count, body.candidate_workflows.length);
    assert.equal(body.execution_kernel.workflow_signal_summary.promotion_ready_workflow_count, 0);
    assert.equal(body.execution_kernel.workflow_lifecycle_summary.transition_counts.candidate_observed, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.observe_count, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.retain_count, 1);
    assert.equal(body.execution_kernel.workflow_maintenance_summary.promote_candidate_count, 1);
    assert.equal(body.execution_kernel.action_packet_summary.rehydration_candidate_count, body.rehydration_candidates.length);
    assert.equal(body.execution_kernel.pattern_signal_summary.trusted_pattern_count, body.trusted_patterns.length);
    assert.equal(body.execution_kernel.pattern_signal_summary.candidate_pattern_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.pattern_signal_summary.contested_pattern_count, body.contested_patterns.length);
    assert.equal(body.assembly_summary.pattern_lifecycle_summary.trusted_count, body.trusted_patterns.length);
    assert.equal(body.assembly_summary.pattern_lifecycle_summary.candidate_count, body.candidate_patterns.length);
    assert.equal(body.assembly_summary.pattern_lifecycle_summary.contested_count, body.contested_patterns.length);
    assert.equal(body.assembly_summary.pattern_maintenance_summary.retain_count, body.trusted_patterns.length);
    assert.equal(body.assembly_summary.pattern_maintenance_summary.observe_count, body.candidate_patterns.length);
    assert.equal(body.assembly_summary.pattern_maintenance_summary.review_count, body.contested_patterns.length);
    assert.equal(body.execution_kernel.pattern_lifecycle_summary.trusted_count, body.trusted_patterns.length);
    assert.equal(body.execution_kernel.pattern_lifecycle_summary.candidate_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.pattern_lifecycle_summary.contested_count, body.contested_patterns.length);
    assert.equal(body.execution_kernel.pattern_maintenance_summary.retain_count, body.trusted_patterns.length);
    assert.equal(body.execution_kernel.pattern_maintenance_summary.observe_count, body.candidate_patterns.length);
    assert.equal(body.execution_kernel.pattern_maintenance_summary.review_count, body.contested_patterns.length);
    assert.match(body.assembly_summary.planner_explanation, /workflow guidance: Fix export failure/);
    assert.match(body.assembly_summary.planner_explanation, /candidate workflows visible but not yet promoted: Replay Episode: Fix export failure/);
    assert.match(body.assembly_summary.planner_explanation, /trusted patterns available but not used: edit/);
    assert.match(body.assembly_summary.planner_explanation, new RegExp(`supporting knowledge appended: ${body.supporting_knowledge.length}`));
    assert.equal(body.tools.selection_summary.provenance_explanation, "selected tool: edit; candidate patterns visible but not yet trusted: edit");
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});
