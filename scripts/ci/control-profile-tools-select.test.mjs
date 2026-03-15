import test from "node:test";
import assert from "node:assert/strict";

import { applyControlProfileCandidateFilter } from "../../src/memory/tools-select.ts";

test("control profile filters broad scan candidates before tool selection", () => {
  const out = applyControlProfileCandidateFilter(
    ["broad-auth-scan", "read-dashboard-doc", "broad-token-drift-remediation-scan"],
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
  );

  assert.deepEqual(out.filteredCandidates, ["read-dashboard-doc"]);
  assert.deepEqual(out.deniedByProfile, [
    { name: "broad-auth-scan", reason: "control_profile" },
    { name: "broad-token-drift-remediation-scan", reason: "control_profile" },
  ]);
});
