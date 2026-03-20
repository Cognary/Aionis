import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeToolHintsFromAnchorNodes } from "../../src/memory/runtime-tool-hints.ts";
import { assembleLayeredContext } from "../../src/memory/context-orchestrator.ts";

test("buildRuntimeToolHintsFromAnchorNodes derives rehydrate hints from anchor_v1 nodes", () => {
  const anchorId = "11111111-1111-4111-8111-111111111111";
  const hints = buildRuntimeToolHintsFromAnchorNodes({
    tenant_id: "default",
    scope: "default",
    nodes: [
      {
        id: anchorId,
        type: "procedure",
        title: "Fix export failure",
        text_summary: "Inspect failing test and patch export",
        confidence: 0.72,
        slots: {
          anchor_v1: {
            anchor_kind: "workflow",
            anchor_level: "L2",
            summary: "Inspect failing test and patch export",
            tool_set: ["edit", "test"],
            outcome: { status: "success" },
            rehydration: {
              default_mode: "partial",
              payload_cost_hint: "medium",
              recommended_when: ["missing_log_detail", "anchor_confidence_is_not_enough"],
            },
          },
        },
      },
    ],
  });

  assert.equal(hints.length, 1);
  assert.equal(hints[0]?.tool_name, "rehydrate_payload");
  assert.equal(hints[0]?.anchor.id, anchorId);
  assert.equal(hints[0]?.anchor.anchor_kind, "workflow");
  assert.equal(hints[0]?.payload_cost_hint, "medium");
  assert.equal(hints[0]?.anchor.trusted, false);
  assert.match(hints[0]?.invocation.example_call ?? "", new RegExp(`rehydrate_payload\\(anchor_id='${anchorId}', mode='partial'\\)`));
});

test("buildRuntimeToolHintsFromAnchorNodes prefers execution_native_v1 trust fields when present", () => {
  const hints = buildRuntimeToolHintsFromAnchorNodes({
    tenant_id: "default",
    scope: "default",
    nodes: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        type: "concept",
        title: "Stable edit pattern",
        text_summary: "Prefer edit for export repair",
        confidence: 0.81,
        slots: {
          anchor_v1: {
            anchor_kind: "pattern",
            anchor_level: "L3",
            pattern_state: "provisional",
            selected_tool: "bash",
            summary: "Legacy anchor payload",
            tool_set: ["bash", "edit"],
            outcome: { status: "success" },
            rehydration: {
              default_mode: "partial",
              payload_cost_hint: "low",
              recommended_when: [],
            },
            promotion: {
              distinct_run_count: 1,
              required_distinct_runs: 2,
              counter_evidence_count: 0,
              counter_evidence_open: false,
            },
          },
          execution_native_v1: {
            schema_version: "execution_native_v1",
            execution_kind: "pattern_anchor",
            anchor_kind: "pattern",
            anchor_level: "L3",
            pattern_state: "stable",
            selected_tool: "edit",
            promotion: {
              distinct_run_count: 2,
              required_distinct_runs: 2,
              counter_evidence_count: 0,
              counter_evidence_open: false,
            },
          },
        },
      },
    ],
  });

  assert.equal(hints.length, 1);
  assert.equal(hints[0]?.anchor.pattern_state, "stable");
  assert.equal(hints[0]?.anchor.credibility_state, "trusted");
  assert.equal(hints[0]?.anchor.selected_tool, "edit");
  assert.equal(hints[0]?.anchor.trusted, true);
  assert.equal(hints[0]?.anchor.distinct_run_count, 2);
  assert.equal(hints[0]?.anchor.required_distinct_runs, 2);
});

test("assembleLayeredContext adds runtime tool hints to the tools layer", () => {
  const layered = assembleLayeredContext({
    recall: {
      context: { items: [], citations: [] },
      action_recall_packet: {
        packet_version: "action_recall_v1",
        recommended_workflows: [
          {
            anchor_id: "a_123",
            uri: "aionis://default/default/procedure/a_123",
            type: "procedure",
            title: "Fix export failure",
            summary: "Inspect failing test and patch export",
            anchor_level: "L2",
            tool_set: ["edit", "test"],
            confidence: 0.72,
          },
        ],
        candidate_patterns: [],
        trusted_patterns: [],
        contested_patterns: [],
        rehydration_candidates: [
          {
            anchor_id: "a_123",
            anchor_uri: "aionis://default/default/procedure/a_123",
            anchor_kind: "workflow",
            anchor_level: "L2",
            title: "Fix export failure",
            summary: "Inspect failing test and patch export",
            mode: "partial",
            payload_cost_hint: "medium",
            recommended_when: [],
            trusted: false,
            selected_tool: null,
            example_call: "rehydrate_payload(anchor_id='a_123', mode='partial')",
          },
        ],
        supporting_knowledge: [],
      },
      runtime_tool_hints: [
        {
          tool_name: "rehydrate_payload",
          anchor: {
            id: "a_123",
            anchor_kind: "workflow",
            anchor_level: "L2",
            selected_tool: null,
            summary: "Inspect failing test and patch export",
          },
          invocation: {
            mode: "partial",
            example_call: "rehydrate_payload(anchor_id='a_123', mode='partial')",
          },
          payload_cost_hint: "medium",
        },
      ],
    },
    rules: null,
    tools: null,
    query_text: "fix failing export test",
  });

  const toolItems = Array.isArray(layered.layers?.tools?.items) ? layered.layers.tools.items : [];
  assert.ok(toolItems.some((line: string) => line.includes("rehydrate_payload available")));
  assert.ok(toolItems.some((line: string) => line.includes("call=rehydrate_payload(anchor_id='a_123', mode='partial')")));
  assert.equal((layered as any).recommended_workflows[0]?.anchor_id, "a_123");
  assert.equal((layered as any).rehydration_candidates[0]?.anchor_id, "a_123");
  assert.equal((layered as any).planner_packet.packet_version, "planner_packet_v1");
  assert.ok((layered as any).planner_packet.sections.recommended_workflows[0]?.includes("anchor=a_123"));
  assert.ok((layered as any).planner_packet.sections.rehydration_candidates[0]?.includes("mode=partial"));
  assert.match((layered as any).planner_packet.merged_text, /# Recommended Workflows/);
  assert.match((layered as any).planner_packet.merged_text, /# Rehydration Candidates/);
});

test("assembleLayeredContext surfaces validated pattern anchors as tool guidance", () => {
  const layered = assembleLayeredContext({
    recall: {
      context: { items: [], citations: [] },
      runtime_tool_hints: [
        {
          tool_name: "rehydrate_payload",
          anchor: {
            id: "p_123",
            anchor_kind: "pattern",
            anchor_level: "L3",
            pattern_state: "stable",
            credibility_state: "trusted",
            trusted: true,
            distinct_run_count: 2,
            required_distinct_runs: 2,
            counter_evidence_count: 0,
            counter_evidence_open: false,
            last_transition: "promoted_to_trusted",
            selected_tool: "edit",
            summary: "Prefer edit for export repair after successful rule-backed selection",
          },
          invocation: {
            mode: "partial",
            example_call: "rehydrate_payload(anchor_id='p_123', mode='partial')",
          },
          payload_cost_hint: "medium",
        },
      ],
    },
    rules: null,
    tools: null,
    query_text: "repair export failure",
  });

  const toolItems = Array.isArray(layered.layers?.tools?.items) ? layered.layers.tools.items : [];
  assert.ok(toolItems.some((line: string) => line.includes("validated tool pattern: prefer edit")));
  assert.ok(toolItems.some((line: string) => line.includes("anchor=p_123")));
  assert.ok(Array.isArray((layered as any).pattern_signals));
  assert.equal((layered as any).action_recall_packet.packet_version, "action_recall_v1");
  assert.equal((layered as any).pattern_signals[0]?.anchor_id, "p_123");
  assert.equal((layered as any).pattern_signals[0]?.trusted, true);
  assert.equal((layered as any).pattern_signals[0]?.credibility_state, "trusted");
  assert.equal((layered as any).pattern_signals[0]?.counter_evidence_open, false);
  assert.equal((layered.layers?.tools as any)?.pattern_signals?.[0]?.pattern_state, "stable");
  assert.equal((layered as any).planner_packet.packet_version, "planner_packet_v1");
  assert.ok((layered as any).planner_packet.sections.trusted_patterns[0]?.includes("prefer edit"));
  assert.ok((layered as any).planner_packet.merged_text.includes("# Trusted Patterns"));
});
