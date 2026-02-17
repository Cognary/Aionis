import "dotenv/config";
import stableStringify from "fast-json-stable-stringify";
import type pg from "pg";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { sha256Hex } from "../util/crypto.js";
import { collectConsolidationCandidates, parseTypes, toMergeCandidateV1 } from "./consolidation-core.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

type NodeState = {
  id: string;
  scope: string;
  type: string;
  slots: any;
  commit_id: string | null;
  created_at: string;
  updated_at: string;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function clampNum(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function truthySlot(slots: any, key: string): boolean {
  const v = slots?.[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function asUuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^[0-9a-f-]{36}$/i.test(s)) return null;
  return s.toLowerCase();
}

function uniqStrings(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

async function fetchNodeStates(client: pg.PoolClient, scope: string, ids: string[]): Promise<Map<string, NodeState>> {
  if (ids.length === 0) return new Map();
  const r = await client.query<NodeState>(
    `
    SELECT
      id,
      scope,
      type::text AS type,
      slots,
      commit_id::text AS commit_id,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM memory_nodes
    WHERE scope = $1
      AND id = ANY($2::uuid[])
    `,
    [scope, ids],
  );
  return new Map(r.rows.map((x) => [x.id, x]));
}

async function main() {
  const scope = argValue("--scope") ?? env.MEMORY_SCOPE;
  const apply = hasFlag("--apply");
  const types = parseTypes(argValue("--types"));
  const maxAnchors = clampInt(Number(argValue("--max-anchors") ?? String(env.MEMORY_CONSOLIDATION_MAX_ANCHORS)), 1, 2000);
  const neighborsPerNode = clampInt(
    Number(argValue("--neighbors-per-node") ?? String(env.MEMORY_CONSOLIDATION_NEIGHBORS_PER_NODE)),
    1,
    50,
  );
  const minVector = clampNum(Number(argValue("--min-vector") ?? String(env.MEMORY_CONSOLIDATION_MIN_VECTOR_SIM)), 0, 1);
  const minScore = clampNum(Number(argValue("--min-score") ?? String(env.MEMORY_CONSOLIDATION_MIN_SCORE)), 0, 1);
  const maxPairs = clampInt(Number(argValue("--max-pairs") ?? String(env.MEMORY_CONSOLIDATION_MAX_PAIRS)), 1, 2000);
  const conflictMinSharedTokens = clampInt(
    Number(argValue("--conflict-min-shared-tokens") ?? String(env.MEMORY_CONSOLIDATION_CONFLICT_MIN_SHARED_TOKENS)),
    1,
    8,
  );
  const conflictNegationLexicalMin = clampNum(
    Number(argValue("--conflict-negation-lexical-min") ?? String(env.MEMORY_CONSOLIDATION_CONFLICT_NEGATION_LEXICAL_MIN)),
    0,
    1,
  );
  const limitApply = clampInt(Number(argValue("--limit-apply") ?? "20"), 1, 500);
  const allowContradictory = hasFlag("--allow-contradictory");
  const blockContradictory = env.MEMORY_CONSOLIDATION_BLOCK_CONTRADICTORY;
  const contradictionGuardEnabled = blockContradictory && !allowContradictory;

  const startedAt = new Date().toISOString();

  const result = await withTx(db, async (client) => {
    const scan = await collectConsolidationCandidates(client, {
      scope,
      types,
      max_anchors: maxAnchors,
      neighbors_per_node: neighborsPerNode,
      min_vector_similarity: minVector,
      min_score: minScore,
      max_pairs: maxPairs,
      include_summary: true,
      conflict_min_shared_tokens: conflictMinSharedTokens,
      conflict_negation_lexical_min: conflictNegationLexicalMin,
    });

    const selected = scan.suggestions.slice(0, limitApply);
    const ids = uniqStrings(selected.flatMap((s) => [s.canonical_id, s.duplicate_id]));
    const stateMap = await fetchNodeStates(client, scope, ids);

    const plans: Array<{
      pair_key: string;
      canonical_id: string;
      duplicate_id: string;
      score: number;
      action: "apply" | "skip";
      reason: string;
      conflict?: {
        detected: boolean;
        kind: string;
        reasons: string[];
      };
    }> = [];
    const plannedCanonical = new Set<string>();
    const plannedDuplicate = new Set<string>();

    for (const s of selected) {
      const c = stateMap.get(s.canonical_id);
      const d = stateMap.get(s.duplicate_id);
      if (!c || !d) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "missing_node" });
        continue;
      }
      if (c.type !== d.type || c.type !== s.type) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "type_mismatch" });
        continue;
      }
      if (contradictionGuardEnabled && (s.type === "topic" || s.type === "concept") && s.conflict?.detected) {
        plans.push({
          pair_key: s.pair_key,
          canonical_id: s.canonical_id,
          duplicate_id: s.duplicate_id,
          score: s.score,
          action: "skip",
          reason: "contradictory_candidate",
          conflict: {
            detected: true,
            kind: s.conflict.kind,
            reasons: s.conflict.reasons,
          },
        });
        continue;
      }
      if (truthySlot(c.slots, "pin") || truthySlot(c.slots, "legal_hold")) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "canonical_protected" });
        continue;
      }
      if (truthySlot(d.slots, "pin") || truthySlot(d.slots, "legal_hold")) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "duplicate_protected" });
        continue;
      }
      const cAlias = asUuidOrNull(c.slots?.alias_of);
      if (cAlias && cAlias !== c.id) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "canonical_is_alias" });
        continue;
      }
      const dAlias = asUuidOrNull(d.slots?.alias_of);
      if (dAlias && dAlias !== c.id) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "duplicate_alias_to_other" });
        continue;
      }
      if (dAlias === c.id) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "already_applied" });
        continue;
      }

      if (plannedDuplicate.has(c.id)) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "canonical_selected_as_duplicate" });
        continue;
      }
      if (plannedDuplicate.has(d.id)) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "duplicate_already_selected" });
        continue;
      }
      if (plannedCanonical.has(d.id)) {
        plans.push({ pair_key: s.pair_key, canonical_id: s.canonical_id, duplicate_id: s.duplicate_id, score: s.score, action: "skip", reason: "duplicate_selected_as_canonical" });
        continue;
      }

      plannedCanonical.add(c.id);
      plannedDuplicate.add(d.id);
      plans.push({
        pair_key: s.pair_key,
        canonical_id: s.canonical_id,
        duplicate_id: s.duplicate_id,
        score: s.score,
        action: "apply",
        reason: "ok",
        conflict: {
          detected: Boolean(s.conflict?.detected ?? false),
          kind: s.conflict?.kind ?? "none",
          reasons: s.conflict?.reasons ?? [],
        },
      });
    }

    const applyPlans = plans.filter((p) => p.action === "apply");
    if (!apply || applyPlans.length === 0) {
      return {
        dry_run: !apply,
        commit_id: null as string | null,
        commit_hash: null as string | null,
        scanned: {
          anchors: scan.anchors_scanned,
          neighbors_examined: scan.neighbors_examined,
          pair_candidates: scan.pair_candidates,
          suggested: scan.suggestions.length,
          selected: selected.length,
        },
        planned_apply: applyPlans.length,
        plans,
        merge_protocol_version: "consolidation_candidate_v1" as const,
        merge_candidates_v1: selected.map((s) => toMergeCandidateV1(s)),
        planned_apply_v1: selected.filter((s) => applyPlans.some((p) => p.pair_key === s.pair_key)).map((s) => toMergeCandidateV1(s)),
        contradiction_guard_enabled: contradictionGuardEnabled,
      };
    }

    const parentRes = await client.query<{ id: string; commit_hash: string }>(
      "SELECT id, commit_hash FROM memory_commits WHERE scope = $1 ORDER BY created_at DESC LIMIT 1",
      [scope],
    );
    const parentHash = parentRes.rowCount ? parentRes.rows[0].commit_hash : "";
    const parentId = parentRes.rowCount ? parentRes.rows[0].id : null;

    const actionRows: Array<{ pair_key: string; canonical_id: string; duplicate_id: string; score: number }> = [];

    for (const p of applyPlans) {
      const c = stateMap.get(p.canonical_id)!;
      const d = stateMap.get(p.duplicate_id)!;

      const dSlots = { ...(d.slots ?? {}) };
      dSlots.alias_of = c.id;
      dSlots.superseded_by = c.id;
      dSlots.consolidation_state = "aliased";
      dSlots.consolidation_score = p.score;
      dSlots.consolidation_at = startedAt;
      dSlots.consolidation_job = "consolidation_apply";
      dSlots.consolidation_pair_key = p.pair_key;
      dSlots.consolidation_conflict_checked = true;
      dSlots.consolidation_conflict_checked_at = startedAt;
      dSlots.consolidation_conflict_detected = Boolean(p.conflict?.detected ?? false);
      dSlots.consolidation_conflict_kind = p.conflict?.kind ?? null;
      dSlots.consolidation_conflict_reasons = p.conflict?.reasons ?? [];
      dSlots.consolidation_conflict_override = Boolean(allowContradictory && p.conflict?.detected);

      const mergedFrom: string[] = Array.isArray(c.slots?.merged_from) ? c.slots.merged_from.filter((x: any) => typeof x === "string") : [];
      const cSlots = { ...(c.slots ?? {}) };
      cSlots.merged_from = uniqStrings([...mergedFrom, d.id]);
      cSlots.merged_count = cSlots.merged_from.length;
      cSlots.last_consolidation_at = startedAt;
      cSlots.last_consolidation_job = "consolidation_apply";

      actionRows.push({ pair_key: p.pair_key, canonical_id: c.id, duplicate_id: d.id, score: p.score });

      await client.query(
        `
        UPDATE memory_nodes
        SET slots = $1::jsonb
        WHERE scope = $2
          AND id = $3
        `,
        [JSON.stringify(cSlots), scope, c.id],
      );

      await client.query(
        `
        UPDATE memory_nodes
        SET slots = $1::jsonb
        WHERE scope = $2
          AND id = $3
        `,
        [JSON.stringify(dSlots), scope, d.id],
      );
    }

    const diff = {
      job: "consolidation_apply",
      started_at: startedAt,
      scope,
      thresholds: {
        types,
        max_anchors: maxAnchors,
        neighbors_per_node: neighborsPerNode,
        min_vector_similarity: minVector,
        min_score: minScore,
        max_pairs: maxPairs,
        limit_apply: limitApply,
        contradiction_guard_enabled: contradictionGuardEnabled,
        allow_contradictory: allowContradictory,
        conflict_min_shared_tokens: conflictMinSharedTokens,
        conflict_negation_lexical_min: conflictNegationLexicalMin,
      },
      scanned: {
        anchors: scan.anchors_scanned,
        neighbors_examined: scan.neighbors_examined,
        pair_candidates: scan.pair_candidates,
        suggested: scan.suggestions.length,
      },
      applied_pairs: actionRows,
      skipped: plans.filter((x) => x.action === "skip"),
    };

    const inputSha = sha256Hex(`job:consolidation_apply:${scope}:${startedAt}:${actionRows.length}`);
    const diffSha = sha256Hex(stableStringify(diff));
    const commitHash = sha256Hex(
      stableStringify({ parentHash, inputSha, diffSha, scope, actor: "job", kind: "consolidation_apply" }),
    );

    const commitRes = await client.query<{ id: string }>(
      `INSERT INTO memory_commits (scope, parent_id, input_sha256, diff_json, actor, commit_hash)
       VALUES ($1, $2, $3, $4::jsonb, 'job', $5)
       ON CONFLICT (commit_hash) DO UPDATE SET diff_json = memory_commits.diff_json
       RETURNING id`,
      [scope, parentId, inputSha, JSON.stringify(diff), commitHash],
    );
    const commitId = commitRes.rows[0].id;

    await client.query(
      `
      UPDATE memory_nodes
      SET commit_id = $1
      WHERE scope = $2
        AND id = ANY($3::uuid[])
      `,
      [commitId, scope, uniqStrings(actionRows.flatMap((x) => [x.canonical_id, x.duplicate_id]))],
    );

    return {
      dry_run: false,
      commit_id: commitId,
      commit_hash: commitHash,
      scanned: {
        anchors: scan.anchors_scanned,
        neighbors_examined: scan.neighbors_examined,
        pair_candidates: scan.pair_candidates,
        suggested: scan.suggestions.length,
        selected: selected.length,
      },
      planned_apply: applyPlans.length,
      applied_pairs: actionRows.length,
      plans,
      applied: actionRows,
      merge_protocol_version: "consolidation_candidate_v1" as const,
      merge_candidates_v1: selected.map((s) => toMergeCandidateV1(s)),
      planned_apply_v1: selected.filter((s) => applyPlans.some((p) => p.pair_key === s.pair_key)).map((s) => toMergeCandidateV1(s)),
      contradiction_guard_enabled: contradictionGuardEnabled,
    };
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope,
        kind: "consolidation_apply",
        dry_run: result.dry_run,
        commit_id: result.commit_id,
        commit_hash: result.commit_hash,
        scanned: result.scanned,
        planned_apply: result.planned_apply,
        applied_pairs: (result as any).applied_pairs ?? 0,
        contradiction_guard_enabled: (result as any).contradiction_guard_enabled,
        plans: result.plans,
        applied: (result as any).applied ?? [],
        merge_protocol_version: (result as any).merge_protocol_version ?? "consolidation_candidate_v1",
        merge_candidates_v1: (result as any).merge_candidates_v1 ?? [],
        planned_apply_v1: (result as any).planned_apply_v1 ?? [],
        safety: {
          apply_flag_required: true,
          skipped_reasons: uniqStrings(result.plans.filter((x: { action: string }) => x.action === "skip").map((x: { reason: string }) => x.reason)),
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
