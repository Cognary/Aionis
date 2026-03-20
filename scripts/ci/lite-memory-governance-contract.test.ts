import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryAdjudicationProposalSchema,
  MemoryAnchorV1Schema,
  MemoryCompressRequest,
  MemoryCompressAdjudicationSchema,
  MemoryFormPatternRequest,
  MemoryFormPatternAdjudicationSchema,
  MemoryPayloadRehydrateAdjudicationSchema,
  MemoryPayloadRehydrateToolRequest,
  MemoryPolicyHintAdjudicationSchema,
  MemoryPromoteAdjudicationSchema,
  MemoryPromoteRequest,
} from "../../src/memory/schemas.ts";
import {
  proposalRequiresMemoryAdmissibilityCheck,
  proposalTargetsGovernedMemoryMutation,
  requiresMemoryAdmissibilityCheck,
} from "../../src/memory/governance.ts";

test("anchor_v1 schema accepts a workflow anchor with signatures and rehydration hints", () => {
  const parsed = MemoryAnchorV1Schema.parse({
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
      node_id: "node_123",
      run_id: "run_123",
      playbook_id: "pb_123",
      commit_id: "commit_123",
    },
    payload_refs: {
      node_ids: ["node_123"],
      decision_ids: [],
      run_ids: ["run_123"],
      step_ids: [],
      commit_ids: ["commit_123"],
    },
    rehydration: {
      default_mode: "summary_only",
      payload_cost_hint: "medium",
      recommended_when: ["need_full_logs"],
    },
    metrics: {
      usage_count: 0,
      reuse_success_count: 0,
      reuse_failure_count: 0,
      last_used_at: null,
    },
    schema_version: "anchor_v1",
  });

  assert.equal(parsed.anchor_level, "L2");
  assert.equal(parsed.rehydration?.default_mode, "summary_only");
  assert.equal(parsed.error_signature, "node-test-export-mismatch");
});

test("memory adjudication schema requires target_level for recommended workflow or pattern proposals", () => {
  let err: unknown;
  try {
    MemoryAdjudicationProposalSchema.parse({
      operation: "promote_memory",
      disposition: "recommend",
      target_kind: "workflow",
      reason: "Repeated successful repair path",
      confidence: 0.82,
    });
  } catch (next) {
    err = next;
  }
  assert.ok(err instanceof Error);

  const parsed = MemoryAdjudicationProposalSchema.parse({
    operation: "promote_memory",
    disposition: "recommend",
    target_kind: "workflow",
    target_level: "L2",
    reason: "Repeated successful repair path",
    confidence: 0.82,
    keep_details: ["error signature", "tool order"],
    drop_details: ["duplicate log tail"],
    related_memory_ids: ["node_1", "node_2"],
  });
  assert.equal(parsed.target_level, "L2");
});

test("operation-specific adjudication schema family stays discriminated by operation", () => {
  const promote = MemoryPromoteAdjudicationSchema.parse({
    operation: "promote_memory",
    disposition: "recommend",
    target_kind: "workflow",
    target_level: "L2",
    reason: "Stable repeated repair path",
    confidence: 0.81,
  });
  assert.equal(promote.operation, "promote_memory");

  const compress = MemoryCompressAdjudicationSchema.parse({
    operation: "compress_memory",
    disposition: "recommend",
    target_kind: "event",
    reason: "Duplicate logs can be compressed",
    confidence: 0.74,
    drop_details: ["duplicate stack tail"],
  });
  assert.equal(compress.operation, "compress_memory");

  const pattern = MemoryFormPatternAdjudicationSchema.parse({
    operation: "form_pattern",
    disposition: "recommend",
    target_kind: "pattern",
    target_level: "L3",
    reason: "Grouped workflows share signatures and successful shape",
    confidence: 0.88,
  });
  assert.equal(pattern.target_kind, "pattern");

  const policy = MemoryPolicyHintAdjudicationSchema.parse({
    operation: "derive_policy_hint",
    disposition: "recommend",
    target_kind: "policy_hint",
    reason: "Stable tool preference across repeated outcomes",
    confidence: 0.77,
  });
  assert.equal(policy.target_kind, "policy_hint");

  const rehydrate = MemoryPayloadRehydrateAdjudicationSchema.parse({
    operation: "rehydrate_payload",
    disposition: "recommend",
    target_kind: "workflow",
    reason: "Anchor summary is insufficient before retry",
    confidence: 0.7,
  });
  assert.equal(rehydrate.operation, "rehydrate_payload");

  const generic = MemoryAdjudicationProposalSchema.parse({
    operation: "promote_memory",
    disposition: "recommend",
    target_kind: "workflow",
    target_level: "L2",
    reason: "Promote repeated successful trace",
    confidence: 0.85,
  });
  assert.equal(generic.operation, "promote_memory");
});

test("memory governance operation contracts parse promote compress form_pattern and rehydrate requests", () => {
  const promote = MemoryPromoteRequest.parse({
    candidate_node_ids: ["node_1"],
    target_kind: "workflow",
    target_level: "L2",
    input_text: "promote stable repair trace",
    adjudication: {
      operation: "promote_memory",
      disposition: "recommend",
      target_kind: "workflow",
      target_level: "L2",
      reason: "Stable repeated repair trace",
      confidence: 0.82,
    },
  });
  assert.equal(promote.target_level, "L2");

  const compress = MemoryCompressRequest.parse({
    node_ids: ["node_1", "node_2"],
    compression_mode: "anchor_only",
    preserve_anchor: true,
    input_sha256: "a".repeat(64),
    adjudication: {
      operation: "compress_memory",
      disposition: "recommend",
      target_kind: "event",
      reason: "Keep anchor only, drop redundant details",
      confidence: 0.71,
    },
  });
  assert.equal(compress.compression_mode, "anchor_only");

  const pattern = MemoryFormPatternRequest.parse({
    source_node_ids: ["node_1", "node_2"],
    task_signature: "fix-node-test-failure",
    error_signature: "node-test-export-mismatch",
    workflow_signature: "inspect-patch-rerun-targeted-test",
    input_text: "form stable pattern from repeated successful workflows",
    adjudication: {
      operation: "form_pattern",
      disposition: "recommend",
      target_kind: "pattern",
      target_level: "L3",
      reason: "Signatures and outcomes align",
      confidence: 0.86,
    },
  });
  assert.equal(pattern.target_level, "L3");

  const rehydrate = MemoryPayloadRehydrateToolRequest.parse({
    anchor_id: "a_123",
    mode: "partial",
    reason: "Need full logs before retry",
    adjudication: {
      operation: "rehydrate_payload",
      disposition: "recommend",
      target_kind: "workflow",
      reason: "Need linked trace before retry",
      confidence: 0.69,
    },
  });
  assert.equal(rehydrate.mode, "partial");
});

test("governance helpers mark all governed operations as requiring admissibility", () => {
  assert.equal(requiresMemoryAdmissibilityCheck("promote_memory"), true);
  assert.equal(requiresMemoryAdmissibilityCheck("rehydrate_payload"), true);
  assert.equal(
    proposalRequiresMemoryAdmissibilityCheck({
      operation: "form_pattern",
      disposition: "recommend",
      target_kind: "pattern",
      target_level: "L3",
      reason: "Stable repeated workflow",
      confidence: 0.88,
    }),
    true,
  );
  assert.equal(
    proposalTargetsGovernedMemoryMutation({
      disposition: "recommend",
      target_kind: "pattern",
    }),
    true,
  );
  assert.equal(
    proposalTargetsGovernedMemoryMutation({
      disposition: "reject",
      target_kind: "none",
    }),
    false,
  );
});
