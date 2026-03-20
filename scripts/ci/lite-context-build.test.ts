import test from "node:test";
import assert from "node:assert/strict";
import { buildContext } from "../../src/memory/context.ts";

test("buildContext prioritizes execution-native workflow procedures in topic text and compacts supporting events", () => {
  const workflowId = "wf_123";
  const ranked = [
    { id: workflowId, activation: 0.95, score: 0.95 },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `ev_${index + 1}`,
      activation: 0.6 - index * 0.01,
      score: 0.6 - index * 0.01,
    })),
  ];
  const nodes = new Map<string, any>([
    [
      workflowId,
      {
        id: workflowId,
        type: "procedure",
        tier: "warm",
        title: "Fix export failure",
        text_summary: "Inspect failing test and patch export",
        slots: {
          execution_native_v1: {
            schema_version: "execution_native_v1",
            execution_kind: "workflow_anchor",
            summary_kind: "workflow_anchor",
            compression_layer: "L2",
            task_signature: "repair-export-node-tests",
            anchor_kind: "workflow",
            anchor_level: "L2",
          },
        },
        topic_state: null,
        raw_ref: null,
        evidence_ref: null,
        commit_id: null,
        confidence: 0.9,
        salience: 0.9,
      },
    ],
    ...Array.from({ length: 8 }, (_, index) => [
      `ev_${index + 1}`,
      {
        id: `ev_${index + 1}`,
        type: "event",
        tier: "hot",
        title: null,
        text_summary: `Supporting event ${index + 1}`,
        slots: index === 0
          ? {
              execution_native_v1: {
                schema_version: "execution_native_v1",
                execution_kind: "distilled_evidence",
                summary_kind: "write_distillation_evidence",
                compression_layer: "L1",
              },
            }
          : {},
        topic_state: null,
        raw_ref: null,
        evidence_ref: null,
        commit_id: null,
        confidence: 0.5,
        salience: 0.5,
      },
    ]),
  ]);

  const out = buildContext(ranked, nodes, new Map(), {});
  const eventItems = out.items.filter((item) => item.kind === "event");
  const workflowItem = out.items[0];
  const workflowCitation = out.citations.find((citation) => citation.node_id === workflowId);
  const firstEvent = eventItems[0];

  assert.equal(workflowItem?.kind, "procedure");
  assert.equal(workflowItem?.compression_layer, "L2");
  assert.equal(workflowItem?.execution_kind, "workflow_anchor");
  assert.equal(workflowItem?.anchor_kind, "workflow");
  assert.equal(workflowCitation?.execution_kind, "workflow_anchor");
  assert.equal(workflowCitation?.compression_layer, "L2");
  assert.match(out.text, /workflow_anchor, level=L2, task=repair-export-node-tests/);
  assert.equal(firstEvent?.execution_kind, "distilled_evidence");
  assert.equal(firstEvent?.summary_kind, "write_distillation_evidence");
  assert.equal(firstEvent?.compression_layer, "L1");
  assert.match(out.text, /write_distillation_evidence, distilled_evidence, level=L1/);
  assert.equal(eventItems.length, 5);
});
