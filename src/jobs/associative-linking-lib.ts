import stableStringify from "fast-json-stable-stringify";
import {
  DEFAULT_ASSOCIATIVE_LINKING_CONFIG,
  type AssociativeLinkingResolvedConfig,
} from "../memory/associative-linking-config.js";
import type {
  AssociationCandidateRecord,
  AssociativeCandidateStoreAccess,
  UpsertAssociationCandidateArgs,
} from "../memory/associative-candidate-store.js";
import {
  AssociativeLinkTriggerPayloadSchema,
  DeferredAssociativeLinkFollowupSchema,
  type AssociativeLinkTriggerPayload,
} from "../memory/associative-linking-types.js";
import type { RecallAssociativeNodeRow } from "../store/recall-access.js";
import { sha256Hex } from "../util/crypto.js";
import { stableUuid } from "../util/uuid.js";

export type AssociativeLinkingRecallAccess = {
  listAssociativeNodesByIds(scope: string, nodeIds: string[]): Promise<RecallAssociativeNodeRow[]>;
  listAssociativeCandidatePool(scope: string, excludeNodeIds: string[], limit: number): Promise<RecallAssociativeNodeRow[]>;
};

export type AssociativeFeatureSet = {
  embedding_similarity: number;
  text_overlap: number;
  file_overlap: number;
  symbol_overlap: number;
  validation_overlap: number;
  rollback_overlap: number;
  handoff_anchor_match: number;
  recency_boost: number;
  repo_root: string | null;
  file_path: string | null;
  symbol: string | null;
  shared_validation_targets: string[];
  shared_rollback_notes: string[];
};

export type AssociativeScoredCandidate = {
  relation_kind: AssociationCandidateRecord["relation_kind"];
  score: number;
  confidence: number;
};

export type AssociativeLinkingJobResult = {
  source_count: number;
  candidate_pool_size: number;
  evaluated_pairs: number;
  shadow_created: number;
  promoted: number;
  rejected: number;
};

export type AssociativePromotionResult = {
  evaluated: number;
  promoted: number;
  rejected: number;
};

export type AssociativeLinkOutboxInsertArgs = {
  scope: string;
  commitId: string;
  eventType: "associative_link";
  jobKey: string;
  payloadSha256: string;
  payloadJson: string;
};

type AnchorShape = {
  anchor: string | null;
  repo_root: string | null;
  file_path: string | null;
  symbol: string | null;
};

type AssociativeVisibility = {
  memory_lane: "private" | "shared";
  owner_agent_id: string | null;
  owner_team_id: string | null;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function isValidAssociativeCandidateStatusTransition(
  from: AssociationCandidateRecord["status"],
  to: AssociationCandidateRecord["status"],
): boolean {
  if (from === to) return true;
  switch (from) {
    case "shadow":
      return to === "promoted" || to === "rejected" || to === "expired";
    case "rejected":
      return to === "expired";
    case "promoted":
    case "expired":
      return false;
    default:
      return false;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asAssociativeVisibility(value: unknown): AssociativeVisibility | null {
  const obj = asObject(value);
  if (!obj) return null;
  if (obj.memory_lane !== "private" && obj.memory_lane !== "shared") return null;
  return {
    memory_lane: obj.memory_lane,
    owner_agent_id: toNonEmptyString(obj.owner_agent_id),
    owner_team_id: toNonEmptyString(obj.owner_team_id),
  };
}

function associativeVisibilityFromNode(node: RecallAssociativeNodeRow): AssociativeVisibility {
  return {
    memory_lane: node.memory_lane,
    owner_agent_id: node.owner_agent_id,
    owner_team_id: node.owner_team_id,
  };
}

function isAssociativeVisibilityCompatible(
  left: AssociativeVisibility | null,
  right: AssociativeVisibility | null,
): boolean {
  if (!left || !right) return false;
  if (left.memory_lane === "shared" || right.memory_lane === "shared") {
    return left.memory_lane === "shared" && right.memory_lane === "shared";
  }
  return (
    (!!left.owner_agent_id && left.owner_agent_id === right.owner_agent_id)
    || (!!left.owner_team_id && left.owner_team_id === right.owner_team_id)
  );
}

function candidateIdentityKey(args: {
  scope: string;
  src_id: string;
  dst_id: string;
  relation_kind: AssociationCandidateRecord["relation_kind"];
}): string {
  return `${args.scope}:${args.src_id}:${args.dst_id}:${args.relation_kind}`;
}

function buildCandidateUpsert(args: {
  scope: string;
  source: RecallAssociativeNodeRow;
  candidate: RecallAssociativeNodeRow;
  scored: AssociativeScoredCandidate;
  features: AssociativeFeatureSet;
  sourceCommitId: string;
  status: AssociationCandidateRecord["status"];
}): UpsertAssociationCandidateArgs {
  return {
    scope: args.scope,
    src_id: args.source.id,
    dst_id: args.candidate.id,
    relation_kind: args.scored.relation_kind,
    status: args.status,
    score: args.scored.score,
    confidence: args.scored.confidence,
    feature_summary_json: {
      embedding_similarity: args.features.embedding_similarity,
      file_overlap: args.features.file_overlap,
      symbol_overlap: args.features.symbol_overlap,
      validation_overlap: args.features.validation_overlap,
      rollback_overlap: args.features.rollback_overlap,
      handoff_anchor_match: args.features.handoff_anchor_match,
      recency_boost: args.features.recency_boost,
      repo_root: args.features.repo_root,
      file_path: args.features.file_path,
      symbol: args.features.symbol,
    },
    evidence_json: {
      shared_validation_targets: args.features.shared_validation_targets,
      shared_rollback_notes: args.features.shared_rollback_notes,
      source_commit_id: args.sourceCommitId,
      candidate_commit_id: args.candidate.commit_id,
      source_visibility: associativeVisibilityFromNode(args.source),
      candidate_visibility: associativeVisibilityFromNode(args.candidate),
    },
    source_commit_id: args.sourceCommitId,
    worker_run_id: null,
    promoted_edge_id: null,
  };
}

export function buildAssociativeLinkOutboxInsert(args: {
  scope: string;
  commitId: string;
  payload: Omit<AssociativeLinkTriggerPayload, "scope"> & { scope?: string };
}): AssociativeLinkOutboxInsertArgs {
  const payload = AssociativeLinkTriggerPayloadSchema.parse({
    ...args.payload,
    scope: args.scope,
  });
  const payloadSha = sha256Hex(stableStringify(payload));
  return {
    scope: args.scope,
    commitId: args.commitId,
    eventType: "associative_link",
    jobKey: sha256Hex(stableStringify({ v: 1, scope: args.scope, commit_id: args.commitId, event_type: "associative_link", payloadSha })),
    payloadSha256: payloadSha,
    payloadJson: JSON.stringify(payload),
  };
}

export async function enqueueDeferredAssociativeLinkFollowup(args: {
  scope: string;
  commitId: string;
  embedPayload: unknown;
  writeAccess: {
    insertOutboxEvent(params: AssociativeLinkOutboxInsertArgs): Promise<void>;
  };
}): Promise<boolean> {
  const payloadObj = asObject(args.embedPayload);
  const parsed = DeferredAssociativeLinkFollowupSchema.safeParse(payloadObj?.after_associative_link);
  if (!parsed.success) return false;
  await args.writeAccess.insertOutboxEvent(
    buildAssociativeLinkOutboxInsert({
      scope: args.scope,
      commitId: args.commitId,
      payload: {
        ...parsed.data,
        scope: args.scope,
      },
    }),
  );
  return true;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readAnchorFromObject(value: unknown): AnchorShape | null {
  const obj = asObject(value);
  if (!obj) return null;
  return {
    anchor: toNonEmptyString(obj.anchor),
    repo_root: toNonEmptyString(obj.repo_root),
    file_path: toNonEmptyString(obj.file_path),
    symbol: toNonEmptyString(obj.symbol),
  };
}

function resolveNodeAnchor(slots: Record<string, unknown>): AnchorShape {
  const direct = readAnchorFromObject(slots.resume_anchor);
  if (direct) return direct;
  const stateAnchor = readAnchorFromObject(asObject(slots.execution_state_v1)?.resume_anchor);
  if (stateAnchor) return stateAnchor;
  const packetAnchor = readAnchorFromObject(asObject(slots.execution_packet_v1)?.resume_anchor);
  if (packetAnchor) return packetAnchor;
  const promptSafe = readAnchorFromObject(slots.prompt_safe_handoff);
  if (promptSafe) return promptSafe;
  const executionReady = readAnchorFromObject(slots.execution_ready_handoff);
  if (executionReady) return executionReady;
  return { anchor: null, repo_root: null, file_path: null, symbol: null };
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const stringValue = toNonEmptyString(value);
    if (!stringValue) continue;
    const normalized = stringValue.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(stringValue);
  }
  return out;
}

function extractValidationTargets(slots: Record<string, unknown>): string[] {
  const state = asObject(slots.execution_state_v1);
  const reviewer = asObject(state?.reviewer_contract);
  const executionReady = asObject(slots.execution_ready_handoff);
  return uniqueStrings([
    ...(Array.isArray(state?.pending_validations) ? state.pending_validations : []),
    ...(Array.isArray(state?.completed_validations) ? state.completed_validations : []),
    ...(Array.isArray(reviewer?.acceptance_checks) ? reviewer.acceptance_checks : []),
    ...(Array.isArray(executionReady?.acceptance_checks) ? executionReady.acceptance_checks : []),
    ...(Array.isArray(slots.acceptance_checks) ? slots.acceptance_checks : []),
  ]);
}

function extractRollbackNotes(slots: Record<string, unknown>): string[] {
  const state = asObject(slots.execution_state_v1);
  const executionReady = asObject(slots.execution_ready_handoff);
  return uniqueStrings([
    ...(Array.isArray(state?.rollback_notes) ? state.rollback_notes : []),
    ...(Array.isArray(executionReady?.must_keep) ? executionReady.must_keep : []),
    ...(Array.isArray(slots.rollback_notes) ? slots.rollback_notes : []),
  ]);
}

function tokenizeText(input: string): Set<string> {
  const matches = input.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];
  return new Set(matches.filter((token) => token.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function stringArrayOverlap(a: string[], b: string[]): { ratio: number; shared: string[] } {
  if (a.length === 0 || b.length === 0) return { ratio: 0, shared: [] };
  const right = new Map(b.map((value) => [value.toLowerCase(), value]));
  const shared: string[] = [];
  for (const value of a) {
    const normalized = value.toLowerCase();
    if (right.has(normalized)) shared.push(right.get(normalized)!);
  }
  const union = new Set([...a.map((value) => value.toLowerCase()), ...b.map((value) => value.toLowerCase())]);
  return { ratio: union.size === 0 ? 0 : shared.length / union.size, shared };
}

function parseEmbedding(text: string | null): number[] | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parts = trimmed.slice(1, -1).split(",").map((part) => Number(part.trim())).filter((value) => Number.isFinite(value));
  return parts.length > 0 ? parts : null;
}

function cosineSimilarity(left: number[] | null, right: number[] | null): number {
  if (!left || !right || left.length === 0 || right.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm <= 0 || rightNorm <= 0) return 0;
  return clamp01(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function computeRecencyBoost(sourceCreatedAt: string, candidateCreatedAt: string): number {
  const delta = Math.abs(Date.parse(sourceCreatedAt) - Date.parse(candidateCreatedAt));
  if (!Number.isFinite(delta)) return 0.1;
  const days = delta / (24 * 60 * 60 * 1000);
  if (days <= 1) return 1;
  if (days <= 7) return 0.6;
  if (days <= 30) return 0.3;
  return 0.1;
}

export function extractAssociativeFeatures(
  source: RecallAssociativeNodeRow,
  candidate: RecallAssociativeNodeRow,
): AssociativeFeatureSet {
  const sourceAnchor = resolveNodeAnchor(source.slots);
  const candidateAnchor = resolveNodeAnchor(candidate.slots);
  const validationOverlap = stringArrayOverlap(
    extractValidationTargets(source.slots),
    extractValidationTargets(candidate.slots),
  );
  const rollbackOverlap = stringArrayOverlap(
    extractRollbackNotes(source.slots),
    extractRollbackNotes(candidate.slots),
  );
  const sourceTokens = tokenizeText(`${source.title ?? ""} ${source.text_summary ?? ""}`);
  const candidateTokens = tokenizeText(`${candidate.title ?? ""} ${candidate.text_summary ?? ""}`);
  const fileOverlap = sourceAnchor.file_path && candidateAnchor.file_path && sourceAnchor.file_path === candidateAnchor.file_path
    ? 1
    : sourceAnchor.repo_root && candidateAnchor.repo_root && sourceAnchor.repo_root === candidateAnchor.repo_root
      ? 0.5
      : 0;
  const symbolOverlap = sourceAnchor.symbol && candidateAnchor.symbol && sourceAnchor.symbol === candidateAnchor.symbol ? 1 : 0;
  const handoffAnchorMatch = sourceAnchor.anchor && candidateAnchor.anchor && sourceAnchor.anchor === candidateAnchor.anchor
    ? 1
    : fileOverlap;
  return {
    embedding_similarity: round4(cosineSimilarity(parseEmbedding(source.embedding_text), parseEmbedding(candidate.embedding_text))),
    text_overlap: round4(jaccard(sourceTokens, candidateTokens)),
    file_overlap: round4(fileOverlap),
    symbol_overlap: round4(symbolOverlap),
    validation_overlap: round4(validationOverlap.ratio),
    rollback_overlap: round4(rollbackOverlap.ratio),
    handoff_anchor_match: round4(handoffAnchorMatch),
    recency_boost: round4(computeRecencyBoost(source.created_at, candidate.created_at)),
    repo_root: sourceAnchor.repo_root ?? candidateAnchor.repo_root,
    file_path: sourceAnchor.file_path ?? candidateAnchor.file_path,
    symbol: sourceAnchor.symbol ?? candidateAnchor.symbol,
    shared_validation_targets: validationOverlap.shared.slice(0, 8),
    shared_rollback_notes: rollbackOverlap.shared.slice(0, 8),
  };
}

export function scoreAssociativeCandidate(features: AssociativeFeatureSet): AssociativeScoredCandidate {
  const validationSignal = Math.max(features.validation_overlap, features.rollback_overlap * 0.8);
  const score = clamp01(
    0.35 * features.embedding_similarity
    + 0.2 * features.file_overlap
    + 0.15 * features.symbol_overlap
    + 0.15 * validationSignal
    + 0.1 * features.handoff_anchor_match
    + 0.05 * features.recency_boost,
  );
  const confidence = clamp01(score * 0.92 + (features.file_overlap > 0 || validationSignal > 0 ? 0.06 : 0));
  let relationKind: AssociativeScoredCandidate["relation_kind"] = "supports";
  if (features.file_overlap >= 1 && (features.embedding_similarity >= 0.85 || features.symbol_overlap >= 1 || features.handoff_anchor_match >= 1)) {
    relationKind = "same_task";
  } else if (features.validation_overlap >= 0.4 || features.rollback_overlap >= 0.4) {
    relationKind = "supports";
  } else if (features.handoff_anchor_match >= 0.5 || features.file_overlap >= 0.5) {
    relationKind = "extends";
  } else if (features.embedding_similarity >= 0.97 && features.text_overlap >= 0.75) {
    relationKind = "repeats";
  } else if (features.file_overlap >= 1 && features.recency_boost >= 0.8) {
    relationKind = "supersedes";
  }
  return {
    relation_kind: relationKind,
    score: round4(score),
    confidence: round4(confidence),
  };
}

export async function fetchAssociativeCandidatesForSources(args: {
  payload: AssociativeLinkTriggerPayload;
  recallAccess: AssociativeLinkingRecallAccess;
  config?: AssociativeLinkingResolvedConfig;
}): Promise<{
  sourceNodes: RecallAssociativeNodeRow[];
  candidatePool: RecallAssociativeNodeRow[];
}> {
  const config = args.config ?? DEFAULT_ASSOCIATIVE_LINKING_CONFIG;
  const sourceNodes = await args.recallAccess.listAssociativeNodesByIds(args.payload.scope, args.payload.source_node_ids);
  const candidatePool = await args.recallAccess.listAssociativeCandidatePool(
    args.payload.scope,
    args.payload.source_node_ids,
    Math.max(config.max_candidates_per_source * Math.max(1, sourceNodes.length), config.max_candidates_per_source),
  );
  return { sourceNodes, candidatePool };
}

export async function materializeShadowAssociationCandidates(args: {
  payload: AssociativeLinkTriggerPayload;
  sourceNodes: RecallAssociativeNodeRow[];
  candidatePool: RecallAssociativeNodeRow[];
  writeAccess: Pick<
    AssociativeCandidateStoreAccess,
    "upsertAssociationCandidates" | "listAssociationCandidatesForSource" | "updateAssociationCandidateStatus"
  >;
  config?: AssociativeLinkingResolvedConfig;
}): Promise<AssociativeLinkingJobResult> {
  const config = args.config ?? DEFAULT_ASSOCIATIVE_LINKING_CONFIG;
  const upserts: UpsertAssociationCandidateArgs[] = [];
  let evaluatedPairs = 0;
  let rejected = 0;
  for (const source of args.sourceNodes) {
    const existingShadowCandidates = await args.writeAccess.listAssociationCandidatesForSource({
      scope: args.payload.scope,
      src_id: source.id,
      statuses: ["shadow"],
      limit: 200,
    });
    const scoredRows = args.candidatePool
      .filter((candidate) => {
        if (candidate.id === source.id) {
          rejected += 1;
          return false;
        }
        if (candidate.scope !== source.scope || candidate.scope !== args.payload.scope) {
          rejected += 1;
          return false;
        }
        return true;
      })
      .map((candidate) => {
        evaluatedPairs += 1;
        const features = extractAssociativeFeatures(source, candidate);
        const scored = scoreAssociativeCandidate(features);
        return {
          candidate,
          features,
          scored,
          visibilityCompatible: isAssociativeVisibilityCompatible(
            associativeVisibilityFromNode(source),
            associativeVisibilityFromNode(candidate),
          ),
        };
      })
      .sort((left, right) => right.scored.score - left.scored.score || right.scored.confidence - left.scored.confidence);
    const scoredForSource = scoredRows
      .filter((row) => {
        if (!row.visibilityCompatible) {
          rejected += 1;
          return false;
        }
        return row.scored.score >= 0.5;
      })
      .sort((left, right) => right.scored.score - left.scored.score || right.scored.confidence - left.scored.confidence)
      .slice(0, config.max_candidates_per_source);
    const selectedKeys = new Set(
      scoredForSource.map((row) =>
        candidateIdentityKey({
          scope: args.payload.scope,
          src_id: source.id,
          dst_id: row.candidate.id,
          relation_kind: row.scored.relation_kind,
        })),
    );
    for (const row of scoredForSource) {
      upserts.push(buildCandidateUpsert({
        scope: args.payload.scope,
        source,
        candidate: row.candidate,
        scored: row.scored,
        features: row.features,
        sourceCommitId: args.payload.source_commit_id,
        status: "shadow",
      }));
    }
    for (const row of scoredRows) {
      if (!row.visibilityCompatible) continue;
      if (row.scored.score >= 0.5) continue;
      rejected += 1;
      upserts.push(buildCandidateUpsert({
        scope: args.payload.scope,
        source,
        candidate: row.candidate,
        scored: row.scored,
        features: row.features,
        sourceCommitId: args.payload.source_commit_id,
        status: "rejected",
      }));
    }
    for (const existing of existingShadowCandidates) {
      const key = candidateIdentityKey(existing);
      if (selectedKeys.has(key)) continue;
      if (!isValidAssociativeCandidateStatusTransition(existing.status, "expired")) continue;
      await args.writeAccess.updateAssociationCandidateStatus({
        scope: existing.scope,
        src_id: existing.src_id,
        dst_id: existing.dst_id,
        relation_kind: existing.relation_kind,
        status: "expired",
      });
    }
  }
  if (upserts.length > 0) {
    await args.writeAccess.upsertAssociationCandidates(upserts);
  }
  return {
    source_count: args.sourceNodes.length,
    candidate_pool_size: args.candidatePool.length,
    evaluated_pairs: evaluatedPairs,
    shadow_created: upserts.filter((row) => row.status === "shadow").length,
    promoted: 0,
    rejected,
  };
}

export async function runAssociativeLinkingJob(args: {
  payload: AssociativeLinkTriggerPayload;
  recallAccess: AssociativeLinkingRecallAccess;
  writeAccess: Pick<
    AssociativeCandidateStoreAccess,
    "upsertAssociationCandidates" | "listAssociationCandidatesForSource" | "updateAssociationCandidateStatus"
  >;
  config?: AssociativeLinkingResolvedConfig;
}): Promise<AssociativeLinkingJobResult> {
  const fetched = await fetchAssociativeCandidatesForSources(args);
  return materializeShadowAssociationCandidates({
    payload: args.payload,
    sourceNodes: fetched.sourceNodes,
    candidatePool: fetched.candidatePool,
    writeAccess: args.writeAccess,
    config: args.config,
  });
}

export async function promoteAssociativeCandidates(args: {
  scope: string;
  sourceNodeIds: string[];
  writeAccess: Pick<
    AssociativeCandidateStoreAccess,
    "listAssociationCandidatesForSource" | "markAssociationCandidatePromoted" | "updateAssociationCandidateStatus"
  > & {
    upsertEdge(params: {
      id: string;
      scope: string;
      type: "related_to";
      srcId: string;
      dstId: string;
      weight: number;
      confidence: number;
      decayRate: number;
      commitId: string;
    }): Promise<void>;
  };
  config?: AssociativeLinkingResolvedConfig;
}): Promise<AssociativePromotionResult> {
  const config = args.config ?? DEFAULT_ASSOCIATIVE_LINKING_CONFIG;
  const uniqueSourceIds = Array.from(new Set(args.sourceNodeIds));
  const seenEdges = new Set<string>();
  let evaluated = 0;
  let promoted = 0;
  let rejected = 0;
  const rejectCandidate = async (candidate: AssociationCandidateRecord) => {
    rejected += 1;
    if (!isValidAssociativeCandidateStatusTransition(candidate.status, "rejected")) return;
    await args.writeAccess.updateAssociationCandidateStatus({
      scope: candidate.scope,
      src_id: candidate.src_id,
      dst_id: candidate.dst_id,
      relation_kind: candidate.relation_kind,
      status: "rejected",
    });
  };

  for (const sourceNodeId of uniqueSourceIds) {
    const candidates = await args.writeAccess.listAssociationCandidatesForSource({
      scope: args.scope,
      src_id: sourceNodeId,
      statuses: ["shadow"],
      limit: config.max_candidates_per_source,
    });
    for (const candidate of candidates) {
      evaluated += 1;
      if (candidate.status !== "shadow") {
        await rejectCandidate(candidate);
        continue;
      }
      const sourceVisibility = asAssociativeVisibility(candidate.evidence_json?.source_visibility);
      const candidateVisibility = asAssociativeVisibility(candidate.evidence_json?.candidate_visibility);
      if (!isAssociativeVisibilityCompatible(sourceVisibility, candidateVisibility)) {
        await rejectCandidate(candidate);
        continue;
      }
      if (!isValidAssociativeCandidateStatusTransition(candidate.status, "promoted")) {
        await rejectCandidate(candidate);
        continue;
      }
      if (candidate.src_id === candidate.dst_id) {
        await rejectCandidate(candidate);
        continue;
      }
      if (candidate.source_commit_id == null) {
        await rejectCandidate(candidate);
        continue;
      }
      if (candidate.confidence < config.promotion_confidence_threshold) {
        await rejectCandidate(candidate);
        continue;
      }
      if (candidate.score < config.promotion_score_threshold) {
        await rejectCandidate(candidate);
        continue;
      }

      const [edgeSrcId, edgeDstId] =
        candidate.src_id.localeCompare(candidate.dst_id) <= 0
          ? [candidate.src_id, candidate.dst_id]
          : [candidate.dst_id, candidate.src_id];
      const edgeKey = `${args.scope}:${edgeSrcId}:${edgeDstId}`;
      const edgeId = stableUuid(`${args.scope}:edge:associative:related_to:${edgeSrcId}:${edgeDstId}`);

      if (!seenEdges.has(edgeKey)) {
        await args.writeAccess.upsertEdge({
          id: edgeId,
          scope: args.scope,
          type: "related_to",
          srcId: edgeSrcId,
          dstId: edgeDstId,
          weight: candidate.score,
          confidence: candidate.confidence,
          decayRate: 0,
          commitId: candidate.source_commit_id,
        });
        seenEdges.add(edgeKey);
      }

      await args.writeAccess.markAssociationCandidatePromoted({
        scope: candidate.scope,
        src_id: candidate.src_id,
        dst_id: candidate.dst_id,
        relation_kind: candidate.relation_kind,
        promoted_edge_id: edgeId,
      });
      promoted += 1;
    }
  }

  return { evaluated, promoted, rejected };
}
