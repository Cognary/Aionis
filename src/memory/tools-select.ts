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
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: { embeddedRuntime?: EmbeddedMemoryRuntime | null } = {},
) {
  const parsed = ToolsSelectRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const normalizedCandidates = normalizeToolCandidates(parsed.candidates);

  const rules = await evaluateRulesAppliedOnly(client, {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    default_tenant_id: defaultTenantId,
    context: parsed.context,
    include_shadow: parsed.include_shadow,
    limit: parsed.rules_limit,
  }, { embeddedRuntime: opts.embeddedRuntime ?? null });

  const selection = applyToolPolicy(normalizedCandidates, rules.applied.policy, { strict: parsed.strict });

  let shadow_selection: any = undefined;
  if (parsed.include_shadow) {
    shadow_selection = applyToolPolicy(normalizedCandidates, (rules.applied as any).shadow_policy ?? {}, { strict: false });
  }

  const tool_conflicts_summary = summarizeToolConflicts((rules.applied as any)?.tool_explain);
  const shadow_tool_conflicts_summary = parsed.include_shadow
    ? summarizeToolConflicts((rules.applied as any)?.shadow_tool_explain)
    : undefined;
  const source_rule_ids = uniqueRuleIds((((rules.applied as any)?.sources as any[]) ?? []).map((s: any) => String(s?.rule_node_id)));
  const decision_id = randomUUID();
  const context_sha256 = hashExecutionContext(parsed.context);
  const policy_sha256 = hashPolicy((rules.applied as any)?.policy ?? {});

  const decisionRes = await client.query<{ id: string; created_at: string }>(
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
      JSON.stringify({
        strict: parsed.strict,
        include_shadow: parsed.include_shadow,
        rules_limit: parsed.rules_limit,
        matched_rules: rules.matched,
        tool_conflicts_summary,
        ...(parsed.include_shadow ? { shadow_tool_conflicts_summary } : {}),
      }),
    ],
  );
  const decision_created_at = decisionRes.rows[0]?.created_at ?? null;

  return {
    scope: rules.scope,
    tenant_id: rules.tenant_id,
    candidates: selection.candidates,
    selection,
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
      run_id: parsed.run_id ?? null,
      selected_tool: selection.selected ?? null,
      policy_sha256,
      source_rule_ids,
      created_at: decision_created_at,
    },
  };
}
