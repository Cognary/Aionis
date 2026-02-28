import type pg from "pg";
import { RulesEvaluateRequest } from "./schemas.js";
import { ruleMatchesContext } from "./rule-engine.js";
import { buildAppliedPolicy, parsePolicyPatch, type PolicyPatch } from "./rule-policy.js";
import { computeEffectiveToolPolicy } from "./tool-policy.js";
import { resolveTenantScope } from "./tenant.js";
import type { EmbeddedMemoryRuntime } from "../store/embedded-memory-runtime.js";

type RuleRow = {
  rule_node_id: string;
  state: "draft" | "shadow" | "active" | "disabled";
  rule_scope: "global" | "team" | "agent";
  target_agent_id: string | null;
  target_team_id: string | null;
  rule_memory_lane: "private" | "shared";
  rule_owner_agent_id: string | null;
  rule_owner_team_id: string | null;
  if_json: any;
  then_json: any;
  exceptions_json: any;
  positive_count: number;
  negative_count: number;
  rule_commit_id: string;
  rule_summary: string | null;
  rule_slots: any;
  updated_at: string;
};

type RuleRankMeta = {
  score: number;
  evidence_score: number;
  priority: number;
  weight: number;
  specificity: number;
  condition_paths: string[];
};

type EvaluateRulesOptions = {
  embeddedRuntime?: EmbeddedMemoryRuntime | null;
};

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function clampInt(v: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  const n = Math.trunc(v);
  return Math.max(lo, Math.min(hi, n));
}

function clampNum(v: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

function collectConditionPaths(pattern: any, prefix = "", out?: Set<string>): Set<string> {
  const s = out ?? new Set<string>();
  if (pattern === null || pattern === undefined) return s;

  if (Array.isArray(pattern)) {
    if (prefix) s.add(prefix);
    return s;
  }

  if (isPlainObject(pattern)) {
    const keys = Object.keys(pattern);
    if (keys.length === 0) {
      if (prefix) s.add(prefix);
      return s;
    }
    for (const k of keys) {
      const v = pattern[k];
      if (k === "$and" || k === "$or") {
        if (Array.isArray(v)) {
          for (const p of v) collectConditionPaths(p, prefix, s);
        }
        continue;
      }
      if (k === "$not") {
        collectConditionPaths(v, prefix, s);
        continue;
      }
      if (k.startsWith("$")) {
        if (prefix) s.add(prefix);
        continue;
      }
      const next = prefix ? `${prefix}.${k}` : k;
      collectConditionPaths(v, next, s);
    }
    return s;
  }

  if (prefix) s.add(prefix);
  return s;
}

function readRuleRankMeta(row: Pick<RuleRow, "if_json" | "positive_count" | "negative_count" | "rule_slots">): RuleRankMeta {
  const evidence = Number(row.positive_count ?? 0) - Number(row.negative_count ?? 0);
  const slots = row.rule_slots ?? {};
  const meta = isPlainObject(slots?.rule_meta) ? slots.rule_meta : {};

  const priorityRaw = Number(meta?.priority ?? slots?.priority ?? 0);
  const weightRaw = Number(meta?.weight ?? slots?.weight ?? 1);
  const priority = clampInt(priorityRaw, -100, 100, 0);
  const weight = clampNum(weightRaw, 0, 2, 1);

  const conditionPaths = Array.from(collectConditionPaths(row.if_json)).sort();
  const specificity = conditionPaths.length;

  // Winner ranking semantics (deterministic):
  // priority dominates > weighted evidence > condition specificity.
  const score = priority * 1000 + evidence * 100 * weight + specificity;

  return {
    score,
    evidence_score: evidence,
    priority,
    weight,
    specificity,
    condition_paths: conditionPaths,
  };
}

function contextAgentId(ctx: any): string | null {
  const a = typeof ctx?.agent?.id === "string" ? ctx.agent.id.trim() : "";
  if (a) return a;
  const b = typeof ctx?.agent_id === "string" ? ctx.agent_id.trim() : "";
  return b || null;
}

function contextTeamId(ctx: any): string | null {
  const a = typeof ctx?.agent?.team_id === "string" ? ctx.agent.team_id.trim() : "";
  if (a) return a;
  const b = typeof ctx?.team_id === "string" ? ctx.team_id.trim() : "";
  return b || null;
}

function laneEnforcementStatus(
  ctxAgentId: string | null,
  ctxTeamId: string | null,
): { applied: boolean; reason: string } {
  if (!ctxAgentId && !ctxTeamId) {
    return { applied: false, reason: "missing_agent_context" };
  }
  if (ctxAgentId && ctxTeamId) {
    return { applied: true, reason: "enforced_agent_team" };
  }
  if (ctxAgentId) {
    return { applied: true, reason: "enforced_agent_only" };
  }
  return { applied: true, reason: "enforced_team_only" };
}

function scopeRuleMatchesContext(row: Pick<RuleRow, "rule_scope" | "target_agent_id" | "target_team_id">, ctx: any): boolean {
  const scope = row.rule_scope ?? "global";
  if (scope === "global") return true;
  const agentId = contextAgentId(ctx);
  const teamId = contextTeamId(ctx);
  if (scope === "agent") {
    if (!row.target_agent_id) return false;
    return !!agentId && agentId === row.target_agent_id;
  }
  if (scope === "team") {
    if (!row.target_team_id) return false;
    return !!teamId && teamId === row.target_team_id;
  }
  return false;
}

function laneRuleMatchesContext(
  row: Pick<RuleRow, "rule_memory_lane" | "rule_owner_agent_id" | "rule_owner_team_id">,
  ctxAgentId: string | null,
  ctxTeamId: string | null,
  enforceLane: boolean,
): { visible: boolean; legacy_unowned_private_detected: boolean } {
  if (!enforceLane) return { visible: true, legacy_unowned_private_detected: false };
  if (row.rule_memory_lane === "shared") return { visible: true, legacy_unowned_private_detected: false };

  const ownerAgent = row.rule_owner_agent_id;
  const ownerTeam = row.rule_owner_team_id;
  if (ownerAgent && ctxAgentId && ownerAgent === ctxAgentId) {
    return { visible: true, legacy_unowned_private_detected: false };
  }
  if (ownerTeam && ctxTeamId && ownerTeam === ctxTeamId) {
    return { visible: true, legacy_unowned_private_detected: false };
  }

  // Legacy rows without owner info are treated as non-visible under strict lane enforcement.
  if (!ownerAgent && !ownerTeam) {
    return { visible: false, legacy_unowned_private_detected: true };
  }

  return { visible: false, legacy_unowned_private_detected: false };
}

function buildConflictExplain(
  conflicts: Array<{ path: string; winner_rule_node_id: string }>,
  sources: Array<{ rule_node_id: string; touched_paths: string[] }>,
  rankByRule: Map<string, RuleRankMeta>,
) {
  const out: Array<{
    path: string;
    winner: {
      rule_node_id: string;
      score: number | null;
      priority: number | null;
      weight: number | null;
      evidence_score: number | null;
      specificity: number | null;
    };
    losers: Array<{ rule_node_id: string; score: number | null }>;
    reason: string;
  }> = [];

  for (const c of conflicts) {
    const contributors = sources
      .filter((s) => Array.isArray(s.touched_paths) && s.touched_paths.includes(c.path))
      .map((s) => s.rule_node_id);
    const winnerRank = rankByRule.get(c.winner_rule_node_id);
    const losers = contributors
      .filter((id) => id !== c.winner_rule_node_id)
      .map((id) => ({ rule_node_id: id, score: rankByRule.get(id)?.score ?? null }))
      .sort((a, b) => Number(b.score ?? -Infinity) - Number(a.score ?? -Infinity))
      .slice(0, 5);

    out.push({
      path: c.path,
      winner: {
        rule_node_id: c.winner_rule_node_id,
        score: winnerRank?.score ?? null,
        priority: winnerRank?.priority ?? null,
        weight: winnerRank?.weight ?? null,
        evidence_score: winnerRank?.evidence_score ?? null,
        specificity: winnerRank?.specificity ?? null,
      },
      losers,
      reason: "higher rank wins (priority > evidence*weight > condition_specificity)",
    });
    if (out.length >= 50) break;
  }

  return out;
}

async function queryRuleRows(client: pg.PoolClient, scope: string, limit: number): Promise<RuleRow[]> {
  const rr = await client.query<RuleRow>(
    `
    SELECT
      d.rule_node_id,
      d.state::text AS state,
      d.rule_scope::text AS rule_scope,
      d.target_agent_id,
      d.target_team_id,
      n.memory_lane::text AS rule_memory_lane,
      n.owner_agent_id AS rule_owner_agent_id,
      n.owner_team_id AS rule_owner_team_id,
      d.if_json,
      d.then_json,
      d.exceptions_json,
      d.positive_count,
      d.negative_count,
      d.commit_id::text AS rule_commit_id,
      n.text_summary AS rule_summary,
      n.slots AS rule_slots,
      d.updated_at::text AS updated_at
    FROM memory_rule_defs d
    JOIN memory_nodes n ON n.id = d.rule_node_id AND n.scope = d.scope
    WHERE d.scope = $1
      AND d.state IN ('shadow', 'active')
    ORDER BY d.updated_at DESC
    LIMIT $2
    `,
    [scope, limit],
  );
  return rr.rows;
}

async function loadRuleRows(
  client: pg.PoolClient,
  scope: string,
  limit: number,
  embeddedRuntime: EmbeddedMemoryRuntime | null | undefined,
): Promise<RuleRow[]> {
  if (embeddedRuntime) {
    return embeddedRuntime
      .listRuleCandidates({
        scope,
        limit,
        states: ["shadow", "active"],
      })
      .map((r) => ({
        rule_node_id: r.rule_node_id,
        state: r.state,
        rule_scope: r.rule_scope,
        target_agent_id: r.target_agent_id,
        target_team_id: r.target_team_id,
        rule_memory_lane: r.rule_memory_lane,
        rule_owner_agent_id: r.rule_owner_agent_id,
        rule_owner_team_id: r.rule_owner_team_id,
        if_json: r.if_json,
        then_json: r.then_json,
        exceptions_json: r.exceptions_json,
        positive_count: r.positive_count,
        negative_count: r.negative_count,
        rule_commit_id: r.rule_commit_id,
        rule_summary: r.rule_summary,
        rule_slots: r.rule_slots,
        updated_at: r.updated_at,
      }));
  }
  return await queryRuleRows(client, scope, limit);
}

export async function evaluateRules(
  client: pg.PoolClient,
  body: unknown,
  defaultScope: string,
  defaultTenantId: string,
  opts: EvaluateRulesOptions = {},
) {
  const parsed = RulesEvaluateRequest.parse(body);
  const tenancy = resolveTenantScope(
    { scope: parsed.scope, tenant_id: parsed.tenant_id },
    { defaultScope, defaultTenantId },
  );
  const scope = tenancy.scope_key;

  const rows = await loadRuleRows(client, scope, parsed.limit, opts.embeddedRuntime);

  const ctx = parsed.context;
  const ctxAgentId = contextAgentId(ctx);
  const ctxTeamId = contextTeamId(ctx);
  const laneStatus = laneEnforcementStatus(ctxAgentId, ctxTeamId);
  const enforceLane = laneStatus.applied;
  const active: any[] = [];
  const shadow: any[] = [];
  const activeForMerge: Array<{ rule_node_id: string; commit_id: string; rank: RuleRankMeta; then_patch: PolicyPatch }> = [];
  const shadowForMerge: Array<{ rule_node_id: string; commit_id: string; rank: RuleRankMeta; then_patch: PolicyPatch }> = [];
  let skipped_invalid_then = 0;
  const invalid_then_sample: Array<{ rule_node_id: string; state: string; commit_id: string }> = [];
  let filtered_by_scope = 0;
  let filtered_by_lane = 0;
  let filtered_by_condition = 0;
  let legacy_unowned_private_detected = 0;

  for (const r of rows) {
    if (!scopeRuleMatchesContext(r, ctx)) {
      filtered_by_scope += 1;
      continue;
    }
    const laneDecision = laneRuleMatchesContext(r, ctxAgentId, ctxTeamId, enforceLane);
    if (laneDecision.legacy_unowned_private_detected) {
      legacy_unowned_private_detected += 1;
    }
    if (!laneDecision.visible) {
      filtered_by_lane += 1;
      continue;
    }
    const ok = ruleMatchesContext(r.if_json, r.exceptions_json, ctx);
    if (!ok) {
      filtered_by_condition += 1;
      continue;
    }

    let then_patch: PolicyPatch;
    try {
      then_patch = parsePolicyPatch(r.then_json);
    } catch {
      skipped_invalid_then += 1;
      if (invalid_then_sample.length < 5) {
        invalid_then_sample.push({ rule_node_id: r.rule_node_id, state: r.state, commit_id: r.rule_commit_id });
      }
      continue;
    }

    const rank = readRuleRankMeta(r);
    const dto = {
      rule_node_id: r.rule_node_id,
      state: r.state,
      rule_scope: r.rule_scope,
      target_agent_id: r.target_agent_id,
      target_team_id: r.target_team_id,
      summary: r.rule_summary,
      if_json: r.if_json,
      then_json: then_patch,
      exceptions_json: r.exceptions_json,
      stats: { positive: r.positive_count, negative: r.negative_count },
      rank: {
        score: rank.score,
        evidence_score: rank.evidence_score,
        priority: rank.priority,
        weight: rank.weight,
        specificity: rank.specificity,
      },
      match_detail: {
        condition_paths: rank.condition_paths,
        condition_path_count: rank.condition_paths.length,
      },
      commit_id: r.rule_commit_id,
    };

    if (r.state === "active") {
      active.push(dto);
      activeForMerge.push({ rule_node_id: r.rule_node_id, commit_id: r.rule_commit_id, rank, then_patch });
    } else if (r.state === "shadow" && parsed.include_shadow) {
      shadow.push(dto);
      shadowForMerge.push({ rule_node_id: r.rule_node_id, commit_id: r.rule_commit_id, rank, then_patch });
    }
  }

  // Stable ordering: higher rule rank first.
  const score = (x: any) => Number(x?.rank?.score ?? 0);
  active.sort((a, b) => score(b) - score(a) || String(a.rule_node_id).localeCompare(String(b.rule_node_id)));
  shadow.sort((a, b) => score(b) - score(a) || String(a.rule_node_id).localeCompare(String(b.rule_node_id)));

  // Build an "applied" policy patch by merging matched rules.
  // Precedence: higher verification score should win on conflicts.
  const activeMerge = activeForMerge
    .slice()
    .sort((a, b) => a.rank.score - b.rank.score || String(a.rule_node_id).localeCompare(String(b.rule_node_id)))
    .map((r) => ({ rule_node_id: r.rule_node_id, state: "active" as const, commit_id: r.commit_id, then_patch: r.then_patch }));
  const appliedActive = buildAppliedPolicy(activeMerge);

  const shadowMerge = shadowForMerge
    .slice()
    .sort((a, b) => a.rank.score - b.rank.score || String(a.rule_node_id).localeCompare(String(b.rule_node_id)))
    .map((r) => ({ rule_node_id: r.rule_node_id, state: "shadow" as const, commit_id: r.commit_id, then_patch: r.then_patch }));
  const appliedShadow = buildAppliedPolicy(shadowMerge);

  // Tool policy has special semantics (deny=union, allow=intersection, prefer=score-desc priority list).
  // We compute it explicitly and override the generic merge's `tool` field to prevent silent semantic drift.
  const toolActive = computeEffectiveToolPolicy(
    activeForMerge.map((r) => ({
      rule_node_id: r.rule_node_id,
      score: r.rank.score,
      evidence_score: r.rank.evidence_score,
      priority: r.rank.priority,
      weight: r.rank.weight,
      specificity: r.rank.specificity,
      tool: r.then_patch.tool ?? null,
    })),
  );
  const toolShadow = computeEffectiveToolPolicy(
    shadowForMerge.map((r) => ({
      rule_node_id: r.rule_node_id,
      score: r.rank.score,
      evidence_score: r.rank.evidence_score,
      priority: r.rank.priority,
      weight: r.rank.weight,
      specificity: r.rank.specificity,
      tool: r.then_patch.tool ?? null,
    })),
  );
  (appliedActive.policy as any).tool = toolActive.tool;
  (appliedShadow.policy as any).tool = toolShadow.tool;

  const activeRankByRule = new Map<string, RuleRankMeta>(activeForMerge.map((x) => [x.rule_node_id, x.rank]));
  const shadowRankByRule = new Map<string, RuleRankMeta>(shadowForMerge.map((x) => [x.rule_node_id, x.rank]));
  const activeSources = appliedActive.sources.map((s) => ({
    ...s,
    rank: activeRankByRule.get(s.rule_node_id)
      ? {
          score: activeRankByRule.get(s.rule_node_id)!.score,
          evidence_score: activeRankByRule.get(s.rule_node_id)!.evidence_score,
          priority: activeRankByRule.get(s.rule_node_id)!.priority,
          weight: activeRankByRule.get(s.rule_node_id)!.weight,
          specificity: activeRankByRule.get(s.rule_node_id)!.specificity,
        }
      : null,
  }));
  const shadowSources = appliedShadow.sources.map((s) => ({
    ...s,
    rank: shadowRankByRule.get(s.rule_node_id)
      ? {
          score: shadowRankByRule.get(s.rule_node_id)!.score,
          evidence_score: shadowRankByRule.get(s.rule_node_id)!.evidence_score,
          priority: shadowRankByRule.get(s.rule_node_id)!.priority,
          weight: shadowRankByRule.get(s.rule_node_id)!.weight,
          specificity: shadowRankByRule.get(s.rule_node_id)!.specificity,
        }
      : null,
  }));
  const activeConflictExplain = buildConflictExplain(appliedActive.conflicts, activeSources, activeRankByRule);
  const shadowConflictExplain = buildConflictExplain(appliedShadow.conflicts, shadowSources, shadowRankByRule);

  return {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    considered: rows.length,
    matched: active.length + shadow.length,
    skipped_invalid_then,
    invalid_then_sample,
    active,
    shadow,
    agent_visibility_summary: {
      agent: { id: ctxAgentId, team_id: ctxTeamId },
      rule_scope: {
        scanned: rows.length,
        filtered_by_scope,
        filtered_by_lane,
        filtered_by_condition,
        skipped_invalid_then,
        matched_active: active.length,
        matched_shadow: shadow.length,
      },
      lane: {
        applied: laneStatus.applied,
        reason: laneStatus.reason,
        legacy_unowned_private_visible: 0,
        legacy_unowned_private_detected,
      },
    },
    applied: {
      policy: appliedActive.policy,
      sources: activeSources,
      conflicts: appliedActive.conflicts,
      conflict_explain: activeConflictExplain,
      tool_explain: toolActive.explain,
      ...(parsed.include_shadow
        ? {
            shadow_policy: appliedShadow.policy,
            shadow_sources: shadowSources,
            shadow_conflicts: appliedShadow.conflicts,
            shadow_conflict_explain: shadowConflictExplain,
            shadow_tool_explain: toolShadow.explain,
          }
        : {}),
    },
  };
}

// Applied-only variant for tool selector / planner injection: avoids returning full match DTOs.
export async function evaluateRulesAppliedOnly(
  client: pg.PoolClient,
  params: { scope: string; tenant_id?: string; context: any; include_shadow: boolean; limit: number; default_tenant_id?: string },
  opts: EvaluateRulesOptions = {},
) {
  const tenancy = resolveTenantScope(
    { scope: params.scope, tenant_id: params.tenant_id },
    { defaultScope: params.scope, defaultTenantId: params.default_tenant_id ?? "default" },
  );
  const scope = tenancy.scope_key;
  const ctxAgentId = contextAgentId(params.context);
  const ctxTeamId = contextTeamId(params.context);
  const laneStatus = laneEnforcementStatus(ctxAgentId, ctxTeamId);
  const rows = await loadRuleRows(client, scope, params.limit, opts.embeddedRuntime);

  const activeForMerge: Array<{ rule_node_id: string; commit_id: string; rank: RuleRankMeta; then_patch: PolicyPatch }> = [];
  const shadowForMerge: Array<{ rule_node_id: string; commit_id: string; rank: RuleRankMeta; then_patch: PolicyPatch }> = [];
  const enforceLane = laneStatus.applied;
  let skipped_invalid_then = 0;
  const invalid_then_sample: Array<{ rule_node_id: string; state: string; commit_id: string }> = [];
  let filtered_by_scope = 0;
  let filtered_by_lane = 0;
  let filtered_by_condition = 0;
  let legacy_unowned_private_detected = 0;

  for (const r of rows) {
    if (!scopeRuleMatchesContext(r, params.context)) {
      filtered_by_scope += 1;
      continue;
    }
    const laneDecision = laneRuleMatchesContext(r, ctxAgentId, ctxTeamId, enforceLane);
    if (laneDecision.legacy_unowned_private_detected) {
      legacy_unowned_private_detected += 1;
    }
    if (!laneDecision.visible) {
      filtered_by_lane += 1;
      continue;
    }
    const ok = ruleMatchesContext(r.if_json, r.exceptions_json, params.context);
    if (!ok) {
      filtered_by_condition += 1;
      continue;
    }

    let then_patch: PolicyPatch;
    try {
      then_patch = parsePolicyPatch(r.then_json);
    } catch {
      skipped_invalid_then += 1;
      if (invalid_then_sample.length < 5) {
        invalid_then_sample.push({ rule_node_id: r.rule_node_id, state: r.state, commit_id: r.rule_commit_id });
      }
      continue;
    }

    const rank = readRuleRankMeta(r);
    if (r.state === "active") activeForMerge.push({ rule_node_id: r.rule_node_id, commit_id: r.rule_commit_id, rank, then_patch });
    else if (r.state === "shadow" && params.include_shadow)
      shadowForMerge.push({ rule_node_id: r.rule_node_id, commit_id: r.rule_commit_id, rank, then_patch });
  }

  const activeMerge = activeForMerge
    .slice()
    .sort((a, b) => a.rank.score - b.rank.score || String(a.rule_node_id).localeCompare(String(b.rule_node_id)))
    .map((r) => ({ rule_node_id: r.rule_node_id, state: "active" as const, commit_id: r.commit_id, then_patch: r.then_patch }));
  const appliedActive = buildAppliedPolicy(activeMerge);

  const shadowMerge = shadowForMerge
    .slice()
    .sort((a, b) => a.rank.score - b.rank.score || String(a.rule_node_id).localeCompare(String(b.rule_node_id)))
    .map((r) => ({ rule_node_id: r.rule_node_id, state: "shadow" as const, commit_id: r.commit_id, then_patch: r.then_patch }));
  const appliedShadow = buildAppliedPolicy(shadowMerge);

  const toolActive = computeEffectiveToolPolicy(
    activeForMerge.map((r) => ({
      rule_node_id: r.rule_node_id,
      score: r.rank.score,
      evidence_score: r.rank.evidence_score,
      priority: r.rank.priority,
      weight: r.rank.weight,
      specificity: r.rank.specificity,
      tool: r.then_patch.tool ?? null,
    })),
  );
  const toolShadow = computeEffectiveToolPolicy(
    shadowForMerge.map((r) => ({
      rule_node_id: r.rule_node_id,
      score: r.rank.score,
      evidence_score: r.rank.evidence_score,
      priority: r.rank.priority,
      weight: r.rank.weight,
      specificity: r.rank.specificity,
      tool: r.then_patch.tool ?? null,
    })),
  );
  (appliedActive.policy as any).tool = toolActive.tool;
  (appliedShadow.policy as any).tool = toolShadow.tool;

  const activeRankByRule = new Map<string, RuleRankMeta>(activeForMerge.map((x) => [x.rule_node_id, x.rank]));
  const shadowRankByRule = new Map<string, RuleRankMeta>(shadowForMerge.map((x) => [x.rule_node_id, x.rank]));
  const activeSources = appliedActive.sources.map((s) => ({
    ...s,
    rank: activeRankByRule.get(s.rule_node_id)
      ? {
          score: activeRankByRule.get(s.rule_node_id)!.score,
          evidence_score: activeRankByRule.get(s.rule_node_id)!.evidence_score,
          priority: activeRankByRule.get(s.rule_node_id)!.priority,
          weight: activeRankByRule.get(s.rule_node_id)!.weight,
          specificity: activeRankByRule.get(s.rule_node_id)!.specificity,
        }
      : null,
  }));
  const shadowSources = appliedShadow.sources.map((s) => ({
    ...s,
    rank: shadowRankByRule.get(s.rule_node_id)
      ? {
          score: shadowRankByRule.get(s.rule_node_id)!.score,
          evidence_score: shadowRankByRule.get(s.rule_node_id)!.evidence_score,
          priority: shadowRankByRule.get(s.rule_node_id)!.priority,
          weight: shadowRankByRule.get(s.rule_node_id)!.weight,
          specificity: shadowRankByRule.get(s.rule_node_id)!.specificity,
        }
      : null,
  }));
  const activeConflictExplain = buildConflictExplain(appliedActive.conflicts, activeSources, activeRankByRule);
  const shadowConflictExplain = buildConflictExplain(appliedShadow.conflicts, shadowSources, shadowRankByRule);

  return {
    scope: tenancy.scope,
    tenant_id: tenancy.tenant_id,
    considered: rows.length,
    matched: activeForMerge.length + shadowForMerge.length,
    skipped_invalid_then,
    invalid_then_sample,
    agent_visibility_summary: {
      agent: { id: ctxAgentId, team_id: ctxTeamId },
      rule_scope: {
        scanned: rows.length,
        filtered_by_scope,
        filtered_by_lane,
        filtered_by_condition,
        skipped_invalid_then,
        matched_active: activeForMerge.length,
        matched_shadow: shadowForMerge.length,
      },
      lane: {
        applied: laneStatus.applied,
        reason: laneStatus.reason,
        legacy_unowned_private_visible: 0,
        legacy_unowned_private_detected,
      },
    },
    applied: {
      policy: appliedActive.policy,
      sources: activeSources,
      conflicts: appliedActive.conflicts,
      conflict_explain: activeConflictExplain,
      tool_explain: toolActive.explain,
      ...(params.include_shadow
        ? {
            shadow_policy: appliedShadow.policy,
            shadow_sources: shadowSources,
            shadow_conflicts: appliedShadow.conflicts,
            shadow_conflict_explain: shadowConflictExplain,
            shadow_tool_explain: toolShadow.explain,
          }
        : {}),
    },
  };
}
