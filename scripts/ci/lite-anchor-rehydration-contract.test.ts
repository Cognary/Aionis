import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { prepareMemoryWrite, applyMemoryWrite } from "../../src/memory/write.ts";
import { rehydrateAnchorPayloadLite } from "../../src/memory/rehydrate-anchor.ts";
import { buildAionisUri } from "../../src/memory/uri.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-anchor-"));
  return path.join(dir, `${name}.sqlite`);
}

async function seedAnchorFixture() {
  const store = createLiteWriteStore(tmpDbPath("rehydrate"));
  const payloadNodeId = randomUUID();
  const anchorNodeId = randomUUID();
  const decisionId = randomUUID();
  const runId = "run-anchor-1";

  const prepared = await prepareMemoryWrite({
    tenant_id: "default",
    scope: "default",
    actor: "local-user",
    input_text: "seed anchor fixture",
    nodes: [
      {
        id: payloadNodeId,
        type: "procedure",
        tier: "warm",
        memory_lane: "private",
        owner_agent_id: "local-user",
        title: "Fix export mismatch in failing test",
        text_summary: "Inspect test failure, patch export, rerun targeted test",
        slots: {
          replay_kind: "step",
          replay_kind_phase: "after",
          tool_name: "edit",
          step_index: 3,
          status: "succeeded",
          tool_input: { file: "src/index-sdk-demo.ts" },
        },
      },
      {
        id: anchorNodeId,
        type: "procedure",
        tier: "warm",
        memory_lane: "private",
        owner_agent_id: "local-user",
        title: "Workflow anchor: fix node test failure",
        text_summary: "Inspect failing test, patch export, rerun targeted test",
        slots: {
          anchor_v1: {
            anchor_kind: "workflow",
            anchor_level: "L2",
            task_signature: "fix-node-test-failure",
            task_class: "debug_test_failure",
            error_signature: "node-test-export-mismatch",
            workflow_signature: "inspect-patch-rerun-targeted-test",
            summary: "Inspect failing test, patch export, rerun targeted test",
            tool_set: ["edit", "test"],
            selected_tool: null,
            key_steps: ["inspect failing test", "patch export", "rerun targeted test"],
            outcome: {
              status: "success",
              result_class: "task_completed",
              success_score: 1,
            },
            source: {
              source_kind: "playbook",
              node_id: payloadNodeId,
              decision_id: decisionId,
              run_id: runId,
              step_id: null,
              playbook_id: "pb_123",
              commit_id: null,
            },
            payload_refs: {
              node_ids: [payloadNodeId],
              decision_ids: [decisionId],
              run_ids: [runId],
              step_ids: [],
              commit_ids: [],
            },
            rehydration: {
              default_mode: "summary_only",
              payload_cost_hint: "medium",
              recommended_when: ["need_full_logs"],
            },
            schema_version: "anchor_v1",
          },
        },
      },
    ],
    edges: [],
  }, "default", "default", {
    maxTextLen: 10000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
  }, null);

  await store.withTx(() => applyMemoryWrite({} as any, prepared, {
    maxTextLen: 10000,
    piiRedaction: false,
    allowCrossScopeEdges: false,
    shadowDualWriteEnabled: false,
    shadowDualWriteStrict: false,
    write_access: store,
  }));

  await store.insertExecutionDecision({
    id: decisionId,
    scope: "default",
    decisionKind: "tools_select",
    runId,
    selectedTool: "edit",
    candidatesJson: ["edit", "test"],
    contextSha256: "c".repeat(64),
    policySha256: "d".repeat(64),
    sourceRuleIds: [],
    metadataJson: {
      execution_stage: "repair",
      matched_rules: 1,
    },
    commitId: null,
  });

  return { store, payloadNodeId, anchorNodeId, decisionId, runId };
}

test("rehydrateAnchorPayloadLite returns anchor-only result in summary_only mode", async () => {
  const { store, anchorNodeId } = await seedAnchorFixture();
  try {
    const out = await rehydrateAnchorPayloadLite(store, {
      anchor_id: anchorNodeId,
      actor: "local-user",
      mode: "summary_only",
    }, "default", "default");

    assert.equal(out.mode, "summary_only");
    assert.equal(out.anchor.anchor_v1.task_signature, "fix-node-test-failure");
    assert.equal(out.rehydrated.nodes.length, 0);
    assert.equal(out.rehydrated.decisions.length, 0);
  } finally {
    await store.close();
  }
});

test("rehydrateAnchorPayloadLite returns linked node and decision summaries in partial mode", async () => {
  const { store, anchorNodeId, payloadNodeId, decisionId } = await seedAnchorFixture();
  try {
    const out = await rehydrateAnchorPayloadLite(store, {
      anchor_id: anchorNodeId,
      actor: "local-user",
      mode: "partial",
    }, "default", "default");

    assert.equal(out.rehydrated.summary.resolved_nodes, 1);
    assert.equal(out.rehydrated.summary.resolved_decisions, 1);
    assert.equal(out.rehydrated.nodes[0]?.id, payloadNodeId);
    assert.equal(out.rehydrated.decisions[0]?.decision_id, decisionId);
    assert.equal(out.rehydrated.decisions[0]?.selected_tool, "edit");
    assert.equal("slots" in (out.rehydrated.nodes[0] ?? {}), false);
  } finally {
    await store.close();
  }
});

test("rehydrateAnchorPayloadLite falls back to the Lite local actor when actor is omitted", async () => {
  const { store, anchorNodeId, payloadNodeId, decisionId } = await seedAnchorFixture();
  try {
    const out = await rehydrateAnchorPayloadLite(store, {
      anchor_id: anchorNodeId,
      mode: "partial",
    }, "default", "default", "local-user");

    assert.equal(out.rehydrated.summary.resolved_nodes, 1);
    assert.equal(out.rehydrated.summary.resolved_decisions, 1);
    assert.equal(out.rehydrated.nodes[0]?.id, payloadNodeId);
    assert.equal(out.rehydrated.decisions[0]?.decision_id, decisionId);
  } finally {
    await store.close();
  }
});

test("rehydrateAnchorPayloadLite supports anchor_uri and returns fuller payload in full mode", async () => {
  const { store, anchorNodeId } = await seedAnchorFixture();
  try {
    const out = await rehydrateAnchorPayloadLite(store, {
      anchor_uri: buildAionisUri({
        tenant_id: "default",
        scope: "default",
        type: "procedure",
        id: anchorNodeId,
      }),
      actor: "local-user",
      mode: "full",
    }, "default", "default");

    assert.equal(out.mode, "full");
    assert.equal(typeof out.rehydrated.nodes[0]?.slots, "object");
    assert.equal(typeof out.rehydrated.decisions[0]?.metadata, "object");
    assert.ok(out.rehydrated.commits.length >= 1);
  } finally {
    await store.close();
  }
});
