import { randomUUID } from "node:crypto";
import type pg from "pg";
import { HttpError } from "../util/http.js";
import { replayPlaybookRun } from "./replay.js";
import {
  AutomationGraph,
  AutomationCreateRequest,
  AutomationTelemetryRequest,
  AutomationValidateRequest,
  AutomationGetRequest,
  AutomationShadowReportRequest,
  AutomationShadowReviewRequest,
  AutomationShadowValidateRequest,
  AutomationShadowValidateDispatchRequest,
  AutomationListRequest,
  AutomationAssignReviewerRequest,
  AutomationPromoteRequest,
  AutomationRunCancelRequest,
  AutomationCompensationPolicyMatrixRequest,
  AutomationRunGetRequest,
  AutomationRunListRequest,
  AutomationRunAssignReviewerRequest,
  AutomationRunApproveRepairRequest,
  AutomationRunCompensationAssignRequest,
  AutomationRunCompensationRecordActionRequest,
  AutomationRunCompensationRetryRequest,
  AutomationRunRejectRepairRequest,
  AutomationRunRequest,
  AutomationRunResumeRequest,
  type AutomationCreateInput,
  type AutomationTelemetryInput,
  type AutomationValidateInput,
  type AutomationGetInput,
  type AutomationShadowReportInput,
  type AutomationShadowReviewInput,
  type AutomationShadowValidateInput,
  type AutomationShadowValidateDispatchInput,
  type AutomationListInput,
  type AutomationAssignReviewerInput,
  type AutomationPromoteInput,
  type AutomationCompensationPolicyMatrixInput,
  type AutomationGraphInput,
  type AutomationGraphNodeInput,
  type AutomationRunCancelInput,
  type AutomationRunGetInput,
  type AutomationRunListInput,
  type AutomationRunAssignReviewerInput,
  type AutomationRunApproveRepairInput,
  type AutomationRunCompensationAssignInput,
  type AutomationRunCompensationRecordActionInput,
  type AutomationRunCompensationRetryInput,
  type AutomationRunRejectRepairInput,
  type AutomationRunInput,
  type AutomationRunResumeInput,
} from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";

export type AutomationReadOptions = {
  defaultScope: string;
  defaultTenantId: string;
};

export type AutomationWriteOptions = AutomationReadOptions;
export type AutomationExecutionOptions = AutomationReadOptions & {
  replayRunOptions: Parameters<typeof replayPlaybookRun>[2];
  testHook?: (input: {
    action: string;
    stage: string;
    run_id?: string | null;
    node_id?: string | null;
  }) => void | Promise<void>;
};

export type AutomationValidationIssue = {
  code: string;
  message: string;
  node_id?: string;
  edge?: {
    from: string;
    to: string;
    type?: string;
  };
};

export type AutomationValidationResult = {
  node_ids: string[];
  start_node_ids: string[];
  topological_order: string[];
  issues: AutomationValidationIssue[];
};

type AutomationExecutionMode = "default" | "shadow";

type AutomationDefRow = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  name: string;
  status: string;
  latest_version: number;
  input_contract_json: unknown;
  output_contract_json: unknown;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type AutomationListRow = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  name: string;
  status: string;
  latest_version: number;
  metadata_json: unknown;
  updated_at: string;
  version_status: string;
  version_metadata_json: unknown;
  version_created_at: string;
  compile_summary_json: unknown;
};

type AutomationShadowReportVersionRow = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  version: number;
  status: string;
  graph_json: unknown;
  compile_summary_json: unknown;
  metadata_json: unknown;
  created_at: string;
};

type AutomationVersionRow = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  version: number;
  status: string;
  graph_json: unknown;
  compile_summary_json: unknown;
  metadata_json: unknown;
  created_at: string;
};

type AutomationGetRow = AutomationDefRow & {
  version_status: string;
  version: number;
  graph_json: unknown;
  compile_summary_json: unknown;
  version_metadata_json: unknown;
  version_created_at: string;
};

type AutomationRunRow = {
  run_id: string;
  tenant_id: string;
  scope: string;
  automation_id: string;
  automation_version: number;
  requested_by: string | null;
  lifecycle_state: string;
  pause_reason: string | null;
  terminal_outcome: string | null;
  status_summary: string;
  root_cause_code: string | null;
  root_cause_node_id: string | null;
  root_cause_message: string | null;
  params_json: unknown;
  context_json: unknown;
  summary_json: unknown;
  output_snapshot_json: unknown;
  compensation_attempted: boolean;
  compensation_status: string;
  compensation_summary_json: unknown;
  started_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  updated_at: string;
  created_at: string;
};

type AutomationRunNodeRow = {
  run_id: string;
  node_id: string;
  attempt: number;
  node_kind: string;
  lifecycle_state: string;
  pause_reason: string | null;
  terminal_outcome: string | null;
  status_summary: string;
  depends_on_json: unknown;
  blocking_node_ids_json: unknown;
  error_code: string | null;
  error_message: string | null;
  playbook_id: string | null;
  playbook_version: number | null;
  playbook_run_id: string | null;
  approval_id: string | null;
  input_snapshot_json: unknown;
  output_snapshot_json: unknown;
  artifact_refs_json: unknown;
  compensation_mode: string;
  compensation_ref_json: unknown;
  compensation_run_id: string | null;
  compensation_status: string;
  started_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  updated_at: string;
  created_at: string;
};

type AutomationTelemetryAggregateRow = {
  total_runs: string | number;
  terminal_runs: string | number;
  succeeded_runs: string | number;
  failed_runs: string | number;
  cancelled_runs: string | number;
  compensated_runs: string | number;
  paused_runs: string | number;
  repair_paused_runs: string | number;
  approval_paused_runs: string | number;
  compensation_failed_runs: string | number;
  shadow_runs: string | number;
  active_runs: string | number;
  p95_duration_seconds: string | number | null;
};

type AutomationTelemetryRootCauseRow = {
  root_cause_code: string | null;
  count: string | number;
};

type ReplayPlaybookVersionRow = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  slots: unknown;
  created_at: string;
  updated_at: string;
  commit_id: string | null;
  version_num: number;
  playbook_status: string | null;
  playbook_id: string | null;
  repair_review_state: string | null;
  repaired_from_version: number | null;
  reviewed_from_version: number | null;
  promoted_from_version: number | null;
};

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseAutomationCreateInput(body: unknown): AutomationCreateInput {
  return AutomationCreateRequest.parse(body);
}

function parseAutomationGetInput(body: unknown): AutomationGetInput {
  return AutomationGetRequest.parse(body);
}

function parseAutomationShadowReportInput(body: unknown): AutomationShadowReportInput {
  return AutomationShadowReportRequest.parse(body);
}

function parseAutomationShadowReviewInput(body: unknown): AutomationShadowReviewInput {
  return AutomationShadowReviewRequest.parse(body);
}

function parseAutomationShadowValidateInput(body: unknown): AutomationShadowValidateInput {
  return AutomationShadowValidateRequest.parse(body);
}

function parseAutomationShadowValidateDispatchInput(body: unknown): AutomationShadowValidateDispatchInput {
  return AutomationShadowValidateDispatchRequest.parse(body);
}

function parseAutomationListInput(body: unknown): AutomationListInput {
  return AutomationListRequest.parse(body);
}

function parseAutomationAssignReviewerInput(body: unknown): AutomationAssignReviewerInput {
  return AutomationAssignReviewerRequest.parse(body);
}

function parseAutomationPromoteInput(body: unknown): AutomationPromoteInput {
  return AutomationPromoteRequest.parse(body);
}

function parseAutomationValidateInput(body: unknown): AutomationValidateInput {
  return AutomationValidateRequest.parse(body);
}

function parseAutomationTelemetryInput(body: unknown): AutomationTelemetryInput {
  return AutomationTelemetryRequest.parse(body);
}

function parseAutomationRunInput(body: unknown): AutomationRunInput {
  return AutomationRunRequest.parse(body);
}

function parseAutomationRunGetInput(body: unknown): AutomationRunGetInput {
  return AutomationRunGetRequest.parse(body);
}

function parseAutomationRunListInput(body: unknown): AutomationRunListInput {
  return AutomationRunListRequest.parse(body);
}

function parseAutomationRunAssignReviewerInput(body: unknown): AutomationRunAssignReviewerInput {
  return AutomationRunAssignReviewerRequest.parse(body);
}

function parseAutomationRunCancelInput(body: unknown): AutomationRunCancelInput {
  return AutomationRunCancelRequest.parse(body);
}

function parseAutomationRunResumeInput(body: unknown): AutomationRunResumeInput {
  return AutomationRunResumeRequest.parse(body);
}

function parseAutomationRunRejectRepairInput(body: unknown): AutomationRunRejectRepairInput {
  return AutomationRunRejectRepairRequest.parse(body);
}

function parseAutomationRunApproveRepairInput(body: unknown): AutomationRunApproveRepairInput {
  return AutomationRunApproveRepairRequest.parse(body);
}

function parseAutomationRunCompensationRetryInput(body: unknown): AutomationRunCompensationRetryInput {
  return AutomationRunCompensationRetryRequest.parse(body);
}

function parseAutomationRunCompensationRecordActionInput(body: unknown): AutomationRunCompensationRecordActionInput {
  return AutomationRunCompensationRecordActionRequest.parse(body);
}

function parseAutomationRunCompensationAssignInput(body: unknown): AutomationRunCompensationAssignInput {
  return AutomationRunCompensationAssignRequest.parse(body);
}

function parseAutomationCompensationPolicyMatrixInput(body: unknown): AutomationCompensationPolicyMatrixInput {
  return AutomationCompensationPolicyMatrixRequest.parse(body);
}

function jsonClone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function toPositiveIntOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeIsoTimestampOrThrow(value: unknown, field: string): string | null {
  const text = toStringOrNull(value);
  if (!text) return null;
  const millis = Date.parse(text);
  if (!Number.isFinite(millis)) {
    throw new HttpError(400, "automation_invalid_timestamp", `${field} must be a valid ISO-8601 timestamp`, {
      field,
      value: text,
    });
  }
  return new Date(millis).toISOString();
}

function extractAutomationExecutionMode(value: unknown): AutomationExecutionMode {
  const obj = asObject(value);
  return obj?.execution_mode === "shadow" ? "shadow" : "default";
}

function decorateRunWithExecutionMode<T extends { context_json?: unknown }>(run: T): T & { execution_mode: AutomationExecutionMode } {
  return {
    ...run,
    execution_mode: extractAutomationExecutionMode(run.context_json),
  };
}

function extractRunReviewAssignment(value: unknown): Record<string, unknown> | null {
  const obj = asObject(value);
  return asObject(obj?.review_assignment) ?? null;
}

function extractRunCompensationWorkflow(value: unknown): Record<string, unknown> | null {
  const obj = asObject(value);
  return asObject(obj?.compensation_workflow) ?? null;
}

function extractRunCompensationWorkflowHistory(value: unknown): Record<string, unknown>[] {
  const workflow = extractRunCompensationWorkflow(value);
  const entries = Array.isArray(workflow?.history) ? workflow.history : [];
  return entries
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .sort((left, right) => {
      const leftAt = toStringOrNull(left.recorded_at) ?? "";
      const rightAt = toStringOrNull(right.recorded_at) ?? "";
      return rightAt.localeCompare(leftAt);
    });
}

function extractRunCompensationWorkflowAssignment(value: unknown): Record<string, unknown> | null {
  const workflow = extractRunCompensationWorkflow(value);
  return asObject(workflow?.assignment) ?? null;
}

function extractAutomationReviewAssignment(value: unknown, version: number): Record<string, unknown> | null {
  const obj = asObject(value);
  const assignment = asObject(obj?.latest_review_assignment);
  if (!assignment) return null;
  const assignmentVersion = toPositiveIntOrNull(assignment.version);
  if (assignmentVersion != null && assignmentVersion !== version) return null;
  return assignment;
}

function extractAutomationShadowReview(value: unknown, version: number): Record<string, unknown> | null {
  const obj = asObject(value);
  const review = asObject(obj?.latest_shadow_review);
  if (!review) return null;
  const reviewVersion = toPositiveIntOrNull(review.version);
  if (reviewVersion != null && reviewVersion !== version) return null;
  return review;
}

function extractAutomationShadowReviewHistory(value: unknown, version: number): Record<string, unknown>[] {
  const obj = asObject(value);
  const entries = Array.isArray(obj?.shadow_review_history) ? obj.shadow_review_history : [];
  return entries
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => {
      const entryVersion = toPositiveIntOrNull(entry.version);
      return entryVersion == null || entryVersion === version;
    })
    .sort((left, right) => {
      const leftAt = toStringOrNull(left.reviewed_at) ?? "";
      const rightAt = toStringOrNull(right.reviewed_at) ?? "";
      return rightAt.localeCompare(leftAt);
    });
}

function extractAutomationShadowValidation(value: unknown, version: number): Record<string, unknown> | null {
  const obj = asObject(value);
  const validation = asObject(obj?.latest_shadow_validation);
  if (!validation) return null;
  const validationVersion = toPositiveIntOrNull(validation.version);
  if (validationVersion != null && validationVersion !== version) return null;
  return validation;
}

function extractAutomationShadowValidationHistory(value: unknown, version: number): Record<string, unknown>[] {
  const obj = asObject(value);
  const entries = Array.isArray(obj?.shadow_validation_history) ? obj.shadow_validation_history : [];
  return entries
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => {
      const entryVersion = toPositiveIntOrNull(entry.version);
      return entryVersion == null || entryVersion === version;
    })
    .sort((left, right) => {
      const leftAt = toStringOrNull(left.completed_at) ?? toStringOrNull(left.requested_at) ?? "";
      const rightAt = toStringOrNull(right.completed_at) ?? toStringOrNull(right.requested_at) ?? "";
      return rightAt.localeCompare(leftAt);
    });
}

function deriveCompensationWorkflowBucketFromAssessment(assessment: {
  class?: string | null;
  status?: string | null;
  retry_allowed?: boolean | null;
}) {
  if (assessment.retry_allowed === true) return "retry";
  if (assessment.class === "manual_cleanup_required") return "manual_cleanup";
  if (assessment.status === "running") return "observe";
  if (assessment.class === "compensation_failed_without_plan" || assessment.class === "compensation_state_unknown" || assessment.class === "compensation_not_attempted") {
    return "escalate";
  }
  return "other";
}

function deriveCompensationWorkflowState(action: "manual_cleanup_started" | "manual_cleanup_completed" | "engineering_escalated" | "observation_noted") {
  switch (action) {
    case "manual_cleanup_started":
      return "manual_cleanup_in_progress";
    case "manual_cleanup_completed":
      return "manual_cleanup_completed";
    case "engineering_escalated":
      return "engineering_escalated";
    case "observation_noted":
      return "observing";
  }
}

function isCompensationWorkflowActionAllowed(
  assessment: {
    class?: string | null;
    status?: string | null;
  },
  action: "manual_cleanup_started" | "manual_cleanup_completed" | "engineering_escalated" | "observation_noted",
) {
  const blockedClasses = new Set([
    "shadow_run_not_compensable",
    "run_not_terminal",
    "already_compensated",
    "outcome_not_compensable",
    "compensation_succeeded",
  ]);
  if (blockedClasses.has(String(assessment.class || ""))) return false;
  if (action === "manual_cleanup_started" || action === "manual_cleanup_completed") {
    return new Set([
      "manual_cleanup_required",
      "compensation_failed_without_plan",
      "compensation_state_unknown",
      "compensation_not_attempted",
    ]).has(String(assessment.class || ""));
  }
  return true;
}

function getPathValue(source: unknown, path: string[]): unknown {
  let cur: unknown = source;
  for (const part of path) {
    if (!part) continue;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return null;
      cur = cur[idx];
      continue;
    }
    const obj = asObject(cur);
    if (!obj || !(part in obj)) return null;
    cur = obj[part];
  }
  return cur;
}

function resolveBindingValue(
  value: unknown,
  ctx: {
    params: Record<string, unknown>;
    nodeOutputs: Map<string, unknown>;
  },
): unknown {
  if (typeof value === "string") {
    if (value.startsWith("$params.")) {
      return getPathValue(ctx.params, value.slice("$params.".length).split("."));
    }
    if (value.startsWith("$nodes.")) {
      const rest = value.slice("$nodes.".length);
      const parts = rest.split(".");
      const nodeId = parts.shift()?.trim();
      if (!nodeId) return null;
      const base = ctx.nodeOutputs.get(nodeId);
      return getPathValue(base, parts);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveBindingValue(item, ctx));
  }
  const obj = asObject(value);
  if (!obj) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = resolveBindingValue(v, ctx);
  return out;
}

function deriveAutomationRunStatusSummary(input: {
  lifecycle_state: string;
  pause_reason?: string | null;
  terminal_outcome?: string | null;
}): string {
  if (input.lifecycle_state === "paused" && input.pause_reason) {
    return input.pause_reason === "approval_required" ? "paused_for_approval" : "paused_for_repair";
  }
  if (input.lifecycle_state === "terminal" && input.terminal_outcome) return input.terminal_outcome;
  return input.lifecycle_state;
}

function collectBindingRefs(value: unknown, refs: Set<string>) {
  if (typeof value === "string") {
    if (value.startsWith("$nodes.")) {
      const rest = value.slice("$nodes.".length);
      const nodeId = rest.split(".")[0]?.trim();
      if (nodeId) refs.add(nodeId);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectBindingRefs(item, refs);
    return;
  }
  const obj = asObject(value);
  if (!obj) return;
  for (const next of Object.values(obj)) collectBindingRefs(next, refs);
}

function hasGraphPath(from: string, to: string, outgoing: Map<string, string[]>): boolean {
  if (from === to) return true;
  const seen = new Set<string>([from]);
  const queue = [...(outgoing.get(from) ?? [])];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (nodeId === to) return true;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    for (const next of outgoing.get(nodeId) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return false;
}

export function validateAutomationGraph(graph: AutomationGraphInput): AutomationValidationResult {
  const issues: AutomationValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const nodeMap = new Map<string, AutomationGraphNodeInput>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.node_id)) {
      issues.push({
        code: "duplicate_node_id",
        message: "node_id must be unique",
        node_id: node.node_id,
      });
      continue;
    }
    nodeIds.add(node.node_id);
    nodeMap.set(node.node_id, node);
  }

  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    indegree.set(nodeId, 0);
    outgoing.set(nodeId, []);
    incoming.set(nodeId, []);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        code: "edge_from_missing",
        message: "edge source node does not exist",
        edge,
      });
      continue;
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        code: "edge_to_missing",
        message: "edge target node does not exist",
        edge,
      });
      continue;
    }
    if (edge.from === edge.to) {
      issues.push({
        code: "self_cycle",
        message: "self-referential edges are not allowed",
        edge,
      });
      continue;
    }
    if (edge.type === "on_failure") {
      issues.push({
        code: "unsupported_edge_type",
        message: "on_failure edges are not supported in phase 1 runtime",
        edge,
      });
      continue;
    }
    outgoing.get(edge.from)!.push(edge.to);
    incoming.get(edge.to)!.push(edge.from);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  for (const node of graph.nodes) {
    const refs = new Set<string>();
    collectBindingRefs(node.inputs, refs);
    if (node.kind === "condition") collectBindingRefs(node.expression, refs);
    if (node.kind === "artifact_gate") collectBindingRefs(node.required_artifacts, refs);
    for (const ref of refs) {
      if (!nodeIds.has(ref)) {
        issues.push({
          code: "binding_node_missing",
          message: "input binding references a node that does not exist",
          node_id: node.node_id,
        });
        continue;
      }
      if (ref === node.node_id) {
        issues.push({
          code: "binding_self_reference",
          message: "node bindings may not reference the same node",
          node_id: node.node_id,
        });
        continue;
      }
      if (!hasGraphPath(ref, node.node_id, outgoing)) {
        issues.push({
          code: "binding_dependency_missing",
          message: "node bindings require an explicit dependency path from referenced node to consumer",
          node_id: node.node_id,
          edge: {
            from: ref,
            to: node.node_id,
            type: "binding",
          },
        });
      }
    }
  }

  const startNodeIds = Array.from(nodeIds).filter((nodeId) => (incoming.get(nodeId) ?? []).length === 0);
  if (startNodeIds.length === 0) {
    issues.push({
      code: "missing_start_node",
      message: "automation graph must have at least one start node",
    });
  }

  const queue = Array.from(startNodeIds).sort();
  const indegreeWork = new Map(indegree);
  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    topologicalOrder.push(nodeId);
    const nextList = (outgoing.get(nodeId) ?? []).slice().sort();
    for (const next of nextList) {
      const remaining = (indegreeWork.get(next) ?? 0) - 1;
      indegreeWork.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (topologicalOrder.length !== nodeIds.size) {
    issues.push({
      code: "cycle_detected",
      message: "automation graph must be acyclic",
    });
  }

  if (issues.length > 0) {
    throw new HttpError(400, "automation_graph_invalid", "automation graph validation failed", { issues });
  }

  return {
    node_ids: Array.from(nodeIds),
    start_node_ids: startNodeIds.sort(),
    topological_order: topologicalOrder,
    issues,
  };
}

async function loadAutomationDef(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id: string;
}): Promise<AutomationDefRow | null> {
  const res = await client.query<AutomationDefRow>(
    `SELECT tenant_id, scope, automation_id, name, status, latest_version,
            input_contract_json, output_contract_json, metadata_json,
            created_at::text, updated_at::text
       FROM automation_defs
      WHERE tenant_id = $1 AND scope = $2 AND automation_id = $3
      LIMIT 1`,
    [input.tenant_id, input.scope, input.automation_id],
  );
  return res.rows[0] ?? null;
}

async function listAutomationDefs(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  status?: string | null;
  promotion_only: boolean;
  reviewer?: string | null;
  limit: number;
}): Promise<AutomationListRow[]> {
  const params: Array<string | number> = [input.tenant_id, input.scope];
  const where = [
    "d.tenant_id = $1",
    "d.scope = $2",
  ];
  if (input.status) {
    params.push(input.status);
    where.push(`v.status = $${params.length}`);
  }
  if (input.promotion_only) {
    where.push(`v.status = 'shadow'`);
  }
  if (input.reviewer) {
    params.push(input.reviewer);
    where.push(`d.metadata_json->'latest_review_assignment'->>'reviewer' = $${params.length}`);
  }
  params.push(input.limit);
  const limitParam = `$${params.length}`;
  const res = await client.query<AutomationListRow>(
    `SELECT d.tenant_id, d.scope, d.automation_id, d.name, d.status, d.latest_version,
            d.metadata_json, d.updated_at::text,
            v.status AS version_status,
            v.metadata_json AS version_metadata_json,
            v.created_at::text AS version_created_at,
            v.compile_summary_json
       FROM automation_defs d
       JOIN automation_versions v
         ON v.tenant_id = d.tenant_id
        AND v.scope = d.scope
        AND v.automation_id = d.automation_id
        AND v.version = d.latest_version
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE WHEN v.status = 'shadow' THEN 0 ELSE 1 END,
        d.updated_at DESC
      LIMIT ${limitParam}`,
    params,
  );
  return res.rows;
}

async function loadAutomationVersion(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id: string;
  version: number;
}): Promise<AutomationVersionRow | null> {
  const res = await client.query<AutomationVersionRow>(
    `SELECT tenant_id, scope, automation_id, version, status,
            graph_json, compile_summary_json, metadata_json,
            created_at::text
       FROM automation_versions
      WHERE tenant_id = $1 AND scope = $2 AND automation_id = $3 AND version = $4
      LIMIT 1`,
    [input.tenant_id, input.scope, input.automation_id, input.version],
  );
  return res.rows[0] ?? null;
}

async function loadLatestAutomationVersionByStatus(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id: string;
  status: string;
}): Promise<AutomationShadowReportVersionRow | null> {
  const res = await client.query<AutomationShadowReportVersionRow>(
    `SELECT tenant_id, scope, automation_id, version, status,
            graph_json, compile_summary_json, metadata_json,
            created_at::text
       FROM automation_versions
      WHERE tenant_id = $1
        AND scope = $2
        AND automation_id = $3
        AND status = $4
      ORDER BY version DESC
      LIMIT 1`,
    [input.tenant_id, input.scope, input.automation_id, input.status],
  );
  return res.rows[0] ?? null;
}

async function loadAutomationRun(client: pg.PoolClient, input: {
  run_id: string;
  tenant_id: string;
  scope: string;
}): Promise<AutomationRunRow | null> {
  const res = await client.query<AutomationRunRow>(
    `SELECT run_id::text, tenant_id, scope, automation_id, automation_version, requested_by,
            lifecycle_state, pause_reason, terminal_outcome, status_summary,
            root_cause_code, root_cause_node_id, root_cause_message,
            params_json, context_json, summary_json, output_snapshot_json,
            compensation_attempted, compensation_status, compensation_summary_json,
            started_at::text, paused_at::text, ended_at::text, updated_at::text, created_at::text
       FROM automation_runs
      WHERE run_id = $1 AND tenant_id = $2 AND scope = $3
      LIMIT 1`,
    [input.run_id, input.tenant_id, input.scope],
  );
  return res.rows[0] ?? null;
}

async function listAutomationRuns(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id?: string | null;
  actionable_only: boolean;
  compensation_only: boolean;
  reviewer?: string | null;
  limit: number;
}): Promise<AutomationRunRow[]> {
  const params: Array<string | number | boolean> = [input.tenant_id, input.scope];
  const where = [
    "tenant_id = $1",
    "scope = $2",
  ];
  if (input.automation_id) {
    params.push(input.automation_id);
    where.push(`automation_id = $${params.length}`);
  }
  if (input.actionable_only) {
    where.push(`(
      (lifecycle_state = 'paused' AND pause_reason IN ('approval_required', 'repair_required'))
      OR (lifecycle_state = 'terminal' AND compensation_status = 'failed')
    )`);
  }
  if (input.compensation_only) {
    where.push(`(
      lifecycle_state = 'terminal'
      AND compensation_status = 'failed'
    )`);
  }
  if (input.reviewer) {
    params.push(input.reviewer);
    where.push(`context_json->'review_assignment'->>'reviewer' = $${params.length}`);
  }
  params.push(input.limit);
  const limitParam = `$${params.length}`;
  const res = await client.query<AutomationRunRow>(
    `SELECT run_id::text, tenant_id, scope, automation_id, automation_version, requested_by,
            lifecycle_state, pause_reason, terminal_outcome, status_summary,
            root_cause_code, root_cause_node_id, root_cause_message,
            params_json, context_json, summary_json, output_snapshot_json,
            compensation_attempted, compensation_status, compensation_summary_json,
            started_at::text, paused_at::text, ended_at::text, updated_at::text, created_at::text
       FROM automation_runs
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE
          WHEN lifecycle_state = 'paused' THEN 0
          WHEN lifecycle_state = 'terminal' AND compensation_status = 'failed' THEN 1
          ELSE 2
        END,
        updated_at DESC
      LIMIT ${limitParam}`,
    params,
  );
  return res.rows;
}

async function loadLatestAutomationRunByVersion(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id: string;
  automation_version: number;
  execution_mode: AutomationExecutionMode;
}): Promise<AutomationRunRow | null> {
  const res = await client.query<AutomationRunRow>(
    `SELECT run_id::text, tenant_id, scope, automation_id, automation_version, requested_by,
            lifecycle_state, pause_reason, terminal_outcome, status_summary,
            root_cause_code, root_cause_node_id, root_cause_message,
            params_json, context_json, summary_json, output_snapshot_json,
            compensation_attempted, compensation_status, compensation_summary_json,
            started_at::text, paused_at::text, ended_at::text, updated_at::text, created_at::text
       FROM automation_runs
      WHERE tenant_id = $1
        AND scope = $2
        AND automation_id = $3
        AND automation_version = $4
        AND coalesce(context_json->>'execution_mode', 'default') = $5
      ORDER BY created_at DESC
      LIMIT 1`,
    [input.tenant_id, input.scope, input.automation_id, input.automation_version, input.execution_mode],
  );
  return res.rows[0] ?? null;
}

async function listRecentAutomationRuns(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id: string;
  automation_version?: number | null;
  execution_mode: AutomationExecutionMode;
  limit: number;
}): Promise<AutomationRunRow[]> {
  const params: Array<string | number> = [input.tenant_id, input.scope, input.automation_id, input.execution_mode];
  const where = [
    "tenant_id = $1",
    "scope = $2",
    "automation_id = $3",
    "coalesce(context_json->>'execution_mode', 'default') = $4",
  ];
  if (input.automation_version != null) {
    params.push(input.automation_version);
    where.push(`automation_version = $${params.length}`);
  }
  params.push(input.limit);
  const limitParam = `$${params.length}`;
  const res = await client.query<AutomationRunRow>(
    `SELECT run_id::text, tenant_id, scope, automation_id, automation_version, requested_by,
            lifecycle_state, pause_reason, terminal_outcome, status_summary,
            root_cause_code, root_cause_node_id, root_cause_message,
            params_json, context_json, summary_json, output_snapshot_json,
            compensation_attempted, compensation_status, compensation_summary_json,
            started_at::text, paused_at::text, ended_at::text, updated_at::text, created_at::text
       FROM automation_runs
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${limitParam}`,
    params,
  );
  return res.rows;
}

async function loadAutomationTelemetryAggregate(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id?: string | null;
  window_hours: number;
}) {
  const res = await client.query<AutomationTelemetryAggregateRow>(
    `SELECT
        count(*)::bigint AS total_runs,
        count(*) FILTER (WHERE lifecycle_state = 'terminal')::bigint AS terminal_runs,
        count(*) FILTER (WHERE terminal_outcome = 'succeeded')::bigint AS succeeded_runs,
        count(*) FILTER (WHERE terminal_outcome = 'failed')::bigint AS failed_runs,
        count(*) FILTER (WHERE terminal_outcome = 'cancelled')::bigint AS cancelled_runs,
        count(*) FILTER (WHERE terminal_outcome IN ('failed_compensated', 'cancelled_compensated'))::bigint AS compensated_runs,
        count(*) FILTER (WHERE lifecycle_state = 'paused')::bigint AS paused_runs,
        count(*) FILTER (WHERE lifecycle_state = 'paused' AND pause_reason = 'repair_required')::bigint AS repair_paused_runs,
        count(*) FILTER (WHERE lifecycle_state = 'paused' AND pause_reason = 'approval_required')::bigint AS approval_paused_runs,
        count(*) FILTER (WHERE compensation_status = 'failed')::bigint AS compensation_failed_runs,
        count(*) FILTER (WHERE coalesce(context_json->>'execution_mode', 'default') = 'shadow')::bigint AS shadow_runs,
        count(*) FILTER (WHERE coalesce(context_json->>'execution_mode', 'default') = 'default')::bigint AS active_runs,
        percentile_disc(0.95) WITHIN GROUP (
          ORDER BY extract(epoch from (coalesce(ended_at, updated_at) - created_at))
        ) FILTER (WHERE lifecycle_state = 'terminal') AS p95_duration_seconds
      FROM automation_runs
      WHERE tenant_id = $1
        AND scope = $2
        AND created_at >= now() - make_interval(hours => $3::int)
        AND ($4::text IS NULL OR automation_id = $4)`,
    [input.tenant_id, input.scope, input.window_hours, input.automation_id ?? null],
  );
  return res.rows[0] ?? null;
}

async function listAutomationTelemetryRootCauses(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id?: string | null;
  window_hours: number;
  limit: number;
}) {
  const res = await client.query<AutomationTelemetryRootCauseRow>(
    `SELECT root_cause_code, count(*)::bigint AS count
       FROM automation_runs
      WHERE tenant_id = $1
        AND scope = $2
        AND created_at >= now() - make_interval(hours => $3::int)
        AND ($4::text IS NULL OR automation_id = $4)
        AND root_cause_code IS NOT NULL
      GROUP BY root_cause_code
      ORDER BY count(*) DESC, root_cause_code ASC
      LIMIT $5`,
    [input.tenant_id, input.scope, input.window_hours, input.automation_id ?? null, input.limit],
  );
  return res.rows;
}

async function listAutomationTelemetryIncidentRuns(client: pg.PoolClient, input: {
  tenant_id: string;
  scope: string;
  automation_id?: string | null;
  window_hours: number;
  limit: number;
}) {
  const res = await client.query<AutomationRunRow>(
    `SELECT run_id::text, tenant_id, scope, automation_id, automation_version, requested_by,
            lifecycle_state, pause_reason, terminal_outcome, status_summary,
            root_cause_code, root_cause_node_id, root_cause_message,
            params_json, context_json, summary_json, output_snapshot_json,
            compensation_attempted, compensation_status, compensation_summary_json,
            started_at::text, paused_at::text, ended_at::text, updated_at::text, created_at::text
       FROM automation_runs
      WHERE tenant_id = $1
        AND scope = $2
        AND created_at >= now() - make_interval(hours => $3::int)
        AND ($4::text IS NULL OR automation_id = $4)
        AND (
          lifecycle_state = 'paused'
          OR terminal_outcome IN ('failed', 'cancelled')
          OR compensation_status = 'failed'
        )
      ORDER BY updated_at DESC
      LIMIT $5`,
    [input.tenant_id, input.scope, input.window_hours, input.automation_id ?? null, input.limit],
  );
  return res.rows;
}

async function listReplayPlaybookVersionsForResume(
  client: pg.PoolClient,
  input: {
    scope_key: string;
    playbook_id: string;
  },
) : Promise<ReplayPlaybookVersionRow[]> {
  const res = await client.query<ReplayPlaybookVersionRow>(
    `SELECT
        id::text,
        type::text AS type,
        title,
        text_summary,
        slots,
        created_at::text AS created_at,
        updated_at::text AS updated_at,
        commit_id::text AS commit_id,
        CASE
          WHEN coalesce(slots->>'version', '') ~ '^[0-9]+$' THEN (slots->>'version')::int
          ELSE 1
        END AS version_num,
        nullif(trim(coalesce(slots->>'status', '')), '') AS playbook_status,
        nullif(trim(coalesce(slots->>'playbook_id', '')), '') AS playbook_id,
        nullif(trim(coalesce(slots->'repair_review'->>'state', '')), '') AS repair_review_state,
        CASE
          WHEN coalesce(slots->>'repaired_from_version', '') ~ '^[0-9]+$' THEN (slots->>'repaired_from_version')::int
          ELSE NULL
        END AS repaired_from_version,
        CASE
          WHEN coalesce(slots->>'reviewed_from_version', '') ~ '^[0-9]+$' THEN (slots->>'reviewed_from_version')::int
          ELSE NULL
        END AS reviewed_from_version,
        CASE
          WHEN coalesce(slots->>'promoted_from_version', '') ~ '^[0-9]+$' THEN (slots->>'promoted_from_version')::int
          ELSE NULL
        END AS promoted_from_version
      FROM memory_nodes
      WHERE scope = $1
        AND slots->>'replay_kind' = 'playbook'
        AND slots->>'playbook_id' = $2
      ORDER BY version_num DESC, created_at DESC`,
    [input.scope_key, input.playbook_id],
  );
  return res.rows;
}

async function listAutomationRunNodes(client: pg.PoolClient, input: {
  run_id: string;
}): Promise<AutomationRunNodeRow[]> {
  const res = await client.query<AutomationRunNodeRow>(
    `SELECT run_id::text, node_id, attempt, node_kind, lifecycle_state, pause_reason,
            terminal_outcome, status_summary, depends_on_json, blocking_node_ids_json,
            error_code, error_message, playbook_id, playbook_version, playbook_run_id::text,
            approval_id, input_snapshot_json, output_snapshot_json, artifact_refs_json,
            compensation_mode, compensation_ref_json, compensation_run_id::text,
            compensation_status, started_at::text, paused_at::text, ended_at::text,
            updated_at::text, created_at::text
       FROM automation_run_nodes
      WHERE run_id = $1
      ORDER BY node_id ASC, attempt ASC`,
    [input.run_id],
  );
  return res.rows;
}

function extractRecordedPlaybookVersion(node: AutomationRunNodeRow): number | null {
  if (node.playbook_version != null) return node.playbook_version;
  const output = asObject(node.output_snapshot_json);
  return (
    toPositiveIntOrNull(asObject(output?.playbook)?.version)
    ?? toPositiveIntOrNull(asObject(output?.run)?.playbook_version)
    ?? toPositiveIntOrNull(asObject(asObject(output?.run)?.metadata)?.source_playbook_version)
  );
}

async function resolveRepairResumeVersion(
  client: pg.PoolClient,
  args: {
    run: AutomationRunRow;
    pausedNode: AutomationRunNodeRow;
    defaultScope: string;
    defaultTenantId: string;
  },
) {
  if (!args.pausedNode.playbook_id) {
    throw new HttpError(409, "automation_run_not_resumable", "repair-required node is missing playbook linkage", {
      run_id: args.run.run_id,
      node_id: args.pausedNode.node_id,
    });
  }
  const currentVersion = extractRecordedPlaybookVersion(args.pausedNode);
  if (!currentVersion) {
    throw new HttpError(409, "automation_run_not_resumable", "repair-required node is missing executed playbook version", {
      run_id: args.run.run_id,
      node_id: args.pausedNode.node_id,
    });
  }
  const scopeKey = resolveTenantScope(
    { tenant_id: args.run.tenant_id, scope: args.run.scope },
    { defaultScope: args.defaultScope, defaultTenantId: args.defaultTenantId },
  ).scope_key;
  const playbookVersions = await listReplayPlaybookVersionsForResume(client, {
    scope_key: scopeKey,
    playbook_id: args.pausedNode.playbook_id,
  });
  const latestPlaybook = findResumableReplayPlaybookVersion(playbookVersions, currentVersion);
  if (!latestPlaybook || latestPlaybook.version_num <= currentVersion) {
    throw new HttpError(409, "automation_run_not_resumable", "repair-required runs need a newer repaired playbook version before resume", {
      run_id: args.run.run_id,
      node_id: args.pausedNode.node_id,
      playbook_id: args.pausedNode.playbook_id,
      current_version: currentVersion,
      latest_version: playbookVersions[0]?.version_num ?? null,
    });
  }
  return { currentVersion, latestPlaybook };
}

function isReplayVersionApprovedForResume(row: ReplayPlaybookVersionRow): boolean {
  if ((row.playbook_status ?? "draft") === "disabled") return false;
  if (row.repair_review_state == null) return false;
  return row.repair_review_state === "approved";
}

function isReplayVersionDescendantOf(
  row: ReplayPlaybookVersionRow,
  ancestorVersion: number,
  byVersion: Map<number, ReplayPlaybookVersionRow>,
): boolean {
  const seen = new Set<number>();
  let cursor: ReplayPlaybookVersionRow | undefined = row;
  while (cursor) {
    if (cursor.version_num === ancestorVersion) return true;
    if (seen.has(cursor.version_num)) return false;
    seen.add(cursor.version_num);
    const parentVersion =
      cursor.repaired_from_version
      ?? cursor.reviewed_from_version
      ?? cursor.promoted_from_version
      ?? null;
    if (parentVersion == null) return false;
    cursor = byVersion.get(parentVersion);
  }
  return false;
}

function findResumableReplayPlaybookVersion(rows: ReplayPlaybookVersionRow[], currentVersion: number): ReplayPlaybookVersionRow | null {
  const byVersion = new Map(rows.map((row) => [row.version_num, row]));
  for (const row of rows) {
    if (row.version_num <= currentVersion) continue;
    if (!isReplayVersionApprovedForResume(row)) continue;
    if (isReplayVersionDescendantOf(row, currentVersion, byVersion)) return row;
  }
  return null;
}

async function withLocalTransaction<T>(client: pg.PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function withAutomationRunLock<T>(client: pg.PoolClient, runId: string, fn: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [runId]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [runId]);
  }
}

async function maybeInjectAutomationTestFault(
  opts: AutomationExecutionOptions,
  input: {
    action: string;
    stage: string;
    run_id?: string | null;
    node_id?: string | null;
  },
) {
  if (!opts.testHook) return;
  await opts.testHook(input);
}

function evaluateConditionExpression(expr: unknown, ctx: { params: Record<string, unknown>; nodeOutputs: Map<string, unknown> }): boolean {
  if (typeof expr === "boolean") return expr;
  const obj = asObject(resolveBindingValue(expr, ctx));
  if (!obj) return Boolean(expr);
  if ("equals" in obj) return (obj.left ?? null) === (obj.equals ?? null);
  if ("not_equals" in obj) return (obj.left ?? null) !== (obj.not_equals ?? null);
  if ("exists" in obj) return resolveBindingValue(obj.exists, ctx) != null;
  return Boolean(obj.value ?? obj.result ?? false);
}

async function updateRunRow(
  client: pg.PoolClient,
  runId: string,
  patch: Record<string, unknown>,
) {
  const next = {
    lifecycle_state: patch.lifecycle_state ?? null,
    pause_reason: patch.pause_reason ?? null,
    terminal_outcome: patch.terminal_outcome ?? null,
    status_summary: patch.status_summary ?? null,
    root_cause_code: patch.root_cause_code ?? null,
    root_cause_node_id: patch.root_cause_node_id ?? null,
    root_cause_message: patch.root_cause_message ?? null,
    summary_json: JSON.stringify(patch.summary_json ?? {}),
    output_snapshot_json: JSON.stringify(patch.output_snapshot_json ?? {}),
    compensation_attempted:
      typeof patch.compensation_attempted === "boolean" ? patch.compensation_attempted : null,
    compensation_status: patch.compensation_status ?? null,
    compensation_summary_json: JSON.stringify(patch.compensation_summary_json ?? {}),
    started_at: patch.started_at ?? null,
    paused_at: patch.paused_at ?? null,
    ended_at: patch.ended_at ?? null,
  };
  await client.query(
    `UPDATE automation_runs
        SET lifecycle_state = COALESCE($2, lifecycle_state),
            pause_reason = CASE
              WHEN $2 = 'paused' THEN COALESCE($3, pause_reason)
              WHEN $2 IS NOT NULL THEN NULL
              ELSE pause_reason
            END,
            terminal_outcome = CASE
              WHEN $2 = 'terminal' THEN COALESCE($4, terminal_outcome)
              WHEN $2 IS NOT NULL THEN NULL
              ELSE terminal_outcome
            END,
            status_summary = COALESCE($5, status_summary),
            root_cause_code = COALESCE($6, root_cause_code),
            root_cause_node_id = COALESCE($7, root_cause_node_id),
            root_cause_message = COALESCE($8, root_cause_message),
            summary_json = CASE WHEN $9::jsonb = '{}'::jsonb AND summary_json IS NOT NULL THEN summary_json ELSE $9::jsonb END,
            output_snapshot_json = CASE WHEN $10::jsonb = '{}'::jsonb AND output_snapshot_json IS NOT NULL THEN output_snapshot_json ELSE $10::jsonb END,
            compensation_attempted = COALESCE($11::boolean, compensation_attempted),
            compensation_status = COALESCE($12, compensation_status),
            compensation_summary_json = CASE WHEN $13::jsonb = '{}'::jsonb AND compensation_summary_json IS NOT NULL THEN compensation_summary_json ELSE $13::jsonb END,
            started_at = COALESCE($14::timestamptz, started_at),
            paused_at = CASE
              WHEN $2 = 'paused' THEN COALESCE($15::timestamptz, paused_at, now())
              WHEN $2 IS NOT NULL THEN NULL
              ELSE paused_at
            END,
            ended_at = CASE WHEN $2 = 'terminal' THEN COALESCE($16::timestamptz, ended_at, now()) ELSE ended_at END
      WHERE run_id = $1`,
    [
      runId,
      next.lifecycle_state,
      next.pause_reason,
      next.terminal_outcome,
      next.status_summary,
      next.root_cause_code,
      next.root_cause_node_id,
      next.root_cause_message,
      next.summary_json,
      next.output_snapshot_json,
      next.compensation_attempted,
      next.compensation_status,
      next.compensation_summary_json,
      next.started_at,
      next.paused_at,
      next.ended_at,
    ],
  );
}

async function setRunReviewAssignment(
  client: pg.PoolClient,
  input: {
    run_id: string;
    reviewer: string;
    actor?: string | null;
    note?: string | null;
  },
) {
  await client.query(
    `UPDATE automation_runs
        SET context_json = jsonb_set(
          coalesce(context_json, '{}'::jsonb),
          '{review_assignment}',
          $2::jsonb,
          true
        )
      WHERE run_id = $1`,
    [
      input.run_id,
      JSON.stringify({
        reviewer: input.reviewer,
        assigned_by: input.actor ?? null,
        note: input.note ?? null,
        assigned_at: new Date().toISOString(),
      }),
    ],
  );
}

async function setRunCompensationWorkflow(
  client: pg.PoolClient,
  input: {
    run: AutomationRunRow;
    assessment: {
      class?: string | null;
      status?: string | null;
      retry_allowed?: boolean | null;
    };
    action: "manual_cleanup_started" | "manual_cleanup_completed" | "engineering_escalated" | "observation_noted";
    actor?: string | null;
    note?: string | null;
    external_ref?: string | null;
  },
) {
  const context = asObject(input.run.context_json) ?? {};
  const existing = extractRunCompensationWorkflow(context) ?? {};
  const history = extractRunCompensationWorkflowHistory(context);
  const bucket = deriveCompensationWorkflowBucketFromAssessment(input.assessment);
  const recordedAt = new Date().toISOString();
  const record = {
    action: input.action,
    state: deriveCompensationWorkflowState(input.action),
    bucket,
    assessment_class: input.assessment.class ?? null,
    assessment_status: input.assessment.status ?? null,
    retry_allowed: input.assessment.retry_allowed ?? false,
    actor: input.actor ?? null,
    note: input.note ?? null,
    external_ref: input.external_ref ?? null,
    recorded_at: recordedAt,
  };
  const nextContext = {
    ...context,
    compensation_workflow: {
      ...existing,
      bucket,
      state: record.state,
      latest_action: record,
      history: [record, ...history].slice(0, 25),
      updated_at: recordedAt,
    },
  };
  await client.query(
    `UPDATE automation_runs
        SET context_json = $2::jsonb
      WHERE run_id = $1`,
    [input.run.run_id, JSON.stringify(nextContext)],
  );
}

async function setRunCompensationWorkflowAssignment(
  client: pg.PoolClient,
  input: {
    run: AutomationRunRow;
    assessment: {
      class?: string | null;
      status?: string | null;
      retry_allowed?: boolean | null;
    };
    owner?: string | null;
    escalation_owner?: string | null;
    sla_target_at?: string | null;
    actor?: string | null;
    note?: string | null;
  },
) {
  const context = asObject(input.run.context_json) ?? {};
  const existing = extractRunCompensationWorkflow(context) ?? {};
  const priorAssignment = extractRunCompensationWorkflowAssignment(context) ?? {};
  const bucket = deriveCompensationWorkflowBucketFromAssessment(input.assessment);
  const assignedAt = new Date().toISOString();
  const assignment = {
    owner: input.owner ?? toStringOrNull(priorAssignment.owner) ?? null,
    escalation_owner: input.escalation_owner ?? toStringOrNull(priorAssignment.escalation_owner) ?? null,
    sla_target_at: input.sla_target_at ?? toStringOrNull(priorAssignment.sla_target_at) ?? null,
    assigned_by: input.actor ?? null,
    note: input.note ?? null,
    assigned_at: assignedAt,
  };
  const assignmentHistory = Array.isArray(existing.assignment_history) ? existing.assignment_history : [];
  const nextContext = {
    ...context,
    compensation_workflow: {
      ...existing,
      bucket,
      assignment,
      assignment_history: [
        {
          ...assignment,
          bucket,
        },
        ...assignmentHistory,
      ].slice(0, 25),
      updated_at: assignedAt,
    },
  };
  await client.query(
    `UPDATE automation_runs
        SET context_json = $2::jsonb
      WHERE run_id = $1`,
    [input.run.run_id, JSON.stringify(nextContext)],
  );
}

async function setAutomationReviewAssignment(
  client: pg.PoolClient,
  input: {
    tenant_id: string;
    scope: string;
    automation_id: string;
    version: number;
    reviewer: string;
    actor?: string | null;
    note?: string | null;
  },
) {
  await client.query(
    `UPDATE automation_defs
        SET metadata_json = jsonb_set(
          coalesce(metadata_json, '{}'::jsonb),
          '{latest_review_assignment}',
          $4::jsonb,
          true
        )
      WHERE tenant_id = $1 AND scope = $2 AND automation_id = $3`,
    [
      input.tenant_id,
      input.scope,
      input.automation_id,
      JSON.stringify({
        version: input.version,
        reviewer: input.reviewer,
        assigned_by: input.actor ?? null,
        note: input.note ?? null,
        assigned_at: new Date().toISOString(),
      }),
    ],
  );
}

async function setAutomationShadowReview(
  client: pg.PoolClient,
  input: {
    tenant_id: string;
    scope: string;
    automation_id: string;
    version: number;
    verdict: "approved" | "needs_changes" | "rejected";
    actor?: string | null;
    note?: string | null;
  },
) {
  const reviewedAt = new Date().toISOString();
  const reviewRecord = {
    version: input.version,
    verdict: input.verdict,
    reviewed_by: input.actor ?? null,
    note: input.note ?? null,
    reviewed_at: reviewedAt,
  };
  await client.query(
    `UPDATE automation_defs
        SET metadata_json = jsonb_set(
          jsonb_set(
            coalesce(metadata_json, '{}'::jsonb),
            '{latest_shadow_review}',
            $4::jsonb,
            true
          ),
          '{shadow_review_history}',
          coalesce(coalesce(metadata_json, '{}'::jsonb)->'shadow_review_history', '[]'::jsonb) || jsonb_build_array($4::jsonb),
          true
        )
      WHERE tenant_id = $1 AND scope = $2 AND automation_id = $3`,
    [
      input.tenant_id,
      input.scope,
      input.automation_id,
      JSON.stringify(reviewRecord),
    ],
  );
}

async function setAutomationShadowValidation(
  client: pg.PoolClient,
  input: {
    tenant_id: string;
    scope: string;
    automation_id: string;
    version: number;
    request_id: string;
    mode: "enqueue" | "inline";
    status: "queued" | "running" | "completed" | "failed";
    requested_by?: string | null;
    note?: string | null;
    params?: Record<string, unknown> | null;
    requested_at: string;
    started_at?: string | null;
    completed_at?: string | null;
    run_id?: string | null;
    run_status_summary?: string | null;
    run_terminal_outcome?: string | null;
    failure_code?: string | null;
    failure_message?: string | null;
    append_history?: boolean;
  },
) {
  const record = {
    version: input.version,
    request_id: input.request_id,
    mode: input.mode,
    status: input.status,
    requested_by: input.requested_by ?? null,
    note: input.note ?? null,
    params: jsonClone(input.params ?? {}),
    requested_at: input.requested_at,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? null,
    run_id: input.run_id ?? null,
    run_status_summary: input.run_status_summary ?? null,
    run_terminal_outcome: input.run_terminal_outcome ?? null,
    failure_code: input.failure_code ?? null,
    failure_message: input.failure_message ?? null,
  };
  if (input.append_history !== false) {
    await client.query(
      `UPDATE automation_defs
          SET metadata_json = jsonb_set(
            jsonb_set(
              coalesce(metadata_json, '{}'::jsonb),
              '{latest_shadow_validation}',
              $4::jsonb,
              true
            ),
            '{shadow_validation_history}',
            coalesce(coalesce(metadata_json, '{}'::jsonb)->'shadow_validation_history', '[]'::jsonb) || jsonb_build_array($4::jsonb),
            true
          )
        WHERE tenant_id = $1 AND scope = $2 AND automation_id = $3`,
      [
        input.tenant_id,
        input.scope,
        input.automation_id,
        JSON.stringify(record),
      ],
    );
    return;
  }
  await client.query(
    `UPDATE automation_defs
        SET metadata_json = jsonb_set(
          coalesce(metadata_json, '{}'::jsonb),
          '{latest_shadow_validation}',
          $4::jsonb,
          true
        )
      WHERE tenant_id = $1 AND scope = $2 AND automation_id = $3`,
    [
      input.tenant_id,
      input.scope,
      input.automation_id,
      JSON.stringify(record),
    ],
  );
}

type QueuedShadowValidationClaim = {
  tenant_id: string;
  scope: string;
  automation_id: string;
  version: number;
  request_id: string;
  mode: "enqueue" | "inline";
  requested_by: string | null;
  note: string | null;
  params: Record<string, unknown>;
  requested_at: string;
};

async function previewQueuedShadowValidationClaims(
  client: pg.PoolClient,
  input: {
    tenant_id: string;
    scope: string;
    automation_id?: string | null;
    limit: number;
  },
): Promise<QueuedShadowValidationClaim[]> {
  const res = await client.query<{
    tenant_id: string;
    scope: string;
    automation_id: string;
    latest_version: number;
    metadata_json: unknown;
  }>(
    `SELECT tenant_id, scope, automation_id, latest_version, metadata_json
       FROM automation_defs
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR scope = $2)
        AND ($3::text IS NULL OR automation_id = $3)
        AND coalesce(metadata_json->'latest_shadow_validation'->>'status', '') = 'queued'
      ORDER BY updated_at ASC
      LIMIT $4`,
    [input.tenant_id, input.scope || null, input.automation_id ?? null, input.limit],
  );
  return res.rows.flatMap((row) => {
    const latest = asObject(asObject(row.metadata_json)?.latest_shadow_validation);
    if (!latest) return [];
    const version = toPositiveIntOrNull(latest.version) ?? row.latest_version;
    const requestId = toStringOrNull(latest.request_id) ?? randomUUID();
    return [{
      tenant_id: row.tenant_id,
      scope: row.scope,
      automation_id: row.automation_id,
      version,
      request_id: requestId,
      mode: (toStringOrNull(latest.mode) === "inline" ? "inline" : "enqueue"),
      requested_by: toStringOrNull(latest.requested_by),
      note: toStringOrNull(latest.note),
      params: asObject(latest.params) ?? {},
      requested_at: toStringOrNull(latest.requested_at) ?? new Date().toISOString(),
    }];
  });
}

async function claimQueuedShadowValidationClaims(
  client: pg.PoolClient,
  input: {
    tenant_id: string;
    scope: string;
    automation_id?: string | null;
    limit: number;
  },
): Promise<QueuedShadowValidationClaim[]> {
  return await withLocalTransaction(client, async () => {
    const res = await client.query<{
      tenant_id: string;
      scope: string;
      automation_id: string;
      latest_version: number;
      metadata_json: unknown;
    }>(
      `SELECT tenant_id, scope, automation_id, latest_version, metadata_json
         FROM automation_defs
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR scope = $2)
          AND ($3::text IS NULL OR automation_id = $3)
          AND coalesce(metadata_json->'latest_shadow_validation'->>'status', '') = 'queued'
        ORDER BY updated_at ASC
        LIMIT $4
        FOR UPDATE SKIP LOCKED`,
      [input.tenant_id, input.scope || null, input.automation_id ?? null, input.limit],
    );
    const claims: QueuedShadowValidationClaim[] = [];
    for (const row of res.rows) {
      const latest = asObject(asObject(row.metadata_json)?.latest_shadow_validation);
      if (!latest) continue;
      const version = toPositiveIntOrNull(latest.version) ?? row.latest_version;
      const requestId = toStringOrNull(latest.request_id) ?? randomUUID();
      const claim: QueuedShadowValidationClaim = {
        tenant_id: row.tenant_id,
        scope: row.scope,
        automation_id: row.automation_id,
        version,
        request_id: requestId,
        mode: (toStringOrNull(latest.mode) === "inline" ? "inline" : "enqueue"),
        requested_by: toStringOrNull(latest.requested_by),
        note: toStringOrNull(latest.note),
        params: asObject(latest.params) ?? {},
        requested_at: toStringOrNull(latest.requested_at) ?? new Date().toISOString(),
      };
      claims.push(claim);
      await setAutomationShadowValidation(client, {
        tenant_id: claim.tenant_id,
        scope: claim.scope,
        automation_id: claim.automation_id,
        version: claim.version,
        request_id: claim.request_id,
        mode: "enqueue",
        status: "running",
        requested_by: claim.requested_by,
        note: claim.note,
        params: claim.params,
        requested_at: claim.requested_at,
        started_at: new Date().toISOString(),
        append_history: false,
      });
    }
    return claims;
  });
}

async function updateRunNodeRow(client: pg.PoolClient, input: {
  run_id: string;
  node_id: string;
  lifecycle_state?: string;
  pause_reason?: string | null;
  terminal_outcome?: string | null;
  status_summary?: string;
  error_code?: string | null;
  error_message?: string | null;
  input_snapshot_json?: unknown;
  output_snapshot_json?: unknown;
  playbook_version?: number | null;
  playbook_run_id?: string | null;
  clear_playbook_run_id?: boolean;
  approval_id?: string | null;
  compensation_status?: string | null;
  compensation_run_id?: string | null;
  clear_compensation_run_id?: boolean;
  compensation_ref_json?: unknown;
  blocking_node_ids_json?: unknown[];
  started_at?: string | null;
  paused_at?: string | null;
  ended_at?: string | null;
}) {
  await client.query(
    `UPDATE automation_run_nodes
        SET lifecycle_state = COALESCE($3, lifecycle_state),
            pause_reason = CASE WHEN $3 = 'paused' THEN $4 ELSE NULL END,
            terminal_outcome = CASE WHEN $3 = 'terminal' THEN $5 ELSE NULL END,
            status_summary = COALESCE($6, status_summary),
            error_code = $7,
            error_message = $8,
            input_snapshot_json = COALESCE($9::jsonb, input_snapshot_json),
            output_snapshot_json = COALESCE($10::jsonb, output_snapshot_json),
            playbook_version = COALESCE($11::int, playbook_version),
            playbook_run_id = CASE
              WHEN $12::boolean THEN NULL
              ELSE COALESCE($13::uuid, playbook_run_id)
            END,
            approval_id = COALESCE($14, approval_id),
            compensation_status = COALESCE($15, compensation_status),
            compensation_run_id = CASE
              WHEN $16::boolean THEN NULL
              ELSE COALESCE($17::uuid, compensation_run_id)
            END,
            compensation_ref_json = COALESCE($18::jsonb, compensation_ref_json),
            blocking_node_ids_json = COALESCE($19::jsonb, blocking_node_ids_json),
            started_at = COALESCE($20::timestamptz, started_at),
            paused_at = CASE WHEN $3 = 'paused' THEN COALESCE($21::timestamptz, paused_at, now()) ELSE NULL END,
            ended_at = CASE WHEN $3 = 'terminal' THEN COALESCE($22::timestamptz, ended_at, now()) ELSE ended_at END
      WHERE run_id = $1 AND node_id = $2 AND attempt = 1`,
    [
      input.run_id,
      input.node_id,
      input.lifecycle_state ?? null,
      input.pause_reason ?? null,
      input.terminal_outcome ?? null,
      input.status_summary ?? null,
      input.error_code ?? null,
      input.error_message ?? null,
      input.input_snapshot_json == null ? null : JSON.stringify(input.input_snapshot_json),
      input.output_snapshot_json == null ? null : JSON.stringify(input.output_snapshot_json),
      input.playbook_version ?? null,
      input.clear_playbook_run_id === true,
      input.playbook_run_id ?? null,
      input.approval_id ?? null,
      input.compensation_status ?? null,
      input.clear_compensation_run_id === true,
      input.compensation_run_id ?? null,
      input.compensation_ref_json == null ? null : JSON.stringify(input.compensation_ref_json),
      input.blocking_node_ids_json == null ? null : JSON.stringify(input.blocking_node_ids_json),
      input.started_at ?? null,
      input.paused_at ?? null,
      input.ended_at ?? null,
    ],
  );
}

async function resetRunForResume(client: pg.PoolClient, input: {
  run_id: string;
}) {
  await client.query(
    `UPDATE automation_runs
        SET lifecycle_state = 'running',
            pause_reason = NULL,
            terminal_outcome = NULL,
            status_summary = 'running',
            root_cause_code = NULL,
            root_cause_node_id = NULL,
            root_cause_message = NULL,
            paused_at = NULL,
            ended_at = NULL
      WHERE run_id = $1`,
    [input.run_id],
  );
}

function computeDependencyMaps(graph: AutomationGraphInput) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) {
    incoming.set(node.node_id, []);
    outgoing.set(node.node_id, []);
  }
  for (const edge of graph.edges) {
    if (edge.type === "on_failure") {
      throw new HttpError(400, "automation_runtime_unsupported_edge", "on_failure edges are not supported in phase 1 runtime", {
        edge,
      });
    }
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }
  return { incoming, outgoing };
}

async function refreshReadyNodes(client: pg.PoolClient, input: {
  run_id: string;
  graph: AutomationGraphInput;
}) {
  const nodes = await listAutomationRunNodes(client, { run_id: input.run_id });
  const stateByNode = new Map(nodes.map((node) => [node.node_id, node]));
  const { incoming } = computeDependencyMaps(input.graph);
  for (const node of input.graph.nodes) {
    const row = stateByNode.get(node.node_id);
    if (!row || row.lifecycle_state !== "pending") continue;
    const deps = incoming.get(node.node_id) ?? [];
    const blocking = deps.filter((depId) => {
      const dep = stateByNode.get(depId);
      return !dep || dep.lifecycle_state !== "terminal" || !["succeeded", "skipped"].includes(dep.terminal_outcome ?? "");
    });
    const nextState = blocking.length === 0 ? "ready" : "pending";
    await updateRunNodeRow(client, {
      run_id: input.run_id,
      node_id: node.node_id,
      lifecycle_state: nextState,
      status_summary: nextState === "ready" ? "ready" : "blocked_by_dependency",
      blocking_node_ids_json: blocking,
    });
  }
}

async function terminalizeRun(
  client: pg.PoolClient,
  input: {
    run_id: string;
    lifecycle_state: "terminal" | "paused";
    pause_reason?: string | null;
    terminal_outcome?: string | null;
    status_summary: string;
    root_cause_code?: string | null;
    root_cause_node_id?: string | null;
    root_cause_message?: string | null;
    summary_json?: Record<string, unknown>;
    output_snapshot_json?: Record<string, unknown>;
  },
) {
  await updateRunRow(client, input.run_id, {
    lifecycle_state: input.lifecycle_state,
    pause_reason: input.pause_reason ?? null,
    terminal_outcome: input.terminal_outcome ?? null,
    status_summary: input.status_summary,
    root_cause_code: input.root_cause_code ?? null,
    root_cause_node_id: input.root_cause_node_id ?? null,
    root_cause_message: input.root_cause_message ?? null,
    summary_json: input.summary_json ?? {},
    output_snapshot_json: input.output_snapshot_json ?? {},
    paused_at: input.lifecycle_state === "paused" ? new Date().toISOString() : null,
    ended_at: input.lifecycle_state === "terminal" ? new Date().toISOString() : null,
  });
}

function errorCodeFromUnknown(err: unknown): string {
  if (err instanceof HttpError) return err.code;
  return "automation_runtime_error";
}

function errorMessageFromUnknown(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function failAutomationRun(client: pg.PoolClient, input: {
  run_id: string;
  tenant_id: string;
  scope: string;
  error_code: string;
  error_message: string;
  node_id?: string | null;
}) {
  const nodes = await listAutomationRunNodes(client, { run_id: input.run_id });
  let failedNodeId: string | null = input.node_id ?? null;
  const runningNode = nodes.find((node) => node.lifecycle_state === "running");
  if (!failedNodeId && runningNode) failedNodeId = runningNode.node_id;

  for (const node of nodes) {
    if (node.lifecycle_state === "terminal") continue;
    if (failedNodeId && node.node_id === failedNodeId) {
      await updateRunNodeRow(client, {
        run_id: input.run_id,
        node_id: node.node_id,
        lifecycle_state: "terminal",
        terminal_outcome: "failed",
        status_summary: "failed",
        error_code: input.error_code,
        error_message: input.error_message,
        ended_at: new Date().toISOString(),
      });
      continue;
    }
    await updateRunNodeRow(client, {
      run_id: input.run_id,
      node_id: node.node_id,
      lifecycle_state: "terminal",
      terminal_outcome: "skipped",
      status_summary: "skipped",
      error_code: node.error_code,
      error_message: node.error_message,
      ended_at: new Date().toISOString(),
    });
  }

  const finalNodes = await listAutomationRunNodes(client, { run_id: input.run_id });
  await terminalizeRun(client, {
    run_id: input.run_id,
    lifecycle_state: "terminal",
    terminal_outcome: "failed",
    status_summary: "failed",
    root_cause_code: input.error_code,
    root_cause_node_id: failedNodeId,
    root_cause_message: input.error_message,
    summary_json: summarizeRunNodes(finalNodes),
  });
  return await listRunState(client, {
    run_id: input.run_id,
    tenant_id: input.tenant_id,
    scope: input.scope,
  });
}

async function listRunState(client: pg.PoolClient, input: {
  run_id: string;
  tenant_id: string;
  scope: string;
}) {
  const run = await loadAutomationRun(client, input);
  if (!run) {
    throw new HttpError(404, "automation_run_not_found", "automation run was not found", {
      tenant_id: input.tenant_id,
      scope: input.scope,
      run_id: input.run_id,
    });
  }
  const nodes = await listAutomationRunNodes(client, { run_id: input.run_id });
  return { run, nodes };
}

function summarizeRunNodes(nodes: AutomationRunNodeRow[]) {
  return {
    total_nodes: nodes.length,
    succeeded_nodes: nodes.filter((node) => node.terminal_outcome === "succeeded").length,
    failed_nodes: nodes.filter((node) => node.terminal_outcome === "failed").length,
    rejected_nodes: nodes.filter((node) => node.terminal_outcome === "rejected").length,
    skipped_nodes: nodes.filter((node) => node.terminal_outcome === "skipped").length,
    compensated_nodes: nodes.filter((node) => node.terminal_outcome === "compensated").length,
    paused_nodes: nodes.filter((node) => node.lifecycle_state === "paused").length,
    pending_nodes: nodes.filter((node) => node.lifecycle_state === "pending").length,
  };
}

type AutomationCompensationPolicy = {
  mode: "none" | "best_effort" | "required";
  triggers: Set<"on_failure" | "on_cancel" | "on_reject">;
  playbook_id: string | null;
  version: number | null;
  inputs: unknown;
};

function getAutomationCompensationPolicy(node: AutomationGraphNodeInput): AutomationCompensationPolicy | null {
  const policy = asObject(("policy" in node ? node.policy : null) ?? null);
  const comp = asObject(policy?.compensation_policy ?? policy?.compensation ?? null);
  if (!comp) return null;
  const modeRaw = String(comp.mode ?? "none");
  const mode: "none" | "best_effort" | "required" =
    modeRaw === "best_effort" || modeRaw === "required" ? modeRaw : "none";
  const triggerRaw = Array.isArray(comp.trigger) ? comp.trigger : [comp.trigger ?? "on_failure"];
  const triggers = new Set<"on_failure" | "on_cancel" | "on_reject">();
  for (const item of triggerRaw) {
    const value = String(item ?? "");
    if (value === "on_failure" || value === "on_cancel" || value === "on_reject") triggers.add(value);
  }
  const ref = asObject(comp.compensation_ref ?? null);
  const playbookId =
    typeof comp.compensation_playbook_id === "string" && comp.compensation_playbook_id.trim().length > 0
      ? comp.compensation_playbook_id
      : (typeof ref?.playbook_id === "string" && ref.playbook_id.trim().length > 0 ? String(ref.playbook_id) : null);
  const version =
    toPositiveIntOrNull(comp.version)
    ?? toPositiveIntOrNull(comp.compensation_playbook_version)
    ?? toPositiveIntOrNull(ref?.version);
  return {
    mode,
    triggers,
    playbook_id: playbookId,
    version,
    inputs: comp.inputs ?? ref?.inputs ?? {},
  };
}

function collectSucceededNodeOutputs(nodes: AutomationRunNodeRow[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const node of nodes) {
    if (!["succeeded", "compensated"].includes(node.terminal_outcome ?? "")) continue;
    out.set(node.node_id, jsonClone(asObject(node.output_snapshot_json) ?? {}));
  }
  return out;
}

async function runAutomationCompensation(
  client: pg.PoolClient,
  input: {
    run: AutomationRunRow;
    graph: AutomationGraphInput;
    params: Record<string, unknown>;
    actor: string | null;
    trigger: "on_failure" | "on_cancel" | "on_reject";
    original_outcome: "failed" | "cancelled";
    root_cause_code: string;
    root_cause_node_id?: string | null;
    root_cause_message: string;
  },
  opts: AutomationExecutionOptions,
) {
  const topo = validateAutomationGraph(input.graph).topological_order;
  const nodes = await listAutomationRunNodes(client, { run_id: input.run.run_id });
  const rowsByNode = new Map(nodes.map((node) => [node.node_id, node]));
  const nodeDefs = new Map(input.graph.nodes.map((node) => [node.node_id, node]));
  const nodeOutputs = collectSucceededNodeOutputs(nodes);
  const plan = topo
    .slice()
    .reverse()
    .map((nodeId) => {
      const row = rowsByNode.get(nodeId) ?? null;
      const def = nodeDefs.get(nodeId) ?? null;
      return { row, def };
    })
    .filter((item): item is { row: AutomationRunNodeRow; def: AutomationGraphNodeInput } => Boolean(item.row && item.def))
    .filter((item) => item.row.terminal_outcome === "succeeded")
    .map((item) => ({
      ...item,
      compensation: getAutomationCompensationPolicy(item.def),
    }))
    .filter((item) =>
      item.compensation
      && item.compensation.mode !== "none"
      && item.compensation.playbook_id
      && item.compensation.triggers.has(input.trigger),
    );

  if (plan.length === 0) {
    await terminalizeRun(client, {
      run_id: input.run.run_id,
      lifecycle_state: "terminal",
      terminal_outcome: input.original_outcome,
      status_summary: input.original_outcome,
      root_cause_code: input.root_cause_code,
      root_cause_node_id: input.root_cause_node_id ?? null,
      root_cause_message: input.root_cause_message,
      summary_json: summarizeRunNodes(await listAutomationRunNodes(client, { run_id: input.run.run_id })),
    });
    await updateRunRow(client, input.run.run_id, {
      compensation_attempted: false,
      compensation_status: "not_needed",
      compensation_summary_json: {
        trigger: input.trigger,
        attempted_nodes: 0,
        succeeded_nodes: 0,
        failed_nodes: 0,
      },
    });
    return await listRunState(client, {
      run_id: input.run.run_id,
      tenant_id: input.run.tenant_id,
      scope: input.run.scope,
    });
  }

  await updateRunRow(client, input.run.run_id, {
    lifecycle_state: "compensating",
    status_summary: "compensating",
    compensation_attempted: true,
    compensation_status: "running",
    compensation_summary_json: {
      trigger: input.trigger,
      attempted_nodes: plan.length,
      started_at: new Date().toISOString(),
    },
  });

  const results: Array<Record<string, unknown>> = [];
  let failedRequired = false;
  let failedAny = false;
  let succeededCount = 0;

  for (const item of plan) {
    const comp = item.compensation!;
    const ctx = { params: input.params, nodeOutputs };
    const resolvedInputs = jsonClone(resolveBindingValue(comp.inputs ?? {}, ctx));
    await updateRunNodeRow(client, {
      run_id: input.run.run_id,
      node_id: item.row.node_id,
      lifecycle_state: "compensating",
      status_summary: "compensating",
      compensation_status: "running",
      compensation_ref_json: {
        trigger: input.trigger,
        playbook_id: comp.playbook_id,
        version: comp.version,
      },
    });
    try {
      const replayOut: any = await replayPlaybookRun(
        client,
        {
          tenant_id: input.run.tenant_id,
          scope: input.run.scope,
          actor: input.actor ?? undefined,
          playbook_id: comp.playbook_id!,
          version: comp.version ?? undefined,
          mode: "strict",
          params: {
            ...(input.params ?? {}),
            ...(asObject(resolvedInputs) ?? {}),
            allow_local_exec: input.params.allow_local_exec === true,
            record_run: input.params.record_run !== false,
            stop_on_failure: true,
          },
        },
        opts.replayRunOptions,
      );
      const replayReadiness = toStringOrNull(asObject(replayOut?.summary)?.replay_readiness);
      const replayStatus =
        replayOut?.mode === "simulate"
          ? (replayReadiness === "ready" || replayReadiness === "success" ? "success" : "failed")
          : String(replayOut?.run?.status ?? "failed");
      const replayRunId = typeof replayOut?.run?.run_id === "string" ? replayOut.run.run_id : null;
      if (replayStatus !== "success") {
        failedAny = true;
        if (comp.mode === "required") failedRequired = true;
        await updateRunNodeRow(client, {
          run_id: input.run.run_id,
          node_id: item.row.node_id,
          lifecycle_state: "terminal",
          terminal_outcome: item.row.terminal_outcome ?? "succeeded",
          status_summary: "compensation_failed",
          error_code: "compensation_failed",
          error_message: "compensation playbook failed",
          compensation_status: "failed",
          compensation_run_id: replayRunId,
          ended_at: new Date().toISOString(),
        });
        results.push({
          node_id: item.row.node_id,
          status: "failed",
          required: comp.mode === "required",
          compensation_run_id: replayRunId,
        });
        continue;
      }
      succeededCount += 1;
      await updateRunNodeRow(client, {
        run_id: input.run.run_id,
        node_id: item.row.node_id,
        lifecycle_state: "terminal",
        terminal_outcome: "compensated",
        status_summary: "compensated",
        compensation_status: "succeeded",
        compensation_run_id: replayRunId,
        ended_at: new Date().toISOString(),
      });
      results.push({
        node_id: item.row.node_id,
        status: "succeeded",
        compensation_run_id: replayRunId,
      });
    } catch (err) {
      failedAny = true;
      if (comp.mode === "required") failedRequired = true;
      await updateRunNodeRow(client, {
        run_id: input.run.run_id,
        node_id: item.row.node_id,
        lifecycle_state: "terminal",
        terminal_outcome: item.row.terminal_outcome ?? "succeeded",
        status_summary: "compensation_failed",
        error_code: "compensation_failed",
        error_message: errorMessageFromUnknown(err),
        compensation_status: "failed",
        ended_at: new Date().toISOString(),
      });
      results.push({
        node_id: item.row.node_id,
        status: "failed",
        required: comp.mode === "required",
        error_code: errorCodeFromUnknown(err),
      });
    }
  }

  const finalOutcome =
    !failedAny
      ? (input.original_outcome === "cancelled" ? "cancelled_compensated" : "failed_compensated")
      : failedRequired
        ? "failed"
        : input.original_outcome;
  try {
    const finalNodes = await listAutomationRunNodes(client, { run_id: input.run.run_id });
    await maybeInjectAutomationTestFault(opts, {
      action: "automation_compensation_finalize",
      stage: "before_finalize",
      run_id: input.run.run_id,
      node_id: input.root_cause_node_id ?? null,
    });
    await updateRunRow(client, input.run.run_id, {
      compensation_attempted: true,
      compensation_status: failedAny ? "failed" : "succeeded",
      compensation_summary_json: {
        trigger: input.trigger,
        attempted_nodes: plan.length,
        succeeded_nodes: succeededCount,
        failed_nodes: results.filter((row) => row.status === "failed").length,
        results,
      },
    });
    await terminalizeRun(client, {
      run_id: input.run.run_id,
      lifecycle_state: "terminal",
      terminal_outcome: finalOutcome,
      status_summary: finalOutcome,
      root_cause_code: input.root_cause_code,
      root_cause_node_id: input.root_cause_node_id ?? null,
      root_cause_message: input.root_cause_message,
      summary_json: summarizeRunNodes(finalNodes),
    });
    return await listRunState(client, {
      run_id: input.run.run_id,
      tenant_id: input.run.tenant_id,
      scope: input.run.scope,
    });
  } catch (err) {
    const failCode = errorCodeFromUnknown(err);
    const failMessage = errorMessageFromUnknown(err);
    try {
      const failedNodes = await listAutomationRunNodes(client, { run_id: input.run.run_id });
      await updateRunRow(client, input.run.run_id, {
        compensation_attempted: true,
        compensation_status: "failed",
        compensation_summary_json: {
          trigger: input.trigger,
          attempted_nodes: plan.length,
          succeeded_nodes: succeededCount,
          failed_nodes: results.filter((row) => row.status === "failed").length,
          results,
          failed_stage: "finalize",
          error_code: failCode,
        },
      });
      await terminalizeRun(client, {
        run_id: input.run.run_id,
        lifecycle_state: "terminal",
        terminal_outcome: "failed",
        status_summary: "failed",
        root_cause_code: failCode,
        root_cause_node_id: input.root_cause_node_id ?? null,
        root_cause_message: failMessage,
        summary_json: summarizeRunNodes(failedNodes),
      });
      return await listRunState(client, {
        run_id: input.run.run_id,
        tenant_id: input.run.tenant_id,
        scope: input.run.scope,
      });
    } catch {
      throw err;
    }
  }
}

async function continueAutomationRun(
  client: pg.PoolClient,
  input: {
    run: AutomationRunRow;
    versionRow: AutomationVersionRow;
    graph: AutomationGraphInput;
    params: Record<string, unknown>;
    actor: string | null;
    execution_mode: AutomationExecutionMode;
  },
  opts: AutomationExecutionOptions,
) {
  const nodeMap = new Map(input.graph.nodes.map((node) => [node.node_id, node]));
  const topo = validateAutomationGraph(input.graph).topological_order;
  const nodeOutputs = new Map<string, unknown>();

  for (const row of await listAutomationRunNodes(client, { run_id: input.run.run_id })) {
    if (row.terminal_outcome === "succeeded") {
      nodeOutputs.set(row.node_id, jsonClone(asObject(row.output_snapshot_json) ?? {}));
    }
  }

  await refreshReadyNodes(client, { run_id: input.run.run_id, graph: input.graph });
  await updateRunRow(client, input.run.run_id, {
    lifecycle_state: "running",
    pause_reason: null,
    terminal_outcome: null,
    status_summary: "running",
    started_at: input.run.started_at ?? new Date().toISOString(),
  });

  for (const nodeId of topo) {
    const currentNodes = await listAutomationRunNodes(client, { run_id: input.run.run_id });
    const current = currentNodes.find((node) => node.node_id === nodeId && node.attempt === 1);
    if (!current) continue;
    if (current.lifecycle_state === "terminal") continue;
    if (current.lifecycle_state !== "ready") continue;
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const ctx = { params: input.params, nodeOutputs };
    const resolvedInputs = jsonClone(resolveBindingValue(node.inputs ?? {}, ctx));
    await updateRunNodeRow(client, {
      run_id: input.run.run_id,
      node_id: nodeId,
      lifecycle_state: "running",
      status_summary: "running",
      input_snapshot_json: resolvedInputs,
      started_at: current.started_at ?? new Date().toISOString(),
    });
    try {
      if (node.kind === "approval") {
        if (input.execution_mode === "shadow") {
          const output = {
            shadow_auto_approved: true,
            approval_reason: "shadow_execution_skips_human_gate",
            approved_at: new Date().toISOString(),
          };
          nodeOutputs.set(nodeId, output);
          await updateRunNodeRow(client, {
            run_id: input.run.run_id,
            node_id: nodeId,
            lifecycle_state: "terminal",
            terminal_outcome: "succeeded",
            status_summary: "succeeded",
            output_snapshot_json: output,
            ended_at: new Date().toISOString(),
          });
          await refreshReadyNodes(client, { run_id: input.run.run_id, graph: input.graph });
          continue;
        }
        await updateRunNodeRow(client, {
          run_id: input.run.run_id,
          node_id: nodeId,
          lifecycle_state: "paused",
          pause_reason: "approval_required",
          status_summary: deriveAutomationNodeStatusSummary({ lifecycle_state: "paused", pause_reason: "approval_required" }),
        });
        await terminalizeRun(client, {
          run_id: input.run.run_id,
          lifecycle_state: "paused",
          pause_reason: "approval_required",
          status_summary: deriveAutomationRunStatusSummary({ lifecycle_state: "paused", pause_reason: "approval_required" }),
          root_cause_code: "approval_required",
          root_cause_node_id: nodeId,
          root_cause_message: "automation paused on approval node",
          summary_json: summarizeRunNodes(await listAutomationRunNodes(client, { run_id: input.run.run_id })),
        });
        return await listRunState(client, {
          run_id: input.run.run_id,
          tenant_id: input.run.tenant_id,
          scope: input.run.scope,
        });
      }

      if (node.kind === "condition") {
        const passed = evaluateConditionExpression(node.expression, ctx);
        if (!passed) {
          await updateRunNodeRow(client, {
            run_id: input.run.run_id,
            node_id: nodeId,
            lifecycle_state: "terminal",
            terminal_outcome: "failed",
            status_summary: "failed",
            error_code: "condition_failed",
            error_message: "condition node evaluated to false",
            output_snapshot_json: { result: false },
            ended_at: new Date().toISOString(),
          });
          await terminalizeRun(client, {
            run_id: input.run.run_id,
            lifecycle_state: "terminal",
            terminal_outcome: "failed",
            status_summary: "failed",
            root_cause_code: "condition_failed",
            root_cause_node_id: nodeId,
            root_cause_message: "condition node evaluated to false",
            summary_json: summarizeRunNodes(await listAutomationRunNodes(client, { run_id: input.run.run_id })),
          });
          return await listRunState(client, {
            run_id: input.run.run_id,
            tenant_id: input.run.tenant_id,
            scope: input.run.scope,
          });
        }
        const output = { result: true };
        nodeOutputs.set(nodeId, output);
        await updateRunNodeRow(client, {
          run_id: input.run.run_id,
          node_id: nodeId,
          lifecycle_state: "terminal",
          terminal_outcome: "succeeded",
          status_summary: "succeeded",
          output_snapshot_json: output,
          ended_at: new Date().toISOString(),
        });
        await refreshReadyNodes(client, { run_id: input.run.run_id, graph: input.graph });
        continue;
      }

      if (node.kind === "artifact_gate") {
        const refs = Array.isArray(node.required_artifacts) ? node.required_artifacts : [];
        const resolved = refs.map((ref) => resolveBindingValue(ref, ctx));
        const missing = refs.filter((_, index) => resolved[index] == null || resolved[index] === "");
        if (missing.length > 0) {
          await updateRunNodeRow(client, {
            run_id: input.run.run_id,
            node_id: nodeId,
            lifecycle_state: "terminal",
            terminal_outcome: "failed",
            status_summary: "failed",
            error_code: "artifact_gate_missing",
            error_message: "required artifacts were not available",
            output_snapshot_json: { missing_artifacts: missing },
            ended_at: new Date().toISOString(),
          });
          await terminalizeRun(client, {
            run_id: input.run.run_id,
            lifecycle_state: "terminal",
            terminal_outcome: "failed",
            status_summary: "failed",
            root_cause_code: "artifact_gate_missing",
            root_cause_node_id: nodeId,
            root_cause_message: "artifact gate requirements not satisfied",
            summary_json: summarizeRunNodes(await listAutomationRunNodes(client, { run_id: input.run.run_id })),
          });
          return await listRunState(client, {
            run_id: input.run.run_id,
            tenant_id: input.run.tenant_id,
            scope: input.run.scope,
          });
        }
        const output = { artifacts: resolved };
        nodeOutputs.set(nodeId, output);
        await updateRunNodeRow(client, {
          run_id: input.run.run_id,
          node_id: nodeId,
          lifecycle_state: "terminal",
          terminal_outcome: "succeeded",
          status_summary: "succeeded",
          output_snapshot_json: output,
          ended_at: new Date().toISOString(),
        });
        await refreshReadyNodes(client, { run_id: input.run.run_id, graph: input.graph });
        continue;
      }

      const replayOut: any = await replayPlaybookRun(
        client,
        {
          tenant_id: input.run.tenant_id,
          scope: input.run.scope,
          actor: input.actor ?? undefined,
          playbook_id: node.playbook_id,
          version: node.version,
          mode: input.execution_mode === "shadow" ? "simulate" : (node.mode ?? "simulate"),
          params: {
            ...(input.params ?? {}),
            ...(asObject(resolvedInputs) ?? {}),
            allow_local_exec: input.params.allow_local_exec === true,
            record_run: input.params.record_run !== false,
            stop_on_failure: input.params.stop_on_failure !== false,
          },
        },
        opts.replayRunOptions,
      );
      const replayReadiness = toStringOrNull(asObject(replayOut?.summary)?.replay_readiness);
      const replayStatus =
        replayOut?.mode === "simulate"
          ? (replayReadiness === "ready" || replayReadiness === "success" ? "success" : "failed")
          : String(replayOut?.run?.status ?? "failed");
      const replayRunId = typeof replayOut?.run?.run_id === "string" ? replayOut.run.run_id : null;
      const replayPlaybookVersion = toPositiveIntOrNull(asObject(replayOut?.playbook)?.version) ?? node.version ?? null;
      const output = {
        playbook: replayOut?.playbook ?? null,
        mode: replayOut?.mode ?? null,
        run: replayOut?.run ?? null,
        summary: replayOut?.summary ?? null,
        execution: replayOut?.execution ?? null,
        steps: Array.isArray(replayOut?.steps) ? replayOut.steps.slice(0, 20) : [],
      };
      if (replayStatus === "success") {
        nodeOutputs.set(nodeId, output);
        await updateRunNodeRow(client, {
          run_id: input.run.run_id,
          node_id: nodeId,
          lifecycle_state: "terminal",
          terminal_outcome: "succeeded",
          status_summary: "succeeded",
          output_snapshot_json: output,
          playbook_version: replayPlaybookVersion,
          playbook_run_id: replayRunId,
          ended_at: new Date().toISOString(),
        });
        await refreshReadyNodes(client, { run_id: input.run.run_id, graph: input.graph });
        continue;
      }
      if (replayStatus === "partial") {
        await updateRunNodeRow(client, {
          run_id: input.run.run_id,
          node_id: nodeId,
          lifecycle_state: "paused",
          pause_reason: "repair_required",
          status_summary: "paused_for_repair",
          output_snapshot_json: output,
          playbook_version: replayPlaybookVersion,
          playbook_run_id: replayRunId,
        });
        await terminalizeRun(client, {
          run_id: input.run.run_id,
          lifecycle_state: "paused",
          pause_reason: "repair_required",
          status_summary: "paused_for_repair",
          root_cause_code: "guided_repair_pending",
          root_cause_node_id: nodeId,
          root_cause_message: "playbook replay entered guided repair state",
          summary_json: summarizeRunNodes(await listAutomationRunNodes(client, { run_id: input.run.run_id })),
        });
        return await listRunState(client, {
          run_id: input.run.run_id,
          tenant_id: input.run.tenant_id,
          scope: input.run.scope,
        });
      }

      await updateRunNodeRow(client, {
        run_id: input.run.run_id,
        node_id: nodeId,
        lifecycle_state: "terminal",
        terminal_outcome: "failed",
        status_summary: "failed",
        error_code: "playbook_run_failed",
        error_message: "playbook replay failed",
        output_snapshot_json: output,
        playbook_version: replayPlaybookVersion,
        playbook_run_id: replayRunId,
        ended_at: new Date().toISOString(),
      });
      await terminalizeRun(client, {
        run_id: input.run.run_id,
        lifecycle_state: "terminal",
        terminal_outcome: "failed",
        status_summary: "failed",
        root_cause_code: "playbook_run_failed",
        root_cause_node_id: nodeId,
        root_cause_message: "playbook replay failed",
        summary_json: summarizeRunNodes(await listAutomationRunNodes(client, { run_id: input.run.run_id })),
      });
      return await listRunState(client, {
        run_id: input.run.run_id,
        tenant_id: input.run.tenant_id,
        scope: input.run.scope,
      });
    } catch (err) {
      return await failAutomationRun(client, {
        run_id: input.run.run_id,
        tenant_id: input.run.tenant_id,
        scope: input.run.scope,
        node_id: nodeId,
        error_code: errorCodeFromUnknown(err),
        error_message: errorMessageFromUnknown(err),
      });
    }
  }

  const finalNodes = await listAutomationRunNodes(client, { run_id: input.run.run_id });
  await terminalizeRun(client, {
    run_id: input.run.run_id,
    lifecycle_state: "terminal",
    terminal_outcome: "succeeded",
    status_summary: "succeeded",
    summary_json: summarizeRunNodes(finalNodes),
    output_snapshot_json: Object.fromEntries(nodeOutputs.entries()),
  });
  return await listRunState(client, {
    run_id: input.run.run_id,
    tenant_id: input.run.tenant_id,
    scope: input.run.scope,
  });
}

export async function automationCreate(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationCreateInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const validation = validateAutomationGraph(parsed.graph);
  const existing = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  const nextVersion = existing ? Number(existing.latest_version) + 1 : 1;
  const compileSummary = {
    node_count: parsed.graph.nodes.length,
    edge_count: parsed.graph.edges.length,
    start_node_ids: validation.start_node_ids,
    topological_order: validation.topological_order,
  };

  await client.query(
    `INSERT INTO automation_defs (
       tenant_id, scope, automation_id, name, status, latest_version,
       input_contract_json, output_contract_json, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
     ON CONFLICT (tenant_id, scope, automation_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       latest_version = EXCLUDED.latest_version,
       input_contract_json = EXCLUDED.input_contract_json,
       output_contract_json = EXCLUDED.output_contract_json,
       metadata_json = EXCLUDED.metadata_json,
       updated_at = now()`,
    [
      tenancy.tenant_id,
      tenancy.scope,
      parsed.automation_id,
      parsed.name,
      parsed.status,
      nextVersion,
      JSON.stringify(parsed.input_contract ?? {}),
      JSON.stringify(parsed.output_contract ?? {}),
      JSON.stringify(parsed.metadata ?? {}),
    ],
  );

  await client.query(
    `INSERT INTO automation_versions (
       tenant_id, scope, automation_id, version, status,
       graph_json, compile_summary_json, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [
      tenancy.tenant_id,
      tenancy.scope,
      parsed.automation_id,
      nextVersion,
      parsed.status,
      JSON.stringify(parsed.graph),
      JSON.stringify(compileSummary),
      JSON.stringify(parsed.metadata ?? {}),
    ],
  );

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation: {
      automation_id: parsed.automation_id,
      name: parsed.name,
      status: parsed.status,
      version: nextVersion,
      latest_version: nextVersion,
      input_contract: jsonClone(parsed.input_contract ?? {}),
      output_contract: jsonClone(parsed.output_contract ?? {}),
      metadata: jsonClone(parsed.metadata ?? {}),
      graph: jsonClone(parsed.graph),
      compile_summary: compileSummary,
      actor: parsed.actor ?? null,
    },
    validation,
  };
}

export async function automationValidate(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationValidateInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const validation = validateAutomationGraph(parsed.graph);
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    validation,
    graph: jsonClone(parsed.graph),
  };
}

export async function automationTelemetry(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationTelemetryInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const aggregate = await loadAutomationTelemetryAggregate(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id ?? null,
    window_hours: parsed.window_hours,
  });
  const rootCauses = await listAutomationTelemetryRootCauses(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id ?? null,
    window_hours: parsed.window_hours,
    limit: 8,
  });
  const incidents = await listAutomationTelemetryIncidentRuns(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id ?? null,
    window_hours: parsed.window_hours,
    limit: parsed.incident_limit,
  });
  const totalRuns = Number(aggregate?.total_runs ?? 0);
  const terminalRuns = Number(aggregate?.terminal_runs ?? 0);
  const succeededRuns = Number(aggregate?.succeeded_runs ?? 0);
  const failedRuns = Number(aggregate?.failed_runs ?? 0);
  const cancelledRuns = Number(aggregate?.cancelled_runs ?? 0);
  const compensatedRuns = Number(aggregate?.compensated_runs ?? 0);
  const pausedRuns = Number(aggregate?.paused_runs ?? 0);
  const repairPausedRuns = Number(aggregate?.repair_paused_runs ?? 0);
  const approvalPausedRuns = Number(aggregate?.approval_paused_runs ?? 0);
  const compensationFailedRuns = Number(aggregate?.compensation_failed_runs ?? 0);
  const shadowRuns = Number(aggregate?.shadow_runs ?? 0);
  const activeRuns = Number(aggregate?.active_runs ?? 0);
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    window_hours: parsed.window_hours,
    automation_id: parsed.automation_id ?? null,
    summary: {
      total_runs: totalRuns,
      terminal_runs: terminalRuns,
      succeeded_runs: succeededRuns,
      failed_runs: failedRuns,
      cancelled_runs: cancelledRuns,
      compensated_runs: compensatedRuns,
      paused_runs: pausedRuns,
      repair_paused_runs: repairPausedRuns,
      approval_paused_runs: approvalPausedRuns,
      compensation_failed_runs: compensationFailedRuns,
      shadow_runs: shadowRuns,
      active_runs: activeRuns,
      success_rate: terminalRuns > 0 ? Number((succeededRuns / terminalRuns).toFixed(4)) : null,
      pause_rate: totalRuns > 0 ? Number((pausedRuns / totalRuns).toFixed(4)) : null,
      compensation_failure_rate: totalRuns > 0 ? Number((compensationFailedRuns / totalRuns).toFixed(4)) : null,
      p95_duration_seconds: aggregate?.p95_duration_seconds == null ? null : Number(aggregate.p95_duration_seconds),
      slo: {
        success_rate_target: 0.95,
        success_rate_met: terminalRuns > 0 ? succeededRuns / terminalRuns >= 0.95 : null,
        compensation_failure_budget_target: 0.02,
        compensation_failure_budget_met: totalRuns > 0 ? compensationFailedRuns / totalRuns <= 0.02 : null,
      },
    },
    alert_candidates: deriveAutomationAlertCandidates({
      total_runs: totalRuns,
      paused_runs: pausedRuns,
      repair_paused_runs: repairPausedRuns,
      compensation_failed_runs: compensationFailedRuns,
      success_rate: terminalRuns > 0 ? Number((succeededRuns / terminalRuns).toFixed(4)) : null,
      compensation_failure_rate: totalRuns > 0 ? Number((compensationFailedRuns / totalRuns).toFixed(4)) : null,
      slo: {
        success_rate_target: 0.95,
        success_rate_met: terminalRuns > 0 ? succeededRuns / terminalRuns >= 0.95 : null,
        compensation_failure_budget_target: 0.02,
        compensation_failure_budget_met: totalRuns > 0 ? compensationFailedRuns / totalRuns <= 0.02 : null,
      },
    }),
    root_causes: rootCauses.map((row) => ({
      root_cause_code: row.root_cause_code,
      count: Number(row.count),
    })),
    incidents: incidents.map((run) => ({
      ...decorateRunWithExecutionMode(run),
      action_hint: deriveAutomationRunActionHint(run),
      review_assignment: jsonClone(extractRunReviewAssignment(run.context_json) ?? {}),
      compensation_assessment: deriveAutomationCompensationAssessment(run),
      compensation_workflow: deriveAutomationCompensationWorkflow(run),
    })),
  };
}

export async function automationCompensationPolicyMatrix(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationCompensationPolicyMatrixInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    matrix: AUTOMATION_COMPENSATION_POLICY_MATRIX.map((entry) => ({ ...entry })),
  };
}

export async function automationList(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationListInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const rows = await listAutomationDefs(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    status: parsed.status ?? null,
    promotion_only: parsed.promotion_only,
    reviewer: parsed.reviewer ?? null,
    limit: parsed.limit,
  });
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automations: rows.map((row) => {
      const shadowValidation = jsonClone(extractAutomationShadowValidation(row.metadata_json, row.latest_version) ?? {});
      const validationStatus = toStringOrNull(asObject(shadowValidation)?.status);
      const actionHint = row.version_status !== "shadow"
        ? null
        : validationStatus === "queued"
          ? "shadow_validation_queued"
          : validationStatus === "running"
            ? "shadow_validation_running"
            : validationStatus === "failed"
              ? "rerun_shadow_validation"
              : !validationStatus
                ? "run_shadow_validation"
                : "review_for_activation";
      return {
        automation_id: row.automation_id,
        name: row.name,
        status: row.version_status,
        definition_status: row.status,
        version: row.latest_version,
        latest_version: row.latest_version,
        metadata: jsonClone(asObject(row.metadata_json) ?? {}),
        version_metadata: jsonClone(asObject(row.version_metadata_json) ?? {}),
        compile_summary: jsonClone(asObject(row.compile_summary_json) ?? {}),
        review_assignment: jsonClone(extractAutomationReviewAssignment(row.metadata_json, row.latest_version) ?? {}),
        shadow_review: jsonClone(extractAutomationShadowReview(row.metadata_json, row.latest_version) ?? {}),
        shadow_validation: shadowValidation,
        updated_at: row.updated_at,
        version_created_at: row.version_created_at,
        action_hint: actionHint,
      };
    }),
  };
}

export async function automationGet(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationGetInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const versionClause = parsed.version != null ? "v.version = $4" : "v.version = d.latest_version";
  const params = parsed.version != null
    ? [tenancy.tenant_id, tenancy.scope, parsed.automation_id, parsed.version]
    : [tenancy.tenant_id, tenancy.scope, parsed.automation_id];
  const res = await client.query<AutomationGetRow>(
    `SELECT d.tenant_id, d.scope, d.automation_id, d.name, d.status, d.latest_version,
            d.input_contract_json, d.output_contract_json, d.metadata_json,
            d.created_at::text, d.updated_at::text,
            v.status AS version_status,
            v.version, v.graph_json, v.compile_summary_json,
            v.metadata_json AS version_metadata_json,
            v.created_at::text AS version_created_at
       FROM automation_defs d
       JOIN automation_versions v
         ON v.tenant_id = d.tenant_id
        AND v.scope = d.scope
        AND v.automation_id = d.automation_id
      WHERE d.tenant_id = $1
        AND d.scope = $2
        AND d.automation_id = $3
        AND ${versionClause}
      LIMIT 1`,
    params,
  );
  const row = res.rows[0] ?? null;
  if (!row) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: parsed.version ?? null,
    });
  }
  const graph = AutomationGraph.parse(row.graph_json);
  const validation = validateAutomationGraph(graph);
  return {
    tenant_id: row.tenant_id,
    scope: row.scope,
    automation: {
      automation_id: row.automation_id,
      name: row.name,
      status: row.version_status,
      definition_status: row.status,
      version: row.version,
      latest_version: row.latest_version,
      input_contract: jsonClone(asObject(row.input_contract_json) ?? {}),
      output_contract: jsonClone(asObject(row.output_contract_json) ?? {}),
      metadata: jsonClone(asObject(row.metadata_json) ?? {}),
      version_metadata: jsonClone(asObject(row.version_metadata_json) ?? {}),
      review_assignment: jsonClone(extractAutomationReviewAssignment(row.metadata_json, row.version) ?? {}),
      shadow_review: jsonClone(extractAutomationShadowReview(row.metadata_json, row.version) ?? {}),
      shadow_validation: jsonClone(extractAutomationShadowValidation(row.metadata_json, row.version) ?? {}),
      graph: jsonClone(graph),
      compile_summary: jsonClone(asObject(row.compile_summary_json) ?? {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
      version_created_at: row.version_created_at,
    },
    validation,
  };
}

export async function automationAssignReviewer(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationAssignReviewerInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const def = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  if (!def) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  await setAutomationReviewAssignment(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: def.latest_version,
    reviewer: parsed.reviewer,
    actor: parsed.actor ?? null,
    note: parsed.note ?? null,
  });
  return automationGet(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: def.latest_version,
  }, opts);
}

export async function automationShadowReview(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationShadowReviewInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const def = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  if (!def) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  const targetVersion = parsed.shadow_version ?? def.latest_version;
  const versionRow = await loadAutomationVersion(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: targetVersion,
  });
  if (!versionRow) {
    throw new HttpError(404, "automation_version_not_found", "shadow review target version was not found", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: targetVersion,
    });
  }
  if (versionRow.status !== "shadow") {
    throw new HttpError(409, "automation_version_not_shadow", "shadow review requires a shadow automation version", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: targetVersion,
      status: versionRow.status,
    });
  }
  await setAutomationShadowReview(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: targetVersion,
    verdict: parsed.verdict,
    actor: parsed.actor ?? null,
    note: parsed.note ?? null,
  });
  return automationShadowReport(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    shadow_version: targetVersion,
  }, opts);
}

export async function automationShadowValidate(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationShadowValidateInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const def = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  if (!def) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  const targetVersion = parsed.shadow_version ?? def.latest_version;
  const versionRow = await loadAutomationVersion(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: targetVersion,
  });
  if (!versionRow) {
    throw new HttpError(404, "automation_version_not_found", "shadow validation target version was not found", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: targetVersion,
    });
  }
  if (versionRow.status !== "shadow") {
    throw new HttpError(409, "automation_version_not_shadow", "shadow validation requires a shadow automation version", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: targetVersion,
      status: versionRow.status,
    });
  }

  const requestId = randomUUID();
  const requestedAt = new Date().toISOString();
  if (parsed.mode === "enqueue") {
    await withLocalTransaction(client, async () => {
      await setAutomationShadowValidation(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        version: targetVersion,
        request_id: requestId,
        mode: "enqueue",
        status: "queued",
      requested_by: parsed.actor ?? null,
      note: parsed.note ?? null,
      params: asObject(parsed.params) ?? {},
      requested_at: requestedAt,
      append_history: true,
      });
    });
    const report = await automationShadowReport(client, {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      shadow_version: targetVersion,
    }, opts);
    return {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      accepted: true,
      queued: true,
      validation_request: report.versions?.shadow?.shadow_validation ?? null,
      report,
    };
  }

  await withLocalTransaction(client, async () => {
    await setAutomationShadowValidation(client, {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: targetVersion,
      request_id: requestId,
      mode: "inline",
      status: "running",
      requested_by: parsed.actor ?? null,
      note: parsed.note ?? null,
      params: asObject(parsed.params) ?? {},
      requested_at: requestedAt,
      started_at: requestedAt,
      append_history: false,
    });
  });

  let run: Record<string, unknown> | null = null;
  let failureCode: string | null = null;
  let failureMessage: string | null = null;
  try {
    const out = await automationRun(client, {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      actor: parsed.actor ?? "shadow_validator",
      automation_id: parsed.automation_id,
      version: targetVersion,
      params: parsed.params ?? {},
      options: {
        execution_mode: "shadow",
      },
    }, opts);
    run = jsonClone(out.run ?? null);
  } catch (err) {
    failureCode = errorCodeFromUnknown(err);
    failureMessage = errorMessageFromUnknown(err);
  }

  const completedAt = new Date().toISOString();
  await withLocalTransaction(client, async () => {
    await setAutomationShadowValidation(client, {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: targetVersion,
      request_id: requestId,
      mode: "inline",
      status: failureCode ? "failed" : "completed",
      requested_by: parsed.actor ?? null,
      note: parsed.note ?? null,
      params: asObject(parsed.params) ?? {},
      requested_at: requestedAt,
      started_at: requestedAt,
      completed_at: completedAt,
      run_id: toStringOrNull(run?.run_id),
      run_status_summary: toStringOrNull(run?.status_summary),
      run_terminal_outcome: toStringOrNull(run?.terminal_outcome),
      failure_code: failureCode,
      failure_message: failureMessage,
      append_history: true,
    });
  });

  const report = await automationShadowReport(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    shadow_version: targetVersion,
  }, opts);
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    accepted: true,
    queued: false,
    validation_request: report.versions?.shadow?.shadow_validation ?? null,
    run,
    report,
  };
}

export async function automationShadowValidateDispatch(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationShadowValidateDispatchInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  if (parsed.dry_run) {
    const preview = await previewQueuedShadowValidationClaims(client, {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id ?? null,
      limit: parsed.limit,
    });
    return {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id ?? null,
      limit: parsed.limit,
      dry_run: true,
      matched: preview.length,
      claims: preview,
    };
  }

  const claims = await claimQueuedShadowValidationClaims(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id ?? null,
    limit: parsed.limit,
  });
  const results: Array<Record<string, unknown>> = [];
  for (const claim of claims) {
    try {
      const versionRow = await loadAutomationVersion(client, {
        tenant_id: claim.tenant_id,
        scope: claim.scope,
        automation_id: claim.automation_id,
        version: claim.version,
      });
      if (!versionRow || versionRow.status !== "shadow") {
        await withLocalTransaction(client, async () => {
          await setAutomationShadowValidation(client, {
            tenant_id: claim.tenant_id,
            scope: claim.scope,
            automation_id: claim.automation_id,
            version: claim.version,
            request_id: claim.request_id,
            mode: "enqueue",
            status: "failed",
            requested_by: claim.requested_by,
            note: claim.note,
            params: claim.params,
            requested_at: claim.requested_at,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            failure_code: !versionRow ? "automation_version_not_found" : "automation_version_not_shadow",
            failure_message: !versionRow ? "shadow validation target version was not found" : "shadow validation target is no longer a shadow version",
            append_history: true,
          });
        });
        results.push({
          automation_id: claim.automation_id,
          version: claim.version,
          request_id: claim.request_id,
          status: "failed",
          failure_code: !versionRow ? "automation_version_not_found" : "automation_version_not_shadow",
        });
        continue;
      }
      const out = await automationRun(client, {
        tenant_id: claim.tenant_id,
        scope: claim.scope,
        actor: claim.requested_by ?? parsed.actor ?? "shadow_validator",
        automation_id: claim.automation_id,
        version: claim.version,
        params: claim.params,
        options: {
          execution_mode: "shadow",
        },
      }, opts);
      const run = asObject(out.run) ?? {};
      const terminalOutcome = toStringOrNull(run.terminal_outcome);
      const status = terminalOutcome === "succeeded" ? "completed" : "failed";
      await withLocalTransaction(client, async () => {
        await setAutomationShadowValidation(client, {
          tenant_id: claim.tenant_id,
          scope: claim.scope,
          automation_id: claim.automation_id,
          version: claim.version,
          request_id: claim.request_id,
          mode: "enqueue",
          status,
          requested_by: claim.requested_by,
          note: claim.note,
          params: claim.params,
          requested_at: claim.requested_at,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          run_id: toStringOrNull(run.run_id),
          run_status_summary: toStringOrNull(run.status_summary),
          run_terminal_outcome: terminalOutcome,
          failure_code: status === "failed" ? (toStringOrNull(run.root_cause_code) ?? "shadow_validation_run_failed") : null,
          failure_message: status === "failed" ? (toStringOrNull(run.root_cause_message) ?? "shadow validation run failed") : null,
          append_history: true,
        });
      });
      results.push({
        automation_id: claim.automation_id,
        version: claim.version,
        request_id: claim.request_id,
        status,
        run_id: toStringOrNull(run.run_id),
        run_terminal_outcome: terminalOutcome,
      });
    } catch (err) {
      const failureCode = errorCodeFromUnknown(err);
      const failureMessage = errorMessageFromUnknown(err);
      await withLocalTransaction(client, async () => {
        await setAutomationShadowValidation(client, {
          tenant_id: claim.tenant_id,
          scope: claim.scope,
          automation_id: claim.automation_id,
          version: claim.version,
          request_id: claim.request_id,
          mode: "enqueue",
          status: "failed",
          requested_by: claim.requested_by,
          note: claim.note,
          params: claim.params,
          requested_at: claim.requested_at,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          failure_code: failureCode,
          failure_message: failureMessage,
          append_history: true,
        });
      });
      results.push({
        automation_id: claim.automation_id,
        version: claim.version,
        request_id: claim.request_id,
        status: "failed",
        failure_code: failureCode,
      });
    }
  }
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id ?? null,
    limit: parsed.limit,
    dry_run: false,
    matched: claims.length,
    dispatched: claims.length,
    completed: results.filter((row) => row.status === "completed").length,
    failed: results.filter((row) => row.status === "failed").length,
    results,
  };
}

export async function automationShadowReport(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationShadowReportInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const def = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  if (!def) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  const shadowVersion = parsed.shadow_version != null
    ? await loadAutomationVersion(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        version: parsed.shadow_version,
      })
    : await loadLatestAutomationVersionByStatus(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        status: "shadow",
      });
  const activeVersion = parsed.active_version != null
    ? await loadAutomationVersion(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        version: parsed.active_version,
      })
    : await loadLatestAutomationVersionByStatus(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        status: "active",
      });

  const normalizedShadowVersion = shadowVersion ? {
    version: shadowVersion.version,
    status: shadowVersion.status,
    compile_summary: jsonClone(asObject(shadowVersion.compile_summary_json) ?? {}),
    version_metadata: jsonClone(asObject(shadowVersion.metadata_json) ?? {}),
    review_assignment: jsonClone(extractAutomationReviewAssignment(def.metadata_json, shadowVersion.version) ?? {}),
    shadow_review: jsonClone(extractAutomationShadowReview(def.metadata_json, shadowVersion.version) ?? {}),
    shadow_review_history: jsonClone(extractAutomationShadowReviewHistory(def.metadata_json, shadowVersion.version)),
    shadow_validation: jsonClone(extractAutomationShadowValidation(def.metadata_json, shadowVersion.version) ?? {}),
    shadow_validation_history: jsonClone(extractAutomationShadowValidationHistory(def.metadata_json, shadowVersion.version)),
    created_at: shadowVersion.created_at,
  } : null;
  const normalizedActiveVersion = activeVersion ? {
    version: activeVersion.version,
    status: activeVersion.status,
    compile_summary: jsonClone(asObject(activeVersion.compile_summary_json) ?? {}),
    version_metadata: jsonClone(asObject(activeVersion.metadata_json) ?? {}),
    created_at: activeVersion.created_at,
  } : null;

  const shadowRun = shadowVersion
    ? await loadLatestAutomationRunByVersion(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        automation_version: shadowVersion.version,
        execution_mode: "shadow",
      })
    : null;
  const activeRun = activeVersion
    ? await loadLatestAutomationRunByVersion(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        automation_version: activeVersion.version,
        execution_mode: "default",
      })
    : null;
  const shadowNodes = shadowRun ? latestNodeAttempts(await listAutomationRunNodes(client, { run_id: shadowRun.run_id })) : [];
  const activeNodes = activeRun ? latestNodeAttempts(await listAutomationRunNodes(client, { run_id: activeRun.run_id })) : [];
  const recentShadowRuns = shadowVersion
    ? await listRecentAutomationRuns(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        automation_version: shadowVersion.version,
        execution_mode: "shadow",
        limit: 5,
      })
    : [];
  const recentActiveRuns = activeVersion
    ? await listRecentAutomationRuns(client, {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        automation_version: activeVersion.version,
        execution_mode: "default",
        limit: 5,
      })
    : [];
  const nodeCompare = compareAutomationRunNodes(shadowNodes, activeNodes);
  const readiness = deriveShadowPromotionReadiness({
    shadowVersion: shadowVersion as AutomationShadowReportVersionRow | null,
    activeVersion: activeVersion as AutomationShadowReportVersionRow | null,
    shadowRun,
    shadowReview: normalizedShadowVersion?.shadow_review ?? null,
    shadowValidation: normalizedShadowVersion?.shadow_validation ?? null,
    nodeCompare,
  });

  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    versions: {
      shadow: normalizedShadowVersion,
      active: normalizedActiveVersion,
    },
    runs: {
      shadow: shadowRun
        ? {
            ...decorateRunWithExecutionMode(shadowRun),
            review_assignment: jsonClone(extractRunReviewAssignment(shadowRun.context_json) ?? {}),
          }
        : null,
      active: activeRun
        ? {
            ...decorateRunWithExecutionMode(activeRun),
          }
        : null,
    },
    evidence: {
      shadow: summarizeShadowNodeEvidence(shadowNodes),
      active: summarizeShadowNodeEvidence(activeNodes),
    },
    history: {
      shadow_runs: recentShadowRuns.map((row) => ({
        ...decorateRunWithExecutionMode(row),
        review_assignment: jsonClone(extractRunReviewAssignment(row.context_json) ?? {}),
      })),
      active_runs: recentActiveRuns.map((row) => ({
        ...decorateRunWithExecutionMode(row),
      })),
      shadow_reviews: Array.isArray(normalizedShadowVersion?.shadow_review_history)
        ? normalizedShadowVersion.shadow_review_history
        : [],
      shadow_validations: Array.isArray(normalizedShadowVersion?.shadow_validation_history)
        ? normalizedShadowVersion.shadow_validation_history
        : [],
    },
    notes: {
      shadow_review_note: normalizedShadowVersion?.shadow_review?.note ?? null,
      shadow_review_verdict: normalizedShadowVersion?.shadow_review?.verdict ?? null,
      shadow_validation_status: normalizedShadowVersion?.shadow_validation?.status ?? null,
      shadow_promotion_note: asObject(normalizedShadowVersion?.version_metadata)?.promotion_note ?? null,
      active_promotion_note: asObject(normalizedActiveVersion?.version_metadata)?.promotion_note ?? null,
    },
    comparison: {
      readiness,
      changed_nodes: nodeCompare.changed_nodes,
      node_deltas: nodeCompare.deltas,
    },
  };
}

export async function automationPromote(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationPromoteInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const def = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  if (!def) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  const latest = await loadAutomationVersion(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: def.latest_version,
  });
  if (!latest) {
    throw new HttpError(404, "automation_version_not_found", "latest automation version was not found", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: def.latest_version,
    });
  }
  let source = latest;
  if (parsed.from_version != null) {
    const byVersion = await loadAutomationVersion(client, {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: parsed.from_version,
    });
    if (!byVersion) {
      throw new HttpError(404, "automation_version_not_found", "from_version was not found for this automation", {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        from_version: parsed.from_version,
      });
    }
    source = byVersion;
  }
  if (source.version !== latest.version) {
    throw new HttpError(409, "automation_promote_stale_source", "only the latest automation version can be promoted", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      latest_version: latest.version,
      from_version: source.version,
    });
  }
  if (parsed.target_status === "active") {
    if (source.status !== "shadow") {
      throw new HttpError(409, "automation_promote_requires_shadow_source", "active promotion requires the latest version to be in shadow status", {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        source_status: source.status,
        source_version: source.version,
      });
    }
    const shadowReview = extractAutomationShadowReview(def.metadata_json, source.version);
    const reviewVerdict = toStringOrNull(shadowReview?.verdict);
    if (reviewVerdict !== "approved") {
      throw new HttpError(409, "automation_shadow_review_required", "active promotion requires an approved shadow review verdict", {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        automation_id: parsed.automation_id,
        source_version: source.version,
        shadow_review_verdict: reviewVerdict,
      });
    }
  }
  const sourceGraph = AutomationGraph.parse(source.graph_json);
  const validation = validateAutomationGraph(sourceGraph);
  if (source.status === parsed.target_status && source.version === latest.version) {
    return {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      from_version: source.version,
      to_version: latest.version,
      unchanged: true,
      reason: "already_target_status_on_latest",
      automation: {
        automation_id: def.automation_id,
        name: def.name,
        status: latest.status,
        version: latest.version,
        latest_version: def.latest_version,
        input_contract: jsonClone(asObject(def.input_contract_json) ?? {}),
        output_contract: jsonClone(asObject(def.output_contract_json) ?? {}),
        metadata: jsonClone(asObject(def.metadata_json) ?? {}),
        version_metadata: jsonClone(asObject(latest.metadata_json) ?? {}),
        graph: jsonClone(sourceGraph),
        compile_summary: jsonClone(asObject(latest.compile_summary_json) ?? {}),
        created_at: def.created_at,
        updated_at: def.updated_at,
        version_created_at: latest.created_at,
      },
      validation,
    };
  }
  const nextVersion = def.latest_version + 1;
  const nextVersionMetadata = {
    ...(asObject(source.metadata_json) ?? {}),
    promoted_from_version: source.version,
    promoted_at: new Date().toISOString(),
    promotion_note: parsed.note ?? null,
    promotion_metadata: jsonClone(parsed.metadata ?? {}),
  };
  await client.query(
    `INSERT INTO automation_versions (
       tenant_id, scope, automation_id, version, status,
       graph_json, compile_summary_json, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [
      tenancy.tenant_id,
      tenancy.scope,
      parsed.automation_id,
      nextVersion,
      parsed.target_status,
      JSON.stringify(sourceGraph),
      JSON.stringify(asObject(source.compile_summary_json) ?? {}),
      JSON.stringify(nextVersionMetadata),
    ],
  );
  await client.query(
    `UPDATE automation_defs
        SET status = $4,
            latest_version = $5,
            updated_at = now()
      WHERE tenant_id = $1
        AND scope = $2
        AND automation_id = $3`,
    [
      tenancy.tenant_id,
      tenancy.scope,
      parsed.automation_id,
      parsed.target_status,
      nextVersion,
    ],
  );
  const refreshed = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  const promoted = await loadAutomationVersion(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version: nextVersion,
  });
  if (!refreshed || !promoted) {
    throw new HttpError(500, "automation_promote_inconsistent", "automation promotion did not persist expected records", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version: nextVersion,
    });
  }
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    from_version: source.version,
    to_version: nextVersion,
    status: parsed.target_status,
    unchanged: false,
    automation: {
      automation_id: refreshed.automation_id,
      name: refreshed.name,
      status: promoted.status,
      version: promoted.version,
      latest_version: refreshed.latest_version,
      input_contract: jsonClone(asObject(refreshed.input_contract_json) ?? {}),
      output_contract: jsonClone(asObject(refreshed.output_contract_json) ?? {}),
      metadata: jsonClone(asObject(refreshed.metadata_json) ?? {}),
      version_metadata: jsonClone(asObject(promoted.metadata_json) ?? {}),
      graph: jsonClone(sourceGraph),
      compile_summary: jsonClone(asObject(promoted.compile_summary_json) ?? {}),
      created_at: refreshed.created_at,
      updated_at: refreshed.updated_at,
      version_created_at: promoted.created_at,
    },
    validation,
  };
}

export async function automationRun(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationRunInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const def = await loadAutomationDef(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
  });
  if (!def) {
    throw new HttpError(404, "automation_not_found", "automation was not found in this scope", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  if (def.status === "disabled") {
    throw new HttpError(409, "automation_disabled", "automation is disabled and cannot be run", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
    });
  }
  const version = parsed.version ?? def.latest_version;
  const row = await loadAutomationVersion(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id,
    version,
  });
  if (!row) {
    throw new HttpError(404, "automation_version_not_found", "automation version was not found", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version,
    });
  }
  if (row.status === "disabled") {
    throw new HttpError(409, "automation_version_disabled", "automation version is disabled and cannot be run", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version,
    });
  }
  const executionMode = parsed.options.execution_mode ?? "default";
  if (row.status === "shadow" && executionMode !== "shadow") {
    throw new HttpError(409, "automation_version_shadow_not_runnable", "shadow automation versions require options.execution_mode=shadow", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version,
    });
  }
  if (executionMode === "shadow" && row.status !== "shadow") {
    throw new HttpError(409, "automation_version_not_shadow", "shadow execution mode requires a shadow automation version", {
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      automation_id: parsed.automation_id,
      version,
      status: row.status,
    });
  }
  const graph = AutomationGraph.parse(row.graph_json);
  const validation = validateAutomationGraph(graph);
  const runId = randomUUID();
  const { incoming } = computeDependencyMaps(graph);
  const now = new Date().toISOString();
  const paramsObj = asObject(parsed.params) ?? {};
  const allowLocalExec = parsed.options.allow_local_exec === true || paramsObj.allow_local_exec === true;
  const recordRun = parsed.options.record_run !== false && paramsObj.record_run !== false;
  const stopOnFailure = parsed.options.stop_on_failure !== false && paramsObj.stop_on_failure !== false;
  const effectiveParams = {
    ...paramsObj,
    execution_mode: executionMode,
    allow_local_exec: allowLocalExec,
    record_run: recordRun,
    stop_on_failure: stopOnFailure,
  };
  const runContext = {
    execution_mode: executionMode,
  };
  await withLocalTransaction(client, async () => {
    await client.query(
      `INSERT INTO automation_runs (
         run_id, tenant_id, scope, automation_id, automation_version, requested_by,
         lifecycle_state, status_summary, params_json, context_json, summary_json, output_snapshot_json,
         started_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, 'queued', 'queued', $7::jsonb, $8::jsonb, '{}'::jsonb, '{}'::jsonb, $9::timestamptz)`,
      [
        runId,
        tenancy.tenant_id,
        tenancy.scope,
        parsed.automation_id,
        version,
        parsed.actor ?? null,
        JSON.stringify(effectiveParams),
        JSON.stringify(runContext),
        now,
      ],
    );
    for (const node of graph.nodes) {
      const deps = incoming.get(node.node_id) ?? [];
      const ready = deps.length === 0;
      await client.query(
        `INSERT INTO automation_run_nodes (
           run_id, node_id, attempt, node_kind, lifecycle_state, status_summary,
           depends_on_json, blocking_node_ids_json, playbook_id, playbook_version,
           input_snapshot_json, output_snapshot_json, artifact_refs_json
         ) VALUES (
           $1::uuid, $2, 1, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb
         )`,
        [
          runId,
          node.node_id,
          node.kind,
          ready ? "ready" : "pending",
          ready ? "ready" : "blocked_by_dependency",
          JSON.stringify(deps),
          JSON.stringify(deps),
          node.kind === "playbook" ? node.playbook_id : null,
          node.kind === "playbook" ? (node.version ?? null) : null,
        ],
      );
    }
  });

  let out;
  try {
    out = await continueAutomationRun(
      client,
      {
        run: {
          run_id: runId,
          tenant_id: tenancy.tenant_id,
          scope: tenancy.scope,
          automation_id: parsed.automation_id,
          automation_version: version,
          requested_by: parsed.actor ?? null,
          lifecycle_state: "queued",
          pause_reason: null,
          terminal_outcome: null,
          status_summary: "queued",
          root_cause_code: null,
          root_cause_node_id: null,
          root_cause_message: null,
          params_json: effectiveParams,
          context_json: runContext,
          summary_json: { validation },
          output_snapshot_json: {},
          compensation_attempted: false,
          compensation_status: "not_needed",
          compensation_summary_json: {},
          started_at: now,
          paused_at: null,
          ended_at: null,
          updated_at: now,
          created_at: now,
        },
        versionRow: row,
        graph,
        params: effectiveParams,
        actor: parsed.actor ?? null,
        execution_mode: executionMode,
      },
      opts,
    );
  } catch (err) {
    out = await failAutomationRun(client, {
      run_id: runId,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
      error_code: errorCodeFromUnknown(err),
      error_message: errorMessageFromUnknown(err),
    });
  }

  return {
    run: {
      ...decorateRunWithExecutionMode(out.run),
      version,
    },
    nodes: out.nodes,
  };
}

export async function automationRunGet(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationRunGetInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const out = await listRunState(client, {
    run_id: parsed.run_id,
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
  });
  return {
    run: {
      ...decorateRunWithExecutionMode(out.run),
      review_assignment: jsonClone(extractRunReviewAssignment(out.run.context_json) ?? {}),
      summary: summarizeRunNodes(out.nodes),
      compensation_assessment: deriveAutomationCompensationAssessment(out.run, out.nodes),
      compensation_workflow: deriveAutomationCompensationWorkflow(out.run),
    },
    compensation_workflow_history: jsonClone(extractRunCompensationWorkflowHistory(out.run.context_json)),
    ...(parsed.include_nodes ? { nodes: out.nodes } : {}),
  };
}

export async function automationRunList(client: pg.PoolClient, body: unknown, opts: AutomationReadOptions) {
  const parsed = parseAutomationRunListInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  const runs = await listAutomationRuns(client, {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    automation_id: parsed.automation_id ?? null,
    actionable_only: parsed.actionable_only,
    compensation_only: parsed.compensation_only,
    reviewer: parsed.reviewer ?? null,
    limit: parsed.limit,
  });
  let items = runs.map((run) => ({
    ...decorateRunWithExecutionMode(run),
    review_assignment: jsonClone(extractRunReviewAssignment(run.context_json) ?? {}),
    action_hint: deriveAutomationRunActionHint(run),
    compensation_assessment: deriveAutomationCompensationAssessment(run),
    compensation_workflow: deriveAutomationCompensationWorkflow(run),
  }));
  if (parsed.compensation_owner) {
    items = items.filter((run) => String(run.compensation_workflow?.assignment?.owner || "") === parsed.compensation_owner);
  }
  if (parsed.escalation_owner) {
    items = items.filter((run) => String(run.compensation_workflow?.assignment?.escalation_owner || "") === parsed.escalation_owner);
  }
  if (parsed.workflow_bucket) {
    items = items.filter((run) => String(run.compensation_workflow?.bucket || "") === parsed.workflow_bucket);
  }
  if (parsed.sla_status) {
    items = items.filter((run) => String(run.compensation_workflow?.sla_status || "") === parsed.sla_status);
  }
  return {
    tenant_id: tenancy.tenant_id,
    scope: tenancy.scope,
    runs: items,
  };
}

export async function automationRunAssignReviewer(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationRunAssignReviewerInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const run = await loadAutomationRun(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    if (!run) {
      throw new HttpError(404, "automation_run_not_found", "automation run was not found in this scope", {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        run_id: parsed.run_id,
      });
    }
    await setRunReviewAssignment(client, {
      run_id: parsed.run_id,
      reviewer: parsed.reviewer,
      actor: parsed.actor ?? null,
      note: parsed.note ?? null,
    });
    const out = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    return {
      run: {
        ...decorateRunWithExecutionMode(out.run),
        review_assignment: jsonClone(extractRunReviewAssignment(out.run.context_json) ?? {}),
      },
      nodes: out.nodes,
    };
  });
}

export async function automationRunCancel(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationRunCancelInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const state = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    if (state.run.lifecycle_state === "terminal") {
      throw new HttpError(409, "automation_run_terminal", "automation run is already terminal", {
        run_id: parsed.run_id,
      });
    }
    const versionRow = await loadAutomationVersion(client, {
      tenant_id: state.run.tenant_id,
      scope: state.run.scope,
      automation_id: state.run.automation_id,
      version: state.run.automation_version,
    });
    const graph = versionRow ? AutomationGraph.parse(versionRow.graph_json) : null;
    const executionMode = extractAutomationExecutionMode(state.run.context_json);
    for (const node of state.nodes) {
      if (node.lifecycle_state === "terminal") continue;
      await updateRunNodeRow(client, {
        run_id: parsed.run_id,
        node_id: node.node_id,
        lifecycle_state: "terminal",
        terminal_outcome: "skipped",
        status_summary: "skipped",
        error_code: node.lifecycle_state === "running" ? "cancelled_at_boundary" : node.error_code,
        error_message: parsed.reason ?? "automation run cancelled",
        ended_at: new Date().toISOString(),
      });
    }
    if (graph && executionMode !== "shadow") {
      const out = await runAutomationCompensation(
        client,
        {
          run: state.run,
          graph,
          params: asObject(state.run.params_json) ?? {},
          actor: parsed.actor ?? null,
          trigger: "on_cancel",
          original_outcome: "cancelled",
          root_cause_code: "operator_cancelled",
          root_cause_message: parsed.reason ?? "automation run cancelled",
        },
        opts,
      );
      return { run: decorateRunWithExecutionMode(out.run), nodes: out.nodes };
    }
    const finalNodes = await listAutomationRunNodes(client, { run_id: parsed.run_id });
    await terminalizeRun(client, {
      run_id: parsed.run_id,
      lifecycle_state: "terminal",
      terminal_outcome: "cancelled",
      status_summary: "cancelled",
      root_cause_code: "operator_cancelled",
      root_cause_message: parsed.reason ?? "automation run cancelled",
      summary_json: summarizeRunNodes(finalNodes),
    });
    const out = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    return { run: decorateRunWithExecutionMode(out.run), nodes: out.nodes };
  });
}

export async function automationRunResume(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationRunResumeInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const state = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    if (state.run.lifecycle_state !== "paused") {
      throw new HttpError(409, "automation_run_not_paused", "automation run is not paused", {
        run_id: parsed.run_id,
        lifecycle_state: state.run.lifecycle_state,
      });
    }
    const pausedNode = state.nodes.find((node) => node.lifecycle_state === "paused");
    if (!pausedNode) {
      throw new HttpError(409, "automation_run_not_resumable", "paused automation run has no paused node", {
        run_id: parsed.run_id,
      });
    }
    const versionRow = await loadAutomationVersion(client, {
      tenant_id: state.run.tenant_id,
      scope: state.run.scope,
      automation_id: state.run.automation_id,
      version: state.run.automation_version,
    });
    if (!versionRow) {
      throw new HttpError(404, "automation_version_not_found", "automation version was not found for resume", {
        automation_id: state.run.automation_id,
        version: state.run.automation_version,
      });
    }
    if (versionRow.status === "disabled") {
      throw new HttpError(409, "automation_version_disabled", "automation version is disabled and cannot be resumed", {
        automation_id: state.run.automation_id,
        version: state.run.automation_version,
      });
    }
    const executionMode = extractAutomationExecutionMode(state.run.context_json);
    let graph = AutomationGraph.parse(versionRow.graph_json);
    if (pausedNode.pause_reason === "repair_required") {
      const { currentVersion, latestPlaybook } = await resolveRepairResumeVersion(client, {
        run: state.run,
        pausedNode,
        defaultScope: opts.defaultScope,
        defaultTenantId: opts.defaultTenantId,
      });
      graph = {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.node_id === pausedNode.node_id && node.kind === "playbook"
            ? {
                ...node,
                version: latestPlaybook.version_num,
              }
            : node
        ),
      };
      await withLocalTransaction(client, async () => {
        await updateRunNodeRow(client, {
          run_id: parsed.run_id,
          node_id: pausedNode.node_id,
          lifecycle_state: "ready",
          status_summary: "ready",
          error_code: null,
          error_message: null,
          playbook_version: latestPlaybook.version_num,
          clear_playbook_run_id: true,
          output_snapshot_json: {
            resumed_by: parsed.actor ?? null,
            reason: parsed.reason ?? null,
            resumed_at: new Date().toISOString(),
            resumed_from_playbook_version: currentVersion,
            resumed_to_playbook_version: latestPlaybook.version_num,
          },
          paused_at: null,
        });
        await resetRunForResume(client, { run_id: parsed.run_id });
      });
    } else {
      await withLocalTransaction(client, async () => {
        await updateRunNodeRow(client, {
          run_id: parsed.run_id,
          node_id: pausedNode.node_id,
          lifecycle_state: "terminal",
          terminal_outcome: "succeeded",
          status_summary: "succeeded",
          output_snapshot_json: {
            approved: true,
            resumed_by: parsed.actor ?? null,
            reason: parsed.reason ?? null,
            resumed_at: new Date().toISOString(),
          },
          ended_at: new Date().toISOString(),
        });
        await resetRunForResume(client, { run_id: parsed.run_id });
      });
    }
    let out;
    try {
      await maybeInjectAutomationTestFault(opts, {
        action: "automation_run_resume",
        stage: "before_continue",
        run_id: parsed.run_id,
        node_id: pausedNode.node_id,
      });
      out = await continueAutomationRun(
        client,
        {
          run: {
            ...state.run,
            lifecycle_state: "running",
            pause_reason: null,
            terminal_outcome: null,
            status_summary: "running",
            root_cause_code: null,
            root_cause_node_id: null,
            root_cause_message: null,
            paused_at: null,
            ended_at: null,
          },
          versionRow,
          graph,
          params: asObject(state.run.params_json) ?? {},
          actor: parsed.actor ?? null,
          execution_mode: executionMode,
        },
        opts,
      );
    } catch (err) {
      out = await failAutomationRun(client, {
        run_id: parsed.run_id,
        tenant_id: state.run.tenant_id,
        scope: state.run.scope,
        error_code: errorCodeFromUnknown(err),
        error_message: errorMessageFromUnknown(err),
        node_id: pausedNode.node_id,
      });
    }
    return { run: decorateRunWithExecutionMode(out.run), nodes: out.nodes };
  });
}

export async function automationRunRejectRepair(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationRunRejectRepairInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const state = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    if (state.run.lifecycle_state !== "paused") {
      throw new HttpError(409, "automation_run_not_paused", "automation run is not paused", {
        run_id: parsed.run_id,
        lifecycle_state: state.run.lifecycle_state,
      });
    }
    const pausedNode = state.nodes.find((node) => node.lifecycle_state === "paused");
    if (!pausedNode || pausedNode.pause_reason !== "repair_required") {
      throw new HttpError(409, "automation_run_not_repair_paused", "automation run is not paused for repair", {
        run_id: parsed.run_id,
      });
    }
    const versionRow = await loadAutomationVersion(client, {
      tenant_id: state.run.tenant_id,
      scope: state.run.scope,
      automation_id: state.run.automation_id,
      version: state.run.automation_version,
    });
    const graph = versionRow ? AutomationGraph.parse(versionRow.graph_json) : null;
    const executionMode = extractAutomationExecutionMode(state.run.context_json);

    await updateRunNodeRow(client, {
      run_id: parsed.run_id,
      node_id: pausedNode.node_id,
      lifecycle_state: "terminal",
      terminal_outcome: "rejected",
      status_summary: "rejected",
      error_code: "repair_rejected",
      error_message: parsed.reason ?? "repair was rejected",
      output_snapshot_json: {
        rejected_by: parsed.actor ?? null,
        rejected_at: new Date().toISOString(),
        reason: parsed.reason ?? null,
      },
      ended_at: new Date().toISOString(),
    });
    for (const node of state.nodes) {
      if (node.node_id === pausedNode.node_id || node.lifecycle_state === "terminal") continue;
      await updateRunNodeRow(client, {
        run_id: parsed.run_id,
        node_id: node.node_id,
        lifecycle_state: "terminal",
        terminal_outcome: "skipped",
        status_summary: "skipped",
        error_code: node.error_code,
        error_message: node.error_message,
        ended_at: new Date().toISOString(),
      });
    }
    if (graph && executionMode !== "shadow") {
      const out = await runAutomationCompensation(
        client,
        {
          run: state.run,
          graph,
          params: asObject(state.run.params_json) ?? {},
          actor: parsed.actor ?? null,
          trigger: "on_reject",
          original_outcome: "failed",
          root_cause_code: "repair_rejected",
          root_cause_node_id: pausedNode.node_id,
          root_cause_message: parsed.reason ?? "repair was rejected",
        },
        opts,
      );
      return { run: decorateRunWithExecutionMode(out.run), nodes: out.nodes };
    }
    const finalNodes = await listAutomationRunNodes(client, { run_id: parsed.run_id });
    await terminalizeRun(client, {
      run_id: parsed.run_id,
      lifecycle_state: "terminal",
      terminal_outcome: "failed",
      status_summary: "failed",
      root_cause_code: "repair_rejected",
      root_cause_node_id: pausedNode.node_id,
      root_cause_message: parsed.reason ?? "repair was rejected",
      summary_json: summarizeRunNodes(finalNodes),
    });
    const out = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    return { run: decorateRunWithExecutionMode(out.run), nodes: out.nodes };
  });
}

export async function automationRunApproveRepair(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationRunApproveRepairInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const state = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    if (state.run.lifecycle_state !== "paused") {
      throw new HttpError(409, "automation_run_not_paused", "automation run is not paused", {
        run_id: parsed.run_id,
        lifecycle_state: state.run.lifecycle_state,
      });
    }
    const pausedNode = state.nodes.find((node) => node.lifecycle_state === "paused");
    if (!pausedNode || pausedNode.pause_reason !== "repair_required") {
      throw new HttpError(409, "automation_run_not_repair_paused", "automation run is not paused for repair", {
        run_id: parsed.run_id,
      });
    }
    await resolveRepairResumeVersion(client, {
      run: state.run,
      pausedNode,
      defaultScope: opts.defaultScope,
      defaultTenantId: opts.defaultTenantId,
    });
    await withLocalTransaction(client, async () => {
      await updateRunNodeRow(client, {
        run_id: parsed.run_id,
        node_id: pausedNode.node_id,
        approval_id: randomUUID(),
        input_snapshot_json: {
          approved: true,
          approved_by: parsed.actor ?? null,
          approved_at: new Date().toISOString(),
          approval_reason: parsed.reason ?? null,
        },
      });
    });
    return await automationRunResume(
      client,
      {
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        actor: parsed.actor,
        run_id: parsed.run_id,
        reason: parsed.reason ?? "repair approved",
      },
      opts,
    );
  });
}

export async function automationRunCompensationRetry(client: pg.PoolClient, body: unknown, opts: AutomationExecutionOptions) {
  const parsed = parseAutomationRunCompensationRetryInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const state = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    if (state.run.lifecycle_state !== "terminal") {
      throw new HttpError(409, "automation_run_not_terminal", "compensation retry requires a terminal run", {
        run_id: parsed.run_id,
        lifecycle_state: state.run.lifecycle_state,
      });
    }
    if (extractAutomationExecutionMode(state.run.context_json) === "shadow") {
      throw new HttpError(409, "automation_run_not_compensable", "shadow execution runs do not support compensation retry", {
        run_id: parsed.run_id,
        execution_mode: "shadow",
      });
    }
    if (["failed_compensated", "cancelled_compensated"].includes(state.run.terminal_outcome ?? "")) {
      throw new HttpError(409, "automation_run_already_compensated", "run is already fully compensated", {
        run_id: parsed.run_id,
        terminal_outcome: state.run.terminal_outcome,
      });
    }
    if (!["failed", "cancelled"].includes(state.run.terminal_outcome ?? "")) {
      throw new HttpError(409, "automation_run_not_compensable", "run outcome does not support compensation retry", {
        run_id: parsed.run_id,
        terminal_outcome: state.run.terminal_outcome,
      });
    }
    const versionRow = await loadAutomationVersion(client, {
      tenant_id: state.run.tenant_id,
      scope: state.run.scope,
      automation_id: state.run.automation_id,
      version: state.run.automation_version,
    });
    if (!versionRow) {
      throw new HttpError(404, "automation_version_not_found", "automation version was not found for compensation retry", {
        automation_id: state.run.automation_id,
        version: state.run.automation_version,
      });
    }
    const graph = AutomationGraph.parse(versionRow.graph_json);
    const out = await runAutomationCompensation(
      client,
      {
        run: state.run,
        graph,
        params: asObject(state.run.params_json) ?? {},
        actor: parsed.actor ?? null,
        trigger:
          state.run.root_cause_code === "operator_cancelled"
            ? "on_cancel"
            : state.run.root_cause_code === "repair_rejected"
              ? "on_reject"
              : "on_failure",
        original_outcome: state.run.terminal_outcome === "cancelled" ? "cancelled" : "failed",
        root_cause_code: state.run.root_cause_code ?? "compensation_retry",
        root_cause_node_id: state.run.root_cause_node_id ?? null,
        root_cause_message: parsed.reason ?? state.run.root_cause_message ?? "compensation retry requested",
      },
      opts,
    );
    return { run: decorateRunWithExecutionMode(out.run), nodes: out.nodes };
  });
}

export async function automationRunCompensationRecordAction(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationRunCompensationRecordActionInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const out = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    const assessment = deriveAutomationCompensationAssessment(out.run, out.nodes);
    if (!isCompensationWorkflowActionAllowed(assessment, parsed.action)) {
      throw new HttpError(
        409,
        "automation_compensation_workflow_action_not_allowed",
        "compensation workflow action is not allowed for the current run state",
        {
          run_id: parsed.run_id,
          action: parsed.action,
          compensation_class: assessment.class,
          compensation_status: assessment.status,
        },
      );
    }
    await setRunCompensationWorkflow(client, {
      run: out.run,
      assessment,
      action: parsed.action,
      actor: parsed.actor ?? null,
      note: parsed.note ?? null,
      external_ref: parsed.external_ref ?? null,
    });
    const refreshed = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    return {
      run: {
        ...decorateRunWithExecutionMode(refreshed.run),
        review_assignment: jsonClone(extractRunReviewAssignment(refreshed.run.context_json) ?? {}),
        summary: summarizeRunNodes(refreshed.nodes),
        compensation_assessment: deriveAutomationCompensationAssessment(refreshed.run, refreshed.nodes),
        compensation_workflow: deriveAutomationCompensationWorkflow(refreshed.run),
      },
      compensation_workflow_history: jsonClone(extractRunCompensationWorkflowHistory(refreshed.run.context_json)),
      nodes: refreshed.nodes,
    };
  });
}

export async function automationRunCompensationAssign(client: pg.PoolClient, body: unknown, opts: AutomationWriteOptions) {
  const parsed = parseAutomationRunCompensationAssignInput(body);
  const tenancy = resolveTenantScope(
    { tenant_id: parsed.tenant_id, scope: parsed.scope },
    { defaultScope: opts.defaultScope, defaultTenantId: opts.defaultTenantId },
  );
  return await withAutomationRunLock(client, parsed.run_id, async () => {
    const out = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    const assessment = deriveAutomationCompensationAssessment(out.run, out.nodes);
    if (!isCompensationWorkflowActionAllowed(assessment, "observation_noted")) {
      throw new HttpError(
        409,
        "automation_compensation_assignment_not_allowed",
        "compensation assignment is not allowed for the current run state",
        {
          run_id: parsed.run_id,
          compensation_class: assessment.class,
          compensation_status: assessment.status,
        },
      );
    }
    if (!toStringOrNull(parsed.owner) && !toStringOrNull(parsed.escalation_owner) && !toStringOrNull(parsed.note) && !toStringOrNull(parsed.sla_target_at)) {
      throw new HttpError(400, "automation_compensation_assignment_empty", "owner, escalation_owner, sla_target_at, or note is required", {
        run_id: parsed.run_id,
      });
    }
    await setRunCompensationWorkflowAssignment(client, {
      run: out.run,
      assessment,
      owner: toStringOrNull(parsed.owner),
      escalation_owner: toStringOrNull(parsed.escalation_owner),
      sla_target_at: normalizeIsoTimestampOrThrow(parsed.sla_target_at, "sla_target_at"),
      actor: parsed.actor ?? null,
      note: parsed.note ?? null,
    });
    const refreshed = await listRunState(client, {
      run_id: parsed.run_id,
      tenant_id: tenancy.tenant_id,
      scope: tenancy.scope,
    });
    return {
      run: {
        ...decorateRunWithExecutionMode(refreshed.run),
        review_assignment: jsonClone(extractRunReviewAssignment(refreshed.run.context_json) ?? {}),
        summary: summarizeRunNodes(refreshed.nodes),
        compensation_assessment: deriveAutomationCompensationAssessment(refreshed.run, refreshed.nodes),
        compensation_workflow: deriveAutomationCompensationWorkflow(refreshed.run),
      },
      compensation_workflow_history: jsonClone(extractRunCompensationWorkflowHistory(refreshed.run.context_json)),
      nodes: refreshed.nodes,
    };
  });
}

export function deriveAutomationNodeStatusSummary(input: {
  lifecycle_state: string;
  pause_reason?: string | null;
  terminal_outcome?: string | null;
}): string {
  if (input.lifecycle_state === "paused" && input.pause_reason) {
    return input.pause_reason === "approval_required" ? "paused_for_approval" : "paused_for_repair";
  }
  if (input.lifecycle_state === "terminal" && input.terminal_outcome) {
    return input.terminal_outcome;
  }
  return input.lifecycle_state;
}

function deriveAutomationRunActionHint(run: AutomationRunRow): string | null {
  const compensation = deriveAutomationCompensationAssessment(run);
  const workflow = deriveAutomationCompensationWorkflow(run);
  if (run.lifecycle_state === "paused" && run.pause_reason === "repair_required") {
    return "review_repair";
  }
  if (run.lifecycle_state === "paused" && run.pause_reason === "approval_required") {
    return "resume_after_approval";
  }
  if (run.lifecycle_state === "terminal" && run.compensation_status === "failed") {
    if (workflow.sla_status === "breached") return "sla_breached";
    if (workflow.state === "manual_cleanup_in_progress") return "continue_manual_cleanup";
    if (workflow.state === "manual_cleanup_completed") return "manual_cleanup_completed";
    if (workflow.state === "engineering_escalated") return "escalated_engineering";
    if (compensation.class === "manual_cleanup_required") return "manual_cleanup_required";
    if (compensation.class === "compensation_failed_without_plan" || compensation.class === "compensation_state_unknown") {
      return "escalate_engineering";
    }
    if (compensation.retry_allowed) return "retry_compensation";
    return "review_compensation_state";
  }
  return null;
}

const AUTOMATION_COMPENSATION_POLICY_MATRIX = [
  {
    class: "shadow_run_not_compensable",
    status: "blocked",
    retry_allowed: false,
    escalation: "none",
    summary: "Shadow runs never execute compensation.",
    operator_action: "Review shadow evidence only. Do not attempt cleanup from automation compensation.",
  },
  {
    class: "run_not_terminal",
    status: "blocked",
    retry_allowed: false,
    escalation: "observe",
    summary: "Compensation decisions are deferred until the run is terminal.",
    operator_action: "Wait for terminal state before retrying or escalating cleanup.",
  },
  {
    class: "already_compensated",
    status: "succeeded",
    retry_allowed: false,
    escalation: "none",
    summary: "Cleanup already succeeded.",
    operator_action: "No further compensation retry is allowed.",
  },
  {
    class: "compensation_in_progress",
    status: "running",
    retry_allowed: false,
    escalation: "observe",
    summary: "Cleanup is still running.",
    operator_action: "Observe current cleanup progress. Do not send compensation retry until the run terminalizes again.",
  },
  {
    class: "outcome_not_compensable",
    status: "blocked",
    retry_allowed: false,
    escalation: "none",
    summary: "Current run outcome does not support compensation retry.",
    operator_action: "No compensation retry is available for this run outcome.",
  },
  {
    class: "compensator_failed",
    status: "retryable",
    retry_allowed: true,
    escalation: "after_retry_failure",
    summary: "At least one compensator ran and failed.",
    operator_action: "Repair the failed compensation playbook or environment, then call compensation/retry.",
  },
  {
    class: "compensation_finalize_failed",
    status: "retryable",
    retry_allowed: true,
    escalation: "after_retry_failure",
    summary: "Cleanup ran, but final compensation convergence failed.",
    operator_action: "Retry compensation to converge final run state and cleanup accounting.",
  },
  {
    class: "compensation_failed_without_plan",
    status: "blocked",
    retry_allowed: false,
    escalation: "engineering",
    summary: "Run is marked as compensation failed without usable cleanup evidence.",
    operator_action: "Escalate to engineering. This indicates missing cleanup evidence or inconsistent compensation metadata.",
  },
  {
    class: "manual_cleanup_required",
    status: "blocked",
    retry_allowed: false,
    escalation: "manual_cleanup",
    summary: "The failed run has no configured compensator.",
    operator_action: "Manual cleanup is required. Do not call compensation/retry unless a compensator is added later.",
  },
  {
    class: "compensation_not_attempted",
    status: "blocked",
    retry_allowed: false,
    escalation: "engineering",
    summary: "Eligible compensators exist, but cleanup was not attempted on this run path.",
    operator_action: "Inspect control-flow history before retrying. This usually indicates a runtime gap rather than a retryable cleanup failure.",
  },
  {
    class: "compensation_succeeded",
    status: "succeeded",
    retry_allowed: false,
    escalation: "none",
    summary: "Compensation completed successfully.",
    operator_action: "No further operator action is required on cleanup.",
  },
  {
    class: "compensation_state_unknown",
    status: "blocked",
    retry_allowed: false,
    escalation: "engineering",
    summary: "Compensation state is not recognized by current operator guidance.",
    operator_action: "Escalate to engineering before retrying compensation.",
  },
] as const;

function deriveAutomationCompensationAssessment(run: AutomationRunRow, nodes: AutomationRunNodeRow[] = []) {
  const executionMode = extractAutomationExecutionMode(run.context_json);
  const eligibleNodes = nodes.filter((node) => typeof node.compensation_mode === "string" && node.compensation_mode !== "none");
  const failedNodes = nodes.filter((node) => node.compensation_status === "failed");
  const succeededNodes = nodes.filter((node) => node.compensation_status === "succeeded");
  const summary = asObject(run.compensation_summary_json) ?? {};
  const attemptedCount = Number(summary.attempted_count ?? summary.attempted ?? 0) || 0;
  const succeededCount = Number(summary.succeeded_count ?? summary.succeeded ?? succeededNodes.length) || succeededNodes.length;
  const failedCount = Number(summary.failed_count ?? summary.failed ?? failedNodes.length) || failedNodes.length;

  if (executionMode === "shadow") {
    return {
      status: "blocked",
      class: "shadow_run_not_compensable",
      retry_allowed: false,
      summary: "Shadow runs never trigger compensation.",
      operator_action: "No cleanup action is available from automation compensation. Review shadow evidence only.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (run.lifecycle_state !== "terminal") {
    return {
      status: "blocked",
      class: "run_not_terminal",
      retry_allowed: false,
      summary: "Compensation decisions are only final once the run is terminal.",
      operator_action: "Wait for the run to reach terminal state before retrying or escalating cleanup.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (["failed_compensated", "cancelled_compensated"].includes(run.terminal_outcome ?? "")) {
    return {
      status: "succeeded",
      class: "already_compensated",
      retry_allowed: false,
      summary: "Compensation has already completed successfully.",
      operator_action: "No further compensation retry is allowed.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (run.compensation_status === "running") {
    return {
      status: "running",
      class: "compensation_in_progress",
      retry_allowed: false,
      summary: "Compensation is still in progress.",
      operator_action: "Observe current cleanup progress. Do not send compensation retry until the run terminalizes again.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (!["failed", "cancelled"].includes(run.terminal_outcome ?? "")) {
    return {
      status: "blocked",
      class: "outcome_not_compensable",
      retry_allowed: false,
      summary: "Current terminal outcome does not support compensation retry.",
      operator_action: "No compensation retry is available for this run outcome.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (run.compensation_status === "failed") {
    if (failedNodes.length > 0) {
      return {
        status: "retryable",
        class: "compensator_failed",
        retry_allowed: true,
        summary: "At least one compensator ran and failed.",
        operator_action: "Repair the failed compensation playbook or environment, then call compensation/retry.",
        eligible_nodes: eligibleNodes.map((node) => node.node_id),
        failed_nodes: failedNodes.map((node) => node.node_id),
        attempted_count: attemptedCount,
        succeeded_count: succeededCount,
        failed_count: failedCount,
      };
    }
    if (eligibleNodes.length > 0 || attemptedCount > 0 || succeededCount > 0) {
      return {
        status: "retryable",
        class: "compensation_finalize_failed",
        retry_allowed: true,
        summary: "Cleanup ran, but compensation did not finalize cleanly.",
        operator_action: "Retry compensation to converge final run state and cleanup accounting.",
        eligible_nodes: eligibleNodes.map((node) => node.node_id),
        failed_nodes: failedNodes.map((node) => node.node_id),
        attempted_count: attemptedCount,
        succeeded_count: succeededCount,
        failed_count: failedCount,
      };
    }
    return {
      status: "blocked",
      class: "compensation_failed_without_plan",
      retry_allowed: false,
      summary: "Run is marked as compensation failed, but no compensator evidence is available.",
      operator_action: "Escalate to engineering. This indicates missing cleanup evidence or inconsistent compensation metadata.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (run.compensation_status === "not_needed") {
    if (eligibleNodes.length === 0) {
      return {
        status: "blocked",
        class: "manual_cleanup_required",
        retry_allowed: false,
        summary: "The failed run has no configured compensator.",
        operator_action: "Manual cleanup is required. Do not call compensation/retry unless a compensator is added in a future version.",
        eligible_nodes: [],
        failed_nodes: [],
        attempted_count: attemptedCount,
        succeeded_count: succeededCount,
        failed_count: failedCount,
      };
    }
    return {
      status: "blocked",
      class: "compensation_not_attempted",
      retry_allowed: false,
      summary: "Eligible compensators exist, but compensation was not attempted on this run path.",
      operator_action: "Inspect run history before retrying. This usually indicates a control-flow gap rather than a retryable cleanup failure.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: [],
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  if (run.compensation_status === "succeeded") {
    return {
      status: "succeeded",
      class: "compensation_succeeded",
      retry_allowed: false,
      summary: "Compensation completed successfully.",
      operator_action: "No further operator action is required on cleanup.",
      eligible_nodes: eligibleNodes.map((node) => node.node_id),
      failed_nodes: failedNodes.map((node) => node.node_id),
      attempted_count: attemptedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
    };
  }
  return {
    status: "blocked",
    class: "compensation_state_unknown",
    retry_allowed: false,
    summary: "Compensation state is not recognized by current operator guidance.",
    operator_action: "Escalate to engineering before retrying compensation.",
    eligible_nodes: eligibleNodes.map((node) => node.node_id),
    failed_nodes: failedNodes.map((node) => node.node_id),
    attempted_count: attemptedCount,
    succeeded_count: succeededCount,
    failed_count: failedCount,
  };
}

function deriveAutomationCompensationWorkflow(run: AutomationRunRow) {
  const assessment = deriveAutomationCompensationAssessment(run);
  const workflow = extractRunCompensationWorkflow(run.context_json);
  const latestAction = asObject(workflow?.latest_action);
  const history = extractRunCompensationWorkflowHistory(run.context_json);
  const assignment = extractRunCompensationWorkflowAssignment(run.context_json);
  const slaTargetAt = toStringOrNull(assignment?.sla_target_at);
  const now = Date.now();
  let slaStatus = "unset";
  if (slaTargetAt) {
    const deltaMs = Date.parse(slaTargetAt) - now;
    if (Number.isFinite(deltaMs)) {
      if (["manual_cleanup_completed", "succeeded"].includes(String(workflow?.state || ""))) {
        slaStatus = "met";
      } else if (deltaMs < 0) {
        slaStatus = "breached";
      } else if (deltaMs <= 4 * 60 * 60 * 1000) {
        slaStatus = "at_risk";
      } else {
        slaStatus = "on_track";
      }
    }
  }
  return {
    bucket: deriveCompensationWorkflowBucketFromAssessment(assessment),
    state: toStringOrNull(workflow?.state) ?? "unclaimed",
    assignment: jsonClone(assignment ?? {}),
    sla_status: slaStatus,
    updated_at: toStringOrNull(workflow?.updated_at),
    latest_action: jsonClone(latestAction ?? {}),
    history_count: history.length,
  };
}

function deriveAutomationAlertCandidates(summary: {
  total_runs: number;
  paused_runs: number;
  repair_paused_runs: number;
  compensation_failed_runs: number;
  success_rate: number | null;
  compensation_failure_rate: number | null;
  slo?: {
    success_rate_target?: number;
    success_rate_met?: boolean | null;
    compensation_failure_budget_target?: number;
    compensation_failure_budget_met?: boolean | null;
  };
}) {
  const items: Array<Record<string, unknown>> = [];
  if (summary.slo?.success_rate_met === false) {
    items.push({
      code: "automation_success_rate_below_target",
      severity: summary.success_rate != null && summary.success_rate < 0.8 ? "critical" : "warning",
      summary: "Automation terminal success rate is below target.",
      recommended_event_type: "automation.slo.success_rate",
      threshold: summary.slo?.success_rate_target ?? 0.95,
      current_value: summary.success_rate,
      suggested_action: "Review recent root causes and paused/failed runs before broadening rollout.",
    });
  }
  if (summary.slo?.compensation_failure_budget_met === false) {
    items.push({
      code: "automation_compensation_failure_budget_exceeded",
      severity: summary.compensation_failure_rate != null && summary.compensation_failure_rate > 0.05 ? "critical" : "warning",
      summary: "Compensation failures exceeded the configured budget.",
      recommended_event_type: "automation.slo.compensation_failure",
      threshold: summary.slo?.compensation_failure_budget_target ?? 0.02,
      current_value: summary.compensation_failure_rate,
      suggested_action: "Route affected runs into compensation triage and repair failing compensators.",
    });
  }
  if (summary.repair_paused_runs >= 3) {
    items.push({
      code: "automation_repair_queue_pressure",
      severity: summary.repair_paused_runs >= 5 ? "critical" : "warning",
      summary: "Repair-required queue pressure is building.",
      recommended_event_type: "automation.queue.repair",
      threshold: 3,
      current_value: summary.repair_paused_runs,
      suggested_action: "Prioritize repair review and repaired-version approvals.",
    });
  }
  if (summary.paused_runs >= 5) {
    items.push({
      code: "automation_paused_run_backlog",
      severity: summary.paused_runs >= 10 ? "critical" : "warning",
      summary: "Paused automation backlog exceeds the operational threshold.",
      recommended_event_type: "automation.queue.paused",
      threshold: 5,
      current_value: summary.paused_runs,
      suggested_action: "Check approval, repair, and compensation queues for stuck operator work.",
    });
  }
  return items;
}

function latestNodeAttempts(nodes: AutomationRunNodeRow[]): AutomationRunNodeRow[] {
  const byNode = new Map<string, AutomationRunNodeRow>();
  for (const node of nodes) {
    const prev = byNode.get(node.node_id);
    if (!prev || node.attempt >= prev.attempt) byNode.set(node.node_id, node);
  }
  return Array.from(byNode.values()).sort((a, b) => a.node_id.localeCompare(b.node_id));
}

function summarizeShadowNodeEvidence(nodes: AutomationRunNodeRow[]) {
  return {
    total_nodes: nodes.length,
    auto_approved_nodes: nodes.filter((node) => asObject(node.output_snapshot_json)?.shadow_auto_approved === true).length,
    simulate_nodes: nodes.filter((node) => asObject(node.output_snapshot_json)?.mode === "simulate").length,
    replay_linked_nodes: nodes.filter((node) => typeof node.playbook_run_id === "string" && node.playbook_run_id.length > 0).length,
  };
}

function compareAutomationRunNodes(shadowNodes: AutomationRunNodeRow[], activeNodes: AutomationRunNodeRow[]) {
  const shadowByNode = new Map(shadowNodes.map((node) => [node.node_id, node]));
  const activeByNode = new Map(activeNodes.map((node) => [node.node_id, node]));
  const allNodeIds = Array.from(new Set([...shadowByNode.keys(), ...activeByNode.keys()])).sort();
  const deltas = allNodeIds.map((nodeId) => {
    const shadowNode = shadowByNode.get(nodeId) ?? null;
    const activeNode = activeByNode.get(nodeId) ?? null;
    const changed =
      !shadowNode ||
      !activeNode ||
      shadowNode.status_summary !== activeNode.status_summary ||
      shadowNode.terminal_outcome !== activeNode.terminal_outcome ||
      shadowNode.playbook_version !== activeNode.playbook_version ||
      shadowNode.error_code !== activeNode.error_code;
    let reason = "unchanged";
    if (!shadowNode) reason = "missing_shadow_node";
    else if (!activeNode) reason = "missing_active_node";
    else if (shadowNode.status_summary !== activeNode.status_summary) reason = "status_changed";
    else if (shadowNode.playbook_version !== activeNode.playbook_version) reason = "playbook_version_changed";
    else if (shadowNode.error_code !== activeNode.error_code) reason = "error_class_changed";
    return {
      node_id: nodeId,
      changed,
      reason,
      shadow_status_summary: shadowNode?.status_summary ?? null,
      active_status_summary: activeNode?.status_summary ?? null,
      shadow_terminal_outcome: shadowNode?.terminal_outcome ?? null,
      active_terminal_outcome: activeNode?.terminal_outcome ?? null,
      shadow_playbook_version: shadowNode?.playbook_version ?? null,
      active_playbook_version: activeNode?.playbook_version ?? null,
      shadow_error_code: shadowNode?.error_code ?? null,
      active_error_code: activeNode?.error_code ?? null,
    };
  });
  return {
    deltas,
    changed_nodes: deltas.filter((delta) => delta.changed).length,
  };
}

function deriveShadowPromotionReadiness(input: {
  shadowVersion: AutomationShadowReportVersionRow | null;
  activeVersion: AutomationShadowReportVersionRow | null;
  shadowRun: AutomationRunRow | null;
  shadowReview: Record<string, unknown> | null;
  shadowValidation: Record<string, unknown> | null;
  nodeCompare: { changed_nodes: number };
}) {
  const reasons: string[] = [];
  if (!input.shadowVersion) {
    reasons.push("no_shadow_version");
    return { status: "blocked", reasons };
  }
  if (!input.shadowRun) {
    reasons.push("no_shadow_run");
    return { status: "needs_review", reasons };
  }
  const validationStatus = toStringOrNull(input.shadowValidation?.status);
  if (validationStatus === "queued") {
    reasons.push("shadow_validation_queued");
    return { status: "needs_review", reasons };
  }
  if (validationStatus === "running") {
    reasons.push("shadow_validation_running");
    return { status: "needs_review", reasons };
  }
  if (validationStatus === "failed") {
    reasons.push("shadow_validation_failed");
    return { status: "blocked", reasons };
  }
  if (input.shadowRun.lifecycle_state !== "terminal" || input.shadowRun.terminal_outcome !== "succeeded") {
    reasons.push(`shadow_run_${input.shadowRun.status_summary}`);
    return { status: "blocked", reasons };
  }
  const reviewVerdict = toStringOrNull(input.shadowReview?.verdict);
  if (reviewVerdict === "rejected") {
    reasons.push("shadow_review_rejected");
    return { status: "blocked", reasons };
  }
  if (reviewVerdict === "needs_changes") {
    reasons.push("shadow_review_needs_changes");
    return { status: "needs_review", reasons };
  }
  if (reviewVerdict == null) {
    reasons.push("shadow_review_missing");
    return { status: "needs_review", reasons };
  }
  if (!input.activeVersion) {
    reasons.push("no_active_baseline");
    return { status: "needs_review", reasons };
  }
  if (input.nodeCompare.changed_nodes > 0) {
    reasons.push("node_deltas_detected");
    return { status: "needs_review", reasons };
  }
  reasons.push("shadow_run_succeeded");
  reasons.push("shadow_review_approved");
  return { status: "ready", reasons };
}
