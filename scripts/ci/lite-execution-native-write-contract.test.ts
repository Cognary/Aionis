import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MemoryAnchorV1Schema } from "../../src/memory/schemas.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../../src/memory/write.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-execution-native-"));
  return path.join(dir, `${name}.sqlite`);
}

test("prepare/apply write normalizes execution-native metadata for anchors and distillation outputs", async () => {
  const dbPath = tmpDbPath("normalize");
  const store = createLiteWriteStore(dbPath);
  const workflowAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "workflow",
    anchor_level: "L2",
    task_signature: "repair-export-node-tests",
    error_signature: "node-export-mismatch",
    workflow_signature: "inspect-patch-rerun",
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
    schema_version: "anchor_v1",
  });
  const patternAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: "stable",
    task_signature: "tools_select:repair-export:edit",
    error_signature: "node-export-mismatch",
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
  try {
    const prepared = await prepareMemoryWrite(
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        producer_agent_id: "local-user",
        owner_agent_id: "local-user",
        input_text: [
          "Task Signature: repair-export-node-tests",
          "Error Signature: node-export-mismatch",
          "Workflow Signature: inspect-patch-rerun",
          "Export repair requires inspect, patch, and rerun.",
        ].join("\n"),
        auto_embed: false,
        distill: {
          enabled: true,
          sources: ["input_text"],
          max_evidence_nodes: 2,
          max_fact_nodes: 4,
          min_sentence_chars: 12,
          attach_edges: true,
        },
        nodes: [
          {
            type: "procedure",
            title: "Fix export failure",
            text_summary: workflowAnchor.summary,
            slots: {
              summary_kind: "workflow_anchor",
              compression_layer: "L2",
              anchor_v1: workflowAnchor,
            },
          },
          {
            type: "concept",
            title: "Stable edit pattern",
            text_summary: patternAnchor.summary,
            slots: {
              summary_kind: "pattern_anchor",
              compression_layer: "L3",
              anchor_v1: patternAnchor,
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

    const workflowPrepared = prepared.nodes.find((node) => node.slots?.summary_kind === "workflow_anchor");
    const patternPrepared = prepared.nodes.find((node) => node.slots?.summary_kind === "pattern_anchor");
    const distilledFactPrepared = prepared.nodes.find((node) => node.slots?.summary_kind === "write_distillation_fact");
    const taskSignatureFactPrepared = prepared.nodes.find(
      (node) => node.slots?.summary_kind === "write_distillation_fact" && node.title === "Task Signature",
    );
    const errorSignatureFactPrepared = prepared.nodes.find(
      (node) => node.slots?.summary_kind === "write_distillation_fact" && node.title === "Error Signature",
    );
    const workflowSignatureFactPrepared = prepared.nodes.find(
      (node) => node.slots?.summary_kind === "write_distillation_fact" && node.title === "Workflow Signature",
    );
    assert.ok(workflowPrepared);
    assert.ok(patternPrepared);
    assert.ok(distilledFactPrepared);
    assert.ok(taskSignatureFactPrepared);
    assert.ok(errorSignatureFactPrepared);
    assert.ok(workflowSignatureFactPrepared);
    assert.equal(workflowPrepared?.slots.execution_native_v1.execution_kind, "workflow_anchor");
    assert.equal(workflowPrepared?.slots.execution_native_v1.task_signature, "repair-export-node-tests");
    assert.equal(workflowPrepared?.slots.execution_native_v1.error_signature, "node-export-mismatch");
    assert.equal(patternPrepared?.slots.execution_native_v1.execution_kind, "pattern_anchor");
    assert.equal(patternPrepared?.slots.execution_native_v1.pattern_state, "stable");
    assert.equal(patternPrepared?.slots.execution_native_v1.selected_tool, "edit");
    assert.equal(distilledFactPrepared?.slots.execution_native_v1.execution_kind, "distilled_fact");
    assert.equal(distilledFactPrepared?.slots.execution_native_v1.compression_layer, "L1");
    assert.equal(taskSignatureFactPrepared?.slots.execution_native_v1.task_signature, "repair-export-node-tests");
    assert.equal(errorSignatureFactPrepared?.slots.execution_native_v1.error_signature, "node-export-mismatch");
    assert.equal(workflowSignatureFactPrepared?.slots.execution_native_v1.workflow_signature, "inspect-patch-rerun");

    await store.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10_000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: store,
      }),
    );

    const { rows } = await store.findNodes({
      scope: "default",
      consumerAgentId: "local-user",
      consumerTeamId: null,
      limit: 20,
      offset: 0,
    });
    const storedWorkflow = rows.find((row) => row.slots?.summary_kind === "workflow_anchor");
    const storedPattern = rows.find((row) => row.slots?.summary_kind === "pattern_anchor");
    const storedDistilledFact = rows.find((row) => row.slots?.summary_kind === "write_distillation_fact");
    const storedTaskSignatureFact = rows.find(
      (row) => row.slots?.summary_kind === "write_distillation_fact" && row.title === "Task Signature",
    );
    const storedErrorSignatureFact = rows.find(
      (row) => row.slots?.summary_kind === "write_distillation_fact" && row.title === "Error Signature",
    );
    const storedWorkflowSignatureFact = rows.find(
      (row) => row.slots?.summary_kind === "write_distillation_fact" && row.title === "Workflow Signature",
    );
    assert.equal(storedWorkflow?.slots.execution_native_v1.anchor_kind, "workflow");
    assert.equal(storedPattern?.slots.execution_native_v1.anchor_kind, "pattern");
    assert.equal(storedDistilledFact?.slots.execution_native_v1.execution_kind, "distilled_fact");
    assert.equal(storedTaskSignatureFact?.slots.execution_native_v1.task_signature, "repair-export-node-tests");
    assert.equal(storedErrorSignatureFact?.slots.execution_native_v1.error_signature, "node-export-mismatch");
    assert.equal(storedWorkflowSignatureFact?.slots.execution_native_v1.workflow_signature, "inspect-patch-rerun");
  } finally {
    await store.close();
  }
});

test("lite write store exposes execution-first query filters over execution_native_v1", async () => {
  const dbPath = tmpDbPath("query");
  const store = createLiteWriteStore(dbPath);
  const workflowAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "workflow",
    anchor_level: "L2",
    task_signature: "repair-export-node-tests",
    error_signature: "node-export-mismatch",
    workflow_signature: "inspect-patch-rerun",
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
    schema_version: "anchor_v1",
  });
  const patternAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: "stable",
    task_signature: "tools_select:repair-export:edit",
    error_signature: "node-export-mismatch",
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
  try {
    const prepared = await prepareMemoryWrite(
      {
        tenant_id: "default",
        scope: "default",
        actor: "local-user",
        producer_agent_id: "local-user",
        owner_agent_id: "local-user",
        input_text: [
          "Task Signature: repair-export-node-tests",
          "Error Signature: node-export-mismatch",
          "Workflow Signature: inspect-patch-rerun",
          "Execution-native query contract should keep signature facts addressable.",
        ].join("\n"),
        auto_embed: false,
        distill: {
          enabled: true,
          sources: ["input_text"],
          max_evidence_nodes: 2,
          max_fact_nodes: 4,
          min_sentence_chars: 12,
          attach_edges: true,
        },
        nodes: [
          {
            type: "procedure",
            title: "Fix export failure",
            text_summary: workflowAnchor.summary,
            slots: {
              summary_kind: "workflow_anchor",
              compression_layer: "L2",
              anchor_v1: workflowAnchor,
            },
          },
          {
            type: "concept",
            title: "Stable edit pattern",
            text_summary: patternAnchor.summary,
            slots: {
              summary_kind: "pattern_anchor",
              compression_layer: "L3",
              anchor_v1: patternAnchor,
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
    await store.withTx(() =>
      applyMemoryWrite({} as any, prepared, {
        maxTextLen: 10_000,
        piiRedaction: false,
        allowCrossScopeEdges: false,
        shadowDualWriteEnabled: false,
        shadowDualWriteStrict: false,
        associativeLinkOrigin: "memory_write",
        write_access: store,
      }),
    );

    const workflowRows = await store.findExecutionNativeNodes({
      scope: "default",
      consumerAgentId: "local-user",
      executionKind: "workflow_anchor",
      taskSignature: "repair-export-node-tests",
      compressionLayer: "L2",
      limit: 10,
      offset: 0,
    });
    assert.equal(workflowRows.rows.length, 1);
    assert.equal(workflowRows.rows[0]?.execution_native_v1.anchor_kind, "workflow");

    const patternRows = await store.findExecutionNativeNodes({
      scope: "default",
      consumerAgentId: "local-user",
      executionKind: "pattern_anchor",
      anchorKind: "pattern",
      patternState: "stable",
      workflowSignature: "stable-edit-pattern",
      limit: 10,
      offset: 0,
    });
    assert.equal(patternRows.rows.length, 1);
    assert.equal(patternRows.rows[0]?.execution_native_v1.selected_tool, "edit");

    const signatureFactRows = await store.findExecutionNativeNodes({
      scope: "default",
      consumerAgentId: "local-user",
      executionKind: "distilled_fact",
      taskSignature: "repair-export-node-tests",
      limit: 10,
      offset: 0,
    });
    assert.equal(signatureFactRows.rows.length, 1);
    assert.equal(signatureFactRows.rows[0]?.title, "Task Signature");
  } finally {
    await store.close();
  }
});
