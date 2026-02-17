import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { RuleStateUpdateRequest } from "./schemas.js";
import { badRequest } from "../util/http.js";
import { parsePolicyPatch } from "./rule-policy.js";
import { resolveTenantScope } from "./tenant.js";

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function updateRuleState(client: pg.PoolClient, body: unknown, defaultScope: string, defaultTenantId: string) {
  const parsed = RuleStateUpdateRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const actor = parsed.actor ?? "system";
  const inputSha = parsed.input_sha256 ?? sha256Hex(parsed.input_text!);

  // If promoting into an execution-relevant state, validate the rule definition shape.
  // This keeps /rules/evaluate predictable and prevents arbitrary JSON from reaching the planner/tool selector.
  if (parsed.state === "shadow" || parsed.state === "active") {
    const ruleNodeRes = await client.query<{
      memory_lane: string;
      owner_agent_id: string | null;
      owner_team_id: string | null;
    }>(
      `SELECT memory_lane::text AS memory_lane, owner_agent_id, owner_team_id
       FROM memory_nodes
       WHERE scope = $1 AND id = $2 AND type = 'rule'`,
      [scope, parsed.rule_node_id],
    );
    if ((ruleNodeRes.rowCount ?? 0) > 0) {
      const node = ruleNodeRes.rows[0];
      if (node.memory_lane === "private" && !node.owner_agent_id && !node.owner_team_id) {
        badRequest("invalid_private_rule_owner", "private rule requires owner_agent_id or owner_team_id", {
          rule_node_id: parsed.rule_node_id,
          memory_lane: node.memory_lane,
        });
      }
    }

    const defRes = await client.query<{
      if_json: any;
      then_json: any;
      exceptions_json: any;
      rule_scope: string;
      target_agent_id: string | null;
      target_team_id: string | null;
    }>(
      `SELECT if_json, then_json, exceptions_json, rule_scope::text, target_agent_id, target_team_id
       FROM memory_rule_defs
       WHERE scope = $1 AND rule_node_id = $2`,
      [scope, parsed.rule_node_id],
    );

    let if_json: any = defRes.rowCount ? defRes.rows[0].if_json : null;
    let then_json: any = defRes.rowCount ? defRes.rows[0].then_json : null;
    let exceptions_json: any = defRes.rowCount ? defRes.rows[0].exceptions_json : null;
    let rule_scope: string = defRes.rowCount ? String(defRes.rows[0].rule_scope ?? "global") : "global";
    let target_agent_id: string | null = defRes.rowCount ? defRes.rows[0].target_agent_id : null;
    let target_team_id: string | null = defRes.rowCount ? defRes.rows[0].target_team_id : null;

    if (!defRes.rowCount) {
      const nr = await client.query<{ slots: any }>(
        `SELECT slots
         FROM memory_nodes
         WHERE scope = $1 AND id = $2 AND type = 'rule'`,
        [scope, parsed.rule_node_id],
      );
      const slots = nr.rowCount ? (nr.rows[0].slots ?? {}) : {};
      if_json = slots?.if ?? {};
      then_json = slots?.then ?? {};
      exceptions_json = slots?.exceptions ?? [];
      const scopeRaw = typeof slots?.rule_scope === "string" ? String(slots.rule_scope).trim().toLowerCase() : "";
      rule_scope = scopeRaw === "team" || scopeRaw === "agent" ? scopeRaw : "global";
      target_agent_id =
        typeof slots?.target_agent_id === "string" && String(slots.target_agent_id).trim().length > 0
          ? String(slots.target_agent_id).trim()
          : null;
      target_team_id =
        typeof slots?.target_team_id === "string" && String(slots.target_team_id).trim().length > 0
          ? String(slots.target_team_id).trim()
          : null;
    }

    if (!isPlainObject(if_json)) {
      badRequest("invalid_rule_if_json", "rule if_json must be an object");
    }
    if (!Array.isArray(exceptions_json)) {
      badRequest("invalid_rule_exceptions_json", "rule exceptions_json must be an array");
    }
    try {
      parsePolicyPatch(then_json);
    } catch (e: any) {
      badRequest("invalid_rule_then_json", "rule then_json does not match the allowed policy schema", {
        message: String(e?.message ?? e),
      });
    }
    if (rule_scope === "agent" && !target_agent_id) {
      badRequest("invalid_rule_scope_target", "agent-scoped rule requires target_agent_id");
    }
    if (rule_scope === "team" && !target_team_id) {
      badRequest("invalid_rule_scope_target", "team-scoped rule requires target_team_id");
    }
  }

  const parentRes = await client.query<{ id: string; commit_hash: string }>(
    "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
    [scope],
  );
  const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
  const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

  const diff = { rule_state_change: [{ rule_node_id: parsed.rule_node_id, state: parsed.state }] };
  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(
    stableStringify({ parentHash, inputSha, diffSha, scope, actor, kind: "rule_state_change" }),
  );

  const commitRes = await client.query<{ id: string }>(
    `INSERT INTO memory_commits
      (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id`,
    [scope, parentId, inputSha, JSON.stringify(diff), actor, commitHash],
  );
  const commit_id = commitRes.rows[0].id;

  // Ensure a rule def row exists; if it doesn't, create one from node slots (or minimal empty as fallback).
  // Note: if promoting to shadow/active, validation above ensures the derived then_json is schema-valid.
  const slotRes = await client.query<{ slots: any }>(
    `SELECT slots
     FROM memory_nodes
     WHERE scope = $1 AND id = $2 AND type = 'rule'`,
    [scope, parsed.rule_node_id],
  );
  const slots = slotRes.rowCount ? (slotRes.rows[0].slots ?? {}) : {};
  const if_json = isPlainObject(slots?.if) ? slots.if : {};
  const then_json = isPlainObject(slots?.then) ? slots.then : {};
  const exceptions_json = Array.isArray(slots?.exceptions) ? slots.exceptions : [];
  const scopeRaw = typeof slots?.rule_scope === "string" ? String(slots.rule_scope).trim().toLowerCase() : "";
  const rule_scope = scopeRaw === "team" || scopeRaw === "agent" ? scopeRaw : "global";
  const target_agent_id =
    typeof slots?.target_agent_id === "string" && String(slots.target_agent_id).trim().length > 0
      ? String(slots.target_agent_id).trim()
      : null;
  const target_team_id =
    typeof slots?.target_team_id === "string" && String(slots.target_team_id).trim().length > 0
      ? String(slots.target_team_id).trim()
      : null;

  await client.query(
    `
    INSERT INTO memory_rule_defs
      (scope, rule_node_id, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, commit_id)
    VALUES
      ($1, $2, $3::memory_rule_state, $4::jsonb, $5::jsonb, $6::jsonb, $7::memory_rule_scope, $8, $9, $10)
    ON CONFLICT (rule_node_id) DO UPDATE SET
      state = EXCLUDED.state,
      commit_id = EXCLUDED.commit_id,
      updated_at = now()
    `,
    [
      scope,
      parsed.rule_node_id,
      parsed.state,
      JSON.stringify(if_json),
      JSON.stringify(then_json),
      JSON.stringify(exceptions_json),
      rule_scope,
      target_agent_id,
      target_team_id,
      commit_id,
    ],
  );

  // Optional: touch the node so it has a recent activation timestamp when it becomes active.
  if (parsed.state === "active" || parsed.state === "shadow") {
    await client.query(
      "UPDATE memory_nodes SET last_activated = now() WHERE scope = $1 AND id = $2",
      [scope, parsed.rule_node_id],
    );
  }

  return { tenant_id: tenancy.tenant_id, scope: tenancy.scope, commit_id, commit_hash: commitHash };
}
