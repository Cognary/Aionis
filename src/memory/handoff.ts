import type pg from "pg";
import { assertEmbeddingSurfaceForbidden } from "../embeddings/surface-policy.js";
import { memoryFind, memoryFindLite } from "./find.js";
import { memoryResolve, memoryResolveLite } from "./resolve.js";
import {
  HandoffRecoverRequest,
  HandoffStoreRequest,
  type HandoffRecoverInput,
  type MemoryFindInput,
  type MemoryResolveInput,
  type MemoryWriteInput,
} from "./schemas.js";
import {
  buildExecutionPacketV1,
  controlProfileDefaults,
  ControlProfileV1Schema,
  ExecutionPacketV1Schema,
  ExecutionStateV1Schema,
  ExecutionStateTransitionV1Schema,
  type InMemoryExecutionStateStore,
  type ControlProfileName,
  type ControlProfileV1,
  type ExecutionPacketV1,
  type ExecutionStateV1,
  type ExecutionStateTransitionV1,
  type ReviewerContract,
  type ResumeAnchor,
} from "../execution/index.js";
import { HttpError } from "../util/http.js";

type LiteWriteStoreLike = {
  findNodes: (...args: any[]) => Promise<any>;
  resolveNode: (...args: any[]) => Promise<any>;
};

type HandoffNode = {
  id: string;
  uri: string;
  title: string | null;
  text_summary: string | null;
  slots?: Record<string, unknown>;
  commit_id?: string | null;
  commit_uri?: string | null;
  memory_lane?: "private" | "shared";
};

type HandoffFindCandidate = {
  id?: string;
  uri?: string;
  created_at?: string;
  updated_at?: string;
};

type PromptSafeHandoff = {
  anchor: string;
  handoff_kind: string;
  file_path: string | null;
  repo_root: string | null;
  symbol: string | null;
  summary: string | null;
  handoff_text: string;
  risk: string | null;
  acceptance_checks: string[];
  tags: string[];
};



type RecoveredExecutionProjection = {
  execution_state_v1: ExecutionStateV1;
  execution_packet_v1: ExecutionPacketV1;
  control_profile_v1: ControlProfileV1;
};

type HandoffStoreExecutionTransitions = ExecutionStateTransitionV1[];

export function buildHandoffExecutionStateIdentity(anchor: string): { state_id: string; scope: string } {
  const normalizedAnchor = String(anchor ?? "").trim();
  return {
    state_id: `handoff-anchor:${normalizedAnchor}`,
    scope: `aionis://handoff/${normalizedAnchor}`,
  };
}

type ExecutionReadyHandoff = {
  anchor: string;
  handoff_kind: string;
  file_path: string | null;
  repo_root: string | null;
  symbol: string | null;
  target_files: string[];
  next_action: string;
  summary: string | null;
  handoff_text: string;
  risk: string | null;
  must_change: string[];
  must_remove: string[];
  must_keep: string[];
  acceptance_checks: string[];
};

function stringifyChecks(checks: string[] | undefined): string | null {
  return checks && checks.length > 0 ? checks.join(" | ") : null;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const out = value.trim();
  return out.length > 0 ? out : undefined;
}

function buildStoredPromptSafeHandoff(input: {
  anchor: string;
  handoff_kind: string;
  file_path?: string | null;
  repo_root?: string | null;
  symbol?: string | null;
  summary: string;
  handoff_text: string;
  risk?: string | null;
  acceptance_checks?: string[];
  tags?: string[];
}): PromptSafeHandoff {
  return {
    anchor: input.anchor,
    handoff_kind: input.handoff_kind,
    file_path: input.file_path ?? null,
    repo_root: input.repo_root ?? null,
    symbol: input.symbol ?? null,
    summary: input.summary,
    handoff_text: input.handoff_text,
    risk: input.risk ?? null,
    acceptance_checks: input.acceptance_checks ?? [],
    tags: input.tags ?? [],
  };
}

function buildStoredExecutionReadyHandoff(input: {
  anchor: string;
  handoff_kind: string;
  file_path?: string | null;
  repo_root?: string | null;
  symbol?: string | null;
  summary: string;
  handoff_text: string;
  risk?: string | null;
  acceptance_checks?: string[];
  target_files?: string[];
  next_action?: string | null;
  must_change?: string[];
  must_remove?: string[];
  must_keep?: string[];
}): ExecutionReadyHandoff {
  const targetFiles = Array.isArray(input.target_files) ? input.target_files.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  return {
    anchor: input.anchor,
    handoff_kind: input.handoff_kind,
    file_path: input.file_path ?? null,
    repo_root: input.repo_root ?? null,
    symbol: input.symbol ?? null,
    target_files: targetFiles.length > 0 ? targetFiles : (input.file_path ? [input.file_path] : []),
    next_action: normalizeOptionalString(input.next_action ?? undefined) ?? input.handoff_text,
    summary: input.summary,
    handoff_text: input.handoff_text,
    risk: input.risk ?? null,
    must_change: Array.isArray(input.must_change) ? input.must_change.filter((value) => typeof value === "string" && value.trim().length > 0) : [],
    must_remove: Array.isArray(input.must_remove) ? input.must_remove.filter((value) => typeof value === "string" && value.trim().length > 0) : [],
    must_keep: Array.isArray(input.must_keep) ? input.must_keep.filter((value) => typeof value === "string" && value.trim().length > 0) : [],
    acceptance_checks: Array.isArray(input.acceptance_checks)
      ? input.acceptance_checks.filter((value) => typeof value === "string" && value.trim().length > 0)
      : [],
  };
}

function readInlineExecutionProjection(raw: Record<string, unknown>, executionReady: ExecutionReadyHandoff): RecoveredExecutionProjection | null {
  const rawState = raw.execution_state_v1;
  if (!rawState) return null;
  try {
    const state = ExecutionStateV1Schema.parse(rawState);
    const packet = raw.execution_packet_v1
      ? ExecutionPacketV1Schema.parse(raw.execution_packet_v1)
      : buildExecutionPacketV1({
          state,
          hard_constraints: executionReady.must_change,
          artifact_refs: [],
          evidence_refs: [],
        });
    const controlProfile = raw.control_profile_v1
      ? ControlProfileV1Schema.parse(raw.control_profile_v1)
      : deriveControlProfile(state.current_stage);
    return {
      execution_state_v1: state,
      execution_packet_v1: packet,
      control_profile_v1: controlProfile,
    };
  } catch {
    return null;
  }
}

export function buildHandoffWriteBody(input: unknown): MemoryWriteInput {
  const parsed = HandoffStoreRequest.parse(input);
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const producerAgentId = normalizeOptionalString(typeof raw.producer_agent_id === "string" ? raw.producer_agent_id : undefined);
  const ownerAgentId = normalizeOptionalString(typeof raw.owner_agent_id === "string" ? raw.owner_agent_id : undefined);
  const ownerTeamId = normalizeOptionalString(typeof raw.owner_team_id === "string" ? raw.owner_team_id : undefined);
  const promptSafe = buildStoredPromptSafeHandoff({
    anchor: parsed.anchor,
    handoff_kind: parsed.handoff_kind,
    file_path: parsed.file_path ?? null,
    repo_root: parsed.repo_root ?? null,
    symbol: parsed.symbol ?? null,
    summary: parsed.summary,
    handoff_text: parsed.handoff_text,
    risk: parsed.risk ?? null,
    acceptance_checks: parsed.acceptance_checks ?? [],
    tags: parsed.tags ?? [],
  });
  const executionReady = buildStoredExecutionReadyHandoff({
    anchor: parsed.anchor,
    handoff_kind: parsed.handoff_kind,
    file_path: parsed.file_path ?? null,
    repo_root: parsed.repo_root ?? null,
    symbol: parsed.symbol ?? null,
    summary: parsed.summary,
    handoff_text: parsed.handoff_text,
    risk: parsed.risk ?? null,
    acceptance_checks: parsed.acceptance_checks ?? [],
    target_files: parsed.target_files ?? [],
    next_action: parsed.next_action ?? parsed.handoff_text,
    must_change: parsed.must_change ?? [],
    must_remove: parsed.must_remove ?? [],
    must_keep: parsed.must_keep ?? [],
  });
  const executionProjection = buildExecutionProjectionFromRecoveredHandoff(
    {
      id: buildHandoffExecutionStateIdentity(parsed.anchor).state_id,
      uri: buildHandoffExecutionStateIdentity(parsed.anchor).scope,
      title: parsed.title ?? `Handoff ${parsed.anchor}`,
      text_summary: parsed.summary,
      memory_lane: parsed.memory_lane,
    },
    promptSafe,
    executionReady,
  );
  const effectiveExecutionProjection = readInlineExecutionProjection(raw, executionReady) ?? executionProjection;
  const executionTransitions = Array.isArray(raw.execution_transitions_v1)
    ? raw.execution_transitions_v1.map((transition) => ExecutionStateTransitionV1Schema.parse(transition))
    : buildHandoffStoreExecutionTransitions(effectiveExecutionProjection.execution_state_v1);
  const handoffText = [
    `anchor=${parsed.anchor}`,
    parsed.file_path ? `file=${parsed.file_path}` : null,
    parsed.repo_root ? `repo_root=${parsed.repo_root}` : null,
    parsed.symbol ? `symbol=${parsed.symbol}` : null,
    `kind=${parsed.handoff_kind}`,
    parsed.risk ? `risk=${parsed.risk}` : null,
    `summary=${parsed.summary}`,
    `handoff=${parsed.handoff_text}`,
    parsed.next_action ? `next_action=${parsed.next_action}` : null,
    parsed.target_files && parsed.target_files.length > 0 ? `target_files=${parsed.target_files.join(" | ")}` : null,
    parsed.must_change && parsed.must_change.length > 0 ? `must_change=${parsed.must_change.join(" | ")}` : null,
    parsed.must_remove && parsed.must_remove.length > 0 ? `must_remove=${parsed.must_remove.join(" | ")}` : null,
    parsed.must_keep && parsed.must_keep.length > 0 ? `must_keep=${parsed.must_keep.join(" | ")}` : null,
    stringifyChecks(parsed.acceptance_checks) ? `acceptance_checks=${stringifyChecks(parsed.acceptance_checks)}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    actor: parsed.actor,
    memory_lane: parsed.memory_lane,
    ...(producerAgentId ? { producer_agent_id: producerAgentId } : {}),
    ...(ownerAgentId ? { owner_agent_id: ownerAgentId } : {}),
    ...(ownerTeamId ? { owner_team_id: ownerTeamId } : {}),
    input_text: handoffText,
    edges: [],
    nodes: [
      {
        type: "event",
        title: parsed.title ?? `Handoff ${parsed.anchor}`,
        text_summary: parsed.summary,
        slots: {
          summary_kind: "handoff",
          handoff_kind: parsed.handoff_kind,
          anchor: parsed.anchor,
          file_path: parsed.file_path ?? null,
          repo_root: parsed.repo_root,
          symbol: parsed.symbol,
          risk: parsed.risk,
          handoff_text: parsed.handoff_text,
          acceptance_checks: parsed.acceptance_checks ?? [],
          tags: parsed.tags ?? [],
          target_files: parsed.target_files ?? [],
          next_action: parsed.next_action ?? parsed.handoff_text,
          must_change: parsed.must_change ?? [],
          must_remove: parsed.must_remove ?? [],
          must_keep: parsed.must_keep ?? [],
          execution_result_summary: parsed.execution_result_summary ?? null,
          execution_artifacts: parsed.execution_artifacts ?? [],
          execution_evidence: parsed.execution_evidence ?? [],
          execution_state_v1: effectiveExecutionProjection.execution_state_v1,
          execution_packet_v1: effectiveExecutionProjection.execution_packet_v1,
          control_profile_v1: effectiveExecutionProjection.control_profile_v1,
          execution_transitions_v1: executionTransitions,
        },
      },
    ],
  };
}

function buildHandoffStoreExecutionTransitions(state: ExecutionStateV1): HandoffStoreExecutionTransitions {
  const transitions: HandoffStoreExecutionTransitions = [];
  if (state.reviewer_contract) {
    transitions.push(
      ExecutionStateTransitionV1Schema.parse({
        transition_id: `${state.state_id}:handoff-store:reviewer-contract`,
        state_id: state.state_id,
        scope: state.scope,
        actor_role: "resume",
        at: state.updated_at,
        type: "reviewer_contract_updated",
        reviewer_contract: state.reviewer_contract,
      }),
    );
  }
  if (state.resume_anchor) {
    transitions.push(
      ExecutionStateTransitionV1Schema.parse({
        transition_id: `${state.state_id}:handoff-store:resume-anchor`,
        state_id: state.state_id,
        scope: state.scope,
        actor_role: "resume",
        at: state.updated_at,
        type: "resume_anchor_updated",
        resume_anchor: state.resume_anchor,
      }),
    );
  }
  return transitions;
}

function buildPromptSafeHandoff(node: HandoffNode, input: HandoffRecoverInput): PromptSafeHandoff {
  const slots = node.slots && typeof node.slots === "object" ? node.slots : {};
  const acceptanceChecks = Array.isArray(slots.acceptance_checks)
    ? slots.acceptance_checks.filter((value): value is string => typeof value === "string")
    : [];
  const tags = Array.isArray(slots.tags) ? slots.tags.filter((value): value is string => typeof value === "string") : [];
  return {
    anchor: String(slots.anchor ?? input.anchor),
    handoff_kind: String(slots.handoff_kind ?? input.handoff_kind),
    file_path: typeof slots.file_path === "string" ? slots.file_path : null,
    repo_root: typeof slots.repo_root === "string" ? slots.repo_root : null,
    symbol: typeof slots.symbol === "string" ? slots.symbol : null,
    summary: node.text_summary,
    handoff_text: typeof slots.handoff_text === "string" ? slots.handoff_text : "",
    risk: typeof slots.risk === "string" ? slots.risk : null,
    acceptance_checks: acceptanceChecks,
    tags,
  };
}

function buildExecutionReadyHandoff(node: HandoffNode, input: HandoffRecoverInput, promptSafe: PromptSafeHandoff): ExecutionReadyHandoff {
  const slots = node.slots && typeof node.slots === "object" ? node.slots : {};
  const targetFiles = Array.isArray(slots.target_files)
    ? slots.target_files.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const mustChange = Array.isArray(slots.must_change)
    ? slots.must_change.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const mustRemove = Array.isArray(slots.must_remove)
    ? slots.must_remove.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const mustKeep = Array.isArray(slots.must_keep)
    ? slots.must_keep.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const nextAction =
    typeof slots.next_action === "string" && slots.next_action.trim().length > 0 ? slots.next_action.trim() : promptSafe.handoff_text;
  return {
    anchor: promptSafe.anchor,
    handoff_kind: promptSafe.handoff_kind,
    file_path: promptSafe.file_path,
    repo_root: promptSafe.repo_root,
    symbol: promptSafe.symbol,
    target_files: targetFiles.length > 0 ? targetFiles : (promptSafe.file_path ? [promptSafe.file_path] : []),
    next_action: nextAction,
    summary: promptSafe.summary,
    handoff_text: promptSafe.handoff_text,
    risk: promptSafe.risk,
    must_change: mustChange,
    must_remove: mustRemove,
    must_keep: mustKeep,
    acceptance_checks: promptSafe.acceptance_checks,
  };
}

function buildReviewerContractFromHandoff(executionReady: ExecutionReadyHandoff): ReviewerContract | null {
  const requiredOutputs = [
    executionReady.next_action ? `next_action:${executionReady.next_action}` : null,
    executionReady.target_files.length > 0 ? `target_files:${executionReady.target_files.join(", ")}` : null,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  if (executionReady.acceptance_checks.length === 0 && requiredOutputs.length === 0) return null;

  return {
    standard: executionReady.summary ?? executionReady.handoff_text,
    required_outputs: requiredOutputs,
    acceptance_checks: executionReady.acceptance_checks,
    rollback_required: executionReady.must_keep.length > 0 || executionReady.must_remove.length > 0,
  };
}

function buildResumeAnchorFromHandoff(executionReady: ExecutionReadyHandoff): ResumeAnchor | null {
  const anchor = executionReady.anchor?.trim();
  if (!anchor) return null;
  return {
    anchor,
    file_path: executionReady.file_path ?? null,
    symbol: executionReady.symbol ?? null,
    repo_root: executionReady.repo_root ?? null,
  };
}

function buildExecutionProjectionFromRecoveredHandoff(node: HandoffNode, promptSafe: PromptSafeHandoff, executionReady: ExecutionReadyHandoff): RecoveredExecutionProjection {
  const reviewerContract = buildReviewerContractFromHandoff(executionReady);
  const resumeAnchor = buildResumeAnchorFromHandoff(executionReady);
  const state = ExecutionStateV1Schema.parse({
    state_id: node.id,
    scope: node.uri || promptSafe.anchor,
    task_brief: promptSafe.summary ?? executionReady.handoff_text,
    current_stage: "resume",
    active_role: "resume",
    owned_files: executionReady.target_files,
    modified_files: executionReady.target_files,
    pending_validations: executionReady.acceptance_checks,
    completed_validations: [],
    last_accepted_hypothesis: promptSafe.summary ?? null,
    rejected_paths: executionReady.must_remove,
    unresolved_blockers: promptSafe.risk ? [promptSafe.risk] : [],
    rollback_notes: executionReady.must_keep,
    reviewer_contract: reviewerContract,
    resume_anchor: resumeAnchor,
    updated_at: new Date().toISOString(),
    version: 1,
  });

  const packet = buildExecutionPacketV1({
    state,
    hard_constraints: executionReady.must_change,
    artifact_refs: [node.uri].filter((value): value is string => typeof value === "string" && value.length > 0),
    evidence_refs: [node.uri].filter((value): value is string => typeof value === "string" && value.length > 0),
  });
  const controlProfile = deriveControlProfile(state.current_stage);

  return {
    execution_state_v1: state,
    execution_packet_v1: packet,
    control_profile_v1: controlProfile,
  };
}

function readStoredExecutionProjection(node: HandoffNode): RecoveredExecutionProjection | null {
  const slots = node.slots && typeof node.slots === "object" ? node.slots : null;
  if (!slots) return null;
  const rawState = (slots as Record<string, unknown>).execution_state_v1;
  const rawPacket = (slots as Record<string, unknown>).execution_packet_v1;
  const rawControlProfile = (slots as Record<string, unknown>).control_profile_v1;
  if (!rawState || !rawPacket) return null;
  try {
    const parsedState = ExecutionStateV1Schema.parse(rawState);
    return {
      execution_state_v1: parsedState,
      execution_packet_v1: ExecutionPacketV1Schema.parse(rawPacket),
      control_profile_v1: rawControlProfile
        ? ControlProfileV1Schema.parse(rawControlProfile)
        : deriveControlProfile(parsedState.current_stage),
    };
  } catch {
    return null;
  }
}

function readExecutionProjectionFromStateStore(
  executionStateStore: InMemoryExecutionStateStore | null | undefined,
  anchor: string,
  executionReady: ExecutionReadyHandoff,
  node: HandoffNode,
): RecoveredExecutionProjection | null {
  if (!executionStateStore) return null;
  const identity = buildHandoffExecutionStateIdentity(anchor);
  const stored = executionStateStore.get(identity.scope, identity.state_id);
  if (!stored) return null;
  const state = ExecutionStateV1Schema.parse(stored.state);
  const packet = buildExecutionPacketV1({
    state,
    hard_constraints: executionReady.must_change,
    artifact_refs: [node.uri].filter((value): value is string => typeof value === "string" && value.length > 0),
    evidence_refs: [node.uri].filter((value): value is string => typeof value === "string" && value.length > 0),
  });
  return {
    execution_state_v1: state,
    execution_packet_v1: packet,
    control_profile_v1: deriveControlProfile(state.current_stage),
  };
}

function deriveControlProfile(stage: ExecutionStateV1["current_stage"]): ControlProfileV1 {
  const profileName = (stage === "resume" ? "resume" : stage) satisfies ControlProfileName;
  return controlProfileDefaults(profileName);
}

function normalizeRecoveredHandoff(
  node: HandoffNode,
  matchedNodes: number,
  input: HandoffRecoverInput,
  executionStateStore?: InMemoryExecutionStateStore | null,
) {
  const promptSafe = buildPromptSafeHandoff(node, input);
  const executionReady = buildExecutionReadyHandoff(node, input, promptSafe);
  const slots = node.slots && typeof node.slots === "object" ? (node.slots as Record<string, unknown>) : {};
  const executionProjection =
    readExecutionProjectionFromStateStore(executionStateStore, promptSafe.anchor, executionReady, node) ??
    readStoredExecutionProjection(node) ??
    buildExecutionProjectionFromRecoveredHandoff(node, promptSafe, executionReady);
  return {
    handoff_kind: promptSafe.handoff_kind,
    anchor: promptSafe.anchor,
    matched_nodes: matchedNodes,
    handoff: {
      id: node.id,
      uri: node.uri,
      handoff_kind: promptSafe.handoff_kind,
      anchor: promptSafe.anchor,
      title: node.title,
      summary: promptSafe.summary,
      handoff_text: promptSafe.handoff_text,
      file_path: promptSafe.file_path,
      repo_root: promptSafe.repo_root,
      symbol: promptSafe.symbol,
      risk: promptSafe.risk,
      acceptance_checks: promptSafe.acceptance_checks,
      tags: promptSafe.tags,
      target_files: executionReady.target_files,
      next_action: executionReady.next_action,
      must_change: executionReady.must_change,
      must_remove: executionReady.must_remove,
      must_keep: executionReady.must_keep,
      memory_lane: node.memory_lane ?? null,
      commit_id: node.commit_id ?? null,
      commit_uri: node.commit_uri ?? null,
    },
    prompt_safe_handoff: promptSafe,
    execution_ready_handoff: executionReady,
    execution_result_summary:
      slots && "execution_result_summary" in slots ? (slots.execution_result_summary as Record<string, unknown> | null) : undefined,
    execution_artifacts:
      slots && "execution_artifacts" in slots ? (slots.execution_artifacts as Array<Record<string, unknown>>) : undefined,
    execution_evidence:
      slots && "execution_evidence" in slots ? (slots.execution_evidence as Array<Record<string, unknown>>) : undefined,
    ...executionProjection,
  };
}

function compareIsoDesc(a?: string, b?: string): number {
  const aMs = typeof a === "string" ? Date.parse(a) : Number.NaN;
  const bMs = typeof b === "string" ? Date.parse(b) : Number.NaN;
  const aValid = Number.isFinite(aMs);
  const bValid = Number.isFinite(bMs);
  if (aValid && bValid && aMs !== bMs) return bMs - aMs;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return 0;
}

function pickLatestHandoffCandidate(nodes: unknown[]): HandoffFindCandidate | null {
  const candidates = nodes.filter((node): node is HandoffFindCandidate => Boolean(node && typeof node === "object"));
  if (candidates.length === 0) return null;
  return candidates
    .slice()
    .sort(
      (a, b) =>
        compareIsoDesc(a.updated_at, b.updated_at) ||
        compareIsoDesc(a.created_at, b.created_at) ||
        String(b.id ?? "").localeCompare(String(a.id ?? "")),
    )[0]!;
}

export async function recoverHandoff(args: {
  client?: pg.PoolClient;
  liteWriteStore?: LiteWriteStoreLike | null;
  executionStateStore?: InMemoryExecutionStateStore | null;
  input: unknown;
  defaultScope: string;
  defaultTenantId: string;
  consumerAgentId?: string | null;
  consumerTeamId?: string | null;
}) {
  assertEmbeddingSurfaceForbidden("handoff_recover");
  const parsed = HandoffRecoverRequest.parse(args.input);
  const normalizedFilePath = normalizeOptionalString(parsed.file_path);
  const normalizedRepoRoot = normalizeOptionalString(parsed.repo_root);
  const normalizedSymbol = normalizeOptionalString(parsed.symbol);
  const consumerAgentId = normalizeOptionalString(args.consumerAgentId ?? undefined) ?? null;
  const consumerTeamId = normalizeOptionalString(args.consumerTeamId ?? undefined) ?? null;
  const findInput: MemoryFindInput = {
    tenant_id: parsed.tenant_id,
    scope: parsed.scope,
    type: "event",
    memory_lane: parsed.memory_lane,
    ...(consumerAgentId ? { consumer_agent_id: consumerAgentId } : {}),
    ...(consumerTeamId ? { consumer_team_id: consumerTeamId } : {}),
    include_meta: true,
    include_slots: false,
    include_slots_preview: true,
    slots_preview_keys: 20,
    limit: parsed.limit,
    offset: 0,
    slots_contains: {
      summary_kind: "handoff",
      handoff_kind: parsed.handoff_kind,
      anchor: parsed.anchor,
      ...(normalizedRepoRoot ? { repo_root: normalizedRepoRoot } : {}),
      ...(normalizedFilePath ? { file_path: normalizedFilePath } : {}),
      ...(normalizedSymbol ? { symbol: normalizedSymbol } : {}),
    },
  };

  const findResult = args.liteWriteStore
    ? await memoryFindLite(args.liteWriteStore as any, findInput, args.defaultScope, args.defaultTenantId)
    : await memoryFind(args.client!, findInput, args.defaultScope, args.defaultTenantId);

  const matchedNodeList = Array.isArray(findResult.nodes) ? findResult.nodes : [];
  const matchedNodes = matchedNodeList.length;
  const topNode = pickLatestHandoffCandidate(matchedNodeList);
  if (!topNode || typeof topNode.uri !== "string") {
    throw new HttpError(404, "handoff_not_found", "handoff was not found in this scope", {
      anchor: parsed.anchor,
      repo_root: parsed.repo_root ?? null,
      file_path: parsed.file_path ?? null,
      symbol: parsed.symbol ?? null,
      handoff_kind: parsed.handoff_kind,
      scope: findResult.scope,
      tenant_id: findResult.tenant_id,
    });
  }

  const resolveInput: MemoryResolveInput = {
    tenant_id: findResult.tenant_id,
    scope: findResult.scope,
    uri: topNode.uri,
    ...(consumerAgentId ? { consumer_agent_id: consumerAgentId } : {}),
    ...(consumerTeamId ? { consumer_team_id: consumerTeamId } : {}),
    include_meta: true,
    include_slots: true,
    include_slots_preview: false,
    slots_preview_keys: 10,
  };

  const resolved = args.liteWriteStore
    ? await memoryResolveLite(args.liteWriteStore as any, resolveInput, args.defaultScope, args.defaultTenantId)
    : await memoryResolve(args.client!, resolveInput, args.defaultScope, args.defaultTenantId);

  if (!resolved || typeof resolved !== "object" || !("node" in resolved) || !resolved.node) {
    throw new HttpError(500, "handoff_resolve_invalid", "handoff resolve did not return a node payload", {
      anchor: parsed.anchor,
      scope: findResult.scope,
      tenant_id: findResult.tenant_id,
      resolved_type: resolved && typeof resolved === "object" && "type" in resolved ? (resolved as any).type : null,
    });
  }

  return {
    tenant_id: findResult.tenant_id,
    scope: findResult.scope,
    ...normalizeRecoveredHandoff(resolved.node as HandoffNode, matchedNodes, parsed, args.executionStateStore),
  };
}
