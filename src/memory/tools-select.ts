import type pg from "pg";
import { ToolsSelectRequest } from "./schemas.js";
import { evaluateRulesAppliedOnly } from "./rules-evaluate.js";
import { applyToolPolicy } from "./tool-selector.js";

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

export async function selectTools(client: pg.PoolClient, body: unknown, defaultScope: string, defaultTenantId: string) {
  const parsed = ToolsSelectRequest.parse(body);
  const scope = parsed.scope ?? defaultScope;

  const rules = await evaluateRulesAppliedOnly(client, {
    scope,
    tenant_id: parsed.tenant_id,
    default_tenant_id: defaultTenantId,
    context: parsed.context,
    include_shadow: parsed.include_shadow,
    limit: parsed.rules_limit,
  });

  const selection = applyToolPolicy(parsed.candidates, rules.applied.policy, { strict: parsed.strict });

  let shadow_selection: any = undefined;
  if (parsed.include_shadow) {
    shadow_selection = applyToolPolicy(parsed.candidates, (rules.applied as any).shadow_policy ?? {}, { strict: false });
  }

  const tool_conflicts_summary = summarizeToolConflicts((rules.applied as any)?.tool_explain);
  const shadow_tool_conflicts_summary = parsed.include_shadow
    ? summarizeToolConflicts((rules.applied as any)?.shadow_tool_explain)
    : undefined;

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
  };
}
