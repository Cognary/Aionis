import type pg from "pg";
import { performance } from "node:perf_hooks";
import { assertDim, toVectorLiteral } from "../util/pgvector.js";
import { capabilityContract } from "../capability-contract.js";
import {
  assertRecallStoreAccessContract,
  createPostgresRecallStoreAccess,
  type RecallCandidate,
  type RecallEdgeRow,
  type RecallNodeRow,
  type RecallStoreAccess,
} from "../store/recall-access.js";
import { MemoryRecallRequest, type MemoryRecallInput } from "./schemas.js";
import { buildContext } from "./context.js";
import { sha256Hex } from "../util/crypto.js";
import { badRequest } from "../util/http.js";
import { resolveTenantScope } from "./tenant.js";
import { resolveMemoryLayerPolicy } from "./layer-policy.js";
import { buildRuntimeToolHintsFromAnchorNodes } from "./runtime-tool-hints.js";
import { AIONIS_URI_NODE_TYPES, buildAionisUri } from "./uri.js";
import type { MemoryLayerId, MemoryLayerPolicy } from "./layer-policy.js";
import { dedupeWorkflowCandidatesBySignature } from "./workflow-candidate-aggregation.js";

export type RecallAuth = {
  allow_debug_embeddings: boolean;
};

export type RecallTelemetry = {
  timing?: (stage: string, ms: number) => void;
};

export type MemoryRecallOptions = {
  stage1_exact_fallback_on_empty?: boolean;
  recall_access?: RecallStoreAccess;
  unsafe_allow_drop_trust_anchors?: boolean;
  unsafe_apply_layer_policy_to_retrieval?: boolean;
  internal_allow_l4_selection?: boolean;
};

type NodeRow = RecallNodeRow;
type EdgeRow = RecallEdgeRow;

function edgeTypeWeight(t: string): number {
  if (t === "derived_from") return 1.0;
  if (t === "part_of") return 0.9;
  return 0.6; // related_to
}

function parseVectorText(v: string, maxPreviewDims: number): { dims: number; preview: number[] } {
  const s = v.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) throw new Error("unexpected vector text");
  const body = s.slice(1, -1).trim();
  if (!body) return { dims: 0, preview: [] };
  const parts = body.split(",");
  const preview: number[] = [];
  for (let i = 0; i < parts.length && i < maxPreviewDims; i++) {
    preview.push(Number(parts[i]));
  }
  return { dims: parts.length, preview };
}

function isDraftTopic(n: NodeRow): boolean {
  return n.type === "topic" && (n.topic_state ?? "active") === "draft";
}

function resolveCompressionLayer(n: NodeRow): MemoryLayerId | null {
  const executionLayer = typeof n.slots?.execution_native_v1?.compression_layer === "string"
    ? n.slots.execution_native_v1.compression_layer.trim()
    : "";
  if (executionLayer === "L0" || executionLayer === "L1" || executionLayer === "L2" || executionLayer === "L3"
    || executionLayer === "L4" || executionLayer === "L5") {
    return executionLayer;
  }
  const anchorLevel = typeof n.slots?.execution_native_v1?.anchor_level === "string"
    ? n.slots.execution_native_v1.anchor_level.trim()
    : typeof n.slots?.anchor_v1?.anchor_level === "string"
      ? n.slots.anchor_v1.anchor_level.trim()
      : "";
  if (anchorLevel === "L0" || anchorLevel === "L1" || anchorLevel === "L2" || anchorLevel === "L3" || anchorLevel === "L4" || anchorLevel === "L5") {
    return anchorLevel;
  }
  if (n.type === "event") return "L0";
  if (n.type === "evidence") {
    if (n.slots?.summary_kind === "write_distillation_evidence") return "L1";
    return "L0";
  }
  if (n.type === "topic") return "L2";
  if (n.type === "concept") {
    if (typeof n.slots?.compression_layer === "string" && n.slots.compression_layer.trim()) {
      const layer = n.slots.compression_layer.trim();
      if (layer === "L0" || layer === "L1" || layer === "L2" || layer === "L3" || layer === "L4" || layer === "L5") {
        return layer;
      }
    }
    if (n.slots?.summary_kind === "write_distillation_fact") return "L1";
    if (n.slots?.summary_kind === "compression_rollup") return "L3";
  }
  return null;
}

function allowedLayersForPolicy(layerPolicy: MemoryLayerPolicy | null): Set<MemoryLayerId> | null {
  if (!layerPolicy || layerPolicy.source !== "request_override") return null;
  return new Set<MemoryLayerId>([
    ...layerPolicy.preferred_layers,
    ...layerPolicy.fallback_layers,
    ...layerPolicy.trust_anchor_layers,
  ]);
}

function pickSlotsPreview(slots: unknown, maxKeys: number): Record<string, unknown> | null {
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return null;
  const obj = slots as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys.slice(0, maxKeys)) out[k] = obj[k];
  return out;
}

type NodeDTO = {
  id: string;
  uri?: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  topic_state?: string | null;
  member_count?: number | null;
  slots?: unknown;
  slots_preview?: Record<string, unknown> | null;
  raw_ref?: string | null;
  evidence_ref?: string | null;
  embedding_status?: string;
  embedding_model?: string | null;
  memory_lane?: "private" | "shared";
  producer_agent_id?: string | null;
  owner_agent_id?: string | null;
  owner_team_id?: string | null;
  created_at?: string;
  updated_at?: string;
  last_activated?: string | null;
  salience?: number;
  importance?: number;
  confidence?: number;
  commit_id?: string | null;
};

type EdgeDTO = {
  id: string;
  uri: string;
  from_id: string;
  to_id: string;
  type: string;
  weight: number;
  commit_id?: string | null;
  commit_uri?: string | null;
};

type ActionRecallWorkflow = {
  anchor_id: string;
  uri: string | null;
  type: string;
  title: string | null;
  summary: string | null;
  anchor_level: string;
  promotion_state: "candidate" | "stable" | null;
  source_kind: string | null;
  promotion_origin: "replay_promote" | "replay_stable_normalization" | "replay_learning_episode" | "replay_learning_auto_promotion" | null;
  required_observations: number | null;
  observed_count: number | null;
  promotion_ready: boolean;
  workflow_signature: string | null;
  last_transition: "candidate_observed" | "promoted_to_stable" | "normalized_latest_stable" | null;
  last_transition_at: string | null;
  rehydration_default_mode: "summary_only" | "partial" | "full" | null;
  tool_set: string[];
  maintenance_state: "observe" | "retain" | "review" | null;
  offline_priority: "none" | "promote_candidate" | "review_counter_evidence" | "retain_trusted" | "retain_workflow" | null;
  last_maintenance_at: string | null;
  confidence: number | null;
};

type ActionRecallPattern = {
  anchor_id: string;
  uri: string | null;
  type: string;
  title: string | null;
  summary: string | null;
  anchor_level: string;
  selected_tool: string | null;
  tool_set: string[];
  pattern_state: "provisional" | "stable";
  credibility_state: "candidate" | "trusted" | "contested";
  trusted: boolean;
  distinct_run_count: number | null;
  required_distinct_runs: number | null;
  counter_evidence_open: boolean;
  last_transition: string | null;
  maintenance_state: "observe" | "retain" | "review" | null;
  offline_priority: "none" | "promote_candidate" | "review_counter_evidence" | "retain_trusted" | null;
  last_maintenance_at: string | null;
  confidence: number | null;
};

type ActionRecallRehydrationCandidate = {
  anchor_id: string;
  anchor_uri: string;
  anchor_kind: string;
  anchor_level: string;
  title: string | null;
  summary: string | null;
  mode: "summary_only" | "partial" | "full";
  payload_cost_hint: "low" | "medium" | "high" | null;
  recommended_when: string[];
  trusted: boolean;
  selected_tool: string | null;
  example_call: string;
};

type ActionRecallSupportingKnowledge = {
  kind: string;
  node_id: string;
  uri: string | null;
  title: string | null;
  summary: string | null;
  compression_layer: string | null;
  tier: string | null;
  salience: number | null;
};

type ActionRecallPacket = {
  packet_version: "action_recall_v1";
  recommended_workflows: ActionRecallWorkflow[];
  candidate_workflows: ActionRecallWorkflow[];
  candidate_patterns: ActionRecallPattern[];
  trusted_patterns: ActionRecallPattern[];
  contested_patterns: ActionRecallPattern[];
  rehydration_candidates: ActionRecallRehydrationCandidate[];
  supporting_knowledge: ActionRecallSupportingKnowledge[];
};

const URI_NODE_TYPES = new Set<string>(AIONIS_URI_NODE_TYPES);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapExecutionKindToAnchorKind(executionKind: string | null): string | null {
  if (executionKind === "workflow_anchor") return "workflow";
  if (executionKind === "workflow_candidate") return "workflow";
  if (executionKind === "pattern_anchor") return "pattern";
  return null;
}

function executionNativeRecord(slots: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(slots?.execution_native_v1);
}

function anchorRecord(slots: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(slots?.anchor_v1);
}

function recallAnchorMeta(node: NodeRow): {
  slots: Record<string, unknown> | null;
  executionNative: Record<string, unknown> | null;
  anchor: Record<string, unknown> | null;
  anchorKind: string | null;
  anchorLevel: string | null;
  executionKind: string | null;
  patternState: "provisional" | "stable";
  credibilityState: "candidate" | "trusted" | "contested";
  workflowPromotion: Record<string, unknown> | null;
  promotion: Record<string, unknown> | null;
  maintenance: Record<string, unknown> | null;
  rehydration: Record<string, unknown> | null;
  counterEvidenceOpen: boolean;
  trusted: boolean;
  selectedTool: string | null;
} {
  const slots = asRecord(node.slots);
  const executionNative = executionNativeRecord(slots);
  const anchor = anchorRecord(slots);
  const anchorKind = firstString(executionNative?.anchor_kind)
    ?? mapExecutionKindToAnchorKind(firstString(executionNative?.execution_kind))
    ?? firstString(anchor?.anchor_kind);
  const anchorLevel = firstString(executionNative?.anchor_level) ?? firstString(anchor?.anchor_level);
  const executionKind = firstString(executionNative?.execution_kind);
  const patternState = firstString(executionNative?.pattern_state ?? anchor?.pattern_state) === "stable" ? "stable" : "provisional";
  const workflowPromotion = asRecord(executionNative?.workflow_promotion) ?? asRecord(anchor?.workflow_promotion);
  const promotion = asRecord(executionNative?.promotion) ?? asRecord(anchor?.promotion);
  const maintenance = asRecord(executionNative?.maintenance) ?? asRecord(anchor?.maintenance);
  const rehydration = asRecord(executionNative?.rehydration) ?? asRecord(anchor?.rehydration);
  const counterEvidenceOpen = promotion?.counter_evidence_open === true;
  const credibilityStateRaw = firstString(executionNative?.credibility_state ?? anchor?.credibility_state ?? promotion?.credibility_state);
  const credibilityState: "candidate" | "trusted" | "contested" =
    credibilityStateRaw === "trusted" || credibilityStateRaw === "contested" || credibilityStateRaw === "candidate"
      ? credibilityStateRaw
      : counterEvidenceOpen
        ? "contested"
        : patternState === "stable"
          ? "trusted"
          : "candidate";
  const trusted = anchorKind === "pattern" ? credibilityState === "trusted" : false;
  const selectedTool = firstString(executionNative?.selected_tool ?? anchor?.selected_tool);
  return {
    slots,
    executionNative,
    anchor,
    anchorKind,
    anchorLevel,
    executionKind,
    patternState,
    credibilityState,
    workflowPromotion,
    promotion,
    maintenance,
    rehydration,
    counterEvidenceOpen,
    trusted,
    selectedTool,
  };
}

function stringList(value: unknown, limit = 16): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const next = typeof item === "string" ? item.trim() : "";
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= limit) break;
  }
  return out;
}

function deriveWorkflowSourceKind(args: {
  anchor: Record<string, unknown> | null;
  workflowPromotion: Record<string, unknown> | null;
  executionKind: string | null;
}): string | null {
  const explicitSourceKind = firstString(args.anchor?.source && asRecord(args.anchor.source)?.source_kind);
  if (explicitSourceKind) return explicitSourceKind;
  const promotionOrigin = firstString(args.workflowPromotion?.promotion_origin);
  if (
    promotionOrigin === "replay_promote"
    || promotionOrigin === "replay_stable_normalization"
    || promotionOrigin === "replay_learning_episode"
    || promotionOrigin === "replay_learning_auto_promotion"
    || args.executionKind === "workflow_candidate"
    || args.executionKind === "workflow_anchor"
  ) {
    return "playbook";
  }
  return null;
}

function isWorkflowPromotionReady(workflowPromotion: Record<string, unknown> | null): boolean {
  const promotionState = firstString(workflowPromotion?.promotion_state);
  if (promotionState !== "candidate") return false;
  const observedCount = firstFinite(workflowPromotion?.observed_count);
  const requiredObservations = firstFinite(workflowPromotion?.required_observations);
  return observedCount != null && requiredObservations != null && observedCount >= requiredObservations;
}

function buildActionRecallPacket(args: {
  tenant_id: string;
  scope: string;
  nodes: NodeRow[];
  runtimeToolHints: Array<Record<string, unknown>>;
  contextItems: Array<Record<string, unknown>>;
}): ActionRecallPacket {
  const recommendedWorkflows: ActionRecallWorkflow[] = [];
  const candidateWorkflows: ActionRecallWorkflow[] = [];
  const deferredCandidateWorkflows: ActionRecallWorkflow[] = [];
  const candidatePatterns: ActionRecallPattern[] = [];
  const trustedPatterns: ActionRecallPattern[] = [];
  const contestedPatterns: ActionRecallPattern[] = [];
  const supportingKnowledge: ActionRecallSupportingKnowledge[] = [];
  const actionAnchorIds = new Set<string>();
  const stableWorkflowSignatures = new Set<string>();

  for (const node of args.nodes) {
    const meta = recallAnchorMeta(node);
    const anchor = meta.anchor;
    const anchorKind = meta.anchorKind;
    const anchorLevel = meta.anchorLevel;
    if (!anchorKind || !anchorLevel) continue;
    const uri = URI_NODE_TYPES.has(node.type)
      ? buildAionisUri({ tenant_id: args.tenant_id, scope: args.scope, type: node.type, id: node.id })
      : null;
    actionAnchorIds.add(node.id);
    if (anchorKind === "workflow") {
      const workflowEntry: ActionRecallWorkflow = {
        anchor_id: node.id,
        uri,
        type: node.type,
        title: node.title ?? null,
        summary: firstString(anchor?.summary) ?? node.text_summary ?? node.title ?? null,
        anchor_level: anchorLevel,
        promotion_state: firstString(meta.workflowPromotion?.promotion_state) as any,
        source_kind: deriveWorkflowSourceKind({
          anchor,
          workflowPromotion: meta.workflowPromotion,
          executionKind: meta.executionKind,
        }),
        promotion_origin: firstString(meta.workflowPromotion?.promotion_origin) as any,
        required_observations: firstFinite(meta.workflowPromotion?.required_observations),
        observed_count: firstFinite(meta.workflowPromotion?.observed_count),
        promotion_ready: isWorkflowPromotionReady(meta.workflowPromotion),
        workflow_signature: firstString(meta.executionNative?.workflow_signature ?? anchor?.workflow_signature),
        last_transition: firstString(meta.workflowPromotion?.last_transition) as any,
        last_transition_at: firstString(meta.workflowPromotion?.last_transition_at),
        rehydration_default_mode: firstString(meta.rehydration?.default_mode) as any,
        tool_set: stringList(meta.executionNative?.tool_set).length > 0
          ? stringList(meta.executionNative?.tool_set)
          : stringList(anchor?.tool_set),
        maintenance_state: firstString(meta.maintenance?.maintenance_state) as any,
        offline_priority: firstString(meta.maintenance?.offline_priority) as any,
        last_maintenance_at: firstString(meta.maintenance?.last_maintenance_at),
        confidence: firstFinite(node.confidence),
      };
      if (meta.executionKind === "workflow_candidate" || firstString(meta.workflowPromotion?.promotion_state) === "candidate") {
        deferredCandidateWorkflows.push(workflowEntry);
      } else {
        recommendedWorkflows.push(workflowEntry);
        if (workflowEntry.workflow_signature) stableWorkflowSignatures.add(workflowEntry.workflow_signature);
      }
      continue;
    }
    if (anchorKind === "pattern") {
      const packetEntry: ActionRecallPattern = {
        anchor_id: node.id,
        uri,
        type: node.type,
        title: node.title ?? null,
        summary: firstString(anchor?.summary) ?? node.text_summary ?? node.title ?? null,
        anchor_level: anchorLevel,
        selected_tool: meta.selectedTool,
        tool_set: stringList(anchor?.tool_set),
        pattern_state: meta.patternState,
        credibility_state: meta.credibilityState,
        trusted: meta.trusted,
        distinct_run_count: firstFinite(meta.promotion?.distinct_run_count),
        required_distinct_runs: firstFinite(meta.promotion?.required_distinct_runs),
        counter_evidence_open: meta.counterEvidenceOpen,
        last_transition: firstString(meta.promotion?.last_transition),
        maintenance_state: firstString(meta.maintenance?.maintenance_state) as any,
        offline_priority: firstString(meta.maintenance?.offline_priority) as any,
        last_maintenance_at: firstString(meta.maintenance?.last_maintenance_at),
        confidence: firstFinite(node.confidence),
      };
      if (meta.credibilityState === "trusted") trustedPatterns.push(packetEntry);
      else if (meta.credibilityState === "contested") contestedPatterns.push(packetEntry);
      else candidatePatterns.push(packetEntry);
    }
  }

  const aggregatedDeferredCandidates = dedupeWorkflowCandidatesBySignature(deferredCandidateWorkflows);
  for (const pending of aggregatedDeferredCandidates) {
    if (pending.workflow_signature && stableWorkflowSignatures.has(pending.workflow_signature)) continue;
    candidateWorkflows.push(pending);
  }

  const uriByAnchorId = new Map<string, string>();
  const rehydrationCandidates: ActionRecallRehydrationCandidate[] = [];
  for (const rawHint of args.runtimeToolHints.slice(0, 8)) {
    const hint = asRecord(rawHint);
    const anchor = asRecord(hint?.anchor);
    const invocation = asRecord(hint?.invocation);
    const anchorId = firstString(anchor?.id);
    const anchorUri = firstString(invocation?.anchor_uri) ?? firstString(anchor?.uri);
    const anchorKind = firstString(anchor?.anchor_kind);
    const anchorLevel = firstString(anchor?.anchor_level);
    const modeRaw = firstString(invocation?.mode);
    const mode = modeRaw === "summary_only" || modeRaw === "full" || modeRaw === "partial" ? modeRaw : "partial";
    const payloadCostHintRaw = firstString(hint?.payload_cost_hint);
    const payloadCostHint = payloadCostHintRaw === "low" || payloadCostHintRaw === "medium" || payloadCostHintRaw === "high"
      ? payloadCostHintRaw
      : null;
    if (!anchorId || !anchorUri || !anchorKind || !anchorLevel) continue;
    uriByAnchorId.set(anchorId, anchorUri);
    rehydrationCandidates.push({
      anchor_id: anchorId,
      anchor_uri: anchorUri,
      anchor_kind: anchorKind,
      anchor_level: anchorLevel,
      title: firstString(anchor?.title),
      summary: firstString(anchor?.summary),
      mode,
      payload_cost_hint: payloadCostHint,
      recommended_when: stringList(hint?.recommended_when),
      trusted: anchor?.trusted === true,
      selected_tool: firstString(anchor?.selected_tool),
      example_call: firstString(invocation?.example_call) ?? "",
    });
  }

  for (const workflow of recommendedWorkflows) workflow.uri = uriByAnchorId.get(workflow.anchor_id) ?? workflow.uri;
  for (const workflow of candidateWorkflows) workflow.uri = uriByAnchorId.get(workflow.anchor_id) ?? workflow.uri;
  for (const pattern of candidatePatterns) pattern.uri = uriByAnchorId.get(pattern.anchor_id) ?? pattern.uri;
  for (const pattern of trustedPatterns) pattern.uri = uriByAnchorId.get(pattern.anchor_id) ?? pattern.uri;
  for (const pattern of contestedPatterns) pattern.uri = uriByAnchorId.get(pattern.anchor_id) ?? pattern.uri;

  for (const rawItem of args.contextItems.slice(0, 32)) {
    const item = asRecord(rawItem);
    const nodeId = firstString(item?.node_id);
    if (!nodeId || actionAnchorIds.has(nodeId)) continue;
    supportingKnowledge.push({
      kind: firstString(item?.kind) ?? "unknown",
      node_id: nodeId,
      uri: firstString(item?.uri),
      title: firstString(item?.title),
      summary: firstString(item?.summary),
      compression_layer: firstString(item?.compression_layer),
      tier: firstString(item?.tier),
      salience: firstFinite(item?.salience),
    });
    if (supportingKnowledge.length >= 16) break;
  }

  return {
    packet_version: "action_recall_v1",
    recommended_workflows: recommendedWorkflows,
    candidate_workflows: candidateWorkflows,
    candidate_patterns: candidatePatterns,
    trusted_patterns: trustedPatterns,
    contested_patterns: contestedPatterns,
    rehydration_candidates: rehydrationCandidates,
    supporting_knowledge: supportingKnowledge,
  };
}

function isActionRecallEndpoint(endpoint: "recall" | "recall_text" | "planning_context" | "context_assemble"): boolean {
  return endpoint === "planning_context" || endpoint === "context_assemble";
}

function actionRecallPriority(node: NodeRow): number {
  const meta = recallAnchorMeta(node);
  if (!meta.anchorKind) {
    if (node.type === "procedure") return 4;
    if (node.type === "rule") return 8;
    if (node.type === "concept" || node.type === "topic" || node.type === "entity") return 10;
    return 12;
  }
  if (meta.anchorKind === "workflow") {
    if (meta.executionKind === "workflow_candidate" || firstString(meta.workflowPromotion?.promotion_state) === "candidate") {
      return isWorkflowPromotionReady(meta.workflowPromotion) ? 1 : 2;
    }
    return 0;
  }
  if (meta.anchorKind === "pattern") {
    if (meta.patternState === "stable" && !meta.counterEvidenceOpen) return 3;
    return 4;
  }
  if (meta.anchorKind === "decision") return 5;
  if (meta.anchorKind === "execution") return 6;
  return 7;
}

function prioritizeRankedForActionRecall(ranked: Array<{ id: string; activation: number; score: number }>, nodes: Map<string, NodeRow>) {
  return [...ranked].sort((a, b) => {
    const aNode = nodes.get(a.id);
    const bNode = nodes.get(b.id);
    const aPriority = aNode ? actionRecallPriority(aNode) : 99;
    const bPriority = bNode ? actionRecallPriority(bNode) : 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return b.score - a.score || a.id.localeCompare(b.id);
  });
}

// Very small spreading-activation MVP: 1-2 iterations, bounded by the neighborhood we fetched.
function spreadActivation(seeds: RecallCandidate[], nodes: Map<string, NodeRow>, edges: EdgeRow[], hops: number) {
  const act = new Map<string, number>();
  for (const s of seeds) {
    // similarity in [0,1], salience in [0,1]
    const a = Math.max(0, Math.min(1, 0.75 * s.similarity + 0.25 * s.salience));
    act.set(s.id, a);
  }

  const adj = new Map<string, EdgeRow[]>();
  for (const e of edges) {
    if (!adj.has(e.src_id)) adj.set(e.src_id, []);
    if (!adj.has(e.dst_id)) adj.set(e.dst_id, []);
    adj.get(e.src_id)!.push(e);
    adj.get(e.dst_id)!.push(e);
  }

  for (let iter = 0; iter < hops; iter++) {
    const next = new Map(act);
    for (const [nid, a] of act.entries()) {
      const es = adj.get(nid) ?? [];
      for (const e of es) {
        const other = e.src_id === nid ? e.dst_id : e.src_id;
        const w = edgeTypeWeight(e.type) * e.weight * e.confidence;
        const add = a * w * 0.5; // conservative
        next.set(other, Math.max(next.get(other) ?? 0, add));
      }
    }
    for (const [k, v] of next.entries()) act.set(k, Math.max(act.get(k) ?? 0, v));
  }

  const scored = Array.from(act.entries())
    .map(([id, activation]) => {
      const n = nodes.get(id);
      const conf = n?.confidence ?? 0.5;
      const sal = n?.salience ?? 0.5;
      // Blend activation with node confidence/salience to stabilize ranking.
      const score = 0.7 * activation + 0.15 * conf + 0.15 * sal;
      return { id, activation, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored;
}

function enforceHardContract(parsed: MemoryRecallInput, auth: RecallAuth) {
  // A: Debug embeddings are a privileged, bounded debug channel. Never allow as a default.
  if (parsed.include_embeddings) {
    if (!parsed.return_debug) badRequest("debug_embeddings_requires_return_debug", "include_embeddings requires return_debug=true");
    if (!auth.allow_debug_embeddings) {
      badRequest("debug_embeddings_not_allowed", "include_embeddings requires X-Admin-Token (or localhost in dev)");
    }
    if (parsed.limit > 20) badRequest("debug_embeddings_limit_too_high", "debug embeddings mode requires limit <= 20");
  }
}

export async function memoryRecallParsed(
  client: pg.PoolClient,
  parsed: MemoryRecallInput,
  defaultScope: string,
  defaultTenantId: string,
  auth: RecallAuth,
  telemetry?: RecallTelemetry,
  endpoint: "recall" | "recall_text" | "planning_context" | "context_assemble" = "recall",
  options?: MemoryRecallOptions,
) {
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const buildNodeUri = (id: string, type: string): string | null => {
    if (!URI_NODE_TYPES.has(type)) return null;
    return buildAionisUri({
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      type,
      id,
    });
  };
  const buildEdgeUri = (id: string): string =>
    buildAionisUri({
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      type: "edge",
      id,
    });
  const buildCommitUri = (id: string | null | undefined): string | null => {
    const commitId = String(id ?? "").trim();
    if (!commitId) return null;
    return buildAionisUri({
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      type: "commit",
      id: commitId,
    });
  };
  const consumerAgentId = parsed.consumer_agent_id?.trim() || null;
  const consumerTeamId = parsed.consumer_team_id?.trim() || null;
  const layerPolicy = resolveMemoryLayerPolicy(endpoint, parsed.memory_layer_preference ?? null, {
    unsafe_allow_drop_trust_anchors: options?.unsafe_allow_drop_trust_anchors === true,
    internal_allow_l4_selection: options?.internal_allow_l4_selection === true,
  });
  const stage1ExactFallbackOnEmpty = options?.stage1_exact_fallback_on_empty ?? true;
  assertDim(parsed.query_embedding, 1536);

  enforceHardContract(parsed, auth);

  async function timed<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      const ms = performance.now() - t0;
      telemetry?.timing?.(stage, ms);
    }
  }

  const oversample = Math.max(parsed.limit, Math.min(1000, parsed.limit * 5));
  const recallAccess = options?.recall_access ?? createPostgresRecallStoreAccess(client);
  assertRecallStoreAccessContract(recallAccess);

  // Stage 1 (primary): ANN kNN candidate fetch (fast path).
  const stage1Ann = await timed("stage1_candidates_ann", () =>
    recallAccess.stage1CandidatesAnn({
      queryEmbedding: parsed.query_embedding,
      scope,
      oversample,
      limit: parsed.limit,
      consumerAgentId,
      consumerTeamId,
    }),
  );

  let seeds = stage1Ann;
  const stage1AnnSeedCount = seeds.length;
  const stage1ExactFallbackAttempted = stage1AnnSeedCount === 0 && stage1ExactFallbackOnEmpty;
  let stage1Mode: "ann" | "exact_fallback" = "ann";

  if (stage1ExactFallbackAttempted) {
    const stage1Exact = await timed("stage1_candidates_exact_fallback", () =>
      recallAccess.stage1CandidatesExactFallback({
        queryEmbedding: parsed.query_embedding,
        scope,
        oversample,
        limit: parsed.limit,
        consumerAgentId,
        consumerTeamId,
      }),
    );
    seeds = stage1Exact;
    stage1Mode = "exact_fallback";
  }

  const outSeeds = seeds.map((s) => {
    const uri = buildNodeUri(s.id, s.type);
    if (!uri) return s;
    return { ...s, uri };
  });

  const seedIds = seeds.map((s) => s.id);

  if (seedIds.length === 0) {
    return {
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
      seeds: outSeeds,
      subgraph: { nodes: [], edges: [] },
      ranked: [],
      context: {
        text: "",
        items: [],
        citations: [],
        selection_policy: layerPolicy,
        selection_stats: {
          retrieved_memory_layers: [],
          retrieved_unlayered_count: 0,
          selected_memory_layers: [],
          selected_unlayered_count: 0,
          retrieval_filtered_by_layer_policy_count: 0,
          retrieval_filtered_by_layer: {},
          filtered_by_layer_policy_count: 0,
          filtered_by_layer: {},
        },
      },
      runtime_tool_hints: [],
      action_recall_packet: {
        packet_version: "action_recall_v1",
        recommended_workflows: [],
        candidate_workflows: [],
        candidate_patterns: [],
        trusted_patterns: [],
        contested_patterns: [],
        rehydration_candidates: [],
        supporting_knowledge: [],
      },
      ...(parsed.return_debug
        ? {
            debug: {
              neighborhood_counts: { nodes: 0, edges: 0 },
              embeddings: undefined,
              stage1: {
                mode: stage1Mode,
                ann_seed_count: stage1AnnSeedCount,
                final_seed_count: 0,
                exact_fallback_enabled: stage1ExactFallbackOnEmpty,
                exact_fallback_attempted: stage1ExactFallbackAttempted,
              },
            },
          }
        : {}),
    };
  }

  // Stage 2: fetch 1-2 hop neighborhood edges/nodes.
  // Contract/perf rules (B/C):
  // - never select/return embedding here
  // - explicit column list only
  // Hard bound on how much neighborhood data we even consider.
  // Note: request max_edges is already hard-capped to 100 by schema. We still budget stage-2 fetch work.
  const EDGE_FETCH_BUDGET = Math.min(1000, Math.max(parsed.max_edges * 5, parsed.max_edges));
  const HOP1_BUDGET = Math.max(50, Math.min(500, EDGE_FETCH_BUDGET));
  const HOP2_BUDGET = Math.max(50, Math.min(500, EDGE_FETCH_BUDGET));
  const minEdgeWeight = Math.max(0, Math.min(1, parsed.min_edge_weight ?? 0));
  const minEdgeConf = Math.max(0, Math.min(1, parsed.min_edge_confidence ?? 0));

  const neighborhoodEdges = await timed("stage2_edges", () =>
    recallAccess.stage2Edges({
      seedIds,
      scope,
      neighborhoodHops: parsed.neighborhood_hops as 1 | 2,
      minEdgeWeight,
      minEdgeConfidence: minEdgeConf,
      hop1Budget: HOP1_BUDGET,
      hop2Budget: HOP2_BUDGET,
      edgeFetchBudget: EDGE_FETCH_BUDGET,
    }),
  );

  // Derive node ids directly from the edge rows to avoid repeating the neighborhood CTE in a second query.
  const nodeScore = new Map<string, number>();
  const nodeIdSet = new Set<string>(seedIds);
  for (const e of neighborhoodEdges) {
    nodeIdSet.add(e.src_id);
    nodeIdSet.add(e.dst_id);
    const s = e.weight * e.confidence;
    nodeScore.set(e.src_id, (nodeScore.get(e.src_id) ?? 0) + s);
    nodeScore.set(e.dst_id, (nodeScore.get(e.dst_id) ?? 0) + s);
  }

  // Budget node fetch work too; keep seeds, then highest-incident nodes.
  const NODE_FETCH_BUDGET = Math.min(800, Math.max(parsed.max_nodes * 4, parsed.max_nodes));
  let nodeIds = Array.from(nodeIdSet);
  if (nodeIds.length > NODE_FETCH_BUDGET) {
    const scored = nodeIds
      .filter((id) => !seedIds.includes(id))
      .map((id) => ({ id, s: nodeScore.get(id) ?? 0 }))
      .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
      .map((x) => x.id);
    nodeIds = seedIds.concat(scored.slice(0, Math.max(0, NODE_FETCH_BUDGET - seedIds.length)));
  }

  const wantSlots = parsed.include_slots || parsed.include_slots_preview;
  const needInternalSlots = true;
  const neighborhoodNodes = await timed("stage2_nodes", () =>
    recallAccess.stage2Nodes({
      scope,
      nodeIds,
      consumerAgentId,
      consumerTeamId,
      includeSlots: wantSlots || needInternalSlots,
    }),
  );

  const nodeMapAll = new Map<string, NodeRow>();
  for (const n of neighborhoodNodes) nodeMapAll.set(n.id, n);
  // Filter edges to only those with both endpoints present in our node fetch budget.
  let filteredSeeds = seeds;
  let filteredSeedIds = seedIds;
  let filteredNodeMapAll = nodeMapAll;
  let edgesAll: EdgeRow[] = neighborhoodEdges.filter((e) => nodeMapAll.has(e.src_id) && nodeMapAll.has(e.dst_id));
  let retrievalFilteredCount = 0;
  const retrievalFilteredByLayer = new Map<string, number>();
  const retrievalAllowedLayers =
    options?.unsafe_apply_layer_policy_to_retrieval === true ? allowedLayersForPolicy(layerPolicy) : null;
  if (retrievalAllowedLayers) {
    for (const node of nodeMapAll.values()) {
      const layer = resolveCompressionLayer(node);
      if (!layer || !retrievalAllowedLayers.has(layer)) {
        const key = layer ?? "unknown";
        retrievalFilteredCount += 1;
        retrievalFilteredByLayer.set(key, (retrievalFilteredByLayer.get(key) ?? 0) + 1);
      }
    }
    filteredNodeMapAll = new Map(
      Array.from(nodeMapAll.entries()).filter(([, node]) => {
        const layer = resolveCompressionLayer(node);
        return !!layer && retrievalAllowedLayers.has(layer);
      }),
    );
    filteredSeeds = seeds.filter((seed) => filteredNodeMapAll.has(seed.id));
    filteredSeedIds = filteredSeeds.map((seed) => seed.id);
    edgesAll = edgesAll.filter((e) => filteredNodeMapAll.has(e.src_id) && filteredNodeMapAll.has(e.dst_id));
  }

  // Scoring excludes draft topics (they shouldn't influence activation/ranking),
  // but draft topics may still appear in the returned subgraph for explainability.
  const draftTopicIds = new Set(Array.from(filteredNodeMapAll.values()).filter(isDraftTopic).map((n) => n.id));
  const notReadyIds = new Set(Array.from(filteredNodeMapAll.values()).filter((n) => n.embedding_status !== "ready").map((n) => n.id));
  const nodeMapForScoring = new Map(filteredNodeMapAll);
  for (const id of draftTopicIds) nodeMapForScoring.delete(id);
  for (const id of notReadyIds) nodeMapForScoring.delete(id);
  const edgesForScoring = edgesAll.filter((e) => !draftTopicIds.has(e.src_id) && !draftTopicIds.has(e.dst_id));
  const edgesForScoringReady = edgesForScoring.filter((e) => !notReadyIds.has(e.src_id) && !notReadyIds.has(e.dst_id));

  // Score via spreading activation.
  const rankedAllBase = spreadActivation(filteredSeeds, nodeMapForScoring, edgesForScoringReady, parsed.neighborhood_hops);
  const rankedAll = isActionRecallEndpoint(endpoint)
    ? prioritizeRankedForActionRecall(rankedAllBase, filteredNodeMapAll)
    : rankedAllBase;
  const ranked = rankedAll.slice(0, parsed.ranked_limit).map((r) => {
    const node = nodeMapAll.get(r.id);
    if (!node) return r;
    const uri = buildNodeUri(node.id, node.type);
    if (!uri) return r;
    return { ...r, uri };
  });

  // Build the returned subgraph under hard caps (contract):
  // - nodes: max_nodes (always)
  // - edges: max_edges (always; schema already caps to 100)
  // Explainability: draft topics never affect scoring, but we may swap a few in so edges aren't "mysteriously missing".
  const seedSet = new Set(filteredSeedIds);
  const coreIds: string[] = [];
  const prioritizedCoreIds = isActionRecallEndpoint(endpoint)
    ? Array.from(new Set(rankedAll.map((entry) => entry.id).concat(filteredSeedIds)))
    : filteredSeedIds;
  for (const id of prioritizedCoreIds) {
    if (coreIds.length >= parsed.max_nodes) break;
    const n = filteredNodeMapAll.get(id);
    if (!n || n.embedding_status !== "ready") continue;
    if (!coreIds.includes(id)) coreIds.push(id);
  }
  for (const r of rankedAll) {
    if (coreIds.length >= parsed.max_nodes) break;
    const n = filteredNodeMapAll.get(r.id);
    if (!n || n.embedding_status !== "ready") continue;
    if (!coreIds.includes(r.id)) coreIds.push(r.id);
  }

  // Score connected draft topics (only via strong edge types) and swap them in for the lowest-priority non-seed nodes.
  const draftScore = new Map<string, number>();
  const coreSet = new Set(coreIds);
  for (const e of edgesAll) {
    if (e.type !== "part_of" && e.type !== "derived_from") continue;
    const aIn = coreSet.has(e.src_id);
    const bIn = coreSet.has(e.dst_id);
    if (!aIn && !bIn) continue;
    const other = aIn ? e.dst_id : e.src_id;
    if (!draftTopicIds.has(other)) continue;
    draftScore.set(other, (draftScore.get(other) ?? 0) + e.weight * e.confidence);
  }

  const DRAFT_BUDGET = Math.min(10, Math.max(0, Math.floor(parsed.max_nodes / 5)));
  const removable: string[] = [];
  for (let i = coreIds.length - 1; i >= 0; i--) {
    const id = coreIds[i];
    if (!seedSet.has(id)) removable.push(id);
  }

  const draftCandidates = Array.from(draftScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => {
      if (coreSet.has(id)) return false;
      const n = filteredNodeMapAll.get(id);
      return !!n && n.embedding_status === "ready";
    });

  // Prefer appending draft topics if we have room; otherwise replace the lowest-priority non-seed nodes.
  let draftsToAdd: string[] = [];
  let outIdsOrdered: string[] = [];
  if (coreIds.length < parsed.max_nodes) {
    const room = parsed.max_nodes - coreIds.length;
    draftsToAdd = draftCandidates.slice(0, Math.min(DRAFT_BUDGET, room));
    outIdsOrdered = coreIds.concat(draftsToAdd);
  } else {
    const maxDrafts = Math.min(DRAFT_BUDGET, removable.length);
    draftsToAdd = draftCandidates.slice(0, maxDrafts);
    const toRemove = new Set(removable.slice(0, draftsToAdd.length));
    outIdsOrdered = coreIds.filter((id) => !toRemove.has(id)).concat(draftsToAdd);
  }
  const outIdSet = new Set(outIdsOrdered);

  const outNodeRows = outIdsOrdered.map((id) => filteredNodeMapAll.get(id)).filter(Boolean) as NodeRow[];
  const outEdgeRows = edgesAll
    .filter((e) => outIdSet.has(e.src_id) && outIdSet.has(e.dst_id))
    .sort((a, b) => (b.weight * b.confidence) - (a.weight * a.confidence))
    .slice(0, parsed.max_edges);
  const runtimeToolHints = buildRuntimeToolHintsFromAnchorNodes({
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    nodes: outNodeRows,
  });

  // Fetch rule defs for context building.
  const ruleIds = outNodeRows.filter((n) => n.type === "rule").map((n) => n.id);
  const ruleDefMap = new Map<string, any>();
  if (ruleIds.length) {
    const rr = await timed("rule_defs", () => recallAccess.ruleDefs(scope, ruleIds));
    for (const row of rr) ruleDefMap.set(row.rule_node_id, row);
  }

  const { text: context_text, items: context_items, citations, compaction: context_compaction, selection_stats } = buildContext(
    rankedAll,
    filteredNodeMapAll,
    ruleDefMap,
    {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      context_token_budget: parsed.context_token_budget,
      context_char_budget: parsed.context_char_budget,
      context_compaction_profile: parsed.context_compaction_profile,
      layer_policy: layerPolicy,
      internal_allow_l4_preview:
        options?.internal_allow_l4_selection === true && (endpoint === "planning_context" || endpoint === "context_assemble"),
    },
  );
  const retrievalFilteredByLayerOut = Object.fromEntries(
    Array.from(retrievalFilteredByLayer.entries()).sort((a, b) => a[0].localeCompare(b[0])),
  );
  const selectionStatsOut = {
    ...selection_stats,
    retrieval_filtered_by_layer_policy_count: retrievalFilteredCount,
    retrieval_filtered_by_layer: retrievalFilteredByLayerOut,
  };
  const actionRecallPacket = buildActionRecallPacket({
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    nodes: outNodeRows,
    runtimeToolHints: runtimeToolHints as unknown as Array<Record<string, unknown>>,
    contextItems: context_items as unknown as Array<Record<string, unknown>>,
  });

  // DTO serialization (B): stable, minimal by default.
  const outNodes: NodeDTO[] = outNodeRows.map((n) => {
    const dto: NodeDTO = {
      id: n.id,
      type: n.type,
      title: n.title,
      text_summary: n.text_summary,
    };
    const uri = buildNodeUri(n.id, n.type);
    if (uri) dto.uri = uri;

    if (n.type === "topic") {
      dto.topic_state = n.topic_state;
      dto.member_count = n.member_count;
    }

    if (parsed.include_slots) {
      dto.slots = n.slots ?? null;
    } else if (parsed.include_slots_preview) {
      dto.slots_preview = pickSlotsPreview(n.slots, parsed.slots_preview_keys);
    }

    if (parsed.include_meta) {
      dto.raw_ref = n.raw_ref;
      dto.evidence_ref = n.evidence_ref;
      dto.embedding_status = n.embedding_status;
      dto.embedding_model = n.embedding_model;
      dto.memory_lane = n.memory_lane;
      dto.producer_agent_id = n.producer_agent_id;
      dto.owner_agent_id = n.owner_agent_id;
      dto.owner_team_id = n.owner_team_id;
      dto.created_at = n.created_at;
      dto.updated_at = n.updated_at;
      dto.last_activated = n.last_activated;
      dto.salience = n.salience;
      dto.importance = n.importance;
      dto.confidence = n.confidence;
      dto.commit_id = n.commit_id;
    }

    return dto;
  });

  const outEdges: EdgeDTO[] = outEdgeRows.map((e) => {
    const dto: EdgeDTO = {
      id: e.id,
      uri: buildEdgeUri(e.id),
      from_id: e.src_id,
      to_id: e.dst_id,
      type: e.type,
      weight: e.weight,
    };
    if (parsed.include_meta) {
      dto.commit_id = e.commit_id;
      dto.commit_uri = buildCommitUri(e.commit_id);
    }
    return dto;
  });

  // Debug-only: include a *bounded* embedding preview for seed nodes.
  // Hard constraints:
  // - max 5 nodes
  // - preview first 16 dims only
  // - include sha256 of full vector string for integrity checks
  let embedding_debug: any = undefined;
  if (parsed.return_debug && parsed.include_embeddings) {
    if (!recallAccess.capabilities.debug_embeddings) {
      const spec = capabilityContract("debug_embeddings");
      badRequest(
        "debug_embeddings_backend_unsupported",
        "include_embeddings is not supported by current backend capability (debug_embeddings=false)",
        {
          capability: "debug_embeddings",
          failure_mode: spec.failure_mode,
          degraded_mode: "feature_disabled",
          fallback_applied: false,
        },
      );
    }
    const MAX_EMBED_NODES = 5;
    const PREVIEW_DIMS = 16;
    const ids = seedIds.slice(0, MAX_EMBED_NODES);
    const er = await timed("debug_embeddings", () => recallAccess.debugEmbeddings(scope, ids));
    embedding_debug = er.map((row) => {
      let parsedVec: { dims: number; preview: number[] };
      try {
        parsedVec = parseVectorText(row.embedding_text, PREVIEW_DIMS);
      } catch (e: any) {
        badRequest("debug_embeddings_parse_error", "failed to parse embedding vector text", {
          node_id: row.id,
          message: String(e?.message ?? e),
        });
      }
      return {
        node_id: row.id,
        dims: parsedVec.dims,
        sha256: sha256Hex(row.embedding_text),
        preview: parsedVec.preview,
      };
    });

    const MAX_DEBUG_BYTES = 64 * 1024;
    const debugBytes = Buffer.byteLength(JSON.stringify(embedding_debug), "utf8");
    if (debugBytes > MAX_DEBUG_BYTES) {
      badRequest("debug_embeddings_too_large", `debug embeddings exceed max_debug_bytes (${MAX_DEBUG_BYTES})`);
    }
  }

  if (recallAccess.capabilities.audit_insert) {
    await timed("audit_insert", async () => {
      try {
        await recallAccess.insertRecallAudit({
          scope,
          endpoint,
          consumerAgentId,
          consumerTeamId,
          querySha256: sha256Hex(toVectorLiteral(parsed.query_embedding)),
          seedCount: seeds.length,
          nodeCount: outNodes.length,
          edgeCount: outEdges.length,
        });
      } catch {
        // Best-effort audit; do not block recall path.
      }
    });
  }

  return {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    seeds: outSeeds,
    subgraph: { nodes: outNodes, edges: outEdges },
    ranked,
      context: {
        text: context_text,
        items: context_items,
        citations,
        selection_policy: layerPolicy,
        selection_stats: selectionStatsOut,
      },
      runtime_tool_hints: runtimeToolHints,
      action_recall_packet: actionRecallPacket,
    ...(parsed.return_debug
      ? {
          debug: {
            neighborhood_counts: { nodes: nodeMapAll.size, edges: edgesAll.length },
            embeddings: embedding_debug,
            context_compaction,
            stage1: {
              mode: stage1Mode,
              ann_seed_count: stage1AnnSeedCount,
              final_seed_count: seeds.length,
              exact_fallback_enabled: stage1ExactFallbackOnEmpty,
              exact_fallback_attempted: stage1ExactFallbackAttempted,
            },
          },
        }
      : {}),
  };
}

export async function memoryRecall(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  auth: RecallAuth,
) {
  const parsed = MemoryRecallRequest.parse(body);
  return memoryRecallParsed(client, parsed, defaultScope, defaultTenantId, auth);
}
