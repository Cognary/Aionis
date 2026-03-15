import { ControlProfileName, ControlProfileV1Schema, type ControlProfileV1 } from "./types.js";

const CONTROL_PROFILE_DEFAULTS: Record<ControlProfileName, ControlProfileV1> = {
  triage: ControlProfileV1Schema.parse({
    version: 1,
    profile: "triage",
    max_same_tool_streak: 3,
    max_no_progress_streak: 3,
    max_duplicate_observation_streak: 2,
    max_steps: 8,
    allow_broad_scan: true,
    allow_broad_test: false,
    escalate_on_blocker: true,
    reviewer_ready_required: false,
  }),
  patch: ControlProfileV1Schema.parse({
    version: 1,
    profile: "patch",
    max_same_tool_streak: 3,
    max_no_progress_streak: 2,
    max_duplicate_observation_streak: 2,
    max_steps: 10,
    allow_broad_scan: false,
    allow_broad_test: true,
    escalate_on_blocker: true,
    reviewer_ready_required: false,
  }),
  review: ControlProfileV1Schema.parse({
    version: 1,
    profile: "review",
    max_same_tool_streak: 2,
    max_no_progress_streak: 2,
    max_duplicate_observation_streak: 2,
    max_steps: 6,
    allow_broad_scan: false,
    allow_broad_test: false,
    escalate_on_blocker: true,
    reviewer_ready_required: true,
  }),
  resume: ControlProfileV1Schema.parse({
    version: 1,
    profile: "resume",
    max_same_tool_streak: 2,
    max_no_progress_streak: 2,
    max_duplicate_observation_streak: 2,
    max_steps: 6,
    allow_broad_scan: false,
    allow_broad_test: false,
    escalate_on_blocker: true,
    reviewer_ready_required: false,
  }),
};

export function controlProfileDefaults(profile: ControlProfileName): ControlProfileV1 {
  return CONTROL_PROFILE_DEFAULTS[profile];
}
