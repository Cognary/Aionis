import { randomUUID } from "node:crypto";
import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { sha256Hex } from "../util/crypto.js";
import { badRequest } from "../util/http.js";
import { normalizeText } from "../util/normalize.js";
import { redactPII } from "../util/redaction.js";
import {
  hashExecutionContext,
  hashPolicy,
  normalizeToolCandidates,
  uniqueRuleIds,
} from "./execution-provenance.js";
import { ToolsFeedbackRequest } from "./schemas.js";
import { evaluateRulesAppliedOnly } from "./rules-evaluate.js";
import { resolveTenantScope } from "./tenant.js";
import type {
  EmbeddedExecutionDecisionView,
  EmbeddedMemoryRuntime,
  EmbeddedRuleDefSyncInput,
  EmbeddedRuleFeedbackSyncInput,
} from "../store/embedded-memory-runtime.js";

type FeedbackOptions = {
  maxTextLen: number;
  piiRedaction: boolean;
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
};

type DecisionRow = {
  id: string;
  scope: string;
  run_id: string | null;
  selected_tool: string | null;
  candidates_json: any;
  context_sha256: string;
  policy_sha256: string;
  created_at: string;
};

type RuleDefSyncRow = EmbeddedRuleDefSyncInput;

function isToolTouched(paths: string[]): boolean {
  for (const p of paths) {
    if (p === "tool" || p.startsWith("tool.")) return true;
  }
  return false;
}

function normalizeToolName(v: string): string {
  return String(v ?? "").trim();
}

function toDecisionRow(row: EmbeddedExecutionDecisionView): DecisionRow {
  return {
    id: row.id,
    scope: row.scope,
    run_id: row.run_id,
    selected_tool: row.selected_tool,
    candidates_json: row.candidates_json,
    context_sha256: row.context_sha256,
    policy_sha256: row.policy_sha256,
    created_at: row.created_at,
  };
}

async function findDecisionById(client: pg.PoolClient, scope: string, decisionId: string): Promise<DecisionRow | null> {
  const r = await client.query<DecisionRow>(
    `
    SELECT
      id::text,
      scope,
      run_id,
      selected_tool,
      candidates_json,
      context_sha256,
      policy_sha256,
      created_at::text AS created_at
    FROM memory_execution_decisions
    WHERE scope = $1
      AND id = $2
    LIMIT 1
    `,
    [scope, decisionId],
  );
  return r.rows[0] ?? null;
}

async function inferDecision(
  client: pg.PoolClient,
  scope: string,
  runId: string | null,
  selectedTool: string,
  candidatesJson: string,
  contextSha256: string,
): Promise<DecisionRow | null> {
  if (runId) {
    const byRun = await client.query<DecisionRow>(
      `
      SELECT
        id::text,
        scope,
        run_id,
        selected_tool,
        candidates_json,
        context_sha256,
        policy_sha256,
        created_at::text AS created_at
      FROM memory_execution_decisions
      WHERE scope = $1
        AND decision_kind = 'tools_select'
        AND run_id = $2
        AND selected_tool = $3
        AND candidates_json = $4::jsonb
        AND context_sha256 = $5
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [scope, runId, selectedTool, candidatesJson, contextSha256],
    );
    if (byRun.rowCount) return byRun.rows[0];
  }

  const fallback = await client.query<DecisionRow>(
    `
    SELECT
      id::text,
      scope,
      run_id,
      selected_tool,
      candidates_json,
      context_sha256,
      policy_sha256,
      created_at::text AS created_at
    FROM memory_execution_decisions
    WHERE scope = $1
      AND decision_kind = 'tools_select'
      AND selected_tool = $2
      AND candidates_json = $3::jsonb
      AND context_sha256 = $4
      AND created_at >= now() - interval '24 hours'
      AND ($5::text IS NULL OR run_id IS NULL)
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [scope, selectedTool, candidatesJson, contextSha256, runId],
  );
  return fallback.rows[0] ?? null;
}

async function createDecisionFromFeedback(
  client: pg.PoolClient,
  scope: string,
  runId: string | null,
  selectedTool: string,
  candidatesJson: string,
  contextSha256: string,
  policySha256: string,
  sourceRuleIds: string[],
): Promise<DecisionRow> {
  const decisionId = randomUUID();
  const r = await client.query<DecisionRow>(
    `
    INSERT INTO memory_execution_decisions
      (id, scope, decision_kind, run_id, selected_tool, candidates_json, context_sha256, policy_sha256, source_rule_ids, metadata_json)
    VALUES
      ($1, $2, 'tools_select', $3, $4, $5::jsonb, $6, $7, $8::uuid[], $9::jsonb)
    RETURNING
      id::text,
      scope,
      run_id,
      selected_tool,
      candidates_json,
      context_sha256,
      policy_sha256,
      created_at::text AS created_at
    `,
    [
      decisionId,
      scope,
      runId,
      selectedTool,
      candidatesJson,
      contextSha256,
      policySha256,
      sourceRuleIds,
      JSON.stringify({ source: "feedback_derived" }),
    ],
  );
  return r.rows[0];
}

function assertDecisionCompatible(
  decision: DecisionRow,
  parsed: { run_id?: string; selected_tool: string; decision_id?: string },
  normalizedCandidates: string[],
) {
  const selectedTool = normalizeToolName(parsed.selected_tool);
  if ((decision.selected_tool ?? "") !== selectedTool) {
    badRequest("decision_selected_tool_mismatch", "decision_id does not match selected_tool", {
      decision_id: parsed.decision_id,
      decision_selected_tool: decision.selected_tool,
      request_selected_tool: selectedTool,
    });
  }

  const wantCandidates = stableStringify(normalizedCandidates);
  const gotCandidates = stableStringify(Array.isArray(decision.candidates_json) ? decision.candidates_json : []);
  if (wantCandidates !== gotCandidates) {
    badRequest("decision_candidates_mismatch", "decision_id does not match candidates", {
      decision_id: parsed.decision_id,
    });
  }

  if (parsed.run_id && decision.run_id && parsed.run_id !== decision.run_id) {
    badRequest("decision_run_id_mismatch", "decision_id run_id does not match feedback run_id", {
      decision_id: parsed.decision_id,
      decision_run_id: decision.run_id,
      request_run_id: parsed.run_id,
    });
  }
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
  const normalizedCandidates = normalizeToolCandidates(parsed.candidates);
  const selectedTool = normalizeToolName(parsed.selected_tool);

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
  }, { embeddedRuntime: opts.embeddedRuntime ?? null });

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

  const uniq = uniqueRuleIds(targetRuleIds);

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

  const contextSha256 = hashExecutionContext(parsed.context);
  const policySha256 = hashPolicy((rules.applied as any)?.policy ?? {});
  const candidatesJson = JSON.stringify(normalizedCandidates);

  let decision: DecisionRow | null = null;
  if (parsed.decision_id) {
    decision = await findDecisionById(client, scope, parsed.decision_id);
  }
  let decision_link_mode: "provided" | "inferred" | "created_from_feedback" = "provided";

  if (parsed.decision_id) {
    if (!decision) {
      badRequest("decision_not_found_in_scope", "decision_id was not found in this scope", {
        decision_id: parsed.decision_id,
        scope: tenancy.scope,
        tenant_id: tenancy.tenant_id,
      });
    }
  } else {
    if (opts.embeddedRuntime) {
      const inferred = opts.embeddedRuntime.inferExecutionDecision({
        scope,
        run_id: parsed.run_id ?? null,
        selected_tool: selectedTool,
        candidates_json: normalizedCandidates,
        context_sha256: contextSha256,
      });
      if (inferred) {
        decision = toDecisionRow(inferred);
      }
    }
    if (!decision) {
      decision = await inferDecision(client, scope, parsed.run_id ?? null, selectedTool, candidatesJson, contextSha256);
    }
    if (decision) {
      decision_link_mode = "inferred";
    } else {
      decision = await createDecisionFromFeedback(
        client,
        scope,
        parsed.run_id ?? null,
        selectedTool,
        candidatesJson,
        contextSha256,
        policySha256,
        uniq,
      );
      if (opts.embeddedRuntime) {
        await opts.embeddedRuntime.syncExecutionDecisions([
          {
            id: decision.id,
            scope,
            decision_kind: "tools_select",
            run_id: decision.run_id,
            selected_tool: decision.selected_tool,
            candidates_json: decision.candidates_json,
            context_sha256: decision.context_sha256,
            policy_sha256: decision.policy_sha256,
            source_rule_ids: uniq,
            metadata_json: { source: "feedback_derived" },
            created_at: decision.created_at,
            commit_id: null,
          },
        ]);
      }
      decision_link_mode = "created_from_feedback";
    }
  }

  assertDecisionCompatible(decision!, parsed, normalizedCandidates);

  if (opts.embeddedRuntime && decision) {
    await opts.embeddedRuntime.syncExecutionDecisions([
      {
        id: decision.id,
        scope,
        decision_kind: "tools_select",
        run_id: decision.run_id,
        selected_tool: decision.selected_tool,
        candidates_json: decision.candidates_json,
        context_sha256: decision.context_sha256,
        policy_sha256: decision.policy_sha256,
        created_at: decision.created_at,
      },
    ]);
  }

  if (parsed.run_id && !decision!.run_id) {
    const adoptRunRes = await client.query<{ run_id: string | null }>(
      `
      UPDATE memory_execution_decisions
      SET run_id = $1
      WHERE scope = $2
        AND id = $3
        AND run_id IS NULL
      RETURNING run_id
      `,
      [parsed.run_id, scope, decision!.id],
    );
    if (adoptRunRes.rowCount) {
      decision!.run_id = adoptRunRes.rows[0]?.run_id ?? parsed.run_id;
    } else {
      const dbDecision = await findDecisionById(client, scope, decision!.id);
      if (!dbDecision) {
        badRequest("decision_not_found_in_scope", "decision_id was not found in this scope", {
          decision_id: decision!.id,
          scope: tenancy.scope,
          tenant_id: tenancy.tenant_id,
        });
      }
      decision = dbDecision;
      assertDecisionCompatible(decision, parsed, normalizedCandidates);
    }
    if (opts.embeddedRuntime) {
      await opts.embeddedRuntime.syncExecutionDecisions([
        {
          id: decision!.id,
          scope,
          decision_kind: "tools_select",
          run_id: decision!.run_id,
          selected_tool: decision!.selected_tool,
          candidates_json: decision!.candidates_json,
          context_sha256: decision!.context_sha256,
          policy_sha256: decision!.policy_sha256,
          created_at: decision!.created_at,
          commit_id: null,
        },
      ]);
    }
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
        decision_id: decision!.id,
        decision_link_mode,
        run_id: parsed.run_id ?? null,
        outcome: parsed.outcome,
        selected_tool: selectedTool,
        candidates: normalizedCandidates,
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

  if (decision_link_mode === "created_from_feedback") {
    await client.query(
      `
      UPDATE memory_execution_decisions
      SET commit_id = $1
      WHERE scope = $2
        AND id = $3
      `,
      [commit_id, scope, decision!.id],
    );
    if (opts.embeddedRuntime) {
      await opts.embeddedRuntime.syncExecutionDecisions([
        {
          id: decision!.id,
          scope,
          decision_kind: "tools_select",
          run_id: decision!.run_id,
          selected_tool: decision!.selected_tool,
          candidates_json: decision!.candidates_json,
          context_sha256: decision!.context_sha256,
          policy_sha256: decision!.policy_sha256,
          source_rule_ids: uniq,
          metadata_json: { source: "feedback_derived" },
          created_at: decision!.created_at,
          commit_id,
        },
      ]);
    }
  }

  // Insert feedback rows (one per rule) to keep per-rule auditability.
  // Note: we intentionally attribute the same outcome to all matched rule sources for MVP simplicity.
  const feedbackRowsForMirror: EmbeddedRuleFeedbackSyncInput[] = [];
  const feedbackCreatedAt = new Date().toISOString();
  for (const rule_node_id of uniq) {
    const feedbackId = randomUUID();
    await client.query(
      `INSERT INTO memory_rule_feedback
        (id, scope, rule_node_id, run_id, outcome, note, source, decision_id, commit_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'tools_feedback', $7, $8)`,
      [feedbackId, scope, rule_node_id, parsed.run_id ?? null, parsed.outcome, note ?? null, decision!.id, commit_id],
    );
    feedbackRowsForMirror.push({
      id: feedbackId,
      scope,
      rule_node_id,
      run_id: parsed.run_id ?? null,
      outcome: parsed.outcome,
      note: note ?? null,
      source: "tools_feedback",
      decision_id: decision!.id,
      commit_id,
      created_at: feedbackCreatedAt,
    });
  }

  if (opts.embeddedRuntime && feedbackRowsForMirror.length > 0) {
    await opts.embeddedRuntime.appendRuleFeedback(feedbackRowsForMirror);
  }

  // Update aggregate stats for all attributed rules.
  const ruleDefRes = await client.query<RuleDefSyncRow>(
    `
    UPDATE memory_rule_defs
    SET
      positive_count = positive_count + CASE WHEN $2 = 'positive' THEN 1 ELSE 0 END,
      negative_count = negative_count + CASE WHEN $2 = 'negative' THEN 1 ELSE 0 END,
      last_evaluated_at = now()
    WHERE scope = $1 AND rule_node_id = ANY($3::uuid[])
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
    [scope, parsed.outcome, uniq],
  );

  if (opts.embeddedRuntime && ruleDefRes.rowCount) {
    await opts.embeddedRuntime.syncRuleDefs(ruleDefRes.rows);
  }

  return {
    ok: true,
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    updated_rules: uniq.length,
    rule_node_ids: uniq,
    commit_id,
    commit_hash: commitHash,
    decision_id: decision!.id,
    decision_link_mode,
    decision_policy_sha256: decision!.policy_sha256,
  };
}
