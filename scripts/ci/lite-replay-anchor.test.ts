import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FakeEmbeddingProvider } from "../../src/embeddings/fake.ts";
import { replayPlaybookPromote } from "../../src/memory/replay.ts";
import { applyReplayMemoryWrite } from "../../src/memory/replay-write.ts";
import { memoryRecallParsed } from "../../src/memory/recall.ts";
import { MemoryRecallRequest } from "../../src/memory/schemas.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../../src/memory/write.ts";
import { createLiteRecallStore } from "../../src/store/lite-recall-store.ts";
import { createLiteReplayStore } from "../../src/store/lite-replay-store.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-replay-anchor-"));
  return path.join(dir, `${name}.sqlite`);
}

async function seedDraftPlaybook(args: {
  writeStorePath: string;
  playbookId: string;
  runId: string;
  status?: "draft" | "shadow" | "active";
}) {
  const liteWriteStore = createLiteWriteStore(args.writeStorePath);
  const liteReplayStore = createLiteReplayStore(args.writeStorePath);
  const sourceClientId = `replay:playbook:${args.playbookId}:v1`;
  const status = args.status ?? "draft";
  try {
    const result = await applyReplayMemoryWrite({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: `compile playbook ${args.playbookId}`,
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
        {
          client_id: sourceClientId,
          type: "procedure",
          title: "Fix export failure",
          text_summary: "Replay playbook compiled from failing export repair",
          slots: {
            replay_kind: "playbook",
            playbook_id: args.playbookId,
            name: "Fix export failure",
            version: 1,
            status,
            matchers: { task: "fix-export-failure" },
            success_criteria: { status: "success" },
            risk_profile: "medium",
            created_from_run_ids: [args.runId],
            source_run_id: args.runId,
            policy_constraints: {},
            steps_template: [
              {
                step_index: 1,
                tool_name: "edit",
                preconditions: [],
                postconditions: [],
                safety_level: "needs_confirm",
              },
              {
                step_index: 2,
                tool_name: "test",
                preconditions: [],
                postconditions: [],
                safety_level: "observe_only",
              },
            ],
            compile_summary: {
              source_run_id: args.runId,
              source_run_status: "success",
              steps_total: 2,
            },
          },
        },
      ],
      edges: [],
    }, {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: null,
      replayMirror: liteReplayStore,
      writeAccess: liteWriteStore,
    });

    const sourceNodeId = result.out.nodes[0]?.id ?? null;
    assert.ok(sourceNodeId);
    return { liteWriteStore, liteReplayStore, sourceNodeId, sourceClientId };
  } catch (err) {
    await liteReplayStore.close();
    await liteWriteStore.close();
    throw err;
  }
}

test("replayPlaybookPromote writes workflow anchor payload onto stable playbook versions", async () => {
  const dbPath = tmpDbPath("promote");
  const playbookId = randomUUID();
  const runId = randomUUID();
  const { liteWriteStore, liteReplayStore, sourceNodeId } = await seedDraftPlaybook({
    writeStorePath: dbPath,
    playbookId,
    runId,
  });
  try {
    const replayAccess = liteReplayStore.createReplayAccess();
    const out = await replayPlaybookPromote({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      playbook_id: playbookId,
      target_status: "active",
    }, {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: FakeEmbeddingProvider,
      replayAccess,
      replayMirror: liteReplayStore,
      writeAccess: liteWriteStore,
    });

    assert.ok(out.playbook_node_id);
    const { rows } = await liteWriteStore.findNodes({
      scope: "default",
      id: out.playbook_node_id,
      consumerAgentId: null,
      consumerTeamId: null,
      limit: 1,
      offset: 0,
    });
    const promoted = rows[0];
    assert.ok(promoted);
    assert.equal(promoted.embedding_status, "ready");
    assert.equal(promoted.slots.summary_kind, "workflow_anchor");
    assert.equal(promoted.slots.compression_layer, "L2");
    assert.equal(promoted.slots.anchor_v1.anchor_kind, "workflow");
    assert.equal(promoted.slots.anchor_v1.anchor_level, "L2");
    assert.equal(promoted.slots.anchor_v1.maintenance.maintenance_state, "retain");
    assert.equal(promoted.slots.anchor_v1.maintenance.offline_priority, "retain_workflow");
    assert.equal(promoted.slots.anchor_v1.workflow_promotion.promotion_state, "stable");
    assert.equal(promoted.slots.anchor_v1.workflow_promotion.promotion_origin, "replay_promote");
    assert.equal(promoted.slots.anchor_v1.workflow_promotion.last_transition, "promoted_to_stable");
    assert.equal(promoted.slots.anchor_v1.source.playbook_id, playbookId);
    assert.deepEqual(promoted.slots.anchor_v1.tool_set, ["edit", "test"]);
    assert.deepEqual(promoted.slots.anchor_v1.payload_refs.node_ids, [sourceNodeId]);
    assert.deepEqual(promoted.slots.anchor_v1.payload_refs.run_ids, [runId]);
  } finally {
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
});

test("stable replay playbook anchors are recallable through the procedure recall path", async () => {
  const dbPath = tmpDbPath("recall");
  const playbookId = randomUUID();
  const runId = randomUUID();
  const { liteWriteStore, liteReplayStore } = await seedDraftPlaybook({
    writeStorePath: dbPath,
    playbookId,
    runId,
  });
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const replayAccess = liteReplayStore.createReplayAccess();
    const promoted = await replayPlaybookPromote({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      playbook_id: playbookId,
      target_status: "active",
    }, {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: FakeEmbeddingProvider,
      replayAccess,
      replayMirror: liteReplayStore,
      writeAccess: liteWriteStore,
    });
    const { rows } = await liteWriteStore.findNodes({
      scope: "default",
      id: promoted.playbook_node_id ?? "",
      consumerAgentId: null,
      consumerTeamId: null,
      limit: 1,
      offset: 0,
    });
    const promotedNode = rows[0];
    assert.ok(promotedNode);
    const anchor = promotedNode.slots.anchor_v1;
    const embedText = `${promotedNode.title}\n${anchor.summary}\n${anchor.tool_set.join(" ")}\n${anchor.task_signature}`;
    const queryEmbedding = (await FakeEmbeddingProvider.embed([embedText]))[0];
    const recall = await memoryRecallParsed(
      {} as any,
      MemoryRecallRequest.parse({
        tenant_id: "default",
        scope: "default",
        query_embedding: queryEmbedding,
        limit: 5,
        neighborhood_hops: 1,
        max_nodes: 10,
        max_edges: 10,
        ranked_limit: 10,
      }),
      "default",
      "default",
      { allow_debug_embeddings: false },
      undefined,
      "planning_context",
      { recall_access: liteRecallStore.createRecallAccess(), internal_allow_l4_selection: true },
    );

    assert.ok(recall.seeds.some((seed) => seed.id === promoted.playbook_node_id && seed.type === "procedure"));
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.source_kind, "playbook");
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.promotion_origin, "replay_promote");
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.last_transition, "promoted_to_stable");
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.rehydration_default_mode, "partial");
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.maintenance_state, "retain");
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.offline_priority, "retain_workflow");
    assert.ok(recall.context.items.some((item) => item.kind === "procedure" && item.node_id === promoted.playbook_node_id));
    assert.ok(Array.isArray((recall as any).runtime_tool_hints));
    assert.ok((recall as any).runtime_tool_hints.some((hint: any) => hint.anchor.id === promoted.playbook_node_id));
    assert.equal((recall as any).action_recall_packet.packet_version, "action_recall_v1");
    assert.ok((recall as any).action_recall_packet.recommended_workflows.some((entry: any) => entry.anchor_id === promoted.playbook_node_id));
    assert.ok((recall as any).action_recall_packet.rehydration_candidates.some((entry: any) => entry.anchor_id === promoted.playbook_node_id));
  } finally {
    await liteRecallStore.close();
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
});

test("planning recall prioritizes workflow anchors ahead of generic supporting concepts", async () => {
  const dbPath = tmpDbPath("planning-priority");
  const playbookId = randomUUID();
  const runId = randomUUID();
  const { liteWriteStore, liteReplayStore } = await seedDraftPlaybook({
    writeStorePath: dbPath,
    playbookId,
    runId,
  });
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const replayAccess = liteReplayStore.createReplayAccess();
    const promoted = await replayPlaybookPromote({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      playbook_id: playbookId,
      target_status: "active",
    }, {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: FakeEmbeddingProvider,
      replayAccess,
      replayMirror: liteReplayStore,
      writeAccess: liteWriteStore,
    });
    const { rows } = await liteWriteStore.findNodes({
      scope: "default",
      id: promoted.playbook_node_id ?? "",
      consumerAgentId: null,
      consumerTeamId: null,
      limit: 1,
      offset: 0,
    });
    const promotedNode = rows[0];
    assert.ok(promotedNode);
    const anchor = promotedNode.slots.anchor_v1;
    const embedText = `${promotedNode.title}\n${anchor.summary}\n${anchor.tool_set.join(" ")}\n${anchor.task_signature}`;
    const [queryEmbedding] = await FakeEmbeddingProvider.embed([embedText]);

    const prepared = await prepareMemoryWrite({
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      input_text: "seed generic concept near workflow anchor",
      auto_embed: false,
      memory_lane: "shared",
      nodes: [
        {
          client_id: "concept:supporting-knowledge",
          type: "concept",
          title: "Generic export debugging note",
          text_summary: "General note about fixing export-related failures in tests.",
          slots: {
            summary_kind: "write_distillation_fact",
            compression_layer: "L1",
          },
          embedding: queryEmbedding,
          embedding_model: FakeEmbeddingProvider.name,
          salience: 0.95,
          importance: 0.95,
          confidence: 0.95,
        },
      ],
      edges: [],
    }, "default", "default", {
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
    }, null);
    await liteWriteStore.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: liteWriteStore,
      }),
    );

    const recall = await memoryRecallParsed(
      {} as any,
      MemoryRecallRequest.parse({
        tenant_id: "default",
        scope: "default",
        query_embedding: queryEmbedding,
        limit: 5,
        neighborhood_hops: 1,
        max_nodes: 10,
        max_edges: 10,
        ranked_limit: 10,
      }),
      "default",
      "default",
      { allow_debug_embeddings: false },
      undefined,
      "planning_context",
      { recall_access: liteRecallStore.createRecallAccess(), internal_allow_l4_selection: true },
    );

    assert.equal(recall.ranked[0]?.id, promoted.playbook_node_id);
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.anchor_id, promoted.playbook_node_id);
    assert.ok((recall as any).action_recall_packet.supporting_knowledge.some((entry: any) => entry.title === "Generic export debugging note"));
  } finally {
    await liteRecallStore.close();
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
});

test("planning recall treats execution_native_v1 workflow procedures as action memory without anchor_v1", async () => {
  const dbPath = tmpDbPath("execution-native-recall");
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const workflowText = "Execution-native workflow only\nRepair export by inspect patch rerun\nrepair-export-node-tests";
    const conceptText = "Generic recall concept\nSupporting knowledge for export repair";
    const [workflowEmbedding, conceptEmbedding] = await FakeEmbeddingProvider.embed([workflowText, conceptText]);

    const prepared = await prepareMemoryWrite(
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        input_text: "seed execution-native recall",
        memory_lane: "shared",
        auto_embed: false,
        nodes: [
          {
            type: "procedure",
            title: "Execution-native workflow only",
            text_summary: "Repair export by inspect patch rerun",
            embedding: workflowEmbedding,
            embedding_model: "fake",
            slots: {
              execution_native_v1: {
                schema_version: "execution_native_v1",
                execution_kind: "workflow_anchor",
                summary_kind: "workflow_anchor",
                compression_layer: "L2",
                task_signature: "repair-export-node-tests",
                error_signature: "node-export-mismatch",
                workflow_signature: "inspect-patch-rerun",
                anchor_kind: "workflow",
                anchor_level: "L2",
              },
            },
          },
          {
            type: "concept",
            title: "Generic recall concept",
            text_summary: "Supporting knowledge for export repair",
            embedding: conceptEmbedding,
            embedding_model: "fake",
            slots: {
              summary_kind: "note",
            },
          },
        ],
        edges: [],
      },
      "default",
      "default",
      {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
      },
      null,
    );

    const writeOut = await liteWriteStore.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: liteWriteStore,
      }),
    );
    const workflowNodeId = writeOut.nodes.find((node) => node.type === "procedure")?.id ?? null;
    assert.ok(workflowNodeId);

    const [queryEmbedding] = await FakeEmbeddingProvider.embed([workflowText]);
    const recall = await memoryRecallParsed(
      {} as any,
      MemoryRecallRequest.parse({
        tenant_id: "default",
        scope: "default",
        query_embedding: queryEmbedding,
        limit: 5,
        neighborhood_hops: 1,
        max_nodes: 10,
        max_edges: 10,
        ranked_limit: 10,
      }),
      "default",
      "default",
      { allow_debug_embeddings: false },
      undefined,
      "planning_context",
      { recall_access: liteRecallStore.createRecallAccess(), internal_allow_l4_selection: true },
    );

    assert.equal(recall.seeds[0]?.id, workflowNodeId);
    assert.equal(recall.ranked[0]?.id, workflowNodeId);
    assert.ok((recall as any).action_recall_packet.recommended_workflows.some((entry: any) => entry.anchor_id === workflowNodeId));
  } finally {
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("planning recall surfaces execution_native_v1 workflow candidates separately from stable workflows", async () => {
  const dbPath = tmpDbPath("workflow-candidate-recall");
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const workflowText = "Replay Episode: Fix export failure\nReplay repair learning episode for export failure";
    const conceptText = "Generic recall concept\nSupporting knowledge for export repair";
    const [workflowEmbedding, conceptEmbedding] = await FakeEmbeddingProvider.embed([workflowText, conceptText]);

    const prepared = await prepareMemoryWrite(
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        input_text: "seed workflow candidate recall",
        memory_lane: "shared",
        auto_embed: false,
        nodes: [
          {
            type: "event",
            title: "Replay Episode: Fix export failure",
            text_summary: "Replay repair learning episode for export failure",
            embedding: workflowEmbedding,
            embedding_model: "fake",
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
          },
          {
            type: "concept",
            title: "Generic recall concept",
            text_summary: "Supporting knowledge for export repair",
            embedding: conceptEmbedding,
            embedding_model: "fake",
            slots: {
              summary_kind: "note",
            },
          },
        ],
        edges: [],
      },
      "default",
      "default",
      {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
      },
      null,
    );

    const writeOut = await liteWriteStore.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: liteWriteStore,
      }),
    );
    const workflowNodeId = writeOut.nodes.find((node) => node.type === "event")?.id ?? null;
    assert.ok(workflowNodeId);

    const [queryEmbedding] = await FakeEmbeddingProvider.embed([workflowText]);
    const recall = await memoryRecallParsed(
      {} as any,
      MemoryRecallRequest.parse({
        tenant_id: "default",
        scope: "default",
        query_embedding: queryEmbedding,
        limit: 5,
        neighborhood_hops: 1,
        max_nodes: 10,
        max_edges: 10,
        ranked_limit: 10,
      }),
      "default",
      "default",
      { allow_debug_embeddings: false },
      undefined,
      "planning_context",
      { recall_access: liteRecallStore.createRecallAccess(), internal_allow_l4_selection: true },
    );

    assert.equal(recall.ranked[0]?.id, workflowNodeId);
    assert.equal((recall as any).action_recall_packet.recommended_workflows.length, 0);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.anchor_id, workflowNodeId);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.promotion_state, "candidate");
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.required_observations, 2);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.observed_count, 1);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.last_transition, "candidate_observed");
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.maintenance_state, "observe");
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.offline_priority, "promote_candidate");
  } finally {
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("planning recall prioritizes promotion-ready workflow candidates ahead of non-ready candidates", async () => {
  const dbPath = tmpDbPath("candidate-workflow-priority");
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const workflowText = "Replay Episode: Fix export failure\nReplay repair learning episode for export failure";
    const [sharedEmbedding] = await FakeEmbeddingProvider.embed([workflowText]);

    const prepared = await prepareMemoryWrite(
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        input_text: "seed candidate workflow priority recall",
        memory_lane: "shared",
        auto_embed: false,
        nodes: [
          {
            client_id: "event:workflow-candidate-not-ready",
            type: "event",
            title: "Replay Episode: Fix export failure",
            text_summary: "Replay repair learning episode for export failure",
            embedding: sharedEmbedding,
            embedding_model: "fake",
            slots: {
              summary_kind: "workflow_candidate",
              compression_layer: "L1",
              execution_native_v1: {
                schema_version: "execution_native_v1",
                execution_kind: "workflow_candidate",
                summary_kind: "workflow_candidate",
                compression_layer: "L1",
                task_signature: "repair-export-node-tests",
                workflow_signature: "replay-learning-candidate-export-fix:not-ready",
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
          },
          {
            client_id: "event:workflow-candidate-ready",
            type: "event",
            title: "Replay Episode: Fix export failure",
            text_summary: "Replay repair learning episode for export failure",
            embedding: sharedEmbedding,
            embedding_model: "fake",
            slots: {
              summary_kind: "workflow_candidate",
              compression_layer: "L1",
              execution_native_v1: {
                schema_version: "execution_native_v1",
                execution_kind: "workflow_candidate",
                summary_kind: "workflow_candidate",
                compression_layer: "L1",
                task_signature: "repair-export-node-tests",
                workflow_signature: "replay-learning-candidate-export-fix:ready",
                anchor_kind: "workflow",
                anchor_level: "L1",
                workflow_promotion: {
                  promotion_state: "candidate",
                  promotion_origin: "replay_learning_episode",
                  required_observations: 2,
                  observed_count: 2,
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
          },
        ],
        edges: [],
      },
      "default",
      "default",
      {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
      },
      null,
    );

    const writeOut = await liteWriteStore.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: liteWriteStore,
      }),
    );
    const readyNodeId = writeOut.nodes.find((node) => node.client_id === "event:workflow-candidate-ready")?.id ?? null;
    const notReadyNodeId = writeOut.nodes.find((node) => node.client_id === "event:workflow-candidate-not-ready")?.id ?? null;
    assert.ok(readyNodeId);
    assert.ok(notReadyNodeId);

    const recall = await memoryRecallParsed(
      {} as any,
      MemoryRecallRequest.parse({
        tenant_id: "default",
        scope: "default",
        query_embedding: sharedEmbedding,
        limit: 5,
        neighborhood_hops: 1,
        max_nodes: 10,
        max_edges: 10,
        ranked_limit: 10,
      }),
      "default",
      "default",
      { allow_debug_embeddings: false },
      undefined,
      "planning_context",
      { recall_access: liteRecallStore.createRecallAccess(), internal_allow_l4_selection: true },
    );

    assert.equal(recall.ranked[0]?.id, readyNodeId);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.anchor_id, readyNodeId);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[0]?.promotion_ready, true);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[1]?.anchor_id, notReadyNodeId);
    assert.equal((recall as any).action_recall_packet.candidate_workflows[1]?.promotion_ready, false);
  } finally {
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("planning recall suppresses candidate workflows when a stable workflow with the same signature exists", async () => {
  const dbPath = tmpDbPath("candidate-workflow-suppressed-by-stable");
  const liteWriteStore = createLiteWriteStore(dbPath);
  const liteRecallStore = createLiteRecallStore(dbPath);
  try {
    const workflowText = "Replay learned workflow\nReplay repair learning episode for export failure";
    const [sharedEmbedding] = await FakeEmbeddingProvider.embed([workflowText]);

    const prepared = await prepareMemoryWrite(
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        input_text: "seed stable and candidate workflow with same signature",
        memory_lane: "shared",
        auto_embed: false,
        nodes: [
          {
            client_id: "procedure:workflow-stable",
            type: "procedure",
            title: "Replay Learned Workflow: Fix export failure",
            text_summary: "Replay repair learning episode for export failure",
            embedding: sharedEmbedding,
            embedding_model: "fake",
            slots: {
              summary_kind: "workflow_anchor",
              compression_layer: "L2",
              execution_native_v1: {
                schema_version: "execution_native_v1",
                execution_kind: "workflow_anchor",
                summary_kind: "workflow_anchor",
                compression_layer: "L2",
                task_signature: "repair-export-node-tests",
                workflow_signature: "replay-learning-candidate-export-fix",
                anchor_kind: "workflow",
                anchor_level: "L2",
                workflow_promotion: {
                  promotion_state: "stable",
                  promotion_origin: "replay_learning_auto_promotion",
                  required_observations: 2,
                  observed_count: 2,
                  last_transition: "promoted_to_stable",
                  last_transition_at: "2026-03-20T00:00:00Z",
                  source_status: null,
                },
                maintenance: {
                  model: "lazy_online_v1",
                  maintenance_state: "retain",
                  offline_priority: "retain_workflow",
                  lazy_update_fields: ["usage_count", "last_used_at"],
                  last_maintenance_at: "2026-03-20T00:00:00Z",
                },
                rehydration: {
                  default_mode: "partial",
                  payload_cost_hint: "medium",
                  recommended_when: ["workflow_summary_is_not_enough"],
                },
              },
            },
          },
          {
            client_id: "event:workflow-candidate-duplicate",
            type: "event",
            title: "Replay Episode: Fix export failure",
            text_summary: "Replay repair learning episode for export failure",
            embedding: sharedEmbedding,
            embedding_model: "fake",
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
          },
        ],
        edges: [],
      },
      "default",
      "default",
      {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
      },
      null,
    );

    const writeOut = await liteWriteStore.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: liteWriteStore,
      }),
    );
    const stableNodeId = writeOut.nodes.find((node) => node.client_id === "procedure:workflow-stable")?.id ?? null;
    assert.ok(stableNodeId);

    const recall = await memoryRecallParsed(
      {} as any,
      MemoryRecallRequest.parse({
        tenant_id: "default",
        scope: "default",
        query_embedding: sharedEmbedding,
        limit: 5,
        neighborhood_hops: 1,
        max_nodes: 10,
        max_edges: 10,
        ranked_limit: 10,
      }),
      "default",
      "default",
      { allow_debug_embeddings: false },
      undefined,
      "planning_context",
      { recall_access: liteRecallStore.createRecallAccess(), internal_allow_l4_selection: true },
    );

    assert.equal(recall.ranked[0]?.id, stableNodeId);
    assert.equal((recall as any).action_recall_packet.recommended_workflows[0]?.anchor_id, stableNodeId);
    assert.equal((recall as any).action_recall_packet.candidate_workflows.length, 0);
  } finally {
    await liteRecallStore.close();
    await liteWriteStore.close();
  }
});

test("replayPlaybookPromote normalizes latest stable playbooks onto workflow anchors without creating a new version", async () => {
  const dbPath = tmpDbPath("normalize-latest-stable");
  const playbookId = randomUUID();
  const runId = randomUUID();
  const { liteWriteStore, liteReplayStore, sourceNodeId } = await seedDraftPlaybook({
    writeStorePath: dbPath,
    playbookId,
    runId,
    status: "active",
  });
  try {
    const replayAccess = liteReplayStore.createReplayAccess();
    const beforeVersions = await replayAccess.listReplayPlaybookVersions("default", playbookId, {
      consumerAgentId: null,
      consumerTeamId: null,
    });
    assert.equal(beforeVersions.length, 1);
    assert.equal(beforeVersions[0]?.slots.anchor_v1, undefined);

    const out = await replayPlaybookPromote({} as any, {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      playbook_id: playbookId,
      target_status: "active",
    }, {
      defaultScope: "default",
      defaultTenantId: "default",
      maxTextLen: 10000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      writeAccessShadowMirrorV2: false,
      embedder: FakeEmbeddingProvider,
      replayAccess,
      replayMirror: liteReplayStore,
      writeAccess: liteWriteStore,
    });

    assert.equal(out.from_version, 1);
    assert.equal(out.to_version, 1);
    assert.equal(out.unchanged, false);
    assert.equal((out as any).reason, "normalized_latest_stable_anchor");
    assert.equal(out.playbook_node_id, sourceNodeId);

    const { rows } = await liteWriteStore.findNodes({
      scope: "default",
      id: sourceNodeId,
      consumerAgentId: null,
      consumerTeamId: null,
      limit: 1,
      offset: 0,
    });
    const latestNode = rows[0];
    assert.ok(latestNode);
    assert.equal(latestNode.embedding_status, "ready");
    assert.equal(latestNode.slots.summary_kind, "workflow_anchor");
    assert.equal(latestNode.slots.anchor_v1.anchor_kind, "workflow");
    assert.equal(latestNode.slots.anchor_v1.workflow_promotion.promotion_origin, "replay_stable_normalization");
    assert.equal(latestNode.slots.anchor_v1.workflow_promotion.last_transition, "normalized_latest_stable");
    assert.equal(latestNode.slots.anchor_v1.source.playbook_id, playbookId);
    assert.deepEqual(latestNode.slots.anchor_v1.payload_refs.node_ids, [sourceNodeId]);

    const afterVersions = await replayAccess.listReplayPlaybookVersions("default", playbookId, {
      consumerAgentId: null,
      consumerTeamId: null,
    });
    assert.equal(afterVersions.length, 1);
    assert.equal(afterVersions[0]?.id, sourceNodeId);
    assert.equal(afterVersions[0]?.slots.summary_kind, "workflow_anchor");
    assert.equal(afterVersions[0]?.slots.anchor_v1.anchor_kind, "workflow");
  } finally {
    await liteReplayStore.close();
    await liteWriteStore.close();
  }
});
