import stableStringify from "fast-json-stable-stringify";
import { ExecutionPacketV1Schema, ExecutionStateV1Schema, type ExecutionPacketV1, type ExecutionStateV1 } from "../execution/types.js";
import { ExecutionNativeV1Schema, MemoryAnchorV1Schema } from "./schemas.js";
import { sha256Hex } from "../util/crypto.js";
import { stableUuid } from "../util/uuid.js";
import type { PromoteMemoryGovernanceReviewProvider } from "./governance-provider-types.js";
import { buildWorkflowPromotionGovernancePreview } from "./workflow-promotion-governance.js";

type WriteProjectionSourceNode = {
  id: string;
  client_id?: string;
  scope: string;
  type: string;
  memory_lane: "private" | "shared";
  producer_agent_id?: string;
  owner_agent_id?: string;
  owner_team_id?: string;
  title?: string;
  text_summary?: string;
  slots: Record<string, unknown>;
  embed_text?: string;
};

type WriteProjectionEdge = {
  id: string;
  scope: string;
  type: string;
  src_id: string;
  dst_id: string;
  weight?: number;
  confidence?: number;
  decay_rate?: number;
};

type LiteWorkflowProjectionStore = {
  findExecutionNativeNodes: (args: {
    scope: string;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
    executionKind?: "workflow_candidate" | "workflow_anchor" | null;
    workflowSignature?: string | null;
    limit: number;
    offset: number;
  }) => Promise<{ rows: Array<{ id: string; client_id?: string | null; slots?: Record<string, unknown> }>; has_more: boolean }>;
  findLatestNodeByClientId: (scope: string, type: string, clientId: string) => Promise<{ id: string } | null>;
  findNodes: (args: {
    scope: string;
    type?: string | null;
    clientId?: string | null;
    slotsContains?: Record<string, unknown> | null;
    consumerAgentId?: string | null;
    consumerTeamId?: string | null;
    limit: number;
    offset: number;
  }) => Promise<{ rows: Array<{ id: string; client_id?: string | null; slots?: Record<string, unknown> }>; has_more: boolean }>;
};

type ProjectionResult = {
  nodes: WriteProjectionSourceNode[];
  edges: WriteProjectionEdge[];
};

type WorkflowProjectionAssessment =
  | { eligible: false; reason: "non_event" | "existing_workflow_memory" | "invalid_execution_state" | "invalid_execution_packet" | "missing_execution_continuity" }
  | {
      eligible: true;
      state: ExecutionStateV1 | null;
      packet: ExecutionPacketV1 | null;
      workflowSignature: string;
      projectionClientId: string;
      ownerAgentId: string | null;
      ownerTeamId: string | null;
    };

export type WorkflowProjectionExplainDecision =
  | "projected"
  | "skipped_existing_workflow_memory"
  | "skipped_invalid_execution_packet"
  | "skipped_invalid_execution_state"
  | "skipped_missing_execution_continuity"
  | "skipped_non_event"
  | "skipped_stable_exists"
  | "eligible_without_projection";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFileList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function synthesizePacketFromLightweightHandoff(source: WriteProjectionSourceNode): ExecutionPacketV1 | null {
  const slots = asRecord(source.slots);
  if (!slots) return null;
  if (firstString(slots.summary_kind) !== "handoff") return null;

  const handoffKind = firstString(slots.handoff_kind);
  const filePath = firstString(slots.file_path);
  const repoRoot = firstString(slots.repo_root);
  const symbol = firstString(slots.symbol);
  const explicitAnchor = firstString(slots.anchor);
  const anchor = explicitAnchor ?? (filePath ? `resume:${filePath}` : null);
  const taskBrief = firstString(slots.summary)
    ?? firstString(source.text_summary)
    ?? firstString(source.title);
  const targetFiles = normalizeFileList([
    ...stringList(slots.target_files),
    ...(filePath ? [filePath] : []),
  ]);

  if (!handoffKind || !taskBrief || (!anchor && targetFiles.length === 0)) {
    return null;
  }

  const nextAction = firstString(slots.next_action)
    ?? firstString(slots.handoff_text)
    ?? taskBrief;
  const acceptanceChecks = stringList(slots.acceptance_checks);
  const mustChange = stringList(slots.must_change);
  const mustRemove = stringList(slots.must_remove);
  const mustKeep = stringList(slots.must_keep);
  const risk = firstString(slots.risk);
  const stateId = `handoff:${sha256Hex(stableStringify({
    source_node_id: source.id,
    handoff_kind: handoffKind,
    anchor,
    task_brief: taskBrief,
  })).slice(0, 24)}`;

  try {
    return ExecutionPacketV1Schema.parse({
      version: 1,
      state_id: stateId,
      current_stage: "resume",
      active_role: "resume",
      task_brief: taskBrief,
      target_files: targetFiles,
      next_action: nextAction,
      hard_constraints: mustChange,
      accepted_facts: [],
      rejected_paths: mustRemove,
      pending_validations: acceptanceChecks,
      unresolved_blockers: risk ? [risk] : [],
      rollback_notes: mustKeep,
      review_contract: null,
      resume_anchor: anchor ? {
        anchor,
        file_path: filePath ?? null,
        symbol: symbol ?? null,
        repo_root: repoRoot ?? null,
      } : null,
      artifact_refs: [],
      evidence_refs: [],
    });
  } catch {
    return null;
  }
}

function taskBriefFromInputs(state: ExecutionStateV1 | null, packet: ExecutionPacketV1 | null): string | null {
  return firstString(state?.task_brief ?? null) ?? firstString(packet?.task_brief ?? null);
}

function collectTargetFiles(state: ExecutionStateV1, packet: ExecutionPacketV1 | null): string[] {
  const fromPacket = Array.isArray(packet?.target_files) ? packet.target_files : [];
  const fromState = state.owned_files.length > 0 ? state.owned_files : state.modified_files;
  return normalizeFileList([...(fromPacket ?? []), ...(fromState ?? [])]);
}

function collectTargetFilesFromInputs(state: ExecutionStateV1 | null, packet: ExecutionPacketV1 | null): string[] {
  if (state) return collectTargetFiles(state, packet);
  return normalizeFileList(Array.isArray(packet?.target_files) ? packet.target_files : []);
}

function deriveWorkflowSignatureFromInputs(state: ExecutionStateV1 | null, packet: ExecutionPacketV1 | null): string {
  const resumeAnchor = state?.resume_anchor ?? packet?.resume_anchor ?? null;
  const payload = {
    task_brief: normalizeLabel(taskBriefFromInputs(state, packet)),
    target_files: collectTargetFilesFromInputs(state, packet),
    resume_anchor: resumeAnchor ? {
      anchor: normalizeLabel(resumeAnchor.anchor),
      file_path: normalizeLabel(resumeAnchor.file_path),
      symbol: normalizeLabel(resumeAnchor.symbol),
      repo_root: normalizeLabel(resumeAnchor.repo_root),
    } : null,
  };
  return `execution_workflow:${sha256Hex(stableStringify(payload)).slice(0, 24)}`;
}

function deriveTaskSignatureFromInputs(state: ExecutionStateV1 | null, packet: ExecutionPacketV1 | null): string {
  const resumeAnchor = state?.resume_anchor ?? packet?.resume_anchor ?? null;
  const payload = {
    task_brief: normalizeLabel(taskBriefFromInputs(state, packet)),
    anchor: normalizeLabel(resumeAnchor?.anchor ?? null),
    file_path: normalizeLabel(resumeAnchor?.file_path ?? null),
    symbol: normalizeLabel(resumeAnchor?.symbol ?? null),
  };
  return `execution_task:${sha256Hex(stableStringify(payload)).slice(0, 24)}`;
}

function deriveCandidateTitle(
  source: WriteProjectionSourceNode,
  state: ExecutionStateV1 | null,
  packet: ExecutionPacketV1 | null,
): string {
  return taskBriefFromInputs(state, packet) ?? firstString(source.title) ?? "Execution Workflow Candidate";
}

function buildCandidateSummary(state: ExecutionStateV1 | null, packet: ExecutionPacketV1 | null): string {
  const targetFiles = collectTargetFilesFromInputs(state, packet);
  const parts = [
    taskBriefFromInputs(state, packet),
    targetFiles.length > 0 ? `targets=${targetFiles.join(", ")}` : null,
    firstString(packet?.next_action ?? null),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return parts.join("; ").slice(0, 400) || taskBriefFromInputs(state, packet) || "Execution workflow candidate";
}

function buildCandidateEmbedText(title: string, summary: string): string {
  return `${title}; ${summary}`;
}

function deriveWorkflowToolSet(state: ExecutionStateV1 | null, packet: ExecutionPacketV1 | null): string[] {
  const tools: string[] = [];
  const targetFiles = collectTargetFilesFromInputs(state, packet);
  if (targetFiles.length > 0) tools.push("edit");
  if (
    (state?.pending_validations.length ?? 0) > 0
    || (state?.completed_validations.length ?? 0) > 0
    || (packet?.pending_validations.length ?? 0) > 0
  ) {
    tools.push("test");
  }
  return Array.from(new Set(tools));
}

function buildProjectionClientId(sourceNodeId: string, workflowSignature: string): string {
  return `workflow_projection:${sourceNodeId}:${workflowSignature}`;
}

function sourceAlreadyCarriesWorkflowMemory(node: WriteProjectionSourceNode): boolean {
  const executionNative = asRecord(node.slots?.execution_native_v1);
  const anchor = asRecord(node.slots?.anchor_v1);
  const executionKind = firstString(executionNative?.execution_kind);
  const anchorKind = firstString(anchor?.anchor_kind);
  return executionKind === "workflow_candidate"
    || executionKind === "workflow_anchor"
    || anchorKind === "workflow";
}

export function assessWorkflowProjectionSourceNode(source: WriteProjectionSourceNode): WorkflowProjectionAssessment {
  if (source.type !== "event") {
    return { eligible: false, reason: "non_event" };
  }
  if (sourceAlreadyCarriesWorkflowMemory(source)) {
    return { eligible: false, reason: "existing_workflow_memory" };
  }

  const rawState = source.slots?.execution_state_v1;
  const stateParsed = rawState ? ExecutionStateV1Schema.safeParse(rawState) : null;
  if (stateParsed && !stateParsed.success) {
    return { eligible: false, reason: "invalid_execution_state" };
  }

  const packetParsed = source.slots?.execution_packet_v1
    ? ExecutionPacketV1Schema.safeParse(source.slots.execution_packet_v1)
    : null;
  if (packetParsed && !packetParsed.success) {
    return { eligible: false, reason: "invalid_execution_packet" };
  }

  const state = stateParsed?.success ? stateParsed.data : null;
  const packet = packetParsed?.success ? packetParsed.data : synthesizePacketFromLightweightHandoff(source);
  if (!state && !packet) {
    return { eligible: false, reason: "missing_execution_continuity" };
  }

  const workflowSignature = deriveWorkflowSignatureFromInputs(state, packet);
  return {
    eligible: true,
    state,
    packet,
    workflowSignature,
    projectionClientId: buildProjectionClientId(source.id, workflowSignature),
    ownerAgentId: source.owner_agent_id ?? source.producer_agent_id ?? null,
    ownerTeamId: source.owner_team_id ?? null,
  };
}

export function countDistinctWorkflowObservations(rows: Array<{ id: string; client_id?: string | null }>): number {
  return Array.from(new Set(rows.map((row) => deriveWorkflowObservationIdentity(row)))).length;
}

function deriveWorkflowObservationIdentity(row: {
  id: string;
  client_id?: string | null;
  slots?: Record<string, unknown> | null;
}): string {
  const projection = asRecord(asRecord(row.slots)?.workflow_write_projection);
  return firstString(projection?.source_client_id)
    ?? firstString(projection?.source_node_id)
    ?? firstString(row.client_id)
    ?? row.id;
}

async function findLinkedWorkflowProjection(args: {
  liteWriteStore: LiteWorkflowProjectionStore;
  scope: string;
  source: WriteProjectionSourceNode;
  consumerAgentId?: string | null;
  consumerTeamId?: string | null;
}): Promise<boolean> {
  const queries: Array<Record<string, unknown>> = [];
  if (args.source.client_id) {
    queries.push({
      workflow_write_projection: {
        source_client_id: args.source.client_id,
      },
    });
  }
  queries.push({
    workflow_write_projection: {
      source_node_id: args.source.id,
    },
  });

  for (const type of ["event", "procedure"] as const) {
    for (const slotsContains of queries) {
      const result = await args.liteWriteStore.findNodes({
        scope: args.scope,
        type,
        slotsContains,
        consumerAgentId: args.consumerAgentId,
        consumerTeamId: args.consumerTeamId,
        limit: 20,
        offset: 0,
      });
      if (result.rows.length > 0) return true;
    }
  }

  return false;
}

export async function explainWorkflowProjectionForSourceNode(args: {
  scope: string;
  source: WriteProjectionSourceNode;
  liteWriteStore: LiteWorkflowProjectionStore;
}): Promise<{
  decision: WorkflowProjectionExplainDecision;
  workflowSignature: string | null;
  projectionClientId: string | null;
}> {
  const assessment = assessWorkflowProjectionSourceNode(args.source);
  if (!assessment.eligible) {
    return {
      decision: ({
        non_event: "skipped_non_event",
        existing_workflow_memory: "skipped_existing_workflow_memory",
        invalid_execution_state: "skipped_invalid_execution_state",
        invalid_execution_packet: "skipped_invalid_execution_packet",
        missing_execution_continuity: "skipped_missing_execution_continuity",
      } as const)[assessment.reason],
      workflowSignature: null,
      projectionClientId: null,
    };
  }

  const { workflowSignature, projectionClientId, ownerAgentId, ownerTeamId } = assessment;
  const existingStable = await args.liteWriteStore.findExecutionNativeNodes({
    scope: args.scope,
    consumerAgentId: ownerAgentId,
    consumerTeamId: ownerTeamId,
    executionKind: "workflow_anchor",
    workflowSignature,
    limit: 20,
    offset: 0,
  });
  const existingProjection = await args.liteWriteStore.findLatestNodeByClientId(args.scope, "event", projectionClientId);
  const linkedProjection = await findLinkedWorkflowProjection({
    liteWriteStore: args.liteWriteStore,
    scope: args.scope,
    source: args.source,
    consumerAgentId: ownerAgentId,
    consumerTeamId: ownerTeamId,
  });

  if (existingProjection || linkedProjection) {
    return {
      decision: "projected",
      workflowSignature,
      projectionClientId,
    };
  }
  if (existingStable.rows.length > 0) {
    return {
      decision: "skipped_stable_exists",
      workflowSignature,
      projectionClientId,
    };
  }
  return {
    decision: "eligible_without_projection",
    workflowSignature,
    projectionClientId,
  };
}

function buildStableWorkflowAnchor(args: {
  scope: string;
  clientId: string;
  sourceNodeId: string;
  title: string;
  summary: string;
  taskSignature: string;
  workflowSignature: string;
  toolSet: string[];
  observedCount: number;
  supportingNodeIds: string[];
  promotedAt: string;
}) {
  return MemoryAnchorV1Schema.parse({
    anchor_kind: "workflow",
    anchor_level: "L2",
    task_signature: args.taskSignature,
    task_class: "execution_write_projection",
    workflow_signature: args.workflowSignature,
    summary: args.summary,
    tool_set: args.toolSet,
    outcome: {
      status: "success",
      result_class: "execution_write_stable",
      success_score: 0.82,
    },
    source: {
      source_kind: "execution_write",
      node_id: args.sourceNodeId,
      run_id: null,
      playbook_id: null,
      commit_id: null,
    },
    payload_refs: {
      node_ids: Array.from(new Set([args.sourceNodeId, ...args.supportingNodeIds])),
      decision_ids: [],
      run_ids: [],
      step_ids: [],
      commit_ids: [],
    },
    rehydration: {
      default_mode: "partial",
      payload_cost_hint: args.supportingNodeIds.length > 2 ? "medium" : "low",
      recommended_when: [
        "workflow_summary_is_not_enough",
        "resume_anchor_requires_detail",
      ],
    },
    recall_features: {
      tool_tags: args.toolSet,
      outcome_tags: ["execution_write", "stable"],
      keywords: [args.title, args.summary].filter((value) => value.trim().length > 0).slice(0, 8),
    },
    metrics: {
      usage_count: 0,
      reuse_success_count: 0,
      reuse_failure_count: 0,
      distinct_run_count: 0,
      last_used_at: null,
    },
    maintenance: {
      model: "lazy_online_v1",
      maintenance_state: "retain",
      offline_priority: "retain_workflow",
      lazy_update_fields: ["usage_count", "last_used_at"],
      last_maintenance_at: args.promotedAt,
    },
    workflow_promotion: {
      promotion_state: "stable",
      promotion_origin: "execution_write_auto_promotion",
      required_observations: 2,
      observed_count: args.observedCount,
      last_transition: "promoted_to_stable",
      last_transition_at: args.promotedAt,
      source_status: null,
    },
    schema_version: "anchor_v1",
  });
}

export async function projectWorkflowCandidatesFromPreparedWrite(args: {
  scope: string;
  nodes: WriteProjectionSourceNode[];
  liteWriteStore: LiteWorkflowProjectionStore;
  governanceReviewProviders?: {
    promote_memory?: PromoteMemoryGovernanceReviewProvider | null;
  };
  now?: string;
}): Promise<ProjectionResult> {
  const nodes: WriteProjectionSourceNode[] = [];
  const edges: WriteProjectionEdge[] = [];
  const now = args.now ?? new Date().toISOString();
  const seenSignatures = new Set<string>();

  for (const source of args.nodes) {
    const assessment = assessWorkflowProjectionSourceNode(source);
    if (!assessment.eligible) continue;

    const { state, packet, workflowSignature, projectionClientId, ownerAgentId, ownerTeamId } = assessment;
    if (seenSignatures.has(workflowSignature)) continue;
    seenSignatures.add(workflowSignature);

    const existingStable = await args.liteWriteStore.findExecutionNativeNodes({
      scope: args.scope,
      consumerAgentId: ownerAgentId,
      consumerTeamId: ownerTeamId,
      executionKind: "workflow_anchor",
      workflowSignature,
      limit: 20,
      offset: 0,
    });
    if (existingStable.rows.length > 0) continue;

    const existingProjection = await args.liteWriteStore.findLatestNodeByClientId(args.scope, "event", projectionClientId);
    if (existingProjection) continue;
    const linkedProjection = await findLinkedWorkflowProjection({
      liteWriteStore: args.liteWriteStore,
      scope: args.scope,
      source,
      consumerAgentId: ownerAgentId,
      consumerTeamId: ownerTeamId,
    });
    if (linkedProjection) continue;

    const existingCandidates = await args.liteWriteStore.findExecutionNativeNodes({
      scope: args.scope,
      consumerAgentId: ownerAgentId,
      consumerTeamId: ownerTeamId,
      executionKind: "workflow_candidate",
      workflowSignature,
      limit: 200,
      offset: 0,
    });
    const observedCount = countDistinctWorkflowObservations(existingCandidates.rows) + 1;
    const requiredObservations = 2;
    const title = deriveCandidateTitle(source, state, packet);
    const summary = buildCandidateSummary(state, packet);
    const taskSignature = deriveTaskSignatureFromInputs(state, packet);
    const targetFiles = collectTargetFilesFromInputs(state, packet);
    const toolSet = deriveWorkflowToolSet(state, packet);

    const executionNative = ExecutionNativeV1Schema.parse({
      schema_version: "execution_native_v1",
      execution_kind: "workflow_candidate",
      summary_kind: "workflow_candidate",
      compression_layer: "L1",
      task_signature: taskSignature,
      workflow_signature: workflowSignature,
      anchor_kind: "workflow",
      anchor_level: "L1",
      workflow_promotion: {
        promotion_state: "candidate",
        promotion_origin: "execution_write_projection",
        required_observations: requiredObservations,
        observed_count: observedCount,
        last_transition: "candidate_observed",
        last_transition_at: now,
        source_status: null,
      },
      maintenance: {
        model: "lazy_online_v1",
        maintenance_state: "observe",
        offline_priority: "promote_candidate",
        lazy_update_fields: ["usage_count", "last_used_at"],
        last_maintenance_at: now,
      },
    });

    const projectedNodeId = stableUuid(`${args.scope}:node:${projectionClientId}`);
    nodes.push({
      id: projectedNodeId,
      client_id: projectionClientId,
      scope: args.scope,
      type: "event",
      memory_lane: source.memory_lane,
      producer_agent_id: source.producer_agent_id,
      owner_agent_id: source.owner_agent_id,
      owner_team_id: source.owner_team_id,
      title,
      text_summary: summary,
      embed_text: buildCandidateEmbedText(title, summary),
      slots: {
        summary_kind: "workflow_candidate",
        compression_layer: "L1",
        lifecycle_state: "active",
        archive_candidate: true,
        target_files: targetFiles,
        execution_native_v1: executionNative,
        workflow_write_projection: {
          generated_by: "execution_write_projection_v1",
          source_node_id: source.id,
          source_client_id: source.client_id ?? null,
          generated_at: now,
          workflow_signature: workflowSignature,
        },
      },
    });
    edges.push({
      id: stableUuid(`${args.scope}:edge:workflow_write_projection:derived_from:${projectedNodeId}:${source.id}`),
      scope: args.scope,
      type: "derived_from",
      src_id: projectedNodeId,
      dst_id: source.id,
    });

    if (observedCount >= requiredObservations) {
      const stableClientId = `workflow_projection:stable:${workflowSignature}`;
      const stableNodeId = stableUuid(`${args.scope}:node:${stableClientId}`);
      const workflowPromotionGovernanceReview = asRecord(source.slots?.workflow_promotion_governance_review);
      const promoteMemoryGovernanceReview = asRecord(workflowPromotionGovernanceReview?.promote_memory);
      const governancePreview = buildWorkflowPromotionGovernancePreview({
        candidateNodeIds: Array.from(new Set([projectedNodeId, ...existingCandidates.rows.map((row) => row.id)])),
        inputText: summary,
        inputSha256: sha256Hex(summary),
        candidateExamples: [
          {
            node_id: projectedNodeId,
            title,
            summary,
            task_signature: taskSignature,
            workflow_signature: workflowSignature,
            outcome_status: "candidate",
            success_score: 0.5,
          },
        ],
        reviewResult: (promoteMemoryGovernanceReview?.review_result ?? null) as any,
        reviewProvider: args.governanceReviewProviders?.promote_memory ?? undefined,
      });
      const stableAnchor = buildStableWorkflowAnchor({
        scope: args.scope,
        clientId: stableClientId,
        sourceNodeId: source.id,
        title,
        summary,
        taskSignature,
        workflowSignature,
        toolSet,
        observedCount,
        supportingNodeIds: existingCandidates.rows.map((row) => row.id),
        promotedAt: now,
      });
      nodes.push({
        id: stableNodeId,
        client_id: stableClientId,
        scope: args.scope,
        type: "procedure",
        memory_lane: source.memory_lane,
        producer_agent_id: source.producer_agent_id,
        owner_agent_id: source.owner_agent_id,
        owner_team_id: source.owner_team_id,
        title,
        text_summary: stableAnchor.summary,
        embed_text: buildCandidateEmbedText(title, stableAnchor.summary),
        slots: {
          summary_kind: "workflow_anchor",
          compression_layer: "L2",
          anchor_v1: stableAnchor,
          execution_native_v1: {
            schema_version: "execution_native_v1",
            execution_kind: "workflow_anchor",
            summary_kind: "workflow_anchor",
            compression_layer: "L2",
            task_signature: stableAnchor.task_signature,
            workflow_signature: stableAnchor.workflow_signature,
            anchor_kind: "workflow",
            anchor_level: "L2",
            tool_set: stableAnchor.tool_set,
            workflow_promotion: stableAnchor.workflow_promotion,
            maintenance: stableAnchor.maintenance,
            rehydration: stableAnchor.rehydration,
          },
          workflow_write_projection: {
            generated_by: "execution_write_projection_v1",
            source_node_id: source.id,
            source_client_id: source.client_id ?? null,
            generated_at: now,
            workflow_signature: workflowSignature,
            auto_promoted: true,
            observed_count: observedCount,
            governance_preview: governancePreview,
          },
        },
      });
      edges.push({
        id: stableUuid(`${args.scope}:edge:workflow_write_projection:derived_from:${stableNodeId}:${source.id}`),
        scope: args.scope,
        type: "derived_from",
        src_id: stableNodeId,
        dst_id: source.id,
      });
      edges.push({
        id: stableUuid(`${args.scope}:edge:workflow_write_projection:derived_from:${stableNodeId}:${projectedNodeId}`),
        scope: args.scope,
        type: "derived_from",
        src_id: stableNodeId,
        dst_id: projectedNodeId,
      });
    }
  }

  return { nodes, edges };
}
