import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { RuleStateUpdateRequest } from "./schemas.js";
import { badRequest } from "../util/http.js";
import { parsePolicyPatch } from "./rule-policy.js";
import { resolveTenantScope } from "./tenant.js";
import type { EmbeddedMemoryRuntime, EmbeddedRuleDefSyncInput } from "../store/embedded-memory-runtime.js";
import type { LiteWriteStore } from "../store/lite-write-store.js";

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

type UpdateRuleStateOptions = {
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
  liteWriteStore?: Pick<
    LiteWriteStore,
    "resolveNode" | "getRuleDef" | "latestCommit" | "insertCommit" | "upsertRuleState"
  > | null;
};

type RuleDefSyncRow = EmbeddedRuleDefSyncInput;

function deriveRuleDefFromSlots(slots: Record<string, unknown> | null | undefined) {
  const raw = slots ?? {};
  const if_json = isPlainObject(raw.if) ? raw.if : {};
  const then_json = isPlainObject(raw.then) ? raw.then : {};
  const exceptions_json = Array.isArray(raw.exceptions) ? raw.exceptions : [];
  const scopeRaw = typeof raw.rule_scope === "string" ? String(raw.rule_scope).trim().toLowerCase() : "";
  const rule_scope: "global" | "team" | "agent" = scopeRaw === "team" || scopeRaw === "agent" ? scopeRaw : "global";
  const target_agent_id =
    typeof raw.target_agent_id === "string" && String(raw.target_agent_id).trim().length > 0
      ? String(raw.target_agent_id).trim()
      : null;
  const target_team_id =
    typeof raw.target_team_id === "string" && String(raw.target_team_id).trim().length > 0
      ? String(raw.target_team_id).trim()
      : null;
  return {
    if_json,
    then_json,
    exceptions_json,
    rule_scope,
    target_agent_id,
    target_team_id,
  };
}

async function updateRuleStateLite(
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: UpdateRuleStateOptions,
) {
  const liteWriteStore = opts.liteWriteStore;
  if (!liteWriteStore) throw new Error("lite_write_store_required");

  const parsed = RuleStateUpdateRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const actor = parsed.actor ?? "system";
  const inputSha = parsed.input_sha256 ?? sha256Hex(parsed.input_text!);

  const node = await liteWriteStore.resolveNode({
    scope,
    id: parsed.rule_node_id,
    type: "rule",
  });
  if (!node) {
    badRequest("rule_not_found_in_scope", "rule_node_id was not found in this scope", {
      rule_node_id: parsed.rule_node_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

  let existing = await liteWriteStore.getRuleDef(scope, parsed.rule_node_id);
  let if_json = existing?.if_json ?? null;
  let then_json = existing?.then_json ?? null;
  let exceptions_json = existing?.exceptions_json ?? null;
  let rule_scope = existing?.rule_scope ?? "global";
  let target_agent_id = existing?.target_agent_id ?? null;
  let target_team_id = existing?.target_team_id ?? null;

  if (!existing) {
    const derived = deriveRuleDefFromSlots(node.slots);
    if_json = derived.if_json;
    then_json = derived.then_json;
    exceptions_json = derived.exceptions_json;
    rule_scope = derived.rule_scope;
    target_agent_id = derived.target_agent_id;
    target_team_id = derived.target_team_id;
  }

  if (parsed.state === "shadow" || parsed.state === "active") {
    if (node.memory_lane === "private" && !node.owner_agent_id && !node.owner_team_id) {
      badRequest("invalid_private_rule_owner", "private rule requires owner_agent_id or owner_team_id", {
        rule_node_id: parsed.rule_node_id,
        memory_lane: node.memory_lane,
      });
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

  const parent = await liteWriteStore.latestCommit(scope);
  const parentHash = parent?.commit_hash ?? "";
  const parentId = parent?.id ?? null;
  const diff = { rule_state_change: [{ rule_node_id: parsed.rule_node_id, state: parsed.state }] };
  const diffSha = sha256Hex(stableStringify(diff));
  const commitHash = sha256Hex(
    stableStringify({ parentHash, inputSha, diffSha, scope, actor, kind: "rule_state_change" }),
  );
  const commit_id = await liteWriteStore.insertCommit({
    scope,
    parentCommitId: parentId,
    inputSha256: inputSha,
    diffJson: JSON.stringify(diff),
    actor,
    modelVersion: null,
    promptVersion: null,
    commitHash,
  });

  const upserted = await liteWriteStore.upsertRuleState({
    scope,
    ruleNodeId: parsed.rule_node_id,
    state: parsed.state,
    ifJson: isPlainObject(if_json) ? if_json : {},
    thenJson: isPlainObject(then_json) ? then_json : {},
    exceptionsJson: Array.isArray(exceptions_json) ? exceptions_json : [],
    ruleScope: rule_scope,
    targetAgentId: target_agent_id,
    targetTeamId: target_team_id,
    positiveCount: existing?.positive_count ?? 0,
    negativeCount: existing?.negative_count ?? 0,
    commitId: commit_id,
  });

  const becameExecutionRelevant = parsed.state === "active" || parsed.state === "shadow";
  if (opts.embeddedRuntime) {
    await opts.embeddedRuntime.syncRuleDefs([upserted], { touchRuleNodes: becameExecutionRelevant });
  }

  return { tenant_id: tenancy.tenant_id, scope: tenancy.scope, commit_id, commit_hash: commitHash };
}

export async function updateRuleState(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: UpdateRuleStateOptions = {},
) {
  if (opts.liteWriteStore) {
    return await updateRuleStateLite(body, defaultScope, defaultTenantId, opts);
  }
  const parsed = RuleStateUpdateRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;
  const actor = parsed.actor ?? "system";
  const inputSha = parsed.input_sha256 ?? sha256Hex(parsed.input_text!);

  // Hard isolation guard: state updates must target an existing rule node in the same scope.
  // Without this, ON CONFLICT(rule_node_id) can mutate another scope's rule row.
  const ruleNodeScopeRes = await client.query(
    `
    SELECT 1
    FROM memory_nodes
    WHERE scope = $1
      AND id = $2
      AND type = 'rule'
    `,
    [scope, parsed.rule_node_id],
  );
  if ((ruleNodeScopeRes.rowCount ?? 0) !== 1) {
    badRequest("rule_not_found_in_scope", "rule_node_id was not found in this scope", {
      rule_node_id: parsed.rule_node_id,
      scope: tenancy.scope,
      tenant_id: tenancy.tenant_id,
    });
  }

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
  const { if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id } =
    deriveRuleDefFromSlots(slots);

  const ruleDefRes = await client.query<RuleDefSyncRow>(
    `
    INSERT INTO memory_rule_defs
      (scope, rule_node_id, state, if_json, then_json, exceptions_json, rule_scope, target_agent_id, target_team_id, commit_id)
    VALUES
      ($1, $2, $3::memory_rule_state, $4::jsonb, $5::jsonb, $6::jsonb, $7::memory_rule_scope, $8, $9, $10)
    ON CONFLICT (rule_node_id) DO UPDATE SET
      state = EXCLUDED.state,
      commit_id = EXCLUDED.commit_id,
      updated_at = now()
    WHERE memory_rule_defs.scope = EXCLUDED.scope
    RETURNING
      scope,
      rule_node_id::text AS rule_node_id,
      state::text AS state,
      rule_scope::text AS rule_scope,
      target_agent_id,
      target_team_id,
      if_json,
      then_json,
      exceptions_json,
      positive_count,
      negative_count,
      commit_id::text AS commit_id,
      updated_at::text AS updated_at
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

  const becameExecutionRelevant = parsed.state === "active" || parsed.state === "shadow";

  // Optional: touch the node so it has a recent activation timestamp when it becomes active.
  if (becameExecutionRelevant) {
    await client.query(
      "UPDATE memory_nodes SET last_activated = now() WHERE scope = $1 AND id = $2",
      [scope, parsed.rule_node_id],
    );
  }

  if (opts.embeddedRuntime && ruleDefRes.rowCount) {
    await opts.embeddedRuntime.syncRuleDefs(ruleDefRes.rows, { touchRuleNodes: becameExecutionRelevant });
  }

  return { tenant_id: tenancy.tenant_id, scope: tenancy.scope, commit_id, commit_hash: commitHash };
}
