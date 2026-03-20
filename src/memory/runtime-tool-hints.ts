import { buildAionisUri } from "./uri.js";

type AnchorNodeLike = {
  id: string;
  type: string;
  title: string | null;
  text_summary: string | null;
  confidence?: number | null;
  slots?: Record<string, unknown> | null;
};

export type RuntimeToolHint = {
  hint_version: "runtime_tool_hint_v1";
  tool_name: "rehydrate_payload";
  tool_route: "/v1/memory/tools/rehydrate_payload";
  anchor: {
    id: string;
    uri: string;
    type: string;
    title: string | null;
    summary: string | null;
    anchor_kind: string;
    anchor_level: string;
    pattern_state: string | null;
    credibility_state: "candidate" | "trusted" | "contested" | null;
    trusted: boolean;
    distinct_run_count: number | null;
    required_distinct_runs: number | null;
    counter_evidence_count: number | null;
    counter_evidence_open: boolean;
    last_transition: string | null;
    selected_tool: string | null;
    outcome_status: string | null;
    tool_set: string[];
    confidence: number | null;
  };
  invocation: {
    anchor_id: string;
    anchor_uri: string;
    mode: "summary_only" | "partial" | "full";
    example_call: string;
  };
  payload_cost_hint: "low" | "medium" | "high" | null;
  recommended_when: string[];
  reason: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringList(value: unknown, limit = 8): string[] {
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

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function mapExecutionKindToAnchorKind(executionKind: string | null): string | null {
  if (executionKind === "workflow_anchor") return "workflow";
  if (executionKind === "pattern_anchor") return "pattern";
  return null;
}

export function buildRuntimeToolHintsFromAnchorNodes(args: {
  tenant_id: string;
  scope: string;
  nodes: AnchorNodeLike[];
  maxHints?: number;
}): RuntimeToolHint[] {
  const maxHints = Math.max(1, Math.min(8, Math.trunc(args.maxHints ?? 3)));
  const ranked = args.nodes
    .map<RuntimeToolHint | null>((node) => {
      const slots = asRecord(node.slots);
      const executionNative = asRecord(slots?.execution_native_v1);
      const anchor = asRecord(slots?.anchor_v1);
      if (!anchor) return null;
      const anchorKind = firstString(executionNative?.anchor_kind)
        ?? mapExecutionKindToAnchorKind(firstString(executionNative?.execution_kind))
        ?? firstString(anchor.anchor_kind);
      const anchorLevel = firstString(executionNative?.anchor_level) ?? firstString(anchor.anchor_level);
      if (!anchorKind || !anchorLevel) return null;
      const rehydration = asRecord(anchor.rehydration);
      const defaultModeRaw = firstString(rehydration?.default_mode);
      const mode = defaultModeRaw === "summary_only" || defaultModeRaw === "full" || defaultModeRaw === "partial"
        ? defaultModeRaw
        : "partial";
      const payloadCostHintRaw = firstString(rehydration?.payload_cost_hint);
      const payloadCostHint = payloadCostHintRaw === "low" || payloadCostHintRaw === "medium" || payloadCostHintRaw === "high"
        ? payloadCostHintRaw
        : null;
      const toolSet = asStringList(anchor.tool_set);
      const patternState = firstString(executionNative?.pattern_state ?? anchor.pattern_state);
      const promotion = asRecord(executionNative?.promotion) ?? asRecord(anchor.promotion);
      const credibilityStateRaw = firstString(executionNative?.credibility_state ?? anchor.credibility_state ?? promotion?.credibility_state);
      const distinctRunCount = firstFinite(promotion?.distinct_run_count);
      const requiredDistinctRuns = firstFinite(promotion?.required_distinct_runs);
      const counterEvidenceCount = firstFinite(promotion?.counter_evidence_count);
      const counterEvidenceOpen = firstBoolean(promotion?.counter_evidence_open) === true;
      const credibilityState =
        credibilityStateRaw === "candidate" || credibilityStateRaw === "trusted" || credibilityStateRaw === "contested"
          ? credibilityStateRaw
          : counterEvidenceOpen
            ? "contested"
            : patternState === "stable"
              ? "trusted"
              : "candidate";
      const trusted = credibilityState === "trusted";
      const selectedTool = firstString(executionNative?.selected_tool ?? anchor.selected_tool);
      const recommendedWhen = asStringList(rehydration?.recommended_when);
      const uri = buildAionisUri({
        tenant_id: args.tenant_id,
        scope: args.scope,
        type: node.type,
        id: node.id,
      });
      const summary = firstString(anchor.summary) ?? node.text_summary ?? node.title ?? null;
      const outcome = asRecord(anchor.outcome);
      const outcomeStatus = firstString(outcome?.status);
      const confidence = firstFinite(anchor.anchor_confidence) ?? firstFinite(node.confidence);
      const reasonParts = [
        `${anchorKind} anchor recalled`,
        patternState ? `state=${patternState}` : null,
        credibilityState ? `credibility=${credibilityState}` : null,
        trusted ? "trusted=true" : null,
        counterEvidenceOpen ? "counter_evidence=open" : null,
        summary ? `summary=${summary}` : null,
        payloadCostHint ? `payload_cost=${payloadCostHint}` : null,
      ].filter(Boolean);
      return {
        hint_version: "runtime_tool_hint_v1" as const,
        tool_name: "rehydrate_payload" as const,
        tool_route: "/v1/memory/tools/rehydrate_payload" as const,
        anchor: {
          id: node.id,
          uri,
          type: node.type,
          title: node.title ?? null,
          summary,
          anchor_kind: anchorKind,
          anchor_level: anchorLevel,
          pattern_state: patternState,
          credibility_state: credibilityState,
          trusted,
          distinct_run_count: distinctRunCount,
          required_distinct_runs: requiredDistinctRuns,
          counter_evidence_count: counterEvidenceCount,
          counter_evidence_open: counterEvidenceOpen,
          last_transition: firstString(promotion?.last_transition),
          selected_tool: selectedTool,
          outcome_status: outcomeStatus,
          tool_set: toolSet,
          confidence,
        },
        invocation: {
          anchor_id: node.id,
          anchor_uri: uri,
          mode,
          example_call: `rehydrate_payload(anchor_id='${node.id}', mode='${mode}')`,
        },
        payload_cost_hint: payloadCostHint,
        recommended_when: recommendedWhen,
        reason: reasonParts.join("; "),
      };
    })
    .filter((entry): entry is RuntimeToolHint => !!entry)
    .sort((a, b) => (b.anchor.confidence ?? 0) - (a.anchor.confidence ?? 0) || a.anchor.id.localeCompare(b.anchor.id));

  const out: RuntimeToolHint[] = [];
  const seen = new Set<string>();
  for (const hint of ranked) {
    if (seen.has(hint.anchor.id)) continue;
    seen.add(hint.anchor.id);
    out.push(hint);
    if (out.length >= maxHints) break;
  }
  return out;
}
