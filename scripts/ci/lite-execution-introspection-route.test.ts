import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { createRequestGuards } from "../../src/app/request-guards.ts";
import { registerHostErrorHandler } from "../../src/host/http-host-bootstrap-shared.ts";
import { registerSdkDemoMemoryAccessRoutes as registerMemoryAccessRoutes } from "../../src/routes/sdk-demo-memory-access.ts";
import {
  ExecutionMemoryIntrospectionResponseSchema,
  MemoryAnchorV1Schema,
} from "../../src/memory/schemas.ts";
import { applyMemoryWrite, prepareMemoryWrite } from "../../src/memory/write.ts";
import { createLiteWriteStore } from "../../src/store/lite-write-store.ts";
import { InflightGate } from "../../src/util/inflight_gate.ts";

function tmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aionis-lite-execution-introspection-"));
  return path.join(dir, `${name}.sqlite`);
}

function buildRequestGuards() {
  return createRequestGuards({
    env: {
      AIONIS_EDITION: "lite",
      MEMORY_AUTH_MODE: "off",
      TENANT_QUOTA_ENABLED: false,
      LITE_LOCAL_ACTOR_ID: "local-user",
      MEMORY_TENANT_ID: "default",
      MEMORY_SCOPE: "default",
      APP_ENV: "test",
      ADMIN_TOKEN: "",
      TRUST_PROXY: false,
      TRUSTED_PROXY_CIDRS: [],
      RATE_LIMIT_ENABLED: false,
      WRITE_RATE_LIMIT_MAX_WAIT_MS: 0,
      RECALL_TEXT_EMBED_RATE_LIMIT_MAX_WAIT_MS: 0,
    } as any,
    embedder: null,
    recallLimiter: null,
    debugEmbedLimiter: null,
    writeLimiter: null,
    sandboxWriteLimiter: null,
    sandboxReadLimiter: null,
    recallTextEmbedLimiter: null,
    recallInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
    writeInflightGate: new InflightGate({ maxInflight: 8, maxQueue: 8, queueTimeoutMs: 100 }),
  });
}

async function seedExecutionIntrospectionFixture(dbPath: string) {
  const liteWriteStore = createLiteWriteStore(dbPath);
  const workflowAnchor = MemoryAnchorV1Schema.parse({
    anchor_kind: "workflow",
    anchor_level: "L2",
    task_signature: "repair-export-node-tests",
    error_signature: "node-export-mismatch",
    workflow_signature: "execution_workflow:d693c6beba272a6e135b54be",
    summary: "Inspect failing test and patch export",
    tool_set: ["edit", "test"],
    outcome: {
      status: "success",
      result_class: "workflow_reuse",
      success_score: 0.93,
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
    maintenance: {
      model: "lazy_online_v1",
      maintenance_state: "retain",
      offline_priority: "retain_workflow",
      lazy_update_fields: ["usage_count", "last_used_at"],
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
    workflow_promotion: {
      promotion_state: "stable",
      promotion_origin: "replay_promote",
      required_observations: 2,
      observed_count: 2,
      last_transition: "promoted_to_stable",
      last_transition_at: "2026-03-20T00:00:00Z",
      source_status: "active",
    },
    schema_version: "anchor_v1",
  });
  const trustedPattern = MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: "stable",
    credibility_state: "trusted",
    task_signature: "tools_select:repair-export:edit",
    task_family: "task:repair_export",
    error_signature: "node-export-mismatch",
    error_family: "error:node-export-mismatch",
    workflow_signature: "execution_workflow:d693c6beba272a6e135b54be",
    summary: "Prefer edit for export repair after repeated successful runs.",
    tool_set: ["bash", "edit", "test"],
    selected_tool: "edit",
    outcome: {
      status: "success",
      result_class: "tool_selection_pattern_stable",
      success_score: 0.94,
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
    maintenance: {
      model: "lazy_online_v1",
      maintenance_state: "retain",
      offline_priority: "retain_trusted",
      lazy_update_fields: ["usage_count", "last_used_at"],
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
    promotion: {
      required_distinct_runs: 2,
      distinct_run_count: 2,
      observed_run_ids: [randomUUID(), randomUUID()],
      counter_evidence_count: 0,
      counter_evidence_open: false,
      credibility_state: "trusted",
      previous_credibility_state: "candidate",
      last_transition: "promoted_to_trusted",
      last_transition_at: "2026-03-20T00:00:00Z",
      stable_at: "2026-03-20T00:00:00Z",
      last_validated_at: "2026-03-20T00:00:00Z",
      last_counter_evidence_at: null,
    },
    trust_hardening: {
      task_family: "task:repair_export",
      error_family: "error:node-export-mismatch",
      observed_task_families: ["task:repair_export"],
      observed_error_families: ["error:node-export-mismatch"],
      distinct_task_family_count: 1,
      distinct_error_family_count: 1,
      post_contest_observed_run_ids: [],
      post_contest_distinct_run_count: 0,
      promotion_gate_kind: "current_distinct_runs_v1",
      promotion_gate_satisfied: true,
      revalidation_floor_kind: "post_contest_two_fresh_runs_v1",
      revalidation_floor_satisfied: true,
      task_affinity_weighting_enabled: true,
    },
    schema_version: "anchor_v1",
  });
  const contestedPattern = MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: "provisional",
    credibility_state: "contested",
    task_signature: "tools_select:repair-export:bash",
    error_signature: "node-export-mismatch",
    workflow_signature: "execution_workflow:d693c6beba272a6e135b54be",
    summary: "Older bash-first pattern now has counter-evidence.",
    tool_set: ["bash", "edit", "test"],
    selected_tool: "bash",
    outcome: {
      status: "mixed",
      result_class: "tool_selection_pattern_contested",
      success_score: 0.41,
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
    maintenance: {
      model: "lazy_online_v1",
      maintenance_state: "review",
      offline_priority: "review_counter_evidence",
      lazy_update_fields: ["usage_count", "last_used_at"],
      last_maintenance_at: "2026-03-20T00:00:00Z",
    },
    promotion: {
      required_distinct_runs: 2,
      distinct_run_count: 2,
      observed_run_ids: [randomUUID(), randomUUID()],
      counter_evidence_count: 1,
      counter_evidence_open: true,
      credibility_state: "contested",
      previous_credibility_state: "trusted",
      last_transition: "counter_evidence_opened",
      last_transition_at: "2026-03-20T00:00:00Z",
      stable_at: "2026-03-20T00:00:00Z",
      last_validated_at: "2026-03-20T00:00:00Z",
      last_counter_evidence_at: "2026-03-20T00:00:00Z",
    },
    trust_hardening: {
      task_family: "task:repair_export",
      error_family: "error:node-export-mismatch",
      observed_task_families: ["task:repair_export"],
      observed_error_families: ["error:node-export-mismatch"],
      distinct_task_family_count: 1,
      distinct_error_family_count: 1,
      post_contest_observed_run_ids: [randomUUID(), randomUUID()],
      post_contest_distinct_run_count: 2,
      promotion_gate_kind: "current_distinct_runs_v1",
      promotion_gate_satisfied: true,
      revalidation_floor_kind: "post_contest_two_fresh_runs_v1",
      revalidation_floor_satisfied: true,
      task_affinity_weighting_enabled: true,
    },
    schema_version: "anchor_v1",
  });

  const prepared = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      producer_agent_id: "local-user",
      owner_agent_id: "local-user",
      input_text: "seed execution introspection route fixture",
      auto_embed: false,
      nodes: [
        {
          id: randomUUID(),
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
          id: randomUUID(),
          type: "event",
          title: "Replay Episode: Duplicate candidate",
          text_summary: "Candidate workflow that should be suppressed by stable workflow",
          slots: {
            summary_kind: "workflow_candidate",
            compression_layer: "L1",
            execution_native_v1: {
              schema_version: "execution_native_v1",
              execution_kind: "workflow_candidate",
              summary_kind: "workflow_candidate",
              compression_layer: "L1",
              task_signature: "repair-export-node-tests",
              error_signature: "node-export-mismatch",
              workflow_signature: "execution_workflow:d693c6beba272a6e135b54be",
              anchor_kind: "workflow",
              anchor_level: "L1",
              workflow_promotion: {
                promotion_state: "candidate",
                promotion_origin: "replay_learning_episode",
                required_observations: 2,
                observed_count: 1,
                last_transition: "candidate_observed",
                last_transition_at: "2026-03-20T00:00:00Z",
                source_status: null,
              },
              maintenance: {
                model: "lazy_online_v1",
                maintenance_state: "observe",
                offline_priority: "promote_candidate",
                lazy_update_fields: ["usage_count", "last_used_at"],
                last_maintenance_at: "2026-03-20T00:00:00Z",
              },
            },
            workflow_write_projection: {
              generated_by: "execution_write_projection_v1",
              source_node_id: "source-duplicate",
              source_client_id: "execution-event:duplicate",
              generated_at: "2026-03-20T00:00:00Z",
            },
          },
        },
        {
          client_id: "workflow_projection:2c93d96d-ad3b-52ed-aa70-446c847ab391:execution_workflow:574d5d7f3f31626f2be7ef76",
          type: "event",
          title: "Replay Episode: Ready candidate",
          text_summary: "Candidate workflow ready for promotion",
          slots: {
            summary_kind: "workflow_candidate",
            compression_layer: "L1",
            execution_native_v1: {
              schema_version: "execution_native_v1",
              execution_kind: "workflow_candidate",
              summary_kind: "workflow_candidate",
              compression_layer: "L1",
              task_signature: "repair-import-node-tests",
              error_signature: "node-import-mismatch",
              workflow_signature: "execution_workflow:574d5d7f3f31626f2be7ef76",
              anchor_kind: "workflow",
              anchor_level: "L1",
              workflow_promotion: {
                promotion_state: "candidate",
                promotion_origin: "replay_learning_episode",
                required_observations: 2,
                observed_count: 2,
                last_transition: "candidate_observed",
                last_transition_at: "2026-03-20T00:00:00Z",
                source_status: null,
              },
              maintenance: {
                model: "lazy_online_v1",
                maintenance_state: "observe",
                offline_priority: "promote_candidate",
                lazy_update_fields: ["usage_count", "last_used_at"],
                last_maintenance_at: "2026-03-20T00:00:00Z",
              },
            },
            workflow_write_projection: {
              generated_by: "execution_write_projection_v1",
              source_node_id: "2c93d96d-ad3b-52ed-aa70-446c847ab391",
              source_client_id: "execution-event:ready",
              generated_at: "2026-03-20T00:00:00Z",
            },
          },
        },
        {
          client_id: "workflow_projection:6872dfa2-6894-5d73-95e7-71e8415f4f23:execution_workflow:574d5d7f3f31626f2be7ef76",
          type: "event",
          title: "Replay Episode: Observing duplicate candidate",
          text_summary: "Older candidate workflow for the same signature",
          slots: {
            summary_kind: "workflow_candidate",
            compression_layer: "L1",
            execution_native_v1: {
              schema_version: "execution_native_v1",
              execution_kind: "workflow_candidate",
              summary_kind: "workflow_candidate",
              compression_layer: "L1",
              task_signature: "repair-import-node-tests",
              error_signature: "node-import-mismatch",
              workflow_signature: "execution_workflow:574d5d7f3f31626f2be7ef76",
              anchor_kind: "workflow",
              anchor_level: "L1",
              workflow_promotion: {
                promotion_state: "candidate",
                promotion_origin: "replay_learning_episode",
                required_observations: 2,
                observed_count: 1,
                last_transition: "candidate_observed",
                last_transition_at: "2026-03-19T00:00:00Z",
                source_status: null,
              },
              maintenance: {
                model: "lazy_online_v1",
                maintenance_state: "observe",
                offline_priority: "promote_candidate",
                lazy_update_fields: ["usage_count", "last_used_at"],
                last_maintenance_at: "2026-03-19T00:00:00Z",
              },
            },
            workflow_write_projection: {
              generated_by: "execution_write_projection_v1",
              source_node_id: "6872dfa2-6894-5d73-95e7-71e8415f4f23",
              source_client_id: "execution-event:observing",
              generated_at: "2026-03-19T00:00:00Z",
            },
          },
        },
        {
          client_id: "execution-event:ready",
          type: "event",
          title: "Source event for ready candidate",
          text_summary: "Raw continuity event that produced the ready candidate",
          slots: {
            execution_packet_v1: {
              version: 1,
              state_id: "state-ready",
              current_stage: "patch",
              active_role: "patch",
              task_brief: "Fix import failure in node tests",
              target_files: ["src/routes/import.ts"],
              next_action: "Patch src/routes/import.ts and rerun import tests",
              hard_constraints: [],
              accepted_facts: [],
              rejected_paths: [],
              pending_validations: ["npm run -s test:lite -- import"],
              unresolved_blockers: [],
              rollback_notes: [],
              review_contract: null,
              resume_anchor: {
                anchor: "resume:src/routes/import.ts",
                file_path: "src/routes/import.ts",
                symbol: null,
                repo_root: "/Volumes/ziel/Aionisgo",
              },
              artifact_refs: [],
              evidence_refs: [],
            },
          },
        },
        {
          client_id: "execution-event:observing",
          type: "event",
          title: "Source event for observing candidate",
          text_summary: "Raw continuity event that produced the observing duplicate candidate",
          slots: {
            execution_packet_v1: {
              version: 1,
              state_id: "state-observing",
              current_stage: "patch",
              active_role: "patch",
              task_brief: "Fix import failure in node tests",
              target_files: ["src/routes/import.ts"],
              next_action: "Patch src/routes/import.ts and rerun import tests",
              hard_constraints: [],
              accepted_facts: [],
              rejected_paths: [],
              pending_validations: ["npm run -s test:lite -- import"],
              unresolved_blockers: [],
              rollback_notes: [],
              review_contract: null,
              resume_anchor: {
                anchor: "resume:src/routes/import.ts",
                file_path: "src/routes/import.ts",
                symbol: null,
                repo_root: "/Volumes/ziel/Aionisgo",
              },
              artifact_refs: [],
              evidence_refs: [],
            },
          },
        },
        {
          client_id: "execution-event:after-stable",
          type: "event",
          title: "Source event after stable workflow exists",
          text_summary: "Raw continuity event that should now be skipped because stable workflow already exists",
          slots: {
            execution_packet_v1: {
              version: 1,
              state_id: "state-after-stable",
              current_stage: "patch",
              active_role: "patch",
              task_brief: "Inspect failing test and patch export",
              target_files: ["src/routes/export.ts"],
              next_action: "Patch src/routes/export.ts and rerun export tests",
              hard_constraints: [],
              accepted_facts: [],
              rejected_paths: [],
              pending_validations: ["npm run -s test:lite -- export"],
              unresolved_blockers: [],
              rollback_notes: [],
              review_contract: null,
              resume_anchor: {
                anchor: "resume:src/routes/export.ts",
                file_path: "src/routes/export.ts",
                symbol: null,
                repo_root: "/Volumes/ziel/Aionisgo",
              },
              artifact_refs: [],
              evidence_refs: [],
            },
          },
        },
        {
          client_id: "execution-event:no-continuity",
          type: "event",
          title: "Raw event without continuity",
          text_summary: "This event should appear as skipped_missing_execution_continuity in the projection report",
          slots: {},
        },
        {
          id: randomUUID(),
          type: "concept",
          title: "Stable edit pattern",
          text_summary: trustedPattern.summary,
          slots: {
            summary_kind: "pattern_anchor",
            compression_layer: "L3",
            anchor_v1: trustedPattern,
            operator_override_v1: {
              schema_version: "operator_override_v1",
              suppressed: true,
              reason: "operator stop-loss for trusted edit pattern",
              mode: "shadow_learn",
              until: null,
              updated_at: "2026-03-20T00:00:00Z",
              updated_by: "local-user",
              last_action: "suppress",
            },
          },
        },
        {
          id: randomUUID(),
          type: "concept",
          title: "Contested bash pattern",
          text_summary: contestedPattern.summary,
          slots: {
            summary_kind: "pattern_anchor",
            compression_layer: "L3",
            anchor_v1: contestedPattern,
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

  await liteWriteStore.withTx(() =>
    applyMemoryWrite({} as any, prepared, {
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      associativeLinkOrigin: "memory_write",
      write_access: liteWriteStore,
    }),
  );

  return { liteWriteStore };
}

async function seedExecutionNativeOnlyWorkflowIntrospectionFixture(dbPath: string) {
  const liteWriteStore = createLiteWriteStore(dbPath);
  const prepared = await prepareMemoryWrite(
    {
      tenant_id: "default",
      scope: "default",
      actor: "local-user",
      producer_agent_id: "local-user",
      owner_agent_id: "local-user",
      input_text: "seed execution-native-only workflow introspection fixture",
      auto_embed: false,
      nodes: [
        {
          id: randomUUID(),
          type: "procedure",
          title: "Fix export failure",
          text_summary: "Reusable repair workflow for export failure",
          slots: {
            summary_kind: "workflow_anchor",
            compression_layer: "L2",
            execution_native_v1: {
              schema_version: "execution_native_v1",
              execution_kind: "workflow_anchor",
              summary_kind: "workflow_anchor",
              compression_layer: "L2",
              task_signature: "repair-export-node-tests",
              workflow_signature: "execution-native-only-export-fix",
              anchor_kind: "workflow",
              anchor_level: "L2",
              tool_set: ["edit", "test"],
              workflow_promotion: {
                promotion_state: "stable",
                promotion_origin: "execution_write_auto_promotion",
                required_observations: 2,
                observed_count: 2,
                last_transition: "promoted_to_stable",
                last_transition_at: "2026-03-20T00:20:00Z",
                source_status: null,
              },
              maintenance: {
                model: "lazy_online_v1",
                maintenance_state: "retain",
                offline_priority: "retain_workflow",
                lazy_update_fields: ["usage_count", "last_used_at"],
                last_maintenance_at: "2026-03-20T00:20:00Z",
              },
            },
            workflow_write_projection: {
              generated_by: "execution_write_projection_v1",
              source_node_id: "55555555-5555-4555-8555-555555555555",
              source_client_id: "execution-event:stable",
              generated_at: "2026-03-20T00:20:00Z",
              auto_promoted: true,
            },
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

  await liteWriteStore.withTx(() =>
    applyMemoryWrite({} as any, prepared, {
      maxTextLen: 10_000,
      piiRedaction: false,
      allowCrossScopeEdges: false,
      shadowDualWriteEnabled: false,
      shadowDualWriteStrict: false,
      associativeLinkOrigin: "memory_write",
      write_access: liteWriteStore,
    }),
  );

  return { liteWriteStore };
}

test("execution introspection route exposes demo-friendly workflow and pattern surfaces", async () => {
  const dbPath = tmpDbPath("execution-introspect");
  const app = Fastify();
  const { liteWriteStore } = await seedExecutionIntrospectionFixture(dbPath);
  try {
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryAccessRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        APP_ENV: "test",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10_000,
        PII_REDACTION: false,
        ALLOW_CROSS_SCOPE_EDGES: false,
        MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
        MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
      } as any,
      liteWriteStore,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: {
        tenant_id: "default",
        scope: "default",
        limit: 8,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = ExecutionMemoryIntrospectionResponseSchema.parse(response.json());
    assert.equal(body.summary_version, "execution_memory_introspection_v1");
    assert.equal(body.recommended_workflows.length, 1);
    assert.equal(body.candidate_workflows.length, 1);
    assert.equal(body.rehydration_candidates.length, 1);
    assert.equal(body.trusted_patterns.length, 1);
    assert.equal(body.contested_patterns.length, 1);
    assert.equal(body.pattern_signals.length, 2);
    assert.equal(body.workflow_signals.length, 2);
    assert.equal(body.inventory.raw_workflow_anchor_count, 1);
    assert.equal(body.inventory.raw_workflow_candidate_count, 3);
    assert.equal(body.inventory.suppressed_candidate_workflow_count, 2);
    assert.equal(body.inventory.continuity_projected_candidate_count, 3);
    assert.equal(body.inventory.continuity_auto_promoted_workflow_count, 0);
    assert.equal(body.inventory.raw_pattern_anchor_count, 2);
    assert.equal(body.continuity_projection_report.sampled_source_event_count, 4);
    assert.equal(body.continuity_projection_report.decision_counts.projected, 2);
    assert.equal(body.continuity_projection_report.decision_counts.skipped_stable_exists, 1);
    assert.equal(body.continuity_projection_report.decision_counts.skipped_missing_execution_continuity, 1);
    assert.equal(body.continuity_projection_report.decision_counts.eligible_without_projection, 0);
    assert.ok(body.continuity_projection_report.samples.some((sample) => sample.source_client_id === "execution-event:ready" && sample.decision === "projected"));
    assert.ok(body.continuity_projection_report.samples.some((sample) => sample.source_client_id === "execution-event:observing" && sample.decision === "projected"));
    assert.ok(body.continuity_projection_report.samples.some((sample) => sample.source_client_id === "execution-event:after-stable" && sample.decision === "skipped_stable_exists"));
    assert.ok(body.continuity_projection_report.samples.some((sample) => sample.source_client_id === "execution-event:no-continuity" && sample.decision === "skipped_missing_execution_continuity"));
    assert.equal(body.workflow_signal_summary.stable_workflow_count, 1);
    assert.equal(body.workflow_signal_summary.promotion_ready_workflow_count, 1);
    assert.equal(body.workflow_signal_summary.observing_workflow_count, 0);
    assert.equal(body.pattern_signal_summary.trusted_pattern_count, 1);
    assert.equal(body.pattern_signal_summary.contested_pattern_count, 1);
    assert.equal(body.pattern_signal_summary.candidate_pattern_count, 0);
    assert.equal(body.action_packet_summary.recommended_workflow_count, 1);
    assert.equal(body.action_packet_summary.candidate_workflow_count, 1);
    assert.equal(body.workflow_lifecycle_summary.promotion_ready_count, 1);
    assert.equal(body.workflow_maintenance_summary.observe_count, 1);
    assert.equal(body.workflow_maintenance_summary.retain_count, 1);
    assert.equal(body.pattern_maintenance_summary.retain_count, 1);
    assert.equal(body.pattern_maintenance_summary.review_count, 1);
    assert.equal(body.trusted_patterns[0]?.suppressed, true);
    assert.equal(body.trusted_patterns[0]?.suppression_mode, "shadow_learn");
    assert.equal(body.trusted_patterns[0]?.trust_hardening?.promotion_gate_kind, "current_distinct_runs_v1");
    assert.equal(body.trusted_patterns[0]?.trust_hardening?.task_affinity_weighting_enabled, true);
    assert.equal(body.contested_patterns[0]?.trust_hardening?.post_contest_distinct_run_count, 2);
    assert.equal(body.contested_patterns[0]?.trust_hardening?.revalidation_floor_kind, "post_contest_two_fresh_runs_v1");
    assert.ok(body.pattern_signals.some((entry) => entry.anchor_id === body.trusted_patterns[0]?.anchor_id && entry.trust_hardening?.promotion_gate_kind === "current_distinct_runs_v1"));
    assert.ok(body.pattern_signals.some((entry) => entry.anchor_id === body.trusted_patterns[0]?.anchor_id && entry.suppressed === true));
    assert.equal(body.candidate_workflows[0]?.projection_generated_by, "execution_write_projection_v1");
    assert.equal(body.candidate_workflows[0]?.projection_source_client_id, "execution-event:ready");
    assert.match(body.demo_surface.headline, /stable workflows=1/);
    assert.match(body.demo_surface.headline, /promotion-ready workflows=1/);
    assert.match(body.demo_surface.headline, /trusted patterns=1/);
    assert.match(body.demo_surface.headline, /contested patterns=1/);
    assert.ok(body.demo_surface.sections.workflows.some((line) => line.includes("stable workflow: Fix export failure")));
    assert.ok(body.demo_surface.sections.workflows.some((line) => line.includes("promotion=ready")));
    assert.ok(body.demo_surface.sections.workflows.some((line) => line.includes("projection=execution_write_projection_v1")));
    assert.ok(body.demo_surface.sections.patterns.some((line) => line.includes("trusted pattern: prefer edit")));
    assert.ok(body.demo_surface.sections.patterns.some((line) => line.includes("suppressed=shadow_learn")));
    assert.ok(body.demo_surface.sections.patterns.some((line) => line.includes("contested pattern: prefer bash")));
    assert.ok(body.demo_surface.sections.maintenance.some((line) => line.includes("workflow maintenance:")));
    assert.ok(body.demo_surface.sections.maintenance.some((line) => line.includes("pattern maintenance:")));
    assert.match(body.demo_surface.merged_text, /# Execution Memory Demo/);
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});

test("execution introspection demo workflow lines keep source and tools for execution-native-only stable workflows", async () => {
  const dbPath = tmpDbPath("execution-introspect-execution-native-only");
  const app = Fastify();
  const { liteWriteStore } = await seedExecutionNativeOnlyWorkflowIntrospectionFixture(dbPath);
  try {
    const guards = buildRequestGuards();
    registerHostErrorHandler(app);
    registerMemoryAccessRoutes({
      app,
      env: {
        AIONIS_EDITION: "lite",
        APP_ENV: "test",
        MEMORY_SCOPE: "default",
        MEMORY_TENANT_ID: "default",
        LITE_LOCAL_ACTOR_ID: "local-user",
        MAX_TEXT_LEN: 10_000,
        PII_REDACTION: false,
        ALLOW_CROSS_SCOPE_EDGES: false,
        MEMORY_SHADOW_DUAL_WRITE_ENABLED: false,
        MEMORY_SHADOW_DUAL_WRITE_STRICT: false,
      } as any,
      liteWriteStore,
      requireMemoryPrincipal: guards.requireMemoryPrincipal,
      withIdentityFromRequest: guards.withIdentityFromRequest,
      enforceRateLimit: guards.enforceRateLimit,
      enforceTenantQuota: guards.enforceTenantQuota,
      tenantFromBody: guards.tenantFromBody,
      acquireInflightSlot: guards.acquireInflightSlot,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/execution/introspect",
      payload: {
        tenant_id: "default",
        scope: "default",
        limit: 8,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = ExecutionMemoryIntrospectionResponseSchema.parse(response.json());
    assert.equal(body.recommended_workflows.length, 1);
    assert.equal(body.inventory.continuity_auto_promoted_workflow_count, 1);
    assert.ok(body.demo_surface.sections.workflows.some((line) => line.includes("source=playbook")));
    assert.ok(body.demo_surface.sections.workflows.some((line) => line.includes("tools=edit, test")));
    assert.ok(body.demo_surface.sections.workflows.some((line) => line.includes("projection=execution_write_projection_v1")));
  } finally {
    await app.close();
    await liteWriteStore.close();
  }
});
