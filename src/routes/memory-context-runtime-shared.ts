import { ContextAssembleRequest, MemoryRecallRequest, MemoryRecallTextRequest, PlanningContextRequest } from "../memory/schemas.js";
import {
  resolveExecutionPacketAssembly,
  type ExecutionPacketAssemblyMode,
  type ExecutionPacketV1,
  type ExecutionStateV1,
} from "../execution/index.js";
import { extractPlannerPacketSurface } from "../memory/context-orchestrator.js";
import { buildExecutionMemorySummaryBundle } from "../app/planning-summary.js";

export type ContextRuntimeRecallKnobs = {
  limit: number;
  neighborhood_hops: 1 | 2;
  max_nodes: number;
  max_edges: number;
  ranked_limit: number;
  min_edge_weight: number;
  min_edge_confidence: number;
};

export type RecallAdaptiveProfileLike = {
  profile: string;
  defaults: Record<string, unknown>;
  applied: boolean;
  reason: string;
};

export type RecallAdaptiveHardCapLike = {
  defaults: Record<string, unknown>;
  applied: boolean;
  reason: string;
};

export type StaticContextBlock = {
  id: string;
  title?: string;
  content: string;
  tags?: string[];
  intents?: string[];
  priority: number;
  always_include: boolean;
};

export type ParsedMemoryRecall = ReturnType<typeof MemoryRecallRequest.parse>;
export type ParsedMemoryRecallText = ReturnType<typeof MemoryRecallTextRequest.parse>;
export type ParsedPlanningContext = ReturnType<typeof PlanningContextRequest.parse>;
export type ParsedContextAssemble = ReturnType<typeof ContextAssembleRequest.parse>;

function toStaticContextBlock(id: string, title: string, content: string) {
  return {
    id,
    title,
    content,
    tags: ["execution-packet", "continuity"],
    intents: ["resume", "review", "continuity"],
    priority: 95,
    always_include: true,
  };
}

function executionPacketToStaticBlocks(packet: ExecutionPacketV1): Array<{
  id: string;
  title: string;
  content: string;
  tags: string[];
  intents: string[];
  priority: number;
  always_include: boolean;
}> {
  const blocks = [
    toStaticContextBlock(
      `execution-packet-${packet.state_id}-brief`,
      "Execution Brief",
      [
        `current_stage=${packet.current_stage}`,
        `active_role=${packet.active_role}`,
        `task_brief=${packet.task_brief}`,
        packet.target_files.length > 0 ? `target_files=${packet.target_files.join(" | ")}` : null,
        packet.next_action ? `next_action=${packet.next_action}` : null,
        packet.hard_constraints.length > 0 ? `hard_constraints=${packet.hard_constraints.join(" | ")}` : null,
        packet.pending_validations.length > 0 ? `pending_validations=${packet.pending_validations.join(" | ")}` : null,
      ].filter(Boolean).join("; "),
    ),
    toStaticContextBlock(
      `execution-packet-${packet.state_id}-state`,
      "Execution State",
      [
        packet.accepted_facts.length > 0 ? `accepted_facts=${packet.accepted_facts.join(" | ")}` : null,
        packet.rejected_paths.length > 0 ? `rejected_paths=${packet.rejected_paths.join(" | ")}` : null,
        packet.unresolved_blockers.length > 0 ? `unresolved_blockers=${packet.unresolved_blockers.join(" | ")}` : null,
        packet.rollback_notes.length > 0 ? `rollback_notes=${packet.rollback_notes.join(" | ")}` : null,
        packet.evidence_refs.length > 0 ? `evidence_refs=${packet.evidence_refs.join(" | ")}` : null,
      ].filter(Boolean).join("; "),
    ),
  ].filter((block) => block.content.trim().length > 0);

  if (packet.review_contract) {
    blocks.push(
      toStaticContextBlock(
        `execution-packet-${packet.state_id}-review`,
        "Reviewer Contract",
        [
          `standard=${packet.review_contract.standard}`,
          packet.review_contract.required_outputs.length > 0 ? `required_outputs=${packet.review_contract.required_outputs.join(" | ")}` : null,
          packet.review_contract.acceptance_checks.length > 0 ? `acceptance_checks=${packet.review_contract.acceptance_checks.join(" | ")}` : null,
          `rollback_required=${packet.review_contract.rollback_required ? "true" : "false"}`,
        ].filter(Boolean).join("; "),
      ),
    );
  }

  if (packet.resume_anchor) {
    blocks.push(
      toStaticContextBlock(
        `execution-packet-${packet.state_id}-resume`,
        "Resume Anchor",
        [
          `anchor=${packet.resume_anchor.anchor}`,
          packet.resume_anchor.file_path ? `file_path=${packet.resume_anchor.file_path}` : null,
          packet.resume_anchor.symbol ? `symbol=${packet.resume_anchor.symbol}` : null,
          packet.resume_anchor.repo_root ? `repo_root=${packet.resume_anchor.repo_root}` : null,
        ].filter(Boolean).join("; "),
      ),
    );
  }

  return blocks;
}

function normalizeExecutionContinuitySideOutputs(parsed: {
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const executionResultSummary =
    parsed.execution_result_summary && typeof parsed.execution_result_summary === "object" && !Array.isArray(parsed.execution_result_summary)
      ? (parsed.execution_result_summary as Record<string, unknown>)
      : null;
  const executionArtifacts = Array.isArray(parsed.execution_artifacts)
    ? parsed.execution_artifacts.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  const executionEvidence = Array.isArray(parsed.execution_evidence)
    ? parsed.execution_evidence.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  return {
    executionResultSummary,
    executionArtifacts,
    executionEvidence,
  };
}

function sideOutputToLine(prefix: string, value: Record<string, unknown>) {
  const fields = ["ref", "uri", "claim", "kind", "type", "label"]
    .map((key) => (typeof value[key] === "string" && value[key].length > 0 ? `${key}=${String(value[key])}` : null))
    .filter(Boolean);
  return `${prefix}${fields.length > 0 ? ` ${fields.join("; ")}` : ""}`.trim();
}

function executionContinuityToStaticBlocks(parsed: {
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const sideOutputs = normalizeExecutionContinuitySideOutputs(parsed);
  const blocks: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    intents: string[];
    priority: number;
    always_include: boolean;
  }> = [];

  const contentLines: string[] = [];
  if (sideOutputs.executionResultSummary) {
    const summaryLine = Object.entries(sideOutputs.executionResultSummary)
      .slice(0, 8)
      .map(([key, value]) => `${key}=${typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}`)
      .join("; ");
    if (summaryLine) contentLines.push(`summary: ${summaryLine}`);
  }
  if (sideOutputs.executionArtifacts.length > 0) {
    contentLines.push(...sideOutputs.executionArtifacts.slice(0, 5).map((artifact, index) => sideOutputToLine(`artifact_${index + 1}:`, artifact)));
  }
  if (sideOutputs.executionEvidence.length > 0) {
    contentLines.push(...sideOutputs.executionEvidence.slice(0, 5).map((evidence, index) => sideOutputToLine(`evidence_${index + 1}:`, evidence)));
  }

  if (contentLines.length > 0) {
    blocks.push(
      toStaticContextBlock(
        "execution-side-outputs",
        "Execution Side Outputs",
        contentLines.join("\n"),
      ),
    );
  }

  return { blocks, sideOutputs };
}

export function buildExecutionContinuityContext(parsed: {
  context?: unknown;
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const base =
    parsed.context && typeof parsed.context === "object" && !Array.isArray(parsed.context) ? { ...(parsed.context as Record<string, unknown>) } : {};
  const { sideOutputs } = executionContinuityToStaticBlocks(parsed);
  if (sideOutputs.executionResultSummary && !("execution_result_summary" in base)) {
    base.execution_result_summary = sideOutputs.executionResultSummary;
  }
  if (sideOutputs.executionArtifacts.length > 0 && !("execution_artifacts" in base)) {
    base.execution_artifacts = sideOutputs.executionArtifacts;
  }
  if (sideOutputs.executionEvidence.length > 0 && !("execution_evidence" in base)) {
    base.execution_evidence = sideOutputs.executionEvidence;
  }
  return base;
}

export function mergeExecutionPacketStaticBlocks(parsed: {
  static_context_blocks?: StaticContextBlock[];
  execution_packet_v1?: ExecutionPacketV1;
  execution_state_v1?: ExecutionStateV1;
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const base = Array.isArray(parsed.static_context_blocks) ? parsed.static_context_blocks : [];
  const continuityBlocks = executionContinuityToStaticBlocks(parsed).blocks;
  const { packet } = resolveExecutionPacketAssembly(parsed);
  if (!packet) return [...continuityBlocks, ...base];
  return [...executionPacketToStaticBlocks(packet), ...continuityBlocks, ...base];
}

export function resolveExecutionKernelContext(parsed: {
  execution_packet_v1?: ExecutionPacketV1;
  execution_state_v1?: ExecutionStateV1;
}) {
  const { packet, source_mode } = resolveExecutionPacketAssembly(parsed);
  return {
    packet,
    source_mode,
    state_first_assembly: source_mode === "state_first",
  };
}

export function buildExecutionKernelResponse(
  sourceMode: ExecutionPacketAssemblyMode,
  parsed: {
    execution_packet_v1?: ExecutionPacketV1;
    execution_state_v1?: ExecutionStateV1;
  },
  plannerSurface?: {
    action_recall_packet?: unknown;
    candidate_workflows?: unknown;
    pattern_signals?: unknown;
    workflow_signals?: unknown;
    recommended_workflows?: unknown;
  },
) {
  const summaryBundle = buildExecutionMemorySummaryBundle(plannerSurface ?? {});
  return {
    packet_source_mode: sourceMode,
    state_first_assembly: sourceMode === "state_first",
    execution_packet_v1_present: !!parsed.execution_packet_v1,
    execution_state_v1_present: !!parsed.execution_state_v1,
    ...summaryBundle,
  };
}

export function buildPlannerPacketResponseSurface(plannerSurface: ReturnType<typeof extractPlannerPacketSurface>) {
  return {
    planner_packet: plannerSurface.planner_packet,
    pattern_signals: plannerSurface.pattern_signals,
    workflow_signals: plannerSurface.workflow_signals,
  };
}

export function toRecallKnobs(
  parsed: ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble | ParsedMemoryRecall,
): ContextRuntimeRecallKnobs {
  return {
    limit: parsed.limit,
    neighborhood_hops: parsed.neighborhood_hops as 1 | 2,
    max_nodes: parsed.max_nodes,
    max_edges: parsed.max_edges,
    ranked_limit: parsed.ranked_limit,
    min_edge_weight: parsed.min_edge_weight,
    min_edge_confidence: parsed.min_edge_confidence,
  };
}

export function applyDefaultContextBudget<T extends { context_token_budget?: number; context_char_budget?: number }>(
  parsed: T,
  defaultTokenBudget: number,
  parse: (input: unknown) => T,
): { parsed: T; contextBudgetDefaultApplied: boolean } {
  if (
    parsed.context_token_budget === undefined
    && parsed.context_char_budget === undefined
    && defaultTokenBudget > 0
  ) {
    return {
      parsed: parse({
        ...parsed,
        context_token_budget: defaultTokenBudget,
      }),
      contextBudgetDefaultApplied: true,
    };
  }
  return {
    parsed,
    contextBudgetDefaultApplied: false,
  };
}

export function applyAdaptiveRecallTuning<
  T extends ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble | ParsedMemoryRecall,
>(args: {
  parsed: T;
  parse: (input: unknown) => T;
  profile: string;
  waitMs: number;
  explicitRecallKnobs: boolean;
  resolveAdaptiveRecallProfile: (profile: string, waitMs: number, explicitRecallKnobs: boolean) => RecallAdaptiveProfileLike;
  resolveAdaptiveRecallHardCap: (
    knobs: ContextRuntimeRecallKnobs,
    waitMs: number,
    explicitRecallKnobs: boolean,
  ) => RecallAdaptiveHardCapLike;
}): {
  parsed: T;
  adaptiveProfile: RecallAdaptiveProfileLike;
  adaptiveHardCap: RecallAdaptiveHardCapLike;
} {
  const {
    parsed: initialParsed,
    parse,
    profile,
    waitMs,
    explicitRecallKnobs,
    resolveAdaptiveRecallProfile,
    resolveAdaptiveRecallHardCap,
  } = args;
  const adaptiveProfile = resolveAdaptiveRecallProfile(profile, waitMs, explicitRecallKnobs);
  let parsed = initialParsed;
  if (adaptiveProfile.applied) {
    parsed = parse({ ...parsed, ...adaptiveProfile.defaults });
  }
  const adaptiveHardCap = resolveAdaptiveRecallHardCap(
    toRecallKnobs(parsed),
    waitMs,
    explicitRecallKnobs,
  );
  if (adaptiveHardCap.applied) {
    parsed = parse({ ...parsed, ...adaptiveHardCap.defaults });
  }
  return {
    parsed,
    adaptiveProfile,
    adaptiveHardCap,
  };
}

export function buildRecallRequestFromQuery(args: {
  scope: string;
  queryEmbedding: number[];
  parsed: ParsedMemoryRecallText | ParsedPlanningContext | ParsedContextAssemble;
  extras?: Partial<Pick<ParsedMemoryRecall, "rules_context" | "rules_include_shadow" | "rules_limit">>;
}): ParsedMemoryRecall {
  const { scope, queryEmbedding, parsed, extras } = args;
  return MemoryRecallRequest.parse({
    tenant_id: parsed.tenant_id,
    scope,
    recall_strategy: parsed.recall_strategy,
    query_embedding: queryEmbedding,
    consumer_agent_id: parsed.consumer_agent_id,
    consumer_team_id: parsed.consumer_team_id,
    limit: parsed.limit,
    neighborhood_hops: parsed.neighborhood_hops,
    return_debug: parsed.return_debug,
    include_embeddings: parsed.include_embeddings,
    include_meta: parsed.include_meta,
    include_slots: parsed.include_slots,
    include_slots_preview: parsed.include_slots_preview,
    slots_preview_keys: parsed.slots_preview_keys,
    max_nodes: parsed.max_nodes,
    max_edges: parsed.max_edges,
    ranked_limit: parsed.ranked_limit,
    min_edge_weight: parsed.min_edge_weight,
    min_edge_confidence: parsed.min_edge_confidence,
    context_token_budget: parsed.context_token_budget,
    context_char_budget: parsed.context_char_budget,
    context_compaction_profile: parsed.context_compaction_profile,
    memory_layer_preference: parsed.memory_layer_preference,
    ...extras,
  });
}
