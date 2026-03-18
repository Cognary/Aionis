import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  hashExecutionContext,
  hashPolicy,
  normalizeToolCandidates,
  uniqueRuleIds,
} from "./execution-provenance.js";
import { ToolsSelectRequest } from "./schemas.js";
import { evaluateRulesAppliedOnly } from "./rules-evaluate.js";
import { resolveTenantScope } from "./tenant.js";
import { applyToolPolicy } from "./tool-selector.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";
import { buildToolsSelectionSummary } from "./tools-lifecycle-summary.js";
import { buildAionisUri } from "./uri.js";
import {
  ControlProfileV1Schema,
  ExecutionStateV1Schema,
  type ControlProfileV1,
  type ExecutionStateV1,
} from "../execution/types.js";
import { controlProfileDefaults } from "../execution/profiles.js";
import {
  applyFamilyAwareOrdering,
  DEFAULT_TOOL_REGISTRY_INDEX,
  mapCandidatesToFamilies,
} from "./tool-registry.js";

function inferBroadToolKind(name: string): "scan" | "test" | null {
  const lowered = name.toLowerCase();
  if (!lowered.includes("broad")) return null;
  if (lowered.includes("test")) return "test";
  if (lowered.includes("scan")) return "scan";
  return null;
}

function deriveControlProfileFromExecutionState(state: ExecutionStateV1): ControlProfileV1 {
  return controlProfileDefaults(state.current_stage);
}

function normalizeExecutionSideOutputs(raw: {
  execution_result_summary?: unknown;
  execution_artifacts?: unknown;
  execution_evidence?: unknown;
}) {
  const executionResultSummary =
    raw.execution_result_summary && typeof raw.execution_result_summary === "object" && !Array.isArray(raw.execution_result_summary)
      ? (raw.execution_result_summary as Record<string, unknown>)
      : null;
  const executionArtifacts = Array.isArray(raw.execution_artifacts)
    ? raw.execution_artifacts.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  const executionEvidence = Array.isArray(raw.execution_evidence)
    ? raw.execution_evidence.filter(
        (value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  return {
    executionResultSummary,
    executionArtifacts,
    executionEvidence,
  };
}

function mergeExecutionContinuityContext(
  rawContext: unknown,
  rawSideOutputs: {
    execution_result_summary?: unknown;
    execution_artifacts?: unknown;
    execution_evidence?: unknown;
  },
) {
  const context =
    rawContext && typeof rawContext === "object" && !Array.isArray(rawContext) ? { ...(rawContext as Record<string, unknown>) } : {};
  const sideOutputs = normalizeExecutionSideOutputs(rawSideOutputs);
  if (sideOutputs.executionResultSummary && !("execution_result_summary" in context)) {
    context.execution_result_summary = sideOutputs.executionResultSummary;
  }
  if (sideOutputs.executionArtifacts.length > 0 && !("execution_artifacts" in context)) {
    context.execution_artifacts = sideOutputs.executionArtifacts;
  }
  if (sideOutputs.executionEvidence.length > 0 && !("execution_evidence" in context)) {
    context.execution_evidence = sideOutputs.executionEvidence;
  }
  return { context, sideOutputs };
}

export function resolveExecutionKernelInputs(
  rawContext: unknown,
  rawExecutionState: unknown,
): {
  controlProfile: ControlProfileV1 | null;
  controlProfileOrigin: "continuity_delivered" | "state_derived" | "none";
  executionState: ExecutionStateV1 | null;
} {
  const context =
    rawContext && typeof rawContext === "object" ? (rawContext as Record<string, unknown>) : null;
  const parsedProfile = ControlProfileV1Schema.safeParse(context?.control_profile_v1);
  if (parsedProfile.success) {
    const parsedState = ExecutionStateV1Schema.safeParse(rawExecutionState);
    return {
      controlProfile: parsedProfile.data,
      controlProfileOrigin: "continuity_delivered",
      executionState: parsedState.success ? parsedState.data : null,
    };
  }

  const parsedState = ExecutionStateV1Schema.safeParse(rawExecutionState);
  if (parsedState.success) {
    return {
      controlProfile: deriveControlProfileFromExecutionState(parsedState.data),
      controlProfileOrigin: "state_derived",
      executionState: parsedState.data,
    };
  }

  return {
    controlProfile: null,
    controlProfileOrigin: "none",
    executionState: null,
  };
}

export function applyControlProfileCandidateFilter(
  candidates: string[],
  controlProfile: ControlProfileV1 | null,
): {
  filteredCandidates: string[];
  deniedByProfile: Array<{ name: string; reason: "deny_list" | "not_in_allow_list" | "control_profile" }>;
} {
  if (!controlProfile) {
    return { filteredCandidates: candidates, deniedByProfile: [] };
  }

  const filteredCandidates: string[] = [];
  const deniedByProfile: Array<{ name: string; reason: "deny_list" | "not_in_allow_list" | "control_profile" }> = [];

  for (const candidate of candidates) {
    const broadKind = inferBroadToolKind(candidate);
    if (broadKind === "scan" && controlProfile.allow_broad_scan === false) {
      deniedByProfile.push({ name: candidate, reason: "control_profile" });
      continue;
    }
    if (broadKind === "test" && controlProfile.allow_broad_test === false) {
      deniedByProfile.push({ name: candidate, reason: "control_profile" });
      continue;
    }
    filteredCandidates.push(candidate);
  }

  return { filteredCandidates, deniedByProfile };
}

function summarizeToolConflicts(explain: any): string[] {
  const conflicts = Array.isArray(explain?.conflicts) ? explain.conflicts : [];
  const out: string[] = [];
  for (const c of conflicts) {
    const code = String(c?.code ?? "conflict");
    const msg = String(c?.message ?? "");
    const winner = c?.winner_rule_node_id ? String(c.winner_rule_node_id) : "";
    let line = `[${code}] ${msg}`;
    if (winner) line += ` (winner=${winner})`;
    // Hard cap per line to keep logs/UI safe.
    if (line.length > 200) line = line.slice(0, 197) + "...";
    out.push(line);
    if (out.length >= 5) break;
  }
  return out;
}

export async function selectTools(
  client: pg.PoolClient | null,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: {
    embeddedRuntime?: EmbeddedMemoryRuntime | null;
    liteWriteStore?: Pick<LiteWriteStore, "insertExecutionDecision" | "listRuleCandidates"> | null;
  } = {},
) {
  const parsed = ToolsSelectRequest.parse(body);
  const { context: evaluationContext, sideOutputs } = mergeExecutionContinuityContext(parsed.context, {
    execution_result_summary: parsed.execution_result_summary,
    execution_artifacts: parsed.execution_artifacts,
    execution_evidence: parsed.execution_evidence,
  });
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const normalizedCandidates = normalizeToolCandidates(parsed.candidates);
  const kernelInputs = resolveExecutionKernelInputs(evaluationContext, parsed.execution_state_v1);
  const { filteredCandidates, deniedByProfile } = applyControlProfileCandidateFilter(
    normalizedCandidates,
    kernelInputs.controlProfile,
  );
  const candidateFamilies = mapCandidatesToFamilies(DEFAULT_TOOL_REGISTRY_INDEX, filteredCandidates);

  const rules = await evaluateRulesAppliedOnly((client ?? ({} as pg.PoolClient)), {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    default_tenant_id: defaultTenantId,
    context: evaluationContext,
    include_shadow: parsed.include_shadow,
    limit: parsed.rules_limit,
  }, {
    embeddedRuntime: opts.embeddedRuntime ?? null,
    liteWriteStore: opts.liteWriteStore ?? null,
  });

  const explicitPreferred = Array.isArray((rules.applied as any)?.policy?.tool?.prefer)
    ? ((rules.applied as any).policy.tool.prefer as string[])
    : [];
  const recommendedOrderedCandidates = applyFamilyAwareOrdering(filteredCandidates, candidateFamilies, explicitPreferred);
  const orderedCandidates = parsed.reorder_candidates ? recommendedOrderedCandidates : filteredCandidates;

  const selection = applyToolPolicy(orderedCandidates, rules.applied.policy, { strict: parsed.strict });
  if (deniedByProfile.length > 0) {
    selection.denied = deniedByProfile.concat(selection.denied);
  }

  let shadow_selection: any = undefined;
  if (parsed.include_shadow) {
    shadow_selection = applyToolPolicy(filteredCandidates, (rules.applied as any).shadow_policy ?? {}, { strict: false });
    if (deniedByProfile.length > 0) {
      shadow_selection.denied = deniedByProfile.concat(shadow_selection.denied);
    }
  }

  const tool_conflicts_summary = summarizeToolConflicts((rules.applied as any)?.tool_explain);
  const shadow_tool_conflicts_summary = parsed.include_shadow
    ? summarizeToolConflicts((rules.applied as any)?.shadow_tool_explain)
    : undefined;
  const source_rule_ids = uniqueRuleIds((((rules.applied as any)?.sources as any[]) ?? []).map((s: any) => String(s?.rule_node_id)));
  const decision_id = randomUUID();
  const context_sha256 = hashExecutionContext(evaluationContext);
  const policy_sha256 = hashPolicy((rules.applied as any)?.policy ?? {});
  const decisionMetadata = {
    strict: parsed.strict,
    include_shadow: parsed.include_shadow,
    rules_limit: parsed.rules_limit,
    reorder_candidates: parsed.reorder_candidates,
    matched_rules: rules.matched,
    tool_conflicts_summary,
    denied_by_control_profile: deniedByProfile.map((entry) => entry.name),
    control_profile_origin: kernelInputs.controlProfileOrigin,
    execution_stage: kernelInputs.executionState?.current_stage ?? null,
    execution_role: kernelInputs.executionState?.active_role ?? null,
    execution_result_summary_present: !!sideOutputs.executionResultSummary,
    execution_artifacts_count: sideOutputs.executionArtifacts.length,
    execution_evidence_count: sideOutputs.executionEvidence.length,
    candidate_families: candidateFamilies,
    ...(parsed.include_shadow ? { shadow_tool_conflicts_summary } : {}),
  };
  const decisionRes: { id: string; created_at: string } = opts.liteWriteStore
    ? await opts.liteWriteStore.insertExecutionDecision({
        id: decision_id,
        scope: tenancy.scope_key,
        decisionKind: "tools_select",
        runId: parsed.run_id ?? null,
        selectedTool: selection.selected ?? null,
        candidatesJson: selection.candidates,
        contextSha256: context_sha256,
        policySha256: policy_sha256,
        sourceRuleIds: source_rule_ids,
        metadataJson: decisionMetadata,
        commitId: null,
      })
    : await client!.query<{ id: string; created_at: string }>(
        `
        INSERT INTO memory_execution_decisions
          (id, scope, decision_kind, run_id, selected_tool, candidates_json, context_sha256, policy_sha256, source_rule_ids, metadata_json)
        VALUES
          ($1, $2, 'tools_select', $3, $4, $5::jsonb, $6, $7, $8::uuid[], $9::jsonb)
        RETURNING id, created_at::text AS created_at
        `,
        [
          decision_id,
          tenancy.scope_key,
          parsed.run_id ?? null,
          selection.selected ?? null,
          JSON.stringify(selection.candidates),
          context_sha256,
          policy_sha256,
          source_rule_ids,
          JSON.stringify(decisionMetadata),
        ],
      ).then((res) => res.rows[0]!);
  const decision_created_at = decisionRes.created_at ?? null;

  if (opts.embeddedRuntime && decision_created_at) {
    await opts.embeddedRuntime.syncExecutionDecisions([
      {
        id: decision_id,
        scope: tenancy.scope_key,
        decision_kind: "tools_select",
        run_id: parsed.run_id ?? null,
        selected_tool: selection.selected ?? null,
        candidates_json: selection.candidates,
        context_sha256,
        policy_sha256,
        source_rule_ids,
        metadata_json: {
          strict: parsed.strict,
          include_shadow: parsed.include_shadow,
          rules_limit: parsed.rules_limit,
          reorder_candidates: parsed.reorder_candidates,
          matched_rules: rules.matched,
          tool_conflicts_summary,
          ...(parsed.include_shadow ? { shadow_tool_conflicts_summary } : {}),
        },
        created_at: decision_created_at,
        commit_id: null,
      },
    ]);
  }

  const response = {
    scope: rules.scope,
    tenant_id: rules.tenant_id,
    candidates: selection.candidates,
    selection,
    execution_kernel: {
      control_profile_origin: kernelInputs.controlProfileOrigin,
      execution_state_v1_present: !!kernelInputs.executionState,
      execution_result_summary_present: !!sideOutputs.executionResultSummary,
      execution_artifacts_count: sideOutputs.executionArtifacts.length,
      execution_evidence_count: sideOutputs.executionEvidence.length,
      current_stage: kernelInputs.executionState?.current_stage ?? null,
      active_role: kernelInputs.executionState?.active_role ?? null,
      tool_registry_present: true,
      family_aware_ordering_applied: parsed.reorder_candidates
        && orderedCandidates.some((candidate, index) => candidate !== filteredCandidates[index]),
      candidate_families: candidateFamilies,
    },
    rules: {
      considered: rules.considered,
      matched: rules.matched,
      skipped_invalid_then: rules.skipped_invalid_then,
      invalid_then_sample: rules.invalid_then_sample,
      agent_visibility_summary: (rules as any).agent_visibility_summary,
      applied: rules.applied,
      tool_conflicts_summary,
      ...(parsed.include_shadow ? { shadow_selection } : {}),
      ...(parsed.include_shadow ? { shadow_tool_conflicts_summary } : {}),
    },
    decision: {
      decision_id,
      decision_uri: buildAionisUri({
        tenant_id: tenancy.tenant_id,
        scope: tenancy.scope,
        type: "decision",
        id: decision_id,
      }),
      run_id: parsed.run_id ?? null,
      selected_tool: selection.selected ?? null,
      policy_sha256,
      source_rule_ids,
      created_at: decision_created_at,
    },
  };
  return {
    ...response,
    selection_summary: buildToolsSelectionSummary({
      selection: response.selection,
      rules: response.rules,
      source_rule_ids,
    }),
  };
}
