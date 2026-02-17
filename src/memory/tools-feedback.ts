import { randomUUID } from "node:crypto";
import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import { ToolsFeedbackRequest } from "./schemas.js";
import { evaluateRulesAppliedOnly } from "./rules-evaluate.js";
import { resolveTenantScope } from "./tenant.js";

type FeedbackOptions = {
  maxTextLen: number;
  piiRedaction: boolean;
};

function isToolTouched(paths: string[]): boolean {
  for (const p of paths) {
    if (p === "tool" || p.startsWith("tool.")) return true;
  }
  return false;
}

export async function toolSelectionFeedback(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: FeedbackOptions,
) {
  const parsed = ToolsFeedbackRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const actor = parsed.actor ?? "system";

  const inputText = parsed.input_text ? normalizeText(parsed.input_text, opts.maxTextLen) : undefined;
  const redactedInput = opts.piiRedaction && inputText ? redactPII(inputText).text : inputText;
  const inputSha = parsed.input_sha256 ?? sha256Hex(redactedInput!);

  const noteNorm = parsed.note ? normalizeText(parsed.note, opts.maxTextLen) : undefined;
  const note = opts.piiRedaction && noteNorm ? redactPII(noteNorm).text : noteNorm;

  // Re-evaluate rules for attribution to avoid trusting client-provided sources.
  const rules = await evaluateRulesAppliedOnly(client, {
    scope: tenancy.scope,
    tenant_id: parsed.tenant_id,
    default_tenant_id: defaultTenantId,
    context: parsed.context,
    include_shadow: parsed.include_shadow,
    limit: parsed.rules_limit,
  });

  const activeSources: Array<{ rule_node_id: string; state: "active" | "shadow"; commit_id: string; touched_paths: string[] }> =
    ((rules.applied as any)?.sources as any[]) ?? [];
  const shadowSources: Array<{ rule_node_id: string; state: "active" | "shadow"; commit_id: string; touched_paths: string[] }> =
    parsed.include_shadow ? (((rules.applied as any)?.shadow_sources as any[]) ?? []) : [];
  const sources: Array<{ rule_node_id: string; state: "active" | "shadow"; commit_id: string; touched_paths: string[] }> = [
    ...activeSources,
    ...shadowSources,
  ];

  const targetRuleIds = sources
    .filter((s) => parsed.target === "all" || isToolTouched(s.touched_paths ?? []))
    .filter((s) => (parsed.include_shadow ? true : s.state === "active"))
    .map((s) => s.rule_node_id);

  const uniq = Array.from(new Set(targetRuleIds));

  if (uniq.length === 0) {
    return {
      ok: true,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
      updated_rules: 0,
      rule_node_ids: [],
      commit_id: null,
      commit_hash: null,
      note: "no matching rule sources for attribution",
    };
  }

  // Parent commit is optional for feedback events; use latest commit in scope as parent if present.
  const parentRes = await client.query<{ id: string; commit_hash: string }>(
    "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
    [scope],
  );
  const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
  const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

  const diff = {
    tool_feedback: [
      {
        run_id: parsed.run_id ?? null,
        outcome: parsed.outcome,
        selected_tool: parsed.selected_tool,
        candidates: parsed.candidates,
        rule_node_ids: uniq,
        target: parsed.target,
      },
    ],
  };
  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(stableStringify({ parentHash, inputSha, diffSha, scope, actor, kind: "tool_feedback" }));

  const commitRes = await client.query<{ id: string }>(
    `INSERT INTO memory_commits
      (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id`,
    [scope, parentId, inputSha, JSON.stringify(diff), actor, commitHash],
  );
  const commit_id = commitRes.rows[0].id;

  // Insert feedback rows (one per rule) to keep per-rule auditability.
  // Note: we intentionally attribute the same outcome to all matched rule sources for MVP simplicity.
  for (const rule_node_id of uniq) {
    const feedbackId = randomUUID();
    await client.query(
      `INSERT INTO memory_rule_feedback
        (id, scope, rule_node_id, run_id, outcome, note, commit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [feedbackId, scope, rule_node_id, parsed.run_id ?? null, parsed.outcome, note ?? null, commit_id],
    );
  }

  // Update aggregate stats for all attributed rules.
  await client.query(
    `
    UPDATE memory_rule_defs
    SET
      positive_count = positive_count + CASE WHEN $2 = 'positive' THEN 1 ELSE 0 END,
      negative_count = negative_count + CASE WHEN $2 = 'negative' THEN 1 ELSE 0 END,
      last_evaluated_at = now()
    WHERE scope = $1 AND rule_node_id = ANY($3::uuid[])
    `,
    [scope, parsed.outcome, uniq],
  );

  return {
    ok: true,
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    updated_rules: uniq.length,
    rule_node_ids: uniq,
    commit_id,
    commit_hash: commitHash,
  };
}
