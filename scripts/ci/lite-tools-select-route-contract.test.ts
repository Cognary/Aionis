import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { FakeEmbeddingProvider } from "../../src/embeddings/fake.ts";
import { createRequestGuards } from "../../src/app/request-guards.ts";
import { registerHostErrorHandler } from "../../src/host/http-host-bootstrap-shared.ts";
import {
  MemoryAnchorV1Schema,
  PatternSuppressResponseSchema,
  ToolsFeedbackResponseSchema,
  ToolsSelectRouteContractSchema,
} from "../../src/memory/schemas.ts";
import { updateRuleState } from "../../src/memory/rules.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../../src/memory/write.ts";
import { registerMemoryFeedbackToolRoutes } from "../../src/routes/memory-feedback-tools.ts";
import { createLiteRecallStore } from "../../src/store/lite-recall-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-tools-select-route-"));
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
      MAX_TEXT_LEN: 10000,
      PII_REDACTION: false,
      ALLOW_CROSS_SCOPE_EDGES: false,
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

function buildLiteEnv(overrides: Record<string, unknown> = {}) {
  return {
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
    MAX_TEXT_LEN: 10000,
    PII_REDACTION: false,
    ALLOW_CROSS_SCOPE_EDGES: false,
    TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: false,
    ...overrides,
  } as any;
}

async function insertAndActivateRule(
  liteWriteStore: ReturnType<typeof createLiteWriteStore>,
  preferredTool: string,
  ruleSuffix: string,
): Promise<string> {
  const prepared = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: `create rule prefer ${preferredTool} for export repair`,
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
        {
          client_id: `rule:prefer-${preferredTool}:${ruleSuffix}`,
          type: "rule",
          title: `Prefer ${preferredTool} for export repair`,
          text_summary: `For repair_export tasks, prefer ${preferredTool} over the other tools.`,
          slots: {
            if: {
              task_kind: { $eq: "repair_export" },
            },
            then: {
              tool: {
                prefer: [preferredTool],
              },
            },
            exceptions: [],
            rule_scope: "global",
          },
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
  const ruleNodeId = out.nodes[0]?.id ?? null;
  assert.ok(ruleNodeId);

  await liteWriteStore.withTx(() =>
    updateRuleState({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      rule_node_id: ruleNodeId,
      state: "active",
      input_text: `activate prefer ${preferredTool} rule`,
    }, "default", "default", {
      liteWriteStore,
    }),
  );

  return ruleNodeId;
}

async function seedActiveRules(
  dbPath: string,
  preferredTools: string[],
): Promise<{ liteWriteStore: ReturnType<typeof createLiteWriteStore>; ruleNodeIds: string[] }> {
  const liteWriteStore = createLiteWriteStore(dbPath);
  const ruleNodeIds: string[] = [];
  for (const [index, preferredTool] of preferredTools.entries()) {
    ruleNodeIds.push(await insertAndActivateRule(liteWriteStore, preferredTool, `route-${preferredTool}-${index + 1}`));
  }
  return { liteWriteStore, ruleNodeIds };
}

async function seedToolsSelectFixture(dbPath: string) {
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  const [sharedEmbedding] = await FakeEmbeddingProvider.embed(["repair export failure in node tests"]);
  const stablePattern = MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: "stable",
    credibility_state: "trusted",
    task_signature: "tools_select:repair-export:edit",
    task_class: "tools_select_pattern",
    task_family: "task:repair_export",
    error_family: "error:node-export-mismatch",
    workflow_signature: "stable-edit-pattern",
    summary: "Stable pattern: prefer edit for repair_export after repeated successful runs.",
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
      credibility_state: "trusted",
      previous_credibility_state: "candidate",
      last_transition: "promoted_to_trusted",
      last_transition_at: new Date().toISOString(),
      stable_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      last_counter_evidence_at: null,
    },
    trust_hardening: {
      task_family: "task:repair_export",
      error_family: "error:node-export-mismatch",
      observed_task_families: ["task:repair_export"],
      observed_error_families: ["error:node-export-mismatch"],
      distinct_task_family_count: 1,
      distinct_error_family_count: 1,
      post_contest_observed_run_ids: [],
      post_contest_distinct_run_count: 0,
      promotion_gate_kind: "current_distinct_runs_v1",
      promotion_gate_satisfied: true,
      revalidation_floor_kind: "post_contest_two_fresh_runs_v1",
      revalidation_floor_satisfied: true,
      task_affinity_weighting_enabled: true,
    },
    maintenance: {
      model: "lazy_online_v1",
      maintenance_state: "retain",
      offline_priority: "retain_trusted",
      lazy_update_fields: ["usage_count", "last_used_at"],
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
    schema_version: "anchor_v1",
  });

  const prepared = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: "seed tools select route contract fixture",
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
        {
          client_id: "rule:prefer-bash:repair-export",
          type: "rule",
          title: "Prefer bash for export repair",
          text_summary: "For repair_export tasks, prefer bash over the other tools.",
          slots: {
            if: {
              task_kind: { $eq: "repair_export" },
            },
            then: {
              tool: {
                prefer: ["bash"],
              },
            },
            exceptions: [],
            rule_scope: "global",
          },
        },
        {
          id: randomUUID(),
          type: "concept",
          title: "Stable edit pattern",
          text_summary: stablePattern.summary,
          slots: {
            summary_kind: "pattern_anchor",
            compression_layer: "L3",
            anchor_v1: stablePattern,
          },
          embedding: sharedEmbedding,
          embedding_model: FakeEmbeddingProvider.name,
          salience: 0.8,
          importance: 0.9,
          confidence: 0.9,
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
      input_text: "activate prefer bash rule",
    }, "default", "default", {
      liteWriteStore,
    }),
  );

  return { liteWriteStore, liteRecallStore };
}

test("tools_select route returns the stable execution-memory contract surface", async () => {
  const app = Fastify();
  const { liteWriteStore, liteRecallStore } = await seedToolsSelectFixture(tmpDbPath("route"));
  try {
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryFeedbackToolRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10000,
        PII_REDACTION: false,
      } as any,
      embedder: FakeEmbeddingProvider,
      embeddedRuntime: null,
      liteRecallAccess: liteRecallStore.createRecallAccess(),
      liteWriteStore,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: randomUUID(),
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: true,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = ToolsSelectRouteContractSchema.parse(response.json());
    assert.equal(body.selection.selected, "bash");
    assert.deepEqual(body.selection.preferred, ["bash"]);
    assert.deepEqual(body.selection.ordered.slice(0, 2), ["bash", "edit"]);
    assert.equal(body.pattern_matches.matched, 1);
    assert.equal(body.pattern_matches.trusted, 1);
    assert.deepEqual(body.pattern_matches.preferred_tools, ["edit"]);
    assert.equal(body.pattern_matches.anchors[0]?.selected_tool, "edit");
    assert.equal(body.pattern_matches.anchors[0]?.credibility_state, "trusted");
    assert.equal(body.pattern_matches.anchors[0]?.affinity_level, "same_task_family");
    assert.equal(body.pattern_matches.anchors[0]?.trust_hardening?.promotion_gate_kind, "current_distinct_runs_v1");
    assert.equal(body.pattern_matches.anchors[0]?.trust_hardening?.revalidation_floor_kind, "post_contest_two_fresh_runs_v1");
    assert.equal(body.pattern_matches.anchors[0]?.trust_hardening?.task_affinity_weighting_enabled, true);
    assert.deepEqual(body.decision.pattern_summary.used_trusted_pattern_tools, []);
    assert.deepEqual(body.decision.pattern_summary.used_trusted_pattern_anchor_ids, []);
    assert.deepEqual(body.decision.pattern_summary.used_trusted_pattern_affinity_levels ?? [], []);
    assert.deepEqual(body.decision.pattern_summary.skipped_contested_pattern_tools, []);
    assert.equal(body.selection_summary.trusted_pattern_count, 1);
    assert.equal(body.selection_summary.contested_pattern_count, 0);
    assert.equal(body.selection_summary.pattern_lifecycle_summary.trusted_count, 1);
    assert.equal(body.selection_summary.pattern_lifecycle_summary.candidate_count, 0);
    assert.equal(body.selection_summary.pattern_maintenance_summary.retain_count, 1);
    assert.deepEqual(body.selection_summary.used_trusted_pattern_affinity_levels ?? [], []);
    assert.equal(
      body.selection_summary.provenance_explanation,
      "selected tool: bash; trusted patterns available but not used: edit [same_task_family]",
    );
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("tools_select keeps suppressed trusted patterns visible but excludes them from trusted reuse", async () => {
  const app = Fastify();
  const { liteWriteStore, liteRecallStore } = await seedToolsSelectFixture(tmpDbPath("suppressed"));
  try {
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryFeedbackToolRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10000,
        PII_REDACTION: false,
      } as any,
      embedder: FakeEmbeddingProvider,
      embeddedRuntime: null,
      liteRecallAccess: liteRecallStore.createRecallAccess(),
      liteWriteStore,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const patternNode = await liteWriteStore.findNodes({
      scope: "default",
      type: "concept",
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 10,
      offset: 0,
    });
    const patternNodeId = patternNode.rows.find((row) => row.slots?.anchor_v1?.anchor_kind === "pattern")?.id;
    assert.ok(patternNodeId);

    const suppressResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/patterns/suppress",
      payload: {
        tenant_id: "default",
        scope: "default",
        anchor_id: patternNodeId,
        reason: "stop trusted reuse during operator review",
      },
    });
    assert.equal(suppressResponse.statusCode, 200);
    PatternSuppressResponseSchema.parse(suppressResponse.json());

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: randomUUID(),
        context: {
          task_kind: "repair_export",
          goal: "repair export failure in node tests",
          error: {
            signature: "node-export-mismatch",
          },
        },
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: true,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = ToolsSelectRouteContractSchema.parse(response.json());
    assert.equal(body.selection.selected, "bash");
    assert.equal(body.pattern_matches.matched, 1);
    assert.equal(body.pattern_matches.trusted, 0);
    assert.equal(body.pattern_matches.anchors[0]?.credibility_state, "trusted");
    assert.equal(body.pattern_matches.anchors[0]?.suppressed, true);
    assert.equal(body.pattern_matches.anchors[0]?.affinity_level, "same_task_family");
    assert.equal(body.selection_summary.trusted_pattern_count, 0);
    assert.equal(body.selection_summary.suppressed_pattern_count, 1);
    assert.deepEqual(body.selection_summary.used_trusted_pattern_tools, []);
    assert.deepEqual(body.selection_summary.used_trusted_pattern_affinity_levels ?? [], []);
    assert.deepEqual(body.selection_summary.skipped_suppressed_pattern_tools, ["edit"]);
    assert.deepEqual(body.selection_summary.skipped_suppressed_pattern_affinity_levels ?? [], ["same_task_family"]);
    assert.deepEqual(body.decision.pattern_summary.skipped_suppressed_pattern_tools, ["edit"]);
    assert.deepEqual(body.decision.pattern_summary.skipped_suppressed_pattern_affinity_levels ?? [], ["same_task_family"]);
    assert.equal(
      body.selection_summary.provenance_explanation,
      "selected tool: bash; suppressed patterns visible but operator-blocked: edit",
    );
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("tools feedback route can use internal static form_pattern provider without explicit review", async () => {
  const app = Fastify();
  const dbPath = tmpDbPath("tools-feedback-provider-route");
  const { liteWriteStore } = await seedActiveRules(dbPath, ["edit", "edit"]);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryFeedbackToolRoutes({
      app,
      env: buildLiteEnv({
        TOOLS_GOVERNANCE_STATIC_FORM_PATTERN_PROVIDER_ENABLED: true,
      }),
      embedder: FakeEmbeddingProvider,
      embeddedRuntime: null,
      liteRecallAccess: liteRecallStore.createRecallAccess(),
      liteWriteStore,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const runId = randomUUID();
    const context = {
      task_kind: "repair_export",
      goal: "repair export failure in node tests",
      error: {
        signature: "node-export-mismatch",
      },
    };

    const selectionResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/select",
      payload: {
        tenant_id: "default",
        scope: "default",
        run_id: runId,
        context,
        candidates: ["bash", "edit", "test"],
        include_shadow: false,
        rules_limit: 20,
        strict: true,
        reorder_candidates: false,
      },
    });
    assert.equal(selectionResponse.statusCode, 200);
    const selection = ToolsSelectRouteContractSchema.parse(selectionResponse.json());

    const feedbackResponse = await app.inject({
      method: "POST",
      url: "/v1/memory/tools/feedback",
      payload: {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        run_id: runId,
        decision_id: selection.decision.decision_id,
        outcome: "positive",
        context,
        candidates: ["bash", "edit", "test"],
        selected_tool: "edit",
        target: "tool",
        note: "Edit-based repair succeeded with grouped provider-backed evidence",
        input_text: "repair export failure in node tests",
      },
    });
    assert.equal(feedbackResponse.statusCode, 200);
    const parsed = ToolsFeedbackResponseSchema.parse(feedbackResponse.json());
    assert.equal(parsed.pattern_anchor?.pattern_state, "stable");
    assert.equal(parsed.pattern_anchor?.credibility_state, "trusted");
    assert.equal(parsed.governance_preview?.form_pattern.review_result?.review_version, "form_pattern_semantic_review_v1");
    assert.equal(parsed.governance_preview?.form_pattern.review_result?.adjudication.reason, "static provider found grouped signature evidence");
    assert.equal(parsed.governance_preview?.form_pattern.review_result?.adjudication.confidence, 0.85);
    assert.equal(parsed.governance_preview?.form_pattern.admissibility?.admissible, true);
    assert.equal(parsed.governance_preview?.form_pattern.policy_effect?.applies, true);
    assert.equal(parsed.governance_preview?.form_pattern.decision_trace.runtime_apply_changed_pattern_state, true);
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});
