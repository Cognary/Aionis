import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionMemorySummaryBundle,
  buildAssemblySummary,
  buildPlanningSummary,
  summarizeActionRecallPacket,
  summarizeWorkflowSignalSurface,
  summarizeWorkflowLifecycleSurface,
  summarizeWorkflowMaintenanceSurface,
  summarizePatternSignals,
} from "../../src/app/planning-summary.ts";

const layeredContextFixture = {
  action_recall_packet: {
    packet_version: "action_recall_v1",
    recommended_workflows: [
      {
        anchor_id: "wf_123",
        uri: "aionis://default/default/procedure/wf_123",
        type: "procedure",
        title: "Fix export failure",
        summary: "Inspect failing test and patch export",
        anchor_level: "L2",
        source_kind: "playbook",
        promotion_origin: "replay_promote",
        last_transition: "promoted_to_stable",
        last_transition_at: "2026-03-20T00:00:00Z",
        rehydration_default_mode: "partial",
        tool_set: ["edit", "test"],
        maintenance_state: "retain",
        offline_priority: "retain_workflow",
        last_maintenance_at: "2026-03-20T00:00:00Z",
        confidence: 0.72,
      },
    ],
    candidate_workflows: [
      {
        anchor_id: "wf_candidate_1",
        uri: "aionis://default/default/event/wf_candidate_1",
        type: "event",
        title: "Replay Episode: Fix export failure",
        summary: "Replay repair learning episode for export failure",
        anchor_level: "L1",
        promotion_state: "candidate",
        source_kind: "playbook",
        promotion_origin: "replay_learning_episode",
        required_observations: 2,
        observed_count: 1,
        last_transition: "candidate_observed",
        last_transition_at: "2026-03-20T00:00:00Z",
        rehydration_default_mode: null,
        tool_set: ["edit", "test"],
        maintenance_state: "observe",
        offline_priority: "promote_candidate",
        last_maintenance_at: "2026-03-20T00:00:00Z",
        confidence: 0.61,
      },
    ],
    candidate_patterns: [],
    trusted_patterns: [
      {
        anchor_id: "p_stable",
        uri: "aionis://default/default/concept/p_stable",
        type: "concept",
        title: "Prefer edit for export repair",
        summary: "Stable edit pattern",
        anchor_level: "L3",
        selected_tool: "edit",
        pattern_state: "stable",
        credibility_state: "trusted",
        last_transition: "promoted_to_trusted",
        distinct_run_count: 2,
        required_distinct_runs: 2,
        trusted: true,
        confidence: 0.81,
      },
    ],
    contested_patterns: [
      {
        anchor_id: "p_contested",
        uri: "aionis://default/default/concept/p_contested",
        type: "concept",
        title: "Prefer bash for export repair",
        summary: "Contested bash pattern",
        anchor_level: "L3",
        selected_tool: "bash",
        pattern_state: "provisional",
        credibility_state: "contested",
        distinct_run_count: 2,
        required_distinct_runs: 2,
        trusted: false,
        counter_evidence_open: true,
        last_transition: "counter_evidence_opened",
        confidence: 0.54,
      },
    ],
    rehydration_candidates: [
      {
        anchor_id: "wf_123",
        anchor_uri: "aionis://default/default/procedure/wf_123",
        anchor_kind: "workflow",
        anchor_level: "L2",
        title: "Fix export failure",
        summary: "Inspect failing test and patch export",
        mode: "partial",
        payload_cost_hint: "medium",
        recommended_when: ["missing_log_detail"],
        trusted: false,
        selected_tool: null,
        example_call: "rehydrate_payload(anchor_id='wf_123', mode='partial')",
      },
    ],
    supporting_knowledge: [
      {
        id: "k_123",
        uri: "aionis://default/default/concept/k_123",
        type: "concept",
        title: "Exports often break on stale default export wiring",
        summary: "Generic export debugging note",
        confidence: 0.42,
      },
    ],
  },
  pattern_signals: [
    {
      anchor_id: "p_stable",
      anchor_level: "L3",
      selected_tool: "edit",
      pattern_state: "stable",
      credibility_state: "trusted",
      trusted: true,
      distinct_run_count: 2,
      required_distinct_runs: 2,
      counter_evidence_count: 0,
      counter_evidence_open: false,
      summary: "Stable edit pattern",
    },
    {
      anchor_id: "p_contested",
      anchor_level: "L3",
      selected_tool: "bash",
      pattern_state: "provisional",
      credibility_state: "contested",
      trusted: false,
      distinct_run_count: 2,
      required_distinct_runs: 2,
      counter_evidence_count: 1,
      counter_evidence_open: true,
      summary: "Contested bash pattern",
    },
  ],
  workflow_signals: [
    {
      anchor_id: "wf_123",
      anchor_level: "L2",
      title: "Fix export failure",
      summary: "Inspect failing test and patch export",
      promotion_state: "stable",
      promotion_ready: false,
      observed_count: null,
      required_observations: null,
      source_kind: "playbook",
      promotion_origin: "replay_promote",
      last_transition: "promoted_to_stable",
      maintenance_state: "retain",
      offline_priority: "retain_workflow",
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
    {
      anchor_id: "wf_candidate_1",
      anchor_level: "L1",
      title: "Replay Episode: Fix export failure",
      summary: "Replay repair learning episode for export failure",
      promotion_state: "candidate",
      promotion_ready: false,
      observed_count: 1,
      required_observations: 2,
      source_kind: "playbook",
      promotion_origin: "replay_learning_episode",
      last_transition: "candidate_observed",
      maintenance_state: "observe",
      offline_priority: "promote_candidate",
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
  ],
  stats: {
    forgotten_items: 1,
  },
  static_injection: {
    selected_blocks: 2,
  },
};

test("summarizePatternSignals splits trusted and contested pattern signals", () => {
  const summary = summarizePatternSignals(layeredContextFixture);
  assert.equal(summary.candidate_pattern_count, 0);
  assert.equal(summary.trusted_pattern_count, 1);
  assert.equal(summary.contested_pattern_count, 1);
  assert.deepEqual(summary.candidate_pattern_tools, []);
  assert.deepEqual(summary.trusted_pattern_tools, ["edit"]);
  assert.deepEqual(summary.contested_pattern_tools, ["bash"]);
});

test("summarizeActionRecallPacket reports execution-memory-first packet sections", () => {
  const summary = summarizeActionRecallPacket(layeredContextFixture);
  assert.equal(summary.recommended_workflow_count, 1);
  assert.equal(summary.candidate_workflow_count, 1);
  assert.equal(summary.candidate_pattern_count, 0);
  assert.equal(summary.trusted_pattern_count, 1);
  assert.equal(summary.contested_pattern_count, 1);
  assert.equal(summary.rehydration_candidate_count, 1);
  assert.equal(summary.supporting_knowledge_count, 1);
  assert.deepEqual(summary.workflow_anchor_ids, ["wf_123"]);
  assert.deepEqual(summary.candidate_workflow_anchor_ids, ["wf_candidate_1"]);
  assert.deepEqual(summary.candidate_pattern_anchor_ids, []);
  assert.deepEqual(summary.trusted_pattern_anchor_ids, ["p_stable"]);
  assert.deepEqual(summary.contested_pattern_anchor_ids, ["p_contested"]);
  assert.deepEqual(summary.rehydration_anchor_ids, ["wf_123"]);
});

test("buildExecutionMemorySummaryBundle aligns all execution-memory summaries from one surface", () => {
  const bundle = buildExecutionMemorySummaryBundle({
    action_recall_packet: layeredContextFixture.action_recall_packet,
    pattern_signals: layeredContextFixture.pattern_signals,
    workflow_signals: layeredContextFixture.workflow_signals,
    recommended_workflows: layeredContextFixture.action_recall_packet.recommended_workflows,
    candidate_workflows: layeredContextFixture.action_recall_packet.candidate_workflows,
    candidate_patterns: layeredContextFixture.action_recall_packet.candidate_patterns,
    trusted_patterns: layeredContextFixture.action_recall_packet.trusted_patterns,
    contested_patterns: layeredContextFixture.action_recall_packet.contested_patterns,
    rehydration_candidates: layeredContextFixture.action_recall_packet.rehydration_candidates,
    supporting_knowledge: layeredContextFixture.action_recall_packet.supporting_knowledge,
  });
  assert.deepEqual(bundle.pattern_signal_summary, summarizePatternSignals(layeredContextFixture));
  assert.deepEqual(bundle.workflow_signal_summary, summarizeWorkflowSignalSurface({
    action_recall_packet: layeredContextFixture.action_recall_packet,
    workflow_signals: layeredContextFixture.workflow_signals,
    recommended_workflows: layeredContextFixture.action_recall_packet.recommended_workflows,
    candidate_workflows: layeredContextFixture.action_recall_packet.candidate_workflows,
  }));
  assert.deepEqual(bundle.workflow_lifecycle_summary, summarizeWorkflowLifecycleSurface({
    action_recall_packet: layeredContextFixture.action_recall_packet,
    recommended_workflows: layeredContextFixture.action_recall_packet.recommended_workflows,
    candidate_workflows: layeredContextFixture.action_recall_packet.candidate_workflows,
  }));
  assert.deepEqual(bundle.workflow_maintenance_summary, summarizeWorkflowMaintenanceSurface({
    action_recall_packet: layeredContextFixture.action_recall_packet,
    recommended_workflows: layeredContextFixture.action_recall_packet.recommended_workflows,
    candidate_workflows: layeredContextFixture.action_recall_packet.candidate_workflows,
  }));
  assert.deepEqual(bundle.action_packet_summary, summarizeActionRecallPacket(layeredContextFixture));
});

test("workflow lifecycle and maintenance summaries reflect stable replay workflow guidance", () => {
  const lifecycle = summarizeWorkflowLifecycleSurface(layeredContextFixture);
  const maintenance = summarizeWorkflowMaintenanceSurface(layeredContextFixture);
  assert.deepEqual(lifecycle, {
    candidate_count: 1,
    stable_count: 1,
    replay_source_count: 2,
    rehydration_ready_count: 1,
    promotion_ready_count: 0,
    transition_counts: {
      candidate_observed: 1,
      promoted_to_stable: 1,
      normalized_latest_stable: 0,
    },
  });
  assert.deepEqual(maintenance, {
    model: "lazy_online_v1",
    observe_count: 1,
    retain_count: 1,
    promote_candidate_count: 1,
    retain_workflow_count: 1,
  });
});

test("workflow signal summary separates stable, promotion-ready, and observing workflows", () => {
  const summary = summarizeWorkflowSignalSurface(layeredContextFixture);
  assert.deepEqual(summary, {
    stable_workflow_count: 1,
    promotion_ready_workflow_count: 0,
    observing_workflow_count: 1,
    stable_workflow_titles: ["Fix export failure"],
    promotion_ready_workflow_titles: [],
    observing_workflow_titles: ["Replay Episode: Fix export failure"],
  });
});

test("buildPlanningSummary includes pattern trust totals and tool lists", () => {
  const summary = buildPlanningSummary({
    rules: { considered: 5, matched: 2 },
    tools: {
      selection: { selected: "edit" },
      decision: {
        decision_id: "d_123",
        pattern_summary: {
          used_trusted_pattern_tools: ["edit"],
          skipped_contested_pattern_tools: ["bash"],
        },
      },
    },
    layered_context: layeredContextFixture,
    cost_signals: {
      selected_memory_layers: ["L2", "L3"],
      primary_savings_levers: ["anchor_first_recall"],
    },
    context_est_tokens: 512,
    context_compaction_profile: "balanced",
    optimization_profile: "balanced",
    recall_mode: "tool_first",
  });
  assert.equal(summary.trusted_pattern_count, 1);
  assert.equal(summary.contested_pattern_count, 1);
  assert.deepEqual(summary.trusted_pattern_tools, ["edit"]);
  assert.deepEqual(summary.contested_pattern_tools, ["bash"]);
  assert.deepEqual(summary.workflow_lifecycle_summary, {
    candidate_count: 1,
    stable_count: 1,
    replay_source_count: 2,
    rehydration_ready_count: 1,
    promotion_ready_count: 0,
    transition_counts: {
      candidate_observed: 1,
      promoted_to_stable: 1,
      normalized_latest_stable: 0,
    },
  });
  assert.deepEqual(summary.workflow_maintenance_summary, {
    model: "lazy_online_v1",
    observe_count: 1,
    retain_count: 1,
    promote_candidate_count: 1,
    retain_workflow_count: 1,
  });
  assert.deepEqual(summary.workflow_signal_summary, {
    stable_workflow_count: 1,
    promotion_ready_workflow_count: 0,
    observing_workflow_count: 1,
    stable_workflow_titles: ["Fix export failure"],
    promotion_ready_workflow_titles: [],
    observing_workflow_titles: ["Replay Episode: Fix export failure"],
  });
  assert.equal(summary.pattern_lifecycle_summary.candidate_count, 0);
  assert.equal(summary.pattern_lifecycle_summary.trusted_count, 1);
  assert.equal(summary.pattern_lifecycle_summary.contested_count, 1);
  assert.equal(summary.pattern_lifecycle_summary.near_promotion_count, 0);
  assert.equal(summary.pattern_lifecycle_summary.counter_evidence_open_count, 1);
  assert.deepEqual(summary.pattern_lifecycle_summary.transition_counts, {
    candidate_observed: 0,
    promoted_to_trusted: 1,
    counter_evidence_opened: 1,
    revalidated_to_trusted: 0,
  });
  assert.deepEqual(summary.pattern_maintenance_summary, {
    model: "lazy_online_v1",
    observe_count: 0,
    retain_count: 1,
    review_count: 1,
    promote_candidate_count: 0,
    review_counter_evidence_count: 1,
    retain_trusted_count: 1,
  });
  assert.equal(summary.action_packet_summary.recommended_workflow_count, 1);
  assert.equal(summary.action_packet_summary.candidate_workflow_count, 1);
  assert.equal(summary.action_packet_summary.rehydration_candidate_count, 1);
  assert.deepEqual(summary.action_packet_summary.workflow_anchor_ids, ["wf_123"]);
  assert.deepEqual(summary.action_packet_summary.candidate_workflow_anchor_ids, ["wf_candidate_1"]);
  assert.deepEqual(summary.action_packet_summary.trusted_pattern_anchor_ids, ["p_stable"]);
  assert.equal(
    summary.planner_explanation,
    "workflow guidance: Fix export failure; candidate workflows visible but not yet promoted: Replay Episode: Fix export failure; selected tool: edit; trusted pattern support: edit; contested patterns visible but not trusted: bash; rehydration available: Fix export failure; supporting knowledge appended: 1",
  );
});

test("buildAssemblySummary carries pattern trust summary through from planning summary", () => {
  const summary = buildAssemblySummary({
    rules: { considered: 3, matched: 1 },
    tools: {
      selection: { selected: "edit" },
      decision: {
        decision_id: "d_123",
        pattern_summary: {
          used_trusted_pattern_tools: ["edit"],
          skipped_contested_pattern_tools: ["bash"],
        },
      },
    },
    layered_context: layeredContextFixture,
    cost_signals: null,
    context_est_tokens: 420,
    context_compaction_profile: "aggressive",
    optimization_profile: "aggressive",
    recall_mode: "balanced",
    include_rules: true,
  });
  assert.equal(summary.trusted_pattern_count, 1);
  assert.equal(summary.contested_pattern_count, 1);
  assert.deepEqual(summary.trusted_pattern_tools, ["edit"]);
  assert.deepEqual(summary.contested_pattern_tools, ["bash"]);
  assert.equal(summary.workflow_lifecycle_summary.candidate_count, 1);
  assert.equal(summary.workflow_lifecycle_summary.stable_count, 1);
  assert.equal(summary.workflow_lifecycle_summary.transition_counts.candidate_observed, 1);
  assert.equal(summary.workflow_lifecycle_summary.transition_counts.promoted_to_stable, 1);
  assert.equal(summary.workflow_maintenance_summary.observe_count, 1);
  assert.equal(summary.workflow_maintenance_summary.retain_count, 1);
  assert.equal(summary.workflow_maintenance_summary.promote_candidate_count, 1);
  assert.equal(summary.workflow_maintenance_summary.retain_workflow_count, 1);
  assert.equal(summary.workflow_signal_summary.stable_workflow_count, 1);
  assert.equal(summary.workflow_signal_summary.observing_workflow_count, 1);
  assert.equal(summary.workflow_signal_summary.promotion_ready_workflow_count, 0);
  assert.equal(summary.pattern_lifecycle_summary.trusted_count, 1);
  assert.equal(summary.pattern_lifecycle_summary.contested_count, 1);
  assert.equal(summary.pattern_maintenance_summary.retain_count, 1);
  assert.equal(summary.pattern_maintenance_summary.review_count, 1);
  assert.equal(summary.action_packet_summary.supporting_knowledge_count, 1);
  assert.deepEqual(summary.action_packet_summary.rehydration_anchor_ids, ["wf_123"]);
  assert.equal(
    summary.planner_explanation,
    "workflow guidance: Fix export failure; candidate workflows visible but not yet promoted: Replay Episode: Fix export failure; selected tool: edit; trusted pattern support: edit; contested patterns visible but not trusted: bash; rehydration available: Fix export failure; supporting knowledge appended: 1",
  );
});

test("buildPlanningSummary explains packet state even when no trusted pattern was consumed", () => {
  const summary = buildPlanningSummary({
    rules: { considered: 2, matched: 0 },
    tools: {
      selection: { selected: "bash" },
      decision: {
        decision_id: "d_456",
      },
    },
    layered_context: layeredContextFixture,
    cost_signals: null,
    context_est_tokens: 256,
    context_compaction_profile: "balanced",
    optimization_profile: "balanced",
    recall_mode: "balanced",
  });
  assert.equal(
    summary.planner_explanation,
    "workflow guidance: Fix export failure; candidate workflows visible but not yet promoted: Replay Episode: Fix export failure; selected tool: bash; trusted patterns available but not used: edit; contested patterns visible but not trusted: bash; rehydration available: Fix export failure; supporting knowledge appended: 1",
  );
});

test("buildPlanningSummary surfaces promotion-ready workflow candidates ahead of generic candidate wording", () => {
  const readyFixture = structuredClone(layeredContextFixture);
  const candidateWorkflow = (readyFixture.action_recall_packet.candidate_workflows as any[])[0];
  candidateWorkflow.observed_count = 2;
  const summary = buildPlanningSummary({
    rules: { considered: 2, matched: 1 },
    tools: {
      selection: { selected: "edit" },
      decision: {
        decision_id: "d_ready",
        pattern_summary: {
          used_trusted_pattern_tools: ["edit"],
          skipped_contested_pattern_tools: ["bash"],
        },
      },
    },
    layered_context: readyFixture,
    cost_signals: null,
    context_est_tokens: 320,
    context_compaction_profile: "balanced",
    optimization_profile: "balanced",
    recall_mode: "balanced",
  });
  assert.equal(summary.workflow_lifecycle_summary.promotion_ready_count, 1);
  assert.deepEqual(summary.workflow_signal_summary, {
    stable_workflow_count: 1,
    promotion_ready_workflow_count: 1,
    observing_workflow_count: 0,
    stable_workflow_titles: ["Fix export failure"],
    promotion_ready_workflow_titles: ["Replay Episode: Fix export failure"],
    observing_workflow_titles: [],
  });
  assert.equal(
    summary.planner_explanation,
    "workflow guidance: Fix export failure; promotion-ready workflow candidates: Replay Episode: Fix export failure; selected tool: edit; trusted pattern support: edit; contested patterns visible but not trusted: bash; rehydration available: Fix export failure; supporting knowledge appended: 1",
  );
});
