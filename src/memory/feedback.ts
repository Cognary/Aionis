import { randomUUID } from "node:crypto";
import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { badRequest } from "../util/http.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import { RuleFeedbackRequest } from "./schemas.js";
import { resolveTenantScope } from "./tenant.js";

type FeedbackOptions = {
  maxTextLen: number;
  piiRedaction: boolean;
};

export async function ruleFeedback(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: FeedbackOptions,
) {
  const parsed = RuleFeedbackRequest.parse(body);
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

  const ruleExistsRes = await client.query(
    `
    SELECT 1
    FROM memory_nodes
    WHERE scope = $1
      AND id = $2
      AND type = 'rule'
    `,
    [scope, parsed.rule_node_id],
  );
  if ((ruleExistsRes.rowCount ?? 0) !== 1) {
    badRequest("rule_not_found_in_scope", "rule_node_id was not found in this scope", {
      rule_node_id: parsed.rule_node_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  // Parent commit is optional for feedback events; for now, we use the latest commit in scope as parent if present.
  const parentRes = await client.query<{ id: string; commit_hash: string }>(
    "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
    [scope],
  );
  const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
  const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

  const feedbackId = randomUUID();
  const diff = {
    feedback: [{ id: feedbackId, rule_node_id: parsed.rule_node_id, outcome: parsed.outcome, run_id: parsed.run_id ?? null }],
  };
  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(
    stableStringify({
      parentHash,
      inputSha,
      diffSha,
      scope,
      actor,
      kind: "rule_feedback",
    }),
  );

  const commitRes = await client.query<{ id: string }>(
    `INSERT INTO memory_commits
      (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id`,
    [scope, parentId, inputSha, JSON.stringify(diff), actor, commitHash],
  );
  const commit_id = commitRes.rows[0].id;

  // Insert feedback row.
  await client.query(
    `INSERT INTO memory_rule_feedback
      (id, scope, rule_node_id, run_id, outcome, note, source, decision_id, commit_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'rule_feedback', NULL, $7)`,
    [feedbackId, scope, parsed.rule_node_id, parsed.run_id ?? null, parsed.outcome, note ?? null, commit_id],
  );

  // Update aggregate stats.
  await client.query(
    `
    UPDATE memory_rule_defs
    SET
      positive_count = positive_count + CASE WHEN $2 = 'positive' THEN 1 ELSE 0 END,
      negative_count = negative_count + CASE WHEN $2 = 'negative' THEN 1 ELSE 0 END,
      last_evaluated_at = now()
    WHERE scope = $1 AND rule_node_id = $3
    `,
    [scope, parsed.outcome, parsed.rule_node_id],
  );

  return { tenant_id: tenancy.tenant_id, scope: tenancy.scope, commit_id, commit_hash: commitHash, feedback_id: feedbackId };
}
