import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildReplayLearningProjectionArtifacts, buildReplayLearningProjectionDefaults } from "../../src/memory/replay-learning.ts";

function baseSource() {
  return {
    tenant_id: "default",
    scope: "default",
    scope_key: "default",
    actor: "local-user",
    playbook_id: randomUUID(),
    playbook_version: 2,
    playbook_node_id: randomUUID(),
    playbook_title: "Fix export failure",
    playbook_summary: "Replay repair learning episode for export failure",
    playbook_slots: {
      matchers: {
        task_kind: "repair_export",
      },
      source_run_id: randomUUID(),
      created_from_run_ids: [randomUUID()],
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
    },
    source_commit_id: randomUUID(),
    metrics: {
      total_steps: 2,
      success_ratio: 1,
    },
  };
}

test("replay-learning projection artifacts produce candidate workflow before promotion threshold", () => {
  const source = baseSource();
  const projectedAt = "2026-03-20T00:00:00Z";
  const defaults = buildReplayLearningProjectionDefaults({
    enabled: true,
    mode: "rule_and_episode",
    delivery: "sync_inline",
    targetRuleState: "draft",
    minTotalSteps: 1,
    minSuccessRatio: 1,
    maxMatcherBytes: 4096,
    maxToolPrefer: 8,
    episodeTtlDays: 30,
  });
  const plan = buildReplayLearningProjectionArtifacts({
    source,
    matcherFingerprint: "matcher-fp",
    policyFingerprint: "policy-fp",
    duplicateRuleNodeId: null,
    workflowSignature: "replay-learning-workflow-sig",
    preferTools: ["edit", "test"],
    shouldCreateRule: true,
    shouldCreateEpisode: true,
    shouldPromoteStableWorkflow: false,
    observedWorkflowCount: defaults.min_total_steps,
    projectedAt,
    ttlExpiresAt: "2026-04-19T00:00:00Z",
  });

  const episode = plan.nodes.find((node) => node.client_id === plan.episodeClientId) as Record<string, any> | undefined;
  const workflow = plan.nodes.find((node) => node.client_id === plan.workflowClientId);
  assert.ok(episode);
  assert.equal(plan.shouldPromoteStableWorkflow, false);
  assert.equal(episode?.type, "event");
  assert.equal(episode?.slots?.summary_kind, "workflow_candidate");
  assert.equal(episode?.slots?.execution_native_v1?.execution_kind, "workflow_candidate");
  assert.equal(episode?.slots?.execution_native_v1?.workflow_promotion?.promotion_state, "candidate");
  assert.equal(episode?.slots?.execution_native_v1?.workflow_promotion?.observed_count, 1);
  assert.equal(workflow, undefined);
});

test("replay-learning projection artifacts auto-promote to stable workflow when observation threshold is met", () => {
  const source = baseSource();
  const projectedAt = "2026-03-20T00:00:00Z";
  const plan = buildReplayLearningProjectionArtifacts({
    source,
    matcherFingerprint: "matcher-fp",
    policyFingerprint: "policy-fp",
    duplicateRuleNodeId: null,
    workflowSignature: "replay-learning-workflow-sig",
    preferTools: ["edit", "test"],
    shouldCreateRule: true,
    shouldCreateEpisode: true,
    shouldPromoteStableWorkflow: true,
    observedWorkflowCount: 2,
    projectedAt,
    ttlExpiresAt: "2026-04-19T00:00:00Z",
  });

  const episode = plan.nodes.find((node) => node.client_id === plan.episodeClientId) as Record<string, any> | undefined;
  const workflow = plan.nodes.find((node) => node.client_id === plan.workflowClientId) as Record<string, any> | undefined;
  assert.ok(episode);
  assert.ok(workflow);
  assert.equal(plan.shouldPromoteStableWorkflow, true);
  assert.equal(episode?.type, "event");
  assert.equal(episode?.slots?.summary_kind, "replay_learning_episode");
  assert.equal(episode?.slots?.execution_native_v1, undefined);
  assert.equal(workflow?.type, "procedure");
  assert.equal(workflow?.slots?.summary_kind, "workflow_anchor");
  assert.equal(workflow?.slots?.execution_native_v1?.execution_kind, "workflow_anchor");
  assert.equal(workflow?.slots?.execution_native_v1?.workflow_promotion?.promotion_origin, "replay_learning_auto_promotion");
  assert.equal(workflow?.slots?.execution_native_v1?.workflow_promotion?.promotion_state, "stable");
  assert.equal(workflow?.slots?.execution_native_v1?.workflow_promotion?.observed_count, 2);
  assert.equal(workflow?.slots?.execution_native_v1?.workflow_promotion?.required_observations, 2);
  assert.ok(plan.edges.some((edge) => (edge as any).src?.client_id === plan.workflowClientId && (edge as any).dst?.client_id === plan.episodeClientId));
});
