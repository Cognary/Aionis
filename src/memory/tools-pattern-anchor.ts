import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import type { EmbeddingProvider } from "../embeddings/types.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { LiteFindNodeRow, LiteWriteStore } from "../store/lite-write-store.js";
import { createPostgresWriteStoreAccess, type WriteStoreAccess } from "../store/write-access.js";
import { sha256Hex } from "../util/crypto.js";
import { ExecutionNativeV1Schema, MemoryAnchorV1Schema, type MemoryAnchorV1 } from "./schemas.js";
import { applyMemoryWrite, prepareMemoryWrite } from "./write.js";
import {
  buildTaskSignature,
  extractErrorFamily,
  extractErrorSignature,
  extractTaskCue,
  extractTaskFamily,
} from "./pattern-trust-shaping.js";

const STABLE_PATTERN_MIN_DISTINCT_RUNS = 3;
const CONTESTED_REVALIDATION_MIN_FRESH_RUNS = 2;
const MAX_OBSERVED_RUN_IDS = 16;

type DecisionAnchorSource = {
  id: string;
  run_id: string | null;
  selected_tool: string | null;
  candidates_json: unknown[];
  context_sha256: string;
  policy_sha256: string;
  created_at: string;
  commit_id: string | null;
};

type WriteToolsDecisionPatternAnchorArgs = {
  tenant_id: string;
  scope: string;
  actor: string;
  input_text?: string | null;
  input_sha256: string;
  note?: string | null;
  context: unknown;
  selected_tool: string;
  candidates: string[];
  source_rule_ids: string[];
  decision: DecisionAnchorSource;
  feedback_commit_id: string;
  feedback_outcome: "positive" | "negative";
};

type WriteToolsDecisionPatternAnchorOptions = {
  defaultScope: string;
  defaultTenantId: string;
  maxTextLen: number;
  piiRedaction: boolean;
  allowCrossScopeEdges?: boolean;
  embedder: EmbeddingProvider | null;
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
  writeAccess?: WriteStoreAccess | null;
  liteWriteStore?: Pick<LiteWriteStore, "findNodes" | "updateNodeAnchorState"> | null;
};

type PatternAnchorWriteResult = {
  node_id: string;
  client_id: string;
  pattern_signature: string;
  anchor: MemoryAnchorV1;
};

type ExistingPatternAnchorNode = {
  id: string;
  title: string | null;
  text_summary: string | null;
  slots: Record<string, unknown>;
  salience: number;
  importance: number;
  confidence: number;
};

type PatternCredibilityState = "candidate" | "trusted" | "contested";
type PatternTransitionKind = "candidate_observed" | "promoted_to_trusted" | "counter_evidence_opened" | "revalidated_to_trusted";

function buildPatternMaintenance(args: {
  credibilityState: PatternCredibilityState;
  distinctRunCount: number;
  requiredDistinctRuns: number;
  counterEvidenceOpen: boolean;
  timestamp: string;
}) {
  const maintenanceState =
    args.credibilityState === "contested"
      ? "review"
      : args.credibilityState === "trusted"
        ? "retain"
        : "observe";
  const offlinePriority =
    args.credibilityState === "contested"
      ? "review_counter_evidence"
      : args.credibilityState === "trusted"
        ? "retain_trusted"
        : args.distinctRunCount >= Math.max(0, args.requiredDistinctRuns - 1)
          ? "promote_candidate"
          : "none";
  return {
    model: "lazy_online_v1" as const,
    maintenance_state: maintenanceState,
    offline_priority: offlinePriority,
    lazy_update_fields: [
      "usage_count",
      "last_used_at",
      "reuse_success_count",
      "reuse_failure_count",
    ],
    last_maintenance_at: args.timestamp,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function words(value: string, limit = 6): string[] {
  return value
    .split(/[\s,.;:()[\]{}"']+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildPatternSignature(args: {
  selected_tool: string;
  candidates: string[];
  context_sha256: string;
  policy_sha256: string;
  source_rule_ids: string[];
}): string {
  return sha256Hex(
    stableStringify({
      schema: "tools_pattern_v1",
      selected_tool: args.selected_tool,
      candidates: args.candidates,
      context_sha256: args.context_sha256,
      policy_sha256: args.policy_sha256,
      source_rule_ids: args.source_rule_ids,
    }),
  );
}

function buildPatternSummary(args: {
  taskCue: string | null;
  selectedTool: string;
  patternState: "provisional" | "stable";
  credibilityState: PatternCredibilityState;
  feedbackOutcome: "positive" | "negative";
  ruleBacked: boolean;
}): string {
  const prefix =
    args.credibilityState === "trusted"
      ? "Stable pattern"
      : args.credibilityState === "contested"
        ? "Contested pattern"
        : "Candidate pattern";
  const body = args.taskCue
    ? `for ${args.taskCue}, prefer ${args.selectedTool}`
    : `prefer ${args.selectedTool}`;
  const evidence =
    args.credibilityState === "contested"
      ? "counter-evidence observed; requires fresh successful validation before trusted reuse."
      : args.patternState === "stable"
        ? args.ruleBacked
          ? "after repeated successful rule-backed tool selections."
          : "after repeated successful tool selections."
        : args.ruleBacked
          ? "after one successful rule-backed tool selection."
          : "after one successful tool selection.";
  return truncate(`${prefix}: ${body} ${evidence}`, 400);
}

function buildPatternNodeTrustProfile(credibilityState: PatternCredibilityState): {
  salience: number;
  importance: number;
  confidence: number;
} {
  if (credibilityState === "trusted") {
    return {
      salience: 0.82,
      importance: 0.9,
      confidence: 0.92,
    };
  }
  if (credibilityState === "contested") {
    return {
      salience: 0.63,
      importance: 0.7,
      confidence: 0.41,
    };
  }
  return {
    salience: 0.68,
    importance: 0.74,
    confidence: 0.58,
  };
}

function parseExistingAnchor(node: ExistingPatternAnchorNode): MemoryAnchorV1 {
  const parsed = MemoryAnchorV1Schema.safeParse(node.slots?.anchor_v1);
  if (!parsed.success) {
    throw new Error(`invalid_existing_pattern_anchor:${node.id}`);
  }
  return parsed.data;
}

function observedRunIdsFromAnchor(anchor: MemoryAnchorV1): string[] {
  const promotion = asRecord(anchor.promotion);
  const observed = Array.isArray(promotion?.observed_run_ids)
    ? (promotion.observed_run_ids as Array<string | null | undefined>)
    : [];
  return uniqueStrings(observed, MAX_OBSERVED_RUN_IDS);
}

function trustHardeningRecord(anchor: MemoryAnchorV1 | null | undefined): Record<string, unknown> | null {
  return asRecord(anchor?.trust_hardening);
}

function observedFamiliesFromHardening(record: Record<string, unknown> | null, key: "observed_task_families" | "observed_error_families"): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? uniqueStrings((value as Array<string | null | undefined>).filter((entry): entry is string => typeof entry === "string"), 16)
    : [];
}

function observedPostContestRunIds(record: Record<string, unknown> | null): string[] {
  const value = record?.post_contest_observed_run_ids;
  return Array.isArray(value)
    ? uniqueStrings((value as Array<string | null | undefined>).filter((entry): entry is string => typeof entry === "string"), MAX_OBSERVED_RUN_IDS)
    : [];
}

function buildPatternAnchor(args: {
  taskCue: string | null;
  taskFamily: string | null;
  errorSignature: string | null;
  errorFamily: string | null;
  patternSignature: string;
  selectedTool: string;
  candidates: string[];
  sourceRuleIds: string[];
  decision: DecisionAnchorSource;
  feedbackCommitId: string;
  feedbackOutcome: "positive" | "negative";
  existing?: MemoryAnchorV1 | null;
}): MemoryAnchorV1 {
  const existing = args.existing ?? null;
  const existingHardening = trustHardeningRecord(existing);
  const existingCredibilityState = (existing?.credibility_state ?? existing?.promotion?.credibility_state ?? "candidate") as PatternCredibilityState;
  const existingObservedRunIds = existing ? observedRunIdsFromAnchor(existing) : [];
  const nextObservedRunIds = args.feedbackOutcome === "positive"
    ? uniqueStrings([...existingObservedRunIds, args.decision.run_id], MAX_OBSERVED_RUN_IDS)
    : existingObservedRunIds;
  const distinctRunCount = nextObservedRunIds.length;
  const requiredDistinctRuns = Math.max(
    STABLE_PATTERN_MIN_DISTINCT_RUNS,
    Number(existing?.promotion?.required_distinct_runs ?? STABLE_PATTERN_MIN_DISTINCT_RUNS),
  );
  const hasNewDistinctRun = args.feedbackOutcome === "positive" && (
    args.decision.run_id
      ? !existingObservedRunIds.includes(args.decision.run_id)
      : !existing
  );
  const reuseSuccessCount = Math.max(
    existing?.metrics?.reuse_success_count ?? 0,
    0,
  ) + (hasNewDistinctRun ? 1 : 0);
  const existingCounterEvidenceCount = Math.max(Number(existing?.promotion?.counter_evidence_count ?? 0), 0);
  const nextCounterEvidenceCount = existingCounterEvidenceCount + (args.feedbackOutcome === "negative" ? 1 : 0);
  const existingObservedTaskFamilies = observedFamiliesFromHardening(existingHardening, "observed_task_families");
  const existingObservedErrorFamilies = observedFamiliesFromHardening(existingHardening, "observed_error_families");
  const observedTaskFamilies = uniqueStrings([...existingObservedTaskFamilies, args.taskFamily], 16);
  const observedErrorFamilies = uniqueStrings([...existingObservedErrorFamilies, args.errorFamily], 16);
  const existingPostContestObservedRunIds = observedPostContestRunIds(existingHardening);
  const postContestObservedRunIds = args.feedbackOutcome === "negative"
    ? []
    : existingCounterEvidenceCount > 0
      ? hasNewDistinctRun
        ? uniqueStrings([...existingPostContestObservedRunIds, args.decision.run_id], MAX_OBSERVED_RUN_IDS)
        : existingPostContestObservedRunIds
      : existingPostContestObservedRunIds;
  const revalidationFloorSatisfied =
    nextCounterEvidenceCount === 0 || postContestObservedRunIds.length >= CONTESTED_REVALIDATION_MIN_FRESH_RUNS;
  const counterEvidenceOpen = args.feedbackOutcome === "negative"
    ? true
    : distinctRunCount >= (requiredDistinctRuns + nextCounterEvidenceCount) && revalidationFloorSatisfied
      ? false
      : Boolean(existing?.promotion?.counter_evidence_open ?? false);
  const reuseFailureCount = Math.max(existing?.metrics?.reuse_failure_count ?? 0, 0) + (args.feedbackOutcome === "negative" ? 1 : 0);
  const patternState: "provisional" | "stable" =
    !counterEvidenceOpen && distinctRunCount >= (requiredDistinctRuns + nextCounterEvidenceCount)
      ? "stable"
      : "provisional";
  const credibilityState: PatternCredibilityState =
    counterEvidenceOpen
      ? "contested"
      : patternState === "stable"
        ? "trusted"
        : "candidate";
  const lastTransition: PatternTransitionKind =
    credibilityState === "contested"
      ? "counter_evidence_opened"
      : credibilityState === "trusted"
        ? existingCredibilityState === "contested"
          ? "revalidated_to_trusted"
          : existingCredibilityState === "trusted"
            ? (existing?.promotion?.last_transition as PatternTransitionKind | null) ?? "promoted_to_trusted"
            : "promoted_to_trusted"
        : "candidate_observed";
  const taskSignature = buildTaskSignature({
    taskCue: args.taskCue,
    selectedTool: args.selectedTool,
    patternSignature: args.patternSignature,
  });
  const summary = buildPatternSummary({
    taskCue: args.taskCue,
    selectedTool: args.selectedTool,
    patternState,
    credibilityState,
    feedbackOutcome: args.feedbackOutcome,
    ruleBacked: args.sourceRuleIds.length > 0,
  });
  const keywordTerms = uniqueStrings([
    args.selectedTool,
    args.taskCue,
    args.errorSignature,
    ...args.candidates,
    ...args.sourceRuleIds,
  ], 16);
  const maintenance = buildPatternMaintenance({
    credibilityState,
    distinctRunCount,
    requiredDistinctRuns,
    counterEvidenceOpen,
    timestamp: args.decision.created_at,
  });
  const promotionGateSatisfied = distinctRunCount >= requiredDistinctRuns;
  return MemoryAnchorV1Schema.parse({
    anchor_kind: "pattern",
    anchor_level: "L3",
    pattern_state: patternState,
    credibility_state: credibilityState,
    task_signature: taskSignature,
    task_class: "tools_select_pattern",
    task_family: args.taskFamily ?? undefined,
    error_signature: args.errorSignature ?? undefined,
    error_family: args.errorFamily ?? undefined,
    workflow_signature: args.patternSignature,
    summary,
    tool_set: args.candidates,
    selected_tool: args.selectedTool,
    key_steps: [
      "evaluate active tool rules",
      `select ${args.selectedTool}`,
      args.feedbackOutcome === "negative" ? "record negative execution feedback" : "record positive execution feedback",
    ],
    outcome: {
      status: args.feedbackOutcome === "negative" ? "mixed" : "success",
      result_class: args.feedbackOutcome === "negative"
        ? "tool_selection_pattern_counter_evidence"
        : patternState === "stable"
          ? "tool_selection_pattern_stable"
          : "tool_selection_pattern_candidate",
      success_score: args.feedbackOutcome === "negative"
        ? 0.34
        : patternState === "stable"
          ? 0.92
          : 0.68,
    },
    source: {
      source_kind: "tool_decision",
      node_id: null,
      decision_id: args.decision.id,
      run_id: args.decision.run_id,
      step_id: null,
      playbook_id: null,
      commit_id: args.feedbackCommitId,
    },
    payload_refs: {
      node_ids: uniqueStrings([...(existing?.payload_refs.node_ids ?? []), ...args.sourceRuleIds], 256),
      decision_ids: uniqueStrings([...(existing?.payload_refs.decision_ids ?? []), args.decision.id], 256),
      run_ids: uniqueStrings([...(existing?.payload_refs.run_ids ?? []), args.decision.run_id], 256),
      step_ids: existing?.payload_refs.step_ids ?? [],
      commit_ids: uniqueStrings([...(existing?.payload_refs.commit_ids ?? []), args.feedbackCommitId, args.decision.commit_id], 256),
    },
    rehydration: {
      default_mode: "partial",
      payload_cost_hint: "medium",
      recommended_when: [
        "need_original_decision_context",
        "need_linked_rule_attribution",
        "pattern_summary_is_not_enough",
      ],
    },
    recall_features: {
      error_tags: args.errorSignature ? [args.errorSignature] : [],
      tool_tags: uniqueStrings([args.selectedTool, ...args.candidates], 16),
      outcome_tags: uniqueStrings([
        args.feedbackOutcome === "negative" ? "negative_feedback" : "positive_feedback",
        args.sourceRuleIds.length > 0 ? "rule_backed_selection" : "feedback_derived_selection",
        counterEvidenceOpen ? "counter_evidence_open" : "counter_evidence_clear",
        `credibility_${credibilityState}`,
        patternState === "stable" ? "stable_pattern" : "provisional_pattern",
      ], 8),
      keywords: keywordTerms,
    },
    metrics: {
      usage_count: existing?.metrics?.usage_count ?? 0,
      reuse_success_count: reuseSuccessCount,
      reuse_failure_count: reuseFailureCount,
      distinct_run_count: distinctRunCount,
      last_used_at: args.decision.created_at,
    },
    maintenance,
    promotion: {
      required_distinct_runs: requiredDistinctRuns,
      distinct_run_count: distinctRunCount,
      observed_run_ids: nextObservedRunIds,
      counter_evidence_count: nextCounterEvidenceCount,
      counter_evidence_open: counterEvidenceOpen,
      credibility_state: credibilityState,
      previous_credibility_state: existing ? existingCredibilityState : null,
      last_transition: lastTransition,
      last_transition_at: args.decision.created_at,
      stable_at: patternState === "stable"
        ? existing?.pattern_state === "stable"
          ? existing?.promotion?.stable_at ?? args.decision.created_at
          : args.decision.created_at
        : null,
      last_validated_at: args.feedbackOutcome === "positive"
        ? args.decision.created_at
        : existing?.promotion?.last_validated_at ?? null,
      last_counter_evidence_at: args.feedbackOutcome === "negative"
        ? args.decision.created_at
        : existing?.promotion?.last_counter_evidence_at ?? null,
    },
    trust_hardening: {
      task_family: args.taskFamily,
      error_family: args.errorFamily,
      observed_task_families: observedTaskFamilies,
      observed_error_families: observedErrorFamilies,
      distinct_task_family_count: observedTaskFamilies.length,
      distinct_error_family_count: observedErrorFamilies.length,
      post_contest_observed_run_ids: postContestObservedRunIds,
      post_contest_distinct_run_count: postContestObservedRunIds.length,
      promotion_gate_kind: "current_distinct_runs_v1",
      promotion_gate_satisfied: promotionGateSatisfied,
      revalidation_floor_kind: "post_contest_two_fresh_runs_v1",
      revalidation_floor_satisfied: revalidationFloorSatisfied,
      task_affinity_weighting_enabled: false,
    },
    schema_version: "anchor_v1",
  });
}

function buildPatternAnchorSlots(args: {
  anchor: MemoryAnchorV1;
  patternSignature: string;
  selectedTool: string;
  candidates: string[];
  sourceRuleIds: string[];
  feedbackOutcome: "positive" | "negative";
}): Record<string, unknown> {
  const executionNative = ExecutionNativeV1Schema.parse({
    schema_version: "execution_native_v1",
    execution_kind: "pattern_anchor",
    summary_kind: "pattern_anchor",
    compression_layer: "L3",
    task_signature: args.anchor.task_signature,
    ...(args.anchor.task_family ? { task_family: args.anchor.task_family } : {}),
    ...(args.anchor.error_signature ? { error_signature: args.anchor.error_signature } : {}),
    ...(args.anchor.error_family ? { error_family: args.anchor.error_family } : {}),
    ...(args.anchor.workflow_signature ? { workflow_signature: args.anchor.workflow_signature } : {}),
    anchor_kind: args.anchor.anchor_kind,
    anchor_level: args.anchor.anchor_level,
    ...(args.anchor.pattern_state ? { pattern_state: args.anchor.pattern_state } : {}),
    ...(args.anchor.credibility_state ? { credibility_state: args.anchor.credibility_state } : {}),
    ...(args.anchor.selected_tool !== undefined ? { selected_tool: args.anchor.selected_tool } : {}),
    ...(args.anchor.promotion ? { promotion: args.anchor.promotion } : {}),
    ...(args.anchor.trust_hardening ? { trust_hardening: args.anchor.trust_hardening } : {}),
    ...(args.anchor.maintenance ? { maintenance: args.anchor.maintenance } : {}),
  });
  return {
    summary_kind: "pattern_anchor",
    compression_layer: "L3",
    anchor_v1: args.anchor,
    execution_native_v1: executionNative,
    decision_pattern_signature: args.patternSignature,
    pattern_state: args.anchor.pattern_state ?? "provisional",
    credibility_state: args.anchor.credibility_state ?? "candidate",
    selected_tool: args.selectedTool,
    candidates: args.candidates,
    source_rule_ids: args.sourceRuleIds,
    outcome: args.feedbackOutcome,
    anchor_origin: "tools_feedback",
  };
}

async function findExistingPatternAnchorLite(
  liteWriteStore: Pick<LiteWriteStore, "findNodes">,
  scope: string,
  clientId: string,
): Promise<ExistingPatternAnchorNode | null> {
  const { rows } = await liteWriteStore.findNodes({
    scope,
    type: "concept",
    clientId,
    limit: 1,
    offset: 0,
  });
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    text_summary: row.text_summary,
    slots: row.slots,
    salience: row.salience,
    importance: row.importance,
    confidence: row.confidence,
  };
}

async function findExistingPatternAnchorPg(
  client: pg.PoolClient,
  scope: string,
  clientId: string,
): Promise<ExistingPatternAnchorNode | null> {
  const result = await client.query<{
    id: string;
    title: string | null;
    text_summary: string | null;
    slots: Record<string, unknown>;
    salience: number;
    importance: number;
    confidence: number;
  }>(
    `
    SELECT
      id::text AS id,
      title,
      text_summary,
      slots,
      salience,
      importance,
      confidence
    FROM memory_nodes
    WHERE scope = $1
      AND type = 'concept'
      AND client_id = $2
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [scope, clientId],
  );
  return result.rows[0] ?? null;
}

async function updateExistingPatternAnchorLite(
  liteWriteStore: Pick<LiteWriteStore, "updateNodeAnchorState">,
  args: {
    scope: string;
    id: string;
    slots: Record<string, unknown>;
    textSummary: string;
    salience: number;
    importance: number;
    confidence: number;
    commitId: string;
  },
): Promise<void> {
  await liteWriteStore.updateNodeAnchorState({
    scope: args.scope,
    id: args.id,
    slots: args.slots,
    textSummary: args.textSummary,
    salience: args.salience,
    importance: args.importance,
    confidence: args.confidence,
    commitId: args.commitId,
  });
}

async function updateExistingPatternAnchorPg(
  client: pg.PoolClient,
  args: {
    scope: string;
    id: string;
    slots: Record<string, unknown>;
    textSummary: string;
    salience: number;
    importance: number;
    confidence: number;
    commitId: string;
  },
): Promise<void> {
  await client.query(
    `
    UPDATE memory_nodes
    SET slots = $1::jsonb,
        text_summary = $2,
        salience = $3,
        importance = $4,
        confidence = $5,
        updated_at = now(),
        commit_id = COALESCE($6, commit_id)
    WHERE scope = $7
      AND id = $8
    `,
    [
      JSON.stringify(args.slots),
      args.textSummary,
      args.salience,
      args.importance,
      args.confidence,
      args.commitId,
      args.scope,
      args.id,
    ],
  );
}

export async function writeToolsDecisionPatternAnchor(
  client: pg.PoolClient | null,
  args: WriteToolsDecisionPatternAnchorArgs,
  opts: WriteToolsDecisionPatternAnchorOptions,
): Promise<PatternAnchorWriteResult | null> {
  const writeAccess = opts.writeAccess ?? (client ? createPostgresWriteStoreAccess(client) : null);
  if (!writeAccess) {
    throw new Error("write_access_required_for_tools_pattern_anchor");
  }

  const taskCue = extractTaskCue(args.context, args.input_text ?? null, args.note ?? null);
  const taskFamily = extractTaskFamily(args.context, taskCue);
  const errorSignature = extractErrorSignature(args.context);
  const errorFamily = extractErrorFamily(args.context, errorSignature);
  const patternSignature = buildPatternSignature({
    selected_tool: args.selected_tool,
    candidates: args.candidates,
    context_sha256: args.decision.context_sha256,
    policy_sha256: args.decision.policy_sha256,
    source_rule_ids: args.source_rule_ids,
  });
  const clientId = `tools-pattern:${patternSignature}`;
  const title = truncate(
    taskCue ? `Pattern: prefer ${args.selected_tool} for ${taskCue}` : `Pattern: prefer ${args.selected_tool}`,
    180,
  );

  const existingNode = opts.liteWriteStore
    ? await findExistingPatternAnchorLite(opts.liteWriteStore, args.scope, clientId)
    : client
      ? await findExistingPatternAnchorPg(client, args.scope, clientId)
      : null;
  if (!existingNode && args.feedback_outcome === "negative") {
    return null;
  }

  const existingAnchor = existingNode ? parseExistingAnchor(existingNode) : null;
  const anchor = buildPatternAnchor({
    taskCue,
    taskFamily,
    errorSignature,
    errorFamily,
    patternSignature,
    selectedTool: args.selected_tool,
    candidates: args.candidates,
    sourceRuleIds: args.source_rule_ids,
    decision: args.decision,
    feedbackCommitId: args.feedback_commit_id,
    feedbackOutcome: args.feedback_outcome,
    existing: existingAnchor,
  });
  const summary = anchor.summary;
  const trustProfile = buildPatternNodeTrustProfile((anchor.credibility_state ?? "candidate") as PatternCredibilityState);
  const slots = buildPatternAnchorSlots({
    anchor,
    patternSignature,
    selectedTool: args.selected_tool,
    candidates: args.candidates,
    sourceRuleIds: args.source_rule_ids,
    feedbackOutcome: args.feedback_outcome,
  });

  if (existingNode) {
    if (opts.liteWriteStore) {
      await updateExistingPatternAnchorLite(opts.liteWriteStore, {
        scope: args.scope,
        id: existingNode.id,
        slots,
        textSummary: summary,
        salience: trustProfile.salience,
        importance: trustProfile.importance,
        confidence: trustProfile.confidence,
        commitId: args.feedback_commit_id,
      });
    } else if (client) {
      await updateExistingPatternAnchorPg(client, {
        scope: args.scope,
        id: existingNode.id,
        slots,
        textSummary: summary,
        salience: trustProfile.salience,
        importance: trustProfile.importance,
        confidence: trustProfile.confidence,
        commitId: args.feedback_commit_id,
      });
    }
    return {
      node_id: existingNode.id,
      client_id: clientId,
      pattern_signature: patternSignature,
      anchor,
    };
  }

  const prepared = await prepareMemoryWrite(
    {
      tenant_id: args.tenant_id,
      scope: args.scope,
      actor: args.actor,
      input_text: args.input_text ?? undefined,
      input_sha256: args.input_sha256,
      auto_embed: true,
      memory_lane: "shared",
      nodes: [
        {
          client_id: clientId,
          type: "concept",
          title,
          text_summary: summary,
          slots,
          salience: trustProfile.salience,
          importance: trustProfile.importance,
          confidence: trustProfile.confidence,
        },
      ],
      edges: [],
    },
    opts.defaultScope,
    opts.defaultTenantId,
    {
      maxTextLen: opts.maxTextLen,
      piiRedaction: opts.piiRedaction,
      allowCrossScopeEdges: opts.allowCrossScopeEdges ?? false,
    },
    opts.embedder,
  );
  if (opts.embedder) {
    const planned = prepared.nodes.filter((node) => !node.embedding && typeof node.embed_text === "string" && node.embed_text.trim());
    if (planned.length > 0) {
      const vectors = await opts.embedder.embed(planned.map((node) => String(node.embed_text)));
      for (let i = 0; i < planned.length; i += 1) {
        planned[i].embedding = vectors[i] ?? planned[i].embedding;
        planned[i].embedding_model = opts.embedder.name;
      }
    }
  }
  const out = await applyMemoryWrite(client ?? ({} as pg.PoolClient), prepared, {
    maxTextLen: opts.maxTextLen,
    piiRedaction: opts.piiRedaction,
    allowCrossScopeEdges: opts.allowCrossScopeEdges ?? false,
    shadowDualWriteEnabled: false,
    shadowDualWriteStrict: false,
    associativeLinkOrigin: "memory_write",
    write_access: writeAccess,
  });
  if (opts.embeddedRuntime) {
    await opts.embeddedRuntime.applyWrite(prepared as never, out as never);
  }
  return {
    node_id: out.nodes[0]!.id,
    client_id: clientId,
    pattern_signature: patternSignature,
    anchor,
  };
}
