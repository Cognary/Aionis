import test from "node:test";
import assert from "node:assert/strict";

import {
  applyControlProfileCandidateFilter,
  resolveExecutionKernelInputs,
  selectTools,
} from "../../src/memory/tools-select.ts";

test("control profile filters broad scan candidates before tool selection", () => {
  const kernel = resolveExecutionKernelInputs(
    {
      control_profile_v1: {
        version: 1,
        profile: "triage",
        max_same_tool_streak: 2,
        max_no_progress_streak: 2,
        max_duplicate_observation_streak: 2,
        max_steps: 8,
        allow_broad_scan: false,
        allow_broad_test: false,
        escalate_on_blocker: true,
        reviewer_ready_required: false,
      },
    },
    null,
  );
  const out = applyControlProfileCandidateFilter(
    ["broad-auth-scan", "read-dashboard-doc", "broad-token-drift-remediation-scan"],
    kernel.controlProfile,
  );

  assert.deepEqual(out.filteredCandidates, ["read-dashboard-doc"]);
  assert.deepEqual(out.deniedByProfile, [
    { name: "broad-auth-scan", reason: "control_profile" },
    { name: "broad-token-drift-remediation-scan", reason: "control_profile" },
  ]);
});

test("tools/select derives control profile from execution state when explicit profile is absent", () => {
  const kernel = resolveExecutionKernelInputs(
    { source: "test-tools-select" },
    {
      state_id: "state-1",
      scope: "openclaw:test",
      task_brief: "Repair dashboard auth drift",
      current_stage: "review",
      active_role: "review",
      owned_files: ["src/auth.ts"],
      modified_files: ["src/auth.ts"],
      pending_validations: ["verify dashboard auth path"],
      completed_validations: [],
      last_accepted_hypothesis: null,
      rejected_paths: [],
      unresolved_blockers: [],
      rollback_notes: [],
      reviewer_contract: null,
      resume_anchor: null,
      updated_at: new Date().toISOString(),
      version: 1,
    },
  );

  assert.equal(kernel.controlProfileOrigin, "state_derived");
  assert.equal(kernel.controlProfile?.profile, "review");
  assert.equal(kernel.executionState?.current_stage, "review");

  const out = applyControlProfileCandidateFilter(
    ["broad-auth-scan", "read-review-notes"],
    kernel.controlProfile,
  );
  assert.deepEqual(out.filteredCandidates, ["read-review-notes"]);
  assert.deepEqual(out.deniedByProfile, [
    { name: "broad-auth-scan", reason: "control_profile" },
  ]);
});

test("tools/select prefers the preferred tool within a known family when no explicit policy prefer is present", async () => {
  const result = await selectTools(
    null,
    {
      scope: "openclaw:test",
      context: { source: "test-tools-select" },
      candidates: ["read-markdown-impl", "read-source-focused-v2"],
      strict: false,
    },
    "memory",
    "default",
    {
      liteWriteStore: {
        insertExecutionDecision: async () => ({ id: "decision-1", created_at: new Date().toISOString() }),
        listRuleCandidates: async () => [],
      },
    },
  );

  assert.deepEqual(result.selection.ordered, ["read-source-focused-v2", "read-markdown-impl"]);
  assert.equal(result.selection.selected, "read-source-focused-v2");
  assert.equal(result.execution_kernel?.tool_registry_present, true);
  assert.equal(result.execution_kernel?.family_aware_ordering_applied, true);
  assert.equal(result.execution_kernel?.candidate_families?.[0]?.capability_family, "focused_repo_read");
  assert.equal(result.execution_kernel?.candidate_families?.[0]?.quality_tier, "supported");
  assert.equal(result.execution_kernel?.candidate_families?.[1]?.quality_tier, "preferred");
});
