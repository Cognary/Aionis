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
} from "../../src/memory/schemas.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../../src/memory/write.ts";
import { registerSdkDemoMemoryFeedbackToolRoutes as registerMemoryFeedbackToolRoutes } from "../../src/routes/sdk-demo-memory-feedback-tools.ts";
import { createLiteRecallStore } from "../../src/store/lite-recall-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-pattern-suppress-route-"));
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

async function seedStablePattern(dbPath: string) {
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
      input_text: "seed stable pattern for suppression route tests",
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
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
  return {
    liteWriteStore,
    liteRecallStore,
    patternNodeId: out.nodes.find((node) => node.type === "concept")?.id ?? null,
  };
}

test("pattern suppress and unsuppress routes preserve learned credibility while toggling operator overlay", async () => {
  const app = Fastify();
  const { liteWriteStore, liteRecallStore, patternNodeId } = await seedStablePattern(tmpDbPath("route"));
  assert.ok(patternNodeId);
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

    const suppress = await app.inject({
      method: "POST",
      url: "/v1/memory/patterns/suppress",
      payload: {
        tenant_id: "default",
        scope: "default",
        anchor_id: patternNodeId,
        reason: "bad trusted pattern in current workspace",
      },
    });
    assert.equal(suppress.statusCode, 200);
    const suppressBody = PatternSuppressResponseSchema.parse(suppress.json());
    assert.equal(suppressBody.anchor_id, patternNodeId);
    assert.equal(suppressBody.credibility_state, "trusted");
    assert.equal(suppressBody.operator_override.suppressed, true);
    assert.equal(suppressBody.operator_override.mode, "shadow_learn");

    const afterSuppress = await liteWriteStore.findNodes({
      scope: "default",
      id: patternNodeId,
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 1,
      offset: 0,
    });
    assert.equal(afterSuppress.rows[0]?.slots.anchor_v1.credibility_state, "trusted");
    assert.equal(afterSuppress.rows[0]?.slots.operator_override_v1.suppressed, true);

    const unsuppress = await app.inject({
      method: "POST",
      url: "/v1/memory/patterns/unsuppress",
      payload: {
        tenant_id: "default",
        scope: "default",
        anchor_id: patternNodeId,
        reason: "re-enable after operator review",
      },
    });
    assert.equal(unsuppress.statusCode, 200);
    const unsuppressBody = PatternSuppressResponseSchema.parse(unsuppress.json());
    assert.equal(unsuppressBody.operator_override.suppressed, false);
    assert.equal(unsuppressBody.operator_override.last_action, "unsuppress");

    const afterUnsuppress = await liteWriteStore.findNodes({
      scope: "default",
      id: patternNodeId,
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 1,
      offset: 0,
    });
    assert.equal(afterUnsuppress.rows[0]?.slots.anchor_v1.credibility_state, "trusted");
    assert.equal(afterUnsuppress.rows[0]?.slots.operator_override_v1.suppressed, false);
  } finally {
    await app.close();
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});
